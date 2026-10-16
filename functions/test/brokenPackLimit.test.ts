// Разбитая упаковка (docs/broken-pack-spec.md; ревью 16.10, находки 1 и 5): продаются только штуки сверх целых ростовок,
// товар без ростовок так не продаётся, цена не опускается до 0 ₽
import { describe, expect, test } from 'bun:test';
import { brokenPackPieces } from '../../src/shared/sizePacks';
import { brokenPackDiscountedPrice, brokenPackExcess, goesBrokenPack } from '../../src/shared/wholesalePricing';
import type { Product } from '../../src/types';

// Ростовка S/M/L по 1 шт.: S=10, M=10, L=11 — 10 целых упаковок и одна лишняя L
const product = (extra: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Футболка',
    price: 1500,
    wholesalePrice: 1000,
    sizes: ['S', 'M', 'L'],
    colors: [{ name: 'Синий', hex: '#1F3A93' }],
    skus: [
      { id: 's1', color: 'Синий', size: 'S', stock: 10 },
      { id: 's2', color: 'Синий', size: 'M', stock: 10 },
      { id: 's3', color: 'Синий', size: 'L', stock: 11 },
    ],
    sizePacks: [{ id: 'a', sizes: [{ size: 'S', qty: 1 }, { size: 'M', qty: 1 }, { size: 'L', qty: 1 }] }],
    ...extra,
  }) as Product;

describe('разбитая упаковка: только штуки сверх целых ростовок', () => {
  test('продаётся лишняя L, а S и M остаются в целых упаковках', () => {
    expect(brokenPackPieces(product(), 'Синий', 'L')).toBe(1);
    expect(brokenPackPieces(product(), 'Синий', 'S')).toBe(0);
    expect(goesBrokenPack(product(), 'Синий', 'L')).toBe(true);
    expect(goesBrokenPack(product(), 'Синий', 'S')).toBe(false);
  });

  test('товар без ростовок разбитой упаковкой не продаётся', () => {
    expect(goesBrokenPack(product({ sizePacks: [] }), 'Синий', 'L')).toBe(false);
    expect(brokenPackPieces(product({ sizePacks: [] }), 'Синий', 'L')).toBe(0);
  });

  test('сумма строк одного размера сверх остатка — отказ, даже если заказ разбит на строки', () => {
    const p = product();
    const line = { product: p, color: 'Синий', size: 'L', quantity: 1 };
    expect(brokenPackExcess([line])).toEqual([]);
    const excess = brokenPackExcess([line, { ...line, color: ' синий ' }]);
    expect(excess).toHaveLength(1);
    expect(excess[0]).toMatchObject({ quantity: 2, pieces: 1 });
  });

  test('цена разбитой упаковки не ниже 1 ₽, даже если скидка больше оптовой цены', () => {
    expect(brokenPackDiscountedPrice(400, { kind: 'fixed', value: 500 })).toBe(1);
    expect(brokenPackDiscountedPrice(1000, { kind: 'percent', value: 10 })).toBe(900);
  });
});
