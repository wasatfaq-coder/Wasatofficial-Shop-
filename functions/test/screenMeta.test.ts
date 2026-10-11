// Заголовок вкладки по экрану и страницы каталога и документов для поисковиков (аудит 07.10, находки 31 и 53)
import { describe, expect, test } from 'bun:test';
import { INDEXED_SCREENS, homeDocumentTitle, screenDescription, screenDocumentTitle } from '../../src/utils/screenMeta';
import { screenMeta } from '../../scripts/share-pages';
import type { ActiveTab } from '../../src/types';

const STORE = 'Wasat Shop';
const SITE = 'https://shop.example';

describe('заголовок вкладки', () => {
  test('у каждого экрана свой заголовок с названием магазина', () => {
    const tabs: ActiveTab[] = ['catalog', 'cart', 'favorites', 'profile', 'checkout', 'order-success', 'offer', 'privacy'];
    const titles = tabs.map((tab) => screenDocumentTitle(tab, STORE));
    expect(new Set(titles).size).toBe(tabs.length);
    for (const title of titles) {
      expect(title.endsWith(` — ${STORE}`)).toBe(true);
      expect(title).not.toBe(homeDocumentTitle(STORE));
    }
    expect(screenDocumentTitle('catalog', STORE)).toBe('Каталог — Wasat Shop');
    expect(screenDocumentTitle('cart', STORE)).toBe('Корзина — Wasat Shop');
    expect(screenDocumentTitle('checkout', STORE)).toBe('Оформление заказа — Wasat Shop');
    expect(screenDocumentTitle('offer', STORE)).toBe('Публичная оферта — Wasat Shop');
    expect(screenDocumentTitle('privacy', STORE)).toBe('Политика обработки персональных данных — Wasat Shop');
  });

  test('главная — как в index.html', () => {
    expect(screenDocumentTitle('home', STORE)).toBe('Wasat Shop — мужская одежда');
    expect(homeDocumentTitle('Другой магазин')).toBe('Другой магазин — мужская одежда');
  });

  test('товар — его название, пока не загружен — заголовок магазина', () => {
    expect(screenDocumentTitle('product-detail', STORE, 'Рубашка «Лён»')).toBe('Рубашка «Лён» — Wasat Shop');
    expect(screenDocumentTitle('product-detail', STORE)).toBe(homeDocumentTitle(STORE));
    expect(screenDocumentTitle('product-detail', STORE, '  ')).toBe(homeDocumentTitle(STORE));
  });
});

describe('страницы каталога и документов', () => {
  test('свои заголовок, описание и canonical, как во вкладке', () => {
    expect([...INDEXED_SCREENS]).toEqual(['catalog', 'offer', 'privacy']);
    for (const screen of INDEXED_SCREENS) {
      const html = screenMeta(screen, SITE, STORE, false);
      expect(html).toContain(`<title>${screenDocumentTitle(screen, STORE)}</title>`);
      expect(html).toContain(`<meta name="description" content="${screenDescription(screen, STORE)}" />`);
      expect(html).toContain(`<link rel="canonical" href="${SITE}/${screen}" />`);
      expect(html).toContain(`<meta property="og:url" content="${SITE}/${screen}" />`);
      expect(html).not.toContain('noindex');
      expect(screenDescription(screen, STORE)).toContain(STORE);
    }
  });

  test('описания не повторяют друг друга и главную', () => {
    const descriptions = INDEXED_SCREENS.map((screen) => screenDescription(screen, STORE));
    expect(new Set(descriptions).size).toBe(INDEXED_SCREENS.length);
  });

  test('проверочная версия закрыта от поисковиков, название магазина не становится разметкой', () => {
    const html = screenMeta('catalog', SITE, 'A & <b>', true);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<title>Каталог — A &amp; &lt;b&gt;</title>');
    expect(html).not.toContain('<b>');
  });
});
