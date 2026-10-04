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
import { saveCatalogIndex, saveProductThumbs, subscribeToCatalogIndex, type ProductThumb } from '../utils/firebaseSync';
import { compressBase64Image } from '../utils/imageUpload';

/** A card is ≈ 175 px wide on a phone: 360 px stays sharp on a dense screen */
const THUMB_SIDE = 360;
const THUMB_QUALITY = 0.6;
/** A miniature heavier than this (a photo the canvas could not read) is not worth writing: the card keeps the preview */
const THUMB_MAX_CHARS = 60_000;
/** Saving a product changes it in a few snapshots in a row: the index is written once they settle */
const SETTLE_MS = 2_000;

/**
 * The admin's session keeps the light catalog index and the product miniatures in step with the products
 * (docs/catalog-scale-plan.md, stage 2): after a product is saved, an order changed the stock or a review the rating.
 * Without Cloud Functions nobody else can write them; customers read them from stage 3. Nothing is written while the
 * stored index already matches.
 */
export function useCatalogIndexSync(products: Product[], productsLoaded: boolean) {
  const { isAdmin } = useAuth();
  const [stored, setStored] = React.useState<{ parts: number; hash: string; entries: CatalogEntry[] } | null>(null);
  const [storedRead, setStoredRead] = React.useState(false);
  const running = React.useRef(false);

  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const unsub = subscribeToCatalogIndex(async (parts: CatalogIndexPart[]) => {
      const index = await readCatalogIndex(parts).catch(() => null);
      if (!alive) return;
      setStored(index ? { parts: parts.length, ...index } : { parts: parts.length, hash: '', entries: [] });
      setStoredRead(true);
    });
    return () => {
      alive = false;
      unsub();
      setStoredRead(false);
    };
  }, [isAdmin]);

  React.useEffect(() => {
    if (!isAdmin || !productsLoaded || !storedRead || !stored) return;
    const { entries, hash } = buildCatalogIndex(products);
    if (hash === stored.hash) return;
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
    const data = await compressBase64Image(product.images[0], THUMB_SIDE, THUMB_SIDE, THUMB_QUALITY);
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
