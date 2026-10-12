import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, ChevronLeft, ChevronRight, FileDown, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { LabelFormat, Product, SaveStorefrontSettings, StorefrontSettings } from '../../types';
import { ModalPortal } from '../ModalPortal';
import { ConfirmDialog } from '../ConfirmDialog';
import { useDialogA11y } from '../../utils/useDialogA11y';
import {
  canvasMeasure,
  downloadLabelsPdf,
  LABEL_COPIES_MAX,
  layoutLabel,
  loadLabelFonts,
  LABEL_FORMAT_PRESETS,
  LABEL_SIZE_LIMITS,
  LABEL_TEMPLATES,
  LABEL_TEMPLATE_GROUPS,
  hasSaleOldPrice,
  templateInfo,
  type LabelOptions,
  type LabelTemplate,
} from '../../utils/labels';
import {
  articleGroupKey,
  findBarcodeProblems,
  findSizePackBarcodeProblems,
  sizePackBarcodeKey,
  skuKey,
  unifyArticleBarcodes,
  withSizePackBarcodes,
  type BarcodeProblem,
} from '../../shared/barcode';
import {
  productSizePacks,
  sizePackColors,
  sameColor,
} from '../../shared/sizePacks';
import { pluralRu } from '../../utils/pluralize';
import { AdminHint } from './AdminHint';

import {
  entryName,
  labelData,
  packLabelData,
  PROBLEM_TEXT,
  type LabelEntry,
  type LabelTarget,
  type PackPrintItem,
  type PrintItem,
} from './labelEntries';
import { FormatThumb, LabelCanvas, Switch } from './LabelGeneratorParts';

export type { LabelTarget, PackLabelTarget, SkuLabelTarget } from './labelEntries';

interface AdminLabelGeneratorProps {
  targets: LabelTarget[];
  products: Product[];
  settings: StorefrontSettings;
  onUpdateSettings?: SaveStorefrontSettings;
  /** false — not saved (the toast is already shown) */
  onUpdateProducts: (products: Product[]) => Promise<boolean> | void;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const sizeText = (f: Pick<LabelFormat, 'widthMm' | 'heightMm'>) => `${f.widthMm}×${f.heightMm} мм`;

const PREF_KEY = 'manstyle_label_prefs';
function readPref(key: 'format' | 'template'): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Record<string, string>)[key];
  } catch {
    return undefined;
  }
}
function writePref(key: 'format' | 'template', value: string) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Record<string, string>;
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs, [key]: value }));
  } catch {
    // storage blocked: the choice is just not remembered
  }
}

/** Display size of a label inside a box, keeping its proportions */
const fitBox = (f: Pick<LabelFormat, 'widthMm' | 'heightMm'>, maxW: number, maxH: number) =>
  Math.min(maxW, (maxH * f.widthMm) / f.heightMm);

/**
 * Admin → «Склад» → labels: the store's label formats, ten templates, a PDF with one page per label
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
  // The last format and template are remembered in this browser (a convenience, not store data)
  const [formatId, setFormatId] = useState<string>(() => readPref('format') ?? formats[0]?.id ?? '');
  const [template, setTemplate] = useState<LabelTemplate>(() => {
    const saved = readPref('template');
    return LABEL_TEMPLATES.some((t) => t.id === saved) ? (saved as LabelTemplate) : 'classic';
  });
  useEffect(() => writePref('format', formatId), [formatId]);
  useEffect(() => writePref('template', template), [template]);
  const [isSavingFormats, setIsSavingFormats] = useState(false);
  const [options, setOptions] = useState<LabelOptions>({ showPrice: true, showBarcode: true });
  // Copies of each label as typed: one per piece on the shelf (finding 29); empty or wrong — 1
  const [copiesText, setCopiesText] = useState('1');
  const copies = Math.min(LABEL_COPIES_MAX, Math.max(1, Math.floor(Number(copiesText)) || 1));
  const [previewIndex, setPreviewIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingFormat, setIsAddingFormat] = useState(false);
  const [draft, setDraft] = useState({ name: '', width: '', height: '' });
  const [formatToDelete, setFormatToDelete] = useState<LabelFormat | null>(null);

  const format = formats.find((f) => f.id === formatId) ?? formats[0];
  // No format of the store's own yet: templates are drawn on the first common size, so they can be compared instead of
  // showing blank cards (UX audit 03.10, finding 18). The PDF still needs a format the admin added.
  const sampleFormat = format ?? LABEL_FORMAT_PRESETS[0];

  useEffect(() => {
    let alive = true;
    loadLabelFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Escape closes the window; the delete confirmation is a window of its own and closes first
  const dialog = useDialogA11y(true, onClose);

  // Variations are looked up in the current catalog, so reissued barcodes show at once
  const resolved = useMemo(
    () =>
      targets.map((t) => {
        const product = products.find((p) => p.id === t.productId);
        if (t.packId !== undefined) {
          // a pack colour: the pack and the colour must still be in the product (they may have been taken off)
          const pack = productSizePacks(product).find((p) => p.id === t.packId);
          const color = product && pack ? sizePackColors(product, pack).find((c) => sameColor(c, t.color)) : undefined;
          return { target: t, product, pack, color };
        }
        const sku = product?.skus?.find((s) => s.id === t.skuId);
        return { target: t, product, sku };
      }),
    [targets, products]
  );
  const printable = resolved.filter((r): r is PrintItem => Boolean(r.product && 'sku' in r && r.sku));
  const printablePacks = resolved.filter(
    (r): r is PackPrintItem => Boolean(r.product && 'pack' in r && r.pack && r.color)
  );
  const unsaved = resolved.filter((r) => r.product && 'sku' in r && !r.sku);
  const info = templateInfo(template);

  // All labels in the order of the selection; the data is built once for the preview, the fitting and the PDF
  const entries = useMemo<LabelEntry[]>(
    () => [
      ...printable.map((r) => ({
        key: skuKey(r.product.id, r.sku.id),
        articleKey: articleGroupKey(r.product.id, r.sku.color),
        product: r.product,
        sku: r.sku,
        data: labelData(r.product, r.sku),
      })),
      ...printablePacks.map((r) => ({
        key: sizePackBarcodeKey(r.product.id, r.pack.id, r.color),
        articleKey: sizePackBarcodeKey(r.product.id, r.pack.id, r.color),
        product: r.product,
        pack: r.pack,
        data: packLabelData(r.product, r.pack, r.color),
      })),
    ],
    [resolved]
  );

  // Without a size on the label, all sizes of an article print the same: one label per article
  // (a pack colour is its own article: it never merges with the variations)
  const labels = useMemo(() => {
    if (info.showsSize) return entries;
    const seen = new Set<string>();
    return entries.filter((r) => {
      if (seen.has(r.articleKey)) return false;
      seen.add(r.articleKey);
      return true;
    });
  }, [entries, info.showsSize]);

  const problems = useMemo(
    () => new Map<string, BarcodeProblem>([...findBarcodeProblems(products), ...findSizePackBarcodeProblems(products)]),
    [products]
  );
  const barcodeIssues = options.showBarcode
    ? entries
        .map((r) => ({ ...r, problem: problems.get(r.key) }))
        .filter((r): r is typeof r & { problem: BarcodeProblem } => Boolean(r.problem))
    : [];
  // «Скидка» needs an old price above the current one in the product card (a pack has none)
  const noOldPrice = info.needsOldPrice ? labels.filter((r) => !hasSaleOldPrice(r.data)) : [];

  const current = labels[Math.min(previewIndex, Math.max(0, labels.length - 1))];
  // A code that is about to be replaced is not drawn in the preview
  const previewOptions: LabelOptions =
    current && options.showBarcode && problems.has(current.key) ? { ...options, showBarcode: false } : options;
  // What the fitting had to leave out on the current label (too small a format)
  const measure = useMemo(() => canvasMeasure(), []);
  const dropped = useMemo(
    () => (format && current ? layoutLabel(template, format, current.data, previewOptions, measure).dropped : []),
    // fontsReady: measured again once Manrope has loaded
    [format, template, current, previewOptions.showBarcode, previewOptions.showPrice, measure, fontsReady]
  );
  const canDownload =
    Boolean(format) && labels.length > 0 && barcodeIssues.length === 0 && noOldPrice.length === 0 && !isGenerating;

  /** «Добавлен/удален» only after the database accepted the write (App shows the error otherwise) */
  const saveFormats = async (next: LabelFormat[]) => {
    if (!onUpdateSettings || isSavingFormats) return false;
    setIsSavingFormats(true);
    const ok = await onUpdateSettings({ ...settings, labelFormats: next });
    setIsSavingFormats(false);
    return ok !== false;
  };

  /** Why the typed size can't be added, or null */
  const draftProblem = (() => {
    if (!draft.width || !draft.height) return null;
    const width = Number(draft.width);
    const height = Number(draft.height);
    const { min, max } = LABEL_SIZE_LIMITS;
    if (!(width >= min && width <= max && height >= min && height <= max)) return `Ширина и высота — от ${min} до ${max} мм`;
    if (formats.some((f) => f.widthMm === width && f.heightMm === height)) return `Формат ${width}×${height} мм уже есть`;
    return null;
  })();

  const addFormat = async (base: Omit<LabelFormat, 'id'>) => {
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
    if (!(await saveFormats([...formats, created]))) return;
    setFormatId(created.id);
    setIsAddingFormat(false);
    setDraft({ name: '', width: '', height: '' });
    onShowToast(`Формат «${created.name}» добавлен`, 'success');
  };

  const deleteFormat = async (target: LabelFormat) => {
    const next = formats.filter((f) => f.id !== target.id);
    setFormatToDelete(null);
    if (!(await saveFormats(next))) return;
    if (format?.id === target.id) setFormatId(next[0]?.id ?? '');
    onShowToast(`Формат «${target.name}» удален`, 'info');
  };

  /** Common sizes that are not in the list yet */
  const missingPresets = LABEL_FORMAT_PRESETS.filter(
    (p) => !formats.some((f) => f.widthMm === p.widthMm && f.heightMm === p.heightMm)
  );

  // Variations with a wrong code are fixed per article; pack colours — per product (every colour of its packs gets a code)
  const skuIssueGroups = new Set<string>(barcodeIssues.filter((r) => r.sku).map((r) => r.articleKey));
  const packIssueProducts = new Set<string>(barcodeIssues.filter((r) => r.pack).map((r) => r.product.id));
  const packIssueCount = barcodeIssues.filter((r) => r.pack).length;

  const reissueBarcodes = async () => {
    let next = products;
    if (skuIssueGroups.size > 0) next = unifyArticleBarcodes(next, skuIssueGroups);
    // after the variations, so a code just issued to a variation is not issued to a pack again
    if (packIssueProducts.size > 0) next = withSizePackBarcodes(next, packIssueProducts);
    if ((await onUpdateProducts(next)) === false) return;
    const parts = [
      skuIssueGroups.size > 0
        ? `${skuIssueGroups.size} ${pluralRu(skuIssueGroups.size, ['артикул', 'артикула', 'артикулов'])} (у всех размеров один код)`
        : '',
      packIssueCount > 0 ? `${packIssueCount} ${pluralRu(packIssueCount, ['цвет ростовки', 'цвета ростовок', 'цветов ростовок'])}` : '',
    ].filter(Boolean);
    onShowToast(`Штрихкоды обновлены: ${parts.join(', ')}`, 'success');
  };

  const pageCount = labels.length * copies;
  // «вариантов: 3, ростовок: 2»
  const selectionText = [
    printable.length > 0 ? `вариантов: ${printable.length}` : '',
    printablePacks.length > 0 ? `ростовок: ${printablePacks.length}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const handleDownload = async () => {
    if (!format || !canDownload) return;
    setIsGenerating(true);
    try {
      await downloadLabelsPdf(
        format,
        template,
        labels.map((r) => r.data),
        options,
        copies
      );
      onShowToast(`PDF: ${pageCount} ${pluralRu(pageCount, ['этикетка', 'этикетки', 'этикеток'])} ${sizeText(format)}`, 'success');
    } catch (err) {
      console.error('Label PDF failed:', err);
      onShowToast('Не удалось сформировать PDF', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const sectionTitle = 'text-[11px] font-extrabold uppercase tracking-wider text-[#2D3A4E]';
  const inputClass =
    'w-full min-w-0 h-10 px-3 neu-inset rounded-xl text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]';

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[130] bg-[#2D3A4E]/55 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          ref={dialog.ref}
          {...dialog.props}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg neu-modal rounded-3xl p-4 sm:p-6 border border-white/80 flex flex-col gap-4 max-h-[92dvh] animate-in zoom-in-95 fade-in duration-200"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                <Barcode className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h3 id={dialog.titleId} className="text-base font-extrabold text-[#2D3A4E] leading-tight">
                  Этикетки и штрихкоды
                </h3>
                <p className="text-xs font-semibold text-[#4E5C70] leading-snug">
                  {entries.length === 1
                    ? entryName(entries[0])
                    : labels.length === entries.length
                    ? `Выбрано: ${selectionText}. В PDF — по одной этикетке на каждый`
                    : `Выбрано: ${selectionText} → этикеток: ${labels.length} (одна на артикул, шаблон без размера)`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer shrink-0"
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
                <div className="flex items-center gap-1">
                  <h4 className={sectionTitle}>Формат этикетки</h4>
                  <AdminHint label="Формат">Размер этикетки в мм под ваш принтер. Добавьте один раз.</AdminHint>
                </div>
                {formats.length > 0 && !isAddingFormat && onUpdateSettings && (
                  <button
                    type="button"
                    onClick={() => setIsAddingFormat(true)}
                    className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Формат
                  </button>
                )}
              </div>

              {formats.length === 0 && !isAddingFormat && (
                <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
                  <p className="text-xs font-bold text-[#2D3A4E]">Форматы не настроены</p>
                  <p className="text-xs text-[#4E5C70] leading-snug">
                    Добавьте размер этикеток вашего принтера. Частые размеры:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LABEL_FORMAT_PRESETS.map((preset) => (
                      <button
                        key={`${preset.widthMm}x${preset.heightMm}`}
                        type="button"
                        disabled={!onUpdateSettings || isSavingFormats}
                        onClick={() => void addFormat(preset)}
                        className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FormatThumb format={preset} size={16} />
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
                          <span className="flex items-center gap-2.5 min-w-0">
                            <FormatThumb format={f} size={22} />
                            <span className="truncate">{f.name}</span>
                          </span>
                          <span className={`shrink-0 text-[11px] ${selected ? '' : 'text-[#4E5C70]'}`}>{sizeText(f)}</span>
                        </button>
                        {onUpdateSettings && (
                          <button
                            type="button"
                            onClick={() => setFormatToDelete(f)}
                            disabled={isSavingFormats}
                            className="w-11 h-11 rounded-xl neu-button-danger flex items-center justify-center shrink-0 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                    void addFormat({ name: draft.name, widthMm: Number(draft.width), heightMm: Number(draft.height) });
                  }}
                  className="neu-flat-sm rounded-2xl p-3 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  {formats.length > 0 && missingPresets.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-[#4E5C70]">Частые размеры</p>
                      <div className="flex flex-wrap gap-2">
                        {missingPresets.map((preset) => (
                          <button
                            key={`${preset.widthMm}x${preset.heightMm}`}
                            type="button"
                            disabled={isSavingFormats}
                            onClick={() => void addFormat(preset)}
                            className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <FormatThumb format={preset} size={16} />
                            {sizeText(preset)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label htmlFor="label-format-name" className="block text-[11px] font-bold text-[#4E5C70]">
                      Название
                    </label>
                    <input
                      id="label-format-name"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder={draft.width && draft.height ? `Этикетка ${draft.width}×${draft.height}` : 'Например: Этикетка для коробки'}
                      maxLength={40}
                      autoComplete="off"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    {(['width', 'height'] as const).map((key) => (
                      <div key={key} className="space-y-1 min-w-0">
                        <label htmlFor={`label-format-${key}`} className="block text-[11px] font-bold text-[#4E5C70]">
                          {key === 'width' ? 'Ширина, мм' : 'Высота, мм'}
                        </label>
                        <input
                          id={`label-format-${key}`}
                          value={draft[key]}
                          onChange={(e) => setDraft({ ...draft, [key]: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder={key === 'width' ? '58' : '40'}
                          aria-invalid={Boolean(draftProblem)}
                          aria-describedby="label-format-hint"
                          className={inputClass}
                        />
                      </div>
                    ))}
                    {/* The typed size at its proportions */}
                    <span className="h-10 w-10 rounded-xl neu-inset flex items-center justify-center shrink-0">
                      {Number(draft.width) > 0 && Number(draft.height) > 0 ? (
                        <FormatThumb format={{ widthMm: Number(draft.width), heightMm: Number(draft.height) }} size={26} />
                      ) : null}
                    </span>
                  </div>
                  <p
                    id="label-format-hint"
                    className={`text-xs leading-snug ${draftProblem ? 'text-danger font-bold' : 'text-[#4E5C70]'}`}
                    aria-live="polite"
                  >
                    {draftProblem ?? `От ${LABEL_SIZE_LIMITS.min} до ${LABEL_SIZE_LIMITS.max} мм. Ширина — сторона, по которой идет штрихкод.`}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingFormat(false);
                        setDraft({ name: '', width: '', height: '' });
                      }}
                      className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-[#4E5C70] cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={!draft.width || !draft.height || Boolean(draftProblem) || isSavingFormats}
                      className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isSavingFormats ? 'Сохраняем…' : 'Добавить'}
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Templates */}
            <section className="space-y-2">
              <div className="flex items-center gap-1">
                <h4 className={sectionTitle}>Шаблон</h4>
                <AdminHint label="Шаблон">Как расположены название, цена и штрихкод. Образец виден сразу.</AdminHint>
              </div>
              {!format && current && (
                <p className="text-xs text-[#4E5C70] leading-snug">
                  Образцы — на частом размере {sizeText(sampleFormat)}. Добавьте формат вашего принтера: образцы
                  перерисуются под него, и PDF можно будет скачать.
                </p>
              )}
              <div className="space-y-3" role="radiogroup" aria-label="Шаблон этикетки">
                {LABEL_TEMPLATE_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-1.5">
                    <p className="text-xs font-bold text-[#4E5C70]">{group.title}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {LABEL_TEMPLATES.filter((t) => t.group === group.id).map((t) => {
                        const selected = template === t.id;
                        const blocked = t.needsOldPrice && current && !hasSaleOldPrice(current.data);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={t.hint}
                            onClick={() => setTemplate(t.id)}
                            className={`rounded-2xl p-2 flex flex-col items-center justify-between gap-1.5 transition-all cursor-pointer ${
                              selected ? 'neu-pill-active' : 'neu-button text-[#2D3A4E]'
                            }`}
                          >
                            {current ? (
                              <LabelCanvas
                                format={sampleFormat}
                                template={t.id}
                                data={current.data}
                                options={previewOptions}
                                displayWidth={fitBox(sampleFormat, 84, 64)}
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

            {/* How many of each */}
            <section className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 min-w-0">
                <label htmlFor="label-copies" className="text-xs font-bold text-[#2D3A4E]">
                  Копий каждой этикетки
                </label>
                <AdminHint label="Копий">Сколько одинаковых этикеток напечатать на каждый вариант — например, по числу штук.</AdminHint>
              </div>
              <input
                id="label-copies"
                type="number"
                inputMode="numeric"
                min={1}
                max={LABEL_COPIES_MAX}
                value={copiesText}
                onChange={(e) => setCopiesText(e.target.value)}
                onBlur={() => setCopiesText(String(copies))}
                className="w-20 h-10 px-3 neu-inset rounded-xl text-xs font-extrabold text-accent text-right shrink-0"
              />
            </section>

            {/* «Скидка» without an old price */}
            {noOldPrice.length > 0 && (
              <section className="neu-inset rounded-2xl p-3.5 border border-warning/25 space-y-2">
                <p className="text-xs font-extrabold text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Шаблон «Скидка» нельзя применить
                </p>
                <p className="text-xs text-[#2D3A4E] leading-snug">
                  У товара нет старой цены выше текущей. Задайте «Старую цену» в карточке товара (Каталог) или выберите
                  другой шаблон.
                  {noOldPrice.some((r) => r.pack) && ' У ростовки старой цены нет: для неё подойдет другой шаблон.'}
                </p>
                {/* a scrolling list is reachable from the keyboard (axe: scrollable-region-focusable) */}
                <ul
                  tabIndex={0}
                  aria-label="Товары без старой цены"
                  className="text-[11px] text-[#2D3A4E] space-y-1 max-h-24 overflow-y-auto rounded-lg"
                >
                  {noOldPrice.map((r) => (
                    <li key={r.key} className="leading-snug break-words">
                      {r.pack
                        ? `${entryName(r)} — у ростовки нет старой цены`
                        : `${r.product.title} — цена ${r.product.price.toLocaleString('ru-RU')} ₽, старой цены нет`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Barcodes that can't be printed */}
            {barcodeIssues.length > 0 && (
              <section className="neu-inset rounded-2xl p-3.5 border border-warning/25 space-y-2.5">
                <p className="text-xs font-extrabold text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Штрихкоды нужно обновить: {barcodeIssues.length}
                </p>
                <ul
                  tabIndex={0}
                  aria-label="Штрихкоды, которые нужно обновить"
                  className="text-[11px] text-[#2D3A4E] space-y-1 max-h-28 overflow-y-auto rounded-lg"
                >
                  {barcodeIssues.map((r) => (
                    <li key={r.key} className="leading-snug break-words">
                      {entryName(r)} — {PROBLEM_TEXT[r.problem]}
                      {r.data.barcode ? ` (${r.data.barcode})` : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[#4E5C70] leading-snug">
                  {skuIssueGroups.size > 0 &&
                    'У всех размеров одного артикула будет один штрихкод: сохранится верный код артикула или будет выдан новый внутренний EAN-13 (начинается с 2). '}
                  {packIssueCount > 0 &&
                    'У каждого цвета ростовки свой штрихкод: верный сохранится, недостающий выдадим. '}
                  Коды сохранятся в товаре.
                </p>
                <button
                  type="button"
                  onClick={reissueBarcodes}
                  className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {skuIssueGroups.size > 0 && packIssueCount > 0
                    ? 'Обновить штрихкоды'
                    : packIssueCount > 0
                    ? 'Выдать штрихкоды ростовок'
                    : 'Один штрихкод на артикул'}
                </button>
              </section>
            )}

            {unsaved.length > 0 && (
              <p className="neu-inset rounded-2xl p-3 text-xs text-[#4E5C70] leading-snug">
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
              <div className="neu-inset rounded-2xl p-4 flex flex-col items-center gap-2">
                {current ? (
                  <>
                    <LabelCanvas
                      format={sampleFormat}
                      template={template}
                      data={current.data}
                      options={previewOptions}
                      displayWidth={fitBox(sampleFormat, Math.min(280, sampleFormat.widthMm * 5), 260)}
                      fontsReady={fontsReady}
                      className="rounded-lg border border-[#BAC5D5]"
                    />
                    <span className="text-[11px] font-bold text-[#4E5C70] text-center">
                      {format
                        ? `${sizeText(format)} · ${info.name}`
                        : `Образец ${sizeText(sampleFormat)} · ${info.name}. Для PDF добавьте формат`}
                    </span>
                    {options.showPrice && current.data.noPrice && (
                      <p className="text-xs font-bold text-warning text-center leading-snug">
                        У ростовки нет цены — на этикетке её не будет. Задайте цену ростовки или оптовую цену товара.
                      </p>
                    )}
                    {format && dropped.length > 0 && (
                      <p className="text-xs font-bold text-warning text-center leading-snug">
                        Не поместилось: {dropped.join(', ')}. Выберите формат крупнее или шаблон проще.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs font-bold text-[#4E5C70] py-6 text-center">Нет вариантов для этикеток</p>
                )}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2.5 pt-3 border-t border-[#BAC5D5]/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 shrink-0 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload}
              className="h-11 flex-1 min-w-0 px-4 neu-button-accent rounded-xl text-xs font-extrabold text-white whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>{isGenerating ? 'Готовим PDF…' : `Скачать PDF (${pageCount})`}</span>
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
                <p className="text-xs font-extrabold text-[#2D3A4E] truncate">{formatToDelete.name}</p>
                <p className="text-xs font-bold text-[#4E5C70]">{sizeText(formatToDelete)}</p>
              </div>
            </div>
          )
        }
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        onConfirm={() => formatToDelete && void deleteFormat(formatToDelete)}
        onClose={() => setFormatToDelete(null)}
      />
    </ModalPortal>
  );
};
