import type { ActiveTab } from '../types';
import { LEGAL_DOC_TITLES } from './legalDocs';

/**
 * The tab title of each screen and the page of the screens search engines index (audit 07.10, findings 31 and 53).
 * One title per screen: the browser's tabs, history and bookmarks, a screen reader and search results tell the
 * screens apart (WCAG 2.4.2). The same text is in <head> of dist/{catalog,offer,privacy}.html and of a product's page
 * (scripts/share-pages.ts), so a page found in search keeps its title once the app opens. No browser APIs here:
 * the build script runs this code too.
 */

/** The shop's main page: what index.html has in <title> */
export function homeDocumentTitle(storeName: string): string {
  return `${storeName} — мужская одежда`;
}

const SCREEN_NAMES: Partial<Record<ActiveTab, string>> = {
  catalog: 'Каталог',
  cart: 'Корзина',
  favorites: 'Избранное',
  profile: 'Профиль',
  checkout: 'Оформление заказа',
  'order-success': 'Заказ оформлен',
  offer: LEGAL_DOC_TITLES.offer,
  privacy: LEGAL_DOC_TITLES.privacy,
};

/** «Каталог — Wasat Shop», «Рубашка «Лён» — Wasat Shop»; a product not loaded yet — the shop's title */
export function screenDocumentTitle(tab: ActiveTab, storeName: string, productTitle?: string): string {
  const name = tab === 'product-detail' ? productTitle?.trim() : SCREEN_NAMES[tab];
  return name ? `${name} — ${storeName}` : homeDocumentTitle(storeName);
}

/**
 * Screens with a page of their own for search engines: title, description and canonical (dist/{screen}.html,
 * Hosting serves it for /{screen} with `cleanUrls`). Cart, profile, checkout and the rest are the visitor's own:
 * they keep the shop's common page (index.html) and get their title in the tab only.
 */
export const INDEXED_SCREENS = ['catalog', 'offer', 'privacy'] as const;
export type IndexedScreen = (typeof INDEXED_SCREENS)[number];

/** Description of an indexed screen: what the page is about, without anything the shop has not set */
export function screenDescription(tab: IndexedScreen, storeName: string): string {
  switch (tab) {
    case 'catalog':
      return `Каталог мужской одежды ${storeName}: поиск, фильтры по размеру, цвету и цене, подбор размера и заказ онлайн.`;
    case 'offer':
      return `${LEGAL_DOC_TITLES.offer} ${storeName}: оформление заказа, цена и оплата, доставка и получение, возврат товара.`;
    case 'privacy':
      return `${LEGAL_DOC_TITLES.privacy} ${storeName}: какие данные обрабатываются, для чего, сколько хранятся и как защищены.`;
  }
}
