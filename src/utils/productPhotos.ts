import type { Product } from '../types';
import { compressBase64Image } from './imageUpload';

/**
 * Фото товара без Storage (аудит 02.10, этап 6, находка 18): в документе товара — лёгкие превью (`images`) для карточек,
 * корзины и списков, полные фото — документы `product_photos/{id}`, их id — в `photoIds` (тот же порядок, '' — у
 * ссылки на фото и у маленького фото, которое и так лёгкое). Каталог скачивает только превью; страница товара читает
 * свои полные фото по требованию (`useProductPhotos`).
 */

/** A photo inside a product heavier than this is moved out and replaced by a preview */
export const PHOTO_SPLIT_MIN_CHARS = 80_000;
/** The preview: enough for a card on a phone screen with a dense display */
const PREVIEW_MAX_SIDE = 480;
const PREVIEW_QUALITY = 0.7;

export interface PhotoDoc {
  id: string;
  productId: string;
  data: string;
}

export const isHeavyPhoto = (src: string) => src.startsWith('data:image/') && src.length > PHOTO_SPLIT_MIN_CHARS;

export const newPhotoId = (productId: string) =>
  `${productId}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The preview of a full photo (browser only: a canvas) */
export const makePhotoPreview = (dataUrl: string) => compressBase64Image(dataUrl, PREVIEW_MAX_SIDE, PREVIEW_MAX_SIDE, PREVIEW_QUALITY);

/** A product with photos still inside (before the move or saved by an older version of the site) */
export function hasHeavyPhotos(product: Pick<Product, 'images' | 'photoIds'>): boolean {
  return (product.images ?? []).some((src, i) => isHeavyPhoto(src) && !product.photoIds?.[i]);
}

/**
 * What the product keeps and which photo documents to write. `known` maps a preview already stored in the product to
 * its photo id (the form shows previews; a photo that stayed keeps its document). A new heavy photo gets a document
 * and a preview; a link or a light photo stays as it is.
 */
export async function splitProductPhotos(
  productId: string,
  images: string[],
  known: Map<string, string>
): Promise<{ images: string[]; photoIds: string[]; newPhotos: PhotoDoc[] }> {
  const out: string[] = [];
  const ids: string[] = [];
  const newPhotos: PhotoDoc[] = [];
  for (const src of images) {
    const keptId = known.get(src);
    if (keptId) {
      out.push(src);
      ids.push(keptId);
    } else if (isHeavyPhoto(src)) {
      const id = newPhotoId(productId);
      newPhotos.push({ id, productId, data: src });
      out.push(await makePhotoPreview(src));
      ids.push(id);
    } else {
      out.push(src);
      ids.push('');
    }
  }
  return { images: out, photoIds: ids, newPhotos };
}

/** Photo ids of the product that the new version no longer uses (their documents are deleted after the save) */
export function droppedPhotoIds(before: Pick<Product, 'photoIds'> | undefined, after: string[]): string[] {
  const kept = new Set(after.filter(Boolean));
  return (before?.photoIds ?? []).filter((id) => id && !kept.has(id));
}

/**
 * Photo documents of a copy of a product: every full photo that was read gets its own document under the copy's id, so
 * removing a photo from the copy or the original never deletes the other's. A photo that was not read stays a preview
 * in the copy (id '').
 */
export function copyProductPhotos(
  productId: string,
  photoIds: string[] | undefined,
  fullPhotos: Record<string, string>
): { photoIds: string[]; newPhotos: PhotoDoc[] } {
  const newPhotos: PhotoDoc[] = [];
  const ids = (photoIds ?? []).map((id) => {
    const data = id ? fullPhotos[id] : undefined;
    if (!data) return '';
    const copyId = newPhotoId(productId);
    newPhotos.push({ id: copyId, productId, data });
    return copyId;
  });
  return { photoIds: ids, newPhotos };
}

/** Of these photo ids, the ones no product uses (a copy made before 04.10.2026 shares documents with its original) */
export function unusedPhotoIds(ids: string[], products: Pick<Product, 'photoIds'>[]): string[] {
  const used = new Set(products.flatMap((p) => p.photoIds ?? []));
  return [...new Set(ids.filter((id) => id && !used.has(id)))];
}

/** Photo documents of the products removed between two versions of the catalog (deleted after the products) */
export function removedProductPhotoIds(before: Pick<Product, 'id' | 'photoIds'>[], after: Pick<Product, 'id' | 'photoIds'>[]): string[] {
  const kept = new Set(after.map((p) => p.id));
  const removed = before.filter((p) => !kept.has(p.id)).flatMap((p) => p.photoIds ?? []);
  return unusedPhotoIds(removed, after);
}

/** The stored size of a heavy photo is counted as its preview's (≈ 45 КБ): the full one lives in its own document */
export function storedImagesEstimate(images: string[]): string[] {
  return images.map((src) => (isHeavyPhoto(src) ? 'x'.repeat(45_000) : src));
}
