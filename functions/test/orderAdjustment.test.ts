// «Корректировка заказа» (находка 11) и восстановление отменённого заказа (находка 15), этап 4 обзора рисков
import { describe, expect, test } from 'bun:test';
import { adjustedOrderTotals } from '../../src/utils/orderAdjustment';
import { stockShortages } from '../../src/utils/inventory';
import type { CartItem, Product, PromoCode } from '../../src/types';

const product = (id: string, price: number, stock = 5): Product =>
  ({
    id, title: id === 'p1' ? 'Рубашка' : 'Поло', price, category: 'shirts', inStock: true,
    skus: [{ id: `${id}-m`, color: 'Белый', size: 'M', stock }],
  }) as unknown as Product;
const line = (p: Product, quantity: number): CartItem =>
  ({ id: `${p.id}-line`, product: p, quantity, selectedColor: 'Белый', selectedSize: 'M' }) as CartItem;

const shirt = product('p1', 4000);
const polo = product('p2', 2000);

describe('adjustedOrderTotals', () => {
  test('the same items keep the sum: changing only the track number does not drop delivery', () => {
    const order = { items: [line(shirt, 1)], totalPrice: 4350, deliveryFee: 350 };
    expect(adjustedOrderTotals(order, [line(shirt, 1)]).total).toBe(4350);
  });

  test('delivery and a fixed discount stay when items change', () => {
    const order = { items: [line(shirt, 1), line(polo, 1)], totalPrice: 5850, deliveryFee: 350, discountAmount: 500 };
    expect(adjustedOrderTotals(order, [line(shirt, 1)])).toEqual({ subtotal: 4000, discount: 500, deliveryFee: 350, total: 3850 });
  });

  test('a percent promo keeps the order\'s own percent for the new items', () => {
    const promo = { id: 'x', code: 'SALE10', discountType: 'percent', discountValue: 10, discountPercent: 10, active: true, usedCount: 0, minOrderAmount: 5000 } as PromoCode;
    const order = { items: [line(shirt, 1), line(polo, 1)], totalPrice: 5400, deliveryFee: 0, discountAmount: 600, promoCode: 'SALE10' };
    // the minimum of the promo is not checked again: the customer already got it
    expect(adjustedOrderTotals(order, [line(shirt, 1)], [promo]).total).toBe(3600);
  });

  test('an old order without stored delivery keeps the difference between its total and items', () => {
    const order = { items: [line(shirt, 1)], totalPrice: 4350 };
    expect(adjustedOrderTotals(order, [line(shirt, 2)]).total).toBe(8350);
  });
});

describe('stockShortages', () => {
  test('lists variants with less stock than the order needs; preorder lines are not counted', () => {
    const lowShirt = product('p1', 4000, 1);
    expect(stockShortages([lowShirt, polo], [line(lowShirt, 2), line(polo, 1)])).toEqual([
      { productTitle: 'Рубашка', color: 'Белый', size: 'M', needed: 2, inStock: 1 },
    ]);
    expect(stockShortages([lowShirt], [{ ...line(lowShirt, 2), isPreorder: true }])).toEqual([]);
  });
});
