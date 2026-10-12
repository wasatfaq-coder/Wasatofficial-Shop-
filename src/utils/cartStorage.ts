import type { CartItem } from '../types';
import { toOrderLineProduct } from '../shared/orderLine';

/** Internal key (not renamed): carts of existing customers live under it */
export const CART_STORAGE_KEY = 'manstyle_cart';

/**
 * The cart as it is kept in the browser: each line with a light copy of the product (no photos inside,
 * stock, card texts) — the same copy an order line gets. A whole product with photos took ~0,5 MB per line,
 * and after ≈ 9 lines localStorage (≈ 5 MB) silently stopped saving the cart. The full product comes back
 * from the catalog as soon as it loads (the products subscription in App.tsx).
 */
export function toStoredCart(items: CartItem[]): CartItem[] {
  return items.map((item) => ({ ...item, product: toOrderLineProduct(item.product) }));
}

/**
 * Saved cart, or empty. Reads both the light lines and carts saved by earlier versions with whole products.
 * Earlier versions also put three demo items (ids 'cart-init-*') into every new visitor's cart; they are dropped.
 */
/** A line that is not a size pack keeps no pack fields: they would mark it as part of a pack */
function stripPack<T extends Partial<CartItem>>(item: T): T {
  const { packId: _id, packTitle: _title, packPrice: _price, packSizes: _sizes, packGroup: _group, packCount: _count, packPieces: _pieces, ...rest } = item;
  return rest as T;
}

export function loadStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CartItem =>
          Boolean(item?.product?.id) && typeof item.quantity === 'number' && !String(item.id).startsWith('cart-init-')
      )
      // a line's own price is not taken from the browser: anyone can edit localStorage, and `linePrice` would put
      // that price into the order (docs/wholesale-spec.md — the cart recounts it from the catalog, `priceCartLines`).
      // Only the buyer's choice stays: «оптом», or a size pack — its id; the pack's price and composition stay only for
      // showing the cart before the product's document comes (`pricePackLine` takes them from the product; the checkout
      // and `placeOrder` count the order from the product, never from here)
      .map(({ unitPrice: _unitPrice, priceKind, volumeDiscountPerUnit: _discount, packSize: _size, packUnavailable: _gone, ...item }) =>
        priceKind === 'wholesale' || (priceKind === 'pack' && typeof item.packId === 'string')
          ? { ...item, priceKind }
          : stripPack(item)
      );
  } catch {
    return [];
  }
}
