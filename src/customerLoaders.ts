/**
 * Screens and windows a customer does not need on the first screen: loaded on demand, and in idle time after
 * the first screen so that opening them is instant. Static imports of these modules would bring them back into
 * the main bundle (the audit measured ≈ 78 KB of 402 on the home page).
 */
import { whenReadsSettle } from './utils/pendingReads';

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
// the review form uses NeumorphicSelect (Base UI): loaded when «Написать отзыв» is pointed at or pressed, not in idle
// time — few customers write a review (audit 07.10, finding 32)
export const loadReviewFormModal = () => import('./components/ReviewFormModal');

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

/**
 * After the first screen is up: fetch the rest when the browser is idle (errors are retried on real use). «Up» means
 * with its photos — the miniatures of the cards, the banner, the product's previews (whenReadsSettle): on a slow phone
 * these ≈ 100 КБ of scripts took the channel from them, and the cards showed photos 0,5 s later
 * (docs/performance-plan.md, stage 1)
 */
export function prefetchCustomerScreensWhenIdle(): void {
  const run = () => ALL.forEach((load) => void load().catch(() => {}));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  void whenReadsSettle().then(() => {
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
    else window.setTimeout(run, 2500);
  });
}
