/**
 * Prices from the exchange rate (docs/wholesale-spec.md, owner's decisions 09.10): a product bought in dollars or yuan
 * keeps its purchase price in that currency (`product_costs`, admin only), and «Курсы и наценка» recalculates the rouble
 * price and the cost of every such product at once when the owner presses «Применить».
 *
 * Working rate = the official (central bank) rate + the owner's addition, in roubles or in percent:
 * 85 ₽ + 5 ₽ = 90 ₽; 85 ₽ + 2 % = 86,70 ₽. Price = purchase × working rate × (1 + markup), rounded up to 10 ₽ —
 * rounding up never takes the margin below the markup. No browser APIs: the module is plain arithmetic.
 */
import type { Product } from '../types';

/** `settings/{id}` of the rates; firestore.rules keep it from customers */
export const EXCHANGE_RATES_DOC_ID = 'exchange_rates';

export type PurchaseCurrency = 'USD' | 'CNY';

export const PURCHASE_CURRENCIES: { id: PurchaseCurrency; sign: string; title: string }[] = [
  { id: 'USD', sign: '$', title: 'Доллар' },
  { id: 'CNY', sign: '¥', title: 'Юань' },
];

/** The rate of one currency as the owner sets it */
export interface CurrencyRate {
  /** Official rate, roubles for one unit */
  official: number;
  /** The owner's addition on top of the official rate */
  markup: number;
  markupKind: 'rub' | 'percent';
}

/** `settings/exchange_rates` (admin only): rates, the markup for all products and when they were applied */
export interface ExchangeRates {
  usd: CurrencyRate;
  cny: CurrencyRate;
  /** Markup on the purchase cost for every product without its own, percent */
  markupPercent: number;
  /** When «Применить» last recalculated the prices (ISO); absent — never */
  appliedAt?: string;
  updatedAt?: string;
}

/** A product's purchase in a currency (`product_costs/{id}.purchase`) */
export interface ProductPurchase {
  currency: PurchaseCurrency;
  /** Purchase price of one item in that currency */
  amount: number;
  /** The product's own markup, percent; absent — the markup for all products */
  markupPercent?: number;
}

export const EMPTY_EXCHANGE_RATES: ExchangeRates = {
  usd: { official: 0, markup: 0, markupKind: 'rub' },
  cny: { official: 0, markup: 0, markupKind: 'rub' },
  markupPercent: 0,
};

/** Prices are rounded up to this many roubles (owner's decision 09.10) */
export const PRICE_ROUNDING_RUB = 10;

const MAX_RATE = 100_000;
const MAX_MARKUP_PERCENT = 1000;

const round = (n: number, digits: number) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isNonNegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

const rateOf = (rates: ExchangeRates, currency: PurchaseCurrency) => (currency === 'USD' ? rates.usd : rates.cny);

/** Official rate plus the owner's addition, 4 decimals; null while the official rate is not set */
export function workingRate(rate: CurrencyRate): number | null {
  if (!isPositive(rate.official) || !isNonNegative(rate.markup)) return null;
  const value = rate.markupKind === 'percent' ? rate.official * (1 + rate.markup / 100) : rate.official + rate.markup;
  return round(value, 4);
}

/** Up to the next 10 ₽; kopecks are settled first, so 900,0000001 stays 900 */
export function roundPriceUp(rub: number): number {
  return Math.ceil(round(rub, 2) / PRICE_ROUNDING_RUB) * PRICE_ROUNDING_RUB;
}

/** The product's markup: its own or the one for all products */
export function effectiveMarkup(purchase: ProductPurchase, rates: ExchangeRates): number {
  return isNonNegative(purchase.markupPercent) ? purchase.markupPercent : rates.markupPercent;
}

/** Price and cost in roubles at these rates; null when the purchase or the rate is not set */
export function priceFromRate(
  purchase: ProductPurchase | undefined,
  rates: ExchangeRates
): { price: number; costPrice: number } | null {
  if (!purchase || !isPositive(purchase.amount)) return null;
  const rate = workingRate(rateOf(rates, purchase.currency));
  if (rate === null) return null;
  const cost = purchase.amount * rate;
  return { price: roundPriceUp(cost * (1 + effectiveMarkup(purchase, rates) / 100)), costPrice: round(cost, 2) };
}

/** What the owner has to fix before the rates can be applied; empty — ready */
export function exchangeRateErrors(rates: ExchangeRates): string[] {
  const errors: string[] = [];
  for (const { id, title } of PURCHASE_CURRENCIES) {
    const r = rateOf(rates, id);
    if (!isPositive(r.official) || r.official > MAX_RATE) errors.push(`${title}: укажите курс ЦБ больше нуля`);
    if (!isNonNegative(r.markup)) errors.push(`${title}: надбавка не может быть меньше нуля`);
    else if (r.markupKind === 'percent' && r.markup > 100) errors.push(`${title}: надбавка больше 100 %`);
    else if (r.markupKind === 'rub' && isPositive(r.official) && r.markup > r.official) {
      errors.push(`${title}: надбавка больше самого курса`);
    }
  }
  if (!isNonNegative(rates.markupPercent) || rates.markupPercent > MAX_MARKUP_PERCENT) {
    errors.push(`Наценка для всех товаров — от 0 до ${MAX_MARKUP_PERCENT} %`);
  }
  return errors;
}

/** A product with a purchase in a currency, before and after the rates */
export interface RepricedProduct {
  product: Product;
  currency: PurchaseCurrency;
  before: { price: number; costPrice?: number; originalPrice?: number };
  /** `originalPrice` null — the struck-out price is removed (it was not above the price) */
  after: { price: number; costPrice: number; originalPrice: number | null };
  /** The product's discount, percent, kept at the new price; 0 — no discount (the stored percent is removed) */
  discountPercent: number;
}

/** Off by more than this, a stored discount is not the one the prices show (the price was changed by hand) */
const DISCOUNT_DRIFT_PERCENT = 2;

/**
 * The discount to keep: the owner's stored percent while the prices agree with it (rounding up to 10 ₽ makes the price
 * share a little larger, so a percent recalculated from it would shrink at every new rate), otherwise the one the
 * prices give, to a whole percent
 */
function keptDiscountPercent(price: number, oldPrice: number, stored: number | undefined): number {
  const fromPrices = (1 - price / oldPrice) * 100;
  const valid = typeof stored === 'number' && stored > 0 && stored < 100 && Math.abs(stored - fromPrices) <= DISCOUNT_DRIFT_PERCENT;
  return valid ? stored : Math.min(99, Math.round(fromPrices));
}

/**
 * Price, cost and old price of one product at these rates. A discounted product (old price above the price) keeps its
 * discount: the old price becomes the price from the rate, and the price goes the same share below it (owner's
 * choice 09.10, admin audit finding 3). An old price not above the price is no discount and is removed (finding 2).
 */
export function repriceProduct(
  product: Product,
  rates: ExchangeRates
): (RepricedProduct['after'] & { discountPercent: number }) | null {
  const fromRate = priceFromRate(product.purchase, rates);
  if (!fromRate) return null;
  const old = product.originalPrice;
  const discounted = typeof old === 'number' && old > product.price && product.price > 0;
  if (!discounted) {
    return { ...fromRate, originalPrice: null, discountPercent: 0 };
  }
  const percent = keptDiscountPercent(product.price, old, product.discountPercent);
  const price = roundPriceUp(fromRate.price * (1 - percent / 100));
  if (price >= fromRate.price) return { ...fromRate, originalPrice: null, discountPercent: 0 };
  return { price, costPrice: fromRate.costPrice, originalPrice: fromRate.price, discountPercent: percent };
}

/** Products whose price, cost or old price changes at these rates (products without a purchase in a currency stay) */
export function repriceProducts(products: Product[], rates: ExchangeRates): RepricedProduct[] {
  const changes: RepricedProduct[] = [];
  for (const product of products) {
    const result = repriceProduct(product, rates);
    if (!result || !product.purchase) continue;
    const { discountPercent, ...after } = result;
    const sameOld = (after.originalPrice ?? undefined) === (product.originalPrice ?? undefined);
    // the stored percent alone is no change: it is written with the next new price
    if (after.price === product.price && after.costPrice === product.costPrice && sameOld) continue;
    changes.push({
      product,
      currency: product.purchase.currency,
      before: { price: product.price, costPrice: product.costPrice, originalPrice: product.originalPrice },
      after,
      discountPercent,
    });
  }
  return changes;
}

/** Number of products bought in each currency (shown next to the rate) */
export function productsInCurrency(products: Product[], currency: PurchaseCurrency): number {
  return products.filter((p) => p.purchase?.currency === currency && isPositive(p.purchase.amount)).length;
}

/** A purchase read from the database: anything else is ignored rather than trusted */
export function readPurchase(value: unknown): ProductPurchase | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if ((v.currency !== 'USD' && v.currency !== 'CNY') || !isPositive(v.amount)) return undefined;
  return {
    currency: v.currency,
    amount: v.amount,
    ...(isNonNegative(v.markupPercent) && v.markupPercent <= MAX_MARKUP_PERCENT ? { markupPercent: v.markupPercent } : {}),
  };
}

const readRate = (value: unknown): CurrencyRate => {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    official: isNonNegative(v.official) ? v.official : 0,
    markup: isNonNegative(v.markup) ? v.markup : 0,
    markupKind: v.markupKind === 'percent' ? 'percent' : 'rub',
  };
};

/** `settings/exchange_rates` read from the database; a missing document is «not set» */
export function readExchangeRates(value: unknown): ExchangeRates {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    usd: readRate(v.usd),
    cny: readRate(v.cny),
    markupPercent: isNonNegative(v.markupPercent) ? v.markupPercent : 0,
    ...(typeof v.appliedAt === 'string' ? { appliedAt: v.appliedAt } : {}),
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
  };
}

/** Two purchases are the same (both absent counts as the same) */
export function samePurchase(a: ProductPurchase | undefined, b: ProductPurchase | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.currency === b.currency && a.amount === b.amount && a.markupPercent === b.markupPercent;
}

/** A number typed by the owner: «4,20», «85.5», «1 200»; empty or not a number — NaN */
export function parseDecimal(value: string): number {
  const n = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
  return value.trim() === '' || !Number.isFinite(n) ? NaN : n;
}
