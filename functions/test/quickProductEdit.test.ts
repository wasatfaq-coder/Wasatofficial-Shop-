// Быстрая правка из списка товаров (этап 4 плана docs/admin-wholesale-plan.md, часть 2): цена, остаток по вариантам
// и товары, у которых цена ниже закупки
import { describe, expect, test } from 'bun:test';
import type { Product } from '../../src/types';
import { belowCostLines, quickPriceError, quickStockChanges, quickStockVariants, withQuickPrice } from '../../src/utils/quickProductEdit';

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Куртка',
    price: 5990,
    colors: [{ name: 'Хаки', hex: '#556B2F' }],
    sizes: ['S', 'M'],
    skus: [
      { id: 's', color: 'Хаки', size: 'S', stock: 5, skuCode: 'WS-1-S' },
      { id: 'm', color: 'Хаки', size: 'M', stock: 0, skuCode: 'WS-1-M' },
    ],
    ...over,
  }) as unknown as Product;

describe('товары ниже закупки', () => {
  test('только с ценой ниже себестоимости; убыток округляется вверх', () => {
    const lines = belowCostLines([
      product({ id: 'a', price: 4890, costPrice: 5000 }),
      product({ id: 'b', price: 5000, costPrice: 5000 }),
      product({ id: 'c', price: 100, costPrice: undefined }),
      product({ id: 'd', price: 99.5, costPrice: 100 }),
    ]);
    expect(lines.map((l) => [l.id, l.loss])).toEqual([
      ['a', 110],
      ['d', 1],
    ]);
  });
});

describe('цена из списка', () => {
  test('старая цена только выше цены, скидка — из двух цен', () => {
    expect(quickPriceError(0, undefined)).toBe('Цена — число больше нуля');
    expect(quickPriceError(Number.NaN, undefined)).toBe('Цена — число больше нуля');
    expect(quickPriceError(6290, 6000)).toMatch(/Старая цена должна быть выше/);
    expect(quickPriceError(6290, undefined)).toBe('');
    expect(withQuickPrice(product(), 6290, 6990)).toMatchObject({ price: 6290, originalPrice: 6990, discountPercent: 10 });
    const plain = withQuickPrice(product({ originalPrice: 7000, discountPercent: 14 }), 6290, undefined);
    expect(plain.originalPrice).toBeUndefined();
    expect(plain.discountPercent).toBeUndefined();
    // the sale badge goes with the old price, other badges stay
    expect(withQuickPrice(product({ originalPrice: 7000, badge: 'SALE' }), 6290, undefined).badge).toBeUndefined();
    expect(withQuickPrice(product({ originalPrice: 7000, badge: 'SALE' }), 6290, 7000).badge).toBe('SALE');
    expect(withQuickPrice(product({ badge: 'ХИТ' }), 6290, undefined).badge).toBe('ХИТ');
  });
});

describe('остаток из списка', () => {
  test('только изменённые варианты, на разницу с показанным', () => {
    const p = product();
    const variants = quickStockVariants(p);
    expect(quickStockChanges(p, variants, { 'Хаки|S': '8', 'Хаки|M': '0' })).toEqual({
      changes: [{ productId: 'p1', productTitle: 'Куртка', color: 'Хаки', size: 'S', delta: 3 }],
      error: '',
    });
    expect(quickStockChanges(p, variants, { 'Хаки|S': '2,5' }).error).toMatch(/целое число/);
    expect(quickStockChanges(p, variants, { 'Хаки|S': '-1' }).error).toMatch(/целое число/);
    expect(quickStockChanges(p, variants, { 'Хаки|S': ' ' }).changes).toEqual([]);
  });

  test('цвет без сохранённого варианта показывается с остатком 0', () => {
    const p = product({ colors: [{ name: 'Хаки', hex: '#556B2F' }, { name: 'Черный', hex: '#111111' }] });
    const variants = quickStockVariants(p);
    expect(variants.map((s) => `${s.color} ${s.size} ${s.stock}`)).toContain('Черный S 0');
    expect(quickStockChanges(p, variants, { 'Черный|S': '4' }).changes[0]).toMatchObject({ color: 'Черный', delta: 4 });
  });
});
