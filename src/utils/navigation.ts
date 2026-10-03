import type { ActiveTab } from '../types';

/**
 * Screens in the address bar (/catalog, /product/{id}; docs/seo-plan.md, stage 2): the browser's «Назад» returns to
 * the previous screen instead of leaving the shop, a product has a link that opens in a new tab, and search engines
 * and messengers see each product as a page of its own. Hosting serves index.html for every path (rewrite `**`), and
 * the product's page with its name, photo and price in <head> (scripts/share-pages.ts). Old links (#/catalog,
 * #/product/{id}) are already with customers: they still open their screen, and the address becomes the new one.
 */
export interface Route {
  tab: ActiveTab;
  productId?: string;
}

const TAB_PATHS: Record<Exclude<ActiveTab, 'product-detail'>, string> = {
  home: '',
  catalog: 'catalog',
  cart: 'cart',
  favorites: 'favorites',
  profile: 'profile',
  checkout: 'checkout',
  'order-success': 'order-success',
  offer: 'offer',
  privacy: 'privacy',
};

export function productHref(productId: string): string {
  return `/product/${encodeURIComponent(productId)}`;
}

/** Link for messengers and search engines: its page has the product's name, photo and price in <head> */
export function productShareUrl(productId: string): string {
  return `${window.location.origin}${productHref(productId)}`;
}

export function routePath(route: Route): string {
  if (route.tab === 'product-detail') return route.productId ? productHref(route.productId) : '/catalog';
  return `/${TAB_PATHS[route.tab]}`;
}

/** «catalog», «product/linen-shirt-01» → the screen; null — the shop's root or an unknown address */
function parseRouteParts(value: string): Route | null {
  const [head = '', id, ...rest] = value.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  if (head === 'product') {
    if (!id || rest.length) return null;
    try {
      return { tab: 'product-detail', productId: decodeURIComponent(id) };
    } catch {
      return null;
    }
  }
  if (id !== undefined) return null;
  const tab = (Object.keys(TAB_PATHS) as (keyof typeof TAB_PATHS)[]).find((t) => TAB_PATHS[t] === head);
  return tab && tab !== 'home' ? { tab } : null;
}

/** The screen of an address: an old link's #/… first (the path of such a link is the root), then the path */
export function parseRoute(location: Pick<Location, 'pathname' | 'hash'>): Route | null {
  if (/^#\/./.test(location.hash)) return parseRouteParts(location.hash.slice(2));
  return parseRouteParts(location.pathname);
}

/** The address as the shop writes it: the path of the screen (an old #/… is not part of it) */
export function currentRoutePath(location: Pick<Location, 'pathname' | 'hash'> = window.location): string {
  return /^#\/./.test(location.hash) ? `${location.pathname}${location.hash}` : location.pathname;
}

/** Entry state written to window.history: position in the shop's own history and the scroll to restore */
export interface HistoryEntryState {
  wasat: true;
  idx: number;
  scrollY?: number;
  /** An entry of an open window over the screen (`windowHistory.ts`): the same screen, «Назад» closes the window */
  windows?: number;
}

export function readHistoryState(state: unknown): HistoryEntryState | null {
  return state && typeof state === 'object' && (state as HistoryEntryState).wasat ? (state as HistoryEntryState) : null;
}
