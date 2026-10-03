// Варианты товара без выдуманных «Основной» и M/L; у каждого цвета и размера — свой вариант (03.10)
import { describe, expect, test } from 'bun:test';
import { generateDefaultSKUs, stockShortages, withOrderDeducted } from '../../src/utils/inventory';
import type { CartItem, Product } from '../../src/types';

const product = (extra: Partial<Product>): Product =>
  ({ id: 'p1', title: 'Рубашка', price: 4000, category: 'shirts', inStock: true, ...extra }) as unknown as Product;
const line = (p: Product, color: string, size: string, quantity: number, extra: Partial<CartItem> = {}): CartItem =>
  ({ id: `${color}-${size}`, product: p, quantity, selectedColor: color, selectedSize: size, ...extra }) as CartItem;

describe('variations only of the real colours and sizes', () => {
  test('colours × sizes, stock 0', () => {
    const skus = generateDefaultSKUs(product({ colors: [{ name: 'Белый', hex: '#FFFFFF' }], sizes: ['M', 'L'] }));
    expect(skus.map((s) => `${s.color} ${s.size} ${s.stock}`)).toEqual(['Белый M 0', 'Белый L 0']);
  });

  test('no colours or no sizes — no variations (before: a made-up «Основной» colour and M/L sizes)', () => {
    expect(generateDefaultSKUs(product({ colors: [], sizes: ['M'] }))).toEqual([]);
    expect(generateDefaultSKUs(product({ colors: [{ name: 'Белый', hex: '#FFFFFF' }], sizes: [] }))).toEqual([]);
    expect(generateDefaultSKUs(product({}))).toEqual([]);
  });
});

describe('the browser copy right after an order', () => {
  const shirt = product({
    skus: [
      { id: 'a', color: 'Белый', size: 'M', stock: 3, skuCode: 'A' },
      { id: 'b', color: 'Белый', size: 'L', stock: 1, skuCode: 'B' },
    ],
  });

  test('lines of one variation add up, the stock stops at 0; a preorder line is not taken', () => {
    const [after] = withOrderDeducted([shirt], [
      line(shirt, 'Белый', 'M', 1),
      line(shirt, 'белый', 'm', 1, { id: 'x' }),
      line(shirt, 'Белый', 'L', 5),
      line(shirt, 'Белый', 'L', 2, { id: 'pre', isPreorder: true }),
    ]);
    expect(after.skus!.map((s) => s.stock)).toEqual([1, 0]);
    expect(after.inStock).toBe(true);
  });

  test('sold out — not in stock; taken off sale stays off', () => {
    expect(withOrderDeducted([shirt], [line(shirt, 'Белый', 'M', 3), line(shirt, 'Белый', 'L', 1)])[0].inStock).toBe(false);
    const hidden = { ...shirt, hiddenFromSale: true };
    expect(withOrderDeducted([hidden], [line(hidden, 'Белый', 'M', 1)])[0].inStock).toBe(false);
  });
});

describe('shortages for an order the admin changes', () => {
  test('a colour of the product without a saved variation — 0 in stock; a colour the product does not have — 0 too', () => {
    const shirt = product({
      colors: [{ name: 'Белый', hex: '#FFFFFF' }, { name: 'Хаки', hex: '#556B2F' }],
      sizes: ['M'],
      skus: [{ id: 'a', color: 'Белый', size: 'M', stock: 3, skuCode: 'A' }],
    });
    expect(
      stockShortages([shirt], [line(shirt, 'Белый', 'M', 2), line(shirt, 'Хаки', 'M', 1), line(shirt, 'Красный', 'M', 1), line(shirt, 'Красный', 'M', 2, { id: 'y' })])
    ).toEqual([
      { productTitle: 'Рубашка', color: 'Хаки', size: 'M', needed: 1, inStock: 0 },
      { productTitle: 'Рубашка', color: 'Красный', size: 'M', needed: 3, inStock: 0 },
    ]);
  });
});
