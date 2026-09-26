import { Order } from '../types';
import { orderTimestamp } from '../shared/orderDate';

export type AnalyticsPeriod = '7d' | '14d' | '30d' | '6m' | '1y';
export type OrderStatusFilter = 'all' | 'paid' | 'delivered';

export interface DailyDataPoint {
  dateKey: string;          // ISO Date "YYYY-MM-DD"
  label: string;            // Short axis label: "Пн 15", "15 авг"
  date: string;             // Display date: "15 авг"
  fullDate: string;         // Full Russian date: "15 августа 2026"
  weekday: string;          // Short weekday: "Пн", "Вт", etc.
  revenue: number;          // Daily revenue in RUB
  prevRevenue: number;      // Comparison revenue from prior period
  orders: number;           // Orders count
  prevOrders: number;       // Comparison orders count
  avgCheck: number;         // Average check in RUB
  returns: number;          // Returns / cancellations
  prevReturns: number;      // Prior returns
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
}

const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_MONTHS_FULL = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];
const RU_MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
const RU_WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** YYYY-MM-DD in local time */
function formatISODateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabels(d: Date): { label: string; date: string; fullDate: string; weekday: string } {
  const dayNum = d.getDate();
  const monthIdx = d.getMonth();
  const weekday = RU_WEEKDAYS[d.getDay()] || '';
  return {
    label: `${weekday} ${dayNum}`,
    date: `${dayNum} ${RU_MONTHS_SHORT[monthIdx]}`,
    fullDate: `${dayNum} ${RU_MONTHS_FULL[monthIdx]} ${d.getFullYear()}`,
    weekday,
  };
}

/** Revenue an order brings: its total minus a refund; a cancelled order brings nothing */
export function orderRevenue(o: Order): number {
  if (o.isCancelled) return 0;
  const price = typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice) || 0;
  const refund = typeof o.refundAmount === 'number' ? o.refundAmount : 0;
  return Math.max(0, price - refund);
}

function matchesStatusFilter(o: Order, statusFilter: OrderStatusFilter): boolean {
  if (statusFilter === 'paid') {
    return (
      !o.isCancelled &&
      (o.paymentStatus === 'paid' || Boolean(o.paymentMethod && !o.paymentMethod.toLowerCase().includes('при получении')))
    );
  }
  if (statusFilter === 'delivered') {
    return !o.isCancelled && (o.status === 'delivered' || o.status === 'ready');
  }
  return true;
}

interface Bucket {
  start: number;
  end: number;
  dateKey: string;
  label: string;
  date: string;
  fullDate: string;
  weekday: string;
}

/** The period's buckets (days or months, oldest first) and the previous period of the same length */
function periodBuckets(period: AnalyticsPeriod, now: Date): { buckets: Bucket[]; prevStart: number } {
  const buckets: Bucket[] = [];
  if (period === '6m' || period === '1y') {
    const months = period === '6m' ? 6 : 12;
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const m = start.getMonth();
      buckets.push({
        start: start.getTime(),
        end: end.getTime(),
        dateKey: `${start.getFullYear()}-${String(m + 1).padStart(2, '0')}`,
        label: RU_MONTHS_SHORT[m].toUpperCase(),
        date: `${RU_MONTHS_SHORT[m]} ${start.getFullYear()}`,
        fullDate: `${RU_MONTHS_NOMINATIVE[m]} ${start.getFullYear()}`,
        weekday: 'Месяц',
      });
    }
    const prevStart = new Date(now.getFullYear(), now.getMonth() - months * 2 + 1, 1).getTime();
    return { buckets, prevStart };
  }
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
    const labels = formatDateLabels(start);
    buckets.push({
      start: start.getTime(),
      end: end.getTime(),
      dateKey: formatISODateKey(start),
      ...labels,
      label: period === '30d' ? labels.date : labels.label,
    });
  }
  const prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days * 2 + 1).getTime();
  return { buckets, prevStart };
}

const growth = (current: number, prev: number) =>
  prev > 0 ? Number((((current - prev) / prev) * 100).toFixed(1)) : 0;

/**
 * Orders of the selected period by day (7/14/30 days) or month (6/12 months), dated by createdAt
 * (orderTimestamp). Only orders placed after the statistics reset (settings/analytics.resetAt) count;
 * orders without a known date are counted separately and left out of the chart.
 */
export function computeFirestoreDailySales(
  orders: Order[],
  period: AnalyticsPeriod,
  statusFilter: OrderStatusFilter = 'all',
  resetAt: number | null = null,
  now: Date = new Date()
): { dailyData: DailyDataPoint[]; summary: AnalyticsSummary; periodOrders: Order[]; undatedCount: number } {
  const { buckets, prevStart } = periodBuckets(period, now);
  const periodStart = buckets[0].start;
  const periodEnd = buckets[buckets.length - 1].end;

  let undatedCount = 0;
  const dated: { order: Order; t: number }[] = [];
  for (const order of orders) {
    if (!matchesStatusFilter(order, statusFilter)) continue;
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
      avgCheck: active.length > 0 ? Math.round(revenue / active.length) : 0,
      returns: inBucket.length - active.length,
      prevReturns: 0,
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
  const totalReturns = dailyData.reduce((sum, item) => sum + item.returns, 0);
  const prevTotalRevenue = prevActive.reduce((sum, o) => sum + orderRevenue(o), 0);
  const prevTotalOrders = prevActive.length;
  const allPlaced = totalOrders + totalReturns;

  return {
    dailyData,
    periodOrders,
    undatedCount,
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
      avgCheck: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      totalReturns,
      // cancelled among all orders placed in the period
      returnRate: allPlaced > 0 ? ((totalReturns / allPlaced) * 100).toFixed(1) : '0',
      realOrdersCount: orders.length,
      paidOrdersCount: periodOrders.filter((o) => matchesStatusFilter(o, 'paid')).length,
      periodDaysCount: dailyData.length,
    },
  };
}

export interface ProductSales {
  id: string;
  title: string;
  image?: string;
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
      const lineRevenue = (Number(product.price) || 0) * quantity;
      const entry = products.get(product.id) ?? {
        id: product.id,
        title: product.title || 'Товар',
        image: product.images?.[0],
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
