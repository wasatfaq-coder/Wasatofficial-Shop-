// Этап 2 аудита 02.10 — склад в оформлении и в админке (находки 4, 5, 11, 15)
import { describe, expect, test } from 'bun:test';
import { getVariantStock, mergeFormStock, orderStockProblems, stockProblemText } from '../../src/utils/inventory';
import { adjustedOrderTotals } from '../../src/utils/orderAdjustment';
import type { CartItem, Product, ProductSKU, PromoCode } from '../../src/types';

const sku = (size: string, stock: number): ProductSKU => ({ id: `p1-Белый-${size}`, color: 'Белый', size, stock, skuCode: `S-${size}` });
const product = (skus: ProductSKU[], extra: Partial<Product> = {}): Product =>
  ({ id: 'p1', title: 'Рубашка', price: 4000, category: 'shirts', inStock: true, skus, ...extra }) as unknown as Product;
const line = (p: Product, size: string, quantity: number, id = `l-${size}`): CartItem =>
  ({ id, product: p, quantity, selectedColor: 'Белый', selectedSize: size }) as CartItem;

describe('checkout checks the stock (finding 4)', () => {
  test('beyond the stock, lines of one variant together', () => {
    const shirt = product([sku('M', 1), sku('L', 5)]);
    const problems = orderStockProblems([line(shirt, 'M', 1, 'a'), line(shirt, 'M', 2, 'b'), line(shirt, 'L', 2)], [shirt], false);
    expect(problems).toEqual([
      { productId: 'p1', title: 'Рубашка', color: 'Белый', size: 'M', wanted: 3, available: 1, reason: 'short' },
    ]);
    expect(stockProblemText(problems[0])).toBe('Рубашка (Белый, M) — в наличии 1 из 3');
  });

  test('taken off sale, removed from the catalog; preorder lets a sold-out variant through', () => {
    const hidden = product([sku('M', 4)], { inStock: false });
    expect(orderStockProblems([line(hidden, 'M', 1)], [hidden], false)[0].reason).toBe('hidden');
    expect(orderStockProblems([line(hidden, 'M', 1)], [], false)[0].reason).toBe('removed');
    const soldOut = product([sku('M', 0)]);
    expect(orderStockProblems([line(soldOut, 'M', 2)], [soldOut], false)).toHaveLength(1);
    expect(orderStockProblems([line(soldOut, 'M', 2)], [soldOut], true)).toEqual([]);
  });

  test('a product without variants has no made-up stock (finding 15)', () => {
    expect(getVariantStock(product([]), 'Белый', 'M')).toBe(0);
  });
});

describe('the product form keeps sold stock sold (finding 5)', () => {
  test('a stock not touched in the form comes from the database; a changed one is saved and journaled', () => {
    const opened = [sku('M', 5), sku('L', 2)];
    const live = [sku('M', 0), sku('L', 2)]; // M sold out while the form was open
    const form = [sku('M', 5), sku('L', 7)]; // the admin changed only L
    const merged = mergeFormStock(form, opened, live);
    expect(merged.skus.map((s) => s.stock)).toEqual([0, 7]);
    expect(merged.changes.map((c) => [c.sku.size, c.before, c.after])).toEqual([['L', 2, 7]]);
  });

  test('a new variant with stock is a change from 0', () => {
    const merged = mergeFormStock([sku('XL', 3)], [], []);
    expect(merged.changes.map((c) => [c.before, c.after])).toEqual([[0, 3]]);
  });
});

describe('«Корректировка заказа» keeps the order\'s own percent (finding 11)', () => {
  test('the code changed in «Промокоды» since — the order still gets its 10%', () => {
    const polo = product([sku('M', 5)], { id: 'p2', price: 2000 } as Partial<Product>);
    const shirt = product([sku('M', 5)]);
    const changed = { id: 'x', code: 'SALE10', discountType: 'percent', discountValue: 30, discountPercent: 30, active: true, usedCount: 0 } as PromoCode;
    const order = { items: [line(shirt, 'M', 1, 'a'), line(polo, 'M', 1, 'b')], totalPrice: 5400, deliveryFee: 0, discountAmount: 600, promoCode: 'SALE10' };
    expect(adjustedOrderTotals(order, [line(shirt, 'M', 1, 'a')], [changed])).toEqual({ subtotal: 4000, discount: 400, deliveryFee: 0, total: 3600 });
  });
});
