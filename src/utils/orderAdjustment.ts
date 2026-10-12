import type { CartItem, Order, PromoCode } from '../types';
import { calcSubtotal, isQuickOrderDelivery, toPricingLine } from '../shared/orderPricing';
import { linePrice } from '../shared/orderLine';
import { extractColorName, extractSizeName } from './inventory';

export interface AdjustedTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
}

type OrderMoney = Pick<Order, 'items' | 'totalPrice' | 'deliveryFee' | 'discountAmount' | 'promoCode'> &
  Partial<Pick<Order, 'deliveryMethod'>>;

export interface StoredOrderTotals extends AdjustedTotals {
  /** Delivery and discount are written in the order; false — an old order: print only items and the total */
  recorded: boolean;
  /** items − discount + delivery is the total (1 ₽ off is allowed); false — lines changed by hand or a forged order */
  matches: boolean;
}

/**
 * The order's sum for the invoice — only what the order says (a printed document for the customer must not guess):
 * items — `calcSubtotal` of the lines' own prices (`linePrice`, wholesale too), delivery — `deliveryFee`, discount —
 * `discountAmount` (the browser writes no field for 0, so an order without a promo code has none), total — `totalPrice`.
 * A 1-click order has neither delivery nor promo. An old order without `deliveryFee` (or with a promo code and no
 * `discountAmount`) is not `recorded`: its split is unknown.
 */
export function storedOrderTotals(order: OrderMoney): StoredOrderTotals {
  const subtotal = calcSubtotal((order.items ?? []).map(toPricingLine));
  const total = Number(order.totalPrice) || 0;
  const quick = isQuickOrderDelivery(order.deliveryMethod);
  const deliveryFee = Number(order.deliveryFee ?? (quick ? 0 : NaN));
  const discount = Number(order.discountAmount ?? (order.promoCode ? NaN : 0));
  if (!Number.isFinite(deliveryFee) || !Number.isFinite(discount)) {
    return { subtotal, discount: 0, deliveryFee: 0, total, recorded: false, matches: true };
  }
  return { subtotal, discount, deliveryFee, total, recorded: true, matches: Math.abs(subtotal - discount + deliveryFee - total) <= 1 };
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

/** A variant given back: `refundSum` — the exact money of what left the order (a size whose price was split into roubles
 * has two prices, and the price × quantity of either would be a rouble off) */
export type ReturnedLine = CartItem & { refundSum?: number };

/** What the adjustment gives back, model by model: «Чинос (M, синий) × 1 — 3 500 ₽; доставка — 350 ₽» */
export function refundedLinesText(returned: ReturnedLine[], deliveryRefund = 0): string {
  const parts = returned.map((it) => {
    const variant = [extractSizeName(it.selectedSize), extractColorName(it.selectedColor)].filter(Boolean).join(', ');
    const title = it.product?.title ?? 'Товар';
    const sum = (it.refundSum ?? linePrice(it) * it.quantity).toLocaleString('ru-RU');
    return `${title}${variant ? ` (${variant})` : ''} × ${it.quantity} — ${sum} ₽`;
  });
  if (deliveryRefund > 0) parts.push(`доставка — ${deliveryRefund.toLocaleString('ru-RU')} ₽`);
  return parts.join('; ');
}

/**
 * What an adjustment gives back to stock and takes from it, by variant (product, colour, size; preorder apart — it is
 * not on stock): the sum of every line of the variant before and after. A size pack has a line per size and a size
 * whose price was split into roubles has two (src/shared/packLines.ts) — matching line to line took the first of them.
 * A returned variant carries the money of what left the order, for the refund text
 */
export function variantStockDiff(before: CartItem[], after: CartItem[]): { returnedItems: ReturnedLine[]; addedItems: CartItem[] } {
  const key = (it: CartItem) =>
    `${it.product.id}|${extractColorName(it.selectedColor).toLowerCase()}|${extractSizeName(it.selectedSize).toLowerCase()}|${it.isPreorder ? 1 : 0}`;
  const totals = new Map<string, { template: CartItem; before: number; after: number; beforeSum: number; afterSum: number }>();
  const add = (it: CartItem, side: 'before' | 'after') => {
    const k = key(it);
    const entry = totals.get(k) ?? { template: it, before: 0, after: 0, beforeSum: 0, afterSum: 0 };
    const qty = Math.max(0, Number(it.quantity) || 0);
    entry[side] += qty;
    entry[side === 'before' ? 'beforeSum' : 'afterSum'] += linePrice(it) * qty;
    totals.set(k, entry);
  };
  before.forEach((it) => add(it, 'before'));
  after.forEach((it) => add(it, 'after'));
  const returnedItems: ReturnedLine[] = [];
  const addedItems: CartItem[] = [];
  for (const entry of totals.values()) {
    const diff = entry.after - entry.before;
    if (diff < 0) {
      returnedItems.push({ ...entry.template, quantity: -diff, refundSum: Math.max(0, entry.beforeSum - entry.afterSum) });
    } else if (diff > 0) {
      addedItems.push({ ...entry.template, quantity: diff });
    }
  }
  return { returnedItems, addedItems };
}
