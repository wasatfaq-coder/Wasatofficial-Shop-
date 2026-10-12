import { lazyWithRetry } from '../utils/lazyWithRetry';
import {
  loadProductImageZoomModal,
  loadQuickOrderModal,
  loadQuickViewModal,
  loadReviewFormModal,
  loadSizeCalculatorModal,
} from '../customerLoaders';

/**
 * Windows that open on a tap (finding 37): loaded on first use (`LazyMount`) and in idle time after the first screen.
 * A static import of these modules would bring them back into the main bundle.
 */
export const SizeCalculatorModal = lazyWithRetry(() => loadSizeCalculatorModal().then((m) => ({ default: m.SizeCalculatorModal })));
export const QuickViewModal = lazyWithRetry(() => loadQuickViewModal().then((m) => ({ default: m.QuickViewModal })));
export const ProductImageZoomModal = lazyWithRetry(() => loadProductImageZoomModal().then((m) => ({ default: m.ProductImageZoomModal })));
export const QuickOrderModal = lazyWithRetry(() => loadQuickOrderModal().then((m) => ({ default: m.QuickOrderModal })));
export const ReviewFormModal = lazyWithRetry(() => loadReviewFormModal().then((m) => ({ default: m.ReviewFormModal })));
