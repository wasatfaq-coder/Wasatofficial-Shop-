/**
 * Screens and windows a customer does not need on the first screen: loaded on demand, and in idle time after
 * the first screen so that opening them is instant. Static imports of these modules would bring them back into
 * the main bundle (the audit measured ≈ 78 KB of 402 on the home page).
 */
export const loadProfileScreen = () => import('./views/ProfileScreen');
export const loadCheckoutScreen = () => import('./views/CheckoutScreen');
export const loadOrderSuccessScreen = () => import('./views/OrderSuccessScreen');
export const loadFavoritesScreen = () => import('./views/FavoritesScreen');
export const loadSupportChatModal = () => import('./components/SupportChatModal');
export const loadPromoModal = () => import('./components/PromoModal');
export const loadBrandRequisitesModal = () => import('./components/BrandRequisitesModal');
// windows of the product, the catalog and the cart (audit 02.10, finding 37): ≈ 20 КБ gzip off the main bundle
export const loadSizeCalculatorModal = () => import('./components/SizeCalculatorModal');
export const loadQuickViewModal = () => import('./components/QuickViewModal');
export const loadProductImageZoomModal = () => import('./components/ProductImageZoomModal');
export const loadQuickOrderModal = () => import('./components/QuickOrderModal');

const ALL = [
  loadCheckoutScreen,
  loadProfileScreen,
  loadFavoritesScreen,
  loadOrderSuccessScreen,
  loadSupportChatModal,
  loadPromoModal,
  loadBrandRequisitesModal,
  loadQuickViewModal,
  loadSizeCalculatorModal,
  loadProductImageZoomModal,
  loadQuickOrderModal,
];

/** After the first screen is up: fetch the rest when the browser is idle (errors are retried on real use) */
export function prefetchCustomerScreensWhenIdle(): void {
  const run = () => ALL.forEach((load) => void load().catch(() => {}));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 2500);
}
