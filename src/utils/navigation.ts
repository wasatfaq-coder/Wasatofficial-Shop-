import type { ActiveTab } from '../types';

/**
 * Screens in the address bar (#/catalog, #/product/{id}): the browser's «Назад» returns to the
 * previous screen instead of leaving the shop, and a product has a link that opens in a new tab.
 * Hash routes need no Hosting rewrites and work on preview channels.
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
  return `#/product/${encodeURIComponent(productId)}`;
}

export function routeHash(route: Route): string {
  if (route.tab === 'product-detail') return route.productId ? productHref(route.productId) : '#/catalog';
  return `#/${TAB_PATHS[route.tab]}`;
}

/** null — no route in the address (the shop's root URL) or an unknown one */
export function parseRouteHash(hash: string): Route | null {
  if (!hash || hash === '#') return null;
  const [head = '', id] = hash.replace(/^#\/?/, '').split('/');
  if (head === 'product') {
    if (!id) return null;
    try {
      return { tab: 'product-detail', productId: decodeURIComponent(id) };
    } catch {
      return null;
    }
  }
  const tab = (Object.keys(TAB_PATHS) as (keyof typeof TAB_PATHS)[]).find((t) => TAB_PATHS[t] === head);
  return tab ? { tab } : null;
}

/** Entry state written to window.history: position in the shop's own history and the scroll to restore */
export interface HistoryEntryState {
  wasat: true;
  idx: number;
  scrollY?: number;
  /** An open window's entry above the screen's own (see `dialogHistory.ts`): how many windows are open */
  dialog?: number;
}

export function readHistoryState(state: unknown): HistoryEntryState | null {
  return state && typeof state === 'object' && (state as HistoryEntryState).wasat ? (state as HistoryEntryState) : null;
}
