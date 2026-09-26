import type { Product } from '../types';

// A neutral hanger on the card background: a product without photos never gets a stock photo
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">' +
  '<rect width="120" height="150" fill="#D8DFE8"/>' +
  '<path d="M60 58a7 7 0 1 1 7-7M60 58v6L30 86h60L60 64" fill="none" stroke="#8795A8" stroke-width="3" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const PRODUCT_IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/** Photo `index` of a product, its first photo, or the neutral placeholder */
export function productImage(product: Pick<Product, 'images'> | null | undefined, index = 0): string {
  return product?.images?.[index] || product?.images?.[0] || PRODUCT_IMAGE_PLACEHOLDER;
}
