// Этап 7 аудита 02.10: выручка — только оплаченные (находка 29), «Снят с витрины» отдельно от «распродан» (находка 12)
import { describe, expect, test } from 'bun:test';
import { isRevenueOrder, orderRevenue } from '../../src/utils/analyticsEngine';
import { getOrderableStock, isHiddenFromSale, isProductInStock } from '../../src/utils/inventory';
import type { Order, Product } from '../../src/types';

const order = (extra: Partial<Order> = {}) => ({ id: 'WS-1', status: 'accepted', items: [], totalPrice: 5000, ...extra }) as unknown as Order;

describe('orderRevenue: only paid money', () => {
  test('unpaid, receipt on review and payment on delivery bring nothing yet', () => {
    expect(orderRevenue(order({ paymentStatus: 'pending' }))).toBe(0);
    expect(orderRevenue(order({ paymentStatus: 'receipt_review' }))).toBe(0);
    expect(orderRevenue(order({ paymentStatus: 'paid_on_delivery' }))).toBe(0);
    expect(orderRevenue(order({}))).toBe(0);
    expect(isRevenueOrder(order({ paymentStatus: 'pending' }))).toBe(false);
  });

  test('paid counts, minus a refund; a refund without a sum is a full one; cancelled never', () => {
    expect(orderRevenue(order({ paymentStatus: 'paid' }))).toBe(5000);
    expect(orderRevenue(order({ paymentStatus: 'paid', refundAmount: 1000 }))).toBe(4000);
    expect(orderRevenue(order({ paymentStatus: 'refunded', refundAmount: 1000 }))).toBe(4000);
    expect(orderRevenue(order({ paymentStatus: 'refunded' }))).toBe(0);
    expect(orderRevenue(order({ paymentStatus: 'paid', isCancelled: true }))).toBe(0);
    expect(isRevenueOrder(order({ paymentStatus: 'paid' }))).toBe(true);
  });
});

describe('«Снят с витрины» apart from «sold out»', () => {
  const product = (extra: Partial<Product>) =>
    ({ id: 'p1', title: 'Рубашка', price: 1000, inStock: false, sizes: ['M'], colors: [], images: [],
      skus: [{ id: 'p1-m', color: 'Белый', size: 'M', stock: 0 }], ...extra }) as unknown as Product;

  test('a hidden sold-out product is not preordered (finding 12)', () => {
    const hidden = product({ hiddenFromSale: true });
    expect(isHiddenFromSale(hidden)).toBe(true);
    expect(getOrderableStock(hidden, 'Белый', 'M', true)).toBe(0);
    // sold out but on sale — preorder works
    const soldOut = product({ hiddenFromSale: false });
    expect(isHiddenFromSale(soldOut)).toBe(false);
    expect(getOrderableStock(soldOut, 'Белый', 'M', true)).toBeGreaterThan(0);
  });

  test('old products without the field: inStock false with stock left is «снят»', () => {
    const legacyHidden = product({ skus: [{ id: 'p1-m', color: 'Белый', size: 'M', stock: 3 }] as Product['skus'] });
    expect(isHiddenFromSale(legacyHidden)).toBe(true);
    expect(isProductInStock(legacyHidden)).toBe(false);
    const onSale = product({ inStock: true, hiddenFromSale: false, skus: [{ id: 'p1-m', color: 'Белый', size: 'M', stock: 3 }] as Product['skus'] });
    expect(getOrderableStock(onSale, 'Белый', 'M', false)).toBe(3);
    expect(isProductInStock(product({ inStock: true, hiddenFromSale: true, skus: [{ id: 'p1-m', color: 'Белый', size: 'M', stock: 3 }] as Product['skus'] }))).toBe(false);
  });
});
