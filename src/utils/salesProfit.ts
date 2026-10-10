/**
 * Net profit of sales for «Аналитика»: the money for goods minus what the goods cost to buy (COGS), retail and wholesale
 * apart (stage 19 of docs/admin-wholesale-plan.md). Plain data: no Firestore and no browser APIs.
 *
 * - Revenue of an order — `orderRevenue` (paid money only, a refund taken off) without the delivery the buyer paid:
 *   delivery money goes to the carrier and is not the goods' revenue. It already holds every discount: promo codes,
 *   the admin's corrections and wholesale prices of the lines (`unitPrice` of a tier or a pack, `linePrice`).
 * - Cost of a line — the cost at the moment of sale when the order has one (`OrderCostSnapshot`), otherwise today's
 *   cost of the product (`costPrice`, an estimate: the purchase price may have changed since). A line whose product has
 *   no cost at all is counted at 0 and reported, so the screen can say the profit is too high.
 */
import type { CartItem, Order, Product } from '../types';
import { orderSalesChannel, type SalesChannel } from '../shared/orderLine';
import { isRevenueOrder, orderRevenue } from './orderRevenue';

/** The cost of one item of each line at the moment of sale, by `lineCostKey` */
export interface OrderCostSnapshot {
  lines: Record<string, number>;
}

/** Where line costs come from: snapshots by order id, today's cost by product id */
export interface CostSources {
  current: ReadonlyMap<string, number>;
  snapshots?: ReadonlyMap<string, OrderCostSnapshot>;
}

export const NO_COSTS: CostSources = { current: new Map() };

/** A line of an order as its cost snapshot knows it: the product and the variant */
export function lineCostKey(item: Pick<CartItem, 'selectedSize' | 'selectedColor'> & { product?: Pick<Product, 'id'> }): string {
  return `${item.product?.id ?? ''}|${item.selectedSize ?? ''}|${item.selectedColor ?? ''}`;
}

/** Today's cost of each product that has one (a cost of 0 is taken as «not set») */
export function currentCostMap(products: Pick<Product, 'id' | 'costPrice'>[]): Map<string, number> {
  const costs = new Map<string, number>();
  for (const p of products) {
    if (typeof p.costPrice === 'number' && Number.isFinite(p.costPrice) && p.costPrice > 0) costs.set(p.id, p.costPrice);
  }
  return costs;
}

export interface OrderCost {
  cogs: number;
  /** At least one line is counted at today's cost, not the cost at the moment of sale */
  estimated: boolean;
  /** Lines whose product has no cost: counted at 0 */
  missingLines: number;
}

/** What the goods of an order cost to buy */
export function orderCogs(order: Pick<Order, 'id' | 'items'>, sources: CostSources): OrderCost {
  const snapshot = sources.snapshots?.get(order.id);
  let cogs = 0;
  let estimated = false;
  let missingLines = 0;
  for (const item of order.items ?? []) {
    const quantity = item.quantity || 1;
    const atSale = snapshot?.lines[lineCostKey(item)];
    if (typeof atSale === 'number' && Number.isFinite(atSale) && atSale >= 0) {
      cogs += atSale * quantity;
      continue;
    }
    const today = item.product ? sources.current.get(item.product.id) : undefined;
    if (today === undefined) {
      missingLines++;
      continue;
    }
    cogs += today * quantity;
    estimated = true;
  }
  return { cogs: Math.round(cogs), estimated, missingLines };
}

/** The order's paid money for goods: `orderRevenue` without the delivery fee */
export function orderGoodsRevenue(order: Order): number {
  const revenue = orderRevenue(order);
  const delivery = Number(order.deliveryFee) || 0;
  return Math.max(0, revenue - Math.max(0, delivery));
}

export interface ProfitSummary {
  /** Paid money for goods, discounts taken off, without delivery */
  revenue: number;
  /** What the sold goods cost to buy */
  cogs: number;
  /** revenue − cogs */
  netProfit: number;
  /** netProfit / revenue, % with one decimal; null — no revenue */
  marginPercent: number | null;
  /** Paid orders counted */
  orders: number;
  /** Orders counted at today's cost (at least one line) */
  estimatedOrders: number;
  /** Lines without any cost (counted at 0) */
  missingCostLines: number;
}

export const EMPTY_PROFIT: ProfitSummary = {
  revenue: 0,
  cogs: 0,
  netProfit: 0,
  marginPercent: null,
  orders: 0,
  estimatedOrders: 0,
  missingCostLines: 0,
};

/** Net profit of the paid orders among `orders` (unpaid and cancelled bring nothing and cost nothing) */
export function summarizeProfit(orders: Order[], sources: CostSources): ProfitSummary {
  let revenue = 0;
  let cogs = 0;
  let counted = 0;
  let estimatedOrders = 0;
  let missingCostLines = 0;
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue;
    const cost = orderCogs(order, sources);
    revenue += orderGoodsRevenue(order);
    cogs += cost.cogs;
    counted++;
    if (cost.estimated) estimatedOrders++;
    missingCostLines += cost.missingLines;
  }
  const netProfit = revenue - cogs;
  return {
    revenue,
    cogs,
    netProfit,
    marginPercent: revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : null,
    orders: counted,
    estimatedOrders,
    missingCostLines,
  };
}

/** Net profit of retail and wholesale apart (an order goes whole to the channel of `orderSalesChannel`) */
export function profitByChannel(orders: Order[], sources: CostSources): Record<SalesChannel, ProfitSummary> {
  return {
    retail: summarizeProfit(orders.filter((o) => orderSalesChannel(o) === 'retail'), sources),
    wholesale: summarizeProfit(orders.filter((o) => orderSalesChannel(o) === 'wholesale'), sources),
  };
}
