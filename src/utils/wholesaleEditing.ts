/**
 * Admin only: the wholesale fields of the product form and the volume-discount scale of «Опт» as the owner types them
 * (strings: a field may be empty). Prices themselves are counted by src/shared/wholesalePricing.ts.
 */
import type { SaleChannel } from '../shared/wholesalePricing';
import { parseDecimal } from './currencyPricing';

const MAX_PACK_SIZE = 1_000;
const MAX_MIN_PACKS = 100_000;
const MAX_MARKUP_PERCENT = 1000;

/** «12», « 3 » → the whole number; empty, a fraction or not a number — NaN */
export function wholeNumber(value: string): number {
  const text = value.trim().replace(/\s/g, '');
  if (!text) return NaN;
  const n = Number(text);
  return Number.isInteger(n) ? n : NaN;
}

const filled = (value: string) => value.trim() !== '';
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

export interface WholesaleFormDraft {
  channel: SaleChannel;
  /** Wholesale price of one item, ₽ */
  price: string;
  /** Items in a pack */
  packSize: string;
  /** The fewest packs in an order */
  minPacks: string;
  /** The product's own wholesale markup, % */
  markup: string;
  /** The retail price of the form */
  retailPrice: number;
}

/** What stops the product form from saving its wholesale fields; empty — fine. «Только в розницу» checks nothing */
export function wholesaleFormErrors(d: WholesaleFormDraft): string[] {
  if (d.channel === 'retail') return [];
  const errors: string[] = [];
  const price = parseDecimal(d.price);
  if (filled(d.price) && !(price > 0)) errors.push('Оптовая цена — число больше нуля');
  if (d.channel === 'wholesale' && !filled(d.price)) {
    errors.push('«Только оптом»: укажите оптовую цену — без неё товар продаётся в розницу');
  }
  if (filled(d.packSize) && !inRange(wholeNumber(d.packSize), 1, MAX_PACK_SIZE)) {
    errors.push(`Штук в упаковке — целое число от 1 до ${MAX_PACK_SIZE}`);
  }
  if (filled(d.minPacks) && !inRange(wholeNumber(d.minPacks), 1, MAX_MIN_PACKS)) {
    errors.push('Минимум упаковок — целое число от 1');
  }
  if (filled(d.markup) && !inRange(parseDecimal(d.markup), 0, MAX_MARKUP_PERCENT)) {
    errors.push(`Своя наценка опта — от 0 до ${MAX_MARKUP_PERCENT} %; пустое поле — наценка опта для всех товаров`);
  }
  return errors;
}
