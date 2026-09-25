import React, { useState } from 'react';
import { X, ShoppingBag, Check, Ruler, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, UserProfile, BodyMeasurements } from '../types';
import { SizeCalculatorModal } from './SizeCalculatorModal';
import { RatingBadge } from './RatingBadge';
import { AnimatedFavoriteButton } from './AnimatedFavoriteButton';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  isFavorite: boolean;
  isInCart: boolean;
  userProfile?: UserProfile;
  onSaveMeasurements?: (measurements: BodyMeasurements) => void;
  onClose: () => void;
  onSelectFullProduct: (product: Product) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onAddToCartWithOptions: (product: Product, color: string, size: string, quantity: number) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product,
  isOpen,
  isFavorite,
  isInCart,
  userProfile,
  onSaveMeasurements,
  onClose,
  onSelectFullProduct,
  onToggleFavorite,
  onAddToCartWithOptions,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState(product?.sizes?.[0] || 'M');
  const [isSizeCalcOpen, setIsSizeCalcOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  React.useEffect(() => {
    if (product) {
      setSelectedColor(product.colors?.[0]?.name || '');
      setSelectedSize(product.sizes?.[0] || 'M');
      setSelectedImageIndex(0);
    }
  }, [product]);

  const handleAdd = () => {
    if (!product) return;
    onAddToCartWithOptions(product, selectedColor, selectedSize, 1);
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
              <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden neu-inset flex items-center justify-center">
                <img
                  src={product.images?.[selectedImageIndex] || product.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                  alt={product.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover object-top rounded-xl"
                />
                <AnimatedFavoriteButton
                  isFavorite={isFavorite}
                  onToggle={(e) => onToggleFavorite(product, e)}
                  size="md"
                  className="absolute top-3 right-3 neu-photo-btn"
                />
              </div>

              {/* Horizontal thumbnails */}
              {product.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {product.images.slice(0, 5).map((img, idx) => (
                    <button
                      key={`quickview-img-${product.id}-${idx}`}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`w-12 h-12 rounded-xl overflow-hidden p-0.5 transition-all shrink-0 ${
                        selectedImageIndex === idx
                          ? 'neu-inset ring-2 ring-accent scale-105'
                          : 'neu-button opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={img}
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
                  rating={product.rating}
                  reviewsCount={product.reviewsCount}
                  showLabel
                  size="md"
                />
              </div>
              <h3 className="text-base font-bold text-[#2D3A4E] leading-tight">
                {product.title}
              </h3>
            </div>

            {/* Price & Stock */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-[#2D3A4E]">
                  {product.price.toLocaleString('ru-RU')} ₽
                </span>
                {product.originalPrice && (
                  <span className="text-xs text-[#4E5C70] line-through">
                    {product.originalPrice.toLocaleString('ru-RU')} ₽
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-success neu-inset px-2.5 py-0.5 rounded-full">
                В наличии
              </span>
            </div>

            {/* Color options */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-[#2D3A4E]">
                <span>Цвет: {selectedColor}</span>
              </div>
              <div className="flex items-center gap-2">
                {product.colors.map((c, cIdx) => {
                  const isSelected = selectedColor === c.name;
                  return (
                    <button
                      key={`quickview-col-${product.id}-${c.name}-${cIdx}`}
                      onClick={() => setSelectedColor(c.name)}
                      className={`w-7 h-7 rounded-full p-0.5 transition-all ${
                        isSelected ? 'neu-inset scale-110' : 'neu-button opacity-80 hover:opacity-100'
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
                <span className="text-xs font-bold text-[#2D3A4E]">Размер: {selectedSize}</span>
                <button
                  onClick={() => setIsSizeCalcOpen(true)}
                  className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Ruler className="w-3.5 h-3.5" />
                  <span>Подобрать размер</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {product.sizes.map((sz, szIdx) => {
                  const isSelected = selectedSize === sz;
                  return (
                    <button
                      key={`quickview-sz-${product.id}-${sz}-${szIdx}`}
                      onClick={() => setSelectedSize(sz)}
                      className={`min-w-[38px] h-9 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'neu-pill-active font-black'
                          : 'neu-button text-[#2D3A4E] hover:text-[#1E293B]'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleAdd}
                disabled={isAdded}
                className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
                  isAdded ? 'neu-button-success' : 'neu-button-accent'
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Добавлено в корзину</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>В корзину ({product.price.toLocaleString('ru-RU')} ₽)</span>
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
        onSelectSize={(sz) => setSelectedSize(sz)}
        productFit={product.fit}
        productCategory={product.category}
        userProfile={userProfile}
        onSaveMeasurements={onSaveMeasurements}
      />
    )}
  </>
);
};
