import { useCallback, useEffect, useState } from 'react';
import type { Product } from '../types';
import { loadProductPhotos, loadProductPreviews } from './firebaseSync';
import { previewsMoved, withProductPreviews, type ProductPreviewsDoc } from './productPreviews';

type PhotoSource = Pick<Product, 'id' | 'images' | 'photoIds' | 'previewKey'>;

/**
 * The previews of a product shown whole (docs/catalog-scale-plan.md, stage 6): from the product, or read from
 * `product_previews` while it is shown; '' meanwhile
 */
export function useProductPreviews(product: PhotoSource | null | undefined): string[] {
  const [read, setRead] = useState<{ key: string; doc: ProductPreviewsDoc | null } | null>(null);
  const key = product && previewsMoved(product) ? `${product.id}:${product.previewKey}` : '';
  useEffect(() => {
    if (!key || !product) return;
    let alive = true;
    void loadProductPreviews(product).then((doc) => alive && setRead({ key, doc }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const images = product?.images ?? [];
  return key && read?.key === key ? withProductPreviews({ images }, read.doc).images : images;
}

/**
 * Full photos of a product for its page and the zoom (stage 6 of the audit 02.10): the previews at once, a full photo
 * replaces its preview when it arrives from `product_photos`. Only the photos that are shown are read
 * (docs/catalog-scale-plan.md, stage 4): the slide on screen (`shownIndex`) and those `show(i)` asks for — a full photo
 * is ≈ 250 КБ, and most visitors never swipe to the last one.
 */
export function useProductPhotos(
  product: PhotoSource | null | undefined,
  shownIndex = 0
): { photos: string[]; show: (index: number) => void } {
  const previews = useProductPreviews(product);
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
