/**
 * The price journal (admin audit 09.10, finding 11): every change of a product's price — by «Применить» of the rates
 * or by the admin's own edit — leaves an entry with the old and the new price and who made it, so a dispute with
 * a wholesale customer can be settled. Plain data: no Firestore here.
 */
import type { PriceChangeLog, Product } from '../types';
import { workingRate, type ExchangeRates } from './currencyPricing';

/** How many newest entries «Журнал цен» shows */
export const PRICE_CHANGES_LIMIT = 100;

const idPart = () => Math.random().toString(36).slice(2, 8);

/**
 * Entries for the products whose price differs between `previous` and `next` (new and removed products have no
 * price change). With `rates` — the change came from «Применить», and each entry keeps the working rate of its currency.
 */
export function priceChangeEntries(
  previous: Pick<Product, 'id' | 'price'>[],
  next: Pick<Product, 'id' | 'title' | 'price' | 'purchase'>[],
  { operator, rates, now = new Date() }: { operator: string; rates?: ExchangeRates; now?: Date }
): PriceChangeLog[] {
  const before = new Map(previous.map((p) => [p.id, p.price]));
  const createdAt = now.toISOString();
  const entries: PriceChangeLog[] = [];
  for (const product of next) {
    const oldPrice = before.get(product.id);
    if (oldPrice === undefined || oldPrice === product.price) continue;
    const currency = rates ? product.purchase?.currency : undefined;
    const rate = currency && rates ? workingRate(currency === 'USD' ? rates.usd : rates.cny) : null;
    entries.push({
      id: `${createdAt.slice(0, 10)}_${now.getTime()}_${product.id.replace(/[^\w-]/g, '').slice(0, 40)}_${idPart()}`,
      createdAt,
      productId: product.id,
      productTitle: product.title,
      oldPrice,
      newPrice: product.price,
      source: rates ? 'rates' : 'admin',
      ...(currency && rate !== null ? { currency, rate } : {}),
      operator,
    });
  }
  return entries;
}

/** «вручную» or «по курсу 90 ₽ за $» */
export function priceChangeSourceText(entry: Pick<PriceChangeLog, 'source' | 'currency' | 'rate'>): string {
  if (entry.source !== 'rates') return 'вручную';
  if (!entry.currency || typeof entry.rate !== 'number') return 'по курсу';
  const sign = entry.currency === 'USD' ? '$' : '¥';
  return `по курсу ${entry.rate.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₽ за ${sign}`;
}
