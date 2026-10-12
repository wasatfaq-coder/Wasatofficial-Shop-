import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LazyMount } from '../components/LazyMount';
import { ProductImageZoomModal, QuickOrderModal, SizeCalculatorModal } from '../components/lazyWindows';
import {
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
  X,
  Info,
  ZoomIn,
  Layers,
  Share2,
  Ruler,
} from 'lucide-react';
import { formatDays } from '../utils/pluralize';
import { Product, UserProfile, BodyMeasurements, CartItem } from '../types';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { RatingBadge } from '../components/RatingBadge';
import { NeumorphicImage } from '../components/NeumorphicImage';
import { AnimatedFavoriteButton } from '../components/AnimatedFavoriteButton';
import { ProductReviewsSection } from '../components/ProductReviewsSection';
import { getVariantStock, getProductSKU, getOrderableStock, isHiddenFromSale } from '../utils/inventory';
import { colorImageIndex } from '../utils/colorPhotos';
import { formatPackage, formatWeight, productPackageCm, productWeightGrams } from '../utils/productShipping';
import { colorStock, initialColor, initialSize, maxOrderableForColor, profileSizeFor } from '../utils/variantSelection';
import {
  getProductFabricComposition,
  getProductCareInstructions,
  getProductCertifications,
  getProductFeatures,
  getProductSpecRows,
} from '../utils/productAttributes';
import { photoBadgeClass, shownBadge, shownOldPrice } from '../utils/productBadge';
import { productSizeChart } from '../utils/sizeChart';
import { SizeChartTable } from '../components/SizeChartTable';
import { getProductRating } from '../utils/productRating';
import { productImage } from '../utils/productImage';
import { useProductPhotos } from '../utils/useProductPhotos';
import { useLiveReviews } from '../utils/liveReviews';
import { QUICK_ORDER_DELIVERY_TITLE, type FreeDeliveryOffer } from '../shared/orderPricing';
import { freeDeliveryMethodsText } from '../utils/freeDelivery';
import { sellsRetail, sellsWholesale, type WholesaleSettings } from '../shared/wholesalePricing';
import { wholesaleOfferOf } from '../utils/wholesaleOffer';
import { ProductWholesaleBlock, type BuyMode } from '../components/ProductWholesaleBlock';
import {
  productSizePacks,
  sameColor,
  sizePackColors,
  sizePackCompositionText,
  sizePackPieces,
  sizePackPrice,
  sizePackTitle,
  type SizePack,
} from '../shared/sizePacks';
import { packsLeft } from '../utils/cartLines';
import { productShareUrl } from '../utils/navigation';
import { copyToClipboard } from '../utils/clipboard';
import { useLiveProducts } from '../utils/liveProducts';
import { useProductThumb } from '../utils/productThumbs';

interface ProductDetailScreenProps {
  product: Product;
  /** Admin → «Витрина» → «Предзаказ»: a sold-out variant can be preordered */
  preorderMode?: boolean;
  /** «Технические работы» in «Витрина»: the 1-click window says the site takes no orders */
  ordersPaused?: boolean;
  isFavorite: boolean;
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
    quantity: number,
    wholesale?: boolean
  ) => boolean | void;
  /** A size pack («ростовка», stage 20) into the cart: `packs` whole packs of the colour; `false` — nothing added */
  onAddPackToCart?: (product: Product, packId: string, color: string, packs: number) => boolean;
  /** The cart's lines: what they already hold is taken off the packs the buyer can still add */
  cartItems?: CartItem[];
  onSelectProduct?: (product: Product) => void;
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
  /** The free-delivery promise by the delivery methods (freeDeliveryOffer) */
  freeDelivery?: FreeDeliveryOffer | null;
  /** «Опт» of the storefront settings: the volume-discount steps shown with the wholesale price */
  wholesale?: WholesaleSettings;
}

/** «Вес» and «Габариты упаковки» rows of the product's specs; none when the owner left them empty */
function shippingSpecRows(product: Product): { label: string; value: string }[] {
  const weight = productWeightGrams(product);
  const box = productPackageCm(product);
  return [
    ...(weight !== undefined ? [{ label: 'Вес', value: formatWeight(weight) }] : []),
    ...(box ? [{ label: 'Габариты упаковки', value: formatPackage(box) }] : []),
  ];
}

export const ProductDetailScreen: React.FC<ProductDetailScreenProps> = ({
  product,
  ordersPaused = false,
  isFavorite,
  recentlyViewed = [],
  onClearRecentlyViewed,
  onRemoveFromRecentlyViewed,
  userProfile,
  onSaveMeasurements,
  onToggleFavorite,
  onAddToCartWithOptions,
  onAddPackToCart,
  cartItems = [],
  onSelectProduct,
  preorderMode = false,
  onCompleteOrder,
  onShowToast,
  returnPeriodDays,
  freeDelivery = null,
  wholesale,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // The link shows the product's photo, name and price in Telegram and WhatsApp (docs/seo-plan.md): the phone's share
  // sheet on touch screens, a copied link on a computer
  const shareProduct = async () => {
    const url = productShareUrl(product.id);
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: product.title, url });
        return;
      } catch (err) {
        // the buyer closed the share sheet
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    const copied = await copyToClipboard(url);
    onShowToast?.(copied ? 'Ссылка на товар скопирована' : `Не удалось скопировать ссылку: ${url}`, copied ? 'success' : 'error');
  };
  // the catalog gives the index line of the product: its document brings the photos, sections and stock
  // (docs/catalog-scale-plan.md, stage 3); meanwhile the card's miniature is shown
  useLiveProducts([product?.id]);
  // its reviews and votes too: the catalog cards show the rating from the index (stage 4)
  useLiveReviews(product?.id);
  const thumb = useProductThumb(product);
  // full photos from product_photos replace the catalog previews as they arrive (stage 6): the slide on screen
  // and those the zoom shows (docs/catalog-scale-plan.md, stage 4)
  const { photos, show: showPhoto } = useProductPhotos(product, selectedImageIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  // The first colour that can be ordered, as in the quick view: not a sold-out one when others are left (finding 24)
  const [selectedColor, setSelectedColor] = useState(() => initialColor(product, preorderMode));
  // No size is preselected (unless there is only one): a default size put wrong items in the cart
  const [selectedSize, setSelectedSize] = useState(() => initialSize(product));
  const mySize = profileSizeFor(product?.sizes, userProfile?.bodyMeasurements);
  const [sizeError, setSizeError] = useState(false);
  const sizesRef = useRef<HTMLDivElement>(null);
  // Phone: while the page's own «В корзину» is off screen, a bar with the price and the button sits above the menu
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [addButtonInView, setAddButtonInView] = useState(true);
  useEffect(() => {
    const el = addButtonRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setAddButtonInView(entry.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [product?.id]);
  // Units of the counter: items when buying retail, whole packs when buying wholesale
  const [quantity, setQuantity] = useState(1);
  // «Оптом» (stages 16–17 of docs/admin-wholesale-plan.md): a product sold only wholesale is always bought wholesale
  const offer = wholesaleOfferOf(product, wholesale);
  // «Ростовкой» (stage 20): the packs of the product that have a price; only for a product sold wholesale
  const sizePacks = useMemo(
    () => (sellsWholesale(product) ? productSizePacks(product).filter((pack) => sizePackPrice(product, pack) !== undefined) : []),
    [product]
  );
  const packsOffered = sizePacks.length > 0;
  const [buyChoice, setBuyChoice] = useState<BuyMode>(() => (offer?.onlyWholesale ? 'wholesale' : 'retail'));
  const packMode = packsOffered && buyChoice === 'pack';
  const wholesaleMode = Boolean(offer) && !packMode && (buyChoice === 'wholesale' || Boolean(offer?.onlyWholesale));
  const step = wholesaleMode && offer ? offer.packSize : 1;
  // packs mode: the pack picked and how many packs
  const [selectedPackId, setSelectedPackId] = useState('');
  const [packCount, setPackCount] = useState(1);
  const [openAccordion, setOpenAccordion] = useState<'shipping' | 'returns' | 'fabric' | null>('fabric');
  const [detailTab, setDetailTab] = useState<'description' | 'specs' | 'care'>('description');
  const [isSizeCalcOpen, setIsSizeCalcOpen] = useState(false);
  // «Размерная сетка» of the model under the sizes: shown on a tap, the page stays short (wholesale plan, stage 14)
  const [isSizeChartOpen, setIsSizeChartOpen] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  // Reset product state when a new product is loaded
  useEffect(() => {
    setSelectedImageIndex(0);
    setSelectedColor(initialColor(product, preorderMode));
    setSelectedSize(initialSize(product));
    setSizeError(false);
    setIsSizeChartOpen(false);
  }, [product?.id]);

  // The way of buying and the counter start over with another product, and when the owner changes how it is sold
  // while the page is open: packs must not silently become items or the other way round
  const hasOffer = Boolean(offer);
  const onlyWholesale = Boolean(offer?.onlyWholesale);
  useEffect(() => {
    setBuyChoice(onlyWholesale ? 'wholesale' : 'retail');
    setQuantity(onlyWholesale && offer ? offer.minPacks : 1);
    setSelectedPackId('');
    setPackCount(1);
  }, [product?.id, hasOffer, onlyWholesale]);

  // Stock of the chosen size; before a size is chosen — of the whole colour
  const sizeChosen = !product.sizes?.length || Boolean(selectedSize);
  const currentStock = sizeChosen
    ? getVariantStock(product, selectedColor, selectedSize)
    : colorStock(product, selectedColor);
  const currentSKU = getProductSKU(product, selectedColor, selectedSize);

  const sizeChart = productSizeChart(product);
  // Card sections from Admin → product → «Структура карточки»; a section without data is hidden
  const cardFeatures = getProductFeatures(product);
  const cardComposition = getProductFabricComposition(product);
  const cardCertifications = getProductCertifications(product);
  // Weight of one item and its package (stage 15): shown in «Характеристики» when the owner filled them (owner task
  // 11.10); the supplier and its article stay admin-only (owner's decision 11.10: a buyer could go round the shop)
  const cardSpecRows = [
    ...getProductSpecRows(product),
    ...shippingSpecRows(product),
  ];
  const cardCare = getProductCareInstructions(product);
  const detailTabs = [
    { id: 'description' as const, label: 'Описание', icon: FileText, show: Boolean(product.description?.trim()) || cardFeatures.length > 0 },
    {
      id: 'specs' as const,
      label: 'Состав и ткань',
      icon: ListFilter,
      show:
        cardComposition.length > 0 ||
        cardSpecRows.length > 0 ||
        cardCertifications.length > 0 ||
        Boolean(currentSKU?.skuCode || currentSKU?.barcode),
    },
    { id: 'care' as const, label: 'Уход и стирка', icon: Sparkles, show: cardCare.length > 0 },
  ].filter((tab) => tab.show);
  const activeDetailTab = detailTabs.some((tab) => tab.id === detailTab) ? detailTab : detailTabs[0]?.id;
  // Units that can be ordered: the stock, or a preorder limit for a sold-out variant
  const orderableStock = sizeChosen
    ? getOrderableStock(product, selectedColor, selectedSize, preorderMode)
    : maxOrderableForColor(product, selectedColor, preorderMode);
  const isPreorder = currentStock === 0 && orderableStock > 0;
  // What the counter can reach: items, or whole packs when buying wholesale
  const maxCount = Math.floor(orderableStock / step);

  // Ensure quantity does not exceed available variant stock
  useEffect(() => {
    if (maxCount > 0) {
      setQuantity((prev) => (prev > maxCount ? maxCount : prev));
    } else {
      // nothing of this size: when another one is picked, wholesale starts again from the product's minimum
      setQuantity(wholesaleMode && offer ? offer.minPacks : 1);
    }
  }, [selectedColor, selectedSize, maxCount]);

  // Size packs of the chosen colour (the mode «Ростовкой»): each pack's whole packs left after the cart's lines
  const packColorNames = sizePacks.flatMap((pack) => sizePackColors(product, pack));
  const packsForColor = packMode ? sizePacks.filter((pack) => sizePackColors(product, pack).some((c) => sameColor(c, selectedColor))) : [];
  const packsLeftOf = (pack: SizePack) =>
    packsLeft(
      cartItems,
      { product, selectedColor, packSizes: pack.sizes },
      (size) => getOrderableStock(product, selectedColor, size, false)
    );
  const activePack: SizePack | null =
    packsForColor.find((pack) => pack.id === selectedPackId) ?? packsForColor.find((pack) => packsLeftOf(pack) > 0) ?? packsForColor[0] ?? null;
  const packAvailable = activePack ? packsLeftOf(activePack) : 0;
  const packN = packAvailable === 0 ? 0 : Math.min(Math.max(packCount, 1), packAvailable);
  const activePackPrice = activePack ? sizePackPrice(product, activePack) : undefined;
  const activePackPieces = activePack ? sizePackPieces(activePack) : 0;
  // sizes of the pack the colour has too few of: named under the button
  const packMissingSizes = activePack ? activePack.sizes.filter((line) => getVariantStock(product, selectedColor, line.size) < line.qty).map((line) => line.size) : [];
  const packUnavailableText = !activePack
    ? 'В этом цвете ростовок нет — выберите другой цвет'
    : packMissingSizes.length > 0
    ? `Нет ${packMissingSizes.length > 1 ? 'размеров' : 'размера'} ${packMissingSizes.join(', ')}: ростовка недоступна`
    : isHiddenFromSale(product)
    ? 'Ростовка недоступна'
    : 'Весь остаток этой ростовки уже в вашей корзине';
  const cheapestPack = sizePacks.reduce<number | null>((low, pack) => {
    const price = sizePackPrice(product, pack);
    return price !== undefined && (low === null || price < low) ? price : low;
  }, null);
  const packFrom = packsOffered && cheapestPack !== null ? { price: cheapestPack, several: sizePacks.length > 1 } : null;
  /** «N шт. × 1 200 ₽/шт.»; «≈» when the pack price does not split into whole roubles */
  const perPieceText = (price: number, pieces: number) => {
    const each = price / pieces;
    return `${pieces} шт. × ${Number.isInteger(each) ? '' : '≈ '}${Math.round(each).toLocaleString('ru-RU')} ₽/шт.`;
  };

  // The way of buying changes: «Оптом» starts at the product's minimum (as many packs as there are, if fewer); «Ростовкой»
  // at one pack, in a colour that has packs
  const changeBuyMode = (mode: BuyMode) => {
    setBuyChoice(mode);
    if (mode === 'pack') {
      setPackCount(1);
      if (!packColorNames.some((c) => sameColor(c, selectedColor)) && packColorNames[0]) setSelectedColor(packColorNames[0]);
      return;
    }
    const packs = offer ? Math.floor(orderableStock / offer.packSize) : 0;
    setQuantity(mode === 'wholesale' && offer ? Math.max(1, Math.min(offer.minPacks, packs)) : 1);
  };

  // One counter for the items, wholesale packs and size packs
  const counterMax = packMode ? packAvailable : maxCount;
  const counterValue = packMode ? packN : quantity;
  const counterInPacks = packMode || step > 1;
  const setCounter = (value: number) => (packMode ? setPackCount(value) : setQuantity(value));
  // a size pack has no size and no preorder
  const needsSize = !packMode && !sizeChosen;
  const showPreorder = !packMode && isPreorder;


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

  // «В корзину» / «Заказать в 1 клик» without a size: point at the sizes instead of guessing one
  const askForSize = () => {
    setSizeError(true);
    sizesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    sizesRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  };

  const handleAddToCart = () => {
    if (packMode) {
      if (!activePack || packN === 0 || !onAddPackToCart) return;
      if (onAddPackToCart(product, activePack.id, selectedColor, packN) === false) return;
      setIsAdded(true);
      setTimeout(() => {
        setIsAdded(false);
      }, 1000);
      return;
    }
    if (!sizeChosen) {
      askForSize();
      return;
    }
    // Stays on the page: the toast has a «В корзину» link
    if (onAddToCartWithOptions(product, selectedColor, selectedSize, quantity * step, wholesaleMode) === false) return;
    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
    }, 1000);
  };

  /** `false` — the order was not placed: the 1-click window stays open with what the buyer typed */
  const handleQuickOrderSuccess = async (details: { name: string; phone: string; address: string }): Promise<boolean> => {
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
        address: details.address || 'Уточнит менеджер',
        deliveryMethod: QUICK_ORDER_DELIVERY_TITLE,
        totalPrice: product.price * quantity,
      });
      if (placed === false) return false;
      if (onShowToast) {
        onShowToast(`Заказ успешно оформлен! Менеджер свяжется с вами по номеру ${details.phone}`, 'success');
      }
      return true;
    }
    return onAddToCartWithOptions(product, selectedColor, selectedSize, quantity) !== false;
  };

  return (
    <div className="space-y-5 pb-44 lg:pb-10 animate-in fade-in duration-300">
      {/* Computer (lg): gallery on the left, the buying block on the right stays in view while the photos scroll */}
      <div className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
      {/* Product Image Gallery with Large Showcase & Neumorphic Multi-angles */}
      <div className="neu-flat rounded-3xl p-3 sm:p-4 border border-white/60 space-y-3 lg:col-span-7">
        {/* Main Large Photo Box - Neumorphic Well with 3:4 Aspect Ratio */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => setIsZoomModalOpen(true)}
          className="relative w-full aspect-[3/4] sm:aspect-[4/5] lg:max-h-[calc(100vh-11rem)] rounded-2xl overflow-hidden select-none group/detailimg cursor-zoom-in"
        >
          <NeumorphicImage
            src={photos[selectedImageIndex] || (selectedImageIndex === 0 && thumb) || productImage(product, selectedImageIndex)}
            alt={product?.title || ''}
            containerClassName="w-full h-full rounded-2xl"
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover/detailimg:scale-[1.03]"
          />

          {/* Badge in top-left */}
          {shownBadge(product) && (
            <div className="absolute top-3 left-3 z-10">
              <span className={`h-6 px-3 rounded-full ${photoBadgeClass(shownBadge(product)!)} text-[11px] tracking-wider uppercase font-bold inline-flex items-center justify-center leading-none`}>
                {shownBadge(product)}
              </span>
            </div>
          )}

          {/* Photo counter in top-right */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
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
            className="absolute bottom-3 right-3 neu-photo-btn px-3 py-1.5 rounded-full z-10 flex items-center gap-1.5 text-xs font-bold text-[#2D3A4E] hover:scale-105 transition-transform"
            title="Увеличить фото"
          >
            <ZoomIn className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px]">Увеличить фото</span>
          </button>

          {/* Previous / Next Arrow Buttons (appear when more than 1 image) */}
          {product.images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-10 opacity-80 hover:opacity-100 transition-all"
                aria-label="Предыдущее фото"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-10 opacity-80 hover:opacity-100 transition-all"
                aria-label="Следующее фото"
              >
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </>
          )}

          {/* Neumorphic Pagination Indicators */}
          {product.images.length > 1 && (
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 z-10 pointer-events-none"
              aria-hidden="true"
            >
              {/* Only a position indicator: photos are switched by the arrows, swipe and thumbnails */}
              {product.images.map((_, idx) => (
                <span
                  key={idx}
                  className={`transition-all duration-300 ${
                    selectedImageIndex === idx
                      ? 'w-5 h-2 bg-accent rounded-full'
                      : 'w-2 h-2 bg-[#BAC5D5] rounded-full'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Thumbnails: photos have no captions in the admin, so none are invented here */}
        {product.images.length > 1 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
              {photos.map((imgUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative p-1 rounded-2xl transition-all duration-200 shrink-0 cursor-pointer ${
                    selectedImageIndex === idx ? 'neu-pill-active' : 'neu-button opacity-80 hover:opacity-100'
                  }`}
                  aria-label={`Фото ${idx + 1} из ${product.images.length}`}
                  aria-current={selectedImageIndex === idx}
                >
                  <img
                    src={imgUrl || productImage(product, idx)}
                    alt=""
                    className="w-14 h-14 sm:w-16 sm:h-16 object-cover object-top rounded-xl"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Details Card */}
      <div className="neu-flat rounded-3xl p-5 space-y-4 lg:col-span-5 lg:sticky lg:top-24">
        {/* Title, rating & favorite. The badge is shown on the photo only: a second copy here repeated it */}
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-[#2D3A4E] tracking-tight leading-snug min-w-0 break-words">
              {product.title}
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={shareProduct}
                className="neu-button w-8 h-8 rounded-full flex items-center justify-center text-[#4E5C70]"
                aria-label="Поделиться ссылкой на товар"
                title="Поделиться"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
              </button>
              <AnimatedFavoriteButton
                isFavorite={isFavorite}
                onToggle={(e) => onToggleFavorite(product, e)}
                size="md"
                className="neu-button"
              />
            </div>
          </div>
          <RatingBadge
            rating={getProductRating(product)?.rating}
            reviewsCount={getProductRating(product)?.count}
            showLabel
            size="md"
          />
        </div>

        {/* Interactive Selectors: Color & Size */}
        <div className="space-y-3.5 pt-1">
          {/* Color Choice Circles */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#2D3A4E]">Выберите цвет:</span>
              <span className="text-[11px] font-bold text-accent">{selectedColor}</span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {product.colors.map((c) => {
                const isSelected = selectedColor === c.name;
                const isLight = ['#FFFFFF', '#E5D3B3', '#D6C0B3', '#E0E0E0', '#F5F5DC'].includes(c.hex.toUpperCase()) || c.name === 'Бежевый' || c.name === 'Белый';
                return (
                  <button
                    key={c.name}
                    onClick={() => {
                      setSelectedColor(c.name);
                      // optional photo bound to the colour: only on the click, manual swiping stays free afterwards
                      const boundPhoto = colorImageIndex(product, c.name);
                      if (boundPhoto !== null) setSelectedImageIndex(boundPhoto);
                    }}
                    className={`w-9 h-9 rounded-full p-0.5 flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'neu-inset ring-2 ring-accent scale-105'
                        : 'neu-button hover:scale-105'
                    }`}
                    title={c.name}
                    aria-label={`Цвет: ${c.name}`}
                    aria-pressed={isSelected}
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
            {!packMode && (
              <>
              <div className="flex items-center justify-between gap-1.5 pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[#2D3A4E]">{selectedSize ? 'Размер:' : 'Выберите размер'}</span>
                  {selectedSize && <span className="text-[11px] font-extrabold text-accent">{selectedSize}</span>}
                </div>
                {mySize && (
                  <span className="text-[11px] font-semibold text-[#4E5C70]">
                    Ваш размер: <span className="font-extrabold text-accent">{mySize}</span>
                  </span>
                )}
              </div>

              <div
                ref={sizesRef}
                className="flex items-center gap-2 flex-wrap scroll-mt-24"
                role="radiogroup"
                aria-label="Размер"
                aria-describedby={sizeError ? 'product-size-error' : undefined}
              >
                {product.sizes.map((sz) => {
                  const isSelected = selectedSize === sz;
                  const szStock = getVariantStock(product, selectedColor, sz);
                  const isOutOfStock = szStock === 0;

                  return (
                    <button
                      key={sz}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSelectedSize(sz);
                        setSizeError(false);
                      }}
                      className={`min-h-[46px] min-w-[54px] px-3 py-1.5 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 relative cursor-pointer ${
                        // Sold out stays readable (4.5:1, no transparency): struck through and marked «нет»,
                        // it can still be picked to see the preorder or «закончился» note
                        isOutOfStock
                          ? isSelected
                            ? 'neu-pill-active text-[#4E5C70]'
                            : 'neu-flat text-[#4E5C70]'
                          : isSelected
                          ? 'neu-pill-active'
                          : 'neu-button text-[#2D3A4E] hover:text-accent'
                      }`}
                      aria-label={isOutOfStock ? `${sz}, нет в наличии` : undefined}
                    >
                      {sz === mySize && (
                        <span aria-hidden="true" className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />
                      )}
                      <span className={isOutOfStock ? 'line-through' : undefined}>{sz}</span>
                      <span
                        className={`text-[11px] tracking-tight ${
                          isOutOfStock
                            ? 'text-[#4E5C70] font-medium'
                            : isSelected
                            ? 'text-accent font-semibold'
                            : 'text-[#4E5C70] font-medium'
                        }`}
                      >
                        {isOutOfStock ? 'нет' : `${szStock} шт.`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {sizeError && (
                <p id="product-size-error" role="alert" className="text-xs font-bold text-danger">
                  Выберите размер, чтобы добавить товар в корзину
                </p>
              )}
              </>
            )}
            {packMode && (
              <>
                <div className="flex items-center justify-between gap-1.5 pb-0.5">
                  <span className="text-xs font-semibold text-[#2D3A4E]">
                    {packsForColor.length > 1 ? 'Выберите ростовку' : 'Ростовка'}
                  </span>
                  {activePack && <span className="text-[11px] font-extrabold text-accent">{activePackPieces} шт. в упаковке</span>}
                </div>
                {packsForColor.length > 0 ? (
                  <div role="radiogroup" aria-label="Ростовка" className="grid grid-cols-1 gap-2">
                    {packsForColor.map((pack) => {
                      const isSelected = activePack?.id === pack.id;
                      const left = packsLeftOf(pack);
                      const price = sizePackPrice(product, pack);
                      return (
                        <button
                          key={pack.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedPackId(pack.id)}
                          className={`min-h-11 w-full px-3 py-2 rounded-2xl text-left flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            left === 0
                              ? isSelected
                                ? 'neu-pill-active text-[#4E5C70]'
                                : 'neu-flat text-[#4E5C70]'
                              : isSelected
                              ? 'neu-pill-active'
                              : 'neu-button text-[#2D3A4E] hover:text-accent'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-extrabold">{sizePackTitle(pack)}</span>
                            <span className="block text-xs text-[#4E5C70]">{sizePackCompositionText(pack)}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            {price !== undefined && (
                              <span className="block text-xs font-extrabold whitespace-nowrap">{price.toLocaleString('ru-RU')} ₽</span>
                            )}
                            <span className="block text-[11px] font-medium text-[#4E5C70]">{left > 0 ? `${left} уп.` : 'нет'}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-[#4E5C70]">{packUnavailableText}</p>
                )}
              </>
            )}
            {sizeChart && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setIsSizeChartOpen((open) => !open)}
                  aria-expanded={isSizeChartOpen}
                  aria-controls="product-size-chart"
                  className="min-h-8 -ml-1 px-1 rounded-lg text-xs font-bold text-accent hover:text-accent-strong flex items-center gap-1.5 cursor-pointer"
                >
                  <Ruler className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Размерная сетка</span>
                  <ChevronRight
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isSizeChartOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {isSizeChartOpen && <SizeChartTable id="product-size-chart" chart={sizeChart} selectedSize={selectedSize} />}
              </div>
            )}
          </div>
        </div>

        {/* Live Inventory Status Banner & Price */}
        <div className="space-y-2.5 pt-1">
          {/* Price on one line, the stock badge below it: side by side they wrapped «2 990 ₽» on a phone */}
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-baseline gap-x-2 flex-wrap">
              {packMode ? (
                <>
                  <span className="text-2xl font-extrabold text-[#2D3A4E] whitespace-nowrap">
                    {activePackPrice === undefined && packFrom ? 'от ' : ''}
                    {(activePackPrice ?? packFrom?.price ?? 0).toLocaleString('ru-RU')} ₽
                    <span className="text-sm font-bold text-[#4E5C70]">/уп.</span>
                  </span>
                  {activePack && activePackPrice !== undefined && (
                    <span className="text-xs font-semibold text-[#4E5C70] whitespace-nowrap">
                      {perPieceText(activePackPrice, activePackPieces)}
                    </span>
                  )}
                </>
              ) : (
              <span className="text-2xl font-extrabold text-[#2D3A4E] whitespace-nowrap">
                {(wholesaleMode && offer ? (offer.packSize > 1 ? offer.packPrice : offer.unitPrice) : product.price).toLocaleString('ru-RU')} ₽
                {wholesaleMode && offer && (
                  <span className="text-sm font-bold text-[#4E5C70]">{offer.packSize > 1 ? '/уп. оптом' : '/шт. оптом'}</span>
                )}
              </span>
              )}
              {!packMode && wholesaleMode && offer && offer.packSize > 1 && (
                <span className="text-xs font-semibold text-[#4E5C70] whitespace-nowrap">
                  {offer.packSize} шт. × {offer.unitPrice.toLocaleString('ru-RU')} ₽
                </span>
              )}
              {!packMode && !wholesaleMode && shownOldPrice(product) !== null && (
                <span className="text-sm text-[#4E5C70] line-through whitespace-nowrap">
                  {shownOldPrice(product)!.toLocaleString('ru-RU')} ₽
                </span>
              )}
            </div>

            {/* Dynamic SKU Stock Badge */}
            {packMode ? (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#4E5C70] border border-white/60">
                <span className={`w-1.5 h-1.5 rounded-full ${packAvailable > 0 ? 'bg-accent' : 'bg-[#BAC5D5]'}`} />
                <span>Доступно упаковок: {packAvailable}</span>
              </div>
            ) : currentStock > 2 ? (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#4E5C70] border border-white/60">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span>В наличии: {currentStock} шт.</span>
              </div>
            ) : currentStock > 0 ? (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#2D3A4E] border border-white/60">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span>Осталось {currentStock} шт.</span>
              </div>
            ) : isPreorder ? (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-accent border border-white/60">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span>Предзаказ</span>
              </div>
            ) : (
              <div className="neu-flat text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 text-[#4E5C70] border border-white/60">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BAC5D5]" />
                <span>Нет в наличии</span>
              </div>
            )}
          </div>

          {offer && (
            <ProductWholesaleBlock
              offer={offer}
              retailPrice={product.price}
              mode={packMode ? 'pack' : wholesaleMode ? 'wholesale' : 'retail'}
              onChangeMode={changeBuyMode}
              packFrom={packFrom}
            />
          )}

          {/* Granular SKU Info helper message if variant is out of stock */}
          {!packMode && sizeChosen && currentStock === 0 && (
            <div className="p-2.5 rounded-xl neu-inset border border-white/60 text-[11px] text-[#4E5C70] flex items-center gap-2">
              <Info className="w-4 h-4 text-accent shrink-0" />
              {isPreorder ? (
                <span>
                  Размера <strong className="text-[#2D3A4E]">{selectedSize}</strong> в цвете <strong className="text-[#2D3A4E]">{selectedColor}</strong> сейчас нет на складе. Его можно заказать заранее: срок поставки сообщит менеджер.
                </span>
              ) : (
                <span>
                  Размер <strong className="text-[#2D3A4E]">{selectedSize}</strong> в цвете <strong className="text-[#2D3A4E]">{selectedColor}</strong> временно закончился на складе. Попробуйте выбрать другой цвет или размер.
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quantity Controls & Primary Action Buttons */}
        <div className="space-y-2 pt-2">
          {/* On a narrow phone the button moves under the counter instead of wrapping its text */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Quantity Counter */}
            <div className="neu-inset rounded-full p-1 flex items-center gap-2">
              <button
                onClick={() => setCounter(Math.max(1, counterValue - 1))}
                disabled={counterValue <= 1 || counterMax === 0}
                className={`w-9 h-9 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] transition-opacity cursor-pointer ${
                  counterValue <= 1 || counterMax === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:text-accent'
                }`}
                aria-label={packMode ? 'Уменьшить число упаковок' : 'Уменьшить количество'}
              >
                <Minus className="w-4 h-4 stroke-[2.5]" />
              </button>
              <span
                className={`text-sm font-bold text-[#2D3A4E] text-center ${counterInPacks ? 'min-w-6 whitespace-nowrap' : 'w-6'}`}
                aria-live="polite"
              >
                {counterMax === 0 ? 0 : counterValue}
                {counterInPacks && ' уп.'}
              </span>
              <button
                onClick={() => setCounter(Math.min(counterMax, counterValue + 1))}
                disabled={counterValue >= counterMax || counterMax === 0}
                className={`w-9 h-9 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] transition-opacity cursor-pointer ${
                  counterValue >= counterMax || counterMax === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:text-accent'
                }`}
                aria-label={packMode ? 'Увеличить число упаковок' : 'Увеличить количество'}
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Action Button: Add to Cart */}
            <button
              ref={addButtonRef}
              onClick={handleAddToCart}
              disabled={isAdded || counterMax === 0}
              className={`flex-1 basis-44 py-3.5 px-4 rounded-2xl font-bold text-sm whitespace-nowrap flex items-center justify-center gap-2.5 transition-all duration-300 cursor-pointer ${
                counterMax === 0
                  ? 'neu-button-disabled'
                  : isAdded
                  ? 'neu-button-success'
                  : 'neu-button-accent'
              }`}
            >
              {counterMax === 0 ? (
                <>
                  <X className="w-4 h-4" />
                  <span>{!packMode && orderableStock > 0 ? 'Нет целой упаковки' : 'Нет в наличии'}</span>
                </>
              ) : isAdded ? (
                <>
                  <Check className="w-4 h-4 stroke-[3] text-white animate-in zoom-in duration-200" />
                  <span className="animate-in fade-in duration-200">Добавлено!</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4 stroke-[2]" />
                  <span>{needsSize ? 'Выберите размер' : showPreorder ? 'Предзаказ' : 'В корзину'}</span>
                </>
              )}
            </button>
          </div>

          {/* A size pack that cannot be taken: the missing sizes are named right under the button */}
          {packMode && counterMax === 0 && (
            <p role="status" className="text-xs font-bold text-danger">
              {packUnavailableText}
            </p>
          )}

          {/* Fast 1-Click Order Button: retail only — a «Только оптом» product goes through the cart (packs, the
              volume discount) */}
          {orderableStock > 0 && sellsRetail(product) && !wholesaleMode && !packMode && (
            <button
              type="button"
              onClick={() => (sizeChosen ? setIsQuickOrderOpen(true) : askForSize())}
              className="w-full py-2.5 px-4 rounded-2xl neu-button text-xs font-bold text-accent hover:scale-101 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-accent" />
              <span>Заказать в 1 клик</span>
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Product information tabs: only sections that have data are shown */}
      {detailTabs.length > 0 && activeDetailTab && (
      <div className="neu-flat rounded-3xl p-4 border border-white/60 space-y-3">
        {/* Tab Switcher Bar */}
        <div className="neu-flat-sm p-1.5 rounded-2xl flex items-stretch justify-between gap-1" role="tablist">
          {detailTabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeDetailTab === tab.id}
                onClick={() => setDetailTab(tab.id)}
                className={`flex-1 min-h-10 py-2 px-2 rounded-xl text-xs font-bold leading-tight transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeDetailTab === tab.id ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tab Content Panel */}
        {/* panel without its own card: the block is already one (design pass 07.10 — no card inside a card) */}
        <div className="px-1.5 pt-1 space-y-3 text-xs text-[#2D3A4E]">
          {activeDetailTab === 'description' && (
            <div className="space-y-3 leading-relaxed text-[#4E5C70]">
              {product.description?.trim() && <p className="whitespace-pre-line">{product.description.trim()}</p>}
              {cardFeatures.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {cardFeatures.map((feature, idx) => (
                    <div key={idx} className="neu-inset rounded-xl p-2.5 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-extrabold text-xs text-[#2D3A4E]">{feature.title}</p>
                        {feature.text && <p className="text-xs text-[#4E5C70] leading-snug">{feature.text}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeDetailTab === 'specs' && (
            <div className="space-y-3">
              {(cardComposition.length > 0 || cardCertifications.length > 0) && (
                <div className="neu-inset rounded-2xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                      Состав ткани
                    </span>
                  </div>

                  {cardComposition.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {cardComposition.map((item, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between gap-2 text-xs font-bold text-[#2D3A4E]">
                            <span className="min-w-0">{item.fiber}</span>
                            <span className="text-accent font-extrabold shrink-0">{item.percentage}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full overflow-hidden neu-inset">
                            <div
                              className="h-full neu-fill-accent rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, item.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cardCertifications.length > 0 && (
                    <div className="pt-2 flex items-start gap-1.5 text-[11px] text-success font-semibold border-t border-[#BAC5D5]/40">
                      <ShieldCheck className="w-4 h-4 text-success shrink-0" />
                      <span>{cardCertifications.join(' • ')}</span>
                    </div>
                  )}
                </div>
              )}

              <dl className="space-y-0 text-xs">
                {cardSpecRows.map((row, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 py-2 border-b border-[#BAC5D5]/40 last:border-b-0">
                    <dt className="text-[#4E5C70] shrink-0">{row.label}</dt>
                    <dd className="font-bold text-[#2D3A4E] text-right min-w-0">{row.value}</dd>
                  </div>
                ))}
                {currentSKU?.skuCode && (
                  <div className="flex items-center justify-between gap-3 py-2 border-b border-[#BAC5D5]/40 last:border-b-0">
                    <dt className="text-[#4E5C70] shrink-0">Артикул</dt>
                    <dd className="font-mono font-bold text-accent text-[11px] px-2 py-0.5 rounded-lg neu-inset">
                      {currentSKU.skuCode}
                    </dd>
                  </div>
                )}
                {currentSKU?.barcode && (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-[#4E5C70] shrink-0">Штрихкод (EAN)</dt>
                    <dd className="font-mono text-[11px] text-[#2D3A4E] text-right">{currentSKU.barcode}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {activeDetailTab === 'care' && (
            <div className="space-y-2.5">
              {cardCare.map((care, idx) => (
                <div
                  key={idx}
                  className="neu-inset rounded-xl p-2.5 flex items-start gap-2.5"
                >
                  <div className="w-6 h-6 rounded-lg neu-flat-sm flex items-center justify-center shrink-0 mt-0.5 text-accent">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-[#2D3A4E]">{care.label}</p>
                    {care.desc && <p className="text-xs text-[#4E5C70] leading-snug mt-0.5">{care.desc}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

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
                <p className="text-xs text-[#4E5C70]">
                  {freeDelivery
                    ? `Бесплатная доставка от ${freeDelivery.threshold.toLocaleString('ru-RU')} ₽${
                        freeDeliveryMethodsText(freeDelivery) ? `: ${freeDeliveryMethodsText(freeDelivery)}` : ''
                      }`
                    : 'Способы и цены — при оформлении'}
                </p>
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
              Способы доставки, сроки и стоимость для вашего адреса видны при оформлении заказа.
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
              <div className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5 text-accent" />
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
                <p className="text-xs text-[#4E5C70]">{returnPeriodDays ? `${formatDays(returnPeriodDays)} на возврат` : 'Как вернуть товар'}</p>
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
              {returnPeriodDays
                ? `Возврат в течение ${formatDays(returnPeriodDays)} с момента получения при сохранении товарного вида и ярлыков. `
                : ''}
              Чтобы оформить возврат, напишите нам в чат поддержки.
            </div>
          )}
        </div>
      </div>

      {/* Customer Reviews & Feedback Section */}
      <ProductReviewsSection
        product={product}
        userProfile={userProfile}
        onShowToast={onShowToast || (() => {})}
      />

      {/* Recently Viewed Products */}
      {recentlyViewed.length > 0 && onSelectProduct && (
        <RecentlyViewed
          recentlyViewed={recentlyViewed}
          onSelectProduct={onSelectProduct}
          onClearRecentlyViewed={onClearRecentlyViewed}
          onRemoveFromRecentlyViewed={onRemoveFromRecentlyViewed}
        />
      )}

      {/* High Resolution Multi-angle Image Zoom Modal */}
      <LazyMount when={isZoomModalOpen}>
      <ProductImageZoomModal
        isOpen={isZoomModalOpen}
        images={photos.map((src, i) => src || productImage(product, i))}
        initialIndex={selectedImageIndex}
        onIndexChange={showPhoto}
        productTitle={product.title}
        onClose={() => setIsZoomModalOpen(false)}
      />
      </LazyMount>

      {/* Quick 1-Click Order Modal */}
      {!addButtonInView && counterMax > 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-[78px] z-30 px-3 pointer-events-none">
          <div className="max-w-md md:max-w-lg mx-auto neu-flat rounded-2xl p-2 flex items-center gap-3 pointer-events-auto">
            <div className="min-w-0 pl-1.5">
              <p className="text-base font-extrabold text-[#2D3A4E] leading-tight whitespace-nowrap">
                {(packMode
                  ? activePackPrice ?? 0
                  : wholesaleMode && offer
                  ? offer.packSize > 1
                    ? offer.packPrice
                    : offer.unitPrice
                  : product.price
                ).toLocaleString('ru-RU')}{' '}
                ₽
                {packMode ? (
                  <span className="text-xs font-bold text-[#4E5C70]">/уп.</span>
                ) : (
                  wholesaleMode &&
                  offer && <span className="text-xs font-bold text-[#4E5C70]">{offer.packSize > 1 ? '/уп.' : '/шт.'}</span>
                )}
              </p>
              <p className="text-xs text-[#4E5C70] leading-tight">
                {packMode
                  ? activePack
                    ? sizePackTitle(activePack)
                    : 'Ростовка'
                  : selectedSize
                  ? `Размер ${selectedSize}`
                  : 'Размер не выбран'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isAdded}
              className={`flex-1 py-3 px-2 rounded-xl font-bold text-sm whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${
                isAdded ? 'neu-button-success' : 'neu-button-accent'
              }`}
            >
              {isAdded ? <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" /> : <ShoppingBag className="w-4 h-4" aria-hidden="true" />}
              <span>{isAdded ? 'Добавлено' : needsSize ? 'Выберите размер' : showPreorder ? 'Предзаказ' : 'В корзину'}</span>
            </button>
          </div>
        </div>
      )}

      <LazyMount when={isQuickOrderOpen}>
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
        ordersPaused={ordersPaused}
        onSuccess={handleQuickOrderSuccess}
      />
      </LazyMount>

      {/* Size Calculator Modal */}
      <LazyMount when={isSizeCalcOpen}>
      <SizeCalculatorModal
        isOpen={isSizeCalcOpen}
        onClose={() => setIsSizeCalcOpen(false)}
        availableSizes={product.sizes}
        onSelectSize={(sz) => {
          setSelectedSize(sz);
          setSizeError(false);
        }}
        productFit={product.fit}
        productCategory={product.category}
        userProfile={userProfile}
        onSaveMeasurements={onSaveMeasurements}
      />
      </LazyMount>
    </div>
  );
};
