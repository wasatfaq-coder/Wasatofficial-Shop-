/**
 * The product copy stored inside an order line. The order keeps what it shows and counts (name, price, category,
 * variants); photos saved inside the product document (data:image/…, up to ~400 KB each) and the card texts stay
 * in the catalog. With full copies an order of two sizes of a product with three photos exceeded the 1 MiB
 * Firestore document limit and could not be placed. Order screens take the photo from the catalog by `id`.
 * Used by the storefront and by placeOrder.
 */
import type { Product } from '../types';

export function toOrderLineProduct(product: Product): Product {
  const line = {
    id: product.id,
    title: product.title,
    price: product.price,
    originalPrice: product.originalPrice,
    category: product.category,
    categoryLabel: product.categoryLabel,
    material: product.material,
    colors: product.colors ?? [],
    sizes: product.sizes ?? [],
    // Links to photos are small; photos embedded in the document are not copied
    images: (product.images ?? []).filter((src) => !src.startsWith('data:')),
  };
  return line as Product;
}
