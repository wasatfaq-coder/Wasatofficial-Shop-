// «Корректировка заказа» (находка 11) и восстановление отменённого заказа (находка 15), этап 4 обзора рисков
import { describe, expect, test } from 'bun:test';
import { adjustedOrderTotals, storedOrderTotals } from '../../src/utils/orderAdjustment';
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

  // audit 29.10, finding 15: a promo applies to retail lines only — its share is of the retail part
  test('a percent promo scales over the retail lines, not the wholesale ones', () => {
    const promo = { id: 'x', code: 'SALE10', discountType: 'percent', discountValue: 10, active: true, usedCount: 0 } as PromoCode;
    const wholesale = (p: Product, quantity: number): CartItem => ({ ...line(p, quantity), id: `${p.id}-w`, priceKind: 'wholesale', unitPrice: 1000 }) as CartItem;
    const opt = product('p3', 1500, 500);
    // retail 4000 (10 % → 400 off) + wholesale 90 × 1000
    const order = { items: [line(shirt, 1), wholesale(opt, 90)], totalPrice: 93600, deliveryFee: 0, discountAmount: 400, promoCode: 'SALE10' };
    // half of the wholesale goes: the retail is the same, so is the discount
    expect(adjustedOrderTotals(order, [line(shirt, 1), wholesale(opt, 45)], [promo]).discount).toBe(400);
    // the retail goes: a wholesale-only order has no promo discount
    expect(adjustedOrderTotals(order, [wholesale(opt, 90)], [promo]).discount).toBe(0);
  });

  test('an old code without a type and with a value up to 100 is a percent, as at the checkout', () => {
    const legacy = { id: 'y', code: 'OLD10', discountValue: 10, active: true, usedCount: 0 } as PromoCode;
    const order = { items: [line(shirt, 1), line(polo, 1)], totalPrice: 5400, deliveryFee: 0, discountAmount: 600, promoCode: 'OLD10' };
    expect(adjustedOrderTotals(order, [line(shirt, 1)], [legacy]).discount).toBe(400);
  });

  test('an old order without stored delivery keeps the difference between its total and items', () => {
    const order = { items: [line(shirt, 1)], totalPrice: 4350 };
    expect(adjustedOrderTotals(order, [line(shirt, 2)]).total).toBe(8350);
  });
});

describe('storedOrderTotals (накладная)', () => {
  test('a paid delivery and a promo discount are the order\'s own, not «Бесплатно»', () => {
    const order = { items: [line(shirt, 1), line(polo, 1)], totalPrice: 5850, deliveryFee: 350, discountAmount: 500, promoCode: 'SALE' };
    expect(storedOrderTotals(order)).toEqual({ subtotal: 6000, discount: 500, deliveryFee: 350, total: 5850, recorded: true, matches: true });
  });

  test('after «Корректировка заказа» the earlier total is not a discount', () => {
    // originalTotalPrice — the sum before the adjustment removed the polo
    const order = { items: [line(shirt, 1)], totalPrice: 4350, deliveryFee: 350, discountAmount: 0, originalTotalPrice: 6350 };
    expect(storedOrderTotals(order)).toMatchObject({ subtotal: 4000, discount: 0, deliveryFee: 350, total: 4350, matches: true });
  });

  test('no promo code — no discount: a total below the lines is flagged, not printed as a discount', () => {
    // the browser writes no discountAmount for 0; a forged total of 1 ₽ must not become «Скидка −4 349 ₽»
    expect(storedOrderTotals({ items: [line(shirt, 1)], totalPrice: 1, deliveryFee: 350 })).toMatchObject({ discount: 0, recorded: true, matches: false });
  });

  test('an old order without stored delivery is not split: only items and the total', () => {
    expect(storedOrderTotals({ items: [line(shirt, 1)], totalPrice: 4350 })).toMatchObject({ recorded: false, total: 4350 });
    expect(storedOrderTotals({ items: [line(shirt, 1)], totalPrice: 3950, deliveryFee: 350, promoCode: 'SALE' })).toMatchObject({ recorded: false });
  });

  test('a 1-click order has no delivery and no discount', () => {
    const order = { items: [line(shirt, 1)], totalPrice: 4000, deliveryMethod: 'Заказ в 1 клик' };
    expect(storedOrderTotals(order)).toMatchObject({ deliveryFee: 0, discount: 0, recorded: true, matches: true });
  });

  test('wholesale lines count by their own price', () => {
    const pack = { ...line(polo, 10), unitPrice: 1500, priceKind: 'wholesale' } as CartItem;
    expect(storedOrderTotals({ items: [pack], totalPrice: 15000, deliveryFee: 0 })).toMatchObject({ subtotal: 15000, matches: true });
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
