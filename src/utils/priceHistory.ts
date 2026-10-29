/**
 * A product's recent prices (admin audit 09.10, finding 1): «Курсы и наценка» change prices often, and an order placed
 * before the change still has the old price. «Цены не совпадают с каталогом» compares the order with the price that was
 * in the catalog when it was placed, not with today's. Plain data: no browser APIs.
 */
import type { Product, PriceHistoryEntry, WholesaleSettingsChange } from '../types';
import type { WholesaleSettings } from '../shared/wholesalePricing';

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

/**
 * The product's wholesale price history after `wholesalePrice` changes from `before` to `afterWholesalePrice` at `now`.
 */
export function withWholesalePriceChange(
  before: Pick<Product, 'wholesalePrice' | 'wholesalePriceHistory'>,
  afterWholesalePrice: number | undefined,
  now: Date = new Date()
): PriceHistoryEntry[] {
  const kept = (before.wholesalePriceHistory ?? []).filter(
    (e) => now.getTime() - Date.parse(e.until) <= PRICE_HISTORY_DAYS * DAY_MS
  );
  const oldWholesale = before.wholesalePrice;
  if (typeof oldWholesale !== 'number' || !(oldWholesale > 0) || oldWholesale === afterWholesalePrice) return kept;
  return [...kept, { price: oldWholesale, until: now.toISOString() }].slice(-PRICE_HISTORY_LIMIT);
}

/** Products whose retail or wholesale price changed get the old one in their history; the rest stay as they are */
export function withPriceHistories(previous: Product[], next: Product[], now: Date = new Date()): Product[] {
  const before = new Map(previous.map((p) => [p.id, p]));
  return next.map((p) => {
    const old = before.get(p.id);
    if (!old) return p;
    const retailChanged = old.price !== p.price;
    const wholesaleChanged =
      typeof old.wholesalePrice === 'number' && old.wholesalePrice > 0 && old.wholesalePrice !== p.wholesalePrice;
    if (!retailChanged && !wholesaleChanged) return p;
    return {
      ...p,
      ...(retailChanged ? { priceHistory: withPriceChange(old, p.price, now) } : {}),
      ...(wholesaleChanged ? { wholesalePriceHistory: withWholesalePriceChange(old, p.wholesalePrice, now) } : {}),
    };
  });
}

function activePricesInWindow(
  currentPrice: number | undefined,
  history: PriceHistoryEntry[] | undefined,
  orderTime: number | null
): number[] {
  const hasCurrent = typeof currentPrice === 'number' && currentPrice > 0;
  if (orderTime === null) return hasCurrent ? [currentPrice!] : [];
  const from = orderTime - ORDER_CLOCK_SLACK_MS;
  const entries = (history ?? [])
    .filter((e) => typeof e.price === 'number' && e.price > 0)
    .map((e) => ({ price: e.price, until: Date.parse(e.until) }))
    .filter((e) => !Number.isNaN(e.until))
    .sort((a, b) => a.until - b.until);
  const periods = hasCurrent ? [...entries, { price: currentPrice!, until: Infinity }] : entries;
  const prices = new Set<number>();
  let start = -Infinity;
  for (const { price, until } of periods) {
    if (until >= from && start <= orderTime) prices.add(price);
    start = until;
  }
  return [...prices];
}

/**
 * The prices the product had around the moment of an order: those in effect from a little before it (the buyer's clock,
 * a cart opened just before a change) up to the order. Without the order's time — today's price only.
 */
export function pricesAtOrderTime(product: Pick<Product, 'price' | 'priceHistory'>, orderTime: number | null): number[] {
  return activePricesInWindow(product.price, product.priceHistory, orderTime);
}

/**
 * The wholesale prices the product had around the moment of an order (`wholesalePriceHistory`, stage 21).
 */
export function wholesalePricesAtOrderTime(
  product: Pick<Product, 'wholesalePrice' | 'wholesalePriceHistory'>,
  orderTime: number | null
): number[] {
  return activePricesInWindow(product.wholesalePrice, product.wholesalePriceHistory, orderTime);
}

/** Changes of the «Опт» discounts kept: enough for unpaid orders, small in `settings/storefront` that every visitor reads */
const MAX_WHOLESALE_HISTORY = 20;

type WholesaleDiscounts = Pick<WholesaleSettingsChange, 'volumeDiscount' | 'brokenPackDiscount'>;

const sameDiscounts = (a: WholesaleDiscounts, b: WholesaleDiscounts) =>
  JSON.stringify(a.volumeDiscount ?? null) === JSON.stringify(b.volumeDiscount ?? null) &&
  JSON.stringify(a.brokenPackDiscount ?? null) === JSON.stringify(b.brokenPackDiscount ?? null);

/**
 * «Опт» saved: the discounts it had end now (audit 29.10, finding 16). Unchanged discounts — the history as it was.
 */
export function withWholesaleSettingsChange(
  history: WholesaleSettingsChange[] | undefined,
  before: WholesaleDiscounts,
  after: WholesaleDiscounts,
  now: Date = new Date()
): WholesaleSettingsChange[] | undefined {
  if (sameDiscounts(before, after)) return history;
  const entry: WholesaleSettingsChange = {
    until: now.toISOString(),
    ...(before.volumeDiscount ? { volumeDiscount: before.volumeDiscount } : {}),
    ...(before.brokenPackDiscount ? { brokenPackDiscount: before.brokenPackDiscount } : {}),
  };
  return [...(history ?? []), entry].slice(-MAX_WHOLESALE_HISTORY);
}

/**
 * The «Опт» settings in effect around the moment of an order: today's and those that ended after it (with the same
 * clock slack as prices). Without the order's time — today's only.
 */
export function wholesaleSettingsAtOrderTime(
  current: WholesaleSettings | undefined,
  history: WholesaleSettingsChange[] | undefined,
  orderTime: number | null
): (WholesaleSettings | undefined)[] {
  if (orderTime === null || !history?.length) return [current];
  const from = orderTime - ORDER_CLOCK_SLACK_MS;
  const ended = history
    .map((e) => ({ e, until: Date.parse(e.until) }))
    .filter(({ until }) => !Number.isNaN(until))
    .sort((a, b) => a.until - b.until);
  const found: (WholesaleSettings | undefined)[] = [];
  let start = -Infinity;
  for (const { e, until } of ended) {
    if (until >= from && start <= orderTime) {
      found.push({ ...current, volumeDiscount: e.volumeDiscount, brokenPackDiscount: e.brokenPackDiscount });
    }
    start = until;
  }
  // today's settings started at the last change: they count unless they began after the order
  if (start <= orderTime) found.push(current);
  return found.length > 0 ? found : [current];
}
