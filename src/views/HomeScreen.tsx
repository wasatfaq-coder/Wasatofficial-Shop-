import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  Menu,
  Phone,
  MessageCircle,
  Send,
  MapPin,
  Clock,
  Truck,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  Tag,
  Gift,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, ActiveTab, BannerSlide, StorefrontSettings, UserProfile } from '../types';
import { CATEGORIES } from '../data/products';
import { INITIAL_BANNER_SLIDES } from '../data/marketingAndSupport';
import { ProductCard } from '../components/ProductCard';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { NeumorphicImage } from '../components/NeumorphicImage';
import {
  ShirtIcon,
  TShirtIcon,
  JacketIcon,
  PantsIcon,
  SweatshirtIcon,
} from '../components/CategoryIcons';

interface HomeScreenProps {
  products: Product[];
  favorites: string[];
  cartItemIds: string[];
  recentlyViewed?: Product[];
  onClearRecentlyViewed?: () => void;
  onRemoveFromRecentlyViewed?: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  setActiveTab: (tab: ActiveTab) => void;
  onSelectCategory: (category: string) => void;
  onOpenDrawer?: () => void;
  bannerSlides?: BannerSlide[];
  storefrontSettings?: StorefrontSettings;
  onOpenSupportChat?: () => void;
  onApplyPromo?: (code: string) => boolean;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  userProfile?: UserProfile;
  onOpenMySizes?: () => void;
  onOpenFilters?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  products,
  favorites,
  cartItemIds,
  recentlyViewed = [],
  onClearRecentlyViewed,
  onRemoveFromRecentlyViewed,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  setActiveTab,
  onSelectCategory,
  onOpenDrawer,
  bannerSlides = INITIAL_BANNER_SLIDES,
  storefrontSettings,
  onOpenSupportChat,
  onApplyPromo,
  onShowToast,
  userProfile,
  onOpenMySizes,
  onOpenFilters,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBannerSlide, setActiveBannerSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Popular items with graceful fallback
  const popularFiltered = products.filter((p) => p.isPopular);
  const popularProducts = popularFiltered.length > 0 ? popularFiltered : products.slice(0, 6);

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
  const displaySlides = activeSlides.length > 0 ? activeSlides : INITIAL_BANNER_SLIDES;

  // Auto-play slider effect
  useEffect(() => {
    if (displaySlides.length <= 1) return;
    const timer = setInterval(() => {
      setActiveBannerSlide((prev) => (prev + 1) % displaySlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [displaySlides.length]);

  // Keep active index in bounds
  useEffect(() => {
    if (activeBannerSlide >= displaySlides.length) {
      setActiveBannerSlide(0);
    }
  }, [displaySlides.length, activeBannerSlide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      setTouchStartX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
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

  const currentSlide = displaySlides[activeBannerSlide] || displaySlides[0];

  // Settings values with defaults
  const storeName = storefrontSettings?.storeName || 'MANSTYLE';
  const storeSlogan = storefrontSettings?.storeSlogan || 'Бутик мужской одежды & аксессуаров';
  const isOnline = storefrontSettings?.isStoreOnline !== false;
  const isExpress = storefrontSettings?.isExpressEnabled !== false;
  const freeShippingLimit = storefrontSettings?.freeDeliveryThreshold ?? 5000;
  const returnPeriod = storefrontSettings?.returnPeriodDays ?? 14;
  const phone = storefrontSettings?.phone || '+7 (495) 123-45-67';
  const email = storefrontSettings?.email || 'concierge@manstyle.ru';
  const telegram = storefrontSettings?.telegram || '@manstyle_official';
  const whatsapp = storefrontSettings?.whatsapp || '+7 (999) 000-00-00';
  const pickupAddress =
    storefrontSettings?.pickupAddress ||
    'Москва, Пресненская наб. 12, Башня Федерация Восток, 2 этаж';
  const workingHours = storefrontSettings?.workingHours || 'Ежедневно с 10:00 до 22:00';

  return (
    <div className="space-y-5 pb-36 animate-in fade-in duration-300">
      {/* 1. Maintenance / Concierge Banner (if store is offline) */}
      {!isOnline && (
        <div className="neu-flat rounded-2xl p-3.5 bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-900 animate-in fade-in">
          <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-amber-600 shrink-0 bg-[#E3E8EF]">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="text-xs space-y-0.5">
            <span className="font-black block text-[#2D3A4E]">
              Каталог в режиме закрытого шоурума
            </span>
            <p className="text-[11px] text-[#5C6B80]">
              Онлайн-корзина временно на обновлении. Для резервирования моделей свяжитесь с
              консьержем: <strong className="text-[#5F6ED0]">{phone}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Search Bar Row with Menu Button on Left */}
      <div className="flex items-center gap-2.5 pt-1 px-0.5">
        {onOpenDrawer && (
          <button
            type="button"
            onClick={onOpenDrawer}
            className="w-11 h-11 rounded-full neu-inset flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] shrink-0 active:scale-95 transition-all cursor-pointer bg-[#E3E8EF]"
            aria-label="Открыть меню"
            title="Меню"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>
        )}
        <div className="flex-1">
          <AutocompleteSearch
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
          className="w-11 h-11 rounded-full neu-inset flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] shrink-0 active:scale-95 transition-all cursor-pointer bg-[#E3E8EF]"
          title="Расширенная фильтрация"
          aria-label="Расширенная фильтрация"
        >
          <SlidersHorizontal className="w-5 h-5 stroke-[1.8]" />
        </button>
      </div>

      {/* 5. Hero Collection Banner */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative neu-inset rounded-3xl p-5 overflow-hidden select-none group/banner cursor-pointer bg-[#E3E8EF] border border-transparent"
        onClick={() => handleBannerClick(currentSlide)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide.id || activeBannerSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 flex items-center justify-between gap-3 min-h-[170px]"
          >
            {/* Left Text content */}
            <div className="flex-1 space-y-2 max-w-[52%]">
              {currentSlide.badge && (
                <span className="text-[10px] font-black neu-button px-2.5 py-0.5 rounded-full text-[#5F6ED0] uppercase tracking-wider inline-block bg-[#E3E8EF]">
                  {currentSlide.badge}
                </span>
              )}
              <h2 className="text-[22px] sm:text-[24px] font-extrabold text-[#2D3A4E] leading-tight">
                {currentSlide.title}
              </h2>
              <p className="text-[12px] sm:text-[13px] text-[#6B7280] font-normal leading-relaxed line-clamp-2">
                {currentSlide.subtitle}
              </p>
            </div>

            {/* Right Hero Image */}
            <div className="w-40 h-44 shrink-0">
              <NeumorphicImage
                src={currentSlide.image}
                alt={currentSlide.title}
                priority={true}
                containerClassName="w-40 h-44 rounded-2xl"
                className="w-full h-full object-cover object-top rounded-xl"
              />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Carousel Pagination Dots */}
        {displaySlides.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 relative z-20">
            {displaySlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveBannerSlide(idx);
                }}
                className={`transition-all duration-300 cursor-pointer ${
                  activeBannerSlide === idx
                    ? 'w-6 h-2 bg-[#2D3A4E] rounded-full'
                    : 'w-2 h-2 neu-inset rounded-full'
                }`}
                aria-label={`Слайд ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 6. Quick Category Icons Row */}
      <div className="grid grid-cols-4 gap-3 py-1">
        {CATEGORIES.filter((c) => c.id !== 'all')
          .slice(0, 4)
          .map((cat) => {
            const IconComp = getCategoryIcon(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => {
                  onSelectCategory(cat.id);
                  setActiveTab('catalog');
                }}
                className="flex flex-col items-center gap-2 group focus:outline-none cursor-pointer bg-transparent border-0 p-0 select-none"
              >
                <div className="w-14 h-14 rounded-2xl neu-inset flex items-center justify-center text-[#2D3A4E] group-hover:text-[#5F6ED0] group-hover:scale-105 group-active:scale-95 transition-all duration-150 cursor-pointer bg-[#E3E8EF]">
                  <IconComp className="w-6 h-6 stroke-[1.8]" />
                </div>
                <span className="text-[13px] font-medium text-[#2D3A4E] group-hover:text-[#5F6ED0] truncate max-w-full">
                  {cat.name}
                </span>
              </button>
            );
          })}
      </div>

      {/* 7. Live Storefront Service & Trust Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
        <div className="neu-inset rounded-2xl p-3 text-center space-y-1 bg-[#E3E8EF]">
          <div className="w-7 h-7 mx-auto rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF]">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-extrabold text-[#2D3A4E] block">
            {freeShippingLimit > 0
              ? `Бесплатно от ${freeShippingLimit.toLocaleString('ru-RU')} ₽`
              : 'Бесплатная доставка'}
          </span>
          <span className="text-[10px] text-[#5C6B80] block">
            {isExpress ? 'Экспресс 2ч или СДЭК' : 'Курьер и ПВЗ'}
          </span>
        </div>

        <div className="neu-inset rounded-2xl p-3 text-center space-y-1 bg-[#E3E8EF]">
          <div className="w-7 h-7 mx-auto rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF]">
            <RotateCcw className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-extrabold text-[#2D3A4E] block">
            {returnPeriod} дней на возврат
          </span>
          <span className="text-[10px] text-[#5C6B80] block">Примерка перед оплатой</span>
        </div>

        <div className="neu-inset rounded-2xl p-3 text-center space-y-1 bg-[#E3E8EF]">
          <div className="w-7 h-7 mx-auto rounded-xl neu-button flex items-center justify-center text-emerald-600 bg-[#E3E8EF]">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-extrabold text-[#2D3A4E] block">100% Оригинал</span>
          <span className="text-[10px] text-[#5C6B80] block">Итальянские ткани</span>
        </div>

        <div className="neu-inset rounded-2xl p-3 text-center space-y-1 bg-[#E3E8EF]">
          <div className="w-7 h-7 mx-auto rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-extrabold text-[#2D3A4E] block">Консьерж-сервис</span>
          <span className="text-[10px] text-[#5C6B80] block">Помощь стилиста 24/7</span>
        </div>
      </div>

      {/* 8. Popular Section Header & Horizontal Scroll */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#2D3A4E] tracking-tight">Популярное</h2>
          <button
            onClick={() => setActiveTab('catalog')}
            className="neu-inset rounded-xl px-3 py-1.5 text-[12px] font-bold text-[#5F6ED0] hover:text-[#4F5DC0] flex items-center gap-1 transition-all active:scale-95 bg-[#E3E8EF]"
          >
            <span>Смотреть все</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Popular Products Horizontal Scroll Row */}
        <div className="flex overflow-x-auto no-scrollbar gap-3.5 pb-2 -mx-4 px-4 snap-x">
          {popularProducts.map((product, index) => (
            <div key={product.id} className="w-[165px] sm:w-[185px] shrink-0 snap-start">
              <ProductCard
                product={product}
                priority={index < 2}
                isFavorite={favorites.includes(product.id)}
                isInCart={cartItemIds.includes(product.id)}
                onSelect={onSelectProduct}
                onToggleFavorite={onToggleFavorite}
                onAddToCart={onAddToCart}
              />
            </div>
          ))}
        </div>
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
    </div>
  );
};
