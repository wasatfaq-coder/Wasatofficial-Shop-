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
  resolveLabelPrices,
  templateInfo,
  type LabelOptions,
  type LabelPriceMode,
  type LabelTemplate,
  type LabelTemplateGroup,
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
  entryStockCount,
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
function readPref(key: 'format' | 'template' | 'priceMode'): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Record<string, string>)[key];
  } catch {
    return undefined;
  }
}
function writePref(key: 'format' | 'template' | 'priceMode', value: string) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Record<string, string>;
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs, [key]: value }));
  } catch {
    // storage blocked: the choice is just not remembered
  }
}

const PRICE_MODES: { id: LabelPriceMode; label: string }[] = [
  { id: 'auto', label: 'Авто' },
  { id: 'retail', label: 'Розница' },
  { id: 'wholesale', label: 'Опт' },
  { id: 'both', label: 'Обе цены' },
];

/** Display size of a label inside a box, keeping its proportions */
const fitBox = (f: Pick<LabelFormat, 'widthMm' | 'heightMm'>, maxW: number, maxH: number) =>
  Math.min(maxW, (maxH * f.widthMm) / f.heightMm);

/**
 * Admin → «Склад» → labels: the store's label formats, templates (including wholesale & size packs),
 * price modes, stock-based or fixed copy counts, and a sticky live preview.
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
  const [formatId, setFormatId] = useState<string>(() => readPref('format') ?? formats[0]?.id ?? '');
  const [template, setTemplate] = useState<LabelTemplate>(() => {
    const saved = readPref('template');
    return LABEL_TEMPLATES.some((t) => t.id === saved) ? (saved as LabelTemplate) : 'classic';
  });
  const [activeGroupTab, setActiveGroupTab] = useState<'all' | LabelTemplateGroup>('all');
  const [priceMode, setPriceMode] = useState<LabelPriceMode>(() => {
    const saved = readPref('priceMode');
    return PRICE_MODES.some((m) => m.id === saved) ? (saved as LabelPriceMode) : 'auto';
  });

  useEffect(() => writePref('format', formatId), [formatId]);
  useEffect(() => writePref('template', template), [template]);
  useEffect(() => writePref('priceMode', priceMode), [priceMode]);

  const [isSavingFormats, setIsSavingFormats] = useState(false);
  const [options, setOptions] = useState<LabelOptions>({ showPrice: true, showBarcode: true });
  const [copiesMode, setCopiesMode] = useState<'fixed' | 'stock'>('fixed');
  const [zeroStockFallback, setZeroStockFallback] = useState(true);
  const [copiesText, setCopiesText] = useState('1');
  const copies = Math.min(LABEL_COPIES_MAX, Math.max(1, Math.floor(Number(copiesText)) || 1));
  const [previewIndex, setPreviewIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingFormat, setIsAddingFormat] = useState(false);
  const [draft, setDraft] = useState({ name: '', width: '', height: '' });
  const [formatToDelete, setFormatToDelete] = useState<LabelFormat | null>(null);

  const format = formats.find((f) => f.id === formatId) ?? formats[0];
  const sampleFormat = format ?? LABEL_FORMAT_PRESETS[0];

  useEffect(() => {
    let alive = true;
    loadLabelFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const dialog = useDialogA11y(true, onClose);

  // Variations are looked up in the current catalog, so reissued barcodes show at once
  const resolved = useMemo(
    () =>
      targets.map((t) => {
        const product = products.find((p) => p.id === t.productId);
        if (t.packId !== undefined) {
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
        data: labelData(r.product, r.sku, settings),
        stockCount: entryStockCount(r.product, r.sku),
      })),
      ...printablePacks.map((r) => ({
        key: sizePackBarcodeKey(r.product.id, r.pack.id, r.color),
        articleKey: sizePackBarcodeKey(r.product.id, r.pack.id, r.color),
        product: r.product,
        pack: r.pack,
        data: packLabelData(r.product, r.pack, r.color, settings),
        stockCount: entryStockCount(r.product, undefined, r.pack, r.color),
      })),
    ],
    [resolved, settings]
  );

  // Without a size on the label, all sizes of an article print the same: one label per article
  // (when printing by stock, the article's stock is the sum of its selected variations)
  const labels = useMemo<LabelEntry[]>(() => {
    if (info.showsSize) return entries;
    const byArticle = new Map<string, LabelEntry>();
    for (const r of entries) {
      const existing = byArticle.get(r.articleKey);
      if (!existing) {
        byArticle.set(r.articleKey, { ...r });
      } else {
        existing.stockCount += r.stockCount;
      }
    }
    return [...byArticle.values()];
  }, [entries, info.showsSize]);

  // Clamp previewIndex whenever labels list shrinks (e.g. switching from showsSize=true to showsSize=false)
  useEffect(() => {
    setPreviewIndex((i) => Math.min(i, Math.max(0, labels.length - 1)));
  }, [labels.length]);

  const problems = useMemo(
    () => new Map<string, BarcodeProblem>([...findBarcodeProblems(products), ...findSizePackBarcodeProblems(products)]),
    [products]
  );
  const barcodeIssues = options.showBarcode
    ? entries
        .map((r) => ({ ...r, problem: problems.get(r.key) }))
        .filter((r): r is typeof r & { problem: BarcodeProblem } => Boolean(r.problem))
    : [];
  const noOldPrice = info.needsOldPrice ? labels.filter((r) => !hasSaleOldPrice(r.data)) : [];

  const effectiveOptions = useMemo<LabelOptions>(
    () => ({ ...options, priceMode }),
    [options, priceMode]
  );

  const current = labels[Math.min(previewIndex, Math.max(0, labels.length - 1))];
  const previewOptions: LabelOptions =
    current && effectiveOptions.showBarcode && problems.has(current.key)
      ? { ...effectiveOptions, showBarcode: false }
      : effectiveOptions;

  const measure = useMemo(() => canvasMeasure(), []);
  const dropped = useMemo(
    () => (format && current ? layoutLabel(template, format, current.data, previewOptions, measure).dropped : []),
    [format, template, current, previewOptions, measure, fontsReady]
  );

  // Copies per label: either fixed `copies` for each, or based on physical stock
  const copiesPerLabel = useMemo<number[]>(
    () =>
      labels.map((item) => {
        if (copiesMode === 'fixed') return copies;
        const count = item.stockCount;
        if (count <= 0) return zeroStockFallback ? 1 : 0;
        return Math.min(LABEL_COPIES_MAX, count);
      }),
    [labels, copiesMode, copies, zeroStockFallback]
  );

  const pageCount = useMemo(() => copiesPerLabel.reduce((sum, n) => sum + n, 0), [copiesPerLabel]);
  const currentCopies = copiesPerLabel[Math.min(previewIndex, Math.max(0, labels.length - 1))] ?? 0;

  const canDownload =
    Boolean(format) &&
    labels.length > 0 &&
    pageCount > 0 &&
    barcodeIssues.length === 0 &&
    noOldPrice.length === 0 &&
    !isGenerating;

  const saveFormats = async (next: LabelFormat[]) => {
    if (!onUpdateSettings || isSavingFormats) return false;
    setIsSavingFormats(true);
    const ok = await onUpdateSettings({ ...settings, labelFormats: next });
    setIsSavingFormats(false);
    return ok !== false;
  };

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

  const missingPresets = LABEL_FORMAT_PRESETS.filter(
    (p) => !formats.some((f) => f.widthMm === p.widthMm && f.heightMm === p.heightMm)
  );

  const skuIssueGroups = new Set<string>(barcodeIssues.filter((r) => r.sku).map((r) => r.articleKey));
  const packIssueProducts = new Set<string>(barcodeIssues.filter((r) => r.pack).map((r) => r.product.id));
  const packIssueCount = barcodeIssues.filter((r) => r.pack).length;

  const reissueBarcodes = async () => {
    let next = products;
    if (skuIssueGroups.size > 0) next = unifyArticleBarcodes(next, skuIssueGroups);
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
        effectiveOptions,
        copiesMode === 'fixed' ? copies : copiesPerLabel
      );
      onShowToast(`PDF: ${pageCount} ${pluralRu(pageCount, ['этикетка', 'этикетки', 'этикеток'])} ${sizeText(format)}`, 'success');
    } catch (err) {
      console.error('Label PDF failed:', err);
      onShowToast('Не удалось сформировать PDF', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const visibleTemplateGroups = useMemo(
    () =>
      activeGroupTab === 'all'
        ? LABEL_TEMPLATE_GROUPS
        : LABEL_TEMPLATE_GROUPS.filter((g) => g.id === activeGroupTab),
    [activeGroupTab]
  );

  const currentPriceResolved = current ? resolveLabelPrices(current.data, priceMode) : null;

  const sectionTitle = 'text-[11px] font-extrabold uppercase tracking-wider text-text-primary';
  const inputClass =
    'w-full min-w-0 h-10 px-3 neu-inset rounded-xl text-xs font-semibold text-text-primary placeholder:text-text-muted';

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[130] bg-text-primary/55 flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          ref={dialog.ref}
          {...dialog.props}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl neu-modal rounded-3xl p-4 sm:p-6 flex flex-col gap-4 max-h-[92dvh] animate-in zoom-in-95 fade-in duration-200"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 neu-divider-b pb-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                <Barcode className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h3 id={dialog.titleId} className="text-base font-extrabold text-text-primary leading-tight">
                  Этикетки и штрихкоды
                </h3>
                <p className="text-xs font-semibold text-text-secondary leading-snug">
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
              className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
              aria-label="Закрыть окно (Esc)"
              title="Закрыть окно (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Two-Column Body: stacked scroll on mobile, independent dual-column scroll on desktop */}
          <div className="flex flex-col md:grid md:grid-cols-12 gap-5 overflow-y-auto md:overflow-hidden -mx-1 px-1 pb-1 flex-1 min-h-0">
            {/* Left Column: Formats, Templates, Options */}
            <div className="md:col-span-7 space-y-4 shrink-0 md:shrink md:overflow-y-auto md:pr-1.5 md:min-h-0">
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
                      className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Формат
                    </button>
                  )}
                </div>

                {formats.length === 0 && !isAddingFormat && (
                  <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
                    <p className="text-xs font-bold text-text-primary">Форматы не настроены</p>
                    <p className="text-xs text-text-secondary leading-snug">
                      Добавьте размер этикеток вашего принтера. Частые размеры:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {LABEL_FORMAT_PRESETS.map((preset) => (
                        <button
                          key={`${preset.widthMm}x${preset.heightMm}`}
                          type="button"
                          disabled={!onUpdateSettings || isSavingFormats}
                          onClick={() => void addFormat(preset)}
                          className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer"
                        >
                          <FormatThumb format={preset} size={16} />
                          {sizeText(preset)}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={!onUpdateSettings}
                        onClick={() => setIsAddingFormat(true)}
                        className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer"
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
                            className={`flex-1 min-w-0 h-10 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                              selected ? 'neu-pill-active' : 'neu-button text-text-primary'
                            }`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <FormatThumb format={f} size={20} />
                              <span className="truncate">{f.name}</span>
                            </span>
                            <span className={`shrink-0 text-[11px] tabular-nums ${selected ? '' : 'text-text-secondary'}`}>{sizeText(f)}</span>
                          </button>
                          {onUpdateSettings && (
                            <button
                              type="button"
                              onClick={() => setFormatToDelete(f)}
                              disabled={isSavingFormats}
                              className="w-10 h-10 rounded-xl neu-button text-text-secondary hover:text-danger flex items-center justify-center shrink-0 cursor-pointer transition-all disabled:cursor-not-allowed"
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
                        <p className="text-xs font-bold text-text-secondary">Частые размеры</p>
                        <div className="flex flex-wrap gap-2">
                          {missingPresets.map((preset) => (
                            <button
                              key={`${preset.widthMm}x${preset.heightMm}`}
                              type="button"
                              disabled={isSavingFormats}
                              onClick={() => void addFormat(preset)}
                              className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-accent flex items-center gap-1.5 cursor-pointer"
                            >
                              <FormatThumb format={preset} size={16} />
                              {sizeText(preset)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label htmlFor="label-format-name" className="block text-[11px] font-bold text-text-secondary">
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
                          <label htmlFor={`label-format-${key}`} className="block text-[11px] font-bold text-text-secondary">
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
                      <span className="h-10 w-10 rounded-xl neu-inset flex items-center justify-center shrink-0">
                        {Number(draft.width) > 0 && Number(draft.height) > 0 ? (
                          <FormatThumb format={{ widthMm: Number(draft.width), heightMm: Number(draft.height) }} size={26} />
                        ) : null}
                      </span>
                    </div>
                    <p
                      id="label-format-hint"
                      className={`text-xs leading-snug ${draftProblem ? 'text-danger font-bold' : 'text-text-secondary'}`}
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
                        className="h-9 px-3 rounded-xl neu-button text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={!draft.width || !draft.height || Boolean(draftProblem) || isSavingFormats}
                        className="h-9 px-3.5 rounded-xl neu-button-accent text-[11px] font-extrabold text-white flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {isSavingFormats ? 'Сохраняем…' : 'Добавить'}
                      </button>
                    </div>
                  </form>
                )}
              </section>

              {/* Templates with Recessed Group Filter Bar */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <h4 className={sectionTitle}>Шаблон</h4>
                    <AdminHint label="Шаблон">
                      Выберите макет этикетки: базовый, с размером, оптовый (ростовка, короб, двойной ценник, скидки от объема) или акционный.
                    </AdminHint>
                  </div>
                </div>

                {/* Group filter segmented track */}
                <div className="neu-inset p-1 rounded-xl flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveGroupTab('all')}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      activeGroupTab === 'all' ? 'neu-flat-sm text-accent font-extrabold' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Все ({LABEL_TEMPLATES.length})
                  </button>
                  {LABEL_TEMPLATE_GROUPS.map((group) => {
                    const isSelected = activeGroupTab === group.id;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveGroupTab(group.id)}
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isSelected ? 'neu-flat-sm text-accent font-extrabold' : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {group.title}
                      </button>
                    );
                  })}
                </div>

                {!format && current && (
                  <p className="text-xs text-text-secondary leading-snug">
                    Образцы — на частом размере {sizeText(sampleFormat)}. Добавьте формат вашего принтера: образцы
                    перерисуются под него, и PDF можно будет скачать.
                  </p>
                )}

                <div className="space-y-3" role="radiogroup" aria-label="Шаблон этикетки">
                  {visibleTemplateGroups.map((group) => (
                    <div key={group.id} className="space-y-1.5">
                      <p className="text-xs font-bold text-text-secondary">{group.title}</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 gap-2">
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
                                selected
                                  ? 'neu-inset ring-2 ring-accent text-accent'
                                  : 'neu-button text-text-primary hover:text-accent'
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

              {/* Price Mode & Toggles */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <h4 className={sectionTitle}>Реквизиты и режим цены</h4>
                    <AdminHint label="Режим цены">
                      «Авто» выводит оптовую сумму для ростовок и товаров только оптом, и розничную — для обычных вариаций. «Обе цены» выводит розничную и оптовую цену одновременно.
                    </AdminHint>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
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
                </div>

                {options.showPrice && (
                  <div className="neu-inset p-1 rounded-xl grid grid-cols-4 gap-1" role="radiogroup" aria-label="Режим цены">
                    {PRICE_MODES.map((m) => {
                      const active = priceMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPriceMode(m.id)}
                          className={`h-8 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap truncate ${
                            active ? 'neu-flat-sm text-accent font-extrabold' : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Copies Mode: Fixed vs By Warehouse Stock */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={sectionTitle}>Тираж печати</span>
                    <AdminHint label="Тираж">
                      Напечатать одинаковое количество копий на каждую этикетку или автоматически по фактическому остатку на складе (штук вариации / целых ростовок).
                    </AdminHint>
                  </div>
                  <div className="neu-inset p-1 rounded-xl flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCopiesMode('fixed')}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                        copiesMode === 'fixed' ? 'neu-flat-sm text-accent font-extrabold' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Фиксированно
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopiesMode('stock')}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                        copiesMode === 'stock' ? 'neu-flat-sm text-accent font-extrabold' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      По остаткам
                    </button>
                  </div>
                </div>

                {copiesMode === 'fixed' ? (
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="label-copies" className="text-xs font-bold text-text-primary">
                      Копий каждой этикетки
                    </label>
                    <input
                      id="label-copies"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={LABEL_COPIES_MAX}
                      value={copiesText}
                      onChange={(e) => setCopiesText(e.target.value)}
                      onBlur={() => setCopiesText(String(copies))}
                      className="w-20 h-10 px-3 neu-inset rounded-xl text-xs font-extrabold text-accent text-right tabular-nums shrink-0"
                    />
                  </div>
                ) : (
                  <div className="neu-inset rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                      <span className="font-bold text-text-primary">
                        По остаткам на складе ({pageCount} {pluralRu(pageCount, ['этикетка', 'этикетки', 'этикеток'])})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-text-secondary">При 0 остатке:</span>
                        <div className="neu-flat-sm p-0.5 rounded-lg flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setZeroStockFallback(true)}
                            className={`h-6 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              zeroStockFallback ? 'neu-pill-active' : 'text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            1 шт.
                          </button>
                          <button
                            type="button"
                            onClick={() => setZeroStockFallback(false)}
                            className={`h-6 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              !zeroStockFallback ? 'neu-pill-active' : 'text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            Пропуск
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-snug">
                      Для вариаций печатается число копий по остатку в штуках, для ростовок — по числу собираемых целых упаковок.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Right Column: Sticky Live Preview & Diagnostics */}
            <div className="md:col-span-5 flex flex-col gap-3 shrink-0 md:shrink md:overflow-y-auto md:min-h-0">
              {/* Preview */}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={sectionTitle}>Предпросмотр</h4>
                  {labels.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewIndex((i) => Math.max(0, Math.min(i, labels.length - 1) - 1))}
                        disabled={previewIndex === 0}
                        className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-text-secondary cursor-pointer disabled:opacity-40"
                        aria-label="Предыдущая этикетка"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[11px] font-bold text-text-secondary min-w-12 text-center tabular-nums">
                        {Math.min(previewIndex, labels.length - 1) + 1} из {labels.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewIndex((i) => Math.min(labels.length - 1, i + 1))}
                        disabled={previewIndex >= labels.length - 1}
                        className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-text-secondary cursor-pointer disabled:opacity-40"
                        aria-label="Следующая этикетка"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="neu-inset rounded-2xl p-4 flex flex-col items-center gap-2.5">
                  {current ? (
                    <>
                      <LabelCanvas
                        format={sampleFormat}
                        template={template}
                        data={current.data}
                        options={previewOptions}
                        displayWidth={fitBox(sampleFormat, Math.min(280, sampleFormat.widthMm * 5), 250)}
                        fontsReady={fontsReady}
                        className="rounded-lg border border-[#BAC5D5]"
                      />
                      <div className="text-center space-y-0.5">
                        <p className="text-xs font-extrabold text-text-primary leading-snug">
                          {entryName(current)}
                        </p>
                        <p className="text-[11px] font-bold text-text-secondary">
                          {format
                            ? `${sizeText(format)} · ${info.name} · тираж: ${currentCopies} шт.`
                            : `Образец ${sizeText(sampleFormat)} · ${info.name}. Для PDF добавьте формат`}
                        </p>
                      </div>
                      {options.showPrice && (current.data.noPrice || !currentPriceResolved?.hasPrice) && (
                        <p className="text-xs font-bold text-warning text-center leading-snug">
                          У позиции не задана выбранная цена — на этикетке её не будет. Задайте цену в карточке товара.
                        </p>
                      )}
                      {format && dropped.length > 0 && (
                        <p className="text-xs font-bold text-warning text-center leading-snug">
                          Не поместилось: {dropped.join(', ')}. Выберите формат крупнее или шаблон проще.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs font-bold text-text-secondary py-6 text-center">Нет вариантов для этикеток</p>
                  )}
                </div>
              </section>

              {/* «Скидка» without an old price */}
              {noOldPrice.length > 0 && (
                <section className="neu-tone-warning rounded-2xl p-3.5 space-y-2">
                  <p className="text-xs font-extrabold text-warning flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Шаблон «Скидка» нельзя применить
                  </p>
                  <p className="text-xs text-text-primary leading-snug">
                    У товара нет старой цены выше текущей. Задайте «Старую цену» в карточке товара (Каталог) или выберите
                    другой шаблон.
                    {noOldPrice.some((r) => r.pack) && ' У ростовки старой цены нет: для неё подойдет другой шаблон.'}
                  </p>
                  <ul
                    tabIndex={0}
                    aria-label="Товары без старой цены"
                    className="text-[11px] text-text-primary space-y-1 max-h-24 overflow-y-auto rounded-lg"
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
                <section className="neu-tone-warning rounded-2xl p-3.5 space-y-2.5">
                  <p className="text-xs font-extrabold text-warning flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Штрихкоды нужно обновить: {barcodeIssues.length}
                  </p>
                  <ul
                    tabIndex={0}
                    aria-label="Штрихкоды, которые нужно обновить"
                    className="text-[11px] text-text-primary space-y-1 max-h-28 overflow-y-auto rounded-lg"
                  >
                    {barcodeIssues.map((r) => (
                      <li key={r.key} className="leading-snug break-words">
                        {entryName(r)} — {PROBLEM_TEXT[r.problem]}
                        {r.data.barcode ? ` (${r.data.barcode})` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-text-secondary leading-snug">
                    {skuIssueGroups.size > 0 &&
                      'У всех размеров одного артикула будет один штрихкод: сохранится верный код артикула или будет выдан новый внутренний EAN-13 (начинается с 2). '}
                    {packIssueCount > 0 &&
                      'У каждого цвета ростовки свой штрихкод: верный сохранится, недостающий выдадим. '}
                    Коды сохранятся в товаре.
                  </p>
                  <button
                    type="button"
                    onClick={reissueBarcodes}
                    className="h-9 px-3.5 rounded-xl neu-button text-[11px] font-extrabold text-accent flex items-center gap-1.5 cursor-pointer transition-all"
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
                <p className="neu-inset rounded-2xl p-3 text-xs text-text-secondary leading-snug">
                  Без этикетки: {unsaved.map((r) => r.product!.title).join(', ')} — у товара нет сохраненных вариаций.
                  Откройте его в каталоге, задайте остатки и сохраните.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2.5 pt-3 neu-divider-t shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 shrink-0 neu-button rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
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
                <p className="text-xs font-extrabold text-text-primary truncate">{formatToDelete.name}</p>
                <p className="text-xs font-bold text-text-secondary">{sizeText(formatToDelete)}</p>
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
