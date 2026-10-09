import React, { useState } from 'react';
import type { Product, ReviewVote, StoredReview } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToCatalogIndex,
  subscribeToProducts,
  subscribeToReviewVotes,
  subscribeToReviews,
} from '../utils/firebaseSync';
import { canReadCatalogIndex, productFromEntry, readCatalogIndex, thumbKey, thumbKeysOf } from '../utils/catalogIndex';
import { liveProducts, setLiveProductsEnabled, useLiveProductsVersion } from '../utils/liveProducts';
import { liveReviews, setLiveReviewsEnabled, useLiveReviewsVersion } from '../utils/liveReviews';
import { setThumbKeys } from '../utils/productThumbs';
import { mergeProductReviews } from '../utils/reviews';
import { useCatalogIndexSync } from './useCatalogIndexSync';

/** Where the catalog comes from: the light index (customers, stage 3 of docs/catalog-scale-plan.md) or every product */
type Source = 'index' | 'full';

/**
 * The catalog from Firestore (no demo data meanwhile) with the reviews and «Полезно» votes of their own collections
 * merged in for display. `onCatalog` gets every catalog snapshot: App refreshes the cart and the open product from it.
 *
 * A customer reads the light index (one document for hundreds of products) and the full documents of only the
 * products a screen shows (`useLiveProducts`). The admin reads every product: the panel edits them, and its session
 * keeps the index in step (`useCatalogIndexSync`). No index yet, a broken one or a browser without gzip — every
 * product, as before. Reviews and votes the same way: from the index the cards take the rating of their line, and only
 * the open product page reads its reviews (`useLiveReviews`, stage 4); the whole catalog comes with every review.
 */
export function useCatalog(onCatalog: (products: Product[]) => void) {
  const { isAdmin } = useAuth();
  const [indexFailed, setIndexFailed] = useState(() => !canReadCatalogIndex());
  const source: Source = isAdmin || indexFailed ? 'full' : 'index';
  const [loaded, setLoaded] = useState<{ source: Source; products: Product[] } | null>(null);
  // Reviews live in their own collections and are merged into the products for display
  const [storedReviews, setStoredReviews] = useState<StoredReview[]>([]);
  const [reviewVotes, setReviewVotes] = useState<ReviewVote[]>([]);
  // The catalog subscription failed (rules, network): the screens say so instead of «Товары появятся здесь»
  const [productsError, setProductsError] = useState(false);
  const liveVersion = useLiveProductsVersion();
  const reviewsVersion = useLiveReviewsVersion();

  React.useEffect(() => {
    setLiveProductsEnabled(source === 'index');
    setLiveReviewsEnabled(source === 'index');
    if (source === 'full') {
      return subscribeToProducts((products) => {
        // products keep no previews inside (stage 6): the lists show their miniatures, as the customer's cards do
        setThumbKeys(new Map(products.flatMap((p) => (thumbKey(p) ? [[p.id, thumbKey(p)] as [string, string]] : []))));
        setLoaded({ source, products });
        setProductsError(false);
      }, () => setProductsError(true));
    }
    let alive = true;
    // unpacking is async: a later snapshot that unpacked sooner is not overwritten by an earlier one
    let latest = 0;
    const unsub = subscribeToCatalogIndex(
      async (parts) => {
        const seq = ++latest;
        const index = parts.length > 0 ? await readCatalogIndex(parts).catch(() => null) : null;
        if (!alive || seq !== latest) return;
        if (!index) {
          // no index (an empty shop, or the owner has not opened the site since stage 2) or a broken one
          if (parts.length > 0) console.warn('Catalog index is unreadable: reading every product');
          setIndexFailed(true);
          return;
        }
        setThumbKeys(thumbKeysOf(index.entries));
        setLoaded({ source, products: index.entries.map(productFromEntry) });
        setProductsError(false);
      },
      () => {
        if (alive) setIndexFailed(true);
      }
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [source]);

  React.useEffect(() => {
    if (source !== 'full') return;
    const unsubReviews = subscribeToReviews(setStoredReviews);
    const unsubReviewVotes = subscribeToReviewVotes(setReviewVotes);
    return () => {
      unsubReviews();
      unsubReviewVotes();
      setStoredReviews([]);
      setReviewVotes([]);
    };
  }, [source]);

  // Index lines give way to the documents a screen reads; a product whose document is gone leaves the catalog
  const catalogProducts = React.useMemo(() => {
    if (!loaded) return [];
    if (loaded.source === 'full') return loaded.products;
    const docs = liveProducts();
    if (docs.size === 0) return loaded.products;
    return loaded.products.flatMap((p) => {
      if (!docs.has(p.id)) return [p];
      const full = docs.get(p.id);
      // the document has no rating of its own: until its reviews are read, the line's stands
      return full ? [{ ...full, catalogRating: p.catalogRating }] : [];
    });
  }, [loaded, liveVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const products = React.useMemo(() => {
    if (loaded?.source !== 'index') return mergeProductReviews(catalogProducts, storedReviews, reviewVotes);
    const read = liveReviews();
    if (read.size === 0) return catalogProducts;
    return catalogProducts.map((p) => {
      const own = read.get(p.id);
      if (!own) return p;
      const { catalogRating: _line, ...product } = p;
      return mergeProductReviews([product], own.reviews, own.votes)[0];
    });
  }, [loaded?.source, catalogProducts, storedReviews, reviewVotes, reviewsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // The latest callback is read when the catalog changes. The catalog counts as loaded only once App has it: the open
  // product is restored from it in the same render, so a link is not taken for a product that is gone
  const onCatalogRef = React.useRef(onCatalog);
  onCatalogRef.current = onCatalog;
  const [delivered, setDelivered] = useState(false);
  React.useEffect(() => {
    if (!loaded) return;
    onCatalogRef.current(catalogProducts);
    setDelivered(true);
  }, [loaded, catalogProducts]);

  const setProducts = React.useCallback((next: React.SetStateAction<Product[]>) => {
    setLoaded((prev) => {
      const current = prev?.products ?? [];
      return { source: prev?.source ?? 'full', products: typeof next === 'function' ? next(current) : next };
    });
  }, []);

  // the admin's session writes the light index customers read (docs/catalog-scale-plan.md, stage 2); never from
  // index lines — they have no photos, and the index made of them would lose its miniatures
  useCatalogIndexSync(products, loaded?.source === 'full');

  // the full catalog (not index lines without photos and texts) — what whole-catalog admin writes need
  return { products, setProducts, productsLoaded: delivered, productsError, fullCatalog: delivered && loaded?.source === 'full' };
}
