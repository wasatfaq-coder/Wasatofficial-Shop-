import type { ChatMessage, Order, Product } from '../types';
import { computeFirestoreDailySales, isRevenueOrder } from './analyticsEngine';
import type { ExchangeRates } from './currencyPricing';
import { isHiddenFromSale, withMissingSkus } from './inventory';
import { chatMessageOrder } from './firebaseSync';
import { isReceiptOnReview } from './paymentDetails';
import { pluralRu } from './pluralize';
import { LEGACY_THREAD_KEY, summarizeSupportThreads } from './supportThreads';

const DAY_MS = 24 * 60 * 60 * 1000;
/** «Выручка за 7 дней» on «Сегодня» */
export const TODAY_REVENUE_DAYS = 7;

export interface AdminTodaySummary {
  /** Orders «Принят», not cancelled — the same number as on the «Заказы» tab */
  newOrders: number;
  /** Receipts the customer sent and nobody checked yet («Доработки 5») */
  receiptsOnReview: number;
  /** Dialogs where the customer wrote last */
  awaitingChats: number;
  /** When the longest-waiting of them wrote (ms); null — nobody waits or the time is unknown */
  oldestAwaitingAt: number | null;
  /** Variants on sale with 1…threshold items */
  lowVariants: number;
  /** Variants on sale with nothing left */
  outVariants: number;
  /** Paid money of «7 дней» exactly as «Аналитика» counts it (calendar days, after «Сбросить статистику»), and how
   * many orders brought it */
  revenue: number;
  paidOrders: number;
}

/** What waits for the owner today: one pass over what the panel already has, nothing is read for it */
export function summarizeAdminToday(
  orders: Order[],
  messages: ChatMessage[],
  products: Product[],
  lowStockThreshold: number,
  analyticsResetAt: number | null = null,
  now: Date = new Date()
): AdminTodaySummary {
  const awaiting = summarizeSupportThreads(messages, orders).filter((t) => t.awaitingReply);
  const awaitingTimes = awaiting
    .map((t) => waitingSince(messages.filter((m) => (m.threadId || LEGACY_THREAD_KEY) === t.key)))
    .filter((t): t is number => t !== null && t > 0);

  let lowVariants = 0;
  let outVariants = 0;
  for (const product of products) {
    if (isHiddenFromSale(product)) continue;
    for (const sku of withMissingSkus(product)) {
      if (sku.stock <= 0) outVariants++;
      else if (sku.stock <= lowStockThreshold) lowVariants++;
    }
  }

  // the same function, period and reset as «Аналитика» → «7 дней», so the two numbers never differ
  const week = computeFirestoreDailySales(orders, '7d', 'all', analyticsResetAt, now);

  return {
    newOrders: orders.filter((o) => o.status === 'accepted' && !o.isCancelled).length,
    receiptsOnReview: orders.filter(isReceiptOnReview).length,
    awaitingChats: awaiting.length,
    oldestAwaitingAt: awaitingTimes.length > 0 ? Math.min(...awaitingTimes) : null,
    lowVariants,
    outVariants,
    revenue: week.summary.totalRevenue,
    paidOrders: week.periodOrders.filter(isRevenueOrder).length,
  };
}

/**
 * When the customer's first unanswered message was written: after the staff's last reply the customer sees (notes do
 * not answer and do not restart the wait); null — nothing waits or its time is unknown
 */
function waitingSince(thread: ChatMessage[]): number | null {
  let since: number | null = null;
  for (const msg of [...thread].sort((a, b) => chatMessageOrder(a) - chatMessageOrder(b))) {
    if (msg.sender === 'user') {
      if (!msg.hiddenForStaff && since === null) since = chatMessageOrder(msg);
    } else if (!msg.isInternalNote) since = null;
  }
  return since;
}

/** «40 мин», «3 ч», «2 дня» — how long a customer has been waiting */
export function waitingFor(since: number, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.floor((now - since) / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])}`;
}

/**
 * Prices from the rate are out of date (admin audit 09.10, А11): products with a purchase in $ or ¥ exist and «Применить»
 * was last pressed a day or more ago, or never. `days` null — never applied; the banner is not shown (null) when no
 * product has a purchase in a currency or the rates were applied less than a day ago.
 */
export function staleRateDays(
  rates: Pick<ExchangeRates, 'appliedAt'>,
  products: Pick<Product, 'purchase'>[],
  now: Date = new Date()
): { days: number | null; products: number } | null {
  const priced = products.filter((p) => p.purchase).length;
  if (priced === 0) return null;
  const applied = rates.appliedAt ? Date.parse(rates.appliedAt) : NaN;
  if (!Number.isFinite(applied)) return { days: null, products: priced };
  const days = Math.floor((now.getTime() - applied) / DAY_MS);
  return days >= 1 ? { days, products: priced } : null;
}
