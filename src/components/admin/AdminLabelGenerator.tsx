import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Barcode, ChevronLeft, ChevronRight, FileDown, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { LabelFormat, Product, ProductSKU, StorefrontSettings } from '../../types';
import { ModalPortal } from '../ModalPortal';
import { compositionToMaterial, getProductFabricComposition } from '../../utils/productAttributes';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  canvasMeasure,
  downloadLabelsPdf,
  drawLabel,
  layoutLabel,
  loadLabelFonts,
  LABEL_FORMAT_PRESETS,
  LABEL_SIZE_LIMITS,
  LABEL_TEMPLATES,
  LABEL_TEMPLATE_GROUPS,
  hasSaleOldPrice,
  templateInfo,
  type LabelData,
  type LabelOptions,
  type LabelTemplate,
} from '../../utils/labels';
import {
  articleCode,
  articleGroupKey,
  findBarcodeProblems,
  skuKey,
  unifyArticleBarcodes,
  type BarcodeProblem,
} from '../../shared/barcode';

export interface LabelTarget {
  productId: string;
  skuId: string;
}

interface AdminLabelGeneratorProps {
  targets: LabelTarget[];
  products: Product[];
  settings: StorefrontSettings;
  onUpdateSettings?: (settings: StorefrontSettings) => void;
  onUpdateProducts: (products: Product[]) => void;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const PROBLEM_TEXT: Record<BarcodeProblem, string> = {
  missing: 'нет штрихкода',
  duplicate: 'штрихкод повторяется',
  invalid: 'штрихкод с ошибкой',
  mismatch: 'у размеров разные штрихкоды',
};

const pluralLabels = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'этикетка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'этикетки';
  return 'этикеток';
};

const sizeText = (f: Pick<LabelFormat, 'widthMm' | 'heightMm'>) => `${f.widthMm}×${f.heightMm} мм`;

/** Label data straight from the catalog: the product card and its variation */
const labelData = (product: Product, sku: ProductSKU): LabelData => ({
  title: product.title,
  color: sku.color,
  size: sku.size,
  article: articleCode(product, sku.color) || sku.skuCode || '',
  // the card's fibres first; product.material is the same text saved from them
  composition: compositionToMaterial(getProductFabricComposition(product)) || (product.material ?? '').trim(),
  barcode: sku.barcode ?? '',
  price: product.price,
  oldPrice: product.originalPrice,
});

type PrintItem = { target: LabelTarget; product: Product; sku: ProductSKU };

/** Canvas preview drawn by the same layout as the PDF */
const LabelCanvas: React.FC<{
  format: Pick<LabelFormat, 'widthMm' | 'heightMm'>;
  template: LabelTemplate;
  data: LabelData;
  options: LabelOptions;
  displayWidth: number;
  fontsReady: boolean;
  className?: string;
}> = ({ format, template, data, options, displayWidth, fontsReady, className }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const measure = useMemo(() => canvasMeasure(), []);
  const displayHeight = (displayWidth * format.heightMm) / format.widthMm;

  useEffect(() => {
    if (!ref.current) return;
    const pxPerMm = (displayWidth / format.widthMm) * (window.devicePixelRatio || 1);
    drawLabel(ref.current, layoutLabel(template, format, data, options, measure), pxPerMm);
  }, [format, template, data, options, displayWidth, fontsReady, measure]);

  return (
    <canvas
      ref={ref}
      style={{ width: displayWidth, height: displayHeight }}
      className={className}
      aria-hidden="true"
    />
  );
};

/** Proportional outline of a format, for the delete confirmation */
const FormatThumb: React.FC<{ format: Pick<LabelFormat, 'widthMm' | 'heightMm'> }> = ({ format }) => {
  const scale = 44 / Math.max(format.widthMm, format.heightMm);
  return (
    <span
      className="block rounded-md bg-white border border-[#2D3A4E]/60 shrink-0"
      style={{ width: format.widthMm * scale, height: format.heightMm * scale }}
    />
  );
};

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="w-full h-11 px-3 rounded-xl neu-button flex items-center justify-between gap-3 text-xs font-bold text-[#2D3A4E] cursor-pointer"
  >
    <span>{label}</span>
    <span className="w-10 h-6 rounded-full neu-inset p-0.5 flex items-center shrink-0">
      <span
        className={`w-5 h-5 rounded-full transition-transform duration-200 ${
          checked ? 'translate-x-4 neu-fill-accent' : 'translate-x-0 bg-[#E3E8EF] neu-button'
        }`}
      />
    </span>
  </button>
);

/**
 * Admin → «Склад» → labels: the store's label formats, seven templates, a PDF with one page per label
 * (per variation, or per article when the template has no size). One readable barcode per article.
 */
export const AdminLabelGenerator: React.FC<AdminLabelGeneratorProps> = ({
  targets,
  products,
  settings,
  onUpdateSettings,
  onUpdateProducts,
  onClose,
  onShowToast,
}) => {
  const formats = settings.labelFormats ?? [];
  const [formatId, setFormatId] = useState<string>(formats[0]?.id ?? '');
  const [template, setTemplate] = useState<LabelTemplate>('classic');
  const [options, setOptions] = useState<LabelOptions>({ showPrice: true, showBarcode: true });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingFormat, setIsAddingFormat] = useState(false);
  const [draft, setDraft] = useState({ name: '', width: '', height: '' });
  const [formatToDelete, setFormatToDelete] = useState<LabelFormat | null>(null);

  const format = formats.find((f) => f.id === formatId) ?? formats[0];

  useEffect(() => {
    let alive = true;
    loadLabelFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !formatToDelete) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, formatToDelete]);

  // Variations are looked up in the current catalog, so reissued barcodes show at once
  const resolved = useMemo(
    () =>
      targets.map((t) => {
        const product = products.find((p) => p.id === t.productId);
        const sku = product?.skus?.find((s) => s.id === t.skuId);
        return { target: t, product, sku };
      }),
    [targets, products]
  );
  const printable = resolved.filter((r): r is PrintItem => Boolean(r.product && r.sku));
  const unsaved = resolved.filter((r) => r.product && !r.sku);
  const info = templateInfo(template);

  // Without a size on the label, all sizes of an article print the same: one label per article
  const labels = useMemo(() => {
    if (info.showsSize) return printable;
    const seen = new Set<string>();
    return printable.filter((r) => {
      const key = articleGroupKey(r.product.id, r.sku.color);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [printable, info.showsSize]);

  const problems = useMemo(() => findBarcodeProblems(products), [products]);
  const barcodeIssues = options.showBarcode
    ? printable
        .map((r) => ({ ...r, problem: problems.get(skuKey(r.product.id, r.sku.id)) }))
        .filter((r): r is typeof r & { problem: BarcodeProblem } => Boolean(r.problem))
    : [];
  // «Скидка» needs an old price above the current one in the product card
  const noOldPrice = info.needsOldPrice
    ? labels.filter((r) => !hasSaleOldPrice({ price: r.product.price, oldPrice: r.product.originalPrice }))
    : [];

  const current = labels[Math.min(previewIndex, Math.max(0, labels.length - 1))];
  // A code that is about to be replaced is not drawn in the preview
  const previewOptions: LabelOptions =
    current && options.showBarcode && problems.has(skuKey(current.product.id, current.sku.id))
      ? { ...options, showBarcode: false }
      : options;
  const canDownload =
    Boolean(format) && labels.length > 0 && barcodeIssues.length === 0 && noOldPrice.length === 0 && !isGenerating;

  const saveFormats = (next: LabelFormat[]) => {
    if (!onUpdateSettings) return;
    onUpdateSettings({ ...settings, labelFormats: next });
  };

  const addFormat = (base: Omit<LabelFormat, 'id'>) => {
    const width = Math.round(base.widthMm);
    const height = Math.round(base.heightMm);
    const { min, max } = LABEL_SIZE_LIMITS;
    if (!(width >= min && width <= max && height >= min && height <= max)) {
      onShowToast(`Ширина и высота — от ${min} до ${max} мм`, 'error');
      return;
    }
    if (formats.some((f) => f.widthMm === width && f.heightMm === height)) {
      onShowToast(`Формат ${width}×${height} мм уже есть`, 'error');
      return;
    }
    const created: LabelFormat = {
      id: `label-${Date.now()}`,
      name: base.name.trim() || `Этикетка ${width}×${height}`,
      widthMm: width,
      heightMm: height,
    };
    saveFormats([...formats, created]);
    setFormatId(created.id);
    setIsAddingFormat(false);
    setDraft({ name: '', width: '', height: '' });
    onShowToast(`Формат «${created.name}» добавлен`, 'success');
  };

  const deleteFormat = (target: LabelFormat) => {
    const next = formats.filter((f) => f.id !== target.id);
    saveFormats(next);
    if (formatId === target.id) setFormatId(next[0]?.id ?? '');
    setFormatToDelete(null);
    onShowToast(`Формат «${target.name}» удален`, 'info');
  };

  const reissueBarcodes = () => {
    const groups = new Set<string>(barcodeIssues.map((r) => articleGroupKey(r.product.id, r.sku.color)));
    onUpdateProducts(unifyArticleBarcodes(products, groups));
    onShowToast(`Штрихкоды обновлены: артикулов ${groups.size}, у всех размеров артикула один код`, 'success');
  };

  const handleDownload = async () => {
    if (!format || !canDownload) return;
    setIsGenerating(true);
    try {
      await downloadLabelsPdf(
        format,
        template,
        labels.map((r) => labelData(r.product, r.sku)),
        options
      );
      onShowToast(`PDF: ${labels.length} ${pluralLabels(labels.length)} ${sizeText(format)}`, 'success');
    } catch (err) {
      console.error('Label PDF failed:', err);
      onShowToast('Не удалось сформировать PDF', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const sectionTitle = 'text-[11px] font-black uppercase tracking-wider text-[#2D3A4E]';
  const inputClass =
    'w-full min-w-0 h-10 px-3 neu-inset rounded-xl text-xs font-semibold text-[#2D3A4E] bg-[#E3E8EF] placeholder:text-[#56647A]';

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[130] bg-[#2D3A4E]/55 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Этикетки и штрихкоды"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg neu-modal rounded-3xl p-4 sm:p-6 border border-white/80 flex flex-col gap-4 max-h-[92dvh] animate-in zoom-in-95 fade-in duration-200"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-accent shrink-0">
                <Barcode className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h3 className="text-base font-black text-[#2D3A4E] leading-tight">Этикетки и штрихкоды</h3>
                <p className="text-[11px] font-semibold text-[#4E5C70] leading-snug">
                  {printable.length === 1
                    ? `${printable[0].product.title} · ${printable[0].sku.color} / ${printable[0].sku.size}`
                    : labels.length === printable.length
                    ? `Выбрано вариантов: ${printable.length}. В PDF — по одной этикетке на вариант`
                    : `Вариантов: ${printable.length} → этикеток: ${labels.length} (одна на артикул, шаблон без размера)`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Закрыть окно (Esc)"
              title="Закрыть окно (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto -mx-1 px-1 pb-1 flex-1 min-h-0">
            {/* Formats */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className={sectionTitle}>Формат этикетки</h4>
                {formats.length > 0 && !isAddingFormat && onUpdateSettings && (
                  <button
                    type="button"
                    onClick={() => setIsAddingFormat(true)}
                    className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Формат
                  </button>
                )}
              </div>

              {formats.length === 0 && !isAddingFormat && (
                <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-2.5">
                  <p className="text-xs font-bold text-[#2D3A4E]">Форматы не настроены</p>
                  <p className="text-[11px] text-[#4E5C70] leading-snug">
                    Добавьте размер этикеток вашего принтера. Частые размеры:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LABEL_FORMAT_PRESETS.map((preset) => (
                      <button
                        key={`${preset.widthMm}x${preset.heightMm}`}
                        type="button"
                        disabled={!onUpdateSettings}
                        onClick={() => addFormat(preset)}
                        className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {sizeText(preset)}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!onUpdateSettings}
                      onClick={() => setIsAddingFormat(true)}
                      className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer disabled:opacity-50"
                    >
                      Свой размер
                    </button>
                  </div>
                </div>
              )}

              {formats.length > 0 && (
                <div className="space-y-2" role="radiogroup" aria-label="Формат этикетки">
                  {formats.map((f) => {
                    const selected = format?.id === f.id;
                    return (
                      <div key={f.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setFormatId(f.id)}
                          className={`flex-1 min-w-0 h-11 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            selected ? 'neu-pill-active' : 'neu-button text-[#2D3A4E]'
                          }`}
                        >
                          <span className="truncate">{f.name}</span>
                          <span className={`shrink-0 text-[11px] ${selected ? '' : 'text-[#4E5C70]'}`}>{sizeText(f)}</span>
                        </button>
                        {onUpdateSettings && (
                          <button
                            type="button"
                            onClick={() => setFormatToDelete(f)}
                            className="w-11 h-11 rounded-xl neu-button-danger flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
                            aria-label={`Удалить формат «${f.name}»`}
                            title="Удалить формат"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isAddingFormat && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addFormat({ name: draft.name, widthMm: Number(draft.width), heightMm: Number(draft.height) });
                  }}
                  className="neu-flat-sm rounded-2xl p-3 bg-[#E3E8EF] space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold text-[#4E5C70]">Название</span>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="Например: Этикетка для коробки"
                      className={inputClass}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['width', 'height'] as const).map((key) => (
                      <label key={key} className="block space-y-1">
                        <span className="text-[11px] font-bold text-[#4E5C70]">{key === 'width' ? 'Ширина' : 'Высота'}</span>
                        <span className="relative block">
                          <input
                            value={draft[key]}
                            onChange={(e) => setDraft({ ...draft, [key]: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                            inputMode="numeric"
                            placeholder={key === 'width' ? '58' : '40'}
                            aria-label={key === 'width' ? 'Ширина, мм' : 'Высота, мм'}
                            className={`${inputClass} pr-10`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70] pointer-events-none">
                            мм
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingFormat(false)}
                      className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-[#4E5C70] cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={!draft.width || !draft.height}
                      className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Добавить
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Templates */}
            <section className="space-y-2">
              <h4 className={sectionTitle}>Шаблон</h4>
              <div className="space-y-3" role="radiogroup" aria-label="Шаблон этикетки">
                {LABEL_TEMPLATE_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-1.5">
                    <p className="text-[11px] font-bold text-[#4E5C70]">{group.title}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {LABEL_TEMPLATES.filter((t) => t.group === group.id).map((t) => {
                        const selected = template === t.id;
                        const blocked =
                          t.needsOldPrice &&
                          current &&
                          !hasSaleOldPrice({ price: current.product.price, oldPrice: current.product.originalPrice });
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={t.hint}
                            onClick={() => setTemplate(t.id)}
                            className={`rounded-2xl p-2 flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                              selected ? 'neu-pill-active' : 'neu-button text-[#2D3A4E]'
                            }`}
                          >
                            {format && current ? (
                              <LabelCanvas
                                format={format}
                                template={t.id}
                                data={labelData(current.product, current.sku)}
                                options={previewOptions}
                                displayWidth={84}
                                fontsReady={fontsReady}
                                className={`rounded-md border border-[#BAC5D5] ${blocked ? 'opacity-40' : ''}`}
                              />
                            ) : (
                              <span className="block w-[84px] h-[58px] rounded-md bg-white border border-[#BAC5D5]" />
                            )}
                            <span className="text-[11px] font-bold leading-tight text-center">{t.name}</span>
                            {blocked && <span className="text-[11px] font-bold text-warning leading-tight">нет старой цены</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* What to print */}
            <section className="grid grid-cols-2 gap-2">
              <Switch
                label="Цена"
                checked={options.showPrice}
                onChange={(v) => setOptions((o) => ({ ...o, showPrice: v }))}
              />
              <Switch
                label="Штрихкод"
                checked={options.showBarcode}
                onChange={(v) => setOptions((o) => ({ ...o, showBarcode: v }))}
              />
            </section>

            {/* «Скидка» without an old price */}
            {noOldPrice.length > 0 && (
              <section className="neu-inset rounded-2xl p-3.5 bg-warning-soft border border-warning/25 space-y-2">
                <p className="text-xs font-black text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Шаблон «Скидка» нельзя применить
                </p>
                <p className="text-[11px] text-[#2D3A4E] leading-snug">
                  У товара нет старой цены выше текущей. Задайте «Старую цену» в карточке товара (Каталог) или выберите
                  другой шаблон.
                </p>
                <ul className="text-[11px] text-[#2D3A4E] space-y-1 max-h-24 overflow-y-auto">
                  {noOldPrice.map((r) => (
                    <li key={skuKey(r.product.id, r.sku.id)} className="leading-snug break-words">
                      {r.product.title} — цена {r.product.price.toLocaleString('ru-RU')} ₽, старой цены нет
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Barcodes that can't be printed */}
            {barcodeIssues.length > 0 && (
              <section className="neu-inset rounded-2xl p-3.5 bg-warning-soft border border-warning/25 space-y-2.5">
                <p className="text-xs font-black text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Штрихкоды нужно обновить: {barcodeIssues.length}
                </p>
                <ul className="text-[11px] text-[#2D3A4E] space-y-1 max-h-28 overflow-y-auto">
                  {barcodeIssues.map((r) => (
                    <li key={skuKey(r.product.id, r.sku.id)} className="leading-snug break-words">
                      {r.product.title} · {r.sku.color} / {r.sku.size} — {PROBLEM_TEXT[r.problem]}
                      {r.sku.barcode ? ` (${r.sku.barcode})` : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-[#4E5C70] leading-snug">
                  У всех размеров одного артикула будет один штрихкод: сохранится верный код артикула или будет выдан
                  новый внутренний EAN-13 (начинается с 2). Коды сохранятся в товаре.
                </p>
                <button
                  type="button"
                  onClick={reissueBarcodes}
                  className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Один штрихкод на артикул
                </button>
              </section>
            )}

            {unsaved.length > 0 && (
              <p className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] text-[11px] text-[#4E5C70] leading-snug">
                Без этикетки: {unsaved.map((r) => r.product!.title).join(', ')} — у товара нет сохраненных вариаций.
                Откройте его в каталоге, задайте остатки и сохраните.
              </p>
            )}

            {/* Preview */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className={sectionTitle}>Предпросмотр</h4>
                {labels.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                      disabled={previewIndex === 0}
                      className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] cursor-pointer disabled:opacity-40"
                      aria-label="Предыдущая этикетка"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] font-bold text-[#4E5C70] min-w-12 text-center">
                      {Math.min(previewIndex, labels.length - 1) + 1} из {labels.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.min(labels.length - 1, i + 1))}
                      disabled={previewIndex >= labels.length - 1}
                      className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] cursor-pointer disabled:opacity-40"
                      aria-label="Следующая этикетка"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] flex flex-col items-center gap-2">
                {format && current ? (
                  <>
                    <LabelCanvas
                      format={format}
                      template={template}
                      data={labelData(current.product, current.sku)}
                      options={previewOptions}
                      displayWidth={Math.min(280, format.widthMm * 5)}
                      fontsReady={fontsReady}
                      className="rounded-lg border border-[#BAC5D5]"
                    />
                    <span className="text-[11px] font-bold text-[#4E5C70]">
                      {sizeText(format)} · {info.name}
                    </span>
                  </>
                ) : (
                  <p className="text-[11px] font-bold text-[#4E5C70] py-6 text-center">
                    {format ? 'Нет вариантов для этикеток' : 'Добавьте формат, чтобы увидеть этикетку'}
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2.5 pt-3 border-t border-[#BAC5D5]/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 shrink-0 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload}
              className="h-11 flex-1 min-w-0 px-4 neu-button-accent rounded-xl text-xs font-black text-white whitespace-nowrap active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>{isGenerating ? 'Готовим PDF…' : `Скачать PDF (${labels.length})`}</span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={formatToDelete !== null}
        title="Удалить формат?"
        message="Формат исчезнет из списка. Этикетки, которые вы уже скачали, не изменятся."
        preview={
          formatToDelete && (
            <div className="flex items-center gap-3">
              <FormatThumb format={formatToDelete} />
              <div className="min-w-0">
                <p className="text-xs font-black text-[#2D3A4E] truncate">{formatToDelete.name}</p>
                <p className="text-[11px] font-bold text-[#4E5C70]">{sizeText(formatToDelete)}</p>
              </div>
            </div>
          )
        }
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        onConfirm={() => formatToDelete && deleteFormat(formatToDelete)}
        onClose={() => setFormatToDelete(null)}
      />
    </ModalPortal>
  );
};
