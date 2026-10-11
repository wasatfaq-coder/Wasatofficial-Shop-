import { describe, expect, test } from 'bun:test';
import {
  formatPackage,
  formatWeight,
  orderWeight,
  orderWeightText,
  packageCell,
  packageFromCell,
  packageFromFields,
  packageProblem,
  productPackageCm,
  productWeightGrams,
  weightProblem,
} from '../../src/utils/productShipping';
import { toOrderLineProduct } from '../../src/shared/orderLine';
import type { CartItem, Product } from '../../src/types';

const product = (over: Partial<Product> = {}): Product =>
  ({ id: 'shirt', title: 'Рубашка', category: 'shirts', categoryLabel: 'Рубашки', price: 2990, description: '', material: '', images: [], colors: [], sizes: ['M'], inStock: true, rating: 0, reviewsCount: 0, ...over }) as Product;
const line = (p: Product, quantity: number) => ({ product: p, quantity, selectedSize: 'M', selectedColor: '' }) as CartItem;

describe('weight and package of a product', () => {
  test('only sane numbers count', () => {
    expect(productWeightGrams({ weightGrams: 350 })).toBe(350);
    expect(productWeightGrams({})).toBeUndefined();
    expect(productWeightGrams({ weightGrams: 0 })).toBeUndefined();
    expect(productWeightGrams({ weightGrams: 12.5 })).toBeUndefined();
    expect(productWeightGrams({ weightGrams: 200_000 })).toBeUndefined();
    expect(productPackageCm({ packageCm: { l: 30, w: 20, h: 5 } })).toEqual({ l: 30, w: 20, h: 5 });
    expect(productPackageCm({ packageCm: { l: 30, w: 0, h: 5 } })).toBeUndefined();
  });

  test('form fields: empty is allowed, the package — all three or none', () => {
    expect(weightProblem('')).toBeNull();
    expect(weightProblem('350')).toBeNull();
    expect(weightProblem('0')).toMatch(/больше нуля/);
    expect(weightProblem('2,5')).toMatch(/целое/);
    expect(weightProblem('100001')).toMatch(/не больше/);
    expect(packageProblem(['', '', ''])).toBeNull();
    expect(packageProblem(['30', '', '5'])).toMatch(/все три/);
    expect(packageProblem(['30', '20', '501'])).toMatch(/500/);
    expect(packageProblem(['30', '20', '0,04'])).toMatch(/от 0,1/);
    expect(productPackageCm({ packageCm: { l: 30, w: 20, h: 0.04 } })).toBeUndefined();
    expect(packageFromFields(['30', '20,5', '5'])).toEqual({ l: 30, w: 20.5, h: 5 });
    expect(packageFromFields(['', '', ''])).toBeUndefined();
  });

  test('CSV cell of the package', () => {
    expect(packageFromCell('30×20×5')).toEqual({ l: 30, w: 20, h: 5 });
    expect(packageFromCell('30 x 20 x 5 см')).toEqual({ l: 30, w: 20, h: 5 });
    expect(packageFromCell('')).toBe('');
    expect(packageFromCell('-')).toBe('remove');
    expect(packageFromCell('30×20')).toBeNull();
    expect(packageCell({ packageCm: { l: 30, w: 20, h: 5 } })).toBe('30×20×5');
    expect(packageCell({})).toBe('');
  });

  test('texts', () => {
    expect(formatWeight(350)).toBe('350 г');
    expect(formatWeight(1250)).toBe('1,25 кг');
    expect(formatWeight(12_340)).toBe('12,3 кг');
    expect(formatPackage({ l: 30, w: 20.5, h: 5 })).toBe('30 × 20,5 × 5 см');
  });
});

describe('weight of an order', () => {
  test('the order line keeps the weight the item had when ordered', () => {
    expect(toOrderLineProduct(product({ weightGrams: 350 })).weightGrams).toBe(350);
    expect('weightGrams' in toOrderLineProduct(product())).toBe(false);
  });

  test('sums the lines; a line without weight takes today’s catalog weight, else it is counted as missing', () => {
    const ordered = toOrderLineProduct(product({ weightGrams: 350 }));
    const old = toOrderLineProduct(product({ id: 'belt' }));
    const unknown = toOrderLineProduct(product({ id: 'cap' }));
    // the catalog weight changed after the order: the order keeps its own
    const catalog = [product({ weightGrams: 400 }), product({ id: 'belt', weightGrams: 200 })];
    expect(orderWeight([line(ordered, 2)], catalog)).toEqual({ grams: 700, linesWithoutWeight: 0, fromCatalog: false });
    expect(orderWeight([line(ordered, 2), line(old, 1)], catalog)).toEqual({ grams: 900, linesWithoutWeight: 0, fromCatalog: true });
    expect(orderWeight([line(ordered, 1), line(unknown, 3)], catalog)).toEqual({ grams: 350, linesWithoutWeight: 1, fromCatalog: false });
    expect(orderWeight([], catalog)).toEqual({ grams: 0, linesWithoutWeight: 0, fromCatalog: false });
  });

  test('the text says when the sum is a lower bound or comes from the catalog, and stays silent without weights', () => {
    expect(orderWeightText({ grams: 1200, linesWithoutWeight: 0, fromCatalog: false })).toBe('1,2 кг');
    expect(orderWeightText({ grams: 1200, linesWithoutWeight: 2, fromCatalog: false })).toBe('не меньше 1,2 кг — у 2 позиций вес не указан');
    expect(orderWeightText({ grams: 350, linesWithoutWeight: 1, fromCatalog: true })).toBe('не меньше 350 г — у 1 позиции вес не указан');
    expect(orderWeightText({ grams: 900, linesWithoutWeight: 0, fromCatalog: true })).toBe('≈ 900 г (вес из каталога)');
    expect(orderWeightText({ grams: 0, linesWithoutWeight: 3, fromCatalog: false })).toBeNull();
  });
});
