import React, { useMemo, useRef, useState } from 'react';
import { X, ShoppingBag, Check, Ruler, ArrowRight, ChevronRight, Minus, Plus, Grid } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { Product, UserProfile, BodyMeasurements, CartItem } from '../types';
import { SizeCalculatorModal } from './SizeCalculatorModal';
import { RatingBadge } from './RatingBadge';
import { AnimatedFavoriteButton } from './AnimatedFavoriteButton';
import { getProductRating } from '../utils/productRating';
import { productImage } from '../utils/productImage';
import { useProductPhotos } from '../utils/useProductPhotos';
import { getOrderableStock, getVariantStock, isHiddenFromSale } from '../utils/inventory';
import { colorImageIndex } from '../utils/colorPhotos';
import { colorStock, initialColor, initialSize, maxOrderableForColor, profileSizeFor } from '../utils/variantSelection';
import { useDialogA11y } from '../utils/useDialogA11y';
import { useLiveProduct } from '../utils/liveProducts';
import { useProductThumb } from '../utils/productThumbs';
import { shownOldPrice } from '../utils/productBadge';
import {
  brokenPackDiscountedPrice,
  hasWholesalePrice,
  readBrokenPackDiscount,
  saleChannelOf,
  sellsWholesale,
  type WholesaleSettings,
} from '../shared/wholesalePricing';
import { wholesaleOfferOf } from '../utils/wholesaleOffer';
import { ProductWholesaleBlock, type BuyMode } from './ProductWholesaleBlock';
import { WholesaleMatrixPicker } from './WholesaleMatrixPicker';
import {
  findProductBrokenPack,
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
import { productSizeChart } from '../utils/sizeChart';
import { SizeChartTable } from './SizeChartTable';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  isFavorite: boolean;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  onClose: () => void;
  onSelectFullProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCartWithOptions: (
    product: Product,
    color: string,
    size: string,
    quantity: number,
    wholesale?: boolean | 'wholesale' | 'broken',
    quiet?: boolean
  ) => boolean | void;
  /** Добавление ростовки («Ростовкой», этап 20) в корзину прямо из быстрого просмотра */
  onAddPackToCart?: (product: Product, packId: string, color: string, packs: number, quiet?: boolean) => boolean;
  /** Текущие строки корзины для расчёта доступного числа ростовок */
  cartItems?: CartItem[];
  /** Настройки опта («Опт») со ступенями скидки за объём */
  wholesale?: WholesaleSettings;
  /** Admin → «Витрина» → «Предзаказ»: sold-out sizes can be ordered */
  preorderMode?: boolean;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product: shownProduct,
  isOpen,
  isFavorite,
  userProfile,
  onSaveMeasurements,
  onClose,
  onSelectFullProduct,
  onToggleFavorite,
  onAddToCartWithOptions,
  onAddPackToCart,
  cartItems = [],
  wholesale,
  preorderMode = false,
}) => {
  // the card's copy is an index line: photos, sections and the stock come with the product's document
  const product = useLiveProduct(shownProduct);
  const dialog = useDialogA11y(isOpen && Boolean(product), onClose);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { photos } = useProductPhotos(product, selectedImageIndex);
  const thumb = useProductThumb(product);
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0]?.name || '');
  // No size is preselected unless there is only one (same as the product page)
  const [selectedSize, setSelectedSize] = useState(() => initialSize(product));
  const mySize = profileSizeFor(product?.sizes, userProfile?.bodyMeasurements);
  const [sizeError, setSizeError] = useState(false);
  const sizesRef = useRef<HTMLDivElement>(null);
  const [isSizeCalcOpen, setIsSizeCalcOpen] = useState(false);
  const [isSizeChartOpen, setIsSizeChartOpen] = useState(false);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const offer = product ? wholesaleOfferOf(product, wholesale) : null;
  const sizePacks = useMemo(
    () =>
      product && sellsWholesale(product)
        ? productSizePacks(product).filter((pack) => sizePackPrice(product, pack) !== undefined)
        : [],
    [product]
  );
  const packsOffered = sizePacks.length > 0;
  const firstBrokenState = useMemo(() => (product ? findProductBrokenPack(product) : null), [product]);
  const brokenDiscount = useMemo(() => readBrokenPackDiscount(wholesale), [wholesale]);
  const brokenPackOffer = useMemo(() => {
    if (!product || saleChannelOf(product) !== 'both' || !hasWholesalePrice(product) || !firstBrokenState) return null;
    const base = product.wholesalePrice as number;
    return {
      unitPrice: brokenPackDiscountedPrice(base, brokenDiscount),
      baseWholesalePrice: base,
    };
  }, [product, firstBrokenState, brokenDiscount]);

  const [buyChoice, setBuyChoice] = useState<BuyMode>(() => (offer?.onlyWholesale ? 'wholesale' : 'retail'));
  const brokenMode = Boolean(brokenPackOffer) && buyChoice === 'broken';
  // as on the product page: with size packs «Оптом» sells whole packs, otherwise wholesale packs (review 16.10, finding 2)
  const wantsWholesale =
    !brokenMode && (buyChoice === 'pack' || (Boolean(offer) && (buyChoice === 'wholesale' || Boolean(offer?.onlyWholesale))));
  const packMode = packsOffered && wantsWholesale;
  const wholesaleMode = Boolean(offer) && !packsOffered && wantsWholesale;
  const step = wholesaleMode && offer ? offer.packSize : 1;
  const [quantity, setQuantity] = useState(1);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [packCount, setPackCount] = useState(1);

  const hasOffer = Boolean(offer);
  const onlyWholesale = Boolean(offer?.onlyWholesale);

  React.useEffect(() => {
    if (product) {
      setSelectedColor(initialColor(product, preorderMode));
      setSelectedSize(initialSize(product));
      setSizeError(false);
      setSelectedImageIndex(0);
      setIsSizeChartOpen(false);
      setIsMatrixOpen(false);
    }
    // only another product resets the choice: its document coming does not
  }, [product?.id]);

  React.useEffect(() => {
    setBuyChoice(onlyWholesale ? 'wholesale' : 'retail');
    setQuantity(onlyWholesale && offer ? offer.minPacks : 1);
    setSelectedPackId('');
    setPackCount(1);
  }, [product?.id, hasOffer, onlyWholesale]);

  const sizeChosen = !product?.sizes?.length || Boolean(selectedSize);
  // Stock of the chosen size; before a size is chosen — of the whole colour
  const stock = !product ? 0 : sizeChosen ? getVariantStock(product, selectedColor, selectedSize) : colorStock(product, selectedColor);
  const orderable = !product
    ? 0
    : sizeChosen
    ? getOrderableStock(product, selectedColor, selectedSize, preorderMode)
    : maxOrderableForColor(product, selectedColor, preorderMode);

  const maxCount = Math.floor(orderable / step);

  React.useEffect(() => {
    if (maxCount > 0) {
      setQuantity((prev) => (prev > maxCount ? maxCount : prev));
    } else {
      setQuantity(wholesaleMode && offer ? offer.minPacks : 1);
    }
  }, [selectedColor, selectedSize, maxCount]);

  const packColorNames = product ? sizePacks.flatMap((pack) => sizePackColors(product, pack)) : [];
  const packsForColor =
    packMode && product
      ? sizePacks.filter((pack) => sizePackColors(product, pack).some((c) => sameColor(c, selectedColor)))
      : [];
  const packsLeftOf = (pack: SizePack) =>
    product
      ? packsLeft(
          cartItems,
          { product, selectedColor, packSizes: pack.sizes },
          (size) => getOrderableStock(product, selectedColor, size, false)
        )
      : 0;
  const activePack: SizePack | null =
    packsForColor.find((pack) => pack.id === selectedPackId) ??
    packsForColor.find((pack) => packsLeftOf(pack) > 0) ??
    packsForColor[0] ??
    null;
  const packAvailable = activePack ? packsLeftOf(activePack) : 0;
  const packN = packAvailable === 0 ? 0 : Math.min(Math.max(packCount, 1), packAvailable);
  const activePackPrice = product && activePack ? sizePackPrice(product, activePack) : undefined;
  const activePackPieces = activePack ? sizePackPieces(activePack) : 0;
  const packMissingSizes =
    product && activePack
      ? activePack.sizes.filter((line) => getVariantStock(product, selectedColor, line.size) < line.qty).map((line) => line.size)
      : [];
  const packUnavailableText = !activePack
    ? 'В этом цвете ростовок нет — выберите другой цвет'
    : packMissingSizes.length > 0
    ? `Нет ${packMissingSizes.length > 1 ? 'размеров' : 'размера'} ${packMissingSizes.join(', ')}: ростовка недоступна`
    : product && isHiddenFromSale(product)
    ? 'Ростовка недоступна'
    : 'Весь остаток этой ростовки уже в вашей корзине';

  const cheapestPack = product
    ? sizePacks.reduce<number | null>((low, pack) => {
        const price = sizePackPrice(product, pack);
        return price !== undefined && (low === null || price < low) ? price : low;
      }, null)
    : null;
  const packFrom = packsOffered && cheapestPack !== null ? { price: cheapestPack, several: sizePacks.length > 1 } : null;

  const changeBuyMode = (mode: BuyMode) => {
    setBuyChoice(mode);
    if ((mode === 'pack' || (mode === 'wholesale' && packsOffered)) && product) {
      setPackCount(1);
      if (!packColorNames.some((c) => sameColor(c, selectedColor)) && packColorNames[0]) {
        setSelectedColor(packColorNames[0]);
        const boundPhoto = colorImageIndex(product, packColorNames[0]);
        if (boundPhoto !== null) setSelectedImageIndex(boundPhoto);
      }
      return;
    }
    const packs = offer ? Math.floor(orderable / offer.packSize) : 0;
    setQuantity(mode === 'wholesale' && offer ? Math.max(1, Math.min(offer.minPacks, packs)) : 1);
  };

  const counterMax = packMode ? packAvailable : maxCount;
  const counterValue = packMode ? packN : quantity;
  const counterInPacks = packMode || step > 1;
  const setCounter = (value: number) => (packMode ? setPackCount(value) : setQuantity(value));
  const sizeChart = product ? productSizeChart(product) : null;

  const handleAdd = () => {
    if (!product) return;
    if (packMode) {
      if (!onAddPackToCart) {
        onClose();
        onSelectFullProduct(product);
        return;
      }
      if (!activePack || packN === 0) return;
      if (onAddPackToCart(product, activePack.id, selectedColor, packN) === false) return;
      setIsAdded(true);
      setTimeout(() => {
        setIsAdded(false);
      }, 1000);
      return;
    }
    if (!sizeChosen) {
      setSizeError(true);
      sizesRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      return;
    }
    // Stays open: the toast has a «В корзину» link
    if (
      onAddToCartWithOptions(
        product,
        selectedColor,
        selectedSize,
        quantity * step,
        brokenMode ? 'broken' : wholesaleMode
      ) === false
    )
      return;
    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
    }, 1000);
  };

  const shownUnitOrPackPrice = packMode
    ? activePackPrice ?? 0
    : brokenMode && brokenPackOffer
    ? brokenPackOffer.unitPrice
    : wholesaleMode && offer
    ? offer.packSize > 1
      ? offer.packPrice
      : offer.unitPrice
    : product?.price ?? 0;

  const totalActionPrice = shownUnitOrPackPrice * Math.max(1, counterValue);

  return (
    <>
      <AnimatePresence>
        {isOpen && product && (
          <m.div
            key="quickview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          >
            <div
              onClick={onClose}
              className="fixed inset-0 bg-text-primary/45 backdrop-blur-xs cursor-pointer"
            />
            <m.div
              ref={dialog.ref}
              {...dialog.props}
              key="quickview-modal"
              initial={{ scale: 0.93, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-lg neu-modal rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar z-10"
            >
            {/* Header / Close */}
            <div className="flex items-center justify-between pb-2 neu-divider-b">
              <span className="text-xs font-extrabold uppercase tracking-wider text-accent neu-inset px-3 py-1 rounded-full">
                Быстрый просмотр
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* Gallery + Image preview */}
            <div className="space-y-2.5">
              {/* Main Image Box */}
              <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden flex items-center justify-center">
                <img
                  src={photos[selectedImageIndex] || (selectedImageIndex === 0 && thumb) || productImage(product, selectedImageIndex)}
                  alt={product.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover object-top rounded-xl"
                />
                <AnimatedFavoriteButton
                  isFavorite={isFavorite}
                  onToggle={(e) => onToggleFavorite(product, e)}
                  productTitle={product.title}
                  size="md"
                  className="absolute top-3 right-3 neu-photo-btn"
                />
              </div>

              {/* Horizontal thumbnails */}
              {product.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {photos.slice(0, 5).map((img, idx) => (
                    <button
                      key={`quickview-img-${product.id}-${idx}`}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`w-12 h-12 rounded-xl overflow-hidden p-0.5 transition-all shrink-0 ${
                        selectedImageIndex === idx ? 'neu-pill-active' : 'neu-button opacity-75 hover:opacity-100'
                      }`}
                      aria-label={`Фото ${idx + 1}`}
                      aria-current={selectedImageIndex === idx}
                    >
                      <img
                        src={img || productImage(product, idx)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Title & Info */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">
                  {product.categoryLabel}
                </span>
                <RatingBadge
                  rating={getProductRating(product)?.rating}
                  reviewsCount={getProductRating(product)?.count}
                  showLabel
                  size="md"
                />
              </div>
              <h3 id={dialog.titleId} className="text-base font-bold text-text-primary leading-tight">
                {product.title}
              </h3>
            </div>

            {/* Price & Stock */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                {packMode ? (
                  activePack && activePackPrice !== undefined ? (
                    <span className="text-xl font-bold text-text-primary tabular-nums">
                      {activePackPrice.toLocaleString('ru-RU')} ₽
                      <span className="text-xs text-text-secondary">/уп. ({activePackPieces} шт.)</span>
                    </span>
                  ) : null
                ) : (
                  <span className="text-xl font-bold text-text-primary tabular-nums">
                    {shownUnitOrPackPrice.toLocaleString('ru-RU')} ₽
                    {wholesaleMode && offer && (
                      <span className="text-xs text-text-secondary">
                        {offer.packSize > 1 ? `/уп. (${offer.packSize} шт.) оптом` : '/шт. оптом'}
                      </span>
                    )}
                  </span>
                )}
                {!packMode && !wholesaleMode && shownOldPrice(product) !== null && (
                  <span className="text-xs text-text-secondary line-through tabular-nums">
                    {shownOldPrice(product)!.toLocaleString('ru-RU')} ₽
                  </span>
                )}
              </div>
              <span
                className={`text-xs font-bold neu-flat-sm px-2.5 py-0.5 rounded-full ${
                  packMode
                    ? packAvailable > 0
                      ? 'text-success'
                      : 'text-text-secondary'
                    : stock > 0
                    ? 'text-success'
                    : orderable > 0
                    ? 'text-accent'
                    : 'text-text-secondary'
                }`}
              >
                {packMode
                  ? packAvailable > 0
                    ? `Доступно: ${packAvailable} уп.`
                    : 'Нет в наличии'
                  : stock > 0
                  ? 'В наличии'
                  : orderable > 0
                  ? 'Предзаказ'
                  : 'Нет в наличии'}
              </span>
            </div>

            {offer && (
              <ProductWholesaleBlock
                offer={offer}
                retailPrice={product.price}
                mode={brokenMode ? 'broken' : packMode ? 'pack' : wholesaleMode ? 'wholesale' : 'retail'}
                onChangeMode={changeBuyMode}
                packFrom={packFrom}
                brokenPack={brokenPackOffer}
              />
            )}

            {offer && (wholesaleMode || packMode) && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setIsMatrixOpen((open) => !open)}
                  aria-expanded={isMatrixOpen}
                  className={`w-full min-h-10 px-3 py-2 rounded-2xl text-xs font-extrabold flex items-center justify-between gap-2 cursor-pointer transition-all ${
                    isMatrixOpen ? 'neu-pill-active text-accent' : 'neu-button text-text-primary hover:text-accent'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Grid className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                    <span>
                      {packMode
                        ? 'Быстрый набор ростовок по цветам (шахматка)'
                        : 'Быстрый набор нескольких цветов и размеров (шахматка)'}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isMatrixOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                {isMatrixOpen && (
                  <WholesaleMatrixPicker
                    product={product}
                    mode={packMode ? 'pack' : 'wholesale'}
                    offer={offer}
                    sizePacks={sizePacks}
                    cartItems={cartItems}
                    preorderMode={preorderMode}
                    onAddWholesaleLine={onAddToCartWithOptions}
                    onAddPackLine={onAddPackToCart}
                  />
                )}
              </div>
            )}

            {/* Color options */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-text-primary">
                <span>Цвет: {selectedColor}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-label="Цвет">
                {product.colors.map((c, cIdx) => {
                  const isSelected = selectedColor === c.name;
                  return (
                    <button
                      key={`quickview-col-${product.id}-${c.name}-${cIdx}`}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={c.name}
                      onClick={() => {
                        setSelectedColor(c.name);
                        // optional photo bound to the colour: only on the click
                        const boundPhoto = colorImageIndex(product, c.name);
                        if (boundPhoto !== null) setSelectedImageIndex(boundPhoto);
                        if (selectedSize && getOrderableStock(product, c.name, selectedSize, preorderMode) === 0) setSelectedSize(initialSize(product));
                      }}
                      className={`w-8 h-8 rounded-full p-1 transition-all cursor-pointer ${
                        isSelected ? 'neu-pill-active' : 'neu-button'
                      }`}
                      title={c.name}
                    >
                      <span
                        className="w-full h-full rounded-full block border border-black/15"
                        style={{ backgroundColor: c.hex }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size options or Pack selector + Size chart & calculator */}
            <div className="space-y-2 pt-1">
              {!packMode ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary">
                      {selectedSize ? <>Размер: <span className="text-accent">{selectedSize}</span></> : 'Выберите размер'}
                      {mySize && (
                        <span className="ml-2 text-[11px] font-semibold text-text-secondary">
                          Ваш: <span className="font-extrabold text-accent">{mySize}</span>
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSizeCalcOpen(true)}
                      className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Ruler className="w-3.5 h-3.5" />
                      <span>Подобрать размер</span>
                    </button>
                  </div>

                  <div
                    ref={sizesRef}
                    className="flex items-center gap-2 flex-wrap"
                    role="radiogroup"
                    aria-label="Размер"
                    aria-describedby={sizeError ? 'quickview-size-error' : undefined}
                  >
                    {product.sizes.map((sz, szIdx) => {
                      const isSelected = selectedSize === sz;
                      const szOrderable = getOrderableStock(product, selectedColor, sz, preorderMode);
                      const canOrder = szOrderable >= step;
                      return (
                        <button
                          key={`quickview-sz-${product.id}-${sz}-${szIdx}`}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={!canOrder}
                          onClick={() => {
                            setSelectedSize(sz);
                            setSizeError(false);
                          }}
                          className={`min-w-[40px] h-10 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                            !canOrder
                              ? 'neu-flat text-text-secondary opacity-60 line-through cursor-not-allowed'
                              : isSelected
                              ? 'neu-pill-active font-extrabold cursor-pointer'
                              : 'neu-button text-text-primary hover:text-accent cursor-pointer'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                  {sizeError && (
                    <p id="quickview-size-error" role="alert" className="text-xs font-bold text-danger">
                      Выберите размер
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-text-primary">
                      {packsForColor.length > 1 ? 'Выберите ростовку' : 'Ростовка'}
                    </span>
                    {activePack && (
                      <span className="text-[11px] font-extrabold text-accent">{activePackPieces} шт. в упаковке</span>
                    )}
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
                                  ? 'neu-pill-active text-text-secondary'
                                  : 'neu-flat text-text-secondary'
                                : isSelected
                                ? 'neu-pill-active'
                                : 'neu-button text-text-primary hover:text-accent'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-extrabold">{sizePackTitle(pack)}</span>
                              <span className="block text-xs text-text-secondary">{sizePackCompositionText(pack)}</span>
                            </span>
                            <span className="shrink-0 text-right tabular-nums">
                              {price !== undefined && (
                                <span className="block text-xs font-extrabold whitespace-nowrap">{price.toLocaleString('ru-RU')} ₽</span>
                              )}
                              <span className="block text-[11px] font-medium text-text-secondary">{left > 0 ? `${left} уп.` : 'нет'}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs font-bold text-text-secondary">{packUnavailableText}</p>
                  )}
                </>
              )}

              {sizeChart && (
                <div className="space-y-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setIsSizeChartOpen((open) => !open)}
                    aria-expanded={isSizeChartOpen}
                    aria-controls="quickview-size-chart"
                    className="min-h-8 -ml-1 px-1 rounded-lg text-xs font-bold text-accent hover:text-accent-strong flex items-center gap-1.5 cursor-pointer"
                  >
                    <Ruler className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Размерная сетка</span>
                    <ChevronRight
                      aria-hidden="true"
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isSizeChartOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {isSizeChartOpen && (
                    <SizeChartTable id="quickview-size-chart" chart={sizeChart} selectedSize={selectedSize} />
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {(wholesaleMode || packMode || counterMax > 1) && (
                <div className="neu-inset rounded-full p-1 flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCounter(Math.max(1, counterValue - 1))}
                    disabled={counterValue <= 1 || counterMax === 0}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      counterValue <= 1 || counterMax === 0
                        ? 'neu-button-disabled'
                        : 'neu-button text-text-primary hover:text-accent cursor-pointer'
                    }`}
                    aria-label={counterInPacks ? 'Уменьшить число упаковок' : 'Уменьшить количество'}
                  >
                    <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                  <span
                    className={`text-xs font-bold text-text-primary text-center tabular-nums ${
                      counterInPacks ? 'min-w-10 px-1 whitespace-nowrap' : 'w-6'
                    }`}
                    aria-live="polite"
                  >
                    {counterMax === 0 ? 0 : counterValue}
                    {counterInPacks && ' уп.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCounter(Math.min(counterMax, counterValue + 1))}
                    disabled={counterValue >= counterMax || counterMax === 0}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      counterValue >= counterMax || counterMax === 0
                        ? 'neu-button-disabled'
                        : 'neu-button text-text-primary hover:text-accent cursor-pointer'
                    }`}
                    aria-label={counterInPacks ? 'Увеличить число упаковок' : 'Увеличить количество'}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdded || (packMode ? packAvailable === 0 : counterMax === 0)}
                className={`flex-1 min-w-[170px] py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed ${
                  (packMode ? packAvailable === 0 : counterMax === 0)
                    ? 'neu-inset text-text-muted'
                    : isAdded
                    ? 'neu-button-success'
                    : 'neu-button-accent'
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Добавлено в корзину</span>
                  </>
                ) : (packMode ? packAvailable === 0 : counterMax === 0) ? (
                  <span>Нет в наличии</span>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span className="tabular-nums">
                      {packMode
                        ? activePack && activePackPrice !== undefined
                          ? `В корзину (${totalActionPrice.toLocaleString('ru-RU')} ₽)`
                          : 'Ростовка недоступна'
                        : sizeChosen
                        ? `В корзину (${totalActionPrice.toLocaleString('ru-RU')} ₽)`
                        : 'Выберите размер'}
                    </span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSelectFullProduct(product);
                }}
                className="neu-button p-3.5 rounded-2xl text-text-primary hover:text-accent flex items-center justify-center shrink-0 cursor-pointer"
                title="Перейти к подробному описанию"
                aria-label="Перейти к подробному описанию"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>

    {/* Size Calculator Modal inside Quick View */}
    {product && (
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
    )}
  </>
);
};
