import React, { useMemo, useState } from 'react';
import type { ActiveTab, AppliedPromoInfo, CartItem, Product, PromoCode } from '../types';
import {
  brokenPackDiscountedPrice,
  goesBrokenPack,
  hasWholesalePrice,
  isBrokenPackLine,
  isWholesaleLine,
  packSizeOf,
  priceCartLines,
  readBrokenPackDiscount,
  saleChannelOf,
  sellsRetail,
  sellsWholesale,
  type WholesaleSettings,
} from '../shared/wholesalePricing';
import { CART_STORAGE_KEY, loadStoredCart, toStoredCart } from '../utils/cartStorage';
import { getOrderableStock, isPreorderVariant } from '../utils/inventory';
import { validatePromo, toPricingLine, appliedPromoFrom, currentAppliedPromo, promoSignInProblem } from '../shared/orderPricing';
import { promoDiscountText } from '../utils/promoLabel';
import { packsText } from '../utils/wholesaleOffer';
import { heldByOtherLines, packsLeft } from '../utils/cartLines';
import { isCartPackLine, pricePackLine } from '../shared/packLines';
import { sizePackPieces } from '../shared/sizePacks';
import { hasOrderableVariant, needsVariantChoice } from '../utils/variantSelection';
import type { AddToast } from './useToasts';

type CartOptions = {
  promos: PromoCode[];
  /** The promos are read only on demand (useStorefrontData): until they come no code is checked */
  promosLoaded: boolean;
  /** The promos subscription ended with an error: a code waiting for them is answered, `requestPromos` tries again */
  promosFailed: boolean;
  requestPromos: () => void;
  preorderMode: boolean;
  addToast: AddToast;
  setActiveTab: (tab: ActiveTab) => void;
  /** A product without a colour or size to add at once: its card opens */
  onOpenProduct: (product: Product) => void;
  /** Signed in with Google (not a guest): only then a code with a usage limit applies (finding 9) */
  signedInWithGoogle: boolean;
  /** «Войти через Google» from the toast about such a code */
  onSignIn: () => void;
  /** «Опт» of the storefront settings: the volume discount of wholesale lines */
  wholesale?: WholesaleSettings;
};

/**
 * Favorites, the cart and the applied promo, kept in this browser (`manstyle_favorites`, `manstyle_cart`).
 * The catalog subscription refreshes the products in the cart through `setCartItems` (App.tsx).
 */
export function useCart({
  promos, promosLoaded, promosFailed, requestPromos, preorderMode, addToast, setActiveTab, onOpenProduct, signedInWithGoogle,
  onSignIn, wholesale,
}: CartOptions) {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('manstyle_favorites');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('manstyle_favorites', JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  // Saved cart (light lines, cartStorage.ts); the full products come from the catalog subscription
  const [storedCart, setCartItems] = useState<CartItem[]>(() => {
    try {
      return loadStoredCart(localStorage.getItem(CART_STORAGE_KEY));
    } catch {
      return [];
    }
  });
  // Every screen reads the lines with their prices: wholesale lines — the wholesale price minus the volume step
  // (priceCartLines, the same as in placeOrder); the stored lines keep only the buyer's choice
  const cartItems = useMemo(() => priceCartLines(storedCart, wholesale), [storedCart, wholesale]);

  // Stage 13 of docs/broken-pack-plan.md: if a product's saleChannel changed away from 'both' (or lost wholesalePrice),
  // remove its 'broken' lines from the cart with a toast
  React.useEffect(() => {
    const invalidBroken = storedCart.filter(
      (item) => item.priceKind === 'broken' && (saleChannelOf(item.product) !== 'both' || !hasWholesalePrice(item.product))
    );
    if (invalidBroken.length === 0) return;
    const ids = new Set(invalidBroken.map((i) => i.id));
    setCartItems((prev) => prev.filter((item) => !ids.has(item.id)));
    addToast('Режим продажи товара изменился: позиции из разбитой упаковки убраны из корзины', 'info');
  }, [storedCart]);

  React.useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(toStoredCart(storedCart)));
    } catch (err) {
      console.error('Cart was not saved in the browser:', err);
    }
  }, [storedCart]);

  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoInfo | null>(null);

  // Toggle Favorite
  const handleToggleFavorite = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorites.includes(product.id)) {
      setFavorites((prev) => prev.filter((id) => id !== product.id));
      addToast(`Удалено из избранного: ${product.title}`, 'info');
    } else {
      setFavorites((prev) => [...prev, product.id]);
      addToast(`Добавлено в избранное: ${product.title}`, 'success');
    }
  };

  const handleClearFavorites = () => {
    setFavorites([]);
    addToast('Избранное очищено', 'info');
  };

  // «+» on a product card: one variant is added at once, several — the customer picks one first
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const openCartAction = { label: 'В корзину', onClick: () => setActiveTab('cart') };

  const handleAddToCartQuick = (product: Product, e?: React.MouseEvent): boolean => {
    e?.stopPropagation();
    if (!hasOrderableVariant(product, preorderMode)) {
      addToast(`Товар "${product.title}" временно закончился`, 'error');
      return false;
    }
    if (!sellsRetail(product) && !sellsWholesale(product)) {
      onOpenProduct(product);
      return false;
    }
    if (needsVariantChoice(product)) {
      setVariantPickerProduct(product);
      return false;
    }
    const color = product.colors?.[0]?.name || '';
    const size = product.sizes?.[0] || '';
    // No invented colour or size: without them the customer picks a variant in the product card
    if (!color || !size) {
      onOpenProduct(product);
      return false;
    }
    return handleAddToCartWithOptions(product, color, size, 1);
  };

  // Add a chosen variant to the cart. The customer stays on the page: the toast links to the cart.
  // `wholesale` — bought wholesale (`true`), from a broken pack (`'broken'`), or retail (`false`).
  const handleAddToCartWithOptions = (
    product: Product,
    color: string,
    size: string,
    quantity: number,
    wholesaleChoice: boolean | 'broken' = false
  ): boolean => {
    const asBroken =
      wholesaleChoice === 'broken' &&
      goesBrokenPack(product, color, size, (sz) => getOrderableStock(product, color, sz, false));
    const asWholesale = !asBroken && sellsWholesale(product) && (wholesaleChoice === true || !sellsRetail(product));
    const step = asWholesale ? packSizeOf(product) : 1;
    const variant = { product, selectedColor: color, selectedSize: size };
    const existing = cartItems.find(
      (item) =>
        item.product.id === product.id &&
        item.selectedColor === color &&
        item.selectedSize === size &&
        (asBroken
          ? isBrokenPackLine(item)
          : !isBrokenPackLine(item) && isWholesaleLine(item) === asWholesale)
    );
    // broken pack never allows preorder; retail and wholesale respect preorderMode
    const availableStock = Math.max(
      0,
      getOrderableStock(product, color, size, asBroken ? false : preorderMode) -
        heldByOtherLines(cartItems, variant, existing?.id ?? '')
    );
    // only whole packs can be ordered wholesale
    const maxQty = Math.floor(availableStock / step) * step;
    if (maxQty <= 0) {
      addToast(
        availableStock > 0
          ? `${product.title} (${color}, ${size}): целой упаковки нет — в наличии ${availableStock} шт., в упаковке ${step}`
          : `К сожалению, ${product.title} (${color}, ${size}) нет в наличии`,
        'error'
      );
      return false;
    }

    const clampedQuantity = Math.min(Math.max(step, Math.floor(quantity / step) * step), maxQty);
    const variantText = `${product.title} (${color}, ${size})`;

    if (existing) {
      const currentQty = existing.quantity;
      if (currentQty >= maxQty) {
        addToast(
          `В корзине уже максимум: ${product.title} (${asWholesale ? packsText(maxQty, step) : `${maxQty} шт.`})`,
          'info',
          openCartAction
        );
        return false;
      }
      // whole packs even when the line was not (the pack size changed since it was added)
      const newTotalQty = Math.min(Math.floor((currentQty + clampedQuantity) / step) * step, maxQty);
      setCartItems((prev) => prev.map((item) => (item.id === existing.id ? { ...item, quantity: newTotalQty } : item)));
      addToast(
        asBroken
          ? `Разбитая упаковка в корзине: ${variantText} — ${newTotalQty} шт.`
          : asWholesale
          ? `Оптом в корзине: ${variantText} — ${packsText(newTotalQty, step)}`
          : `В корзине ${newTotalQty} шт.: ${variantText}`,
        'success',
        openCartAction
      );
    } else {
      const baseAddedPrice = asBroken
        ? brokenPackDiscountedPrice(
            product.wholesalePrice ?? product.price,
            readBrokenPackDiscount(wholesale?.brokenPackDiscount)
          )
        : asWholesale
        ? (product.wholesalePrice ?? product.price)
        : product.price;
      const newItem: CartItem = {
        id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product,
        selectedColor: color,
        selectedSize: size,
        quantity: clampedQuantity,
        addedPrice: baseAddedPrice,
        ...(asBroken ? { priceKind: 'broken' as const } : asWholesale ? { priceKind: 'wholesale' as const } : {}),
      };
      setCartItems((prev) => [...prev, newItem]);
      addToast(
        asBroken
          ? `Разбитая упаковка в корзину: ${variantText} — ${clampedQuantity} шт.`
          : asWholesale
          ? `Оптом в корзину: ${variantText} — ${packsText(clampedQuantity, step)}`
          : `${isPreorderVariant(product, color, size, preorderMode) ? 'Предзаказ добавлен' : 'Добавлено'} в корзину: ${variantText}`,
        'success',
        openCartAction
      );
    }
    return true;
  };

  /**
   * Add a size pack («ростовка», stage 20): one line of the pack in the colour, `packs` — whole packs, as many as every
   * size of the pack allows after the other lines of the cart (no preorder for packs, owner's decision 12.10)
   */
  const handleAddPackToCart = (product: Product, packId: string, color: string, packs: number): boolean => {
    const draft = pricePackLine<CartItem>({
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product,
      selectedColor: color,
      selectedSize: '',
      quantity: 1,
      priceKind: 'pack',
      packId,
    });
    if (draft.packUnavailable || !draft.packSizes?.length) {
      addToast(`${product.title}: эта ростовка больше не продаётся`, 'error');
      return false;
    }
    const existing = cartItems.find((item) => isCartPackLine(item) && item.product.id === product.id && item.packId === packId && item.selectedColor === color);
    const stockOf = (size: string) => getOrderableStock(product, color, size, false);
    const max = packsLeft(cartItems, { product, selectedColor: color, packSizes: draft.packSizes }, stockOf, existing?.id);
    const name = `${product.title}, ${draft.packTitle} (${color})`;
    if (max <= 0) {
      addToast(`${name}: на складе не хватает размеров для целой ростовки`, 'error');
      return false;
    }
    const current = existing?.quantity ?? 0;
    if (current >= max) {
      addToast(`В корзине уже максимум: ${name} — ${max} уп.`, 'info', openCartAction);
      return false;
    }
    const next = Math.min(current + Math.max(1, Math.floor(packs)), max);
    if (existing) {
      setCartItems((prev) => prev.map((item) => (item.id === existing.id ? { ...item, quantity: next } : item)));
    } else {
      setCartItems((prev) => [...prev, { ...draft, quantity: next, addedPrice: draft.packPrice }]);
    }
    addToast(`Ростовка в корзине: ${name} — ${next} уп.`, 'success', openCartAction);
    return true;
  };

  /** Items a line is counted in: a whole pack for a wholesale line, one item for a retail or broken pack one */
  const lineStep = (cartItemId: string): number => {
    const priced = cartItems.find((item) => item.id === cartItemId);
    // a size pack is counted in packs: its quantity is packs already
    return priced && isWholesaleLine(priced) && !isCartPackLine(priced) ? packSizeOf(priced.product) : 1;
  };

  /** A line's quantity within the stock, in whole packs for a wholesale line; never below one pack */
  const fitQuantity = (qty: number, stock: number, step: number): number => {
    const whole = Math.max(step, Math.floor(qty / step) * step);
    const max = Math.floor(stock / step) * step;
    return max > 0 ? Math.min(whole, max) : whole;
  };

  // Update quantity in cart
  const handleUpdateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
    } else {
      const step = lineStep(cartItemId);
      setCartItems((prev) =>
        prev.map((item) => {
          if (item.id === cartItemId && isCartPackLine(item)) {
            const priced = cartItems.find((line) => line.id === cartItemId) ?? item;
            const max = packsLeft(
              prev,
              { product: item.product, selectedColor: item.selectedColor, packSizes: priced.packSizes ?? [] },
              (size) => getOrderableStock(item.product, item.selectedColor, size, false),
              item.id
            );
            return { ...item, quantity: Math.max(1, Math.min(Math.floor(newQty), max)) };
          }
          if (item.id === cartItemId) {
            const allowPreorder = item.priceKind === 'broken' ? false : preorderMode;
            const stock =
              getOrderableStock(item.product, item.selectedColor, item.selectedSize, allowPreorder) -
              heldByOtherLines(prev, item, item.id);
            return { ...item, quantity: fitQuantity(newQty, stock, step) };
          }
          return item;
        })
      );
    }
  };

    // Remove from cart
  const handleRemoveCartItem = (cartItemId: string) => {
    const itemToRemove = cartItems.find((i) => i.id === cartItemId);
    setCartItems((prev) => prev.filter((item) => item.id !== cartItemId));
    if (itemToRemove) {
      addToast(`Удалено из корзины: ${itemToRemove.product.title}`, 'info');
    }
  };

  // Update item variant (color / size) directly in cart
  const handleUpdateCartItemVariant = (cartItemId: string, newColor: string, newSize: string) => {
    const step = lineStep(cartItemId);
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id === cartItemId) {
          const allowPreorder = item.priceKind === 'broken' ? false : preorderMode;
          const availableStock =
            getOrderableStock(item.product, newColor, newSize, allowPreorder) -
            heldByOtherLines(prev, { product: item.product, selectedColor: newColor, selectedSize: newSize }, item.id);
          // none of the new variant left — one pack stays: the checkout names it in «Не хватает на складе»
          const clampedQty = availableStock >= step ? fitQuantity(item.quantity, availableStock, step) : step;
          return {
            ...item,
            selectedColor: newColor,
            selectedSize: newSize,
            quantity: clampedQty,
          };
        }
        return item;
      })
    );
    addToast('Параметры товара в корзине обновлены', 'info');
  };

  // Move item from cart to favorites
  const handleMoveToFavoritesFromCart = (item: CartItem) => {
    if (!favorites.includes(item.product.id)) {
      setFavorites((prev) => [...prev, item.product.id]);
    }
    handleRemoveCartItem(item.id);
    addToast(`Перемещено в избранное: ${item.product.title}`, 'success');
  };

  // Clear Cart
  const handleClearCart = () => {
    setCartItems([]);
    addToast('Корзина очищена', 'info');
  };

  // Apply Promo with full rule validation
  // A code from a banner or the chat waits: for the promos to be read (`promos`) — applied as soon as they come — or,
  // with an empty cart, for the first product (`cart`): before, it was «applied» and silently dropped (finding 16)
  const [pendingPromo, setPendingPromo] = useState<{ code: string; waitFor: 'promos' | 'cart' } | null>(null);
  // A code with a limit the guest tried: applied once they sign in with Google
  const [codeAwaitingSignIn, setCodeAwaitingSignIn] = useState<string | null>(null);

  const handleApplyPromo = (code: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    if (!promosLoaded) {
      requestPromos();
      setPendingPromo({ code: cleanCode, waitFor: 'promos' });
      addToast('Проверяем промокод…', 'info');
      return false;
    }
    const foundPromo = promos.find((p) => p.code.toUpperCase() === cleanCode);

    if (!foundPromo) {
      addToast('Промокод не найден', 'error');
      return false;
    }

    // A code with a usage limit — only with a Google sign-in (owner's decision 08.10, audit 07.10, finding 9);
    // before the empty-cart wait: a guest learns it at once, after the sign-in the code waits for the cart as usual
    const signInProblem = promoSignInProblem(foundPromo, signedInWithGoogle);
    if (signInProblem) {
      setCodeAwaitingSignIn(foundPromo.code);
      addToast(signInProblem, 'info', { label: 'Войти через Google', onClick: onSignIn });
      return false;
    }

    if (cartItems.length === 0) {
      // the code itself (active, limit, date) is checked now; the cart — when there is one
      const codeProblem = validatePromo({ ...foundPromo, minOrderAmount: 0 }, cartItems.map(toPricingLine));
      if (codeProblem) {
        addToast(codeProblem, 'error');
        return false;
      }
      setPendingPromo({ code: cleanCode, waitFor: 'cart' });
      addToast(`Промокод ${foundPromo.code} применится, когда вы добавите товар в корзину`, 'info');
      return false;
    }

    const promoError = validatePromo(foundPromo, cartItems.map(toPricingLine));
    if (promoError) {
      addToast(promoError, 'error');
      return false;
    }

    // usedCount grows only when an order with the promo is placed (not on applying it)
    const applied = appliedPromoFrom(foundPromo);
    setAppliedPromo(applied);

    const discountText = promoDiscountText(applied);

    addToast(`Промокод ${foundPromo.code} применен: скидка ${discountText}`, 'success');
    return true;
  };

  // An applied promo is checked again whenever the cart or the code changes: a shrunk cart, an expired or
  // switched-off code must not reach the order with the discount
  React.useEffect(() => {
    if (!pendingPromo) return;
    if (pendingPromo.waitFor === 'promos' && !promosLoaded) {
      // the promos could not be read (finding 15): say so instead of «Проверяем промокод…» forever
      if (promosFailed) {
        setPendingPromo(null);
        addToast('Не удалось проверить промокод: нет связи с магазином. Проверьте соединение и примените код ещё раз', 'error');
      }
      return;
    }
    if (pendingPromo.waitFor === 'cart' && cartItems.length === 0) return;
    setPendingPromo(null);
    handleApplyPromo(pendingPromo.code);
    // handleApplyPromo and addToast are recreated on every render; this runs when the promos or the first product come
  }, [promosLoaded, promosFailed, pendingPromo, cartItems.length]);

  React.useEffect(() => {
    if (!signedInWithGoogle || !codeAwaitingSignIn) return;
    setCodeAwaitingSignIn(null);
    handleApplyPromo(codeAwaitingSignIn);
    // handleApplyPromo is recreated on every render; it runs once, after the sign-in
  }, [signedInWithGoogle, codeAwaitingSignIn]);

  React.useEffect(() => {
    if (!appliedPromo || !promosLoaded) return;
    if (cartItems.length === 0) {
      setAppliedPromo(null);
      return;
    }
    const current = promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase());
    const problem = current
      ? validatePromo(current, cartItems.map(toPricingLine)) ?? promoSignInProblem(current, signedInWithGoogle)
      : 'Промокод больше не действует';
    if (problem) {
      setAppliedPromo(null);
      addToast(`Промокод ${appliedPromo.code} снят. ${problem}`, 'info');
      return;
    }
    // the owner changed the code's discount in «Промокоды»: the cart and the order count by the new one (finding 11)
    const now = currentAppliedPromo(appliedPromo, promos);
    if (!now || JSON.stringify(now) === JSON.stringify(appliedPromo)) return;
    setAppliedPromo(now);
    const discount = promoDiscountText(now);
    if (discount !== promoDiscountText(appliedPromo)) addToast(`Скидка по промокоду ${now.code} теперь ${discount}`, 'info');
    // addToast is recreated on every render; the check depends only on the cart and the codes
  }, [cartItems, promos, promosLoaded, appliedPromo, signedInWithGoogle]);

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    addToast('Промокод отменен', 'info');
  };

  // items, as the badge says: a size pack counts its items (packs × items in a pack)
  const totalCartCount = cartItems.reduce(
    (acc, item) => acc + (isCartPackLine(item) && item.packSizes ? item.quantity * sizePackPieces({ sizes: item.packSizes }) : item.quantity),
    0
  );


  return {
    favorites,
    cartItems,
    setCartItems,
    appliedPromo,
    setAppliedPromo,
    variantPickerProduct,
    setVariantPickerProduct,
    totalCartCount,
    handleToggleFavorite,
    handleClearFavorites,
    handleAddToCartQuick,
    handleAddToCartWithOptions,
    handleAddPackToCart,
    handleUpdateQuantity,
    handleRemoveCartItem,
    handleUpdateCartItemVariant,
    handleMoveToFavoritesFromCart,
    handleClearCart,
    handleApplyPromo,
    handleRemovePromo,
  };
}
