/**
 * A product's recent prices (admin audit 09.10, finding 1): «Курсы и наценка» change prices often, and an order placed
 * before the change still has the old price. «Цены не совпадают с каталогом» compares the order with the price that was
 * in the catalog when it was placed, not with today's. Plain data: no browser APIs.
 */
import type { Product, PriceHistoryEntry } from '../types';

/** How many earlier prices a product keeps */
export const PRICE_HISTORY_LIMIT = 10;
/** Earlier prices older than this are dropped: an unpaid order this old is cancelled or checked by hand */
export const PRICE_HISTORY_DAYS = 60;
/** The buyer's clock and a cart opened a little before the change: prices in effect this long before the order count */
const ORDER_CLOCK_SLACK_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The product's history after its price changes from `before` to `after` at `now`: the old price is kept with the time
 * it ended. No change — the history as it was (trimmed of old entries).
 */
export function withPriceChange(before: Pick<Product, 'price' | 'priceHistory'>, afterPrice: number, now: Date = new Date()): PriceHistoryEntry[] {
  const kept = (before.priceHistory ?? []).filter((e) => now.getTime() - Date.parse(e.until) <= PRICE_HISTORY_DAYS * DAY_MS);
  if (before.price === afterPrice || !(before.price > 0)) return kept;
  return [...kept, { price: before.price, until: now.toISOString() }].slice(-PRICE_HISTORY_LIMIT);
}

/** Products whose price changed get the old one in their history; the rest stay as they are */
export function withPriceHistories(previous: Product[], next: Product[], now: Date = new Date()): Product[] {
  const before = new Map(previous.map((p) => [p.id, p]));
  return next.map((p) => {
    const old = before.get(p.id);
    if (!old || old.price === p.price) return p;
    return { ...p, priceHistory: withPriceChange(old, p.price, now) };
  });
}

/**
 * The prices the product had around the moment of an order: those in effect from a little before it (the buyer's clock,
 * a cart opened just before a change) up to the order. Without the order's time — today's price only.
 */
export function pricesAtOrderTime(product: Pick<Product, 'price' | 'priceHistory'>, orderTime: number | null): number[] {
  if (orderTime === null) return [product.price];
  const from = orderTime - ORDER_CLOCK_SLACK_MS;
  const entries = (product.priceHistory ?? [])
    .map((e) => ({ price: e.price, until: Date.parse(e.until) }))
    .filter((e) => !Number.isNaN(e.until))
    .sort((a, b) => a.until - b.until);
  // each price was in effect from the previous one's end up to its own; today's — from the last end on
  const periods = [...entries, { price: product.price, until: Infinity }];
  const prices = new Set<number>();
  let start = -Infinity;
  for (const { price, until } of periods) {
    if (until >= from && start <= orderTime) prices.add(price);
    start = until;
  }
  return [...prices];
}
