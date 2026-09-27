import type { Product } from '../types';
import { getOrderableStock, getVariantStock } from './inventory';

/**
 * Choosing a variant before «В корзину». A size is never preselected unless there is only one:
 * a default size put a wrong item in the cart when the customer did not notice it.
 * getProductSKU falls back to the first size for an empty one, so check `size` before asking for stock.
 */

/** Preselected size: only when the product has exactly one */
export function initialSize(product: Pick<Product, 'sizes'> | null | undefined): string {
  return product?.sizes?.length === 1 ? product.sizes[0] : '';
}

/** Units of one colour across all its sizes: stock shown before a size is chosen */
export function colorStock(product: Product, color: string): number {
  return (product.sizes ?? []).reduce((sum, size) => sum + getVariantStock(product, color, size), 0);
}

/** Most units orderable in any size of the colour: the quantity limit before a size is chosen */
export function maxOrderableForColor(product: Product, color: string, preorderMode: boolean): number {
  return Math.max(0, ...(product.sizes ?? []).map((size) => getOrderableStock(product, color, size, preorderMode)));
}

/** Several sizes or colours: the «+» on a card asks which one instead of adding the first */
export function needsVariantChoice(product: Pick<Product, 'sizes' | 'colors'>): boolean {
  return (product.sizes?.length ?? 0) > 1 || (product.colors?.length ?? 0) > 1;
}

/** Any colour and size can be put in the cart (stock, or a preorder when it is on) */
export function hasOrderableVariant(product: Product, preorderMode: boolean): boolean {
  const colors = product.colors?.length ? product.colors.map((c) => c.name) : [''];
  return colors.some((color) => maxOrderableForColor(product, color, preorderMode) > 0);
}

/** First colour that has something to order, so the picker does not open on a sold-out colour */
export function initialColor(product: Product, preorderMode: boolean): string {
  const colors = product.colors ?? [];
  return (colors.find((c) => maxOrderableForColor(product, c.name, preorderMode) > 0) ?? colors[0])?.name ?? '';
}
