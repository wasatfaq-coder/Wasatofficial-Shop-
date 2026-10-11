/**
 * What an order brings in money — read by «Аналитика», «Клиенты», «Сегодня» and the partner commission. Plain data:
 * no browser APIs. Kept apart from analyticsEngine.ts so the profit sums (salesProfit.ts) use it without a cycle.
 */
import type { Order } from '../types';

/**
 * The part of `refundAmount` not yet taken off `totalPrice`. «Корректировка заказа» lowers `totalPrice` to the new
 * goods total and also adds the difference to `refundAmount` (the money to give back), so that part is already out of
 * the sum: taking it off again counted a 5 000 ₽ order cut to 3 000 ₽ as 1 000 ₽ of revenue (review 09.10)
 */
export function refundOutsideTotal(o: Pick<Order, 'refundAmount' | 'adjustmentLogs'>): number | null {
  if (typeof o.refundAmount !== 'number') return null;
  const byAdjustment = (o.adjustmentLogs ?? []).reduce((sum, log) => sum + (Number(log.refundAmount) || 0), 0);
  return Math.max(0, o.refundAmount - byAdjustment);
}

/** The order's sum minus a refund, whatever its payment (a cancelled order — 0) */
export function orderTotalAfterRefund(o: Order): number {
  if (o.isCancelled) return 0;
  const price = typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice) || 0;
  const refund = refundOutsideTotal(o) ?? 0;
  return Math.max(0, price - refund);
}

/**
 * Revenue an order brings: only paid money (owner's decision 02.10, finding 29) — «Оплачен» is set by the admin after
 * checking the money, and payment on delivery becomes «Оплачен» when the order is handed over. A refund is taken off;
 * a refunded order without the refunded sum counts as refunded in full. Unpaid and cancelled orders bring nothing.
 */
export function orderRevenue(o: Order): number {
  if (o.isCancelled) return 0;
  const price = typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice) || 0;
  const refund = refundOutsideTotal(o);
  if (o.paymentStatus === 'paid') return Math.max(0, price - (refund ?? 0));
  if (o.paymentStatus === 'refunded') return refund === null ? 0 : Math.max(0, price - refund);
  return 0;
}

/** The order is counted in «Выручка» and «Средний чек»: paid (a partly refunded one too) and not cancelled */
export function isRevenueOrder(o: Order): boolean {
  return !o.isCancelled && (o.paymentStatus === 'paid' || (o.paymentStatus === 'refunded' && orderRevenue(o) > 0));
}
