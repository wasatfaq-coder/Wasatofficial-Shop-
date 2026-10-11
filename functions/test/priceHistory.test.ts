// История цен товара: заказ сверяется с ценой на момент оформления (аудит админки 09.10, находка 1)
import { describe, expect, test } from 'bun:test';
import { PRICE_HISTORY_LIMIT, pricesAtOrderTime, withPriceChange, withPriceHistories } from '../../src/utils/priceHistory';
import type { Product } from '../../src/types';

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
});
