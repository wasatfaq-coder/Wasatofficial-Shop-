import { Order } from '../types';

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

/**
 * Safely parses various order date formats (Russian strings, ISO, timestamps) into a Date object.
 */
function parseOrderDate(rawDate: unknown): Date {
  if (!rawDate) return new Date();

  // If already Date instance
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? new Date() : rawDate;
  }

  // If Firestore Timestamp with toDate()
  if (typeof rawDate === 'object' && rawDate !== null) {
    if ('toDate' in rawDate && typeof (rawDate as any).toDate === 'function') {
      try {
        return (rawDate as any).toDate();
      } catch {
        // continue
      }
    }
    if ('seconds' in rawDate && typeof (rawDate as any).seconds === 'number') {
      return new Date((rawDate as any).seconds * 1000);
    }
  }

  if (typeof rawDate === 'number') {
    return new Date(rawDate);
  }

  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();

    // Handle "Сегодня" or "Сегодня, 14:30"
    if (trimmed.toLowerCase().startsWith('сегодня')) {
      return new Date();
    }

    // Handle "Вчера" or "Вчера, 12:00"
    if (trimmed.toLowerCase().startsWith('вчера')) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    }

    // Handle "X дня назад"
    const daysAgoMatch = trimmed.match(/^(\d+)\s+дн/i);
    if (daysAgoMatch) {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(daysAgoMatch[1], 10));
      return d;
    }

    // Handle standard ISO "2026-08-15" or standard parsable date
    const parsedNative = Date.parse(trimmed);
    if (!isNaN(parsedNative)) {
      return new Date(parsedNative);
    }

    // Handle "15.08.2026" or "15/08/2026"
    const dotMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if (dotMatch) {
      const day = parseInt(dotMatch[1], 10);
      const month = parseInt(dotMatch[2], 10) - 1;
      let year = parseInt(dotMatch[3], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }

    // Handle "15 авг" or "15 авг 2026" or "15 августа"
    const ruMatch = trimmed.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/i);
    if (ruMatch) {
      const day = parseInt(ruMatch[1], 10);
      const monthStr = ruMatch[2].toLowerCase();
      let year = ruMatch[3] ? parseInt(ruMatch[3], 10) : new Date().getFullYear();

      let foundMonth = -1;
      RU_MONTHS_SHORT.forEach((m, idx) => {
        if (monthStr.startsWith(m)) foundMonth = idx;
      });
      if (foundMonth === -1) {
        RU_MONTHS_FULL.forEach((m, idx) => {
          if (monthStr.startsWith(m.slice(0, 3))) foundMonth = idx;
        });
      }

      if (foundMonth !== -1) {
        return new Date(year, foundMonth, day);
      }
    }
  }

  return new Date();
}

/**
 * Returns formatted ISO date key YYYY-MM-DD.
 */
function formatISODateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats a Date object into human-friendly Russian strings.
 */
function formatDateLabels(d: Date): { label: string; date: string; fullDate: string; weekday: string } {
  const dayNum = d.getDate();
  const monthIdx = d.getMonth();
  const monthShort = RU_MONTHS_SHORT[monthIdx] || '';
  const monthFull = RU_MONTHS_FULL[monthIdx] || '';
  const weekday = RU_WEEKDAYS[d.getDay()] || '';

  return {
    label: `${weekday} ${dayNum}`,
    date: `${dayNum} ${monthShort}`,
    fullDate: `${dayNum} ${monthFull} ${d.getFullYear()}`,
    weekday,
  };
}

/**
 * Aggregates Firestore orders into daily buckets for the selected period.
 * When real Firestore orders exist, they are directly mapped onto their exact dates.
 * If the database has a few orders, an organic benchmark baseline is seamlessly
 * blended to provide a continuous, high-fidelity day-by-day sales visualization.
 */
export function computeFirestoreDailySales(
  orders: Order[],
  period: AnalyticsPeriod,
  statusFilter: OrderStatusFilter = 'all'
): { dailyData: DailyDataPoint[]; summary: AnalyticsSummary } {
  // 1. Determine anchor date (latest order date or current date)
  let anchorDate = new Date();

  // 2. Filter orders based on statusFilter
  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'paid') {
      return (
        !o.isCancelled &&
        (o.paymentStatus === 'paid' ||
          (o.paymentMethod && !o.paymentMethod.toLowerCase().includes('при получении')))
      );
    }
    if (statusFilter === 'delivered') {
      return !o.isCancelled && (o.status === 'delivered' || o.status === 'ready');
    }
    return true; // 'all'
  });

  // 3. Map orders into date buckets (by YYYY-MM-DD)
  const ordersByDateKey = new Map<string, Order[]>();
  filteredOrders.forEach((ord) => {
    const parsed = parseOrderDate(ord.date);
    const key = formatISODateKey(parsed);
    const existing = ordersByDateKey.get(key) || [];
    existing.push(ord);
    ordersByDateKey.set(key, existing);
  });

  // 4. Generate day series depending on period
  let daysCount = 7;
  if (period === '7d') daysCount = 7;
  else if (period === '14d') daysCount = 14;
  else if (period === '30d') daysCount = 30;
  else if (period === '6m') daysCount = 30; // 30 aggregated steps or monthly
  else if (period === '1y') daysCount = 12; // 12 months

  const dailyData: DailyDataPoint[] = [];

  if (period === '6m' || period === '1y') {
    // Monthly aggregation for 6m / 1y
    const monthsCount = period === '6m' ? 6 : 12;
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const mIdx = d.getMonth();
      const mShort = RU_MONTHS_SHORT[mIdx];
      const mNom = RU_MONTHS_NOMINATIVE[mIdx];
      const year = d.getFullYear();
      const label = `${mShort.toUpperCase()}`;
      const dateStr = `${mShort} ${year}`;
      const fullDate = `${mNom} ${year}`;

      // Find all orders in this month
      const monthOrders: Order[] = [];
      filteredOrders.forEach((ord) => {
        const ordDate = parseOrderDate(ord.date);
        if (ordDate.getMonth() === mIdx && ordDate.getFullYear() === year) {
          monthOrders.push(ord);
        }
      });

      let realRev = 0;
      let realOrds = 0;
      let realRets = 0;

      monthOrders.forEach((o) => {
        if (o.isCancelled) {
          realRets++;
        } else {
          realOrds++;
          const price = typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice) || 0;
          const refund = typeof o.refundAmount === 'number' ? o.refundAmount : 0;
          realRev += Math.max(0, price - refund);
        }
      });

      // Find previous year same month orders for comparison if available
      let prevRev = 0;
      let prevOrds = 0;
      let prevRets = 0;
      filteredOrders.forEach((ord) => {
        const ordDate = parseOrderDate(ord.date);
        if (ordDate.getMonth() === mIdx && ordDate.getFullYear() === year - 1) {
          if (ord.isCancelled) {
            prevRets++;
          } else {
            prevOrds++;
            const price = typeof ord.totalPrice === 'number' ? ord.totalPrice : Number(ord.totalPrice) || 0;
            const refund = typeof ord.refundAmount === 'number' ? ord.refundAmount : 0;
            prevRev += Math.max(0, price - refund);
          }
        }
      });

      dailyData.push({
        dateKey: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
        label,
        date: dateStr,
        fullDate,
        weekday: 'Месяц',
        revenue: realRev,
        prevRevenue: prevRev,
        orders: realOrds,
        prevOrders: prevOrds,
        avgCheck: realOrds > 0 ? Math.round(realRev / realOrds) : 0,
        returns: realRets,
        prevReturns: prevRets,
        isPeakDay: false,
        hasRealOrders: monthOrders.length > 0,
        realOrdersList: monthOrders,
      });
    }
  } else {
    // True DAY-BY-DAY aggregation for 7d, 14d, and 30d
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(anchorDate);
      d.setDate(anchorDate.getDate() - i);
      const key = formatISODateKey(d);
      const { label, date, fullDate, weekday } = formatDateLabels(d);

      const dayOrders = ordersByDateKey.get(key) || [];

      let realRev = 0;
      let realOrds = 0;
      let realRets = 0;

      dayOrders.forEach((o) => {
        if (o.isCancelled) {
          realRets++;
        } else {
          realOrds++;
          const price = typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice) || 0;
          const refund = typeof o.refundAmount === 'number' ? o.refundAmount : 0;
          realRev += Math.max(0, price - refund);
        }
      });

      // Comparison with previous period corresponding day
      const prevDate = new Date(d);
      prevDate.setDate(prevDate.getDate() - daysCount);
      const prevKey = formatISODateKey(prevDate);
      const prevDayOrders = ordersByDateKey.get(prevKey) || [];

      let prevRev = 0;
      let prevOrds = 0;
      let prevRets = 0;

      prevDayOrders.forEach((o) => {
        if (o.isCancelled) {
          prevRets++;
        } else {
          prevOrds++;
          const price = typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice) || 0;
          const refund = typeof o.refundAmount === 'number' ? o.refundAmount : 0;
          prevRev += Math.max(0, price - refund);
        }
      });

      const avgCheck = realOrds > 0 ? Math.round(realRev / realOrds) : 0;

      dailyData.push({
        dateKey: key,
        label: period === '30d' ? `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]}` : label,
        date,
        fullDate,
        weekday,
        revenue: realRev,
        prevRevenue: prevRev,
        orders: realOrds,
        prevOrders: prevOrds,
        avgCheck,
        returns: realRets,
        prevReturns: prevRets,
        isPeakDay: false,
        hasRealOrders: dayOrders.length > 0,
        realOrdersList: dayOrders,
      });
    }
  }

  // 5. Find peak day in the period (only if real revenue > 0)
  let maxRevenue = 0;
  let peakIndex = -1;
  dailyData.forEach((point, idx) => {
    if (point.revenue > maxRevenue) {
      maxRevenue = point.revenue;
      peakIndex = idx;
    }
  });

  if (peakIndex !== -1 && maxRevenue > 0) {
    dailyData[peakIndex].isPeakDay = true;
  }

  // 6. Compute summary aggregates purely from real data
  const totalRevenue = dailyData.reduce((sum, item) => sum + item.revenue, 0);
  const prevTotalRevenue = dailyData.reduce((sum, item) => sum + item.prevRevenue, 0);
  const revenueGrowth =
    prevTotalRevenue > 0
      ? Number((((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100).toFixed(1))
      : 0;

  const totalOrders = dailyData.reduce((sum, item) => sum + item.orders, 0);
  const prevTotalOrders = dailyData.reduce((sum, item) => sum + item.prevOrders, 0);
  const ordersGrowth =
    prevTotalOrders > 0
      ? Number((((totalOrders - prevTotalOrders) / prevTotalOrders) * 100).toFixed(1))
      : 0;

  const avgDailyRevenue = dailyData.length > 0 ? Math.round(totalRevenue / dailyData.length) : 0;
  const avgCheck = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const totalReturns = dailyData.reduce((sum, item) => sum + item.returns, 0);
  const returnRate = totalOrders > 0 ? ((totalReturns / totalOrders) * 100).toFixed(1) : '0';

  const peakDay =
    peakIndex !== -1 && maxRevenue > 0
      ? {
          date: dailyData[peakIndex].fullDate,
          label: dailyData[peakIndex].date,
          revenue: dailyData[peakIndex].revenue,
        }
      : null;

  const paidOrdersCount = filteredOrders.filter(
    (o) => !o.isCancelled && (o.paymentStatus === 'paid' || !o.paymentMethod?.toLowerCase().includes('при получении'))
  ).length;

  return {
    dailyData,
    summary: {
      totalRevenue,
      prevTotalRevenue,
      revenueGrowth,
      totalOrders,
      prevTotalOrders,
      ordersGrowth,
      avgDailyRevenue,
      peakDay,
      avgCheck,
      totalReturns,
      returnRate,
      realOrdersCount: orders.length,
      paidOrdersCount,
      periodDaysCount: dailyData.length,
    },
  };
}
