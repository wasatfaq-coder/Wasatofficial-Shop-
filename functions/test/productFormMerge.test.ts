// Форма товара сохраняет только то, что владелец изменил в ней, поверх товара из базы (аудит 29.10, находка 9)
import { describe, expect, test } from 'bun:test';
import type { Product } from '../../src/types';
import { mergeFormIntoLive } from '../../src/utils/productFormMerge';

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    title: 'Куртка',
    price: 5990,
    category: 'jackets',
    images: ['a.jpg'],
    sizes: ['M'],
    colors: [{ name: 'Хаки', hex: '#556B2F' }],
    ...over,
  }) as Product;

describe('mergeFormIntoLive', () => {
  test('a price changed meanwhile («Курсы → Применить») stays when the form did not touch the price', () => {
    const opened = product();
    const live = product({ price: 6490, priceHistory: [{ price: 5990, until: 1 }] } as Partial<Product>);
    const edited = product({ title: 'Куртка утеплённая' });
    const saved = mergeFormIntoLive(opened, edited, live);
    expect(saved.title).toBe('Куртка утеплённая');
    expect(saved.price).toBe(6490);
    expect((saved as Product & { priceHistory?: unknown }).priceHistory).toEqual([{ price: 5990, until: 1 }]);
  });

  test('the price the owner typed wins over the one changed meanwhile', () => {
    const saved = mergeFormIntoLive(product(), product({ price: 7000 }), product({ price: 6490 }));
    expect(saved.price).toBe(7000);
  });

  test('a field the form cleared is removed; a field another admin added meanwhile stays', () => {
    const opened = product({ badge: 'Хит' });
    const live = product({ badge: 'Хит', hiddenFromSale: true });
    const edited = product();
    const saved = mergeFormIntoLive(opened, edited, live);
    expect('badge' in saved).toBe(false);
    expect(saved.hiddenFromSale).toBe(true);
  });

  test('photos changed meanwhile stay when the form kept its photos', () => {
    const live = product({ images: ['a.jpg', 'b.jpg'] });
    expect(mergeFormIntoLive(product(), product({ title: 'Другая' }), live).images).toEqual(['a.jpg', 'b.jpg']);
  });

  test('no product in the database — the form product as it is', () => {
    const edited = product({ title: 'Новая' });
    expect(mergeFormIntoLive(product(), edited, undefined)).toBe(edited);
  });

  test('the opened copy and the live product are not changed', () => {
    const opened = product();
    const live = product({ price: 6490 });
    mergeFormIntoLive(opened, product({ title: 'X' }), live);
    expect(opened.title).toBe('Куртка');
    expect(live.title).toBe('Куртка');
  });
});
