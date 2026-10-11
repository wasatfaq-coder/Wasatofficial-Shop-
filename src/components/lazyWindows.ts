import { lazy } from 'react';
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
export const SizeCalculatorModal = lazy(() => loadSizeCalculatorModal().then((m) => ({ default: m.SizeCalculatorModal })));
export const QuickViewModal = lazy(() => loadQuickViewModal().then((m) => ({ default: m.QuickViewModal })));
export const ProductImageZoomModal = lazy(() => loadProductImageZoomModal().then((m) => ({ default: m.ProductImageZoomModal })));
export const QuickOrderModal = lazy(() => loadQuickOrderModal().then((m) => ({ default: m.QuickOrderModal })));
export const ReviewFormModal = lazy(() => loadReviewFormModal().then((m) => ({ default: m.ReviewFormModal })));
