import React, { useState, useEffect } from 'react';
import { LazyMount } from '../components/LazyMount';
import { QuickViewModal } from '../components/lazyWindows';
import { ChevronRight, SlidersHorizontal, Menu, Truck, RotateCcw, AlertCircle, Pause, Play } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Product, ActiveTab, BannerSlide, StorefrontSettings, UserProfile, BodyMeasurements } from '../types';
import { getStoreContacts, getStoreName } from '../utils/storeContacts';
import { ProductCard } from '../components/ProductCard';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { NeumorphicImage } from '../components/NeumorphicImage';
import { NotConfigured } from '../components/NotConfigured';
import { categoryIcon, getCategories } from '../utils/categories';
import { formatDays } from '../utils/pluralize';
import { PRODUCTS_PAGE_SIZE } from '../utils/productListing';
import { CatalogLoadState, type CatalogStatus } from '../components/CatalogLoadState';

interface HomeScreenProps {
  /** Catalog subscription: placeholders while loading, a message on error; «не настроено» only when ready */
  catalogStatus?: CatalogStatus;
  /** Search shared with the catalog (App): the text typed here is the catalog's query */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  products: Product[];
  favorites: string[];
  recentlyViewed?: Product[];
  onClearRecentlyViewed?: () => void;
  onRemoveFromRecentlyViewed?: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  /** false — nothing added yet (the customer is asked for a size) */
  onAddToCart: (product: Product, e: React.MouseEvent) => boolean | void;
  setActiveTab: (tab: ActiveTab) => void;
  onSelectCategory: (category: string) => void;
  onOpenDrawer?: () => void;
  bannerSlides?: BannerSlide[];
  storefrontSettings?: StorefrontSettings;
  onApplyPromo?: (code: string) => boolean;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  userProfile?: UserProfile;
  onOpenFilters?: () => void;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  onAddToCartWithOptions?: (product: Product, color: string, size: string, quantity: number) => boolean | void;
  /** Admin → «Витрина» → «Предзаказ» (quick view shows sold-out sizes as orderable) */
  preorderMode?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  catalogStatus = 'ready',
  products,
  favorites,
  recentlyViewed = [],
  onClearRecentlyViewed,
  onRemoveFromRecentlyViewed,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  setActiveTab,
  onSelectCategory,
  onOpenDrawer,
  bannerSlides = [],
  storefrontSettings,
  onApplyPromo,
  onShowToast,
  userProfile,
  onOpenFilters,
  onSaveMeasurements,
  onAddToCartWithOptions,
  preorderMode = false,
  searchQuery: externalSearchQuery,
  onSearchChange: externalOnSearchChange,
}) => {
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery ?? localSearchQuery;
  const setSearchQuery = externalOnSearchChange ?? setLocalSearchQuery;
  const [activeBannerSlide, setActiveBannerSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Popular items with graceful fallback; the home page shows 8 of them, the rest are behind «Смотреть все»
  const popularFiltered = products.filter((p) => p.isPopular);
  const popularProducts = (popularFiltered.length > 0 ? popularFiltered : products).slice(0, PRODUCTS_PAGE_SIZE);

  // Filter active slides with real-time schedule checks
  const isSlideScheduledAndActive = (slide: BannerSlide) => {
    if (!slide.active) return false;
    if (!slide.scheduleEnabled) return true;
    const now = Date.now();
    if (slide.startDate) {
      const start = new Date(slide.startDate).getTime();
      if (!isNaN(start) && now < start) return false;
    }
    if (slide.endDate) {
      const end = new Date(slide.endDate).getTime();
      if (!isNaN(end) && now > end) return false;
    }
    return true;
  };

  const activeSlides = bannerSlides.filter(isSlideScheduledAndActive);
  // Only banners from Admin → «Баннеры»; without any the hero block is not shown
  const displaySlides = activeSlides;

  // Auto-play (WCAG 2.2.2): stops while the pointer, focus or a finger is on the banner, with the pause button
  // and with «reduce motion» in the system; the timer restarts after every slide change, manual ones too
  const reduceMotion = useReducedMotion();
  const [isBannerPaused, setIsBannerPaused] = useState(false);
  const [isBannerHeld, setIsBannerHeld] = useState(false);
  const autoPlay = displaySlides.length > 1 && !reduceMotion;
  useEffect(() => {
    if (!autoPlay || isBannerPaused || isBannerHeld) return;
    const timer = setTimeout(() => {
      setActiveBannerSlide((prev) => (prev + 1) % displaySlides.length);
    }, 4500);
    return () => clearTimeout(timer);
  }, [autoPlay, isBannerPaused, isBannerHeld, activeBannerSlide, displaySlides.length]);

  // Keep active index in bounds
  useEffect(() => {
    if (activeBannerSlide >= displaySlides.length) {
      setActiveBannerSlide(0);
    }
  }, [displaySlides.length, activeBannerSlide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsBannerHeld(true);
    if (e.touches && e.touches[0]) {
      setTouchStartX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsBannerHeld(false);
    if (touchStartX === null) return;
    if (e.changedTouches && e.changedTouches[0]) {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 35 && displaySlides.length > 0) {
        if (diff > 0) {
          setActiveBannerSlide((prev) => (prev + 1) % displaySlides.length);
        } else {
          setActiveBannerSlide((prev) => (prev - 1 + displaySlides.length) % displaySlides.length);
        }
      }
    }
    setTouchStartX(null);
  };

  const handleBannerClick = (slide: BannerSlide) => {
    // 1. Deeplink to specific product
    if (slide.actionType === 'product' && slide.targetProductId) {
      const targetProd = products.find((p) => p.id === slide.targetProductId);
      if (targetProd) {
        onSelectProduct(targetProd);
        if (onShowToast) onShowToast(`Открыт товар: ${targetProd.title}`, 'info');
        return;
      }
    }

    // 2. Deeplink to auto-apply Promo Code
    if (slide.actionType === 'promo' && slide.targetPromoCode) {
      if (onApplyPromo) {
        onApplyPromo(slide.targetPromoCode);
      }
      setActiveTab('cart');
      return;
    }

    // 3. Deeplink to Category
    if ((slide.actionType === 'category' || !slide.actionType) && slide.targetCategory) {
      onSelectCategory(slide.targetCategory);
      setActiveTab('catalog');
      return;
    }

    // 4. Fallback: Entire catalog
    onSelectCategory('all');
    setActiveTab('catalog');
  };

  // Categories from Admin → «Категории»
  const categories = getCategories(storefrontSettings);

  const currentSlide = displaySlides[activeBannerSlide] || displaySlides[0];

  // Settings values with defaults
  const isOnline = storefrontSettings?.isStoreOnline !== false;
  // Only conditions the store set in «Витрина»: no invented «от 5 000 ₽» or «14 дней»
  const freeShippingLimit = storefrontSettings?.freeDeliveryThreshold ?? 0;
  const returnPeriod = storefrontSettings?.returnPeriodDays ?? 0;
  // Demo template contacts are never shown to customers (see storeContacts.ts)
  const { phone } = getStoreContacts(storefrontSettings);

  return (
    <div className="space-y-5 pb-36 lg:pb-10 animate-in fade-in duration-300">
      {/* The home screen has no title bar: the page heading is for screen readers only */}
      <h1 className="sr-only">{getStoreName(storefrontSettings)}</h1>
      {/* 1. Maintenance / Concierge Banner (if store is offline) */}
      {!isOnline && (
        <div className="neu-flat rounded-2xl p-3.5 border border-warning/30 flex items-center gap-3 text-warning animate-in fade-in">
          <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-warning shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="text-xs space-y-0.5">
            <span className="font-extrabold block text-[#2D3A4E]">
              Каталог в режиме закрытого шоурума
            </span>
            <p className="text-xs text-[#4E5C70]">
              Онлайн-корзина временно на обновлении. Для резервирования моделей свяжитесь с
              консьержем{phone ? (
                <>
                  : <strong className="text-accent">{phone}</strong>
                </>
              ) : (
                ' в чате поддержки'
              )}.
            </p>
          </div>
        </div>
      )}

      {/* Search Bar Row with Menu Button on Left (on a computer both are in the top bar) */}
      <div className="flex items-center gap-2.5 pt-1 px-0.5 lg:hidden">
        {onOpenDrawer && (
          <button
            type="button"
            onClick={onOpenDrawer}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent shrink-0 transition-all cursor-pointer"
            aria-label="Открыть меню"
            title="Меню"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>
        )}
        <div className="flex-1">
          <AutocompleteSearch
            categories={categories}
            products={products}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectProduct={onSelectProduct}
            onSelectCategory={(catId) => {
              onSelectCategory(catId);
              setActiveTab('catalog');
            }}
            onSearchSubmit={() => {
              setActiveTab('catalog');
            }}
            placeholder="Поиск по товарам"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (onOpenFilters) {
              onOpenFilters();
            } else {
              setActiveTab('catalog');
            }
          }}
          className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent shrink-0 transition-all cursor-pointer"
          title="Фильтры"
          aria-label="Фильтры"
        >
          <SlidersHorizontal className="w-5 h-5 stroke-[1.8]" />
        </button>
      </div>

      {/* 5. Hero Collection Banner */}
      {currentSlide && (
      <section
        aria-roledescription="карусель"
        aria-label="Баннеры"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setIsBannerHeld(true)}
        onMouseLeave={() => setIsBannerHeld(false)}
        onFocus={() => setIsBannerHeld(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsBannerHeld(false);
        }}
        className="relative neu-inset rounded-3xl p-5 overflow-hidden select-none group/banner border border-transparent"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide.id || activeBannerSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 flex items-center justify-between gap-3 min-h-[170px] lg:min-h-[280px] lg:px-4"
          >
            {/* Left Text content */}
            <div className="flex-1 space-y-2 max-w-[52%] lg:space-y-3">
              {currentSlide.badge && (
                <span className="text-[11px] font-extrabold neu-flat-sm px-2.5 py-0.5 rounded-full text-accent uppercase tracking-wider inline-block">
                  {currentSlide.badge}
                </span>
              )}
              <h2 className="text-[22px] sm:text-[24px] lg:text-[36px] font-extrabold text-[#2D3A4E] leading-tight">
                {/* The title is the banner's link: its ::after stretches over the slide (like a product card) */}
                <button
                  type="button"
                  onClick={() => handleBannerClick(currentSlide)}
                  className="text-left cursor-pointer after:absolute after:inset-0 after:content-['']"
                >
                  {currentSlide.title}
                </button>
              </h2>
              <p className="text-[12px] sm:text-[13px] lg:text-base text-[#4E5C70] font-normal leading-relaxed line-clamp-2">
                {currentSlide.subtitle}
              </p>
            </div>

            {/* Right Hero Image */}
            <div className="w-40 h-44 lg:w-[400px] lg:h-[260px] shrink-0">
              <NeumorphicImage
                src={currentSlide.image}
                alt={currentSlide.title}
                priority={true}
                containerClassName="w-40 h-44 lg:w-[400px] lg:h-[260px] rounded-2xl"
                className="w-full h-full object-cover object-top rounded-xl"
              />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Carousel Pagination Dots */}
        {displaySlides.length > 1 && (
          <div className="flex items-center justify-center gap-0.5 mt-2.5 relative z-20">
            {autoPlay && (
              <button
                type="button"
                onClick={() => setIsBannerPaused((v) => !v)}
                className="h-6 w-6 mr-1 flex items-center justify-center rounded-full text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label={isBannerPaused ? 'Запустить прокрутку баннеров' : 'Остановить прокрутку баннеров'}
              >
                {isBannerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
            )}
            {displaySlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveBannerSlide(idx);
                }}
                // 24 px hit area around the small dot (WCAG 2.5.8)
                className="h-6 min-w-6 px-1 flex items-center justify-center cursor-pointer"
                aria-label={`Слайд ${idx + 1}`}
                aria-current={activeBannerSlide === idx}
              >
                <span
                  className={`block transition-all duration-300 rounded-full ${
                    activeBannerSlide === idx ? 'w-6 h-2 bg-[#2D3A4E]' : 'w-2 h-2 neu-inset'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </section>
      )}

      {/* 6. Quick Category Icons Row */}
      {/* «не настроено» only once the store has answered; while loading the catalog placeholders say enough */}
      {categories.length === 0 && catalogStatus === 'ready' && <NotConfigured title="Категории" />}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 py-1">
        {categories
          .slice(0, 8)
          .map((cat, index) => {
            const IconComp = categoryIcon(cat);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  onSelectCategory(cat.id);
                  setActiveTab('catalog');
                }}
                className={`${index >= 4 ? 'hidden lg:flex' : 'flex'} flex-col items-center gap-2 group cursor-pointer bg-transparent border-0 p-0 select-none`}
              >
                <span className="w-14 h-14 rounded-2xl neu-button flex items-center justify-center text-[#2D3A4E] group-hover:text-accent transition-colors duration-150">
                  <IconComp className="w-6 h-6 stroke-[1.8]" aria-hidden="true" />
                </span>
                <span className="text-[13px] font-medium text-[#2D3A4E] group-hover:text-accent truncate max-w-full">
                  {cat.name}
                </span>
              </button>
            );
          })}
      </div>

      {/* 7. Live Storefront Service & Trust Badges: each tile only when its value is set */}
      {(freeShippingLimit > 0 || returnPeriod > 0) && (
      <div className={`grid gap-2.5 py-1 ${freeShippingLimit > 0 && returnPeriod > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {freeShippingLimit > 0 && (
        <div className="neu-inset rounded-2xl p-3 text-center space-y-1">
          <div className="w-7 h-7 mx-auto rounded-xl neu-flat-sm flex items-center justify-center text-accent">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-extrabold text-[#2D3A4E] block">
            {`Бесплатно от ${freeShippingLimit.toLocaleString('ru-RU')} ₽`}
          </span>
          <span className="text-[11px] text-[#4E5C70] block">Условия при оформлении</span>
        </div>
        )}

        {returnPeriod > 0 && (
        <div className="neu-inset rounded-2xl p-3 text-center space-y-1">
          <div className="w-7 h-7 mx-auto rounded-xl neu-flat-sm flex items-center justify-center text-accent">
            <RotateCcw className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-extrabold text-[#2D3A4E] block">
            {formatDays(returnPeriod)} на возврат
          </span>
          <span className="text-[11px] text-[#4E5C70] block">Условия в FAQ</span>
        </div>
        )}
      </div>
      )}

      {/* 8. Popular Section: 2-column grid as in the catalog */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#2D3A4E] tracking-tight">Популярное</h2>
          {popularProducts.length > 0 && (
            <button
              onClick={() => setActiveTab('catalog')}
              className="neu-button rounded-xl px-3 py-1.5 text-[12px] font-bold text-accent hover:text-accent-strong flex items-center gap-1 transition-all"
            >
              <span>Смотреть все</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {catalogStatus !== 'ready' ? (
          <CatalogLoadState status={catalogStatus} />
        ) : popularProducts.length === 0 && (
          <NotConfigured title="Каталог" hint="Товары появятся здесь, когда магазин их добавит." />
        )}

        {popularProducts.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5 p-1 -m-1">
            {popularProducts.map((product, index) => (
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
        )}
      </div>

      {/* Recently Viewed Block */}
      {recentlyViewed && recentlyViewed.length > 0 && (
        <RecentlyViewed
          recentlyViewed={recentlyViewed}
          onSelectProduct={onSelectProduct}
          onToggleFavorite={onToggleFavorite}
          onClearRecentlyViewed={onClearRecentlyViewed}
          onRemoveFromRecentlyViewed={onRemoveFromRecentlyViewed}
          favorites={favorites}
        />
      )}

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
        onAddToCartWithOptions={(prod, color, size, qty) =>
          onAddToCartWithOptions ? onAddToCartWithOptions(prod, color, size, qty) : onAddToCart(prod, null as any)
        }
        preorderMode={preorderMode}
      />
      </LazyMount>
    </div>
  );
};
