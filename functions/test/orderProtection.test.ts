// Этап 5 аудита 02.10 без Blaze: «Цены не совпадают с каталогом» и автоотмена неоплаченных заказов
import { describe, expect, test } from 'bun:test';
import { orderPriceIssues } from '../../src/utils/orderPriceCheck';
import { overdueUnpaidOrders } from '../../src/utils/orderCancel';
import type { Order, Product } from '../../src/types';

const catalog = [{ id: 'p1', title: 'Рубашка', price: 4000 }] as unknown as Product[];
const order = (extra: Partial<Order> = {}): Order =>
  ({
    id: 'WS-1',
    createdAt: '2026-10-01T10:00:00.000Z',
    status: 'accepted',
    paymentStatus: 'pending',
    items: [{ id: 'l1', product: { id: 'p1', title: 'Рубашка', price: 4000 }, quantity: 2 }],
    deliveryFee: 300,
    totalPrice: 8300,
    ...extra,
  }) as unknown as Order;

describe('orderPriceIssues', () => {
  test('an honest order has no issues', () => {
    expect(orderPriceIssues(order(), catalog)).toEqual([]);
  });

  test('a price below the catalog, a sum that does not add up, a discount without a code', () => {
    const fake = order({
      items: [{ id: 'l1', product: { id: 'p1', title: 'Рубашка', price: 1 }, quantity: 2 }] as Order['items'],
      totalPrice: 1,
      discountAmount: 100,
    });
    const issues = orderPriceIssues(fake, catalog);
    expect(issues[0]).toContain('в заказе 1 ₽, в каталоге 4');
    expect(issues.some((i) => i.startsWith('итог 1 ₽'))).toBe(true);
    expect(issues).toContain('скидка без промокода');
  });

  test('a line\'s own price below the catalog is flagged too (docs/wholesale-spec.md, stage 1)', () => {
    const fake = order({
      items: [{ id: 'l1', product: { id: 'p1', title: 'Рубашка', price: 4000 }, unitPrice: 1, quantity: 2 }] as Order['items'],
      totalPrice: 302,
    });
    expect(orderPriceIssues(fake, catalog)[0]).toContain('в заказе 1 ₽, в каталоге 4');
  });

  test('not checked: placed by the server, paid, cancelled; an order without a fee is checked with the fee 0 (check 04.10)', () => {
    const cheap = { items: [{ id: 'l1', product: { id: 'p1', title: 'Рубашка', price: 1 }, quantity: 1 }] as Order['items'] };
    expect(orderPriceIssues(order({ ...cheap, placedVia: 'server' }), catalog)).toEqual([]);
    expect(orderPriceIssues(order({ ...cheap, paymentStatus: 'paid' }), catalog)).toEqual([]);
    expect(orderPriceIssues(order({ ...cheap, isCancelled: true }), catalog)).toEqual([]);
    // no fee field (a 1-click order, or a made-up one) — 0 ₽, the sum is still compared (check 04.10, finding 2)
    expect(orderPriceIssues(order({ deliveryFee: undefined, totalPrice: 5 }), catalog)).toHaveLength(1);
    // a product deleted from the catalog is not compared
    expect(orderPriceIssues(order({ items: [{ id: 'l1', product: { id: 'gone', title: 'X', price: 4000 }, quantity: 2 }] as Order['items'] }), catalog)).toEqual([]);
  });
});

describe('overdueUnpaidOrders', () => {
  const now = new Date('2026-10-04T12:00:00.000Z').getTime();

  test('off without the setting', () => {
    expect(overdueUnpaidOrders([order()], undefined, now)).toEqual([]);
    expect(overdueUnpaidOrders([order()], 0, now)).toEqual([]);
  });

  test('only «Принят» + «Ожидает оплаты» older than the days', () => {
    const list = [
      order({ id: 'old' }),
      order({ id: 'fresh', createdAt: '2026-10-04T09:00:00.000Z' }),
      order({ id: 'receipt', paymentStatus: 'receipt_review' }),
      order({ id: 'cod', paymentStatus: 'paid_on_delivery' }),
      order({ id: 'packed', status: 'assembling' }),
      order({ id: 'cancelled', isCancelled: true }),
      order({ id: 'nodate', createdAt: undefined, date: 'Сегодня, 14:30' } as Partial<Order>),
    ];
    expect(overdueUnpaidOrders(list, 2, now).map((o) => o.id)).toEqual(['old']);
  });
});
