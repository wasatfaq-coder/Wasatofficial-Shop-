import React from 'react';
import type { Product } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  buildCatalogIndex,
  catalogIndexParts,
  readCatalogIndex,
  thumbKey,
  type CatalogEntry,
  type CatalogIndexPart,
} from '../utils/catalogIndex';
import {
  loadProductPreviews,
  saveCatalogIndex,
  saveProductThumbs,
  subscribeToCatalogIndex,
  type ProductThumb,
} from '../utils/firebaseSync';
import { compressBase64Image } from '../utils/imageUpload';

/** A card is ≈ 175 px wide on a phone: 360 px stays sharp on a dense screen */
const THUMB_SIDE = 360;
const THUMB_QUALITY = 0.6;
/** A miniature heavier than this (a photo the canvas could not read) is not worth writing: the card keeps the preview */
const THUMB_MAX_CHARS = 60_000;
/** Saving a product changes it in a few snapshots in a row: the index is written once they settle */
const SETTLE_MS = 2_000;
/** A failed subscription to the stored index is opened again after this long (audit 07.10, finding 15) */
const RESUBSCRIBE_MS = 60_000;
/** How long «Применить» waits for the index with the new prices before it says the catalog is behind */
const INDEX_WAIT_MS = 20_000;

/** Resolves true once the stored index matches a catalog newer than `after`; false — not within INDEX_WAIT_MS */
export type WaitForCatalogIndex = () => Promise<boolean>;

interface IndexWaiter {
  after: Product[];
  resolve: (synced: boolean) => void;
}

/**
 * The admin's session keeps the light catalog index and the product miniatures in step with the products
 * (docs/catalog-scale-plan.md, stage 2): after a product is saved, an order changed the stock or a review the rating.
 * Without Cloud Functions nobody else can write them; customers read them from stage 3. Nothing is written while the
 * stored index already matches.
 */
export function useCatalogIndexSync(products: Product[], productsLoaded: boolean): WaitForCatalogIndex {
  const { isAdmin } = useAuth();
  const [stored, setStored] = React.useState<{ parts: number; hash: string; entries: CatalogEntry[] } | null>(null);
  const [storedRead, setStoredRead] = React.useState(false);
  const running = React.useRef(false);
  // a subscription that ended with an error does not come back by itself: before, the index then stayed as it was
  // until the owner reloaded the page (the error is logged by subscribeToCatalogIndex)
  const [attempt, setAttempt] = React.useState(0);
  // «Применить» in «Курсы и наценка» waits for the index: customers see prices in the catalog from it, and a tab closed
  // right after the toast left the old prices there until the next admin visit (admin audit 09.10, finding 10)
  const productsRef = React.useRef(products);
  productsRef.current = products;
  const waiters = React.useRef<IndexWaiter[]>([]);

  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    let retry: number | undefined;
    const unsub = subscribeToCatalogIndex(
      async (parts: CatalogIndexPart[]) => {
        const index = await readCatalogIndex(parts).catch(() => null);
        if (!alive) return;
        setStored(index ? { parts: parts.length, ...index } : { parts: parts.length, hash: '', entries: [] });
        setStoredRead(true);
      },
      () => {
        if (!alive) return;
        setStoredRead(false);
        retry = window.setTimeout(() => setAttempt((n) => n + 1), RESUBSCRIBE_MS);
      }
    );
    return () => {
      alive = false;
      window.clearTimeout(retry);
      unsub();
      setStoredRead(false);
    };
  }, [isAdmin, attempt]);

  React.useEffect(() => {
    if (!isAdmin || !productsLoaded || !storedRead || !stored) return;
    const { entries, hash } = buildCatalogIndex(products);
    if (hash === stored.hash) {
      const done = waiters.current.filter((w) => w.after !== products);
      waiters.current = waiters.current.filter((w) => w.after === products);
      done.forEach((w) => w.resolve(true));
      return;
    }
    const timer = window.setTimeout(() => {
      if (running.current) return;
      running.current = true;
      void writeIndex(products, entries, hash, stored)
        .catch((err) => console.error('Catalog index was not saved:', err))
        .finally(() => {
          running.current = false;
        });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [isAdmin, productsLoaded, storedRead, stored, products]);

  return React.useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        const waiter: IndexWaiter = { after: productsRef.current, resolve };
        waiters.current.push(waiter);
        window.setTimeout(() => {
          if (!waiters.current.includes(waiter)) return;
          waiters.current = waiters.current.filter((w) => w !== waiter);
          resolve(false);
        }, INDEX_WAIT_MS);
      }),
    []
  );
}

/** Miniatures first (new photo or new product), then the index that points to them, then miniatures of removed products */
async function writeIndex(
  products: Product[],
  entries: CatalogEntry[],
  hash: string,
  stored: { parts: number; entries: CatalogEntry[] }
) {
  const storedThumbs = new Map(stored.entries.map((e) => [e.id, e.thumb ?? '']));
  const thumbs: ProductThumb[] = [];
  for (const product of products) {
    const key = thumbKey(product);
    if (!key || storedThumbs.get(product.id) === key) continue;
    // the first preview, from the product or from product_previews (stage 6)
    const first = product.images[0] || (await loadProductPreviews(product))?.images[0];
    if (!first) continue;
    const data = await compressBase64Image(first, THUMB_SIDE, THUMB_SIDE, THUMB_QUALITY);
    if (data.length <= THUMB_MAX_CHARS) thumbs.push({ productId: product.id, key, data });
  }
  const written = new Set(thumbs.map((t) => t.productId));
  // an entry points to a miniature only when there is one made from its current photo
  const indexed = entries.map((e) =>
    e.thumb && !written.has(e.id) && storedThumbs.get(e.id) !== e.thumb ? { ...e, thumb: undefined } : e
  );
  const ids = new Set(products.map((p) => p.id));
  const removed = stored.entries.filter((e) => e.thumb && !ids.has(e.id)).map((e) => e.id);
  await saveProductThumbs(thumbs);
  await saveCatalogIndex(await catalogIndexParts(indexed, hash), stored.parts);
  if (removed.length > 0) await saveProductThumbs([], removed);
}
