// Страница товара и быстрый просмотр открываются на цвете, который можно заказать (аудит 07.10, находка 24)
import { describe, expect, test } from 'bun:test';
import { initialColor } from '../../src/utils/variantSelection';
import type { Product } from '../../src/types';

const color = (name: string) => ({ name, hex: '#111111' });
const sku = (c: string, size: string, stock: number) => ({ id: `${c}-${size}`, color: c, size, stock, skuCode: `WS-${c}-${size}` });
const shirt = (skus: ReturnType<typeof sku>[], extra: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Рубашка',
    price: 4000,
    category: 'shirts',
    inStock: true,
    colors: [color('Белый'), color('Синий'), color('Черный')],
    sizes: ['M', 'L'],
    skus,
    ...extra,
  }) as unknown as Product;

describe('the colour a product opens on', () => {
  test('the first colour sold out, the second left: the second (before: the page opened on the sold-out first)', () => {
    const p = shirt([sku('Белый', 'M', 0), sku('Белый', 'L', 0), sku('Синий', 'M', 0), sku('Синий', 'L', 2), sku('Черный', 'M', 5)]);
    expect(initialColor(p, false)).toBe('Синий');
  });

  test('the first colour left: the first, as before', () => {
    const p = shirt([sku('Белый', 'M', 1), sku('Синий', 'L', 2)]);
    expect(initialColor(p, false)).toBe('Белый');
  });

  test('everything sold out: the first colour (the page says it is out of stock)', () => {
    const p = shirt([sku('Белый', 'M', 0), sku('Синий', 'L', 0)]);
    expect(initialColor(p, false)).toBe('Белый');
  });

  test('preorder on: a sold-out colour can be ordered, so the first one', () => {
    const p = shirt([sku('Белый', 'M', 0), sku('Синий', 'L', 2)]);
    expect(initialColor(p, true)).toBe('Белый');
  });

  test('taken off sale: nothing is orderable, the first colour', () => {
    const p = shirt([sku('Белый', 'M', 0), sku('Синий', 'L', 2)], { hiddenFromSale: true });
    expect(initialColor(p, false)).toBe('Белый');
  });

  test('no colours: no colour', () => {
    expect(initialColor(shirt([], { colors: [] }), false)).toBe('');
  });
});
