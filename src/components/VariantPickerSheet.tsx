import React, { useEffect, useRef, useState } from 'react';
import { ProductThumbImage } from './ProductThumbImage';
import { X, ShoppingBag, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product } from '../types';
import { ModalPortal } from './ModalPortal';
import { getOrderableStock, getVariantStock } from '../utils/inventory';
import { initialColor, initialSize } from '../utils/variantSelection';
import { useDialogA11y } from '../utils/useDialogA11y';
import { useLiveProduct } from '../utils/liveProducts';

interface VariantPickerSheetProps {
  /** Product whose «+» was pressed; null — closed */
  product: Product | null;
  preorderMode: boolean;
  onClose: () => void;
  /** Resolves to false when nothing was added (the App shows why) */
  onAdd: (product: Product, color: string, size: string) => boolean | void;
  onOpenProduct: (product: Product) => void;
}

/**
 * «+» on a product card with several sizes or colours: asks which one instead of adding the first.
 * Bottom sheet on the phone, a window on the desktop; Escape and the backdrop close it (useDialogA11y).
 */
export const VariantPickerSheet: React.FC<VariantPickerSheetProps> = ({
  product: shownProduct,
  preorderMode,
  onClose,
  onAdd,
  onOpenProduct,
}) => {
  // the stock of the variants as in the database, not as in the catalog index
  const product = useLiveProduct(shownProduct);
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [sizeError, setSizeError] = useState(false);
  const sizesRef = useRef<HTMLDivElement>(null);
  // Focus trap, Escape, focus return — the shared window behaviour
  const dialog = useDialogA11y(Boolean(product), onClose);

  useEffect(() => {
    if (!product) return;
    setColor(initialColor(product, preorderMode));
    setSize(initialSize(product));
    setSizeError(false);
    // Reset only when another product is opened
  }, [product?.id]);

  const firstOrderableSize = product?.sizes.find((sz) => getOrderableStock(product, color, sz, preorderMode) > 0);

  const handleAdd = () => {
    if (!product) return;
    if (!size) {
      setSizeError(true);
      sizesRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      return;
    }
    if (onAdd(product, color, size) !== false) onClose();
  };

  return (
    <ModalPortal>
      <AnimatePresence>
        {product && (
          <motion.div
            key="variant-picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4"
          >
            <div
              onClick={onClose}
              className="fixed inset-0 bg-[#2D3A4E]/45 backdrop-blur-xs cursor-pointer"
              aria-hidden="true"
            />
            <motion.div
              ref={dialog.ref}
              {...dialog.props}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full sm:max-w-md neu-modal rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85dvh] overflow-y-auto no-scrollbar border border-white/80 z-10"
            >
              {/* Product */}
              <div className="flex items-start gap-3">
                <ProductThumbImage
                  product={product}
                  alt=""
                  className="w-14 h-[72px] rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h2 id={dialog.titleId} className="text-sm font-bold text-[#2D3A4E] leading-snug line-clamp-2">
                    {product.title}
                  </h2>
                  <p className="font-display text-base font-extrabold text-[#2D3A4E] mt-1">
                    {product.price.toLocaleString('ru-RU')} ₽
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] shrink-0 cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Colour: only when there is a choice */}
              {product.colors.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-[#2D3A4E]">
                    Цвет: <span className="text-accent">{color}</span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-label="Цвет">
                    {product.colors.map((c) => {
                      const isSelected = color === c.name;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={c.name}
                          title={c.name}
                          onClick={() => {
                            setColor(c.name);
                            // The chosen size may be sold out in the new colour: ask again
                            if (size && getOrderableStock(product, c.name, size, preorderMode) === 0) setSize('');
                          }}
                          className={`w-9 h-9 rounded-full p-1 cursor-pointer transition-all ${
                            isSelected ? 'neu-pill-active' : 'neu-button'
                          }`}
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
              )}

              {/* Size (focus starts on the first one that can be ordered) */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#2D3A4E]">
                  Размер{size ? <>: <span className="text-accent">{size}</span></> : null}
                </p>
                <div
                  ref={sizesRef}
                  className="flex items-center gap-2 flex-wrap"
                  role="radiogroup"
                  aria-label="Размер"
                  aria-describedby={sizeError ? 'variant-picker-size-error' : undefined}
                >
                  {product.sizes.map((sz) => {
                    const isSelected = size === sz;
                    const stock = getVariantStock(product, color, sz);
                    const orderable = getOrderableStock(product, color, sz, preorderMode);
                    return (
                      <button
                        key={sz}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-autofocus={sz === firstOrderableSize ? '' : undefined}
                        disabled={orderable === 0}
                        onClick={() => {
                          setSize(sz);
                          setSizeError(false);
                        }}
                        className={`min-h-[46px] min-w-[54px] px-3 py-1.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                          orderable === 0
                            ? 'neu-flat text-[#4E5C70] opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'neu-pill-active cursor-pointer'
                            : 'neu-button text-[#2D3A4E] hover:text-accent cursor-pointer'
                        }`}
                      >
                        <span className={orderable === 0 ? 'line-through' : undefined}>{sz}</span>
                        <span className={`text-[11px] font-medium ${isSelected ? 'text-accent' : 'text-[#4E5C70]'}`}>
                          {stock > 0 ? `${stock} шт.` : orderable > 0 ? 'предзаказ' : 'нет'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {sizeError && (
                  <p id="variant-picker-size-error" role="alert" className="text-xs font-bold text-danger">
                    Выберите размер
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProduct(product);
                  }}
                  className="h-12 px-3.5 rounded-2xl neu-button text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>О товаре</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="flex-1 h-12 px-4 rounded-2xl neu-button-accent text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                  <span>{size ? 'Добавить в корзину' : 'Выберите размер'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
};
