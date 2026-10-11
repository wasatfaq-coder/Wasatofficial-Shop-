import type { Order, ProductReview, ReviewModeration, StoredReview } from '../types';

/**
 * Moderation of reviews: what each viewer sees. The owner's decisions live in `review_moderation/{reviewId}`
 * (admin writes, everyone reads); the author's reviews in `reviews` stay under the authors' own rules. No code here
 * touches the database — screens, the catalog merge and the admin list all ask these functions.
 */

/** `published` — shown to everybody; `pending` — waits for the owner; `rejected` — hidden, the author sees the reason */
export type ReviewVisibility = 'published' | 'pending' | 'rejected';

/** The most characters of the reason the owner gives (rules: `isReviewModeration`) */
export const MODERATION_REASON_MAX = 300;

/**
 * A decision is out of date when the author changed the review after it (`updatedAt` of the review is newer than the
 * decision's `at`): the owner has not seen the new text.
 */
export function isModerationStale(
  review: Pick<StoredReview, 'updatedAt'>,
  decision: Pick<ReviewModeration, 'at'>
): boolean {
  return typeof review.updatedAt === 'number' && decision.at < review.updatedAt;
}

/**
 * Where a review stands:
 * - a current decision decides;
 * - an out-of-date «Опубликован» and no decision — shown while checking is off, waiting while it is on;
 * - an out-of-date «Отклонён» waits for the owner again, whatever the setting (a changed text is a new text).
 */
export function reviewVisibility(
  review: Pick<StoredReview, 'updatedAt'>,
  decision: ReviewModeration | undefined,
  premoderation: boolean
): ReviewVisibility {
  if (decision && !isModerationStale(review, decision)) return decision.status;
  if (decision?.status === 'rejected') return 'pending';
  return premoderation ? 'pending' : 'published';
}

export interface ReviewViewContext {
  /** Decisions by review id */
  decisions: ReadonlyMap<string, ReviewModeration>;
  premoderation: boolean;
  /** Who looks (a signed-in customer's uid); null — a guest or the owner's catalog count */
  viewerUid: string | null;
}

/**
 * What the viewer gets of one stored review: the review itself, with `moderation` set when only its author sees it
 * («На проверке», «Отклонён»), or null when the viewer does not see it at all.
 */
export function viewReview(review: StoredReview, ctx: ReviewViewContext): ProductReview | null {
  const decision = ctx.decisions.get(review.id);
  const visibility = reviewVisibility(review, decision, ctx.premoderation);
  const base: ProductReview = { ...review, fromCollection: true, updatedAt: review.updatedAt };
  if (visibility === 'published') return base;
  if (ctx.viewerUid === null || review.uid !== ctx.viewerUid) return null;
  return visibility === 'rejected'
    ? { ...base, moderation: 'rejected', moderationReason: decision?.reason }
    : { ...base, moderation: 'pending' };
}

/** Reviews that count in the rating and the number of reviews: everything but the author's own hidden ones */
export const isPublicReview = (review: Pick<ProductReview, 'moderation'>) => !review.moderation;

/** The decisions of the `review_moderation` documents by review id */
export function decisionsById(list: readonly ReviewModeration[]): Map<string, ReviewModeration> {
  return new Map(list.map((d) => [d.id, d]));
}

// ---------------------------------------------------------------------------------------------------------------
// Who may review: only a really received order

/** A received order of this customer: delivered and not cancelled. Guest orders handed to the account count too */
export function isReceivedOrderOf(order: Pick<Order, 'status' | 'isCancelled' | 'customerUid'>, uid: string): boolean {
  return order.customerUid === uid && order.status === 'delivered' && !order.isCancelled;
}

/** The customer's received orders (newest first as given) that contain this product */
export function reviewableOrders(orders: readonly Order[], productId: string, uid: string): Order[] {
  return orders.filter((o) => isReceivedOrderOf(o, uid) && o.items.some((line) => line.product.id === productId));
}

/** The first line of the order with this product: the size and colour for the review's form */
export function orderLineOfProduct(order: Order, productId: string): Order['items'][number] | undefined {
  return order.items.find((line) => line.product.id === productId);
}

/** «Отзыв можно оставить после получения заказа с этим товаром» */
export const REVIEW_NEEDS_ORDER_TEXT = 'Отзыв можно оставить после получения заказа с этим товаром';

/** How the customer's own review stands, for the words under it */
export function moderationNote(review: Pick<ProductReview, 'moderation' | 'moderationReason'>): string | null {
  if (review.moderation === 'pending') return 'На проверке: отзыв увидят другие покупатели после проверки магазином';
  if (review.moderation === 'rejected') {
    const reason = review.moderationReason?.trim();
    return reason ? `Отзыв отклонён: ${reason}` : 'Отзыв отклонён';
  }
  return null;
}
