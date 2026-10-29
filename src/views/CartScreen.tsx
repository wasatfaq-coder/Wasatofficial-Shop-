import React, { useState } from 'react';
import { ProductThumbImage } from '../components/ProductThumbImage';
import { LazyMount } from '../components/LazyMount';
import { QuickOrderModal } from '../components/lazyWindows';
import {
  Heart,
  Minus,
  Plus,
  Tag,
  ShoppingBag,
  ArrowRight,
  Trash2,
  SlidersHorizontal,
  Check,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { CartItem, Product, ActiveTab, AppliedPromoInfo, DeliveryMethod } from '../types';
import { getVariantStock, getOrderableStock } from '../utils/inventory';
import { CartRemoveConfirmModal } from '../components/CartRemoveConfirmModal';
import { NotConfigured } from '../components/NotConfigured';
import {
  QUICK_ORDER_DELIVERY_TITLE,
  calcPromoDiscount,
  freeDeliveryOffer,
  getAvailableDeliveryMethods,
  toPricingLine,
} from '../shared/orderPricing';
import { freeDeliveryMethodsText } from '../utils/freeDelivery';
import { promoDiscountText } from '../utils/promoLabel';
import { useDialogA11y } from '../utils/useDialogA11y';
import { linePrice } from '../shared/orderLine';
import {
  isWholesaleLine,
  packSizeOf,
  readMinWholesaleAmount,
  wholesaleLineProblems,
  wholesaleOrderSubtotal,
} from '../shared/wholesalePricing';
import { packsText } from '../utils/wholesaleOffer';
import { WholesaleMark } from '../components/WholesaleMark';
import { heldByOtherLines, packsLeft } from '../utils/cartLines';
import { isCartPackLine, packLineProblems } from '../shared/packLines';
import { brokenPackPieces } from '../shared/sizePacks';
import { LoadFailedNotice } from '../components/LoadFailedNotice';
import { cartLinePieces, packLineCountText, packLineInfo } from '../utils/cartPackLine';

interface CartScreenProps {
  cartItems: CartItem[];
  /**
   * The catalog answered (audit 29.10, finding 2): before it the cart holds light copies without stock, and every line
   * read «Нет в наличии» — «убрать недоступные» then emptied the whole cart. Until then: «Проверяем наличие…»
   */
  stockKnown?: boolean;
  /** The catalog did not load: «Проверяем наличие…» would never end, so the screen says what to do */
  catalogFailed?: boolean;
  /** «Технические работы» in «Витрина»: the 1-click window says the site takes no orders */
  ordersPaused?: boolean;
  favorites: string[];
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onUpdateVariant?: (cartItemId: string, newColor: string, newSize: string) => void;
  onMoveToFavorites?: (item: CartItem) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onClearCart: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  appliedPromo: AppliedPromoInfo | null;
  /** at least one active promo exists (otherwise «есть доступные» would be untrue) */
  hasActivePromos?: boolean;
  onApplyPromo: (code: string) => void;
  onOpenPromoModal: () => void;
  onRemovePromo: () => void;
  onCompleteOrder?: (orderData: any) => void | Promise<boolean>;
  storefrontSettings?: import('../types').StorefrontSettings;
  /** What is missing for checkout (e.g. «Способы доставки»); null when checkout is possible */
  checkoutBlocker?: string | null;
  /** Admin → «Витрина» → «Предзаказ»: sold-out variants can be preordered */
  preorderMode?: boolean;
  /** Delivery methods from «Доставка и ПВЗ»: the cart shows their price range, the method is picked at checkout */
  deliveryMethods?: DeliveryMethod[];
  userProfile?: import('../types').UserProfile;
}

export const CartScreen: React.FC<CartScreenProps> = ({
  cartItems,
  stockKnown = true,
  catalogFailed = false,
  ordersPaused = false,
  favorites,
  onUpdateQuantity,
  onRemoveItem,
  onUpdateVariant,
  onMoveToFavorites,
  onToggleFavorite,
  onClearCart,
  setActiveTab,
  onShowToast,
  appliedPromo,
  onApplyPromo,
  onOpenPromoModal,
  onRemovePromo,
  onCompleteOrder,
  storefrontSettings,
  checkoutBlocker = null,
  preorderMode = false,
  deliveryMethods = [],
  hasActivePromos = false,
  userProfile,
}) => {
  const [promoInput, setPromoInput] = useState('');
  const [itemToRemove, setItemToRemove] = useState<CartItem | null>(null);
  const [editingVariantItemId, setEditingVariantItemId] = useState<string | null>(null);
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  // Lines whose quantity is no longer available (sold out while in the cart)
  // The retail and the wholesale line of one variant share its stock: each can have what the other left
  // A size pack line (stage 20) counts in packs: the most packs it can have, as every size of the pack allows after the
  // other lines of the cart; no preorder for packs
  const lineStock = (item: CartItem) =>
    isCartPackLine(item)
      ? packsLeft(
          cartItems,
          { product: item.product, selectedColor: item.selectedColor, packSizes: item.packSizes ?? [] },
          (size) => getOrderableStock(item.product, item.selectedColor, size, false),
          item.id
        )
      : Math.max(
          0,
          Math.min(
            getOrderableStock(item.product, item.selectedColor, item.selectedSize, item.priceKind === 'broken' ? false : preorderMode) -
              heldByOtherLines(cartItems, item, item.id),
            // a «Разбитая упаковка» line has only the pieces of its opened pack, as `useCart` counts them (audit 29.10,
            // finding 21: «+» stayed on and did nothing, the excess showed only at the checkout)
            item.priceKind === 'broken'
              ? brokenPackPieces(item.product, item.selectedColor, item.selectedSize)
              : Number.POSITIVE_INFINITY
          )
        );
  const unavailableCount = stockKnown ? cartItems.filter((item) => item.quantity > lineStock(item)).length : 0;
  const handleFixUnavailableItems = () => {
    if (!stockKnown) return;
    for (const item of cartItems) {
      const avail = lineStock(item);
      if (item.quantity <= avail) continue;
      const step = isWholesaleLine(item) && !isCartPackLine(item) ? packSizeOf(item.product) : 1;
      const targetQty = Math.floor(avail / step) * step;
      if (targetQty < step || targetQty <= 0) {
        onRemoveItem(item.id);
      } else {
        onUpdateQuantity(item.id, targetQty);
      }
    }
    onShowToast('Количество товаров приведено к доступному остатку', 'info');
  };
  // Wholesale lines in part packs, under the product's minimum or under `minOrderAmount`, or a size pack the shop no
  // longer sells: the checkout would refuse them, so say it here
  const effectiveWholesale = storefrontSettings?.brokenPackDiscount
    ? { ...storefrontSettings.wholesale, brokenPackDiscount: storefrontSettings.brokenPackDiscount }
    : storefrontSettings?.wholesale;
  const wholesaleProblems = [
    ...wholesaleLineProblems(cartItems, effectiveWholesale),
    ...packLineProblems(cartItems),
  ];
  const minWholesaleAmount = readMinWholesaleAmount(storefrontSettings?.wholesale);
  const hasWholesaleInCart = cartItems.some(isWholesaleLine);
  const wholesaleSubtotal = hasWholesaleInCart ? wholesaleOrderSubtotal(cartItems) : 0;
  const remainingForMinWholesale =
    minWholesaleAmount !== undefined && hasWholesaleInCart ? Math.max(0, minWholesaleAmount - wholesaleSubtotal) : 0;
  const cartBlocked = unavailableCount > 0 || wholesaleProblems.length > 0;
  const [isClearCartConfirmOpen, setIsClearCartConfirmOpen] = useState(false);
  const clearDialog = useDialogA11y(isClearCartConfirmOpen, () => setIsClearCartConfirmOpen(false));

  // Calculate totals
  const rawSubtotal = cartItems.reduce(
    (acc, item) => acc + linePrice(item) * item.quantity,
    0
  );

  // Same calculation as checkout and placeOrder (promo limited to categories/products included)
  const discountAmount = calcPromoDiscount(cartItems.map(toPricingLine), appliedPromo);

  // The same thresholds as the fee below: a method's own one, else the common one (stage 6 finding)
  const freeDelivery = freeDeliveryOffer(deliveryMethods, storefrontSettings);
  const freeThreshold = freeDelivery?.threshold ?? 0;
  const freeDeliveryMethods = freeDelivery ? freeDeliveryMethodsText(freeDelivery) : '';
  // items, not lines: a size pack counts its items
  const totalItemsCount = cartItems.reduce((acc, item) => acc + cartLinePieces(item), 0);
  // The method is chosen at checkout: the cart shows what the store's methods cost for this order
  // (same prices as checkout) and adds a fee to «Итого» only when every method costs the same
  const deliveryPrices = getAvailableDeliveryMethods(deliveryMethods, storefrontSettings, rawSubtotal).map((d) => d.price);
  const minDelivery = deliveryPrices.length ? Math.min(...deliveryPrices) : null;
  const maxDelivery = deliveryPrices.length ? Math.max(...deliveryPrices) : null;
  const deliveryKnown = minDelivery !== null && minDelivery === maxDelivery;
  const deliveryFee = deliveryKnown ? minDelivery : 0;
  const remainingForFreeDelivery = Math.max(0, freeThreshold - rawSubtotal);
  const finalTotal = Math.max(0, rawSubtotal - discountAmount + deliveryFee);

  const handlePromoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    onApplyPromo(promoInput.trim());
    setPromoInput('');
  };

  /** `false` — the order was not placed: the 1-click window stays open with what the buyer typed */
  const handleQuickOrderSuccess = async (details: { name: string; phone: string; address: string }): Promise<boolean> => {
    if (!onCompleteOrder) return false;
    const placed = await onCompleteOrder({
      items: cartItems,
      contact: { name: details.name, phone: details.phone, email: '' },
      address: details.address || 'Уточнит менеджер',
      deliveryMethod: QUICK_ORDER_DELIVERY_TITLE,
      // as placeOrder counts a 1-click order: goods only, no promo, delivery and payment agreed by the manager
      // (no made-up «При получении (наличные / картой)»: the shop may not take cash — UX audit 03.10, finding 22)
      totalPrice: rawSubtotal,
    });
    return placed !== false;
  };

  if (cartItems.length === 0) {
    return (
      <div className="py-12 space-y-5 text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 rounded-full neu-flat flex items-center justify-center mx-auto text-text-secondary">
          <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Ваша корзина пуста</h2>
        <button
          onClick={() => setActiveTab('catalog')}
          className="neu-button-accent rounded-full px-6 py-3 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <span>Перейти в каталог</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 lg:pb-10 animate-in fade-in duration-300">
      {/* Computer (lg): items on the left, promo code and totals on the right, in view while the list scrolls */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
      <div className="space-y-4 lg:col-span-7">
      {/* Free Delivery Threshold Dynamic Progress Banner: only when some method becomes free from a sum; names the
          methods when not all of them do */}
      {freeThreshold > 0 && (
      <div className="neu-flat rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="text-text-primary">
              {remainingForFreeDelivery === 0
                ? freeDeliveryMethods
                  ? `Бесплатная доставка: ${freeDeliveryMethods}`
                  : 'Бесплатная доставка получена!'
                : `До бесплатной доставки${freeDeliveryMethods ? ` (${freeDeliveryMethods})` : ''}: ${remainingForFreeDelivery.toLocaleString('ru-RU')} ₽`}
            </span>
          </div>
          <span className="text-[11px] font-extrabold text-accent">
            {Math.min(100, Math.floor((rawSubtotal / freeThreshold) * 100))}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden neu-inset">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              remainingForFreeDelivery === 0 ? 'bg-success' : 'bg-accent'
            }`}
            style={{ width: `${Math.min(100, (rawSubtotal / freeThreshold) * 100)}%` }}
          />
        </div>
      </div>
      )}

      {minWholesaleAmount !== undefined && hasWholesaleInCart && (
        <div className="neu-flat rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <WholesaleMark />
              <span className="text-text-primary">
                {remainingForMinWholesale === 0
                  ? `Минимальная сумма оптового заказа (${minWholesaleAmount.toLocaleString('ru-RU')} ₽) набрана`
                  : `До минимальной суммы опта (${minWholesaleAmount.toLocaleString('ru-RU')} ₽): ещё ${remainingForMinWholesale.toLocaleString('ru-RU')} ₽`}
              </span>
            </div>
            <span className="text-[11px] font-extrabold text-accent">
              {Math.min(100, Math.floor((wholesaleSubtotal / minWholesaleAmount) * 100))}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden neu-inset">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                remainingForMinWholesale === 0 ? 'bg-success' : 'bg-accent'
              }`}
              style={{ width: `${Math.min(100, (wholesaleSubtotal / minWholesaleAmount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {!stockKnown && catalogFailed && (
        <LoadFailedNotice title="Не удалось проверить наличие: каталог не загрузился" />
      )}

      {/* Header bar with item counter & clear cart button */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary">Товаров в корзине:</span>
          <span className="neu-inset px-2.5 py-0.5 rounded-full text-xs font-extrabold text-accent">
            {totalItemsCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsClearCartConfirmOpen(true)}
          className="min-h-8 px-2 -mr-2 rounded-xl text-xs font-bold text-text-secondary hover:text-danger transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Очистить все</span>
        </button>
      </div>

      {/* List of Cart Item Cards */}
      <div className="space-y-3">
        {cartItems.map((item, itemIdx) => {
          const isFav = favorites.includes(item.product.id);
          // a size pack (stage 20): one row, counted in packs, no variant of its own
          const pack = packLineInfo(item);
          const inStock = pack ? 0 : getVariantStock(item.product, item.selectedColor, item.selectedSize);
          const availableStock = lineStock(item);
          const isPreorder = stockKnown && !pack && inStock === 0 && availableStock > 0;
          // A wholesale line changes by whole packs: «−» and «+» take or add one pack
          const wholesale = isWholesaleLine(item) && !pack;
          const step = wholesale ? packSizeOf(item.product) : 1;
          // the unit of the counter and of the stock texts
          const unit = pack ? 'уп.' : 'шт.';
          // the stock is not known yet: «+» waits for the catalog (the cart would clamp the line to the 0 of a light copy)
          const isAtMaxStock = !stockKnown || item.quantity + step > availableStock;
          const isEditingVariant = editingVariantItemId === item.id;
          // Buttons of a row name its product: «Удалить товар» eight times does not say which (audit 07.10, finding 37)
          const title = item.product.title;
          const rowName = pack ? `${title}, ${pack.title}` : title;
          const variantPanelId = `cart-variant-${itemIdx}`;

          return (
            <div
              key={`cart-item-${item.id}-${itemIdx}`}
              className="neu-flat rounded-3xl p-3.5 relative space-y-3 transition-all"
            >
              <div className="flex gap-3.5 items-center">
                {/* Thumbnail Image */}
                <div className="relative w-20 h-20 aspect-square rounded-2xl overflow-hidden neu-inset p-1.5 shrink-0 flex items-center justify-center">
                  <ProductThumbImage
                    product={item.product}
                    alt={item.product?.title || ''}
                    className="w-full h-full object-cover object-top rounded-xl"
                  />
                  {stockKnown && availableStock <= 2 && availableStock > 0 && (
                    <span className="absolute bottom-1 right-1 neu-photo-badge text-text-primary text-[11px] font-extrabold px-1.5 py-0.5 rounded-md">
                      {availableStock} {unit}
                    </span>
                  )}
                </div>

                {/* Info Column */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-sm font-bold text-text-primary truncate">
                      {item.product.title}
                    </h3>
                    {/* Favorite Heart Icon */}
                    <button
                      type="button"
                      onClick={(e) => onToggleFavorite(item.product, e)}
                      className={`w-8 h-8 rounded-full neu-button flex items-center justify-center transition-colors shrink-0 ${
                        isFav ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
                      }`}
                      title={isFav ? 'В избранном' : 'Добавить в избранное'}
                      aria-label={`В избранное: ${title}`}
                      aria-pressed={isFav}
                    >
                      <Heart
                        aria-hidden="true"
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'fill-accent stroke-accent' : 'stroke-[2]'
                        }`}
                      />
                    </button>
                  </div>

                  {pack ? (
                    /* a size pack has no size to change: its colour and how many packs are left */
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[11px] font-bold text-accent">{item.selectedColor}</span>
                      {!stockKnown ? (
                        <span className="text-[11px] font-semibold text-text-secondary">Проверяем наличие…</span>
                      ) : availableStock === 0 ? (
                        <span className="text-[11px] font-bold text-danger">Нет в наличии</span>
                      ) : item.quantity > availableStock ? (
                        <span className="text-[11px] font-bold text-danger">Доступно: {availableStock} уп.</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-text-secondary">
                          {availableStock <= 2 ? `Осталось: ${availableStock} уп.` : `В наличии: ${availableStock} уп.`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => setEditingVariantItemId(isEditingVariant ? null : item.id)}
                          disabled={!stockKnown}
                          className="neu-button min-h-8 px-2.5 py-0.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-accent hover:scale-102 transition-transform cursor-pointer"
                          title="Нажмите, чтобы изменить цвет или размер"
                          aria-label={`Цвет и размер: ${item.selectedColor}, ${item.selectedSize}. Изменить — ${title}`}
                          aria-expanded={isEditingVariant}
                          aria-controls={isEditingVariant ? variantPanelId : undefined}
                        >
                          <span>{item.selectedColor} • {item.selectedSize}</span>
                          <SlidersHorizontal className="w-3 h-3 text-accent" />
                        </button>

                        {!stockKnown ? (
                          <span className="text-[11px] font-semibold text-text-secondary">Проверяем наличие…</span>
                        ) : isPreorder ? (
                          <span className="text-[11px] font-bold text-accent">Предзаказ</span>
                        ) : availableStock === 0 ? (
                          <span className="text-[11px] font-bold text-danger">Нет в наличии</span>
                        ) : item.quantity > availableStock ? (
                          <span className="text-[11px] font-bold text-danger">Доступно: {availableStock} шт.</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-text-secondary">
                            {availableStock <= 2 ? `Осталось: ${availableStock} шт.` : `В наличии: ${availableStock} шт.`}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {pack && (
                    <div className="text-xs text-text-secondary space-y-0.5">
                      <p>
                        <WholesaleMark className="mr-1.5" />
                        <span className="font-bold text-text-primary">{pack.title}</span>
                      </p>
                      <p>{pack.composition}</p>
                      <p>
                        {packLineCountText(pack)} · {linePrice(item).toLocaleString('ru-RU')} ₽/уп.
                      </p>
                    </div>
                  )}
                  {wholesale && (
                    <p className="text-xs text-text-secondary">
                      <WholesaleMark className="mr-1.5" />
                      {packsText(item.quantity, step)} · {linePrice(item).toLocaleString('ru-RU')} ₽/шт.
                      {item.volumeDiscountPerUnit ? (
                        <span className="text-success font-bold">
                          {' '}· скидка за объём −{item.volumeDiscountPerUnit.toLocaleString('ru-RU')} ₽/шт.
                        </span>
                      ) : null}
                    </p>
                  )}
                  {(() => {
                    const currentBasePrice = pack
                      ? linePrice(item)
                      : wholesale
                        ? linePrice(item) + (item.volumeDiscountPerUnit ?? 0)
                        : linePrice(item);
                    if (
                      typeof item.addedPrice !== 'number' ||
                      !Number.isFinite(item.addedPrice) ||
                      item.addedPrice <= 0 ||
                      item.addedPrice === currentBasePrice
                    ) {
                      return null;
                    }
                    return (
                      <p className="text-[11px] font-bold text-warning">
                        Цена изменилась: было {item.addedPrice.toLocaleString('ru-RU')} ₽{pack ? '/уп.' : ''}
                      </p>
                    );
                  })()}
                  <p className="text-sm font-extrabold text-text-primary pt-0.5">
                    {(linePrice(item) * item.quantity).toLocaleString('ru-RU')} ₽
                  </p>

                  {/* Quantity Controller & Delete Button */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="neu-inset rounded-full p-0.5 flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          if (item.quantity <= step) {
                            setItemToRemove(item);
                          } else {
                            onUpdateQuantity(item.id, item.quantity - step);
                          }
                        }}
                        type="button"
                        className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-primary hover:text-accent cursor-pointer"
                        title={item.quantity <= step ? 'Удалить товар' : 'Уменьшить количество'}
                        aria-label={`${item.quantity <= step ? 'Удалить товар' : 'Уменьшить количество'}: ${rowName}`}
                      >
                        <Minus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                      <span
                        className={`text-xs font-bold text-text-primary text-center ${step > 1 || pack ? 'min-w-5 px-0.5 whitespace-nowrap' : 'w-5'}`}
                        aria-live="polite"
                      >
                        {pack ? `${item.quantity} уп.` : step > 1 ? `${Math.floor(item.quantity / step)} уп.` : item.quantity}
                      </span>
                      <button
                        onClick={() => {
                          if (item.quantity + step <= availableStock) {
                            onUpdateQuantity(item.id, item.quantity + step);
                          } else {
                            onShowToast(`Достигнут максимум (${availableStock} ${unit})`, 'info');
                          }
                        }}
                        type="button"
                        disabled={isAtMaxStock}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isAtMaxStock
                            ? 'neu-button-disabled'
                            : 'neu-button text-text-primary hover:text-accent cursor-pointer'
                        }`}
                        title={
                          !stockKnown
                            ? 'Проверяем наличие…'
                            : isAtMaxStock
                            ? isPreorder
                              ? `Предзаказ — не больше ${availableStock} шт.`
                              : `На складе всего ${availableStock} ${unit}`
                            : 'Добавить'
                        }
                        aria-label={`Увеличить количество: ${rowName}`}
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Trigger removal modal */}
                    <button
                      type="button"
                      onClick={() => setItemToRemove(item)}
                      className="w-8 h-8 rounded-full neu-button-danger flex items-center justify-center transition-colors cursor-pointer"
                      title="Удалить товар"
                      aria-label={`Удалить товар: ${rowName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive In-Cart Variant Selector Drawer */}
              {isEditingVariant && onUpdateVariant && (
                <div id={variantPanelId} className="neu-inset rounded-2xl p-3.5 sm:p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-2 neu-divider-b">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                        <SlidersHorizontal className="w-4 h-4 shrink-0" />
                      </div>
                      <div className="truncate min-w-0">
                        <span className="text-[11px] font-extrabold text-text-primary uppercase tracking-wider block truncate">
                          Выбор вариации
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingVariantItemId(null)}
                      className="min-h-8 px-3 py-1 rounded-xl neu-button text-[11px] font-extrabold text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
                    >
                      Закрыть
                    </button>
                  </div>

                  {/* Colors */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-text-secondary">Цвет:</span>
                      <span className="text-[11px] font-extrabold text-accent neu-inset px-2 py-0.5 rounded-lg">
                        {item.selectedColor}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Цвет: ${title}`}>
                      {item.product.colors.map((c, cIdx) => {
                        const colorName = typeof c === 'string' ? c : c?.name || '';
                        const colorHex = typeof c === 'object' && c !== null ? (c as any).hex : undefined;
                        const isCurrent = colorName === item.selectedColor;
                        const colStock = getVariantStock(item.product, colorName, item.selectedSize);
                        const isOutOfStock = colStock <= 0 && !preorderMode;

                        return (
                          <button
                            key={`cart-${item.id}-col-${colorName || cIdx}-${cIdx}`}
                            type="button"
                            role="radio"
                            aria-checked={isCurrent}
                            disabled={isOutOfStock}
                            onClick={() => {
                              onUpdateVariant(item.id, colorName, item.selectedSize);
                            }}
                            className={`min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer select-none ${
                              isCurrent
                                ? 'neu-pill-active font-extrabold'
                                : isOutOfStock
                                ? 'neu-button-disabled line-through'
                                : 'neu-button text-text-primary hover:text-[#1E293B]'
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: colorHex || '#94A3B8' }}
                            />
                            <span className="leading-none">{colorName}</span>
                            {isCurrent && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0 text-accent" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sizes */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-text-secondary">Размер:</span>
                      <span className="text-[11px] font-extrabold text-accent neu-inset px-2 py-0.5 rounded-lg">
                        {item.selectedSize}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Размер: ${title}`}>
                      {item.product.sizes.map((sz, szIdx) => {
                        const isCurrent = sz === item.selectedSize;
                        const szStock = getVariantStock(item.product, item.selectedColor, sz);
                        const isOutOfStock = szStock <= 0 && !preorderMode;

                        return (
                          <button
                            key={`cart-${item.id}-sz-${sz}-${szIdx}`}
                            type="button"
                            role="radio"
                            aria-checked={isCurrent}
                            disabled={isOutOfStock}
                            onClick={() => {
                              onUpdateVariant(item.id, item.selectedColor, sz);
                            }}
                            className={`min-w-[42px] min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                              isCurrent
                                ? 'neu-pill-active font-extrabold'
                                : isOutOfStock
                                ? 'neu-button-disabled line-through'
                                : 'neu-button text-text-primary hover:text-[#1E293B]'
                            }`}
                          >
                            <span>{sz}</span>
                            {szStock <= 2 && szStock > 0 && (
                              <span className={`text-[11px] font-bold ${isCurrent ? 'text-warning' : 'text-warning'}`}>
                                ({szStock})
                              </span>
                            )}
                            {isCurrent && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0 text-accent" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stock footer & Confirm Button */}
                  <div className="pt-2 neu-divider-t flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-text-secondary font-bold min-w-0">
                      <span className="shrink-0">Наличие:</span>
                      <span
                        className={`truncate font-extrabold ${
                          isPreorder
                            ? 'text-accent'
                            : availableStock === 0
                            ? 'text-danger'
                            : availableStock <= 2
                            ? 'text-warning'
                            : 'text-success'
                        }`}
                      >
                        {isPreorder
                          ? 'Предзаказ'
                          : availableStock === 0
                          ? 'Нет в наличии'
                          : availableStock <= 2
                          ? `Осталось мало (${availableStock} шт.)`
                          : `${availableStock} шт. на складе`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingVariantItemId(null)}
                      className="min-h-8 px-3 py-1.5 rounded-xl neu-button text-[11px] font-extrabold text-accent hover:text-text-primary transition-all cursor-pointer shrink-0"
                    >
                      Готово
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      </div>

      <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-24">
      {/* Promo Code Card with Modal Trigger */}
      <div className="neu-flat rounded-2xl p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onOpenPromoModal}
            className="flex-1 flex items-center justify-between text-xs font-bold text-text-primary hover:text-accent transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent group-hover:scale-105 transition-transform shrink-0">
                <Tag className="w-4 h-4 stroke-[2.2] shrink-0" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-text-primary truncate">
                  {appliedPromo ? `Промокод: ${appliedPromo.code}` : 'Промокод'}
                </p>
                <p className="text-xs text-text-secondary font-normal truncate">
                  {appliedPromo
                    ? `Скидка ${promoDiscountText(appliedPromo)} применена`
                    : hasActivePromos
                      ? 'Есть доступные промокоды'
                      : 'Введите код, если он у вас есть'}
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-accent font-extrabold text-xs shrink-0">
              {appliedPromo ? 'Изменить' : 'Выбрать'}
              <ChevronRight className="w-4 h-4 text-text-secondary group-hover:translate-x-0.5 transition-transform shrink-0" aria-hidden="true" />
            </span>
          </button>
        </div>

        <form onSubmit={handlePromoSubmit} className="flex items-center gap-2 pt-2 neu-divider-t">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              aria-label="Промокод"
              autoComplete="off"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder={appliedPromo ? `Активен: ${appliedPromo.code}` : 'Или введите код вручную'}
              className="w-full min-h-8 neu-inset rounded-xl py-2 px-3 text-xs font-medium text-text-primary placeholder:text-text-muted uppercase placeholder:normal-case"
            />
          </div>
          <button
            type="submit"
            className="min-h-8 neu-button rounded-xl px-3.5 py-2 text-xs font-bold text-text-primary hover:text-accent shrink-0 cursor-pointer"
          >
            Применить
          </button>
        </form>
      </div>

      {/* Applied Promo discount pill */}
      {appliedPromo && (
        <div className="neu-pill-active rounded-xl p-2.5 px-3.5 flex items-center justify-between gap-2 text-xs font-bold text-accent">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
            <span className="truncate">
              Промокод {appliedPromo.code} (
              {appliedPromo.discountType === 'fixed'
                ? `-${(appliedPromo.discountValue || 0).toLocaleString('ru-RU')} ₽`
                : `-${appliedPromo.discountValue || appliedPromo.discountPercent}%`}
              )
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="tabular-nums">-{discountAmount.toLocaleString('ru-RU')} ₽</span>
            <button
              type="button"
              onClick={onRemovePromo}
              className="min-h-8 px-2.5 py-1 rounded-xl neu-button text-[11px] font-extrabold text-text-secondary hover:text-danger cursor-pointer shrink-0"
            >
              Сбросить
            </button>
          </div>
        </div>
      )}

      {/* Summary Cost Card (Single elevation level, no redundant full-width inset inside flat) */}
      <div className="neu-flat rounded-3xl p-4 space-y-3.5">
        <div className="space-y-2.5">
          <div className="space-y-2 text-xs font-semibold text-text-secondary">
            <div className="flex justify-between">
              <span>Товары ({totalItemsCount})</span>
              <span className="text-text-primary font-bold">{rawSubtotal.toLocaleString('ru-RU')} ₽</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-accent font-bold">
                <span>Скидка</span>
                <span>-{discountAmount.toLocaleString('ru-RU')} ₽</span>
              </div>
            )}

            <div className="flex justify-between gap-3">
              <span>Доставка</span>
              <span className={`text-right ${deliveryKnown && deliveryFee === 0 ? 'text-success font-bold' : 'text-text-primary'}`}>
                {minDelivery === null
                  ? 'При оформлении'
                  : deliveryKnown
                    ? deliveryFee === 0
                      ? 'Бесплатно'
                      : `${deliveryFee.toLocaleString('ru-RU')} ₽`
                    : `${minDelivery.toLocaleString('ru-RU')} – ${maxDelivery!.toLocaleString('ru-RU')} ₽, зависит от способа`}
              </span>
            </div>
          </div>

          <div className="neu-divider-t pt-2.5 flex items-baseline justify-between">
            <span className="text-base font-bold text-text-primary">{deliveryKnown ? 'Итого' : 'Итого без доставки'}</span>
            <span className="text-xl font-extrabold text-text-primary tabular-nums">
              {finalTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        {/* Action Buttons: 1-Click Quick Order + Full Checkout */}
        <div className="space-y-2">
          {unavailableCount > 0 && (
            <div className="neu-tone-danger rounded-2xl p-3 text-xs font-bold space-y-2">
              <p>
                Часть товаров закончилась: уменьшите количество или удалите их из корзины ({unavailableCount}).
              </p>
              <button
                type="button"
                onClick={handleFixUnavailableItems}
                className="w-full py-2 px-3 rounded-xl neu-button text-xs font-extrabold text-accent hover:text-accent-strong cursor-pointer transition-all"
              >
                Выровнять по остатку / убрать недоступные
              </button>
            </div>
          )}
          {wholesaleProblems.length > 0 && (
            <div role="status" className="neu-tone-danger rounded-2xl p-3 text-xs font-bold space-y-1">
              {wholesaleProblems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          )}
          {checkoutBlocker && (
            <NotConfigured
              title={checkoutBlocker}
              hint="Оформить заказ можно будет, когда магазин их добавит. Пока доступен заказ в 1 клик."
            />
          )}
          <button
            onClick={() => setActiveTab('checkout')}
            disabled={Boolean(checkoutBlocker) || cartBlocked}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              !checkoutBlocker && !cartBlocked
                ? 'neu-button-accent btn-confirm-order active:neu-inset-deep cursor-pointer'
                : 'neu-button-disabled'
            }`}
          >
            <span>Оформить заказ</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsQuickOrderOpen(true)}
            disabled={cartBlocked}
            className={`w-full py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center transition-all ${
              cartBlocked
                ? 'neu-button-disabled'
                : 'neu-button text-accent cursor-pointer'
            }`}
          >
            <span>Заказать в 1 клик</span>
          </button>
        </div>
      </div>

      </div>
      </div>

      {/* Cart Removal Confirmation Modal */}
      <CartRemoveConfirmModal
        isOpen={!!itemToRemove}
        item={itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirmRemove={(id) => {
          onRemoveItem(id);
          setItemToRemove(null);
        }}
        onMoveToFavorites={(item) => {
          if (onMoveToFavorites) {
            onMoveToFavorites(item);
          } else {
            onToggleFavorite(item.product, {} as any);
            onRemoveItem(item.id);
          }
          setItemToRemove(null);
        }}
      />

      {/* Clear Cart Confirmation Modal */}
      {isClearCartConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-text-primary/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div ref={clearDialog.ref} {...clearDialog.props} className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 ">
            <div className="flex items-center gap-2 text-danger pb-2 neu-divider-b">
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-danger shrink-0" />
              </div>
              <h3 id={clearDialog.titleId} className="text-sm font-extrabold text-text-primary">Очистка всей корзины</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Вы уверены, что хотите удалить все <strong>{totalItemsCount}</strong> поз. из корзины?
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearCartConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl neu-button text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  setIsClearCartConfirmOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl neu-button text-xs font-extrabold text-danger hover:text-text-primary cursor-pointer"
              >
                Да, очистить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick 1-Click Order Modal for Entire Cart */}
      <LazyMount when={isQuickOrderOpen}>
      <QuickOrderModal
        isOpen={isQuickOrderOpen}
        onClose={() => setIsQuickOrderOpen(false)}
        cartItems={cartItems}
        totalPrice={rawSubtotal}
        userProfile={userProfile}
        promoNotApplied={Boolean(appliedPromo)}
        ordersPaused={ordersPaused}
        onSuccess={handleQuickOrderSuccess}
      />
      </LazyMount>
    </div>
  );
};
