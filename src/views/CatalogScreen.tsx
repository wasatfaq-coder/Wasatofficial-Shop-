import React, { useState, useMemo } from 'react';
import { LazyMount } from '../components/LazyMount';
import { QuickViewModal } from '../components/lazyWindows';
import {
  X,
  SlidersHorizontal,
  ArrowUpDown,
  RotateCcw,
  Sparkles,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { Product, UserProfile, BodyMeasurements, CartItem } from '../types';
import { sellsWholesale, type WholesaleSettings } from '../shared/wholesalePricing';
import { exportWholesalePriceListCSV, generateWholesalePriceListPDF } from '../utils/wholesalePriceList';
import { preloadPdfLibraries } from '../utils/pdfExport';
import { ProductCard } from '../components/ProductCard';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import {
  CatalogAdvancedFilter,
  FilterState,
  MATERIAL_CATEGORIES,
  DEFAULT_FILTER_STATE,
  NO_MAX_PRICE,
  hasPriceFilter,
  matchesCatalogFilters,
} from '../components/CatalogAdvancedFilter';
import { productRatingValue } from '../utils/productRating';
import { NotConfigured } from '../components/NotConfigured';
import type { StoreCategory } from '../types';
import { categoryIcon } from '../utils/categories';
import { pluralRu } from '../utils/pluralize';
import { buyerPrice } from '../utils/wholesaleOffer';
import { articleCode } from '../shared/barcode';
import {
  DEFAULT_CATALOG_VIEW,
  PRODUCTS_PAGE_SIZE,
  catalogListKey,
  shownProductCount,
  withNextPortion,
  type CatalogSort,
  type CatalogView,
} from '../utils/productListing';
import { CatalogLoadState, type CatalogStatus } from '../components/CatalogLoadState';

interface CatalogScreenProps {
  /** Catalog subscription: placeholders while loading, a message on error; «не настроено» only when ready */
  catalogStatus?: CatalogStatus;
  /** From Admin → «Категории» */
  categories?: StoreCategory[];
  products: Product[];
  favorites: string[];
  recentlyViewed?: Product[];
  onClearRecentlyViewed?: () => void;
  onRemoveFromRecentlyViewed?: (productId: string) => void;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  /** false — nothing added yet (the customer is asked for a size) */
  onAddToCart: (product: Product, e: React.MouseEvent) => boolean | void;
  onAddToCartWithOptions?: (product: Product, color: string, size: string, quantity: number, wholesale?: boolean | 'wholesale' | 'broken') => boolean | void;
  onAddPackToCart?: (product: Product, packId: string, color: string, packs: number) => boolean;
  cartItems?: CartItem[];
  wholesale?: WholesaleSettings;
  /** Admin → «Витрина» → «Предзаказ» (quick view shows sold-out sizes as orderable) */
  preorderMode?: boolean;
  filterState?: FilterState;
  onChangeFilterState?: (updater: (prev: FilterState) => FilterState) => void;
  onResetFilters?: () => void;
  onOpenFilters?: () => void;
  initialOpenFilters?: boolean;
  onFiltersClosed?: () => void;
  /** Search shared with the top bar and the home screen (App); local when not given */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  /** The sort and the portions opened (App): «Назад» from a product returns to the same list; local when not given */
  view?: CatalogView;
  onViewChange?: (updater: (prev: CatalogView) => CatalogView) => void;
}

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  catalogStatus = 'ready',
  categories = [],
  products,
  favorites,
  userProfile,
  onSaveMeasurements,
  selectedCategory,
  onSelectCategory,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  onAddToCartWithOptions,
  onAddPackToCart,
  cartItems,
  wholesale,
  preorderMode = false,
  filterState: externalFilterState,
  onChangeFilterState: externalOnChangeFilterState,
  onResetFilters: externalOnResetFilters,
  onOpenFilters,
  initialOpenFilters = false,
  onFiltersClosed,
  searchQuery: externalSearchQuery,
  onSearchChange: externalOnSearchChange,
  view: externalView,
  onViewChange: externalOnViewChange,
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery ?? localSearchQuery;
  const setSearchQuery = externalOnSearchChange ?? setLocalSearchQuery;
  const [localView, setLocalView] = useState<CatalogView>(DEFAULT_CATALOG_VIEW);
  const view = externalView ?? localView;
  const setView = externalOnViewChange ?? setLocalView;
  const sortBy = view.sortBy;
  const setSortBy = (next: CatalogSort) => setView((prev) => ({ ...prev, sortBy: next }));
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  // Local fallback filter state if not provided from parent
  const [localFilterState, setLocalFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);

  const filterState = externalFilterState || localFilterState;
  const setFilterState = externalOnChangeFilterState || setLocalFilterState;

  // Local modal state if onOpenFilters not supplied
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(initialOpenFilters);

  // Quick View state
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isExportingWholesalePdf, setIsExportingWholesalePdf] = useState(false);
  const [wholesalePdfFailed, setWholesalePdfFailed] = useState(false);
  const wholesaleProductsCount = useMemo(() => products.filter(sellsWholesale).length, [products]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (hasPriceFilter(filterState)) count++;
    if (filterState.selectedSizes.length > 0) count += filterState.selectedSizes.length;
    if (filterState.selectedMaterials.length > 0) count += filterState.selectedMaterials.length;
    if (filterState.onlyInStock) count++;
    if (filterState.onlyNew) count++;
    if (filterState.onlyDiscount) count++;
    if (filterState.onlyWholesale) count++;
    if (filterState.minRating > 0) count++;
    return count;
  }, [selectedCategory, filterState]);

  const handleResetAll = () => {
    if (externalOnResetFilters) {
      externalOnResetFilters();
    } else {
      onSelectCategory('all');
      setFilterState(() => DEFAULT_FILTER_STATE);
    }
    setSearchQuery('');
  };

  const handleOpenFilterModal = () => {
    if (onOpenFilters) {
      onOpenFilters();
    } else {
      setIsFilterPanelOpen(true);
    }
  };

  // Real-time Reactive Filter Engine
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const cleanSearch = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !cleanSearch ||
          (p.title || '').toLowerCase().includes(cleanSearch) ||
          (p.id || '').toLowerCase().includes(cleanSearch) ||
          (p.description || '').toLowerCase().includes(cleanSearch) ||
          (p.categoryLabel || '').toLowerCase().includes(cleanSearch) ||
          (p.material || '').toLowerCase().includes(cleanSearch) ||
          (p.colors || []).some(
            (c) =>
              c?.name &&
              (c.name.toLowerCase().includes(cleanSearch) ||
                articleCode(p, c.name).toLowerCase().includes(cleanSearch))
          ) ||
          (p.skus || []).some(
            (s) =>
              (s.skuCode || '').toLowerCase().includes(cleanSearch) ||
              (s.barcode || '').toLowerCase().includes(cleanSearch)
          );
        return matchesQuery && matchesCatalogFilters(p, selectedCategory, filterState);
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return buyerPrice(a) - buyerPrice(b);
        if (sortBy === 'price-desc') return buyerPrice(b) - buyerPrice(a);
        if (sortBy === 'newest') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
        return productRatingValue(b) - productRatingValue(a); // popular
      });
  }, [
    products,
    selectedCategory,
    searchQuery,
    filterState,
    sortBy,
  ]);

  // The catalog opens with one portion; a new search, filter or sort starts from the first portion again, and the
  // way back from a product keeps the portions opened (finding 22)
  const listKey = catalogListKey(selectedCategory, searchQuery, filterState, sortBy);
  const visibleProducts = filteredProducts.slice(0, shownProductCount(view, listKey));
  const hiddenCount = filteredProducts.length - visibleProducts.length;

  return (
    <div className="space-y-4 pb-32 lg:pb-10 animate-in fade-in duration-300">
      {/* Computer (lg): filters in a column on the left, applied at once; search is in the top bar */}
      <div className={products.length > 0 ? 'lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:items-start' : ''}>
      {/* an empty store has nothing to filter: no made-up price scale and materials with 0 (finding 40) */}
      {products.length > 0 && (
      <aside aria-label="Фильтры каталога" className="hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto no-scrollbar p-1 -m-1">
        <CatalogAdvancedFilter
          variant="sidebar"
          products={products}
          filterState={filterState}
          onChangeFilterState={setFilterState}
          onResetFilters={handleResetAll}
          filteredCount={filteredProducts.length}
          isOpenModal={false}
          onCloseModal={() => {}}
          isInlineExpanded={false}
          onToggleInline={() => {}}
        />
      </aside>
      )}
      <div className="space-y-4 min-w-0">
      {/* 1. Search Bar & Master Filter Button with Unified Neumorphic Geometry */}
      <div className="flex items-center gap-3 pt-1 lg:hidden">
        <div className="flex-1">
          <AutocompleteSearch
            categories={categories}
            products={products}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectProduct={onSelectProduct}
            onSelectCategory={onSelectCategory}
          />
        </div>

        {/* Master Filter Button */}
        <button
          onClick={handleOpenFilterModal}
          className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer bg-[#E3E8EF] ${
            activeFiltersCount > 0
              ? 'neu-pill-active font-bold'
              : 'neu-button text-text-primary hover:text-accent'
          }`}
          title="Параметры фильтрации"
          aria-label="Фильтры"
        >
          <SlidersHorizontal className="w-5 h-5 stroke-[2]" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-accent text-white font-extrabold text-[11px] w-5 h-5 rounded-full flex items-center justify-center shadow-[var(--neu-fill-accent-shadow)] ring-2 ring-[#E3E8EF]">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. Category Carousel: categories from Admin → «Категории» */}
      {categories.length === 0 && catalogStatus === 'ready' && <NotConfigured title="Категории" />}
      {categories.length > 0 && (
      <div className="relative -mx-4 px-4">
        <div role="radiogroup" aria-label="Категория" className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-2 scroll-smooth">
          {[{ id: 'all', name: 'Все' }, ...categories].map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const IconComp = cat.id === 'all' ? Sparkles : categoryIcon(cat);

            return (
              <button
                key={cat.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectCategory(cat.id)}
                className={`relative px-4 py-2.5 rounded-2xl text-[13px] transition-all whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer select-none bg-[#E3E8EF] ${
                  isSelected
                    ? 'neu-pill-active font-bold'
                    : 'neu-button font-semibold text-text-primary hover:text-accent'
                }`}
              >
                <IconComp
                  className={`w-4 h-4 ${
                    isSelected ? 'stroke-[2.2] text-accent' : 'stroke-[1.8] text-text-secondary'
                  }`}
                />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
        {/* Soft edge fade mask indicating horizontal scroll */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#E3E8EF] to-transparent z-10" />
      </div>
      )}

      {/* 3. Collapsible Advanced Filter Drawer / Modal (Local Fallback) */}
      {!onOpenFilters && (
        <CatalogAdvancedFilter
          products={products}
          filterState={filterState}
          onChangeFilterState={setFilterState}
          onResetFilters={handleResetAll}
          filteredCount={filteredProducts.length}
          isOpenModal={isFilterPanelOpen}
          onCloseModal={() => {
            setIsFilterPanelOpen(false);
            if (onFiltersClosed) onFiltersClosed();
          }}
          isInlineExpanded={false}
          onToggleInline={() => {}}
        />
      )}

      {/* 4. Active Filter Chips with Clean Neumorphic Inset Styling */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap py-1">
          {filterState.onlyInStock && (
            <span className="neu-pill-active text-[11px] font-bold text-accent pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block shrink-0" />
              <span>Только в наличии</span>
              <button
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, onlyInStock: false }))
                }
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                aria-label="Убрать фильтр «Только в наличии»"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              </button>
            </span>
          )}

          {hasPriceFilter(filterState) && (
            <span className="neu-pill-active text-[11px] font-bold text-text-primary pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5">
              <span>
                Цена: {filterState.minPrice > 0 ? `от ${filterState.minPrice.toLocaleString('ru-RU')} ₽ ` : ''}
                {Number.isFinite(filterState.maxPrice) ? `до ${filterState.maxPrice.toLocaleString('ru-RU')} ₽` : ''}
              </span>
              <button
                onClick={() =>
                  setFilterState((prev) => ({
                    ...prev,
                    minPrice: 0,
                    maxPrice: NO_MAX_PRICE,
                  }))
                }
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                aria-label="Убрать фильтр по цене"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              </button>
            </span>
          )}

          {filterState.selectedMaterials.map((matId) => {
            const matObj = MATERIAL_CATEGORIES.find((m) => m.id === matId);
            return (
              <span
                key={matId}
                className="neu-pill-active text-[11px] font-bold text-text-primary pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5"
              >
                <span>Ткань: {matObj ? matObj.name : matId}</span>
                <button
                  onClick={() =>
                    setFilterState((prev) => ({
                      ...prev,
                      selectedMaterials: prev.selectedMaterials.filter((m) => m !== matId),
                    }))
                  }
                  className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                  aria-label={`Убрать фильтр «Ткань: ${matObj ? matObj.name : matId}»`}
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                </button>
              </span>
            );
          })}

          {filterState.selectedSizes.map((sz) => (
            <span
              key={sz}
              className="neu-pill-active text-[11px] font-bold text-text-primary pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5"
            >
              <span>Размер: {sz}</span>
              <button
                onClick={() =>
                  setFilterState((prev) => ({
                    ...prev,
                    selectedSizes: prev.selectedSizes.filter((s) => s !== sz),
                  }))
                }
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                aria-label={`Убрать фильтр «Размер: ${sz}»`}
              >
                <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              </button>
            </span>
          ))}

          {filterState.onlyNew && (
            <span className="neu-pill-active text-[11px] font-bold text-text-primary pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5">
              <span>Только новинки</span>
              <button
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, onlyNew: false }))
                }
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                aria-label="Убрать фильтр «Только новинки»"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              </button>
            </span>
          )}

          {filterState.onlyDiscount && (
            <span className="neu-pill-active text-[11px] font-bold text-text-primary pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5">
              <span>Со скидкой</span>
              <button
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, onlyDiscount: false }))
                }
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                aria-label="Убрать фильтр «Со скидкой»"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              </button>
            </span>
          )}

          {filterState.onlyWholesale && (
            <span className="neu-pill-active text-[11px] font-bold text-text-primary pl-3 pr-0.5 py-0.5 min-h-8 rounded-full flex items-center gap-1.5">
              <span>Оптом</span>
              <button
                onClick={() => setFilterState((prev) => ({ ...prev, onlyWholesale: false }))}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-danger cursor-pointer transition-colors shrink-0"
                aria-label="Убрать фильтр «Оптом»"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              </button>
            </span>
          )}

          <button
            onClick={handleResetAll}
            className="min-h-8 text-xs font-bold text-danger hover:text-danger flex items-center gap-1.5 ml-auto cursor-pointer py-1.5 px-3 rounded-xl neu-button shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
            <span>Сбросить все</span>
          </button>
        </div>
      )}

      {/* Wholesale Price List Download Bar (shown when the store sells wholesale) */}
      {wholesaleProductsCount > 0 && (
        <div className="neu-flat-sm rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 flex-wrap ">
          <div className="text-xs font-bold text-text-primary flex items-center gap-2">
            <span>Оптовый прайс-лист ({wholesaleProductsCount} {pluralRu(wholesaleProductsCount, ['модель', 'модели', 'моделей'])})</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => exportWholesalePriceListCSV(products, wholesale)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl neu-button text-xs font-bold text-text-primary hover:text-accent cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              <span>Прайс CSV</span>
            </button>
            <button
              type="button"
              disabled={isExportingWholesalePdf}
              onMouseEnter={preloadPdfLibraries}
              onFocus={preloadPdfLibraries}
              onClick={async () => {
                setIsExportingWholesalePdf(true);
                setWholesalePdfFailed(false);
                try {
                  await generateWholesalePriceListPDF(products, wholesale);
                } catch (error) {
                  // e.g. the canvas height limit of a phone with a long catalog: the buyer is told, CSV still works
                  console.warn('Wholesale price list PDF failed:', error);
                  setWholesalePdfFailed(true);
                } finally {
                  setIsExportingWholesalePdf(false);
                }
              }}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold ${
                isExportingWholesalePdf ? 'neu-button-disabled' : 'neu-button text-text-primary hover:text-accent cursor-pointer'
              }`}
            >
              {isExportingWholesalePdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" aria-hidden="true" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              )}
              <span>{isExportingWholesalePdf ? 'PDF…' : 'Прайс PDF'}</span>
            </button>
          </div>
          {wholesalePdfFailed && (
            <p role="alert" className="w-full text-xs font-semibold text-danger">
              Не удалось собрать PDF на этом устройстве — скачайте прайс CSV.
            </p>
          )}
        </div>
      )}

      {/* 5. Sorting & Product Count Bar (not shown while the catalog is empty) */}
      {products.length > 0 && (
      <div className="flex items-center justify-between min-h-[42px] px-1">
        <span className="text-xs font-semibold text-text-secondary">
          Найдено:{' '}
          <span className="text-text-primary font-extrabold text-sm">{filteredProducts.length}</span>{' '}
          {pluralRu(filteredProducts.length, ['товар', 'товара', 'товаров'])}
        </span>

        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className={`rounded-2xl px-4 py-2 flex items-center gap-2 text-text-primary font-bold text-xs transition-all cursor-pointer ${
              showSortMenu ? 'neu-pill-active' : 'neu-button hover:text-accent'
            }`}
            aria-haspopup="menu"
            aria-expanded={showSortMenu}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-accent stroke-[2.2]" />
            <span>
              {sortBy === 'popular' && 'По популярности'}
              {sortBy === 'price-asc' && 'Сначала дешевле'}
              {sortBy === 'price-desc' && 'Сначала дороже'}
              {sortBy === 'newest' && 'Сначала новинки'}
            </span>
          </button>

          {/* Sort Dropdown */}
          {showSortMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl p-1.5 z-30 neu-dropdown space-y-1">
              <button
                onClick={() => {
                  setSortBy('popular');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${
                  sortBy === 'popular'
                    ? 'neu-pill-active font-bold'
                    : 'neu-option text-text-primary font-semibold hover:text-accent'
                }`}
              >
                По популярности
              </button>
              <button
                onClick={() => {
                  setSortBy('price-asc');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${
                  sortBy === 'price-asc'
                    ? 'neu-pill-active font-bold'
                    : 'neu-option text-text-primary font-semibold hover:text-accent'
                }`}
              >
                Сначала дешевле
              </button>
              <button
                onClick={() => {
                  setSortBy('price-desc');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${
                  sortBy === 'price-desc'
                    ? 'neu-pill-active font-bold'
                    : 'neu-option text-text-primary font-semibold hover:text-accent'
                }`}
              >
                Сначала дороже
              </button>
              <button
                onClick={() => {
                  setSortBy('newest');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${
                  sortBy === 'newest'
                    ? 'neu-pill-active font-bold'
                    : 'neu-option text-text-primary font-semibold hover:text-accent'
                }`}
              >
                Сначала новинки
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* 6. Product Grid */}
      <AnimatePresence mode="wait">
        <m.div
          key={`${selectedCategory}-${sortBy}-${filterState.minPrice}-${filterState.maxPrice}-${filterState.selectedSizes.join('-')}-${filterState.selectedMaterials.join('-')}-${filterState.onlyInStock}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {catalogStatus !== 'ready' ? (
            <CatalogLoadState status={catalogStatus} cards={6} />
          ) : products.length === 0 ? (
            <NotConfigured title="Каталог" hint="Товары появятся здесь, когда магазин их добавит." />
          ) : filteredProducts.length === 0 ? (
            <div className="neu-inset rounded-3xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl neu-flat-sm mx-auto flex items-center justify-center text-accent">
                <SlidersHorizontal className="w-6 h-6 stroke-[1.8]" />
              </div>
              <p className="text-sm font-bold text-text-primary">Товары по выбранным параметрам не найдены</p>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                Попробуйте расширить диапазон цен, выбрать другие размеры, ткани или сбросить фильтры наличия.
              </p>
              <button
                onClick={handleResetAll}
                className="mt-2 neu-button rounded-2xl px-5 py-2.5 text-xs font-extrabold text-accent hover:text-text-primary transition-transform cursor-pointer inline-flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                <span>Сбросить все фильтры</span>
              </button>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5 p-1 -m-1">
              {visibleProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  priority={index < 4}
                  isFavorite={favorites.includes(product.id)}
                  onSelect={onSelectProduct}
                  onToggleFavorite={onToggleFavorite}
                  onAddToCart={onAddToCart}
                  onQuickView={(prod) => setQuickViewProduct(prod)}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <div className="flex flex-col items-center gap-2 pt-5">
                <p className="text-xs text-text-secondary">
                  Показано {visibleProducts.length} из {filteredProducts.length}
                </p>
                <button
                  type="button"
                  onClick={() => setView((prev) => withNextPortion(prev, listKey))}
                  className="neu-button rounded-2xl h-11 px-6 text-sm font-extrabold text-accent cursor-pointer"
                >
                  Показать ещё {Math.min(PRODUCTS_PAGE_SIZE, hiddenCount)}
                </button>
              </div>
            )}
            </>
          )}
        </m.div>
      </AnimatePresence>
      </div>
      </div>

      {/* 7. Quick View Modal */}
      <LazyMount when={!!quickViewProduct}>
      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        isFavorite={quickViewProduct ? favorites.includes(quickViewProduct.id) : false}
        userProfile={userProfile}
        onSaveMeasurements={onSaveMeasurements}
        onClose={() => setQuickViewProduct(null)}
        onSelectFullProduct={(prod) => {
          setQuickViewProduct(null);
          onSelectProduct(prod);
        }}
        onToggleFavorite={onToggleFavorite}
        onAddToCartWithOptions={(prod, color, size, qty, isWholesale) =>
          onAddToCartWithOptions ? onAddToCartWithOptions(prod, color, size, qty, isWholesale) : onAddToCart(prod, null as any)
        }
        onAddPackToCart={onAddPackToCart}
        cartItems={cartItems}
        wholesale={wholesale}
        preorderMode={preorderMode}
      />
      </LazyMount>
    </div>
  );
};
