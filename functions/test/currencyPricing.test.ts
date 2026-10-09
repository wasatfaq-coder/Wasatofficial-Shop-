// Цены от курса: рабочий курс, наценка, округление и пересчёт всех товаров кнопкой «Применить» (решение владельца 09.10)
import { describe, expect, test } from 'bun:test';
import {
  EMPTY_EXCHANGE_RATES,
  exchangeRateErrors,
  priceFromRate,
  readExchangeRates,
  readPurchase,
  repriceProducts,
  roundPriceUp,
  samePurchase,
  workingRate,
  type ExchangeRates,
} from '../../src/utils/currencyPricing';
import type { Product } from '../../src/types';

const rates = (over: Partial<ExchangeRates> = {}): ExchangeRates => ({
  usd: { official: 85, markup: 5, markupKind: 'rub' },
  cny: { official: 11.7, markup: 2, markupKind: 'percent' },
  markupPercent: 0,
  ...over,
});

const product = (id: string, over: Partial<Product> = {}): Product =>
  ({
    id,
    title: `Товар ${id}`,
    category: 'tshirts',
    categoryLabel: 'Футболки',
    price: 1000,
    description: '',
    material: '',
    images: [],
    colors: [],
    sizes: [],
    inStock: true,
    rating: 0,
    reviewsCount: 0,
    ...over,
  }) as Product;

describe('working rate = official + the owner\'s addition', () => {
  test('85 ₽ + 5 ₽ = 90 ₽; 85 ₽ + 2 % = 86,70 ₽ (examples of the owner)', () => {
    expect(workingRate({ official: 85, markup: 5, markupKind: 'rub' })).toBe(90);
    expect(workingRate({ official: 85, markup: 2, markupKind: 'percent' })).toBe(86.7);
    expect(workingRate({ official: 85, markup: 0, markupKind: 'rub' })).toBe(85);
  });

  test('no official rate — no working rate', () => {
    expect(workingRate({ official: 0, markup: 5, markupKind: 'rub' })).toBeNull();
    expect(workingRate({ official: 85, markup: -1, markupKind: 'rub' })).toBeNull();
  });
});

describe('price of a product bought in a currency', () => {
  test('10 $ at 85 ₽: 850 ₽ without the addition, 900 ₽ with 5 ₽ on top (example of the owner)', () => {
    const purchase = { currency: 'USD' as const, amount: 10 };
    expect(priceFromRate(purchase, rates({ usd: { official: 85, markup: 0, markupKind: 'rub' } }))).toEqual({ price: 850, costPrice: 850 });
    expect(priceFromRate(purchase, rates())).toEqual({ price: 900, costPrice: 900 });
  });

  test('the markup for all products, or the product\'s own; rounded up to 10 ₽', () => {
    const r = rates({ usd: { official: 82.1, markup: 0, markupKind: 'rub' }, markupPercent: 180 });
    // 4,20 × 82,10 = 344,82 ₽; × 2,8 = 965,50 → 970 ₽
    expect(priceFromRate({ currency: 'USD', amount: 4.2 }, r)).toEqual({ price: 970, costPrice: 344.82 });
    // own markup 100 %: 689,64 → 690 ₽
    expect(priceFromRate({ currency: 'USD', amount: 4.2, markupPercent: 100 }, r)?.price).toBe(690);
  });

  test('yuan with the addition in percent', () => {
    // 11,7 × 1,02 = 11,934; 100 ¥ = 1 193,40 ₽ → 1 200 ₽
    expect(priceFromRate({ currency: 'CNY', amount: 100 }, rates())).toEqual({ price: 1200, costPrice: 1193.4 });
  });

  test('an exact multiple of 10 stays as it is despite floating point', () => {
    expect(roundPriceUp(900.0000000001)).toBe(900);
    expect(roundPriceUp(900.01)).toBe(910);
    expect(roundPriceUp(0.1 * 3 * 1000)).toBe(300);
  });

  test('no purchase or no rate — nothing to calculate', () => {
    expect(priceFromRate(undefined, rates())).toBeNull();
    expect(priceFromRate({ currency: 'USD', amount: 0 }, rates())).toBeNull();
    expect(priceFromRate({ currency: 'USD', amount: 10 }, EMPTY_EXCHANGE_RATES)).toBeNull();
  });
});

describe('«Применить» recalculates every product bought in a currency at once', () => {
  test('only products with a purchase change; the rest keep their price', () => {
    const products = [
      product('usd', { price: 850, costPrice: 850, purchase: { currency: 'USD', amount: 10 } }),
      product('cny', { price: 1000, purchase: { currency: 'CNY', amount: 100 } }),
      product('rub', { price: 2990, costPrice: 1400 }),
    ];
    const changes = repriceProducts(products, rates());
    expect(changes.map((c) => [c.product.id, c.before.price, c.after.price])).toEqual([
      ['usd', 850, 900],
      ['cny', 1000, 1200],
    ]);
  });

  test('a product already at the new price is not rewritten', () => {
    const p = product('usd', { price: 900, costPrice: 900, purchase: { currency: 'USD', amount: 10 } });
    expect(repriceProducts([p], rates())).toEqual([]);
  });

  test('a discounted product keeps its discount: the old price follows the rate, the price the same share below it', () => {
    // 10 $ × 90 ₽ = 900 ₽ without discount; the product sold 20 % off (800 of 1000)
    const p = product('usd', { price: 800, originalPrice: 1000, purchase: { currency: 'USD', amount: 10 } });
    const [change] = repriceProducts([p], rates());
    expect(change.after).toEqual({ price: 720, costPrice: 900, originalPrice: 900 });
    expect(change.discountPercent).toBe(20);
  });

  test('a kept discount is stable: the same rates change nothing the second time', () => {
    const p = product('usd', { price: 720, costPrice: 900, originalPrice: 900, purchase: { currency: 'USD', amount: 10 } });
    expect(repriceProducts([p], rates())).toEqual([]);
  });

  test('the discount does not shrink over several rates: the stored percent is kept, not the rounded share', () => {
    let p = product('usd', { price: 850, originalPrice: 1000, discountPercent: 15, purchase: { currency: 'USD', amount: 10 } });
    for (const official of [98, 96, 98, 96, 98]) {
      const [change] = repriceProducts([p], rates({ usd: { official, markup: 5, markupKind: 'rub' } }));
      p = { ...p, ...change.after, originalPrice: change.after.originalPrice ?? undefined, discountPercent: change.discountPercent };
    }
    // 10 $ × 103 ₽ = 1030 ₽, 15 % off = 875,5 → 880 ₽ (rounded up), the same as after the first change
    expect([p.price, p.originalPrice, p.discountPercent]).toEqual([880, 1030, 15]);
  });

  test('a stored percent the prices no longer show (price changed by hand) gives way to the prices', () => {
    const p = product('usd', { price: 700, originalPrice: 1000, discountPercent: 15, purchase: { currency: 'USD', amount: 10 } });
    expect(repriceProducts([p], rates())[0].discountPercent).toBe(30);
  });

  test('an old price not above the price is no discount and is removed (admin audit 09.10, finding 2)', () => {
    const p = product('usd', { price: 900, costPrice: 900, originalPrice: 890, purchase: { currency: 'USD', amount: 10 } });
    const [change] = repriceProducts([p], rates());
    expect(change.after).toEqual({ price: 900, costPrice: 900, originalPrice: null });
    expect(change.discountPercent).toBe(0);
  });

  test('a discount that rounding would eat is removed rather than shown as 0 %', () => {
    // 1 % off 900 ₽ rounds up to 900 ₽ — no discount is left
    const p = product('usd', { price: 990, originalPrice: 1000, purchase: { currency: 'USD', amount: 10 } });
    expect(repriceProducts([p], rates())[0].after).toEqual({ price: 900, costPrice: 900, originalPrice: null });
  });
});

describe('the form says what to fix before applying', () => {
  test('ready rates have no errors', () => {
    expect(exchangeRateErrors(rates())).toEqual([]);
  });

  test('missing rate, negative or too large addition, markup out of range', () => {
    expect(exchangeRateErrors(EMPTY_EXCHANGE_RATES)).toEqual([
      'Доллар: укажите курс ЦБ больше нуля',
      'Юань: укажите курс ЦБ больше нуля',
    ]);
    expect(exchangeRateErrors(rates({ usd: { official: 85, markup: 120, markupKind: 'percent' } }))).toEqual(['Доллар: надбавка больше 100 %']);
    expect(exchangeRateErrors(rates({ usd: { official: 85, markup: 90, markupKind: 'rub' } }))).toEqual(['Доллар: надбавка больше самого курса']);
    expect(exchangeRateErrors(rates({ markupPercent: -5 }))).toEqual(['Наценка для всех товаров — от 0 до 1000 %']);
    // a rate over the limit is not «not set» (admin audit 09.10, finding 14)
    expect(exchangeRateErrors(rates({ usd: { official: 200_000, markup: 0, markupKind: 'rub' } }))).toEqual([
      'Доллар: курс ЦБ — не больше 100 000 ₽',
    ]);
  });
});

describe('data read from the database is checked, not trusted', () => {
  test('purchase', () => {
    expect(readPurchase({ currency: 'USD', amount: 4.2, markupPercent: 100 })).toEqual({ currency: 'USD', amount: 4.2, markupPercent: 100 });
    expect(readPurchase({ currency: 'EUR', amount: 4 })).toBeUndefined();
    expect(readPurchase({ currency: 'CNY', amount: '4' })).toBeUndefined();
    expect(readPurchase(null)).toBeUndefined();
    // a markup out of range is dropped: the markup for all products applies
    expect(readPurchase({ currency: 'USD', amount: 4, markupPercent: 5000 })).toEqual({ currency: 'USD', amount: 4 });
  });

  test('rates: a missing document is «not set»', () => {
    expect(readExchangeRates(undefined)).toEqual(EMPTY_EXCHANGE_RATES);
    expect(readExchangeRates({ usd: { official: 85, markup: 5, markupKind: 'percent' }, markupPercent: 30, appliedAt: '2026-10-09' })).toEqual({
      usd: { official: 85, markup: 5, markupKind: 'percent' },
      cny: { official: 0, markup: 0, markupKind: 'rub' },
      markupPercent: 30,
      appliedAt: '2026-10-09',
    });
  });

  test('same purchase', () => {
    expect(samePurchase(undefined, undefined)).toBe(true);
    expect(samePurchase({ currency: 'USD', amount: 1 }, undefined)).toBe(false);
    expect(samePurchase({ currency: 'USD', amount: 1 }, { currency: 'USD', amount: 1 })).toBe(true);
    expect(samePurchase({ currency: 'USD', amount: 1 }, { currency: 'CNY', amount: 1 })).toBe(false);
  });
});
