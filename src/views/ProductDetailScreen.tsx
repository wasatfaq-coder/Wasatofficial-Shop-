import React, { useState, useEffect } from 'react';
import {
  Heart,
  Minus,
  Plus,
  ShoppingBag,
  Truck,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Check,
  FileText,
  ListFilter,
  Sparkles,
  ShieldCheck,
  Shirt,
  Ruler,
  X,
  Info,
  Package,
  AlertTriangle,
  QrCode,
  ZoomIn,
  CheckCircle2,
  Layers,
  Leaf,
  Maximize2,
} from 'lucide-react';
import { formatDays } from '../utils/pluralize';
import { Product, ProductReview, ActiveTab, UserProfile, BodyMeasurements, CartItem } from '../types';
import { SizeCalculatorModal } from '../components/SizeCalculatorModal';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { RatingBadge } from '../components/RatingBadge';
import { NeumorphicImage } from '../components/NeumorphicImage';
import { ProductImageZoomModal, ANGLE_LABELS } from '../components/ProductImageZoomModal';
import { QuickOrderModal } from '../components/QuickOrderModal';
import { AnimatedFavoriteButton } from '../components/AnimatedFavoriteButton';
import { ProductReviewsSection } from '../components/ProductReviewsSection';
import { getVariantStock, getProductSKU, getProductTotalStock } from '../utils/inventory';
import {
  getProductFabricComposition,
  getProductCareInstructions,
} from '../utils/productAttributes';

interface ProductDetailScreenProps {
  product: Product;
  isFavorite: boolean;
  cartCount: number;
  recentlyViewed?: Product[];
  onClearRecentlyViewed?: () => void;
  onRemoveFromRecentlyViewed?: (productId: string) => void;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCartWithOptions: (
    product: Product,
    color: string,
    size: string,
    quantity: number
  ) => void;
  onSelectProduct?: (product: Product) => void;
  onUpdateProduct?: (updatedProduct: Product) => void;
  setActiveTab: (tab: ActiveTab) => void;
  onCompleteOrder?: (orderData: {
    items: CartItem[];
    contact: { name: string; phone: string; email?: string };
    address: string;
    deliveryMethod: string;
    totalPrice: number;
  }) => void | Promise<boolean>;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Store policies from Admin → «Витрина» */
  returnPeriodDays?: number;
  freeDeliveryThreshold?: number;
}

export const ProductDetailScreen: React.FC<ProductDetailScreenProps> = ({
  product,
  isFavorite,
  cartCount,
  recentlyViewed = [],
  onClearRecentlyViewed,
  onRemoveFromRecentlyViewed,
  userProfile,
  onSaveMeasurements,
  onToggleFavorite,
  onAddToCartWithOptions,
  onSelectProduct,
  onUpdateProduct,
  setActiveTab,
  onCompleteOrder,
  onShowToast,
  returnPeriodDays = 14,
  freeDeliveryThreshold = 5000,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0]?.name || 'Бежевый');
  const [selectedSize, setSelectedSize] = useState(product?.sizes?.[0] || 'M');
  const [quantity, setQuantity] = useState(1);
  const [openAccordion, setOpenAccordion] = useState<'shipping' | 'returns' | 'fabric' | null>('fabric');
  const [detailTab, setDetailTab] = useState<'description' | 'specs' | 'care'>('specs');
  const [isSizeCalcOpen, setIsSizeCalcOpen] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const handleAddReview = (newReview: ProductReview) => {
    const existing = product.reviews || [];
    const updatedReviews = [newReview, ...existing];
    const newCount = (product.reviewsCount || existing.length) + 1;
    const totalRatingSum = updatedReviews.reduce((sum, r) => sum + r.rating, 0);
    const newAvgRating = parseFloat((totalRatingSum / updatedReviews.length).toFixed(1));

    const updatedProduct: Product = {
      ...product,
      rating: newAvgRating,
      reviewsCount: newCount,
      reviews: updatedReviews,
    };

    if (onUpdateProduct) {
      onUpdateProduct(updatedProduct);
    }
  };

  // Reset product state when a new product is loaded
  useEffect(() => {
    setSelectedImageIndex(0);
    setSelectedColor(product?.colors?.[0]?.name || 'Бежевый');
    setSelectedSize(product?.sizes?.[0] || 'M');
    setQuantity(1);
  }, [product?.id]);

  // Calculate current SKU variant stock
  const currentStock = getVariantStock(product, selectedColor, selectedSize);
  const currentSKU = getProductSKU(product, selectedColor, selectedSize);
  const totalStockAcrossAll = getProductTotalStock(product);

  // Ensure quantity does not exceed available variant stock
  useEffect(() => {
    if (currentStock > 0) {
      setQuantity((prev) => (prev > currentStock ? currentStock : prev));
    } else {
      setQuantity(1);
    }
  }, [selectedColor, selectedSize, currentStock]);

  const selectedColorObj = product?.colors?.find((c) => c.name === selectedColor) || product?.colors?.[0] || { name: 'Основной', hex: '#2D3A4E' };

  const handleNextImage = () => {
    if (!product?.images?.length) return;
    setSelectedImageIndex((prev) => (prev + 1) % product.images.length);
  };

  const handlePrevImage = () => {
    if (!product?.images?.length) return;
    setSelectedImageIndex((prev) => (prev - 1 + product.images.length) % product.images.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      setTouchStart(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    if (e.changedTouches && e.changedTouches[0]) {
      const touchEnd = e.changedTouches[0].clientX;
      const diff = touchStart - touchEnd;

      if (diff > 25) {
        handleNextImage();
      } else if (diff < -25) {
        handlePrevImage();
      }
    }
    setTouchStart(null);
  };

  const handleAddToCart = () => {
    onAddToCartWithOptions(product, selectedColor, selectedSize, quantity);
    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
    }, 1000);
  };

  const handleQuickOrderSuccess = async (details: { name: string; phone: string; address: string }) => {
    if (onCompleteOrder) {
      const quickItem: CartItem = {
        id: `cart-quick-${Date.now()}`,
        product,
        selectedColor,
        selectedSize,
        quantity,
      };
      const placed = await onCompleteOrder({
        items: [quickItem],
        contact: { name: details.name, phone: details.phone },
        address: details.address || 'Уточняется оператором',
        deliveryMethod: 'Экспресс курьер (1 клик)',
        totalPrice: product.price * quantity,
      });
      if (placed === false) return;
      if (onShowToast) {
        onShowToast(`Заказ успешно оформлен! Менеджер свяжется с вами по номеру ${details.phone}`, 'success');
      }
    } else {
      onAddToCartWithOptions(product, selectedColor, selectedSize, quantity);
    }
  };

  return (
    <div className="space-y-5 pb-28 animate-in fade-in duration-300">
      {/* Product Image Gallery with Large Showcase & Neumorphic Multi-angles */}
      <div className="neu-flat rounded-3xl p-3 sm:p-4 border border-white/60 space-y-3">
        {/* Main Large Photo Box - Neumorphic Well with 3:4 Aspect Ratio */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => setIsZoomModalOpen(true)}
          className="relative w-full aspect-[3/4] sm:aspect-[4/5] rounded-2xl overflow-hidden select-none group/detailimg neu-inset cursor-zoom-in"
        >
          <NeumorphicImage
            src={product?.images?.[selectedImageIndex] || product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
            alt={product?.title || ''}
            containerClassName="w-full h-full rounded-2xl"
            className="w-full h-full object-cover object-top rounded-xl transition-transform duration-300 group-hover/detailimg:scale-105"
          />

          {/* Badge in top-left */}
          {product.badge && (
            <div className="absolute top-3 left-3 z-10">
              <span className="h-6 px-3 rounded-full neu-photo-badge text-[11px] tracking-wider uppercase text-[#2D3A4E] font-bold inline-flex items-center justify-center leading-none">
                {product.badge}
              </span>
            </div>
          )}

          {/* Angle Tag Indicator & Counter in top-right */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            <span className="neu-photo-badge text-[#2D3A4E] text-[11px] font-extrabold px-2.5 py-1 rounded-full leading-none hidden sm:inline-block">
              {ANGLE_LABELS[selectedImageIndex % ANGLE_LABELS.length]}
            </span>
            <div className="neu-photo-badge text-[#2D3A4E] text-[11px] font-bold px-3 py-1 rounded-full leading-none">
              {selectedImageIndex + 1} / {product.images.length}
            </div>
          </div>

          {/* Bottom Zoom Lens Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomModalOpen(true);
            }}
            className="absolute bottom-3 right-3 neu-photo-btn px-3 py-1.5 rounded-full z-10 flex items-center gap-1.5 text-xs font-bold text-[#2D3A4E] hover:scale-105 active:scale-95 transition-transform"
            title="Открыть зум в высоком разрешении"
          >
            <ZoomIn className="w-3.5 h-3.5 text-[#4B59BB]" />
            <span className="text-[11px]">HD Зум</span>
          </button>

          {/* Previous / Next Arrow Buttons (appear when more than 1 image) */}
          {product.images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-10 opacity-80 hover:opacity-100 transition-all active:scale-90"
                aria-label="Предыдущее фото"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-10 opacity-80 hover:opacity-100 transition-all active:scale-90"
                aria-label="Следующее фото"
              >
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </>
          )}

          {/* Neumorphic Pagination Indicators */}
          {product.images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 z-10">
              {product.images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex(idx);
                  }}
                  className={`transition-all duration-300 ${
                    selectedImageIndex === idx
                      ? 'w-5 h-2 bg-[#5F6ED0] rounded-full'
                      : 'w-2 h-2 bg-[#BAC5D5] rounded-full'
                  }`}
                  aria-label={`Перейти к фото ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Horizontal Thumbnails Row with Angle Labels */}
        {product.images.length > 1 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-[#4E5C70]">
                Ракурсы и детали:
              </span>
              <span className="text-[11px] font-semibold text-[#4B59BB]">
                {ANGLE_LABELS[selectedImageIndex % ANGLE_LABELS.length]}
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
              {product.images.map((imgUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative p-0.5 rounded-2xl transition-all duration-200 shrink-0 flex flex-col items-center cursor-pointer ${
                    selectedImageIndex === idx
                      ? 'neu-inset ring-2 ring-[#5F6ED0] scale-105 bg-[#E3E8EF]'
                      : 'neu-button opacity-80 hover:opacity-100 hover:scale-102 bg-[#E3E8EF]'
                  }`}
                  aria-label={`Миниатюра ${idx + 1}`}
                >
                  <img
                    src={imgUrl}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-14 h-14 sm:w-16 sm:h-16 object-cover object-top rounded-xl"
                  />
                  <span className="text-[11px] font-bold text-[#4E5C70] pt-0.5 pb-0.5 px-1 truncate max-w-[64px]">
                    {ANGLE_LABELS[idx % ANGLE_LABELS.length].split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Details Card */}
      <div className="neu-flat rounded-3xl p-5 space-y-4">
        {/* Title, Badge & Favorite */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {product.badge && (
                <span className="neu-flat text-[#4B59BB] font-extrabold text-[11px] px-3 py-1 rounded-full uppercase tracking-wider">
                  {product.badge}
                </span>
              )}
              <RatingBadge
                rating={product.rating}
                reviewsCount={product.reviewsCount}
                showLabel
                size="md"
              />
            </div>
            <AnimatedFavoriteButton
              isFavorite={isFavorite}
              onToggle={(e) => onToggleFavorite(product, e)}
              size="md"
              className="neu-button ml-auto bg-[#E3E8EF]"
            />
          </div>

          <h1 className="text-xl font-bold text-[#2D3A4E] tracking-tight leading-snug">
            {product.title}
          </h1>
          <p className="text-xs text-[#4E5C70] leading-relaxed">{product.description}</p>
        </div>

        {/* Interactive Selectors: Color & Size */}
        <div className="space-y-3.5 pt-1">
          {/* Color Choice Circles */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#2D3A4E]">Выберите цвет:</span>
              <span className="text-[11px] font-bold text-[#4B59BB]">{selectedColor}</span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {product.colors.map((c) => {
                const isSelected = selectedColor === c.name;
                const isLight = ['#FFFFFF', '#E5D3B3', '#D6C0B3', '#E0E0E0', '#F5F5DC'].includes(c.hex.toUpperCase()) || c.name === 'Бежевый' || c.name === 'Белый';
                return (
                  <button
                    key={c.name}
                    onClick={() => setSelectedColor(c.name)}
                    className={`w-9 h-9 rounded-full p-0.5 flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'neu-inset ring-2 ring-[#5F6ED0] scale-105'
                        : 'neu-button hover:scale-105'
                    }`}
                    title={c.name}
                  >
                    <span
                      className="w-full h-full rounded-full flex items-center justify-center border border-black/15"
                      style={{ backgroundColor: c.hex }}
                    >
                      {isSelected && (
                        <Check className={`w-3.5 h-3.5 stroke-[3] ${isLight ? 'text-[#2D3A4E]' : 'text-white'}`} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size Choice Tiles with live granular stock availability */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-1.5 pb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#2D3A4E]">Выберите размер:</span>
                <span className="text-[11px] font-extrabold text-[#4B59BB]">{selectedSize}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {product.sizes.map((sz) => {
                const isSelected = selectedSize === sz;
                const szStock = getVariantStock(product, selectedColor, sz);
                const isOutOfStock = szStock === 0;

                return (
                  <button
                    key={sz}
                    onClick={() => setSelectedSize(sz)}
                    className={`min-h-[46px] min-w-[54px] px-3 py-1.5 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 relative cursor-pointer active:scale-95 ${
                      isOutOfStock
                        ? isSelected
                          ? 'neu-inset text-[#4E5C70]/70 bg-[#E3E8EF] border border-[#BAC5D5]/60'
                          : 'neu-flat text-[#4E5C70]/40 opacity-70 hover:opacity-100 line-through'
                        : isSelected
                        ? 'neu-pill-active'
                        : 'neu-button text-[#2D3A4E] hover:text-[#4B59BB]'
                    }`}
                  >
                    <span>{sz}</span>
                    <span
                      className={`text-[11px] tracking-tight ${
                        isOutOfStock
                          ? 'text-[#4E5C70]/50 font-medium no-underline'
                          : isSelected
                          ? 'text-[#4B59BB] font-semibold'
                          : 'text-[#4E5C70] font-medium'
                      }`}
                    >
                      {isOutOfStock ? '0 шт.' : `${szStock} шт.`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Inventory Status Banner & Price */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[#2D3A4E]">
                {product.price.toLocaleString('ru-RU')} ₽
              </span>
              {product.originalPrice && (
                <span className="text-sm text-[#4E5C70] line-through">
                  {product.originalPrice.toLocaleString('ru-RU')} ₽
                </span>
              )}
            </div>

            {/* Dynamic SKU Stock Badge */}
            {currentStock > 2 ? (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#4E5C70] border border-white/60 bg-[#E3E8EF]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5F6ED0]" />
                <span>В наличии: {currentStock} шт.</span>
              </div>
            ) : currentStock > 0 ? (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#2D3A4E] border border-white/60 bg-[#E3E8EF]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5F6ED0]" />
                <span>Осталось {currentStock} шт.</span>
              </div>
            ) : (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#4E5C70] border border-white/60 bg-[#E3E8EF]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BAC5D5]" />
                <span>Нет в наличии</span>
              </div>
            )}
          </div>

          {/* Granular SKU Info helper message if variant is out of stock */}
          {currentStock === 0 && (
            <div className="p-2.5 rounded-xl neu-inset bg-[#E3E8EF] border border-white/60 text-[11px] text-[#4E5C70] flex items-center gap-2">
              <Info className="w-4 h-4 text-[#4B59BB] shrink-0" />
              <span>
                Размер <strong className="text-[#2D3A4E]">{selectedSize}</strong> в цвете <strong className="text-[#2D3A4E]">{selectedColor}</strong> временно закончился на складе. Попробуйте выбрать другой цвет или размер.
              </span>
            </div>
          )}
        </div>

        {/* Quantity Controls & Primary Action Buttons */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-3">
            {/* Quantity Counter */}
            <div className="neu-inset rounded-full p-1 flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1 || currentStock === 0}
                className={`w-9 h-9 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] transition-opacity cursor-pointer ${
                  quantity <= 1 || currentStock === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:text-[#4B59BB]'
                }`}
                aria-label="Уменьшить количество"
              >
                <Minus className="w-4 h-4 stroke-[2.5]" />
              </button>
              <span className="text-sm font-bold text-[#2D3A4E] w-6 text-center">
                {currentStock === 0 ? 0 : quantity}
              </span>
              <button
                onClick={() => setQuantity(Math.min(currentStock, quantity + 1))}
                disabled={quantity >= currentStock || currentStock === 0}
                className={`w-9 h-9 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] transition-opacity cursor-pointer ${
                  quantity >= currentStock || currentStock === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:text-[#4B59BB]'
                }`}
                aria-label="Увеличить количество"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Action Button: Add to Cart */}
            <button
              onClick={handleAddToCart}
              disabled={isAdded || currentStock === 0}
              className={`flex-1 py-3.5 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 active:scale-95 cursor-pointer ${
                currentStock === 0
                  ? 'neu-inset bg-slate-200/80 text-slate-400 cursor-not-allowed'
                  : isAdded
                  ? 'bg-success text-white neu-inset'
                  : 'neu-button-accent'
              }`}
            >
              {currentStock === 0 ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Нет в наличии</span>
                </>
              ) : isAdded ? (
                <>
                  <Check className="w-4 h-4 stroke-[3] text-white animate-in zoom-in duration-200" />
                  <span className="animate-in fade-in duration-200">Добавлено!</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4 stroke-[2]" />
                  <span>В корзину</span>
                </>
              )}
            </button>
          </div>

          {/* Fast 1-Click Order Button */}
          {currentStock > 0 && (
            <button
              onClick={() => setIsQuickOrderOpen(true)}
              className="w-full py-2.5 px-4 rounded-2xl neu-button text-xs font-bold text-[#4B59BB] hover:scale-101 active:scale-99 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#4B59BB]" />
              <span>Купить в 1 клик без регистрации</span>
            </button>
          )}
        </div>
      </div>

      {/* Neumorphic Product Information Tabs (Description, Fabric Specs, Care) */}
      <div className="neu-flat rounded-3xl p-4 border border-white/60 space-y-3">
        {/* Tab Switcher Bar */}
        <div className="neu-flat-sm p-1.5 rounded-2xl flex items-center justify-between gap-1">
          <button
            onClick={() => setDetailTab('description')}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              detailTab === 'description'
                ? 'neu-pill-active'
                : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Описание</span>
          </button>

          <button
            onClick={() => setDetailTab('specs')}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              detailTab === 'specs'
                ? 'neu-pill-active'
                : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Состав и ткань</span>
          </button>

          <button
            onClick={() => setDetailTab('care')}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              detailTab === 'care'
                ? 'neu-pill-active'
                : 'text-[#4E5C70] hover:text-[#2D3A4E]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Уход и стирка</span>
          </button>
        </div>

        {/* Active Tab Content Panel */}
        <div className="neu-flat-sm rounded-2xl p-3.5 border border-white/80 space-y-3 text-xs text-[#2D3A4E] transition-all duration-200">
          {detailTab === 'description' && (
            <div className="space-y-3 leading-relaxed text-[#4E5C70]">
              <p>
                {product.description} Изготовлено из премиального 100% органического волокна с выверенным лекалом для безупречной посадки.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="neu-flat rounded-xl p-2.5 bg-[#E3E8EF] flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-success shrink-0" />
                  <div>
                    <p className="font-black text-[11px] text-[#2D3A4E]">Эко-материал</p>
                    <p className="text-[11px] text-[#4E5C70]">100% биоразлагаемо</p>
                  </div>
                </div>
                <div className="neu-flat rounded-xl p-2.5 bg-[#E3E8EF] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#4B59BB] shrink-0" />
                  <div>
                    <p className="font-black text-[11px] text-[#2D3A4E]">Европейское качество</p>
                    <p className="text-[11px] text-[#4E5C70]">Контроль каждого шва</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {detailTab === 'specs' && (
            <div className="space-y-3">
              {/* Fabric Composition Breakdown Block */}
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#4B59BB]" />
                    Состав и структура ткани
                  </span>
                  <span className="text-[11px] font-bold text-[#4B59BB] neu-flat px-2 py-0.5 rounded-lg">
                    {product.fabricDensity || '185 г/м²'}
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {getProductFabricComposition(product).map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-[#2D3A4E]">
                        <span>{item.fiber}</span>
                        <span className="text-[#4B59BB] font-black">{item.percentage}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden neu-inset bg-[#BAC5D5]/40">
                        <div
                          className="h-full bg-gradient-to-r from-[#5F6ED0] to-[#7B8AF0] rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-success font-semibold border-t border-[#BAC5D5]/40">
                  <ShieldCheck className="w-4 h-4 text-success shrink-0" />
                  <span>Сертифицировано OEKO-TEX® Standard 100 • Гипоаллергенный натуральный состав</span>
                </div>
              </div>

              {/* Main Technical Specs List */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[#BAC5D5]/40">
                  <span className="text-[#4E5C70] shrink-0">Плотность ткани:</span>
                  <span className="font-bold text-[#2D3A4E] text-right">{product.fabricDensity || '185 г/м² (средняя плотность)'}</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[#BAC5D5]/40">
                  <span className="text-[#4E5C70] shrink-0">Тип переплетения:</span>
                  <span className="font-bold text-[#2D3A4E] text-right">Саржевое / Полотняное</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[#BAC5D5]/40">
                  <span className="text-[#4E5C70] shrink-0">Покрой / Посадка:</span>
                  <span className="font-bold text-[#2D3A4E] text-right">
                    {product.fit === 'slim' ? 'Приталенный (Slim Fit)' : product.fit === 'oversize' ? 'Свободный (Oversize)' : 'Классический (Regular Fit)'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[#BAC5D5]/40">
                  <span className="text-[#4E5C70] shrink-0">Артикул:</span>
                  <span className="font-mono font-bold text-[#4B59BB] text-[11px] bg-slate-100/90 px-2 py-0.5 rounded-lg neu-inset border border-white/60">
                    {currentSKU?.skuCode || `MS-${product.id.slice(0, 4).toUpperCase()}-${selectedSize}`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[#BAC5D5]/40">
                  <span className="text-[#4E5C70] shrink-0">Штрихкод (EAN):</span>
                  <span className="font-mono text-[11px] text-[#2D3A4E] text-right">
                    {currentSKU?.barcode || '460700010099'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-[#4E5C70] shrink-0">Страна производства:</span>
                  <span className="font-bold text-[#2D3A4E] text-right">Португалия</span>
                </div>
              </div>
            </div>
          )}

          {detailTab === 'care' && (
            <div className="space-y-2.5">
              <div className="text-[11px] text-[#4E5C70] font-medium pb-1">
                Следуйте рекомендациям для сохранения первозданного вида, мягкости волокон и цвета изделия:
              </div>

              {getProductCareInstructions(product).map((care, idx) => (
                <div
                  key={idx}
                  className="neu-flat rounded-xl p-2.5 bg-[#E3E8EF] flex items-start gap-2.5 border border-white/60"
                >
                  <div className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center shrink-0 mt-0.5 text-[#4B59BB]">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-[#2D3A4E]">{care.label}</p>
                    <p className="text-[11px] text-[#4E5C70] leading-snug mt-0.5">{care.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accordion Info Cards (Shipping, Returns, Size Guides) */}
      <div className="space-y-3">
        {/* Shipping Accordion */}
        <div className="neu-flat rounded-2xl overflow-hidden border border-white/60">
          <button
            onClick={() => setOpenAccordion(openAccordion === 'shipping' ? null : 'shipping')}
            className="w-full p-4 flex items-center justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-[#2D3A4E]">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Доставка</p>
                <p className="text-xs text-[#4E5C70]">Бесплатная доставка от {freeDeliveryThreshold.toLocaleString('ru-RU')} ₽</p>
              </div>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-[#4E5C70] transition-transform duration-200 ${
                openAccordion === 'shipping' ? 'rotate-90' : ''
              }`}
            />
          </button>
          {openAccordion === 'shipping' && (
            <div className="px-4 pb-4 pt-1 text-xs text-[#4E5C70] leading-relaxed border-t border-[#BAC5D5]/40">
              Курьерская доставка до двери с примеркой (1–2 дня), экспресс-доставка по Москве, пункты выдачи, СДЭК и Почта России. Сроки и стоимость для вашего адреса видны при оформлении заказа.
            </div>
          )}
        </div>

        {/* Fit Advisor Card */}
        <div className="neu-flat rounded-2xl overflow-hidden border border-white/60">
          <button
            onClick={() => setIsSizeCalcOpen(true)}
            className="w-full p-4 flex items-center justify-between text-left transition-colors group active:scale-[0.99] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-[#4B59BB] group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5 text-[#4B59BB]" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Подбор размера</p>
                <p className="text-xs text-[#4E5C70]">Персональный расчет по весу и росту</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Returns Accordion */}
        <div className="neu-flat rounded-2xl overflow-hidden border border-white/60">
          <button
            onClick={() => setOpenAccordion(openAccordion === 'returns' ? null : 'returns')}
            className="w-full p-4 flex items-center justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-[#2D3A4E]">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Возврат</p>
                <p className="text-xs text-[#4E5C70]">{formatDays(returnPeriodDays)} на возврат</p>
              </div>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-[#4E5C70] transition-transform duration-200 ${
                openAccordion === 'returns' ? 'rotate-90' : ''
              }`}
            />
          </button>
          {openAccordion === 'returns' && (
            <div className="px-4 pb-4 pt-1 text-xs text-[#4E5C70] leading-relaxed border-t border-[#BAC5D5]/40">
              Возврат в течение {formatDays(returnPeriodDays)} с момента получения в пункте выдачи или с вызовом курьера. Главное условие — сохранение товарного вида и ярлыков.
            </div>
          )}
        </div>
      </div>

      {/* Customer Reviews & Feedback Section */}
      <ProductReviewsSection
        product={product}
        userProfile={userProfile}
        onAddReview={handleAddReview}
        onShowToast={onShowToast || (() => {})}
      />

      {/* Recently Viewed Products */}
      {recentlyViewed.length > 0 && onSelectProduct && (
        <RecentlyViewed
          products={recentlyViewed}
          onSelectProduct={onSelectProduct}
          onClear={onClearRecentlyViewed}
          onRemove={onRemoveFromRecentlyViewed}
        />
      )}

      {/* High Resolution Multi-angle Image Zoom Modal */}
      <ProductImageZoomModal
        isOpen={isZoomModalOpen}
        images={product.images}
        initialIndex={selectedImageIndex}
        productTitle={product.title}
        onClose={() => setIsZoomModalOpen(false)}
      />

      {/* Quick 1-Click Order Modal */}
      <QuickOrderModal
        isOpen={isQuickOrderOpen}
        onClose={() => setIsQuickOrderOpen(false)}
        singleProduct={{
          product,
          color: selectedColor,
          size: selectedSize,
          quantity,
        }}
        totalPrice={product.price * quantity}
        onSuccess={handleQuickOrderSuccess}
      />

      {/* Size Calculator Modal */}
      <SizeCalculatorModal
        isOpen={isSizeCalcOpen}
        onClose={() => setIsSizeCalcOpen(false)}
        availableSizes={product.sizes}
        onSelectSize={(sz) => setSelectedSize(sz)}
        productFit={product.fit}
        productCategory={product.category}
        userProfile={userProfile}
        onSaveMeasurements={onSaveMeasurements}
      />
    </div>
  );
};
