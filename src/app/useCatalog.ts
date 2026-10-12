import React, { useState } from 'react';
import type { Product, ReviewModeration, ReviewVote, StoredReview } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToCatalogIndex,
  subscribeToOwnReviews,
  subscribeToProducts,
  subscribeToReviewModeration,
  subscribeToReviewVotes,
  subscribeToReviews,
} from '../utils/firebaseSync';
import { canReadCatalogIndex, productFromEntry, readCatalogIndex, thumbKey, thumbKeysOf } from '../utils/catalogIndex';
import { liveProducts, setLiveProductsEnabled, useLiveProductsVersion } from '../utils/liveProducts';
import { liveReviews, setLiveReviewsEnabled, useLiveReviewsVersion } from '../utils/liveReviews';
import { setThumbKeys } from '../utils/productThumbs';
import { mergeProductReviews } from '../utils/reviews';
import { decisionsById } from '../utils/reviewModeration';
import { useCatalogIndexSync } from './useCatalogIndexSync';

/** The reviews read plus the viewer's own ones the open query does not give (hidden: waiting or rejected) */
function withOwnReviews(reviews: StoredReview[], own: StoredReview[]): StoredReview[] {
  if (own.length === 0) return reviews;
  const ids = new Set(reviews.map((r) => r.id));
  const missing = own.filter((r) => !ids.has(r.id));
  return missing.length > 0 ? [...reviews, ...missing] : reviews;
}

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
 * `reviewPremoderation` — «Проверять отзывы перед публикацией»: reviews the owner has not published are left out of
 * the rating and the product page (the author sees their own with «На проверке»; `src/utils/reviewModeration.ts`).
 */
export function useCatalog(onCatalog: (products: Product[]) => void, reviewPremoderation = false) {
  const { isAdmin, currentUser } = useAuth();
  // the owner's catalog (and so the index customers read) counts only reviews everybody sees; a customer — also their own
  const viewerUid = !isAdmin && currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const [indexFailed, setIndexFailed] = useState(() => !canReadCatalogIndex());
  const source: Source = isAdmin || indexFailed ? 'full' : 'index';
  const [loaded, setLoaded] = useState<{ source: Source; products: Product[] } | null>(null);
  // Reviews live in their own collections and are merged into the products for display
  const [storedReviews, setStoredReviews] = useState<StoredReview[]>([]);
  const [reviewVotes, setReviewVotes] = useState<ReviewVote[]>([]);
  const [reviewDecisions, setReviewDecisions] = useState<ReviewModeration[]>([]);
  // A customer reads only open reviews (owner's decision 12.10); their own — «На проверке», «Отклонён» — separately
  const [ownReviews, setOwnReviews] = useState<StoredReview[]>([]);
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
    if (!viewerUid) {
      setOwnReviews([]);
      return;
    }
    return subscribeToOwnReviews(viewerUid, setOwnReviews);
  }, [viewerUid]);

  React.useEffect(() => {
    if (source !== 'full') return;
    // the admin reads every review; a customer without the index — the open ones (the rules give nothing else)
    const unsubReviews = subscribeToReviews(setStoredReviews, undefined, undefined, !isAdmin);
    const unsubReviewVotes = subscribeToReviewVotes(setReviewVotes);
    // a refused read (rules not published yet) means no decisions
    const unsubDecisions = subscribeToReviewModeration(setReviewDecisions, undefined, () => setReviewDecisions([]));
    return () => {
      unsubReviews();
      unsubReviewVotes();
      unsubDecisions();
      setStoredReviews([]);
      setReviewVotes([]);
      setReviewDecisions([]);
    };
  }, [source, isAdmin]);

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
    if (loaded?.source !== 'index') {
      return mergeProductReviews(catalogProducts, withOwnReviews(storedReviews, ownReviews), reviewVotes, {
        decisions: decisionsById(reviewDecisions),
        premoderation: reviewPremoderation,
        viewerUid,
      });
    }
    const read = liveReviews();
    if (read.size === 0) return catalogProducts;
    return catalogProducts.map((p) => {
      const own = read.get(p.id);
      if (!own) return p;
      const { catalogRating: _line, ...product } = p;
      const mine = ownReviews.filter((r) => r.productId === p.id);
      return mergeProductReviews([product], withOwnReviews(own.reviews, mine), own.votes, {
        decisions: decisionsById(own.moderation),
        premoderation: reviewPremoderation,
        viewerUid,
      })[0];
    });
  }, [loaded?.source, catalogProducts, storedReviews, ownReviews, reviewVotes, reviewDecisions, reviewPremoderation, viewerUid, reviewsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const waitForCatalogIndex = useCatalogIndexSync(products, loaded?.source === 'full');

  // the full catalog (not index lines without photos and texts) — what whole-catalog admin writes need
  return {
    products,
    setProducts,
    productsLoaded: delivered,
    productsError,
    fullCatalog: delivered && loaded?.source === 'full',
    waitForCatalogIndex,
  };
}
