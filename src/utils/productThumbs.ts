import React from 'react';
import type { Product } from '../types';
import { loadProductThumbs } from './firebaseSync';
import { PRODUCT_IMAGE_PLACEHOLDER } from './productImage';

/**
 * Miniatures of catalog cards (docs/catalog-scale-plan.md, stage 3): `product_thumbs/{id}`, ≈ 17 КБ. A product from the
 * catalog index has no photo of its own; its card asks for the miniature when it is shown, so a visit reads only the
 * miniatures of the cards it showed (8 per «Показать ещё»). Requests of one render go in one query.
 */

/** Product id → the miniature's key from the index: only these products have a miniature to read */
const keys = new Map<string, string>();
const thumbs = new Map<string, string>();
const requested = new Set<string>();
const queue = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let flushing = false;
/** Failed loads in a row: the next try waits longer (5 s, 10 s, … up to a minute), so no request loop offline */
let failures = 0;
let retryTimer: number | undefined;
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

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
    failures = 0;
    for (const t of loaded) if (keys.has(t.productId)) thumbs.set(t.productId, t.data);
    if (loaded.length > 0) notify();
  } catch (err) {
    // the card keeps the placeholder for now: a little later the cards on screen ask again (finding 27; before, only a
    // card shown anew did)
    ids.forEach((id) => requested.delete(id));
    console.warn('Product miniatures were not loaded:', err);
    failures += 1;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(notify, Math.min(RETRY_FIRST_MS * 2 ** (failures - 1), RETRY_MAX_MS));
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
 * else '' — the placeholder
 */
export function useProductThumb(product: Pick<Product, 'id' | 'images'> | null | undefined): string {
  // the version too: a new photo (another key) and a retry after a failed load ask again while the card stays on
  // screen (finding 27); asking for a miniature already asked for does nothing
  const v = useThumbsVersion();
  const own = product?.images?.[0] ?? '';
  const id = product?.id ?? '';
  const hasThumb = keys.has(id);
  React.useEffect(() => {
    if (!own && hasThumb) requestThumbs([id]);
  }, [own, id, hasThumb, v]);
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
