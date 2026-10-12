import type { Product, ReviewModeration, StoredReview } from '../types';
import { decisionsById, reviewVisibility, type ReviewVisibility } from './reviewModeration';

/** «Отзывы» in the admin panel: one row per review with where it stands; the filters and the counters of the section */

export interface AdminReviewRow {
  review: StoredReview;
  /** The product's title now; «Товар удалён» when the product is gone */
  productTitle: string;
  productExists: boolean;
  status: ReviewVisibility;
  decision: ReviewModeration | undefined;
  /** When the review was written or last changed (ms): the list is sorted by it */
  at: number;
}

export type AdminReviewStatusFilter = 'all' | ReviewVisibility;
export type AdminReviewRatingFilter = 'all' | 1 | 2 | 3 | 4 | 5;

export interface AdminReviewFilters {
  status: AdminReviewStatusFilter;
  rating: AdminReviewRatingFilter;
  query: string;
}

export const DELETED_PRODUCT_TITLE = 'Товар удалён';

const reviewTime = (review: StoredReview): number => {
  const created = Date.parse(review.createdAt);
  return Math.max(review.updatedAt ?? 0, Number.isFinite(created) ? created : 0);
};

/** Every review, newest first (by the last change), with its status as customers see it (`reviewVisibility`) */
export function buildAdminReviewRows(
  reviews: readonly StoredReview[],
  decisions: readonly ReviewModeration[],
  products: readonly Pick<Product, 'id' | 'title'>[],
  premoderation: boolean
): AdminReviewRow[] {
  const byDecision = decisionsById(decisions);
  const titles = new Map(products.map((p) => [p.id, p.title]));
  return reviews
    .map((review): AdminReviewRow => {
      const decision = byDecision.get(review.id);
      return {
        review,
        productTitle: titles.get(review.productId) ?? DELETED_PRODUCT_TITLE,
        productExists: titles.has(review.productId),
        status: reviewVisibility(review, decision, premoderation),
        decision,
        at: reviewTime(review),
      };
    })
    .sort((a, b) => b.at - a.at);
}

/** Status, rating and a search over the author, the text, the product and the order number */
export function filterAdminReviews(rows: readonly AdminReviewRow[], filters: AdminReviewFilters): AdminReviewRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter(({ review, productTitle, status }) => {
    if (filters.status !== 'all' && status !== filters.status) return false;
    if (filters.rating !== 'all' && review.rating !== filters.rating) return false;
    if (!needle) return true;
    return [review.authorName, review.comment, review.pros, review.cons, productTitle, review.orderId]
      .some((text) => text?.toLowerCase().includes(needle));
  });
}

/** How many reviews are in each status */
export function countByStatus(rows: readonly AdminReviewRow[]): Record<ReviewVisibility, number> {
  const counts: Record<ReviewVisibility, number> = { published: 0, pending: 0, rejected: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** Reviews waiting for the owner: «Сегодня» and the section's badge */
export function countPendingReviews(
  reviews: readonly StoredReview[],
  decisions: readonly ReviewModeration[],
  premoderation: boolean
): number {
  const byDecision = decisionsById(decisions);
  return reviews.filter((r) => reviewVisibility(r, byDecision.get(r.id), premoderation) === 'pending').length;
}

/** The time of a decision: not earlier than the review's last save, or the decision would look out of date at once */
export function decisionTime(review: Pick<StoredReview, 'updatedAt'>, now: number = Date.now()): number {
  return Math.max(now, review.updatedAt ?? 0);
}

export const REVIEW_STATUS_LABELS: Record<ReviewVisibility, string> = {
  pending: 'На проверке',
  published: 'Опубликованы',
  rejected: 'Отклонены',
};
