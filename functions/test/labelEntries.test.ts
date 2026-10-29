// Этикетка товара «Только оптом»: без розничной старой цены, иначе «скидка» выдумана (аудит 29.10, находка 23)
import { describe, expect, test } from 'bun:test';
import type { Product, ProductSKU } from '../../src/types';
import { labelData } from '../../src/components/admin/labelEntries';

const sku: ProductSKU = { id: 'p1-m', color: 'Черный', size: 'M', stock: 3 } as ProductSKU;
const product = (over: Partial<Product> = {}): Product =>
  ({ id: 'p1', title: 'Пальто', price: 3000, originalPrice: 4000, category: 'c', skus: [sku], ...over }) as Product;

describe('labelData: old price', () => {
  test('a retail product keeps its old price', () => {
    expect(labelData(product(), sku).oldPrice).toBe(4000);
  });

  test('a product sold only wholesale has no retail old price next to its wholesale price', () => {
    const data = labelData(product({ saleChannel: 'wholesale', wholesalePrice: 1500 }), sku);
    expect(data.price).toBe(1500);
    expect(data.oldPrice).toBeUndefined();
  });
});
