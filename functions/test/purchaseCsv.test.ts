// Admin audit 09.10, findings 5 and 11: the purchase in a currency in the catalog CSV, and the price journal
import { describe, expect, test } from 'bun:test';
import { parseProductsFromCSV, purchaseFromCells, supplierFromCell } from '../../src/utils/csvHelpers';
import { costEntryOf, readCostEntry, sameCostEntry } from '../../src/utils/productCosts';
import { priceChangeEntries, priceChangeSourceText } from '../../src/utils/priceChanges';
import type { ExchangeRates } from '../../src/utils/currencyPricing';

describe('purchase columns of the catalog CSV', () => {
  const header = 'ID,Название,Категория,Цена,Старая цена,В наличии,Остаток,Размеры,Цвета,Картинка,Описание,Валюта закупки,Закупка,Своя наценка (%)';
  const row = (purchase: string) => `${header}\np1,Рубашка,shirts,4000,,Да,0,M,Белый,https://x/1.jpg,,${purchase}`;

  test('currency, amount and own markup; «$», «юань» and a comma are read', () => {
    expect(purchaseFromCells('USD', '12,5', '')).toEqual({ currency: 'USD', amount: 12.5 });
    expect(purchaseFromCells('$', '10', '180')).toEqual({ currency: 'USD', amount: 10, markupPercent: 180 });
    expect(purchaseFromCells('юань', '85', '150%')).toEqual({ currency: 'CNY', amount: 85, markupPercent: 150 });
    expect(parseProductsFromCSV(row('CNY,42,')).products[0].purchase).toEqual({ currency: 'CNY', amount: 42 });
  });

  test('empty cells keep the product\'s purchase; «₽» removes it', () => {
    const kept = parseProductsFromCSV(row(',,')).products[0];
    expect('purchase' in kept).toBe(false);
    // an old file without the three columns
    expect('purchase' in parseProductsFromCSV(row('').replace(/,$/, '')).products[0]).toBe(false);
    const removed = parseProductsFromCSV(row('₽,,')).products[0];
    expect('purchase' in removed && removed.purchase === undefined).toBe(true);
  });

  test('a wrong currency or amount is counted and leaves the purchase as it was', () => {
    expect(purchaseFromCells('EUR', '10', '')).toBe('invalid');
    expect(purchaseFromCells('USD', '0', '')).toBe('invalid');
    expect(purchaseFromCells('USD', '10', 'много')).toBe('invalid');
    expect(purchaseFromCells('USD', '10', '1500')).toBe('invalid');
    expect(purchaseFromCells('USD', '10', '-5')).toBe('invalid');
    const { products, badPurchase } = parseProductsFromCSV(row('EUR,10,'));
    expect(badPurchase).toBe(1);
    expect('purchase' in products[0]).toBe(false);
  });
});

describe('supplier columns of the catalog CSV (stage 11)', () => {
  const header =
    'ID,Название,Категория,Цена,Старая цена,В наличии,Остаток,Размеры,Цвета,Картинка,Описание,Валюта закупки,Закупка,Своя наценка (%),Поставщик,Артикул поставщика';
  const row = (cells: string) => `${header}\np1,Рубашка,shirts,4000,,Да,0,M,Белый,https://x/1.jpg,,,,,${cells}`;

  test('supplier and its article are read, trimmed to one line', () => {
    const p = parseProductsFromCSV(row('"  Guangzhou   Fashion ",GF-2231')).products[0];
    expect(p.supplier).toBe('Guangzhou Fashion');
    expect(p.supplierSku).toBe('GF-2231');
  });

  test('empty cells keep them, «-» removes them, an old file without the columns changes nothing', () => {
    const kept = parseProductsFromCSV(row(',')).products[0];
    expect('supplier' in kept || 'supplierSku' in kept).toBe(false);
    const removed = parseProductsFromCSV(row('-,—')).products[0];
    expect('supplier' in removed && removed.supplier === undefined).toBe(true);
    expect('supplierSku' in removed && removed.supplierSku === undefined).toBe(true);
    const old = 'ID,Название,Категория,Цена,Старая цена,В наличии,Остаток,Размеры,Цвета,Картинка,Описание\np1,Рубашка,shirts,4000,,Да,0,M,Белый,https://x/1.jpg,';
    expect('supplier' in parseProductsFromCSV(old).products[0]).toBe(false);
    expect(supplierFromCell('x'.repeat(200), 60)).toHaveLength(60);
  });
});

describe('product_costs entry', () => {
  test('the supplier counts as cost data: a save with it keeps the document, the cost and purchase stay', () => {
    const purchase = { currency: 'USD' as const, amount: 4.2 };
    expect(costEntryOf({ costPrice: 380, purchase, supplier: ' Текстиль ', supplierSku: '' })).toEqual({ costPrice: 380, purchase, supplier: 'Текстиль' });
    expect(readCostEntry({ supplier: 'Текстиль' })).toEqual({ supplier: 'Текстиль' });
    expect(readCostEntry({ supplier: '  ', updatedAt: 'x' })).toBeNull();
    expect(sameCostEntry({ costPrice: 1 }, { costPrice: 1, supplier: 'A' })).toBe(false);
    expect(sameCostEntry(undefined, {})).toBe(true);
  });
});

describe('price journal entries', () => {
  const rates: ExchangeRates = {
    usd: { official: 85, markup: 5, markupKind: 'rub' },
    cny: { official: 11.7, markup: 2, markupKind: 'percent' },
    markupPercent: 0,
  };
  const now = new Date('2026-10-09T12:00:00.000Z');
  const before = [
    { id: 'p1', price: 900 },
    { id: 'p2', price: 500 },
  ];

  test('only products whose price changed; «Применить» keeps the working rate of the currency', () => {
    const after = [
      { id: 'p1', title: 'Рубашка', price: 970, purchase: { currency: 'USD' as const, amount: 10 } },
      { id: 'p2', title: 'Футболка', price: 500, purchase: { currency: 'CNY' as const, amount: 40 } },
      { id: 'p3', title: 'Новый', price: 100 },
    ];
    const entries = priceChangeEntries(before, after, { operator: 'owner@example.com', rates, now });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ productId: 'p1', oldPrice: 900, newPrice: 970, source: 'rates', currency: 'USD', rate: 90, operator: 'owner@example.com' });
    expect(priceChangeSourceText(entries[0])).toBe('по курсу 90 ₽ за $');
  });

  test('an edit by hand has no rate; ids differ for the same product', () => {
    const after = [{ id: 'p1', title: 'Рубашка', price: 1000 }];
    const [a] = priceChangeEntries(before, after, { operator: 'owner@example.com', now });
    const [b] = priceChangeEntries(before, after, { operator: 'owner@example.com', now });
    expect(a).toMatchObject({ source: 'admin', oldPrice: 900, newPrice: 1000 });
    expect('rate' in a).toBe(false);
    expect(priceChangeSourceText(a)).toBe('вручную');
    expect(a.id).not.toBe(b.id);
  });
});
