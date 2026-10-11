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
import { saleChannelOf } from '../shared/wholesalePricing';

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
  /** Retail markup on the purchase cost for every product without its own, percent */
  markupPercent: number;
  /**
   * Wholesale markup on the purchase cost for every wholesale product without its own, percent; absent — wholesale
   * prices are not counted from the rate (they stay as set in the product form)
   */
  wholesaleMarkupPercent?: number;
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
  /** The product's own wholesale markup, percent; absent — the wholesale markup for all products */
  wholesaleMarkupPercent?: number;
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

/** Cost of one item in roubles at these rates, kopecks; null when the purchase or the rate is not set */
function costFromRate(purchase: ProductPurchase | undefined, rates: ExchangeRates): number | null {
  if (!purchase || !isPositive(purchase.amount)) return null;
  const rate = workingRate(rateOf(rates, purchase.currency));
  return rate === null ? null : purchase.amount * rate;
}

/** The product's wholesale markup: its own or the one for all products; undefined — none is set */
export function effectiveWholesaleMarkup(purchase: ProductPurchase, rates: ExchangeRates): number | undefined {
  if (isNonNegative(purchase.wholesaleMarkupPercent)) return purchase.wholesaleMarkupPercent;
  return isNonNegative(rates.wholesaleMarkupPercent) ? rates.wholesaleMarkupPercent : undefined;
}

/** Wholesale price at these rates, rounded up to 10 ₽; null without a purchase, a rate or a wholesale markup */
export function wholesalePriceFromRate(purchase: ProductPurchase | undefined, rates: ExchangeRates): number | null {
  const cost = costFromRate(purchase, rates);
  const markup = purchase ? effectiveWholesaleMarkup(purchase, rates) : undefined;
  if (cost === null || markup === undefined) return null;
  return roundPriceUp(cost * (1 + markup / 100));
}

/** Price and cost in roubles at these rates; null when the purchase or the rate is not set */
export function priceFromRate(
  purchase: ProductPurchase | undefined,
  rates: ExchangeRates
): { price: number; costPrice: number } | null {
  const cost = costFromRate(purchase, rates);
  if (cost === null || !purchase) return null;
  return { price: roundPriceUp(cost * (1 + effectiveMarkup(purchase, rates) / 100)), costPrice: round(cost, 2) };
}

/** What the owner has to fix before the rates can be applied; empty — ready */
export function exchangeRateErrors(rates: ExchangeRates): string[] {
  const errors: string[] = [];
  for (const { id, title } of PURCHASE_CURRENCIES) {
    const r = rateOf(rates, id);
    if (!isPositive(r.official)) errors.push(`${title}: укажите курс ЦБ больше нуля`);
    else if (r.official > MAX_RATE) errors.push(`${title}: курс ЦБ — не больше ${MAX_RATE.toLocaleString('ru-RU')} ₽`);
    if (!isNonNegative(r.markup)) errors.push(`${title}: надбавка не может быть меньше нуля`);
    else if (r.markupKind === 'percent' && r.markup > 100) errors.push(`${title}: надбавка больше 100 %`);
    else if (r.markupKind === 'rub' && isPositive(r.official) && r.markup > r.official) {
      errors.push(`${title}: надбавка больше самого курса`);
    }
  }
  // an empty field is an error, not 0 %: with 0 % the price is the cost, and a kept discount took it below the cost
  // (owner's screenshot 09.10: «Куртка бомбер» 4 990 → 740 ₽ at a cost of 909 ₽)
  if (!isNonNegative(rates.markupPercent) || rates.markupPercent > MAX_MARKUP_PERCENT) {
    errors.push(`Наценка для розницы — укажите от 0 до ${MAX_MARKUP_PERCENT} %`);
  }
  const wholesale = rates.wholesaleMarkupPercent;
  if (wholesale !== undefined && (!isNonNegative(wholesale) || wholesale > MAX_MARKUP_PERCENT)) {
    errors.push(`Наценка для опта — от 0 до ${MAX_MARKUP_PERCENT} % или пусто`);
  }
  return errors;
}

/** A product with a purchase in a currency, before and after the rates */
export interface RepricedProduct {
  product: Product;
  currency: PurchaseCurrency;
  before: { price: number; costPrice?: number; originalPrice?: number; wholesalePrice?: number };
  /**
   * `originalPrice` null — the struck-out price is removed (it was not above the price); `wholesalePrice` absent — the
   * wholesale price does not change
   */
  after: { price: number; costPrice: number; originalPrice: number | null; wholesalePrice?: number };
  /** The product's discount, percent, kept at the new price; 0 — no discount (the stored percent is removed) */
  discountPercent: number;
  /** The kept discount was cut so the price is not below the cost; the percent asked for */
  discountCutFrom?: number;
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
): (RepricedProduct['after'] & Pick<RepricedProduct, 'discountPercent' | 'discountCutFrom'>) | null {
  const fromRate = priceFromRate(product.purchase, rates);
  if (!fromRate) return null;
  const wholesale = repricedWholesale(product, rates);
  const withWholesale = wholesale !== null ? { wholesalePrice: wholesale } : {};
  const old = product.originalPrice;
  const discounted = typeof old === 'number' && old > product.price && product.price > 0;
  if (!discounted) {
    return { ...fromRate, ...withWholesale, originalPrice: null, discountPercent: 0 };
  }
  const percent = keptDiscountPercent(product.price, old, product.discountPercent);
  // a kept discount never takes the price below the cost: it is cut to the cost rounded up (owner's task 09.10 —
  // no unexpected loss of margin)
  const floor = roundPriceUp(fromRate.costPrice);
  const wanted = roundPriceUp(fromRate.price * (1 - percent / 100));
  const cut = wanted < floor;
  const price = cut ? floor : wanted;
  if (price >= fromRate.price) {
    return { ...fromRate, ...withWholesale, originalPrice: null, discountPercent: 0, ...(cut ? { discountCutFrom: percent } : {}) };
  }
  return {
    price,
    costPrice: fromRate.costPrice,
    ...withWholesale,
    originalPrice: fromRate.price,
    discountPercent: cut ? Math.floor((1 - price / fromRate.price) * 100) : percent,
    ...(cut ? { discountCutFrom: percent } : {}),
  };
}

/**
 * The new wholesale price of a product sold wholesale: only one that already has a wholesale price, is «только оптом»
 * or has its own wholesale markup — a wholesale markup for all products never puts retail-only goods on wholesale sale.
 * null — the wholesale price stays as it is
 */
function repricedWholesale(product: Product, rates: ExchangeRates): number | null {
  if (saleChannelOf(product) === 'retail') return null;
  const opted =
    isPositive(product.wholesalePrice) ||
    saleChannelOf(product) === 'wholesale' ||
    isNonNegative(product.purchase?.wholesaleMarkupPercent);
  return opted ? wholesalePriceFromRate(product.purchase, rates) : null;
}

/** Products whose price, cost or old price changes at these rates (products without a purchase in a currency stay) */
export function repriceProducts(products: Product[], rates: ExchangeRates): RepricedProduct[] {
  const changes: RepricedProduct[] = [];
  for (const product of products) {
    const result = repriceProduct(product, rates);
    if (!result || !product.purchase) continue;
    const { discountPercent, discountCutFrom, ...after } = result;
    const sameOld = (after.originalPrice ?? undefined) === (product.originalPrice ?? undefined);
    const sameWholesale = after.wholesalePrice === undefined || after.wholesalePrice === product.wholesalePrice;
    // the stored percent alone is no change: it is written with the next new price
    if (after.price === product.price && after.costPrice === product.costPrice && sameOld && sameWholesale) continue;
    changes.push({
      product,
      currency: product.purchase.currency,
      before: {
        price: product.price,
        costPrice: product.costPrice,
        originalPrice: product.originalPrice,
        ...(typeof product.wholesalePrice === 'number' ? { wholesalePrice: product.wholesalePrice } : {}),
      },
      after,
      discountPercent,
      ...(discountCutFrom !== undefined ? { discountCutFrom } : {}),
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
    ...(isNonNegative(v.wholesaleMarkupPercent) && v.wholesaleMarkupPercent <= MAX_MARKUP_PERCENT
      ? { wholesaleMarkupPercent: v.wholesaleMarkupPercent }
      : {}),
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
    ...(isNonNegative(v.wholesaleMarkupPercent) ? { wholesaleMarkupPercent: v.wholesaleMarkupPercent } : {}),
    ...(typeof v.appliedAt === 'string' ? { appliedAt: v.appliedAt } : {}),
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
  };
}

/** Two purchases are the same (both absent counts as the same) */
export function samePurchase(a: ProductPurchase | undefined, b: ProductPurchase | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.currency === b.currency &&
    a.amount === b.amount &&
    a.markupPercent === b.markupPercent &&
    a.wholesaleMarkupPercent === b.wholesaleMarkupPercent
  );
}

/** A number typed by the owner: «4,20», «85.5», «1 200»; empty or not a number — NaN */
export function parseDecimal(value: string): number {
  const n = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
  return value.trim() === '' || !Number.isFinite(n) ? NaN : n;
}
