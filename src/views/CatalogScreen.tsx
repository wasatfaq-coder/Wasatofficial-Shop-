import React, { useState, useMemo } from 'react';
import {
  X,
  SlidersHorizontal,
  ArrowUpDown,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, UserProfile, BodyMeasurements } from '../types';
import { CATEGORIES } from '../data/products';
import { ProductCard } from '../components/ProductCard';
import { QuickViewModal } from '../components/QuickViewModal';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import {
  ShirtIcon,
  TShirtIcon,
  JacketIcon,
  PantsIcon,
  SweatshirtIcon,
} from '../components/CategoryIcons';
import {
  CatalogAdvancedFilter,
  FilterState,
  matchesMaterialFilter,
  isProductAvailableInSize,
  isProductInStock,
  MATERIAL_CATEGORIES,
} from '../components/CatalogAdvancedFilter';

interface CatalogScreenProps {
  products: Product[];
  favorites: string[];
  cartItemIds: string[];
  recentlyViewed?: Product[];
  onClearRecentlyViewed?: () => void;
  onRemoveFromRecentlyViewed?: (productId: string) => void;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onAddToCartWithOptions?: (product: Product, color: string, size: string, quantity: number) => void;
  filterState?: FilterState;
  onChangeFilterState?: (updater: (prev: FilterState) => FilterState) => void;
  onResetFilters?: () => void;
  onOpenFilters?: () => void;
  initialOpenFilters?: boolean;
  onFiltersClosed?: () => void;
}

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  products,
  favorites,
  cartItemIds,
  userProfile,
  onSaveMeasurements,
  selectedCategory,
  onSelectCategory,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  onAddToCartWithOptions,
  filterState: externalFilterState,
  onChangeFilterState: externalOnChangeFilterState,
  onResetFilters: externalOnResetFilters,
  onOpenFilters,
  initialOpenFilters = false,
  onFiltersClosed,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'price-asc' | 'price-desc' | 'newest'>('popular');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  // Local fallback filter state if not provided from parent
  const [localFilterState, setLocalFilterState] = useState<FilterState>({
    minPrice: 0,
    maxPrice: 35000,
    selectedSizes: [],
    selectedMaterials: [],
    onlyInStock: false,
    onlyNew: false,
    onlyDiscount: false,
    minRating: 0,
  });

  const filterState = externalFilterState || localFilterState;
  const setFilterState = externalOnChangeFilterState || setLocalFilterState;

  // Local modal state if onOpenFilters not supplied
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(initialOpenFilters);

  // Quick View state
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (filterState.minPrice > 0 || filterState.maxPrice < 35000) count++;
    if (filterState.selectedSizes.length > 0) count += filterState.selectedSizes.length;
    if (filterState.selectedMaterials.length > 0) count += filterState.selectedMaterials.length;
    if (filterState.onlyInStock) count++;
    if (filterState.onlyNew) count++;
    if (filterState.onlyDiscount) count++;
    if (filterState.minRating > 0) count++;
    return count;
  }, [selectedCategory, filterState]);

  const handleResetAll = () => {
    if (externalOnResetFilters) {
      externalOnResetFilters();
    } else {
      onSelectCategory('all');
      setFilterState(() => ({
        minPrice: 0,
        maxPrice: 35000,
        selectedSizes: [],
        selectedMaterials: [],
        onlyInStock: false,
        onlyNew: false,
        onlyDiscount: false,
        minRating: 0,
      }));
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
        // 1. Category match
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        
        // 2. Search query match
        const cleanSearch = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !cleanSearch ||
          (p.title || '').toLowerCase().includes(cleanSearch) ||
          (p.description || '').toLowerCase().includes(cleanSearch) ||
          (p.categoryLabel || '').toLowerCase().includes(cleanSearch) ||
          (p.material || '').toLowerCase().includes(cleanSearch);

        // 3. Price match
        const matchesPrice = p.price >= filterState.minPrice && p.price <= filterState.maxPrice;

        // 4. Material match
        const matchesMaterial = matchesMaterialFilter(p.material, filterState.selectedMaterials);

        // 5. Size Availability match
        const matchesSize =
          filterState.selectedSizes.length === 0 ||
          filterState.selectedSizes.some((sz) => isProductAvailableInSize(p, sz));

        // 6. In-Stock Availability match
        const matchesInStock = !filterState.onlyInStock || isProductInStock(p);

        // 7. Badges and Ratings
        const matchesNew = !filterState.onlyNew || p.isNew;
        const matchesDiscount = !filterState.onlyDiscount || (p.originalPrice && p.originalPrice > p.price);
        const matchesRating = p.rating >= filterState.minRating;

        return (
          matchesCategory &&
          matchesQuery &&
          matchesPrice &&
          matchesMaterial &&
          matchesSize &&
          matchesInStock &&
          matchesNew &&
          matchesDiscount &&
          matchesRating
        );
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        if (sortBy === 'newest') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
        return (b.rating || 0) - (a.rating || 0); // popular
      });
  }, [
    products,
    selectedCategory,
    searchQuery,
    filterState,
    sortBy,
  ]);

  return (
    <div className="space-y-4 pb-32 animate-in fade-in duration-300">
      {/* 1. Search Bar & Master Filter Button with Unified Neumorphic Geometry */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <AutocompleteSearch
            products={products}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectProduct={onSelectProduct}
            onSelectCategory={onSelectCategory}
            placeholder="Поиск по товарам, материалам..."
          />
        </div>

        {/* Master Filter Button */}
        <button
          onClick={handleOpenFilterModal}
          className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer bg-[#E3E8EF] ${
            activeFiltersCount > 0
              ? 'neu-pill-active font-bold'
              : 'neu-button text-[#2D3A4E] hover:text-accent'
          }`}
          title="Параметры фильтрации"
          aria-label="Фильтры"
        >
          <SlidersHorizontal className="w-5 h-5 stroke-[2]" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-accent text-white font-black text-[11px] w-5 h-5 rounded-full flex items-center justify-center shadow-[var(--neu-fill-accent-shadow)] ring-2 ring-[#E3E8EF]">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. Category Carousel with Neumorphic Hierarchy */}
      <div className="relative -mx-4 px-4">
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-2 scroll-smooth">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const getCategoryIcon = (id: string) => {
              switch (id) {
                case 'shirts':
                  return ShirtIcon;
                case 'tshirts':
                  return TShirtIcon;
                case 'jackets':
                  return JacketIcon;
                case 'trousers':
                  return PantsIcon;
                case 'sweatshirts':
                  return SweatshirtIcon;
                default:
                  return Sparkles;
              }
            };
            const IconComp = getCategoryIcon(cat.id);

            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`relative px-4 py-2.5 rounded-2xl text-[13px] transition-all whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer select-none bg-[#E3E8EF] ${
                  isSelected
                    ? 'neu-pill-active font-bold'
                    : 'neu-button font-semibold text-[#2D3A4E] hover:text-accent active:scale-95'
                }`}
              >
                <IconComp
                  className={`w-4 h-4 ${
                    isSelected ? 'stroke-[2.2] text-accent' : 'stroke-[1.8] text-[#4E5C70]'
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
            <span className="neu-inset text-[11px] font-bold text-accent px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-[#E3E8EF] border border-accent/30">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              Только в наличии
              <button
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, onlyInStock: false }))
                }
                className="text-[#4E5C70] hover:text-danger cursor-pointer transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </button>
            </span>
          )}

          {(filterState.minPrice > 0 || filterState.maxPrice < 35000) && (
            <span className="neu-inset text-[11px] font-bold text-[#2D3A4E] px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-[#E3E8EF] border border-accent/30">
              Цена: {filterState.minPrice > 0 ? `от ${filterState.minPrice.toLocaleString('ru-RU')} ` : ''}до {filterState.maxPrice.toLocaleString('ru-RU')} ₽
              <button
                onClick={() =>
                  setFilterState((prev) => ({
                    ...prev,
                    minPrice: 0,
                    maxPrice: 35000,
                  }))
                }
                className="text-[#4E5C70] hover:text-danger cursor-pointer transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </button>
            </span>
          )}

          {filterState.selectedMaterials.map((matId) => {
            const matObj = MATERIAL_CATEGORIES.find((m) => m.id === matId);
            return (
              <span
                key={matId}
                className="neu-inset text-[11px] font-bold text-[#2D3A4E] px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-[#E3E8EF] border border-accent/30"
              >
                Ткань: {matObj ? matObj.name : matId}
                <button
                  onClick={() =>
                    setFilterState((prev) => ({
                      ...prev,
                      selectedMaterials: prev.selectedMaterials.filter((m) => m !== matId),
                    }))
                  }
                  className="text-[#4E5C70] hover:text-danger cursor-pointer transition-colors"
                  aria-label="Закрыть"
                >
                  <X className="w-3 h-3 stroke-[2.5]" />
                </button>
              </span>
            );
          })}

          {filterState.selectedSizes.map((sz) => (
            <span
              key={sz}
              className="neu-inset text-[11px] font-bold text-[#2D3A4E] px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-[#E3E8EF] border border-accent/30"
            >
              Размер: {sz}
              <button
                onClick={() =>
                  setFilterState((prev) => ({
                    ...prev,
                    selectedSizes: prev.selectedSizes.filter((s) => s !== sz),
                  }))
                }
                className="text-[#4E5C70] hover:text-danger cursor-pointer transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </button>
            </span>
          ))}

          {filterState.onlyNew && (
            <span className="neu-inset text-[11px] font-bold text-[#2D3A4E] px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-[#E3E8EF] border border-accent/30">
              Только новинки
              <button
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, onlyNew: false }))
                }
                className="text-[#4E5C70] hover:text-danger cursor-pointer transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </button>
            </span>
          )}

          {filterState.onlyDiscount && (
            <span className="neu-inset text-[11px] font-bold text-[#2D3A4E] px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-[#E3E8EF] border border-accent/30">
              Со скидкой
              <button
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, onlyDiscount: false }))
                }
                className="text-[#4E5C70] hover:text-danger cursor-pointer transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </button>
            </span>
          )}

          <button
            onClick={handleResetAll}
            className="text-xs font-bold text-danger hover:text-danger flex items-center gap-1.5 ml-auto cursor-pointer active:scale-95 transition-transform py-1 px-2.5 rounded-xl hover:neu-inset"
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Сбросить все</span>
          </button>
        </div>
      )}

      {/* 5. Sorting & Product Count Bar with Precise Hierarchy */}
      <div className="flex items-center justify-between min-h-[42px] px-1">
        <span className="text-xs font-semibold text-[#4E5C70]">
          Найдено:{' '}
          <span className="text-[#2D3A4E] font-black text-sm">{filteredProducts.length}</span>{' '}
          {filteredProducts.length % 10 === 1 && filteredProducts.length % 100 !== 11
            ? 'товар'
            : [2, 3, 4].includes(filteredProducts.length % 10) &&
              ![12, 13, 14].includes(filteredProducts.length % 100)
            ? 'товара'
            : 'товаров'}
        </span>

        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className={`rounded-2xl px-4 py-2 flex items-center gap-2 text-[#2D3A4E] font-bold text-xs active:scale-95 transition-all cursor-pointer bg-[#E3E8EF] ${
              showSortMenu
                ? 'neu-inset text-accent border border-accent/40'
                : 'neu-button hover:text-accent'
            }`}
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
            <div className="absolute right-0 mt-2 w-48 bg-[#E3E8EF] rounded-2xl p-1.5 z-30 neu-dropdown border border-white/80 space-y-1">
              <button
                onClick={() => {
                  setSortBy('popular');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer ${
                  sortBy === 'popular'
                    ? 'neu-pill-active font-bold'
                    : 'text-[#2D3A4E] font-semibold hover:bg-white/60'
                }`}
              >
                По популярности
              </button>
              <button
                onClick={() => {
                  setSortBy('price-asc');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer ${
                  sortBy === 'price-asc'
                    ? 'neu-pill-active font-bold'
                    : 'text-[#2D3A4E] font-semibold hover:bg-white/60'
                }`}
              >
                Сначала дешевле
              </button>
              <button
                onClick={() => {
                  setSortBy('price-desc');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer ${
                  sortBy === 'price-desc'
                    ? 'neu-pill-active font-bold'
                    : 'text-[#2D3A4E] font-semibold hover:bg-white/60'
                }`}
              >
                Сначала дороже
              </button>
              <button
                onClick={() => {
                  setSortBy('newest');
                  setShowSortMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer ${
                  sortBy === 'newest'
                    ? 'neu-pill-active font-bold'
                    : 'text-[#2D3A4E] font-semibold hover:bg-white/60'
                }`}
              >
                Сначала новинки
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6. Product Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${selectedCategory}-${sortBy}-${filterState.minPrice}-${filterState.maxPrice}-${filterState.selectedSizes.join('-')}-${filterState.selectedMaterials.join('-')}-${filterState.onlyInStock}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {filteredProducts.length === 0 ? (
            <div className="neu-inset rounded-3xl p-8 text-center space-y-3 bg-[#E3E8EF] border border-white/60">
              <div className="w-12 h-12 rounded-2xl neu-button mx-auto flex items-center justify-center text-accent bg-[#E3E8EF]">
                <SlidersHorizontal className="w-6 h-6 stroke-[1.8]" />
              </div>
              <p className="text-sm font-bold text-[#2D3A4E]">Товары по выбранным параметрам не найдены</p>
              <p className="text-xs text-[#4E5C70] max-w-sm mx-auto">
                Попробуйте расширить диапазон цен, выбрать другие размеры, ткани или сбросить фильтры наличия.
              </p>
              <button
                onClick={handleResetAll}
                className="mt-2 neu-button rounded-2xl px-5 py-2.5 text-xs font-black text-accent hover:text-[#2D3A4E] active:scale-95 transition-transform cursor-pointer inline-flex items-center gap-2 bg-[#E3E8EF]"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                <span>Сбросить все фильтры</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4 p-1 -m-1">
              {filteredProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  priority={index < 4}
                  isFavorite={favorites.includes(product.id)}
                  isInCart={cartItemIds.includes(product.id)}
                  onSelect={onSelectProduct}
                  onToggleFavorite={onToggleFavorite}
                  onAddToCart={onAddToCart}
                  onQuickView={(prod) => setQuickViewProduct(prod)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 7. Quick View Modal */}
      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        isFavorite={quickViewProduct ? favorites.includes(quickViewProduct.id) : false}
        isInCart={quickViewProduct ? cartItemIds.includes(quickViewProduct.id) : false}
        userProfile={userProfile}
        onSaveMeasurements={onSaveMeasurements}
        onClose={() => setQuickViewProduct(null)}
        onSelectFullProduct={(prod) => {
          setQuickViewProduct(null);
          onSelectProduct(prod);
        }}
        onToggleFavorite={onToggleFavorite}
        onAddToCartWithOptions={(prod, color, size, qty) => {
          if (onAddToCartWithOptions) {
            onAddToCartWithOptions(prod, color, size, qty);
          } else {
            onAddToCart(prod, null as any);
          }
        }}
      />
    </div>
  );
};
