import type { Product } from '../types';
import { shortHash } from './catalogIndex';

/**
 * Photo previews out of the product documents (docs/catalog-scale-plan.md, stage 6). A product kept its previews inside
 * (`images`, ≈ 45 КБ each): the owner's panel read every product with them (≈ 50 МБ at 300 products), the cart and the
 * checkout the products in the cart. Now the data: photos of `images` live in `product_previews/{productId}` (same
 * order, '' where the product keeps a link), the product keeps '' in their place and `previewKey` — a hash of the
 * previews, so changed ones are read again. Cards and lists show the miniature (`product_thumbs`); the product page,
 * the quick view and the product form read the previews.
 */

export interface ProductPreviewsDoc {
  productId: string;
  images: string[];
}

const isPreviewData = (src: string) => src.startsWith('data:image/');

/** The product's previews are in `product_previews` (some `images` are '' in their place) */
export const previewsMoved = (product: Pick<Product, 'images' | 'previewKey'>) =>
  Boolean(product.previewKey) && (product.images ?? []).some((src) => src === '');

/** A product with a data: photo still inside (saved before stage 6, or a form with its previews in place) */
export const hasInlinePreviews = (product: Pick<Product, 'images'>) => (product.images ?? []).some(isPreviewData);

/**
 * What the product document keeps and the previews document to write (null — nothing inside to move). A product
 * whose previews are only partly in place (a photo added before the others were read) is refused: writing it would
 * lose the previews that were not read.
 */
export function splitProductPreviews(product: Product): { stored: Product; previews: ProductPreviewsDoc | null } {
  const images = product.images ?? [];
  if (!images.some(isPreviewData)) return { stored: product, previews: null };
  if (previewsMoved(product)) {
    throw new Error(`Превью товара ${product.id} ещё не загрузились: сохраните товар ещё раз`);
  }
  const previews = images.map((src) => (isPreviewData(src) ? src : ''));
  return {
    stored: { ...product, images: images.map((src) => (isPreviewData(src) ? '' : src)), previewKey: shortHash(previews.join('|')) },
    previews: { productId: product.id, images: previews },
  };
}

/** The product with its previews back in place */
export function withProductPreviews<T extends Pick<Product, 'images'>>(product: T, doc: ProductPreviewsDoc | null | undefined): T {
  if (!doc) return product;
  return { ...product, images: (product.images ?? []).map((src, i) => src || doc.images[i] || '') };
}
