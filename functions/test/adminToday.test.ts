// «Сегодня» в админке (этап 2 плана docs/admin-wholesale-plan.md): что ждёт владельца и напоминание об устаревшем курсе
import { describe, expect, test } from 'bun:test';
import { staleRateDays, summarizeAdminToday, waitingFor } from '../../src/utils/adminToday';
import type { ChatMessage, Order, Product } from '../../src/types';

const now = new Date('2026-10-09T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

const order = (o: Partial<Order>): Order =>
  ({ id: 'WS-1', status: 'accepted', totalPrice: 1000, createdAt: now.toISOString(), items: [], ...o }) as Order;

const product = (o: Partial<Product>): Product =>
  ({
    id: 'p',
    title: 'Футболка',
    price: 1000,
    colors: [{ name: 'Белый', hex: '#FFFFFF' }],
    sizes: ['M', 'L'],
    skus: [
      { id: 'a', color: 'Белый', size: 'M', stock: 2, skuCode: 'A' },
      { id: 'b', color: 'Белый', size: 'L', stock: 0, skuCode: 'B' },
    ],
    inStock: true,
    ...o,
  }) as Product;

describe('what waits for the owner', () => {
  test('new orders, low stock and the paid money of 7 days', () => {
    const today = summarizeAdminToday(
      [
        order({ id: 'WS-1' }),
        order({ id: 'WS-2', isCancelled: true }),
        order({ id: 'WS-3', status: 'delivered', paymentStatus: 'paid', totalPrice: 2500 }),
        order({ id: 'WS-4', status: 'delivered', paymentStatus: 'paid', totalPrice: 900, createdAt: new Date(now.getTime() - 8 * day).toISOString() }),
        order({ id: 'WS-5', status: 'delivered', paymentStatus: 'pending', totalPrice: 700 }),
      ],
      [],
      [product({}), product({ id: 'hidden', hiddenFromSale: true })],
      3,
      null,
      now
    );
    expect(today.newOrders).toBe(1);
    expect(today.lowVariants).toBe(1);
    // a product taken off sale does not count
    expect(today.outVariants).toBe(1);
    // only paid, only the last 7 days
    expect(today.revenue).toBe(2500);
    expect(today.paidOrders).toBe(1);
  });

  test('the week starts after «Сбросить статистику», as in «Аналитика»', () => {
    const paid = order({ id: 'WS-6', status: 'delivered', paymentStatus: 'paid', totalPrice: 2500, createdAt: new Date(now.getTime() - 2 * day).toISOString() });
    expect(summarizeAdminToday([paid], [], [], 3, now.getTime() - day, now).revenue).toBe(0);
  });

  test('the dialog where the customer wrote last waits, and since when', () => {
    const msg = (id: string, sender: 'user' | 'admin', sentAt: number): ChatMessage =>
      ({ id, threadId: 'u1', sender, text: 'x', timestamp: '', sentAt, isInternalNote: false }) as ChatMessage;
    const t = now.getTime();
    const today = summarizeAdminToday([], [msg('m1', 'admin', t - 3_600_000), msg('m2', 'user', t - 2_400_000)], [], 3, null, now);
    expect(today.awaitingChats).toBe(1);
    expect(waitingFor(today.oldestAwaitingAt!, t)).toBe('40 мин');
    // a note of the staff is no answer and does not restart the wait; several messages — from the first one
    const noted = summarizeAdminToday(
      [],
      [msg('m1', 'user', t - 3 * 3_600_000), msg('m2', 'user', t - 3_600_000), { ...msg('m3', 'admin', t - 60_000), isInternalNote: true }],
      [],
      3,
      null,
      now
    );
    expect(waitingFor(noted.oldestAwaitingAt!, t)).toBe('3 ч');
    const answered = summarizeAdminToday([], [msg('m1', 'user', t - 60_000), msg('m2', 'admin', t)], [], 3, null, now);
    expect(answered.awaitingChats).toBe(0);
    expect(answered.oldestAwaitingAt).toBeNull();
  });

  test('how long a customer waits reads as minutes, hours or days', () => {
    const t = now.getTime();
    expect(waitingFor(t - 5 * 3_600_000, t)).toBe('5 ч');
    expect(waitingFor(t - 2 * day, t)).toBe('2 дня');
  });
});

describe('the rate is out of date (admin audit 09.10, А11)', () => {
  const priced = [{ purchase: { currency: 'USD' as const, amount: 10 } }, {}];

  test('a day or more after «Применить» — the banner with the days', () => {
    expect(staleRateDays({ appliedAt: new Date(now.getTime() - 3 * day).toISOString() }, priced, now)).toEqual({ days: 3, products: 1 });
  });

  test('applied today — no banner', () => {
    expect(staleRateDays({ appliedAt: new Date(now.getTime() - 3_600_000).toISOString() }, priced, now)).toBeNull();
  });

  test('never applied — the banner without days', () => {
    expect(staleRateDays({}, priced, now)).toEqual({ days: null, products: 1 });
  });

  test('no product priced from a rate — no banner', () => {
    expect(staleRateDays({}, [{}], now)).toBeNull();
  });
});
