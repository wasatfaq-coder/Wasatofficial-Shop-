// Быстрое заведение товара, этап 1: чипы состава, страны и переплетения, остаток состава до 100 %
import { describe, expect, test } from 'bun:test';
import {
  COMMON_COUNTRIES,
  COMMON_FIBERS,
  countrySuggestions,
  fiberSuggestions,
  remainingPercent,
  suggestValues,
  weaveSuggestions,
  withAutoRemainder,
} from '../../src/utils/cardSuggestions';

describe('cardSuggestions', () => {
  test("the shop's values come first, the most used first; a repeat in another case is one chip", () => {
    expect(suggestValues(['Турция', 'Китай', 'турция', ' Турция '], ['Россия', 'Китай'])).toEqual(['Турция', 'Китай', 'Россия']);
  });

  test('values already chosen and blanks are left out; at most 10 chips', () => {
    expect(suggestValues(['', 'Лён'], ['Хлопок', 'Лен'], ['хлопок'])).toEqual(['Лён']);
    expect(suggestValues([], Array.from({ length: 15 }, (_, i) => `v${i}`))).toHaveLength(10);
  });

  test('fibers: those of the shop, then common ones, without the fibers already in the composition', () => {
    const products = [
      { fabricComposition: [{ fiber: 'Хлопок', percentage: 95 }, { fiber: 'Эластан', percentage: 5 }] },
      { fabricComposition: [{ fiber: 'Хлопок', percentage: 100 }] },
      {},
    ];
    const chips = fiberSuggestions(products, [{ fiber: 'Эластан', percentage: 0 }]);
    expect(chips[0]).toBe('Хлопок');
    expect(chips).not.toContain('Эластан');
    expect(fiberSuggestions([], [])).toEqual(COMMON_FIBERS);
  });

  test('countries add the common ones; weaves are only those the shop entered', () => {
    expect(countrySuggestions([{ countryOfOrigin: 'Армения' }], '')).toEqual(['Армения', ...COMMON_COUNTRIES].slice(0, 10));
    expect(countrySuggestions([], 'Россия')).not.toContain('Россия');
    expect(weaveSuggestions([{ weave: 'Саржевое' }, { weave: '' }], '')).toEqual(['Саржевое']);
    expect(weaveSuggestions([], '')).toEqual([]);
  });

  test('the tapped fiber gets the rest to 100 %', () => {
    const cotton = withAutoRemainder([{ fiber: 'Хлопок', percentage: 0 }], 0);
    expect(cotton).toEqual([{ fiber: 'Хлопок', percentage: 100 }]);
    // «Эластан» tapped: 0 % left; cotton typed as 95 — elastane becomes 5
    const both = withAutoRemainder([...cotton, { fiber: 'Эластан', percentage: 0 }], 1);
    expect(both[1].percentage).toBe(0);
    const typed = withAutoRemainder([{ ...both[0], percentage: 95 }, both[1]], 1);
    expect(typed).toEqual([{ fiber: 'Хлопок', percentage: 95 }, { fiber: 'Эластан', percentage: 5 }]);
  });

  test('without an auto row nothing changes; the rest is never below 0', () => {
    const items = [{ fiber: 'Хлопок', percentage: 70 }, { fiber: 'Лён', percentage: 50 }];
    expect(withAutoRemainder(items, null)).toBe(items);
    expect(remainingPercent(items, 1)).toBe(30);
    expect(remainingPercent([{ fiber: 'Хлопок', percentage: 120 }, { fiber: 'Лён', percentage: 0 }], 1)).toBe(0);
  });
});
