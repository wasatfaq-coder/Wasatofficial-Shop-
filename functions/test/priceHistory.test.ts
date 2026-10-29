// История цен товара: заказ сверяется с ценой на момент оформления (аудит админки 09.10, находка 1)
import { describe, expect, test } from 'bun:test';
import { PRICE_HISTORY_LIMIT, pricesAtOrderTime, withPriceChange, withPriceHistories, withWholesaleSettingsChange, wholesaleSettingsAtOrderTime } from '../../src/utils/priceHistory';
import { orderPriceIssues } from '../../src/utils/orderPriceCheck';
import type { Order, Product } from '../../src/types';

const at = (iso: string) => new Date(iso);
const t = (iso: string) => Date.parse(iso);

describe('withPriceChange', () => {
  test('a new price keeps the old one with the time it ended', () => {
    expect(withPriceChange({ price: 4000 }, 4200, at('2026-10-09T10:00:00Z'))).toEqual([
      { price: 4000, until: '2026-10-09T10:00:00.000Z' },
    ]);
  });

  test('the same price adds nothing; entries older than 60 days and beyond the limit are dropped', () => {
    const old = { price: 1, until: '2026-07-01T00:00:00.000Z' };
    expect(withPriceChange({ price: 4000, priceHistory: [old] }, 4000, at('2026-10-09T10:00:00Z'))).toEqual([]);
    let p: Pick<Product, 'price' | 'priceHistory'> = { price: 100 };
    for (let i = 1; i <= PRICE_HISTORY_LIMIT + 3; i++) {
      p = { price: 100 + i * 10, priceHistory: withPriceChange(p, 100 + i * 10, at(`2026-10-0${1 + (i % 8)}T10:00:00Z`)) };
    }
    expect(p.priceHistory).toHaveLength(PRICE_HISTORY_LIMIT);
  });

  test('withPriceHistories touches only the products whose price changed', () => {
    const a = { id: 'a', price: 100 } as Product;
    const b = { id: 'b', price: 200 } as Product;
    const [a2, b2] = withPriceHistories([a, b], [{ ...a }, { ...b, price: 250 }], at('2026-10-09T10:00:00Z'));
    expect(a2.priceHistory).toBeUndefined();
    expect(b2.priceHistory).toEqual([{ price: 200, until: '2026-10-09T10:00:00.000Z' }]);
  });
});

describe('pricesAtOrderTime', () => {
  const product = {
    price: 4400,
    priceHistory: [
      { price: 4000, until: '2026-10-02T10:00:00.000Z' },
      { price: 4200, until: '2026-10-04T10:00:00.000Z' },
    ],
  };

  test('the price in effect when the order was placed', () => {
    expect(pricesAtOrderTime(product, t('2026-10-01T10:00:00Z'))).toEqual([4000]);
    expect(pricesAtOrderTime(product, t('2026-10-03T10:00:00Z'))).toEqual([4200]);
    expect(pricesAtOrderTime(product, t('2026-10-05T10:00:00Z'))).toEqual([4400]);
  });

  test('a change a few minutes before the order: both prices count (the buyer\'s clock, an open cart)', () => {
    expect(pricesAtOrderTime(product, t('2026-10-02T10:05:00Z')).sort()).toEqual([4000, 4200]);
  });

  test('no history or no order time: today\'s price', () => {
    expect(pricesAtOrderTime({ price: 4000 }, t('2026-10-01T10:00:00Z'))).toEqual([4000]);
    expect(pricesAtOrderTime(product, null)).toEqual([4400]);
  });

  test('wholesalePriceHistory tracks wholesale price changes and orderPriceIssues accepts the wholesale price at order time', async () => {
    const { wholesalePricesAtOrderTime } = await import('../../src/utils/priceHistory');
    const { orderPriceIssues } = await import('../../src/utils/orderPriceCheck');
    const before: Product = { id: 'w1', title: 'Худи', price: 3000, wholesalePrice: 1800 } as Product;
    const after: Product = { id: 'w1', title: 'Худи', price: 3200, wholesalePrice: 2000 } as Product;
    const [saved] = withPriceHistories([before], [after], at('2026-10-09T10:00:00Z'));
    expect(saved.priceHistory).toEqual([{ price: 3000, until: '2026-10-09T10:00:00.000Z' }]);
    expect(saved.wholesalePriceHistory).toEqual([{ price: 1800, until: '2026-10-09T10:00:00.000Z' }]);
    expect(wholesalePricesAtOrderTime(saved, t('2026-10-08T10:00:00Z'))).toEqual([1800]);
    expect(wholesalePricesAtOrderTime(saved, t('2026-10-10T10:00:00Z'))).toEqual([2000]);

    const orderBeforeChange = {
      id: 'WS-100',
      createdAt: '2026-10-08T10:00:00.000Z',
      status: 'accepted',
      paymentStatus: 'pending',
      totalPrice: 9000,
      items: [{ id: 'l1', product: saved, selectedColor: 'Синий', selectedSize: '48', quantity: 5, priceKind: 'wholesale', unitPrice: 1800 }],
    } as never;
    expect(orderPriceIssues(orderBeforeChange, [saved])).toEqual([]);
  });
});

// Аудит 29.10, находка 16: скидки «Опта» на момент заказа — смена скидки не делает неоплаченные заказы «не совпадающими»
describe('wholesale discounts at order time', () => {
  const tenPercent = { kind: 'percent' as const, countBy: 'product' as const, tiers: [{ minPacks: 1, value: 10 }] };
  const fifteen = { kind: 'percent' as const, countBy: 'product' as const, tiers: [{ minPacks: 1, value: 15 }] };

  test('a change appends the ended discounts; the same discounts change nothing', () => {
    const now = at('2026-10-20T10:00:00.000Z');
    expect(withWholesaleSettingsChange(undefined, { volumeDiscount: tenPercent }, { volumeDiscount: tenPercent }, now)).toBeUndefined();
    // the database gives map keys in its own order: the same discounts are not a change (review of stage 3)
    const fromDb = { tiers: [{ value: 10, minPacks: 1 }], countBy: 'product' as const, kind: 'percent' as const };
    expect(withWholesaleSettingsChange(undefined, { volumeDiscount: fromDb }, { volumeDiscount: tenPercent }, now)).toBeUndefined();
    const broken = { kind: 'percent' as const, value: 10 };
    expect(withWholesaleSettingsChange(undefined, { brokenPackDiscount: { value: 10, kind: 'percent' } }, { brokenPackDiscount: broken }, now)).toBeUndefined();
    expect(withWholesaleSettingsChange(undefined, { volumeDiscount: tenPercent }, { volumeDiscount: fifteen }, now)).toEqual([
      { until: '2026-10-20T10:00:00.000Z', volumeDiscount: tenPercent },
    ]);
  });

  test('an order placed before the change is checked by the discounts of its time and by today\'s', () => {
    const history = [{ until: '2026-10-20T10:00:00.000Z', volumeDiscount: tenPercent }];
    const current = { volumeDiscount: fifteen };
    const before = wholesaleSettingsAtOrderTime(current, history, t('2026-10-19T12:00:00.000Z'));
    expect(before.map((s) => s?.volumeDiscount)).toEqual([tenPercent]);
    const after = wholesaleSettingsAtOrderTime(current, history, t('2026-10-21T12:00:00.000Z'));
    expect(after.map((s) => s?.volumeDiscount)).toEqual([fifteen]);
    // without the order's time — today's only
    expect(wholesaleSettingsAtOrderTime(current, history, null)).toEqual([current]);
  });

  test('an unpaid wholesale order at the old discount is not flagged after the discount changed', () => {
    const coat = {
      id: 'coat', title: 'Пальто', price: 3000, wholesalePrice: 1000, wholesalePackSize: 1, saleChannel: 'both', category: 'c',
      skus: [{ id: 'coat-m', color: 'Черный', size: 'M', stock: 50 }],
    } as unknown as Product;
    const order = {
      id: 'WS-1', createdAt: '2026-10-19T12:00:00.000Z', date: '', status: 'accepted', paymentStatus: 'pending',
      totalPrice: 9000, deliveryFee: 0,
      items: [{ id: 'l1', product: { id: 'coat', title: 'Пальто', price: 3000 }, quantity: 10, selectedColor: 'Черный', selectedSize: 'M', priceKind: 'wholesale', unitPrice: 900 }],
    } as unknown as Order;
    const settings = { wholesale: { volumeDiscount: fifteen }, wholesaleHistory: [{ until: '2026-10-20T10:00:00.000Z', volumeDiscount: tenPercent }] };
    const issues = orderPriceIssues(order, [coat], { settings });
    expect(issues.filter((i) => i.includes('опт'))).toEqual([]);
    // without the history the 900 ₽ line (−10 %) would be flagged against today's 850 ₽ (−15 %)
    expect(orderPriceIssues(order, [coat], { settings: { wholesale: { volumeDiscount: fifteen } } }).some((i) => i.includes('опт'))).toBe(true);
  });
});
