import { useCallback, useEffect, useState } from 'react';
import type { Product } from '../types';
import { loadProductPhotos } from './firebaseSync';

/**
 * Full photos of a product for its page and the zoom (stage 6 of the audit 02.10): the previews from the catalog at once,
 * a full photo replaces its preview when it arrives from `product_photos`. Only the photos that are shown are read
 * (docs/catalog-scale-plan.md, stage 4): the slide on screen (`shownIndex`) and those `show(i)` asks for — a full photo
 * is ≈ 250 КБ, and most visitors never swipe to the last one.
 */
export function useProductPhotos(
  product: Pick<Product, 'id' | 'images' | 'photoIds'> | null | undefined,
  shownIndex = 0
): { photos: string[]; show: (index: number) => void } {
  const previews = product?.images ?? [];
  const ids = product?.photoIds ?? [];
  const [full, setFull] = useState<Record<string, string>>({});
  const [wanted, setWanted] = useState<string[]>([]);
  const shownId = ids[shownIndex] ?? '';
  const key = ids.join('|');

  // another product (or its photos changed): start from the slide on screen
  useEffect(() => setWanted([]), [key]);

  const show = useCallback(
    (index: number) => {
      const id = key ? key.split('|')[index] : undefined;
      if (id) setWanted((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [key]
  );

  const load = [shownId, ...wanted].filter(Boolean).join('|');
  useEffect(() => {
    if (!load) return;
    let alive = true;
    loadProductPhotos(load.split('|')).then((loaded) => alive && setFull((prev) => ({ ...prev, ...loaded })));
    return () => {
      alive = false;
    };
  }, [load]);

  return { photos: previews.map((src, i) => (ids[i] && full[ids[i]]) || src), show };
}
