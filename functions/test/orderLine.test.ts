import { describe, expect, test } from 'bun:test';
import { hasCurrentProductIds, linePrice, orderProductIds, toOrderLineProduct } from '../../src/shared/orderLine';
import type { Product } from '../../src/types';

// A product like the one in the live store on 29.09: three photos of ~170 KB embedded in the document
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(170_000);
const product = {
  id: 'shirt', title: 'Рубашка', price: 2990, originalPrice: 3490, category: 'shirts', categoryLabel: 'Рубашки',
  material: 'Лён', description: 'Длинное описание'.repeat(200), images: [photo, photo, photo, 'https://cdn.example/1.jpg'],
  colors: [{ name: 'Белый', hex: '#fff' }], sizes: ['M', 'L'], inStock: true, rating: 0, reviewsCount: 0,
  skus: [{ id: 's', color: 'Белый', size: 'M', stock: 3 }], costPrice: 1200,
} as unknown as Product;

describe('toOrderLineProduct', () => {
  test('keeps what the order shows and counts', () => {
    const line = toOrderLineProduct(product);
    expect(line).toMatchObject({ id: 'shirt', title: 'Рубашка', price: 2990, originalPrice: 3490, category: 'shirts', material: 'Лён' });
    expect(line.sizes).toEqual(['M', 'L']);
  });

  test('drops embedded photos, card texts, stock and cost', () => {
    const line = toOrderLineProduct(product) as unknown as Record<string, unknown>;
    expect(line.images).toEqual(['https://cdn.example/1.jpg']);
    for (const field of ['description', 'skus', 'costPrice', 'reviews']) expect(line[field]).toBeUndefined();
  });

  test('an order of three lines of such a product fits the 1 MiB document limit', () => {
    const items = ['M', 'L', 'XL'].map((size) => ({ product: toOrderLineProduct(product), selectedSize: size, quantity: 1 }));
    expect(JSON.stringify({ items }).length).toBeLessThan(10_000);
    // with full copies the same order was ~1.5 MB
    expect(JSON.stringify({ items: items.map(() => ({ product })) }).length).toBeGreaterThan(1_048_576);
  });
});

// docs/wholesale-spec.md, stage 1: one line price for the cart, the order, the admin and the analytics
describe('linePrice', () => {
  test('a line without its own price costs what the product costs (old orders and carts, as before)', () => {
    expect(linePrice({ product: { price: 2990 } })).toBe(2990);
    expect(linePrice({})).toBe(0);
    expect(linePrice({ product: { price: undefined as unknown as number } })).toBe(0);
  });

  test('a line with its own price (wholesale, a pack) costs that, even 0', () => {
    expect(linePrice({ product: { price: 2990 }, unitPrice: 1900 })).toBe(1900);
    expect(linePrice({ product: { price: 2990 }, unitPrice: 0 })).toBe(0);
  });

  test('a broken own price is ignored', () => {
    expect(linePrice({ product: { price: 2990 }, unitPrice: -5 })).toBe(2990);
    expect(linePrice({ product: { price: 2990 }, unitPrice: Number.NaN })).toBe(2990);
    expect(linePrice({ product: { price: 2990 }, unitPrice: '100' as unknown as number })).toBe(2990);
  });
});

// Ревью 11.10, находка 2: the review rule checks «Покупка подтверждена» by the order's product ids
describe('orderProductIds', () => {
  const line = (id: unknown) => ({ product: { id } });

  test('each product once, in the order of the lines (sizes and pack lines of one product are one id)', () => {
    expect(orderProductIds([line('p2'), line('p1'), line('p2'), line('p1')])).toEqual(['p2', 'p1']);
    expect(orderProductIds([])).toEqual([]);
  });

  test('a line without a product id adds nothing', () => {
    expect(orderProductIds([line(''), line(undefined), line(7), {}, line('p1')])).toEqual(['p1']);
  });

  test('an order needs the list when it has none or it does not match the lines', () => {
    const items = [line('p1'), line('p2')];
    expect(hasCurrentProductIds({ items, productIds: ['p1', 'p2'] })).toBe(true);
    expect(hasCurrentProductIds({ items })).toBe(false);
    expect(hasCurrentProductIds({ items, productIds: ['p1'] })).toBe(false);
    expect(hasCurrentProductIds({ items, productIds: ['p2', 'p1'] })).toBe(false);
    expect(hasCurrentProductIds({ items, productIds: 'p1,p2' })).toBe(false);
    // a product added by «Правка состава» outdates the list
    expect(hasCurrentProductIds({ items: [...items, line('p3')], productIds: ['p1', 'p2'] })).toBe(false);
  });
});
