import type { CartItem, Order, PromoCode } from '../types';
import { calcSubtotal, toPricingLine } from '../shared/orderPricing';

export interface AdjustedTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
}

/**
 * Order total after «Корректировка заказа»: the new items plus the order's delivery, minus its discount.
 * The same items keep the order total as it was (changing only the track number must not touch the sum).
 *
 * Orders placed before delivery and discount were stored (`deliveryFee`, `discountAmount`) keep the difference
 * between their total and items as delivery (or, when the total is below the items, as the discount).
 * A percent promo keeps the order's own percent (discount ÷ items when it was placed) for the new items; otherwise the
 * discount stays the same sum, but not above the new items.
 */
export function adjustedOrderTotals(
  order: Pick<Order, 'items' | 'totalPrice' | 'deliveryFee' | 'discountAmount' | 'promoCode'>,
  items: CartItem[],
  promos: PromoCode[] = []
): AdjustedTotals {
  const oldSubtotal = calcSubtotal((order.items ?? []).map(toPricingLine));
  const subtotal = calcSubtotal(items.map(toPricingLine));
  const deliveryFee = order.deliveryFee ?? Math.max(0, order.totalPrice - oldSubtotal + (order.discountAmount ?? 0));
  const oldDiscount = order.discountAmount ?? Math.max(0, oldSubtotal + deliveryFee - order.totalPrice);

  if (subtotal === oldSubtotal && sameLines(order.items ?? [], items)) {
    return { subtotal, discount: oldDiscount, deliveryFee, total: order.totalPrice };
  }

  const promo = order.promoCode
    ? promos.find((p) => p.code.toUpperCase() === order.promoCode!.toUpperCase())
    : undefined;
  // A percent promo keeps the order's own share (its discount to its items): the code in «Промокоды» may have been
  // changed since, and the order must not get another percent (audit 02.10, finding 11). A fixed one stays the same sum.
  const isPercent = promo ? (promo.discountType ?? (promo.discountPercent ? 'percent' : 'fixed')) === 'percent' : false;
  const discount =
    isPercent && oldSubtotal > 0
      ? Math.min(subtotal, Math.round((oldDiscount * subtotal) / oldSubtotal))
      : Math.min(oldDiscount, subtotal);

  return { subtotal, discount, deliveryFee, total: Math.max(0, subtotal - discount + deliveryFee) };
}

function lineKey(item: CartItem): string {
  return `${item.product.id}|${item.selectedColor ?? ''}|${item.selectedSize ?? ''}|${item.quantity}|${item.product.price}`;
}

function sameLines(a: CartItem[], b: CartItem[]): boolean {
  if (a.length !== b.length) return false;
  const keys = a.map(lineKey).sort();
  return b.map(lineKey).sort().every((key, i) => key === keys[i]);
}
