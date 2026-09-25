import type { Product } from '../types';

/**
 * Rating from the product's real reviews only. The stored `rating` / `reviewsCount` fields
 * may hold template numbers (e.g. 4.9 and 42 without a single review), so they are not shown.
 * `null` means no reviews yet: the rating is hidden.
 */
export function getProductRating(product: Pick<Product, 'reviews'>): { rating: number; count: number } | null {
  const reviews = (product.reviews ?? []).filter((r) => typeof r.rating === 'number' && r.rating > 0);
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { rating: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
}

/** Numeric rating for sorting and filters: 0 without reviews */
export function productRatingValue(product: Pick<Product, 'reviews'>): number {
  return getProductRating(product)?.rating ?? 0;
}
