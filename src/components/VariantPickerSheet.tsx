import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProductThumbImage } from './ProductThumbImage';
import { X, ShoppingBag, ArrowRight, Minus, Plus } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import type { CartItem, Product } from '../types';
import { ModalPortal } from './ModalPortal';
import { getOrderableStock, getVariantStock } from '../utils/inventory';
import { initialColor, initialSize, maxOrderableForColor } from '../utils/variantSelection';
import { useDialogA11y } from '../utils/useDialogA11y';
import { useLiveProduct } from '../utils/liveProducts';
import { type WholesaleSettings } from '../shared/wholesalePricing';
import { wholesaleOfferOf } from '../utils/wholesaleOffer';
import { ProductWholesaleBlock, type BuyMode } from './ProductWholesaleBlock';
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

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

interface VariantPickerSheetProps {
  /** Product whose «+» was pressed; null — closed */
  product: Product | null;
  preorderMode: boolean;
  onClose: () => void;
  /** Resolves to false when nothing was added (the App shows why) */
  onAdd: (product: Product, color: string, size: string, quantity?: number, wholesale?: boolean) => boolean | void;
  /** Добавление ростовки («Ростовкой») в корзину прямо из шторки каталога */
  onAddPackToCart?: (product: Product, packId: string, color: string, packs: number) => boolean;
  /** Текущие строки корзины для расчёта доступного числа ростовок */
  cartItems?: CartItem[];
  /** Настройки опта со ступенями скидки за объём */
  wholesale?: WholesaleSettings;
  onOpenProduct: (product: Product) => void;
}

/**
 * «+» on a product card in the catalog: lets the customer choose «В розницу / Оптом / Ростовкой»,
 * colour, size or size pack, and quantity without leaving the catalog.
 * Bottom sheet on the phone, a window on the desktop; Escape and the backdrop close it (useDialogA11y).
 */
export const VariantPickerSheet: React.FC<VariantPickerSheetProps> = ({
  product: shownProduct,
  preorderMode,
  onClose,
  onAdd,
  onAddPackToCart,
  cartItems = [],
  wholesale,
  onOpenProduct,
}) => {
  // the stock of the variants as in the database, not as in the catalog index
  const product = useLiveProduct(shownProduct);
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [sizeError, setSizeError] = useState(false);
  const [buyMode, setBuyMode] = useState<BuyMode>('retail');
  const [quantity, setQuantity] = useState(1);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [packQuantity, setPackQuantity] = useState(1);
  const sizesRef = useRef<HTMLDivElement>(null);
  // Focus trap, Escape, focus return — the shared window behaviour
  const dialog = useDialogA11y(Boolean(product), onClose);

  const offer = useMemo(() => (product ? wholesaleOfferOf(product, wholesale) : null), [product, wholesale]);

  // Priced size packs («Ростовкой»)
  const pricedPacks = useMemo((): { pack: SizePack; price: number }[] => {
    if (!product) return [];
    return productSizePacks(product).flatMap((pack) => {
      const price = sizePackPrice(product, pack);
      return price === undefined ? [] : [{ pack, price }];
    });
  }, [product]);

  const packFrom = useMemo(() => {
    if (!pricedPacks.length || !onAddPackToCart) return null;
    const minPrice = Math.min(...pricedPacks.map((p) => p.price));
    const several = pricedPacks.some((p) => p.price !== minPrice);
    return { price: minPrice, several };
  }, [pricedPacks, onAddPackToCart]);

  const effectiveBuyMode: BuyMode =
    buyMode === 'pack' && packFrom
      ? 'pack'
      : offer
      ? offer.onlyWholesale
        ? 'wholesale'
        : buyMode === 'wholesale'
        ? 'wholesale'
        : 'retail'
      : 'retail';
  const isWholesale = effectiveBuyMode === 'wholesale';
  const isPackMode = effectiveBuyMode === 'pack';
  const packStep = isWholesale && offer ? offer.packSize : 1;

  const countPacksLeft = (pack: SizePack, clr: string) =>
    product
      ? packsLeft(
          cartItems,
          { product, selectedColor: clr, packSizes: pack.sizes },
          (sz) => getOrderableStock(product, clr, sz, false)
        )
      : 0;

  // Packs offered for the selected colour
  const packsForColor = useMemo(() => {
    if (!product) return [];
    return pricedPacks.filter(({ pack }) =>
      sizePackColors(product, pack).some((c) => sameColor(c, color))
    );
  }, [pricedPacks, product, color]);

  const activePackEntry = useMemo(() => {
    if (!packsForColor.length) return null;
    const chosen = packsForColor.find(({ pack }) => pack.id === selectedPackId);
    if (chosen) return chosen;
    const inStock = product
      ? packsForColor.find(({ pack }) => countPacksLeft(pack, color) > 0)
      : undefined;
    return inStock ?? packsForColor[0];
  }, [packsForColor, selectedPackId, product, color, cartItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePack = activePackEntry?.pack ?? null;
  const activePackPrice = activePackEntry?.price ?? 0;
  const packMax = product && activePack ? countPacksLeft(activePack, color) : 0;
  const packCount = packMax > 0 ? Math.min(Math.max(1, packQuantity), packMax) : 1;

  useEffect(() => {
    if (!product) return;
    const nextOffer = wholesaleOfferOf(product, wholesale);
    const nextColor = initialColor(product, preorderMode);
    setColor(nextColor);
    setSize(initialSize(product));
    setSizeError(false);
    setBuyMode(nextOffer?.onlyWholesale ? 'wholesale' : 'retail');
    setQuantity(nextOffer?.onlyWholesale ? nextOffer.packSize : 1);
    setSelectedPackId('');
    setPackQuantity(1);
    // Reset only when another product is opened
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstOrderableSize = product?.sizes.find(
    (sz) => getOrderableStock(product, color, sz, preorderMode) >= packStep
  );

  // Selected variant stock & max quantity in retail / wholesale mode
  const rawMaxQuantity = product
    ? size
      ? getOrderableStock(product, color, size, preorderMode)
      : maxOrderableForColor(product, color, preorderMode)
    : 0;
  const maxQuantity = Math.floor(rawMaxQuantity / packStep) * packStep;
  const effectiveQty =
    maxQuantity > 0
      ? Math.min(Math.max(packStep, Math.floor(quantity / packStep) * packStep), maxQuantity)
      : packStep;

  const handleChangeMode = (next: BuyMode) => {
    setBuyMode(next);
    setSizeError(false);
    if (next === 'pack') {
      setPackQuantity(1);
      if (product) {
        const firstColorWithPack = product.colors.find((c) =>
          pricedPacks.some(
            ({ pack }) =>
              sizePackColors(product, pack).some((pc) => sameColor(pc, c.name)) &&
              countPacksLeft(pack, c.name) > 0
          )
        );
        if (firstColorWithPack && !packsForColor.some(({ pack }) => countPacksLeft(pack, color) > 0)) {
          setColor(firstColorWithPack.name);
        }
      }
      return;
    }
    const nextStep = next === 'wholesale' && offer ? offer.packSize : 1;
    setQuantity(nextStep);
    if (product && size && getOrderableStock(product, color, size, preorderMode) < nextStep) {
      setSize('');
    }
  };

  const handleAdd = () => {
    if (!product) return;
    if (isPackMode) {
      if (!activePack || packMax <= 0 || !onAddPackToCart) return;
      if (onAddPackToCart(product, activePack.id, color, packCount)) onClose();
      return;
    }
    if (!size) {
      setSizeError(true);
      sizesRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      return;
    }
    if (maxQuantity <= 0) return;
    if (onAdd(product, color, size, effectiveQty, isWholesale) !== false) onClose();
  };

  const displayedPrice = isPackMode && activePackEntry
    ? `${rub(activePackPrice)} / уп.`
    : isWholesale && offer
    ? offer.packSize > 1
      ? `${rub(offer.packPrice)} / уп. (${rub(offer.unitPrice)}/шт.)`
      : `${rub(offer.unitPrice)} / шт.`
    : product
    ? rub(product.price)
    : '';

  return (
    <ModalPortal>
      <AnimatePresence>
        {product && (
          <m.div
            key="variant-picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4"
          >
            <div
              onClick={onClose}
              className="fixed inset-0 bg-text-primary/45 backdrop-blur-xs cursor-pointer"
              aria-hidden="true"
            />
            <m.div
              ref={dialog.ref}
              {...dialog.props}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full sm:max-w-md neu-modal rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85dvh] overflow-y-auto no-scrollbar z-10"
            >
              {/* Product */}
              <div className="flex items-start gap-3">
                <ProductThumbImage
                  product={product}
                  alt=""
                  className="w-14 h-[72px] rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h2 id={dialog.titleId} className="text-sm font-bold text-text-primary leading-snug line-clamp-2">
                    {product.title}
                  </h2>
                  <p className="font-display text-base font-extrabold text-text-primary mt-1 tabular-nums">
                    {displayedPrice}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary shrink-0 cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Buy mode switcher: В розницу / Оптом / Ростовкой */}
              {offer ? (
                <ProductWholesaleBlock
                  offer={offer}
                  retailPrice={product.price}
                  mode={effectiveBuyMode}
                  onChangeMode={handleChangeMode}
                  packFrom={packFrom}
                />
              ) : (
                packFrom && (
                  <div role="radiogroup" aria-label="Как покупаете" className="grid grid-cols-2 gap-2">
                    {[
                      { mode: 'retail' as const, title: 'В розницу', price: rub(product.price) },
                      {
                        mode: 'pack' as const,
                        title: 'Ростовкой',
                        price: `${packFrom.several ? 'от ' : ''}${rub(packFrom.price)}/уп.`,
                      },
                    ].map((choice) => {
                      const selected = choice.mode === effectiveBuyMode;
                      return (
                        <button
                          key={choice.mode}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => handleChangeMode(choice.mode)}
                          className={`min-h-11 px-3 py-2 rounded-2xl text-left cursor-pointer transition-all ${
                            selected ? 'neu-pill-active' : 'neu-button text-text-primary hover:text-accent'
                          }`}
                        >
                          <span className="block text-xs font-extrabold">{choice.title}</span>
                          <span className="block text-xs text-text-secondary whitespace-nowrap">{choice.price}</span>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {/* Colour: only when there is a choice */}
              {product.colors.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-text-primary">
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
                            setPackQuantity(1);
                            // The chosen size may be sold out or smaller than a wholesale pack in the new colour
                            if (size && getOrderableStock(product, c.name, size, preorderMode) < packStep) {
                              setSize('');
                            }
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

              {/* Size or Size Pack («Ростовка») */}
              {isPackMode ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-text-primary">
                    Ростовка ({color})
                  </p>
                  {packsForColor.length === 0 ? (
                    <p className="text-xs font-bold text-danger">
                      Для цвета «{color}» ростовка не собирается — выберите другой цвет.
                    </p>
                  ) : (
                    <>
                      {packsForColor.length > 1 && (
                        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Вариант ростовки">
                          {packsForColor.map(({ pack, price }) => {
                            const selected = activePack?.id === pack.id;
                            const left = countPacksLeft(pack, color);
                            const title = sizePackTitle(pack);
                            const pieces = sizePackPieces(pack);
                            return (
                              <button
                                key={pack.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => {
                                  setSelectedPackId(pack.id);
                                  setPackQuantity(1);
                                }}
                                className={`p-3 rounded-2xl text-left cursor-pointer transition-all ${
                                  selected
                                    ? 'neu-pill-active'
                                    : left > 0
                                    ? 'neu-button text-text-primary'
                                    : 'neu-flat text-text-secondary opacity-70'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-extrabold">{title}</span>
                                  <span className="text-xs font-extrabold tabular-nums">
                                    {rub(price)}/уп. · {pieces} шт.
                                  </span>
                                </div>
                                <p className="text-[11px] text-text-secondary mt-0.5">
                                  {sizePackCompositionText(pack)} ·{' '}
                                  {left > 0 ? `в наличии ${left} уп.` : 'нет полных уп.'}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {activePack && (
                        <div className="neu-flat-sm rounded-2xl p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-text-primary">
                              Состав: {sizePackCompositionText(activePack)} ({sizePackPieces(activePack)} шт.)
                            </span>
                            <span className="font-extrabold text-accent tabular-nums">
                              {rub(activePackPrice)} / уп.
                            </span>
                          </div>
                          {packMax > 0 ? (
                            <div className="flex items-center justify-between gap-3 pt-1">
                              <span className="text-xs text-text-secondary">
                                В наличии <span className="font-bold text-text-primary">{packMax} уп.</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  aria-label="Уменьшить количество упаковок"
                                  disabled={packCount <= 1}
                                  onClick={() => setPackQuantity((q) => Math.max(1, q - 1))}
                                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-primary cursor-pointer"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="min-w-[54px] text-center text-xs font-extrabold text-text-primary tabular-nums">
                                  {packCount} уп.
                                </span>
                                <button
                                  type="button"
                                  aria-label="Увеличить количество упаковок"
                                  disabled={packCount >= packMax}
                                  onClick={() => setPackQuantity((q) => Math.min(packMax, q + 1))}
                                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-primary cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p role="status" className="text-xs font-bold text-danger">
                              {(() => {
                                const missing = activePack.sizes
                                  .filter((e) => getVariantStock(product, color, e.size) < e.qty)
                                  .map((e) => e.size);
                                return missing.length > 0
                                  ? `Нет размера ${missing.join(', ')}: ростовка недоступна`
                                  : 'Все полные ростовки этого цвета уже в корзине';
                              })()}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-text-primary">
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
                        const canOrder = orderable >= packStep;
                        return (
                          <button
                            key={sz}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            data-autofocus={sz === firstOrderableSize ? '' : undefined}
                            disabled={!canOrder}
                            onClick={() => {
                              setSize(sz);
                              setSizeError(false);
                              const nextMax = Math.floor(orderable / packStep) * packStep;
                              if (quantity > nextMax && nextMax >= packStep) {
                                setQuantity(nextMax);
                              } else if (quantity < packStep) {
                                setQuantity(packStep);
                              }
                            }}
                            className={`min-h-[46px] min-w-[54px] px-3 py-1.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                              !canOrder
                                ? 'neu-flat text-text-secondary opacity-60 cursor-not-allowed'
                                : isSelected
                                ? 'neu-pill-active cursor-pointer'
                                : 'neu-button text-text-primary hover:text-accent cursor-pointer'
                            }`}
                          >
                            <span className={!canOrder ? 'line-through' : undefined}>{sz}</span>
                            <span className={`text-[11px] font-medium ${isSelected ? 'text-accent' : 'text-text-secondary'}`}>
                              {stock >= packStep
                                ? `${stock} шт.`
                                : stock > 0 && !canOrder
                                ? `ост. ${stock}`
                                : canOrder
                                ? 'предзаказ'
                                : 'нет'}
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

                  {/* Quantity selector when a size is picked and either wholesale or multiple items can be ordered */}
                  {size && maxQuantity > packStep && (
                    <div className="flex items-center justify-between gap-3 neu-flat-sm rounded-2xl px-3 py-2 ">
                      <span className="text-xs font-bold text-text-primary">
                        {isWholesale && packStep > 1
                          ? `Упаковок (по ${packStep} шт.)`
                          : 'Количество'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Уменьшить количество"
                          disabled={effectiveQty <= packStep}
                          onClick={() => setQuantity((q) => Math.max(packStep, q - packStep))}
                          className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-primary cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="min-w-[64px] text-center text-xs font-extrabold text-text-primary tabular-nums">
                          {isWholesale && packStep > 1
                            ? `${effectiveQty / packStep} уп. (${effectiveQty} шт.)`
                            : `${effectiveQty} шт.`}
                        </span>
                        <button
                          type="button"
                          aria-label="Увеличить количество"
                          disabled={effectiveQty >= maxQuantity}
                          onClick={() => setQuantity((q) => Math.min(maxQuantity, q + packStep))}
                          className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-primary cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProduct(product);
                  }}
                  className="h-12 px-3.5 rounded-2xl neu-button text-xs font-bold text-text-primary hover:text-accent flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>О товаре</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={isPackMode ? !activePack || packMax <= 0 : Boolean(size && maxQuantity <= 0)}
                  onClick={handleAdd}
                  className={`flex-1 h-12 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 ${
                    (isPackMode ? !activePack || packMax <= 0 : Boolean(size && maxQuantity <= 0))
                      ? 'neu-button-disabled cursor-not-allowed'
                      : 'neu-button-accent cursor-pointer'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isPackMode
                      ? packMax > 0
                        ? `В корзину · ${rub(activePackPrice * packCount)}`
                        : 'Ростовка недоступна'
                      : size
                      ? isWholesale && offer
                        ? `Оптом · ${rub(offer.unitPrice * effectiveQty)}`
                        : `Добавить в корзину · ${rub(product.price * effectiveQty)}`
                      : 'Выберите размер'}
                  </span>
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
};

