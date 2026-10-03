import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { loadProductPhotos } from './firebaseSync';

/**
 * Full photos of a product for its page and the zoom (stage 6): the previews from the catalog at once, each full photo
 * replaces its preview when it arrives from `product_photos`.
 */
export function useProductPhotos(product: Pick<Product, 'id' | 'images' | 'photoIds'> | null | undefined): string[] {
  const previews = product?.images ?? [];
  const ids = product?.photoIds ?? [];
  const key = ids.join('|');
  const [full, setFull] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ids.some(Boolean)) return;
    let alive = true;
    loadProductPhotos(ids).then((loaded) => alive && setFull(loaded));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return previews.map((src, i) => (ids[i] && full[ids[i]]) || src);
}
