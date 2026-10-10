/**
 * The product copy stored inside an order line. The order keeps what it shows and counts (name, price, category,
 * variants); photos saved inside the product document (data:image/…, up to ~400 KB each) and the card texts stay
 * in the catalog. With full copies an order of two sizes of a product with three photos exceeded the 1 MiB
 * Firestore document limit and could not be placed. Order screens take the photo from the catalog by `id`.
 * Used by the storefront and by placeOrder.
 */
import type { CartItem, Product } from '../types';

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
    // what the wholesale price of the line is counted from (src/shared/wholesalePricing.ts): the cart keeps this copy
    ...(product.saleChannel ? { saleChannel: product.saleChannel } : {}),
    ...(typeof product.wholesalePrice === 'number' ? { wholesalePrice: product.wholesalePrice } : {}),
    ...(typeof product.wholesalePackSize === 'number' ? { wholesalePackSize: product.wholesalePackSize } : {}),
    ...(typeof product.wholesaleMinPacks === 'number' ? { wholesaleMinPacks: product.wholesaleMinPacks } : {}),
    // Links to photos are small; photos embedded in the document (or moved out of it, '') are not copied
    images: (product.images ?? []).filter((src) => src && !src.startsWith('data:')),
  };
  return line as Product;
}

/**
 * Price of one item of a cart or order line: its own `unitPrice` (wholesale, a pack) or the product's price. Every
 * screen and sum of a cart or an order reads the line price only here (docs/wholesale-spec.md, stage 1); old orders
 * and carts have no `unitPrice` and count as before. The product's own price on its card stays `product.price`
 */
export function linePrice(item: Pick<CartItem, 'unitPrice'> & { product?: Pick<Product, 'price'> }): number {
  const own = item.unitPrice;
  if (typeof own === 'number' && Number.isFinite(own) && own >= 0) return own;
  return Number(item.product?.price) || 0;
}

/** Retail or wholesale: «Аналитика» counts them apart (stage 19 of docs/admin-wholesale-plan.md) */
export type SalesChannel = 'retail' | 'wholesale';

/** The line was sold at a wholesale price: a tier price per item or a size-run pack (`priceKind`) */
export function isWholesaleLine(item: Pick<CartItem, 'priceKind'>): boolean {
  return item.priceKind === 'wholesale' || item.priceKind === 'pack';
}

/**
 * An order is wholesale when any of its lines has a wholesale price (owner's decision 09.10: the «Опт» mark of an order
 * is counted from its lines, never entered). Orders placed before wholesale prices, and every order without
 * `priceKind`, are retail
 */
export function orderSalesChannel(order: { items?: Pick<CartItem, 'priceKind'>[] }): SalesChannel {
  return (order.items ?? []).some(isWholesaleLine) ? 'wholesale' : 'retail';
}
