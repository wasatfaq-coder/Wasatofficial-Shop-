import React, { useMemo } from 'react';
import {
  X,
  RotateCcw,
  Check,
  PackageCheck,
  Layers,
  Banknote,
  Sparkles,
  SlidersHorizontal,
  ChevronUp,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { Product } from '../types';
import { pluralRu } from '../utils/pluralize';
import { NeumorphicSwitch } from './NeumorphicSwitch';
import { useDialogA11y } from '../utils/useDialogA11y';
import { buildSizeChips, sizeMatches } from '../utils/sizeScale';
import { sellsWholesale } from '../shared/wholesalePricing';
import { buyerPrice } from '../utils/wholesaleOffer';

export {
  DEFAULT_FILTER_STATE,
  MATERIAL_CATEGORIES,
  NO_MAX_PRICE,
  hasPriceFilter,
  matchesCatalogFilters,
  type FilterState,
} from '../utils/catalogFilters';
import {
  MATERIAL_CATEGORIES,
  NO_MAX_PRICE,
  isProductAvailableInSize,
  matchesMaterialFilter,
  type FilterState,
} from '../utils/catalogFilters';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/** «Любая цена», «до 3 000 ₽», «от 7 000 ₽» or «3 000 – 7 000 ₽» */
function priceRangeLabel(f: FilterState): string {
  const hasMax = Number.isFinite(f.maxPrice);
  if (f.minPrice > 0 && hasMax) return `${rub(f.minPrice)} – ${rub(f.maxPrice)}`;
  if (f.minPrice > 0) return `от ${rub(f.minPrice)}`;
  if (hasMax) return `до ${rub(f.maxPrice)}`;
  return 'Любая цена';
}

export interface PricePreset {
  label: string;
  min: number;
  max: number;
}

/** A round bound for a price chip: 100s below 2 000 ₽, 500s below 10 000 ₽, 1 000s above */
const roundPrice = (v: number) => {
  const step = v < 2000 ? 100 : v < 10000 ? 500 : 1000;
  return Math.max(step, Math.round(v / step) * step);
};

/**
 * Quick price chips built from the catalog's own prices (about a third of the products in each), so no chip
 * promises a range the store does not sell. Ranges without products are dropped; a tiny catalog gets only «Все».
 */
export function buildPricePresets(prices: number[]): PricePreset[] {
  const all: PricePreset = { label: 'Все', min: 0, max: NO_MAX_PRICE };
  const sorted = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (sorted.length < 3 || sorted[0] === sorted[sorted.length - 1]) return [all];

  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const bounds = [...new Set([roundPrice(at(1 / 3)), roundPrice(at(2 / 3))])]
    .filter((b) => b > sorted[0] && b <= sorted[sorted.length - 1])
    .sort((a, b) => a - b);
  if (bounds.length === 0) return [all];

  const edges = [0, ...bounds, NO_MAX_PRICE];
  const ranges: PricePreset[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const min = edges[i];
    const max = edges[i + 1];
    if (!sorted.some((p) => p >= min && p <= max)) continue;
    const label =
      min === 0
        ? `До ${rub(max)}`
        : !Number.isFinite(max)
        ? `От ${rub(min)}`
        : `${min.toLocaleString('ru-RU')} – ${rub(max)}`;
    ranges.push({ label, min, max });
  }
  return ranges.length > 1 ? [all, ...ranges] : [all];
}


interface CatalogAdvancedFilterProps {
  products: Product[];
  filterState: FilterState;
  onChangeFilterState: (updater: (prev: FilterState) => FilterState) => void;
  onResetFilters: () => void;
  filteredCount: number;
  isOpenModal: boolean;
  onCloseModal: () => void;
  onApplyModal?: () => void;
  isInlineExpanded: boolean;
  onToggleInline: () => void;
  /** 'sidebar': the computer's catalog column — always open, applied at once, no «Показать» */
  variant?: 'default' | 'sidebar';
}

export const CatalogAdvancedFilter: React.FC<CatalogAdvancedFilterProps> = ({
  products,
  filterState,
  onChangeFilterState,
  onResetFilters,
  filteredCount,
  isOpenModal,
  onCloseModal,
  onApplyModal,
  isInlineExpanded,
  onToggleInline,
  variant = 'default',
}) => {
  const dialog = useDialogA11y(variant === 'default' && isOpenModal, onCloseModal);
  const showLabel =
    filteredCount === 0
      ? 'Ничего не найдено'
      : `Показать ${filteredCount} ${pluralRu(filteredCount, ['товар', 'товара', 'товаров'])}`;
  // One scale: «M» and «48 (M)» are one chip, counted in products that have the size in stock
  const sizeChips = useMemo(() => buildSizeChips(products, isProductAvailableInSize), [products]);

  // Calculate product counts per material
  const materialCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    MATERIAL_CATEGORIES.forEach((cat) => {
      counts[cat.id] = products.filter((p) => matchesMaterialFilter(p.material, [cat.id])).length;
    });
    return counts;
  }, [products]);

  // Min and max price across all products
  const { minPossiblePrice, maxPossiblePrice } = useMemo(() => {
    if (products.length === 0) return { minPossiblePrice: 0, maxPossiblePrice: 35000 };
    const prices = products.map(buyerPrice);
    return {
      minPossiblePrice: Math.floor(Math.min(...prices) / 500) * 500,
      maxPossiblePrice: Math.ceil(Math.max(...prices) / 1000) * 1000,
    };
  }, [products]);

  // `selectedSizes` keeps the chip's label («M», «XXL»); a size chosen as «48 (M)» counts as the chip «M»
  const isSizeSelected = (size: string) => filterState.selectedSizes.some((s) => sizeMatches(s, size));
  const toggleSize = (size: string) => {
    onChangeFilterState((prev) => ({
      ...prev,
      selectedSizes: prev.selectedSizes.some((s) => sizeMatches(s, size))
        ? prev.selectedSizes.filter((s) => !sizeMatches(s, size))
        : [...prev.selectedSizes, size],
    }));
  };

  const toggleMaterial = (matId: string) => {
    onChangeFilterState((prev) => ({
      ...prev,
      selectedMaterials: prev.selectedMaterials.includes(matId)
        ? prev.selectedMaterials.filter((m) => m !== matId)
        : [...prev.selectedMaterials, matId],
    }));
  };

  const pricePresets = useMemo(() => buildPricePresets(products.map(buyerPrice)), [products]);
  // «Оптом» is offered only when the store sells something wholesale
  const hasWholesale = useMemo(() => products.some(sellsWholesale), [products]);

  const sliderValue = Math.min(filterState.maxPrice, maxPossiblePrice);
  const sliderPercent =
    maxPossiblePrice > minPossiblePrice
      ? Math.max(0, Math.min(100, ((sliderValue - minPossiblePrice) / (maxPossiblePrice - minPossiblePrice)) * 100))
      : 100;

  // Filter content is rendered inline and in the modal: ids get a prefix so they stay unique
  // sections are divided by a line, not cards inside the filter card (design pass 07.10)
  const renderFilterContent = (idPrefix: string) => (
    <div className="space-y-4">
      {/* 1. In-stock switch: the whole row is its label */}
      <div className="pt-4 neu-divider-t first:neu-divider-t-0 first:pt-0 flex items-center justify-between gap-3">
        <label htmlFor={`${idPrefix}-in-stock`} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer select-none">
          <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
            <PackageCheck className="w-4 h-4 stroke-[2.2] shrink-0" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-text-primary">Только товары в наличии</div>
            <p className="text-xs text-text-secondary leading-snug">
              Скрывать распроданные размеры и товары
            </p>
          </div>
        </label>

        <NeumorphicSwitch
          id={`${idPrefix}-in-stock`}
          checked={filterState.onlyInStock}
          onChange={(checked) => onChangeFilterState((prev) => ({ ...prev, onlyInStock: checked }))}
          label="Только товары в наличии"
        />
      </div>

      {/* 2. Price Range Filter with Deepened Inset Buttons */}
      <div className="pt-4 neu-divider-t first:neu-divider-t-0 first:pt-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-text-primary">
            <Banknote className="w-4 h-4 text-accent shrink-0" />
            <span>Ценовой диапазон</span>
          </div>
          <span className="text-xs font-extrabold text-accent text-right whitespace-nowrap tabular-nums">{priceRangeLabel(filterState)}</span>
        </div>

        {/* Price Slider */}
        <div className="space-y-1.5 pt-1 px-0.5">
          <input
            type="range"
            min={minPossiblePrice}
            max={maxPossiblePrice}
            step="500"
            value={sliderValue}
            style={{ '--range-progress': `${sliderPercent}%` } as React.CSSProperties}
            aria-label="Максимальная цена"
            onChange={(e) => {
              const val = Number(e.target.value);
              onChangeFilterState((prev) => ({
                ...prev,
                // the slider's end means «any price», so new pricier products are not hidden
                maxPrice: val >= maxPossiblePrice ? NO_MAX_PRICE : Math.max(val, prev.minPrice),
              }));
            }}
            className="neu-range h-8 w-full"
          />
          <div className="flex justify-between text-[11px] text-text-secondary font-bold px-0.5 tabular-nums">
            <span>{minPossiblePrice.toLocaleString('ru-RU')} ₽</span>
            <span>{Math.round((minPossiblePrice + maxPossiblePrice) / 2).toLocaleString('ru-RU')} ₽</span>
            <span>{maxPossiblePrice.toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>

        {/* Quick price presets: raised, the selected one pressed in */}
        {pricePresets.length > 1 && (
        <div role="radiogroup" aria-label="Быстрый выбор цены" className="flex items-center gap-2 flex-wrap pt-1">
          {pricePresets.map((preset) => {
            const isPresetActive =
              filterState.minPrice === preset.min && filterState.maxPrice === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                role="radio"
                aria-checked={isPresetActive}
                onClick={() => {
                  onChangeFilterState((prev) => ({
                    ...prev,
                    minPrice: preset.min,
                    maxPrice: preset.max,
                  }));
                }}
                className={`min-h-8 text-[11px] font-bold px-3.5 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  isPresetActive
                    ? 'neu-pill-active font-extrabold'
                    : 'neu-button text-text-primary hover:text-accent'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* 3. Material & Fabric Composition Filter with Deepened Inset Buttons */}
      <div className="pt-4 neu-divider-t first:neu-divider-t-0 first:pt-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-extrabold text-text-primary">
            <Layers className="w-4 h-4 text-accent shrink-0" />
            <span>Материал изделия</span>
          </div>
          {filterState.selectedMaterials.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onChangeFilterState((prev) => ({ ...prev, selectedMaterials: [] }))
              }
              className="min-h-8 text-[11px] font-bold neu-button-danger px-2.5 py-1 rounded-xl cursor-pointer shrink-0"
            >
              Сбросить ({filterState.selectedMaterials.length})
            </button>
          )}
        </div>

        <div role="group" aria-label="Материал изделия" className="flex flex-wrap gap-2">
          {MATERIAL_CATEGORIES.map((cat) => {
            const isSelected = filterState.selectedMaterials.includes(cat.id);
            const count = materialCounts[cat.id] || 0;
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleMaterial(cat.id)}
                className={`min-h-9 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'neu-pill-active font-extrabold'
                    : 'neu-button text-text-primary hover:text-accent'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" aria-hidden="true" />}
                <span>{cat.name}</span>
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${
                    isSelected ? 'neu-fill-accent text-white' : 'neu-inset text-text-secondary'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Size & Availability Filter with Deepened Inset Buttons */}
      <div className="pt-4 neu-divider-t first:neu-divider-t-0 first:pt-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-extrabold text-text-primary">
            <Sparkles className="w-4 h-4 text-accent shrink-0" />
            <span>Наличие размеров</span>
          </div>
          {filterState.selectedSizes.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onChangeFilterState((prev) => ({ ...prev, selectedSizes: [] }))
              }
              className="min-h-8 text-[11px] font-bold neu-button-danger px-2.5 py-1 rounded-xl cursor-pointer shrink-0"
            >
              Сбросить ({filterState.selectedSizes.length})
            </button>
          )}
        </div>

        {/* One scale: the letter size, the Russian one under it, then how many products (not units) */}
        <div
          role="group"
          aria-label="Размер"
          className={`grid gap-2.5 ${
            variant === 'sidebar' ? 'grid-cols-3' : 'grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-5'
          }`}
        >
          {sizeChips.map((chip) => {
            const isSelected = isSizeSelected(chip.label);
            const isOutOfStock = chip.count === 0;

            return (
              <button
                key={chip.key}
                type="button"
                disabled={isOutOfStock}
                aria-pressed={isSelected}
                onClick={() => toggleSize(chip.label)}
                className={`min-h-14 py-2.5 px-1.5 rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  isOutOfStock
                    ? 'neu-button-disabled'
                    : isSelected
                    ? 'neu-pill-active font-extrabold'
                    : 'neu-button font-bold text-text-primary hover:text-accent'
                }`}
              >
                <span className="text-xs font-extrabold leading-tight break-words max-w-full">{chip.label}</span>
                {chip.russian && (
                  <span className="text-[11px] font-bold text-accent leading-tight tabular-nums">
                    <span className="sr-only">российский </span>
                    {chip.russian}
                  </span>
                )}
                <span className="text-[11px] font-semibold text-text-secondary leading-tight whitespace-nowrap mt-0.5">
                  {isOutOfStock ? 'нет' : `${chip.count} ${pluralRu(chip.count, ['товар', 'товара', 'товаров'])}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Special Options (New, Discounts, Wholesale) with Carved Divider & Tactile Check Wells */}
      <div className="pt-4 neu-divider-t grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() =>
            onChangeFilterState((prev) => ({ ...prev, onlyNew: !prev.onlyNew }))
          }
          aria-pressed={filterState.onlyNew}
          className={`p-3 px-3.5 rounded-2xl text-xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
            filterState.onlyNew
              ? 'neu-pill-active font-extrabold'
              : 'neu-button font-bold text-text-primary hover:text-accent'
          }`}
        >
          <span>Только новинки</span>
          <span
            aria-hidden="true"
            className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all ${
              filterState.onlyNew ? 'neu-fill-accent text-white' : 'neu-inset text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeFilterState((prev) => ({
              ...prev,
              onlyDiscount: !prev.onlyDiscount,
            }))
          }
          aria-pressed={filterState.onlyDiscount}
          className={`p-3 px-3.5 rounded-2xl text-xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
            filterState.onlyDiscount
              ? 'neu-pill-active font-extrabold'
              : 'neu-button font-bold text-text-primary hover:text-accent'
          }`}
        >
          <span>Со скидкой</span>
          <span
            aria-hidden="true"
            className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all ${
              filterState.onlyDiscount ? 'neu-fill-accent text-white' : 'neu-inset text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </span>
        </button>

        {hasWholesale && (
          <button
            type="button"
            onClick={() => onChangeFilterState((prev) => ({ ...prev, onlyWholesale: !prev.onlyWholesale }))}
            aria-pressed={filterState.onlyWholesale}
            className={`col-span-2 p-3 px-3.5 rounded-2xl text-xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
              filterState.onlyWholesale
                ? 'neu-pill-active font-extrabold'
                : 'neu-button font-bold text-text-primary hover:text-accent'
            }`}
          >
            <span>Оптом</span>
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                filterState.onlyWholesale ? 'neu-fill-accent text-white' : 'neu-inset text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
          </button>
        )}
      </div>
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <div className="neu-flat rounded-3xl p-4 space-y-4 ">
        <div className="flex items-center justify-between gap-2 pb-3 neu-divider-b">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-accent shrink-0" />
            Фильтры
          </h2>
          <button
            type="button"
            onClick={onResetFilters}
            className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-text-secondary hover:text-danger flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            Сбросить
          </button>
        </div>
        {renderFilterContent('catalog-filter-side')}
      </div>
    );
  }

  return (
    <>
      {/* Inline Expandable Filter Box in Catalog */}
      <AnimatePresence>
        {isInlineExpanded && (
          <m.div
            key="catalog-inline-filter"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="neu-flat rounded-3xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 neu-divider-b">
                <div className="flex items-center gap-2 min-w-0">
                  <SlidersHorizontal className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-xs font-extrabold text-text-primary uppercase tracking-wider truncate">
                    Параметры фильтрации каталога
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleInline}
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
                  title="Свернуть"
                  aria-label="Свернуть"
                >
                  <ChevronUp className="w-4 h-4 shrink-0" />
                </button>
              </div>

              {renderFilterContent('catalog-filter-inline')}

              <div className="flex items-center gap-2.5 pt-2 neu-divider-t">
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="h-11 px-4 rounded-xl neu-button text-xs font-bold text-text-secondary hover:text-danger transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Сбросить</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleInline}
                  disabled={filteredCount === 0}
                  className="flex-1 h-11 px-4 rounded-xl neu-button-accent text-xs font-bold text-center transition-all cursor-pointer flex items-center justify-center disabled:cursor-not-allowed"
                >
                  {showLabel}
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Modal Drawer Overlay */}
      <AnimatePresence>
        {isOpenModal && (
          <m.div
            key="catalog-filter-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          >
            {/* Backdrop */}
            <div
              onClick={onCloseModal}
              className="fixed inset-0 bg-text-primary/40 backdrop-blur-xs cursor-pointer"
            />

            <m.div
              ref={dialog.ref}
              {...dialog.props}
              key="catalog-filter-modal-card"
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md neu-modal rounded-3xl p-5 flex flex-col gap-3.5 max-h-[90dvh] overflow-hidden z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 neu-divider-b shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
                    <SlidersHorizontal className="w-4 h-4 stroke-[2.2] shrink-0" />
                  </div>
                  <h3 id={dialog.titleId} className="text-base font-extrabold text-text-primary truncate">
                    Фильтры
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onCloseModal}
                  className="w-9 h-9 rounded-full neu-button flex items-center justify-center text-text-primary hover:text-accent transition-colors cursor-pointer shrink-0"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              </div>

              {/* Scrollable filter body with negative horizontal margin + padding so button shadows never clip */}
              <div className="flex-1 min-h-0 overflow-y-auto -mx-3 px-3 py-1 no-scrollbar">
                {renderFilterContent('catalog-filter-modal')}
              </div>

              {/* Pinned footer with matched h-12 buttons */}
              <div className="pt-3.5 neu-divider-t flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="h-12 px-4 rounded-2xl neu-button text-xs font-bold text-text-secondary hover:text-danger shrink-0 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Сбросить</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onApplyModal) {
                      onApplyModal();
                    } else {
                      onCloseModal();
                    }
                  }}
                  disabled={filteredCount === 0}
                  className="flex-1 h-12 px-5 rounded-2xl neu-button-accent font-extrabold text-xs text-center transition-all cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  <span>{showLabel}</span>
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
};
