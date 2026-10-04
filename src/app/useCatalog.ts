import React, { useState } from 'react';
import type { Product, ReviewVote, StoredReview } from '../types';
import { subscribeToProducts, subscribeToReviewVotes, subscribeToReviews } from '../utils/firebaseSync';
import { mergeProductReviews } from '../utils/reviews';
import { useCatalogIndexSync } from './useCatalogIndexSync';

/**
 * The catalog from Firestore (no demo data meanwhile) with the reviews and «Полезно» votes of their own collections
 * merged in for display. `onCatalog` gets every catalog snapshot: App refreshes the cart and the open product from it.
 */
export function useCatalog(onCatalog: (products: Product[]) => void) {
  const [catalogProducts, setProducts] = useState<Product[]>([]);
  // Reviews live in their own collections and are merged into the products for display
  const [storedReviews, setStoredReviews] = useState<StoredReview[]>([]);
  const [reviewVotes, setReviewVotes] = useState<ReviewVote[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  // The catalog subscription failed (rules, network): the screens say so instead of «Товары появятся здесь»
  const [productsError, setProductsError] = useState(false);
  const products = React.useMemo(
    () => mergeProductReviews(catalogProducts, storedReviews, reviewVotes),
    [catalogProducts, storedReviews, reviewVotes]
  );

  // The subscription starts once; the latest callback is read when a snapshot comes
  const onCatalogRef = React.useRef(onCatalog);
  onCatalogRef.current = onCatalog;
  React.useEffect(() => {
    const unsubProds = subscribeToProducts((loadedProds) => {
      setProducts(loadedProds);
      setProductsLoaded(true);
      onCatalogRef.current(loadedProds);
      setProductsError(false);
    }, () => setProductsError(true));
    const unsubReviews = subscribeToReviews(setStoredReviews);
    const unsubReviewVotes = subscribeToReviewVotes(setReviewVotes);
    return () => {
      unsubProds();
      unsubReviews();
      unsubReviewVotes();
    };
  }, []);

  // the admin's session writes the light index customers will read (docs/catalog-scale-plan.md, stage 2)
  useCatalogIndexSync(products, productsLoaded);

  return { products, setProducts, productsLoaded, productsError };
}
