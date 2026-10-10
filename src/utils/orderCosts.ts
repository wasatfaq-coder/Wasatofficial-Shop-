/**
 * Cost of each order line at the moment of sale — `order_costs/{заказ}` (admin only, owner's decision 09.10): «Аналитика»
 * counts the net profit of past orders by it, so a later purchase price (a new rate, a new supplier price) does not
 * change past reports. The buyer reads the order, so the cost never goes into the order itself. Plain data.
 *
 * Without Cloud Functions the admin's session writes the snapshot when it first sees a new order (`useOrderCostSnapshots`),
 * with the costs of that moment. Orders placed before ORDER_COSTS_SINCE get none: their cost is an estimate.
 */
import type { Order } from '../types';
import { lineCostKey, type OrderCostSnapshot } from './salesProfit';
import { orderTimestamp } from '../shared/orderDate';

export const ORDER_COSTS_COLLECTION = 'order_costs';
/** Orders from this moment get a snapshot (the day the snapshots were introduced, Moscow) */
export const ORDER_COSTS_SINCE = '2026-10-09T00:00:00+03:00';
/** The admin's session looks for orders without a snapshot only this far back: older ones are read by «Аналитика» only */
export const ORDER_COSTS_WINDOW_DAYS = 30;

export interface OrderCostLine {
  productId: string;
  size: string;
  color: string;
  /** Cost of one item, ₽ */
  unitCost: number;
}

export interface OrderCostDoc {
  orderId: string;
  /** The order's `createdAt`: the admin's session reads only the recent snapshots by it */
  orderCreatedAt: string;
  /** When the snapshot was taken */
  capturedAt: string;
  lines: OrderCostLine[];
}

/** Lines of an order that has more are not stored (an order holds up to 60 lines) */
export const ORDER_COST_LINES_MAX = 60;

/** Earliest `createdAt` whose orders the admin's session snapshots now */
export function orderCostsWindowStart(now: Date = new Date()): string {
  const since = Date.parse(ORDER_COSTS_SINCE);
  const windowStart = now.getTime() - ORDER_COSTS_WINDOW_DAYS * 86_400_000;
  return new Date(Math.max(since, windowStart)).toISOString();
}

/**
 * The snapshot of an order with today's costs; null — none of its products has a cost (nothing to keep: the report then
 * says the cost is missing). Lines without a cost are left out and count as before.
 */
export function buildOrderCostDoc(order: Order, costs: ReadonlyMap<string, number>, now: Date = new Date()): OrderCostDoc | null {
  const lines: OrderCostLine[] = [];
  const seen = new Set<string>();
  for (const item of order.items ?? []) {
    const productId = item.product?.id;
    const unitCost = productId ? costs.get(productId) : undefined;
    if (!productId || unitCost === undefined) continue;
    const key = lineCostKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ productId, size: item.selectedSize ?? '', color: item.selectedColor ?? '', unitCost });
  }
  // a date the browser cannot read (the buyer writes `createdAt`): the snapshot would not be found by its window
  const createdAt = order.createdAt ? Date.parse(order.createdAt) : NaN;
  if (lines.length === 0 || !Number.isFinite(createdAt)) return null;
  return {
    orderId: order.id,
    orderCreatedAt: new Date(createdAt).toISOString(),
    capturedAt: now.toISOString(),
    lines: lines.slice(0, ORDER_COST_LINES_MAX),
  };
}

/** Orders of the window without a snapshot that the session has not tried yet */
export function ordersNeedingCostSnapshot(
  orders: Order[],
  have: ReadonlySet<string>,
  tried: ReadonlySet<string>,
  now: Date = new Date()
): Order[] {
  const from = Date.parse(orderCostsWindowStart(now));
  return orders.filter((o) => {
    if (have.has(o.id) || tried.has(o.id) || !o.createdAt) return false;
    const t = orderTimestamp(o, now);
    return t !== null && t >= from;
  });
}

/** A stored snapshot as `salesProfit` reads it; a broken document — null */
export function readOrderCostDoc(data: Record<string, unknown>): OrderCostSnapshot | null {
  if (!Array.isArray(data.lines)) return null;
  const lines: Record<string, number> = {};
  for (const raw of data.lines) {
    if (!raw || typeof raw !== 'object') continue;
    const line = raw as Partial<OrderCostLine>;
    if (typeof line.productId !== 'string' || typeof line.unitCost !== 'number' || !Number.isFinite(line.unitCost)) continue;
    lines[lineCostKey({ product: { id: line.productId }, selectedSize: line.size ?? '', selectedColor: line.color ?? '' })] = line.unitCost;
  }
  return { lines };
}
