import type { Product, ProductReview, ReviewVote, StoredReview } from '../types';
import { viewReview, type ReviewViewContext } from './reviewModeration';

/** One review per customer and product: the document id is fixed */
export function reviewDocId(productId: string, uid: string): string {
  return `${productId}_${uid}`;
}

/** One «Полезно» vote per person and review */
export function reviewVoteDocId(reviewId: string, uid: string): string {
  return `${reviewId}_${uid}`;
}

/** Product as stored in Firestore: without merged-in reviews of the `reviews` collection and votes */
export function withoutCollectionReviews<T extends Pick<Product, 'reviews'>>(product: T): T {
  if (!product.reviews?.some((r) => r.fromCollection || r.voterUids)) return product;
  return {
    ...product,
    reviews: product.reviews
      .filter((r) => !r.fromCollection)
      .map(({ voterUids: _voters, ...review }) => review),
  };
}

/** «Полезно» count: the number stored with an older review plus the votes */
export function helpfulCount(review: ProductReview): number {
  return (review.helpfulCount ?? 0) + (review.voterUids?.length ?? 0);
}

/**
 * Products with the reviews of the `reviews` collection (newest first) followed by the reviews
 * stored inside the product before the collection existed; «Полезно» counts come from `review_votes`.
 * `view` — the owner's decisions (`review_moderation`): a review the viewer must not see is left out, the author's own
 * hidden one comes with `moderation` set; without it every review is shown.
 */
export function mergeProductReviews(
  products: Product[],
  reviews: StoredReview[],
  votes: ReviewVote[],
  view?: ReviewViewContext
): Product[] {
  if (reviews.length === 0 && votes.length === 0) return products;

  const votersByReview = new Map<string, string[]>();
  for (const vote of votes) {
    const list = votersByReview.get(vote.reviewId) ?? [];
    list.push(vote.uid);
    votersByReview.set(vote.reviewId, list);
  }
  const reviewsByProduct = new Map<string, StoredReview[]>();
  for (const review of reviews) {
    const list = reviewsByProduct.get(review.productId) ?? [];
    list.push(review);
    reviewsByProduct.set(review.productId, list);
  }

  const withVotes = (review: ProductReview): ProductReview => {
    const voters = votersByReview.get(review.id);
    return voters ? { ...review, voterUids: voters } : review;
  };

  return products.map((product) => {
    const stripped = withoutCollectionReviews(product);
    const legacy = stripped.reviews ?? [];
    const fresh = [...(reviewsByProduct.get(product.id) ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((r): ProductReview[] => {
        if (!view) return [{ ...r, fromCollection: true }];
        const shown = viewReview(r, view);
        return shown ? [shown] : [];
      });
    if (fresh.length === 0 && !legacy.some((r) => votersByReview.has(r.id))) {
      return stripped;
    }
    return { ...product, reviews: [...fresh, ...legacy].map(withVotes) };
  });
}
