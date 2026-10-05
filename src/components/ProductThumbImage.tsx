import React from 'react';
import type { Product } from '../types';
import { productImage } from '../utils/productImage';
import { useProductThumb } from '../utils/productThumbs';

/**
 * A product's small picture in a list (cart, checkout, admin lists): its own first photo, else its miniature from
 * `product_thumbs` — products keep no previews inside (docs/catalog-scale-plan.md, stage 6) — else the placeholder
 */
export function ProductThumbImage({
  product,
  ...img
}: { product: Pick<Product, 'id' | 'images'> | null | undefined } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const thumb = useProductThumb(product);
  return <img {...img} src={thumb || productImage(product)} />;
}

/**
 * The picture of an order line: only the catalog product's (orderLineImage — a link in the order is written by the
 * visitor), its miniature when the product keeps no previews inside, else the placeholder
 */
export function OrderLineThumbImage({
  line,
  catalog,
  ...img
}: { line: Pick<Product, 'id'>; catalog: Product[] } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  return <ProductThumbImage {...img} product={catalog.find((p) => p.id === line.id)} />;
}
