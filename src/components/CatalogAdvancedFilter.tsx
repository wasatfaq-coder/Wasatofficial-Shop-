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
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '../types';

export interface FilterState {
  minPrice: number;
  maxPrice: number;
  selectedSizes: string[];
  selectedMaterials: string[];
  onlyInStock: boolean;
  onlyNew: boolean;
  onlyDiscount: boolean;
  minRating: number;
}

export const MATERIAL_CATEGORIES = [
  { id: 'cotton', name: 'Хлопок / Пике', keywords: ['хлопок', 'cotton', 'пике'] },
  { id: 'linen', name: 'Лён', keywords: ['лён', 'лен', 'linen'] },
  { id: 'wool', name: 'Шерсть / Кашемир', keywords: ['шерсть', 'wool', 'кашемир', 'cashmere'] },
  { id: 'denim', name: 'Деним', keywords: ['деним', 'джинс', 'эластан'] },
  { id: 'blend', name: 'Смесовые ткани', keywords: ['полиэстер', 'вискоза', 'смесов', 'polyester'] },
];

export const matchesMaterialFilter = (productMaterial: string, selectedMaterialIds: string[]): boolean => {
  if (selectedMaterialIds.length === 0) return true;
  const matLower = (productMaterial || '').toLowerCase();
  return selectedMaterialIds.some((matId) => {
    const foundCat = MATERIAL_CATEGORIES.find((c) => c.id === matId);
    if (!foundCat) {
      return matLower.includes(matId.toLowerCase());
    }
    return foundCat.keywords.some((kw) => matLower.includes(kw));
  });
};

export const isProductAvailableInSize = (product: Product, size: string): boolean => {
  if (product.inStock === false) return false;
  if (!product.sizes.includes(size)) return false;
  if (product.skus && product.skus.length > 0) {
    const matchingSkus = product.skus.filter((sku) => sku.size === size);
    if (matchingSkus.length > 0) {
      return matchingSkus.some((sku) => sku.stock > 0);
    }
  }
  return true;
};

export const isProductInStock = (product: Product): boolean => {
  if (product.inStock === false) return false;
  if (product.skus && product.skus.length > 0) {
    return product.skus.some((sku) => sku.stock > 0);
  }
  return true;
};

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
}) => {
  // Extract all available sizes dynamically from products
  const allAvailableSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    const standardOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '48', '50', '52', '54', '56'];
    products.forEach((p) => {
      p.sizes.forEach((s) => sizeSet.add(s));
    });
    return Array.from(sizeSet).sort((a, b) => {
      const idxA = standardOrder.indexOf(a);
      const idxB = standardOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [products]);

  // Calculate product counts per size based on current products & inventory
  const sizeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allAvailableSizes.forEach((sz) => {
      counts[sz] = products.filter((p) => isProductAvailableInSize(p, sz)).length;
    });
    return counts;
  }, [allAvailableSizes, products]);

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
    const prices = products.map((p) => p.price);
    return {
      minPossiblePrice: Math.floor(Math.min(...prices) / 500) * 500,
      maxPossiblePrice: Math.ceil(Math.max(...prices) / 1000) * 1000,
    };
  }, [products]);

  const toggleSize = (sz: string) => {
    onChangeFilterState((prev) => ({
      ...prev,
      selectedSizes: prev.selectedSizes.includes(sz)
        ? prev.selectedSizes.filter((s) => s !== sz)
        : [...prev.selectedSizes, sz],
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

  const pricePresets = [
    { label: 'Все', min: minPossiblePrice, max: maxPossiblePrice },
    { label: 'До 3 000 ₽', min: minPossiblePrice, max: 3000 },
    { label: '3 000 – 7 000 ₽', min: 3000, max: 7000 },
    { label: '7 000 – 15 000 ₽', min: 7000, max: 15000 },
    { label: 'От 15 000 ₽', min: 15000, max: maxPossiblePrice },
  ];

  const renderFilterContent = () => (
    <div className="space-y-4">
      {/* 1. Real-time In-Stock Availability Switch with Inset Effect & Crisp Tactile Feedback */}
      <div
        onClick={() =>
          onChangeFilterState((prev) => ({
            ...prev,
            onlyInStock: !prev.onlyInStock,
          }))
        }
        className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 flex items-center justify-between gap-3 cursor-pointer select-none transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0 bg-[#E3E8EF] border border-white/40">
            <PackageCheck className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#2D3A4E] flex items-center gap-1.5">
              <span>Только товары в наличии</span>
              <span
                className={`w-2 h-2 rounded-full inline-block transition-colors ${
                  filterState.onlyInStock ? 'bg-success animate-pulse' : 'bg-slate-400'
                }`}
              />
            </div>
            <p className="text-[11px] text-[#4E5C70]">
              Скрывать распроданные размеры и товары
            </p>
          </div>
        </div>

        {/* Custom Neumorphic Toggle Switch */}
        <div
          role="switch"
          aria-checked={filterState.onlyInStock}
          className={`w-13 h-7 rounded-full p-1 transition-all duration-200 ease-in-out cursor-pointer neu-inset flex items-center relative shrink-0 ${
            filterState.onlyInStock
              ? 'bg-[#5F6ED0] border border-[#5F6ED0]'
              : 'bg-[#C9D3E2] border border-white/60'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full transition-transform duration-200 ease-in-out flex items-center justify-center ${
              filterState.onlyInStock
                ? 'translate-x-6 bg-white text-[#4B59BB] shadow-[var(--neu-raised-sm)]'
                : 'translate-x-0 bg-[#E3E8EF] text-[#4E5C70] shadow-sm'
            }`}
          >
            {filterState.onlyInStock ? (
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-[#8E9DB2]" />
            )}
          </div>
        </div>
      </div>

      {/* 2. Price Range Filter with Deepened Inset Buttons */}
      <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2D3A4E]">
            <Banknote className="w-4 h-4 text-[#4B59BB]" />
            <span>Ценовой диапазон</span>
          </div>
          <span className="text-xs font-black text-[#4B59BB] neu-inset-deep px-2.5 py-0.5 rounded-lg bg-[#E3E8EF] border border-[#5F6ED0]/40">
            {filterState.minPrice.toLocaleString('ru-RU')} ₽ — {filterState.maxPrice.toLocaleString('ru-RU')} ₽
          </span>
        </div>

        {/* Price Slider */}
        <div className="space-y-1 pt-1">
          <input
            type="range"
            min={minPossiblePrice}
            max={maxPossiblePrice}
            step="500"
            value={filterState.maxPrice}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChangeFilterState((prev) => ({
                ...prev,
                maxPrice: Math.max(val, prev.minPrice),
              }));
            }}
            className="neu-range py-1 w-full"
          />
          <div className="flex justify-between text-[11px] text-[#4E5C70] font-bold px-1">
            <span>{minPossiblePrice.toLocaleString('ru-RU')} ₽</span>
            <span>{Math.round((minPossiblePrice + maxPossiblePrice) / 2).toLocaleString('ru-RU')} ₽</span>
            <span>{maxPossiblePrice.toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>

        {/* Quick Price Presets - All styled with neu-inset */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {pricePresets.map((preset) => {
            const isPresetActive =
              filterState.minPrice === preset.min && filterState.maxPrice === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onChangeFilterState((prev) => ({
                    ...prev,
                    minPrice: preset.min,
                    maxPrice: preset.max,
                  }));
                }}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition-all active:scale-95 cursor-pointer ${
                  isPresetActive
                    ? 'neu-pill-active font-black'
                    : 'neu-inset text-[#2D3A4E] hover:text-[#4B59BB] bg-[#E3E8EF] border border-white/40'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Material & Fabric Composition Filter with Deepened Inset Buttons */}
      <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2D3A4E]">
            <Layers className="w-4 h-4 text-[#4B59BB]" />
            <span>Материал изделия</span>
          </div>
          {filterState.selectedMaterials.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onChangeFilterState((prev) => ({ ...prev, selectedMaterials: [] }))
              }
              className="text-[11px] font-bold text-danger hover:text-danger transition-colors neu-inset px-2 py-0.5 rounded-lg border border-white/40 cursor-pointer"
            >
              Сбросить ({filterState.selectedMaterials.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MATERIAL_CATEGORIES.map((cat) => {
            const isSelected = filterState.selectedMaterials.includes(cat.id);
            const count = materialCounts[cat.id] || 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleMaterial(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'neu-pill-active font-black'
                    : 'neu-inset text-[#2D3A4E] hover:text-[#4B59BB] bg-[#E3E8EF] border border-white/40'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                <span>{cat.name}</span>
                <span
                  className={`text-[11px] font-medium px-1.5 py-0.2 rounded-md ${
                    isSelected ? 'neu-pill-active font-bold' : 'neu-inset text-[#4E5C70]'
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
      <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2D3A4E]">
            <Sparkles className="w-4 h-4 text-[#4B59BB]" />
            <span>Наличие размеров</span>
          </div>
          {filterState.selectedSizes.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onChangeFilterState((prev) => ({ ...prev, selectedSizes: [] }))
              }
              className="text-[11px] font-bold text-danger hover:text-danger transition-colors neu-inset px-2 py-0.5 rounded-lg border border-white/40 cursor-pointer"
            >
              Сбросить ({filterState.selectedSizes.length})
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {allAvailableSizes.map((sz) => {
            const isSelected = filterState.selectedSizes.includes(sz);
            const count = sizeCounts[sz] || 0;
            const isOutOfStock = count === 0;

            return (
              <button
                key={sz}
                type="button"
                disabled={isOutOfStock}
                onClick={() => toggleSize(sz)}
                className={`py-2 px-1.5 rounded-xl text-center transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center ${
                  isOutOfStock
                    ? 'opacity-40 cursor-not-allowed neu-inset bg-[#E3E8EF]/50 border border-white/20'
                    : isSelected
                    ? 'neu-pill-active font-black'
                    : 'neu-inset font-bold text-[#2D3A4E] hover:text-[#4B59BB] bg-[#E3E8EF] border border-white/40'
                }`}
              >
                <span className="text-xs">{sz}</span>
                <span className="text-[11px] font-medium text-[#4E5C70]">
                  {isOutOfStock ? 'нет' : `${count} шт.`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Special Options (New, Discounts) with Inset Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            onChangeFilterState((prev) => ({ ...prev, onlyNew: !prev.onlyNew }))
          }
          className={`p-3 rounded-2xl text-xs flex items-center justify-between transition-all active:scale-95 cursor-pointer ${
            filterState.onlyNew
              ? 'neu-inset-deep font-black text-[#4B59BB] border border-[#5F6ED0]/60 bg-[#E3E8EF]'
              : 'neu-inset font-medium text-[#2D3A4E] hover:text-[#4B59BB] bg-[#E3E8EF] border border-white/40'
          }`}
        >
          <span>Только новинки</span>
          {filterState.onlyNew && <Check className="w-4 h-4 text-[#4B59BB] stroke-[3]" />}
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeFilterState((prev) => ({
              ...prev,
              onlyDiscount: !prev.onlyDiscount,
            }))
          }
          className={`p-3 rounded-2xl text-xs flex items-center justify-between transition-all active:scale-95 cursor-pointer ${
            filterState.onlyDiscount
              ? 'neu-inset-deep font-black text-[#4B59BB] border border-[#5F6ED0]/60 bg-[#E3E8EF]'
              : 'neu-inset font-medium text-[#2D3A4E] hover:text-[#4B59BB] bg-[#E3E8EF] border border-white/40'
          }`}
        >
          <span>Со скидкой</span>
          {filterState.onlyDiscount && <Check className="w-4 h-4 text-[#4B59BB] stroke-[3]" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Inline Expandable Filter Box in Catalog */}
      <AnimatePresence>
        {isInlineExpanded && (
          <motion.div
            key="catalog-inline-filter"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="neu-flat rounded-3xl p-4 bg-[#E3E8EF] border border-white/80 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#4B59BB]" />
                  <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wider">
                    Параметры фильтрации каталога
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleInline}
                  className="w-7 h-7 rounded-xl neu-inset flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] border border-white/40 cursor-pointer"
                  title="Свернуть"
                  aria-label="Свернуть"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              {renderFilterContent()}

              <div className="flex items-center gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="py-2.5 px-4 rounded-xl neu-inset text-xs font-bold text-[#4E5C70] hover:text-danger transition-colors flex items-center gap-1.5 border border-white/40 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleInline}
                  className="flex-1 py-2.5 px-4 rounded-xl neu-inset-deep text-xs font-bold text-center active:scale-98 transition-all bg-[#E3E8EF] text-[#4B59BB] border border-[#5F6ED0]/50 cursor-pointer"
                >
                  Показать {filteredCount} товаров
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Drawer Overlay */}
      <AnimatePresence>
        {isOpenModal && (
          <motion.div
            key="catalog-filter-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            {/* Backdrop */}
            <div
              onClick={onCloseModal}
              className="fixed inset-0 bg-[#2D3A4E]/40 backdrop-blur-xs cursor-pointer"
            />

            <motion.div
              key="catalog-filter-modal-card"
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md bg-[#E3E8EF] neu-modal rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar z-10 border border-white/80"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#BAC5D5]/60">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#4B59BB] stroke-[2.2]" />
                  <h3 className="text-base font-bold text-[#2D3A4E]">
                    Расширенная фильтрация
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onCloseModal}
                  className="w-8 h-8 rounded-full neu-inset flex items-center justify-center text-[#2D3A4E] hover:text-[#4B59BB] transition-colors border border-white/50 cursor-pointer active:scale-95"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {renderFilterContent()}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="py-3 px-4 rounded-2xl neu-inset text-xs font-bold text-[#4E5C70] hover:text-danger shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 border border-white/40 active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
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
                  className="flex-1 py-3.5 px-5 rounded-2xl neu-inset-deep font-bold text-xs text-center active:scale-98 transition-all cursor-pointer bg-[#E3E8EF] text-[#4B59BB] border border-[#5F6ED0]/60 flex items-center justify-center gap-2"
                >
                  <span>Показать {filteredCount} товаров</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
