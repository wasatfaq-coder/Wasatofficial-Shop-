import React, { useRef, useState } from 'react';
import { X, ShoppingBag, Check, Ruler, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, UserProfile, BodyMeasurements } from '../types';
import { SizeCalculatorModal } from './SizeCalculatorModal';
import { RatingBadge } from './RatingBadge';
import { AnimatedFavoriteButton } from './AnimatedFavoriteButton';
import { getProductRating } from '../utils/productRating';
import { productImage } from '../utils/productImage';
import { useProductPhotos } from '../utils/useProductPhotos';
import { getOrderableStock, getVariantStock } from '../utils/inventory';
import { colorStock, initialColor, initialSize, maxOrderableForColor, profileSizeFor } from '../utils/variantSelection';
import { useDialogA11y } from '../utils/useDialogA11y';
import { useLiveProduct } from '../utils/liveProducts';
import { useProductThumb } from '../utils/productThumbs';
import { shownOldPrice } from '../utils/productBadge';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  isFavorite: boolean;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  onClose: () => void;
  onSelectFullProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCartWithOptions: (product: Product, color: string, size: string, quantity: number) => boolean | void;
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
  const [isAdded, setIsAdded] = useState(false);

  React.useEffect(() => {
    if (product) {
      setSelectedColor(initialColor(product, preorderMode));
      setSelectedSize(initialSize(product));
      setSizeError(false);
      setSelectedImageIndex(0);
    }
    // only another product resets the choice: its document coming does not
  }, [product?.id]);

  const sizeChosen = !product?.sizes?.length || Boolean(selectedSize);
  // Stock of the chosen size; before a size is chosen — of the whole colour
  const stock = !product ? 0 : sizeChosen ? getVariantStock(product, selectedColor, selectedSize) : colorStock(product, selectedColor);
  const orderable = !product
    ? 0
    : sizeChosen
    ? getOrderableStock(product, selectedColor, selectedSize, preorderMode)
    : maxOrderableForColor(product, selectedColor, preorderMode);

  const handleAdd = () => {
    if (!product) return;
    if (!sizeChosen) {
      setSizeError(true);
      sizesRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      return;
    }
    // Stays open: the toast has a «В корзину» link
    if (onAddToCartWithOptions(product, selectedColor, selectedSize, 1) === false) return;
    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
    }, 1000);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && product && (
          <motion.div
            key="quickview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          >
            <div
              onClick={onClose}
              className="fixed inset-0 bg-[#2D3A4E]/45 backdrop-blur-xs cursor-pointer"
            />
            <motion.div
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
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/60">
              <span className="text-xs font-extrabold uppercase tracking-wider text-accent neu-inset px-3 py-1 rounded-full">
                Быстрый просмотр
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E]"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
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
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wide">
                  {product.categoryLabel}
                </span>
                <RatingBadge
                  rating={getProductRating(product)?.rating}
                  reviewsCount={getProductRating(product)?.count}
                  showLabel
                  size="md"
                />
              </div>
              <h3 id={dialog.titleId} className="text-base font-bold text-[#2D3A4E] leading-tight">
                {product.title}
              </h3>
            </div>

            {/* Price & Stock */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-[#2D3A4E]">
                  {product.price.toLocaleString('ru-RU')} ₽
                </span>
                {shownOldPrice(product) !== null && (
                  <span className="text-xs text-[#4E5C70] line-through">
                    {shownOldPrice(product)!.toLocaleString('ru-RU')} ₽
                  </span>
                )}
              </div>
              <span
                className={`text-xs font-bold neu-flat-sm px-2.5 py-0.5 rounded-full ${
                  stock > 0 ? 'text-success' : orderable > 0 ? 'text-accent' : 'text-[#4E5C70]'
                }`}
              >
                {stock > 0 ? 'В наличии' : orderable > 0 ? 'Предзаказ' : 'Нет в наличии'}
              </span>
            </div>

            {/* Color options */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-[#2D3A4E]">
                <span>Цвет: {selectedColor}</span>
              </div>
              <div className="flex items-center gap-2" role="radiogroup" aria-label="Цвет">
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

            {/* Size options + Size calculator trigger */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2D3A4E]">
                  {selectedSize ? <>Размер: <span className="text-accent">{selectedSize}</span></> : 'Выберите размер'}
                  {mySize && (
                    <span className="ml-2 text-[11px] font-semibold text-[#4E5C70]">
                      Ваш: <span className="font-extrabold text-accent">{mySize}</span>
                    </span>
                  )}
                </span>
                <button
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
                  const canOrder = getOrderableStock(product, selectedColor, sz, preorderMode) > 0;
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
                          ? 'neu-flat text-[#4E5C70] opacity-60 line-through cursor-not-allowed'
                          : isSelected
                          ? 'neu-pill-active font-extrabold cursor-pointer'
                          : 'neu-button text-[#2D3A4E] hover:text-accent cursor-pointer'
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
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdded || orderable === 0}
                className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed ${
                  orderable === 0 ? 'neu-inset text-[#56647A]' : isAdded ? 'neu-button-success' : 'neu-button-accent'
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Добавлено в корзину</span>
                  </>
                ) : orderable === 0 ? (
                  <span>Нет в наличии</span>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>{sizeChosen ? `В корзину (${product.price.toLocaleString('ru-RU')} ₽)` : 'Выберите размер'}</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSelectFullProduct(product);
                }}
                className="neu-button p-3.5 rounded-2xl text-[#2D3A4E] hover:text-accent flex items-center justify-center shrink-0 cursor-pointer"
                title="Перейти к подробному описанию"
                aria-label="Перейти к подробному описанию"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
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
