import { Order } from '../types';
import { orderTimestamp } from '../shared/orderDate';
import { linePrice, orderSalesChannel, type SalesChannel } from '../shared/orderLine';
import { isRevenueOrder, orderRevenue } from './orderRevenue';
import {
  defaultGrouping,
  fitGrouping,
  periodBuckets,
  resolvePeriod,
  type AnalyticsGrouping,
  type PeriodSelection,
} from './analyticsPeriods';
import { NO_COSTS, orderCogs, orderGoodsRevenue, summarizeProfit, type CostSources, type ProfitSummary } from './salesProfit';

export { isRevenueOrder, orderRevenue, orderTotalAfterRefund } from './orderRevenue';
export type { AnalyticsPeriod, AnalyticsGrouping, PeriodSelection } from './analyticsPeriods';

export type OrderStatusFilter = 'all' | 'paid' | 'delivered';
/** «Все продажи», «Розница», «Опт» */
export type ChannelFilter = 'all' | SalesChannel;

export interface DailyDataPoint {
  dateKey: string;          // «YYYY-MM-DD» (day), «WYYYY-MM-DD» (week from Monday), «YYYY-MM» (month)
  label: string;            // Short axis label: "Пн 15", "15 авг", "ОКТ"
  date: string;             // Display date: "15 авг"
  fullDate: string;         // Full Russian date: "15 августа 2026", "5–11 октября 2026"
  weekday: string;          // Short weekday: "Пн", "Вт", etc.; «Неделя», «Месяц»
  revenue: number;          // Revenue in RUB: paid money with delivery
  prevRevenue: number;      // Comparison revenue from prior period
  orders: number;           // Orders count
  prevOrders: number;       // Comparison orders count
  avgCheck: number;         // Average check in RUB
  returns: number;          // Returns / cancellations
  prevReturns: number;      // Prior returns
  /** What the goods of the paid orders cost to buy (salesProfit.ts) */
  cogs: number;
  /** Paid money for goods (without delivery) minus `cogs`; may be below zero */
  netProfit: number;
  isPeakDay: boolean;       // Is this the peak revenue day in the period?
  hasRealOrders: boolean;   // Are there real Firestore orders on this date?
  realOrdersList: Order[];  // Orders placed on this date
}

export interface AnalyticsSummary {
  totalRevenue: number;
  prevTotalRevenue: number;
  revenueGrowth: number;
  totalOrders: number;
  prevTotalOrders: number;
  ordersGrowth: number;
  avgDailyRevenue: number;
  peakDay: { date: string; revenue: number; label: string } | null;
  avgCheck: number;
  totalReturns: number;
  returnRate: string;
  realOrdersCount: number;
  paidOrdersCount: number;
  periodDaysCount: number;
  /** Net profit of the period (salesProfit.ts) and of the previous one */
  profit: ProfitSummary;
  prevNetProfit: number;
  netProfitGrowth: number;
}

/** What else the period is counted by: grouping (default — by the period), sales channel, line costs */
export interface SalesOptions {
  grouping?: AnalyticsGrouping;
  channel?: ChannelFilter;
  costs?: CostSources;
}

function matchesStatusFilter(o: Order, statusFilter: OrderStatusFilter): boolean {
  if (statusFilter === 'paid') {
    // «Оплачен» ставит только администратор: способ оплаты сам по себе не значит, что деньги пришли
    return !o.isCancelled && o.paymentStatus === 'paid';
  }
  if (statusFilter === 'delivered') {
    // «Врученные» — только полученные: «Готов к выдаче» и «Ожидает подтверждения» ещё у магазина или у перевозчика
    return !o.isCancelled && o.status === 'delivered';
  }
  return true;
}

function matchesChannel(o: Order, channel: ChannelFilter): boolean {
  return channel === 'all' || orderSalesChannel(o) === channel;
}

const growth = (current: number, prev: number) =>
  prev > 0 ? Number((((current - prev) / prev) * 100).toFixed(1)) : 0;

/**
 * Orders of the selected period by day, week or month, dated by createdAt (orderTimestamp). Only orders placed after
 * the statistics reset (settings/analytics.resetAt) count; orders without a known date are counted separately and left
 * out of the chart. `options.channel` keeps only retail or only wholesale orders (every number then is of that channel),
 * `options.costs` gives the line costs for the net profit.
 */
export function computeFirestoreDailySales(
  orders: Order[],
  period: PeriodSelection,
  statusFilter: OrderStatusFilter = 'all',
  resetAt: number | null = null,
  now: Date = new Date(),
  options: SalesOptions = {}
): { dailyData: DailyDataPoint[]; summary: AnalyticsSummary; periodOrders: Order[]; undatedCount: number; grouping: AnalyticsGrouping } {
  const resolved = resolvePeriod(period, now);
  const grouping = fitGrouping(options.grouping ?? defaultGrouping(period, now), resolved);
  const buckets = periodBuckets(resolved, grouping);
  const periodStart = resolved.start.getTime();
  const periodEnd = resolved.end.getTime();
  const prevStart = resolved.prevStart.getTime();
  const channel = options.channel ?? 'all';
  const costs = options.costs ?? NO_COSTS;

  let undatedCount = 0;
  const dated: { order: Order; t: number }[] = [];
  for (const order of orders) {
    if (!matchesStatusFilter(order, statusFilter) || !matchesChannel(order, channel)) continue;
    const t = orderTimestamp(order, now);
    if (t === null) {
      if (resetAt === null) undatedCount++;
      continue;
    }
    if (resetAt !== null && t < resetAt) continue;
    dated.push({ order, t });
  }

  const dailyData: DailyDataPoint[] = buckets.map((b) => {
    const inBucket = dated.filter((d) => d.t >= b.start && d.t < b.end).map((d) => d.order);
    const active = inBucket.filter((o) => !o.isCancelled);
    const revenue = active.reduce((sum, o) => sum + orderRevenue(o), 0);
    const paid = active.filter(isRevenueOrder);
    const goodsRevenue = paid.reduce((sum, o) => sum + orderGoodsRevenue(o), 0);
    const cogs = paid.reduce((sum, o) => sum + orderCogs(o, costs).cogs, 0);
    return {
      dateKey: b.dateKey,
      label: b.label,
      date: b.date,
      fullDate: b.fullDate,
      weekday: b.weekday,
      revenue,
      prevRevenue: 0,
      orders: active.length,
      prevOrders: 0,
      // the check of the paid orders: unpaid ones bring no revenue and would lower it
      avgCheck: paid.length > 0 ? Math.round(revenue / paid.length) : 0,
      returns: inBucket.length - active.length,
      prevReturns: 0,
      cogs,
      netProfit: goodsRevenue - cogs,
      isPeakDay: false,
      hasRealOrders: inBucket.length > 0,
      realOrdersList: inBucket,
    };
  });

  let peakIndex = -1;
  dailyData.forEach((point, idx) => {
    if (point.revenue > 0 && (peakIndex === -1 || point.revenue > dailyData[peakIndex].revenue)) peakIndex = idx;
  });
  if (peakIndex !== -1) dailyData[peakIndex].isPeakDay = true;

  const periodOrders = dated.filter((d) => d.t >= periodStart && d.t < periodEnd).map((d) => d.order);
  const prevOrders = dated.filter((d) => d.t >= prevStart && d.t < periodStart).map((d) => d.order);
  const prevActive = prevOrders.filter((o) => !o.isCancelled);

  const totalRevenue = dailyData.reduce((sum, item) => sum + item.revenue, 0);
  const totalOrders = dailyData.reduce((sum, item) => sum + item.orders, 0);
  const totalPaidOrders = periodOrders.filter(isRevenueOrder).length;
  const totalReturns = dailyData.reduce((sum, item) => sum + item.returns, 0);
  const prevTotalRevenue = prevActive.reduce((sum, o) => sum + orderRevenue(o), 0);
  const prevTotalOrders = prevActive.length;
  const allPlaced = totalOrders + totalReturns;
  const profit = summarizeProfit(periodOrders, costs);
  const prevNetProfit = summarizeProfit(prevOrders, costs).netProfit;

  return {
    dailyData,
    periodOrders,
    undatedCount,
    grouping,
    summary: {
      totalRevenue,
      prevTotalRevenue,
      revenueGrowth: growth(totalRevenue, prevTotalRevenue),
      totalOrders,
      prevTotalOrders,
      ordersGrowth: growth(totalOrders, prevTotalOrders),
      avgDailyRevenue: dailyData.length > 0 ? Math.round(totalRevenue / dailyData.length) : 0,
      peakDay:
        peakIndex !== -1
          ? { date: dailyData[peakIndex].fullDate, label: dailyData[peakIndex].date, revenue: dailyData[peakIndex].revenue }
          : null,
      avgCheck: totalPaidOrders > 0 ? Math.round(totalRevenue / totalPaidOrders) : 0,
      totalReturns,
      // cancelled among all orders placed in the period
      returnRate: allPlaced > 0 ? ((totalReturns / allPlaced) * 100).toFixed(1) : '0',
      realOrdersCount: orders.length,
      paidOrdersCount: periodOrders.filter((o) => matchesStatusFilter(o, 'paid')).length,
      periodDaysCount: dailyData.length,
      profit,
      prevNetProfit,
      netProfitGrowth: growth(profit.netProfit, prevNetProfit),
    },
  };
}

/**
 * A product of the period's top. No picture: the order line is written by the visitor, and a link from it would open
 * on the owner's screen and give away their IP (audit 07.10, finding 7) — the screen takes the photo from the catalog
 * by `id` (OrderLineThumbImage → orderLineImage), as «Заказы» do
 */
export interface ProductSales {
  id: string;
  title: string;
  quantity: number;
  revenue: number;
}

export interface CategorySales {
  name: string;
  revenue: number;
  share: number;
}

export interface PromoSales {
  code: string;
  orders: number;
  revenue: number;
  discount: number;
  /** Share of the period's orders placed with this code, % */
  share: number;
}

/**
 * Products, categories and promo codes of the period's orders — the screen and the PDF report use the same
 * numbers. Prices and names are taken from the order (what was actually sold), cancelled orders are skipped.
 */
export function computePeriodBreakdown(periodOrders: Order[], topCount = 5): {
  topProducts: ProductSales[];
  categories: CategorySales[];
  promos: PromoSales[];
} {
  const active = periodOrders.filter((o) => !o.isCancelled);
  const products = new Map<string, ProductSales>();
  const categories = new Map<string, number>();
  const promos = new Map<string, PromoSales>();
  let itemsTotal = 0;

  for (const order of active) {
    for (const item of order.items || []) {
      const product = item.product;
      if (!product) continue;
      const quantity = item.quantity || 1;
      const lineRevenue = linePrice(item) * quantity;
      const entry = products.get(product.id) ?? {
        id: product.id,
        title: product.title || 'Товар',
        quantity: 0,
        revenue: 0,
      };
      entry.quantity += quantity;
      entry.revenue += lineRevenue;
      products.set(product.id, entry);

      const category = product.categoryLabel?.trim() || 'Без категории';
      categories.set(category, (categories.get(category) || 0) + lineRevenue);
      itemsTotal += lineRevenue;
    }
    const code = order.promoCode?.trim().toUpperCase();
    if (code) {
      const promo = promos.get(code) ?? { code, orders: 0, revenue: 0, discount: 0, share: 0 };
      promo.orders += 1;
      promo.revenue += orderRevenue(order);
      promo.discount += Number(order.discountAmount) || 0;
      promos.set(code, promo);
    }
  }

  return {
    topProducts: [...products.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, topCount),
    categories: [...categories.entries()]
      .map(([name, revenue]) => ({ name, revenue, share: itemsTotal > 0 ? Math.round((revenue / itemsTotal) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    promos: [...promos.values()]
      .map((p) => ({ ...p, share: active.length > 0 ? Number(((p.orders / active.length) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.orders - a.orders),
  };
}
