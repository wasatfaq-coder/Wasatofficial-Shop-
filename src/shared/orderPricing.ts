/**
 * Order pricing shared by the storefront (checkout UI) and Cloud Functions
 * (server-side order validation). Keep this module free of browser APIs.
 */
import type { CartItem, DeliveryMethod, PromoCode, StorefrontSettings } from '../types';

export const DEFAULT_FREE_DELIVERY_THRESHOLD = 5000;

/** Delivery method id used by the one-click "quick order" flow (no fee, no promo). */
export const QUICK_ORDER_DELIVERY_ID = 'quick-order';
export const QUICK_ORDER_DELIVERY_TITLE = 'Экспресс курьер (1 клик)';

export interface PricingLine {
  productId: string;
  category?: string;
  price: number;
  quantity: number;
}

/** The promo fields pricing needs; satisfied by both PromoCode and AppliedPromoInfo. */
export type PromoForPricing = Pick<
  PromoCode,
  'discountPercent' | 'discountType' | 'discountValue' | 'applicableCategories' | 'applicableProductIds'
>;

type DeliverySettings = Pick<
  StorefrontSettings,
  'freeDeliveryThreshold' | 'courierDeliveryPrice' | 'pickupDeliveryPrice' | 'postDeliveryPrice' | 'isExpressEnabled'
>;

/** A storefront cart line as the pricing sees it */
export function toPricingLine(item: Pick<CartItem, 'product' | 'quantity'>): PricingLine {
  return {
    productId: item.product.id,
    category: item.product.category,
    price: item.product.price,
    quantity: item.quantity,
  };
}

export function calcSubtotal(lines: PricingLine[]): number {
  return lines.reduce((acc, line) => acc + line.price * line.quantity, 0);
}

function isRestricted(promo: Partial<PromoForPricing>): boolean {
  return Boolean(promo.applicableProductIds?.length || promo.applicableCategories?.length);
}

/** Subtotal of the lines a promo applies to (all lines for unrestricted promos). */
function calcEligibleSubtotal(lines: PricingLine[], promo: Partial<PromoForPricing>): number {
  if (promo.applicableProductIds && promo.applicableProductIds.length > 0) {
    return calcSubtotal(lines.filter((l) => promo.applicableProductIds!.includes(l.productId)));
  }
  if (promo.applicableCategories && promo.applicableCategories.length > 0) {
    return calcSubtotal(lines.filter((l) => l.category && promo.applicableCategories!.includes(l.category)));
  }
  return calcSubtotal(lines);
}

export function calcPromoDiscount(lines: PricingLine[], promo: Partial<PromoForPricing> | null | undefined): number {
  if (!promo) return 0;
  const base = calcEligibleSubtotal(lines, promo);
  if (promo.discountType === 'fixed' && promo.discountValue) {
    return Math.min(base, promo.discountValue);
  }
  if (promo.discountPercent) {
    return Math.round((base * promo.discountPercent) / 100);
  }
  if (promo.discountValue) {
    return Math.round((base * promo.discountValue) / 100);
  }
  return 0;
}

/**
 * Validates that a promo can be applied to the given cart.
 * Returns a user-facing error message, or null when the promo is valid.
 */
export function validatePromo(promo: PromoCode, lines: PricingLine[], now: number = Date.now()): string | null {
  if (!promo.active) {
    return 'Срок действия промокода приостановлен или завершен';
  }
  if (promo.usageLimit && (promo.usedCount || 0) >= promo.usageLimit) {
    return 'Лимит использований данного промокода исчерпан';
  }
  if (promo.expiresAt && promo.expiresAt.includes('-')) {
    const expTime = new Date(promo.expiresAt).getTime();
    if (!isNaN(expTime) && expTime < now) {
      return `Срок действия промокода ${promo.code} истек`;
    }
  }
  const subtotal = calcSubtotal(lines);
  if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
    return `Минимальная сумма заказа для промокода ${promo.code}: ${promo.minOrderAmount.toLocaleString('ru-RU')} ₽ (в корзине: ${subtotal.toLocaleString('ru-RU')} ₽)`;
  }
  if (lines.length > 0 && isRestricted(promo) && calcEligibleSubtotal(lines, promo) === 0) {
    return promo.applicableProductIds?.length
      ? `Промокод ${promo.code} действует только на выбранные товары`
      : `Промокод ${promo.code} действует только на выбранные категории (рубашки, пиджаки и др.)`;
  }
  return null;
}

/** Active delivery methods with the effective price for the given subtotal. */
export function getAvailableDeliveryMethods(
  methods: DeliveryMethod[],
  settings: Partial<DeliverySettings> | null | undefined,
  subtotal: number
): DeliveryMethod[] {
  const freeThreshold = settings?.freeDeliveryThreshold ?? DEFAULT_FREE_DELIVERY_THRESHOLD;
  const isExpressAllowed = settings?.isExpressEnabled !== false;

  return methods
    .filter((d) => d.isActive !== false)
    .map((d) => {
      let effectivePrice = d.price;
      const threshold = d.freeThreshold !== undefined ? d.freeThreshold : freeThreshold;
      if (threshold > 0 && subtotal >= threshold) {
        effectivePrice = 0;
      } else if (d.id === 'courier' && settings?.courierDeliveryPrice !== undefined) {
        effectivePrice = subtotal >= freeThreshold ? 0 : settings.courierDeliveryPrice;
      } else if (d.id === 'pickup' && settings?.pickupDeliveryPrice !== undefined) {
        effectivePrice = settings.pickupDeliveryPrice;
      } else if (d.id === 'post' && settings?.postDeliveryPrice !== undefined) {
        effectivePrice = settings.postDeliveryPrice;
      }
      return { ...d, price: effectivePrice };
    })
    .filter((d) => !(d.id === 'express' && !isExpressAllowed));
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
}

export function calcOrderTotals(
  lines: PricingLine[],
  promo: Partial<PromoForPricing> | null | undefined,
  deliveryFee: number
): OrderTotals {
  const subtotal = calcSubtotal(lines);
  const discount = calcPromoDiscount(lines, promo);
  return {
    subtotal,
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + deliveryFee),
  };
}
