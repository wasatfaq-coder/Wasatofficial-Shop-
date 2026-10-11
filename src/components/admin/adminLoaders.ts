import type { AdminTab } from './adminSections';

/**
 * Admin code is loaded only through these functions (dynamic imports: nothing lands in the customer bundle).
 * React.lazy in ProfileScreen and the prefetch share them; a module requested twice loads once.
 */
export const loadAdminNav = () => import('./AdminNav');

export const ADMIN_SECTION_LOADERS: Record<AdminTab, () => Promise<unknown>> = {
  today: () => import('./AdminTodayTab'),
  more: loadAdminNav,
  // the chart (recharts) is its own chunk: prefetched too, but the section does not wait for it
  analytics: () => Promise.all([import('./AdminAnalyticsTab'), import('./AdminAnalyticsChart')]),
  orders: () => import('./AdminOrdersTab'),
  customers: () => import('./AdminCustomersTab'),
  support: () => import('./AdminSupportInbox'),
  products: () => import('./AdminProductsTab'),
  categories: () => import('./AdminCategoriesTab'),
  inventory: () => import('./AdminInventoryTab'),
  rates: () => import('./AdminRatesTab'),
  wholesale: () => import('./AdminWholesaleTab'),
  promos: () => import('./AdminPromoConstructorTab'),
  banners: () => import('./AdminBannersTab'),
  delivery: () => import('./AdminDeliveryTab'),
  payment: () => import('./AdminPaymentTab'),
  faq: () => import('./AdminFaqTab'),
  legal: () => import('./AdminLegalTab'),
  storefront: () => Promise.all([import('./AdminStorefrontTab'), import('./BrandRenameCard')]),
};

const requested = new Set<string>();

/** Starts loading the panel's menu and a section; safe to call often (hover, focus, idle) */
export function prefetchAdmin(tab?: AdminTab) {
  const run = (key: string, load: () => Promise<unknown>) => {
    if (requested.has(key)) return;
    requested.add(key);
    // a failed prefetch is retried by the real render (React.lazy)
    load().catch(() => requested.delete(key));
  };
  run('nav', loadAdminNav);
  if (tab) run(tab, ADMIN_SECTION_LOADERS[tab]);
}

/** The rest of the sections, one after another while the browser is idle; not on a data-saving connection */
export function prefetchAllAdminWhenIdle(first: AdminTab): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};
  const tabs = [first, ...(Object.keys(ADMIN_SECTION_LOADERS) as AdminTab[]).filter((t) => t !== first)];
  let cancelled = false;
  let handle: number | undefined;
  // Safari has no requestIdleCallback
  const hasIdle = typeof window.requestIdleCallback === 'function';
  const idle = (cb: () => void) => (hasIdle ? window.requestIdleCallback(cb, { timeout: 3000 }) : window.setTimeout(cb, 1200));
  const next = () => {
    if (cancelled) return;
    const tab = tabs.shift();
    if (!tab) return;
    prefetchAdmin(tab);
    handle = idle(next);
  };
  handle = idle(next);
  return () => {
    cancelled = true;
    if (handle === undefined) return;
    if (hasIdle) window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}
