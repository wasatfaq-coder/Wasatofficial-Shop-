import React from 'react';
import type { Product } from '../types';
import { subscribeToProductDoc } from './firebaseSync';

/**
 * Full product documents where the customer needs them (docs/catalog-scale-plan.md, stage 3). The catalog comes from
 * the light index; the product page, the quick view, the variant picker, the cart and the checkout ask for the products
 * they show, and `useCatalog` puts these documents in place of the index lines: photos, card sections and the stock
 * as it is in the database (the index lags until the owner's session updates it).
 * While the catalog is read whole (the admin, or no index yet) nothing is read here.
 */

/** A document nobody shows is still listened to for this long */
const KEEP_MS = 10_000;

const docs = new Map<string, Product | null>();
const counts = new Map<string, number>();
const unsubs = new Map<string, () => void>();
const listeners = new Set<() => void>();
let enabled = false;
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

function start(id: string) {
  if (unsubs.has(id)) return;
  unsubs.set(
    id,
    subscribeToProductDoc(id, (product) => {
      docs.set(id, product);
      notify();
    })
  );
}

function stop(id: string) {
  unsubs.get(id)?.();
  unsubs.delete(id);
  // a product that is not shown any more goes back to its index line
  if (docs.delete(id)) notify();
}

/** `useCatalog`: the catalog comes from the index (true) or whole (false — no documents needed) */
export function setLiveProductsEnabled(on: boolean) {
  if (enabled === on) return;
  enabled = on;
  for (const [id, n] of counts) if (n > 0) (on ? start : stop)(id);
}

/** The documents read so far: a product, or null when it is gone */
export const liveProducts = () => docs;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useLiveProductsVersion = () => React.useSyncExternalStore(subscribe, () => version);

/** Keeps the documents of these products read while the component is shown */
export function useLiveProducts(ids: (string | null | undefined)[]) {
  const key = [...new Set(ids.filter((id): id is string => !!id))].sort().join('|');
  React.useEffect(() => {
    if (!key) return;
    const list = key.split('|');
    for (const id of list) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (enabled) start(id);
    }
    return () => {
      for (const id of list) {
        const n = (counts.get(id) ?? 1) - 1;
        if (n > 0) {
          counts.set(id, n);
          continue;
        }
        counts.delete(id);
        // from the product page to the cart the same product is shown again: no second read for that
        window.setTimeout(() => {
          if (!counts.has(id)) stop(id);
        }, KEEP_MS);
      }
    };
  }, [key]);
}

/**
 * A window that keeps its own copy of a product (quick view, variant picker): the product's document once it is read,
 * with the reviews the copy had (they come from their own collection)
 */
export function useLiveProduct<T extends Product | null>(product: T): T {
  useLiveProducts([product?.id]);
  useLiveProductsVersion();
  const live = product ? docs.get(product.id) : undefined;
  return React.useMemo(() => (live && product ? { ...live, reviews: product.reviews } : product), [live, product]) as T;
}
