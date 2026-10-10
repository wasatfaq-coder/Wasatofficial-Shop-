import type { CartItem, Order, PromoCode } from '../types';
import { calcSubtotal, toPricingLine } from '../shared/orderPricing';
import { linePrice } from '../shared/orderLine';
import { extractColorName, extractSizeName } from './inventory';

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
 *
 * `refundDelivery` gives the delivery back too (owner's decision 10.10): the order keeps no delivery fee, so the money
 * returned holds it once and «Аналитика» does not take it off the goods a second time.
 */
export function adjustedOrderTotals(
  order: Pick<Order, 'items' | 'totalPrice' | 'deliveryFee' | 'discountAmount' | 'promoCode'>,
  items: CartItem[],
  promos: PromoCode[] = [],
  options: { refundDelivery?: boolean } = {}
): AdjustedTotals {
  const oldSubtotal = calcSubtotal((order.items ?? []).map(toPricingLine));
  const subtotal = calcSubtotal(items.map(toPricingLine));
  const paidDelivery = order.deliveryFee ?? Math.max(0, order.totalPrice - oldSubtotal + (order.discountAmount ?? 0));
  const oldDiscount = order.discountAmount ?? Math.max(0, oldSubtotal + paidDelivery - order.totalPrice);
  const deliveryFee = options.refundDelivery ? 0 : paidDelivery;

  if (subtotal === oldSubtotal && sameLines(order.items ?? [], items)) {
    return { subtotal, discount: oldDiscount, deliveryFee, total: order.totalPrice - (paidDelivery - deliveryFee) };
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
  return `${item.product.id}|${item.selectedColor ?? ''}|${item.selectedSize ?? ''}|${item.quantity}|${linePrice(item)}`;
}

function sameLines(a: CartItem[], b: CartItem[]): boolean {
  if (a.length !== b.length) return false;
  const keys = a.map(lineKey).sort();
  return b.map(lineKey).sort().every((key, i) => key === keys[i]);
}

/** What the adjustment gives back, model by model: «Чинос (M, синий) × 1 — 3 500 ₽; доставка — 350 ₽» */
export function refundedLinesText(returned: CartItem[], deliveryRefund = 0): string {
  const parts = returned.map((it) => {
    const variant = [extractSizeName(it.selectedSize), extractColorName(it.selectedColor)].filter(Boolean).join(', ');
    const title = it.product?.title ?? 'Товар';
    const sum = (linePrice(it) * it.quantity).toLocaleString('ru-RU');
    return `${title}${variant ? ` (${variant})` : ''} × ${it.quantity} — ${sum} ₽`;
  });
  if (deliveryRefund > 0) parts.push(`доставка — ${deliveryRefund.toLocaleString('ru-RU')} ₽`);
  return parts.join('; ');
}
