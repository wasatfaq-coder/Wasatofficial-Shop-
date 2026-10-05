import type { FabricCompositionItem, Product } from '../types';

/**
 * Chips of the product form (fast product entry, stage 1, `docs/fast-product-entry-spec.md`): values the shop's products
 * already have, the most used first, then common ones. The owner reads the garment label and taps instead of typing.
 */

export const COMMON_FIBERS = ['Хлопок', 'Лён', 'Полиэстер', 'Эластан', 'Вискоза', 'Шерсть', 'Полиамид', 'Акрил'];

export const COMMON_COUNTRIES = ['Россия', 'Китай', 'Турция', 'Узбекистан', 'Киргизия', 'Бангладеш', 'Индия', 'Вьетнам'];

/** Chips shown at most: a row or two on a phone */
export const SUGGESTION_LIMIT = 10;

const keyOf = (value: string) => value.trim().toLowerCase().replace(/ё/g, 'е');

/**
 * The shop's values by use (a repeat in another case is one chip, spelled as first met), then the common ones; values
 * already chosen are left out.
 */
export function suggestValues(used: string[], common: string[], chosen: string[] = [], limit = SUGGESTION_LIMIT): string[] {
  const skip = new Set(chosen.map(keyOf));
  const counts = new Map<string, { value: string; count: number; first: number }>();
  used.forEach((raw, i) => {
    const value = raw.trim();
    const key = keyOf(value);
    if (!key || skip.has(key)) return;
    const seen = counts.get(key);
    if (seen) seen.count++;
    else counts.set(key, { value, count: 1, first: i });
  });
  const fromShop = [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((v) => v.value);
  const shopKeys = new Set(fromShop.map(keyOf));
  const rest = common.filter((value) => !shopKeys.has(keyOf(value)) && !skip.has(keyOf(value)));
  return [...fromShop, ...rest].slice(0, limit);
}

type Source = Pick<Product, 'fabricComposition' | 'countryOfOrigin' | 'weave'>;

export const fiberSuggestions = (products: Source[], composition: FabricCompositionItem[]) =>
  suggestValues(
    products.flatMap((p) => (p.fabricComposition ?? []).map((c) => c.fiber)),
    COMMON_FIBERS,
    composition.map((c) => c.fiber)
  );

export const countrySuggestions = (products: Source[], current: string) =>
  suggestValues(
    products.map((p) => p.countryOfOrigin ?? ''),
    COMMON_COUNTRIES,
    [current]
  );

/** Weaves: only those the shop has entered (no common list: names differ from fabric to fabric) */
export const weaveSuggestions = (products: Source[], current: string) =>
  suggestValues(
    products.map((p) => p.weave ?? ''),
    [],
    [current]
  );

/** What is left to 100 % after the other rows (never below 0) */
export function remainingPercent(items: FabricCompositionItem[], exceptIndex: number): number {
  const others = items.reduce((sum, item, i) => (i === exceptIndex ? sum : sum + (Number(item.percentage) || 0)), 0);
  return Math.max(0, 100 - others);
}

/**
 * The row whose share fills itself: it gets what the other rows leave to 100 %. A tapped fiber becomes that row; typing
 * its own share makes it a plain row (`autoIndex` null). Example: tap «Хлопок» (100 %), tap «Эластан» (0 %), type 95
 * for cotton — elastane becomes 5 %.
 */
export function withAutoRemainder(items: FabricCompositionItem[], autoIndex: number | null): FabricCompositionItem[] {
  if (autoIndex === null || !items[autoIndex]) return items;
  const percentage = remainingPercent(items, autoIndex);
  if (items[autoIndex].percentage === percentage) return items;
  return items.map((item, i) => (i === autoIndex ? { ...item, percentage } : item));
}
