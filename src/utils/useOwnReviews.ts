import React from 'react';
import type { StoredReview } from '../types';
import { subscribeToOwnReviews } from './firebaseSync';

/**
 * The signed-in customer's own reviews by product id, read while `enabled` (the window of a received order is open):
 * «Оставить отзыв» turns into «Изменить отзыв» for a product already reviewed. Nothing is read otherwise.
 */
export function useOwnReviews(uid: string | null | undefined, enabled: boolean): ReadonlyMap<string, StoredReview> {
  const [byProduct, setByProduct] = React.useState<ReadonlyMap<string, StoredReview>>(() => new Map());
  React.useEffect(() => {
    if (!uid || !enabled) return;
    const unsubscribe = subscribeToOwnReviews(uid, (reviews) => setByProduct(new Map(reviews.map((r) => [r.productId, r]))));
    return () => {
      unsubscribe();
      setByProduct(new Map());
    };
  }, [uid, enabled]);
  return byProduct;
}
