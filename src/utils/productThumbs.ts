import React from 'react';
import type { Product } from '../types';
import { loadProductThumbs } from './firebaseSync';
import { PRODUCT_IMAGE_PLACEHOLDER } from './productImage';
import { whenReadsSettle } from './pendingReads';

/**
 * Miniatures of catalog cards (docs/catalog-scale-plan.md, stage 3): `product_thumbs/{id}`, ≈ 17 КБ. A product from the
 * catalog index has no photo of its own; its card asks for the miniature when it is shown, so a visit reads only the
 * miniatures of the cards it showed (8 per «Показать ещё»). Requests of one render go in one query. Cards off the screen
 * ask after the screen's own photos have come (docs/performance-plan.md, stage 2): on a slow phone the 8 miniatures of
 * «Популярное» in one query (≈ 136 КБ) came all at once, while only two cards are on the screen.
 */

/** Product id → the miniature's key from the index: only these products have a miniature to read */
const keys = new Map<string, string>();
const thumbs = new Map<string, string>();
const requested = new Set<string>();
const queue = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let flushing = false;

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

/** The index came: which products have a miniature; a new photo (another key) is read again */
export function setThumbKeys(next: Map<string, string>) {
  let changed = false;
  for (const [id, key] of keys) {
    if (next.get(id) === key) continue;
    keys.delete(id);
    requested.delete(id);
    changed = thumbs.delete(id) || changed;
  }
  for (const [id, key] of next) {
    if (keys.has(id)) continue;
    keys.set(id, key);
    changed = true;
  }
  if (changed) notify();
}

/** Cards below the screen: asked for once the screen's own reads are done */
const later = new Set<string>();
let laterScheduled = false;

export function requestThumbsLater(ids: string[]) {
  for (const id of ids) if (keys.has(id) && !requested.has(id)) later.add(id);
  if (later.size === 0 || laterScheduled) return;
  laterScheduled = true;
  void whenReadsSettle(300).then(() => {
    laterScheduled = false;
    const ids = [...later];
    later.clear();
    requestThumbs(ids);
  });
}

export function requestThumbs(ids: string[]) {
  for (const id of ids) {
    if (keys.has(id) && !requested.has(id)) {
      requested.add(id);
      queue.add(id);
    }
  }
  if (queue.size > 0 && !flushing) {
    flushing = true;
    // the cards of one page mount in one render: their ids go in one query
    window.setTimeout(() => void flush(), 0);
  }
}

async function flush() {
  const ids = [...queue];
  queue.clear();
  try {
    const loaded = await loadProductThumbs(ids);
    for (const t of loaded) if (keys.has(t.productId)) thumbs.set(t.productId, t.data);
    if (loaded.length > 0) notify();
  } catch (err) {
    // the card keeps the placeholder; the next time it is shown it asks again
    ids.forEach((id) => requested.delete(id));
    console.warn('Product miniatures were not loaded:', err);
  } finally {
    flushing = false;
    if (queue.size > 0) requestThumbs([]);
  }
}

export const thumbOf = (productId: string) => thumbs.get(productId);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when miniatures come; the value is a version number */
export const useThumbsVersion = () => React.useSyncExternalStore(subscribe, () => version);

/**
 * The photo a card shows: the product's own first photo, else its miniature (asked for while the card is shown),
 * else '' — the placeholder. `onScreen`: true — asked for at once; false — after the screen's own photos; null — not
 * known yet (the card has not been laid out), nothing is asked for
 */
export function useProductThumb(product: Pick<Product, 'id' | 'images'> | null | undefined, onScreen: boolean | null = true): string {
  useThumbsVersion();
  const own = product?.images?.[0] ?? '';
  const id = product?.id ?? '';
  const hasThumb = keys.has(id);
  React.useEffect(() => {
    if (own || !hasThumb || onScreen === null) return;
    if (onScreen) requestThumbs([id]);
    else requestThumbsLater([id]);
  }, [own, id, hasThumb, onScreen]);
  return own || (id ? thumbOf(id) ?? '' : '');
}

/** The same for a list (search results, recently viewed, order lines): `photoOf(product)` — its photo or '' */
export function useProductThumbs(products: Pick<Product, 'id' | 'images'>[]): (product: Pick<Product, 'id' | 'images'>) => string {
  const v = useThumbsVersion();
  const wanted = products.filter((p) => !p.images?.[0] && keys.has(p.id)).map((p) => p.id).join('|');
  React.useEffect(() => {
    if (wanted) requestThumbs(wanted.split('|'));
  }, [wanted, v]);
  return (product) => product.images?.[0] || thumbOf(product.id) || '';
}

/**
 * Photos of order lines — only from the catalog (orderLineImage: a link in the order is written by the visitor): the
 * catalog product's photo, or its miniature for a product from the index, else the placeholder
 */
export function useOrderLinePhotos(lines: Pick<Product, 'id'>[], catalog: Product[]): (line: Pick<Product, 'id'>) => string {
  const key = [...new Set(lines.map((l) => l?.id))].sort().join('|');
  const shown = React.useMemo(() => {
    const ids = new Set(key.split('|'));
    return catalog.filter((p) => ids.has(p.id));
  }, [key, catalog]);
  const photoOf = useProductThumbs(shown);
  return (line) => {
    const product = shown.find((p) => p.id === line?.id);
    return (product && photoOf(product)) || PRODUCT_IMAGE_PLACEHOLDER;
  };
}
