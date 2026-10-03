// One size scale in the catalog filter (UX audit 03.10, stage 3, finding 3): «M» finds «M» and «48 (M)»
import { describe, expect, test } from 'bun:test';
import { buildSizeChips, sizeFilterKey, sizeMatches } from '../../src/utils/sizeScale';

describe('matching a size', () => {
  test('«M» finds «M» and «48 (M)», and the other way round', () => {
    expect(sizeMatches('M', 'M')).toBe(true);
    expect(sizeMatches('48 (M)', 'M')).toBe(true);
    expect(sizeMatches('M', '48 (M)')).toBe(true);
    expect(sizeMatches('48/50 (M)', 'M')).toBe(true);
    expect(sizeMatches('M (48)', 'M')).toBe(true);
    expect(sizeMatches('50 (L)', 'M')).toBe(false);
    expect(sizeMatches('L', 'XL')).toBe(false);
  });

  test('«XXL» and «2XL», case and Cyrillic «М» / «Х» are the same size', () => {
    expect(sizeMatches('XXL', '2XL')).toBe(true);
    expect(sizeMatches('54 (2XL)', 'XXL')).toBe(true);
    expect(sizeMatches('xxxl', '3XL')).toBe(true);
    expect(sizeMatches('m', 'M')).toBe(true);
    expect(sizeMatches('М', 'M')).toBe(true); // Cyrillic Em
    expect(sizeMatches('ХL', 'XL')).toBe(true); // Cyrillic Ha
    expect(sizeMatches('XXS', 'XS')).toBe(false);
  });

  test('a size without exactly one letter size matches only itself', () => {
    expect(sizeFilterKey('48')).toBe('48');
    expect(sizeMatches('48', 'M')).toBe(false);
    expect(sizeMatches('48', '48')).toBe(true);
    expect(sizeFilterKey('M-L')).toBe('M-L');
    expect(sizeMatches('M-L', 'M')).toBe(false);
    expect(sizeFilterKey('One size')).toBe('One size');
    expect(sizeFilterKey('W32 L34')).toBe('W32 L34');
  });
});

describe('filter chips', () => {
  const inStock = () => true;

  test('«M» and «48 (M)» are one chip counting products, with the Russian size from the products', () => {
    const products = [
      { id: 'shirt', sizes: ['S', 'M', 'L'] },
      { id: 'trousers', sizes: ['48 (M)', '50 (L)'] },
      { id: 'blazer', sizes: ['48 (M)', '52 (XL)'] },
    ];
    const chips = buildSizeChips(products, inStock);
    expect(chips.map((c) => [c.label, c.russian, c.count])).toEqual([
      ['S', '46', 1],
      ['M', '48', 3],
      ['L', '50', 2],
      ['XL', '52', 1],
    ]);
  });

  test('the Russian size comes from the store’s own pairs before the size table', () => {
    const chips = buildSizeChips([{ sizes: ['50 (M)'] }, { sizes: ['48/50 (M)'] }], inStock);
    expect(chips).toEqual([{ key: 'M', label: 'M', russian: '48–50', count: 2 }]);
  });

  test('a product with «M» and «48 (M)» counts once; sold-out sizes count zero', () => {
    const product = { sizes: ['M', '48 (M)', 'L'] };
    const chips = buildSizeChips([product], (_p, size) => size === '48 (M)');
    expect(chips.map((c) => [c.label, c.count])).toEqual([
      ['M', 1],
      ['L', 0],
    ]);
  });

  test('letters in order, then numbers, then the rest; the label is the spelling most products use', () => {
    const chips = buildSizeChips(
      [{ sizes: ['One size', '56', 'XXL', '48'] }, { sizes: ['2XL', 'XS'] }, { sizes: ['54 (XXL)', 'M-L'] }],
      inStock
    );
    expect(chips.map((c) => c.label)).toEqual(['XS', 'XXL', '48', '56', 'M-L', 'One size']);
    expect(chips.find((c) => c.label === 'XXL')).toMatchObject({ key: '2XL', russian: '54', count: 3 });
    expect(chips.find((c) => c.label === '48')?.russian).toBe('');
  });
});
