import React, { useState } from 'react';
import type { ActiveTab, AppliedPromoInfo, CartItem, Product, PromoCode } from '../types';
import { CART_STORAGE_KEY, loadStoredCart, toStoredCart } from '../utils/cartStorage';
import { getOrderableStock, isPreorderVariant } from '../utils/inventory';
import { validatePromo, toPricingLine, promoDiscountKind } from '../shared/orderPricing';
import { promoDiscountText } from '../utils/promoLabel';
import { hasOrderableVariant, needsVariantChoice } from '../utils/variantSelection';
import type { AddToast } from './useToasts';

type CartOptions = {
  promos: PromoCode[];
  /** The promos are read only on demand (useStorefrontData): until they come no code is checked */
  promosLoaded: boolean;
  requestPromos: () => void;
  preorderMode: boolean;
  addToast: AddToast;
  setActiveTab: (tab: ActiveTab) => void;
  /** A product without a colour or size to add at once: its card opens */
  onOpenProduct: (product: Product) => void;
};

/**
 * Favorites, the cart and the applied promo, kept in this browser (`manstyle_favorites`, `manstyle_cart`).
 * The catalog subscription refreshes the products in the cart through `setCartItems` (App.tsx).
 */
export function useCart({ promos, promosLoaded, requestPromos, preorderMode, addToast, setActiveTab, onOpenProduct }: CartOptions) {
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
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      return loadStoredCart(localStorage.getItem(CART_STORAGE_KEY));
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(toStoredCart(cartItems)));
    } catch (err) {
      console.error('Cart was not saved in the browser:', err);
    }
  }, [cartItems]);

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

  // «+» on a product card: one variant is added at once, several — the customer picks one first
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const openCartAction = { label: 'В корзину', onClick: () => setActiveTab('cart') };

  const handleAddToCartQuick = (product: Product, e?: React.MouseEvent): boolean => {
    e?.stopPropagation();
    if (!hasOrderableVariant(product, preorderMode)) {
      addToast(`Товар "${product.title}" временно закончился`, 'error');
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

  // Add a chosen variant to the cart. The customer stays on the page: the toast links to the cart
  const handleAddToCartWithOptions = (
    product: Product,
    color: string,
    size: string,
    quantity: number
  ): boolean => {
    const availableStock = getOrderableStock(product, color, size, preorderMode);
    if (availableStock <= 0) {
      addToast(`К сожалению, ${product.title} (${color}, ${size}) нет в наличии`, 'error');
      return false;
    }

    const clampedQuantity = Math.min(quantity, availableStock);
    const existingIndex = cartItems.findIndex(
      (item) =>
        item.product.id === product.id &&
        item.selectedColor === color &&
        item.selectedSize === size
    );

    if (existingIndex > -1) {
      const currentQty = cartItems[existingIndex].quantity;
      if (currentQty >= availableStock) {
        addToast(`В корзине уже максимум: ${product.title} (${availableStock} шт.)`, 'info', openCartAction);
        return false;
      }
      const newTotalQty = Math.min(currentQty + clampedQuantity, availableStock);
      setCartItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: newTotalQty } : item
        )
      );
      addToast(`В корзине ${newTotalQty} шт.: ${product.title} (${color}, ${size})`, 'success', openCartAction);
    } else {
      const newItem: CartItem = {
        id: `cart-${Date.now()}`,
        product,
        selectedColor: color,
        selectedSize: size,
        quantity: clampedQuantity,
      };
      setCartItems((prev) => [...prev, newItem]);
      addToast(
        `${isPreorderVariant(product, color, size, preorderMode) ? 'Предзаказ добавлен' : 'Добавлено'} в корзину: ${product.title} (${color}, ${size})`,
        'success',
        openCartAction
      );
    }
    return true;
  };

  // Update quantity in cart
  const handleUpdateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
    } else {
      setCartItems((prev) =>
        prev.map((item) => {
          if (item.id === cartItemId) {
            const stock = getOrderableStock(item.product, item.selectedColor, item.selectedSize, preorderMode);
            const clamped = stock > 0 ? Math.min(newQty, stock) : newQty;
            return { ...item, quantity: clamped };
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
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id === cartItemId) {
          const availableStock = getOrderableStock(item.product, newColor, newSize, preorderMode);
          const clampedQty = Math.max(1, Math.min(item.quantity, Math.max(1, availableStock)));
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
  // A code applied before the promos are read (a banner, the chat): applied as soon as they come
  const [pendingPromoCode, setPendingPromoCode] = useState<string | null>(null);

  const handleApplyPromo = (code: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    if (!promosLoaded) {
      requestPromos();
      setPendingPromoCode(cleanCode);
      addToast('Проверяем промокод…', 'info');
      return false;
    }
    const foundPromo = promos.find((p) => p.code.toUpperCase() === cleanCode);

    if (!foundPromo) {
      addToast('Промокод не найден', 'error');
      return false;
    }

    const promoError = validatePromo(foundPromo, cartItems.map(toPricingLine));
    if (promoError) {
      addToast(promoError, 'error');
      return false;
    }

    // usedCount grows only when an order with the promo is placed (not on applying it)
    const isFixed = promoDiscountKind(foundPromo) === 'fixed';
    const discValue = foundPromo.discountValue !== undefined ? foundPromo.discountValue : foundPromo.discountPercent;

    setAppliedPromo({
      code: foundPromo.code,
      discountPercent: foundPromo.discountPercent,
      discountType: isFixed ? 'fixed' : 'percent',
      discountValue: discValue,
      minOrderAmount: foundPromo.minOrderAmount,
      isReferral: foundPromo.isReferral,
      partnerName: foundPromo.partnerName,
      partnerCommissionPercent: foundPromo.partnerCommissionPercent,
      applicableCategories: foundPromo.applicableCategories,
      applicableProductIds: foundPromo.applicableProductIds,
    });

    const discountText = promoDiscountText({
      discountType: isFixed ? 'fixed' : 'percent',
      discountValue: discValue,
      discountPercent: foundPromo.discountPercent,
    });

    addToast(`Промокод ${foundPromo.code} применен: скидка ${discountText}`, 'success');
    return true;
  };

  // An applied promo is checked again whenever the cart or the code changes: a shrunk cart, an expired or
  // switched-off code must not reach the order with the discount
  React.useEffect(() => {
    if (!promosLoaded || !pendingPromoCode) return;
    setPendingPromoCode(null);
    handleApplyPromo(pendingPromoCode);
    // handleApplyPromo is recreated on every render; it runs once, when the promos come
  }, [promosLoaded, pendingPromoCode]);

  React.useEffect(() => {
    if (!appliedPromo || !promosLoaded) return;
    if (cartItems.length === 0) {
      setAppliedPromo(null);
      return;
    }
    const current = promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase());
    const problem = current ? validatePromo(current, cartItems.map(toPricingLine)) : 'Промокод больше не действует';
    if (problem) {
      setAppliedPromo(null);
      addToast(`Промокод ${appliedPromo.code} снят. ${problem}`, 'info');
    }
    // addToast is recreated on every render; the check depends only on the cart and the codes
  }, [cartItems, promos, promosLoaded, appliedPromo]);

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    addToast('Промокод отменен', 'info');
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);


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
    handleAddToCartQuick,
    handleAddToCartWithOptions,
    handleUpdateQuantity,
    handleRemoveCartItem,
    handleUpdateCartItemVariant,
    handleMoveToFavoritesFromCart,
    handleClearCart,
    handleApplyPromo,
    handleRemovePromo,
  };
}
