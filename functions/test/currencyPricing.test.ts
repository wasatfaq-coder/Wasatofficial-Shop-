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

  test('an old (struck-out) price not above the new one is flagged: the discount would stop showing', () => {
    const p = product('usd', { price: 850, originalPrice: 890, purchase: { currency: 'USD', amount: 10 } });
    expect(repriceProducts([p], rates())[0].oldPriceBelow).toBe(true);
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
