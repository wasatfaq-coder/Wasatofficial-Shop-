/**
 * A size pack («ростовка») in an order (stage 19 of docs/admin-wholesale-plan.md, stage 10 of docs/wholesale-spec.md).
 * In the cart a pack is one line; the order keeps it as lines of its sizes (`expandPackLines`), so stock deduction and
 * return per line, the stock journal `{order}_{line}`, sums, invoices and the price check work without special cases.
 * Screens show those lines as one pack (`groupOrderLines`). Code shared with Cloud Functions (`placeOrder`, stage 20).
 */
import type { CartItem, Product } from '../types';
import { linePrice } from './orderLine';
import { productSizePacks, sameColor, sizePackColors, sizePackPrice, sizePackTitle } from './sizePacks';

/** Lines of one client order after packs are expanded (firestore.rules `isClientOrderShape`, `placeOrder`) */
export const ORDER_LINES_MAX = 60;

export interface PackLineSize {
  size: string;
  /** Items of this size in one pack */
  qty: number;
}

/**
 * Splits the price of one pack into whole roubles per item: every item gets ⌊price ÷ items⌋, the first `price mod items`
 * items one rouble more. A size the boundary falls inside becomes two parts. Σ (unitPrice × qty) of the parts = price.
 */
export function splitPackPrice(price: number, sizes: PackLineSize[]): { size: string; qty: number; unitPrice: number }[] {
  const pieces = sizes.reduce((sum, s) => sum + s.qty, 0);
  if (pieces <= 0) return [];
  const total = Math.max(0, Math.round(price));
  const base = Math.floor(total / pieces);
  let extra = total - base * pieces;
  const parts: { size: string; qty: number; unitPrice: number }[] = [];
  for (const { size, qty } of sizes) {
    const higher = Math.min(extra, qty);
    extra -= higher;
    if (higher > 0) parts.push({ size, qty: higher, unitPrice: base + 1 });
    if (qty - higher > 0) parts.push({ size, qty: qty - higher, unitPrice: base });
  }
  return parts;
}

/** A pack line of the cart: one line, `selectedSize` empty, quantity — packs */
export interface CartPackLine extends CartItem {
  packId: string;
  packTitle: string;
  packPrice: number;
  packSizes: PackLineSize[];
}

const hasPackComposition = (item: CartItem): item is CartPackLine =>
  typeof item.packId === 'string' && Array.isArray((item as Partial<CartPackLine>).packSizes);

/**
 * The cart's lines as order lines: a pack line becomes lines of its sizes (`priceKind: 'pack'`, a shared `packGroup` —
 * the cart line's id), other lines stay as they are
 */
export function expandPackLines(items: CartItem[]): CartItem[] {
  return items.flatMap((item) => {
    if (!hasPackComposition(item)) return [item];
    const { packSizes, ...line } = item;
    const count = Math.max(1, Math.floor(item.quantity));
    return splitPackPrice(item.packPrice, packSizes).map((part, i) => ({
      ...line,
      id: `${item.id}-${i + 1}`,
      selectedSize: part.size,
      quantity: part.qty * count,
      unitPrice: part.unitPrice,
      priceKind: 'pack' as const,
      packGroup: item.id,
      packCount: count,
      packPieces: part.qty,
    }));
  });
}

export interface OrderLineGroupSize {
  size: string;
  /** Items of this size in one pack */
  qty: number;
}

/** What an order screen shows: a line as it is, or the lines of one pack as one row */
export type OrderLineGroup =
  | { kind: 'line'; item: CartItem; index: number }
  | {
      kind: 'pack';
      packGroup: string;
      /** The first line of the pack: product, colour, pack id and title */
      item: CartItem;
      /** Positions of the pack's lines in `order.items` */
      indexes: number[];
      title: string;
      packCount: number;
      /** Price of one pack: the lines' sum ÷ packs (exact, the price was split by `splitPackPrice`) */
      packPrice: number;
      sizes: OrderLineGroupSize[];
      /** Items of the whole group */
      pieces: number;
      total: number;
    };

/** Is the line a part of a pack (`packGroup` with a pack count)? */
export const isPackLine = (item: Pick<CartItem, 'packGroup'>): boolean => typeof item.packGroup === 'string' && item.packGroup.length > 0;

/** «Ростовка» or its name; `packTitle` is written when ordered */
const groupTitle = (item: CartItem) => (item.packTitle?.trim() ? item.packTitle.trim() : 'Ростовка');

/**
 * Lines of an order for showing: lines of one pack (`packGroup`) become one group at the place of its first line, the
 * sizes of a split price merged back. Lines without a group, old orders included, stay single lines.
 */
export function groupOrderLines(items: CartItem[]): OrderLineGroup[] {
  const groups: OrderLineGroup[] = [];
  const byPack = new Map<string, Extract<OrderLineGroup, { kind: 'pack' }>>();
  items.forEach((item, index) => {
    if (!isPackLine(item)) {
      groups.push({ kind: 'line', item, index });
      return;
    }
    const key = item.packGroup!;
    let group = byPack.get(key);
    if (!group) {
      group = {
        kind: 'pack',
        packGroup: key,
        item,
        indexes: [],
        title: groupTitle(item),
        packCount: Math.max(1, Math.floor(Number(item.packCount) || 1)),
        packPrice: 0,
        sizes: [],
        pieces: 0,
        total: 0,
      };
      byPack.set(key, group);
      groups.push(group);
    }
    group.indexes.push(index);
    const quantity = Math.max(0, Number(item.quantity) || 0);
    group.pieces += quantity;
    group.total += linePrice(item) * quantity;
    const perPack = Number(item.packPieces) > 0 ? Number(item.packPieces) : quantity / group.packCount;
    const size = group.sizes.find((s) => s.size === item.selectedSize);
    if (size) size.qty += perPack;
    else group.sizes.push({ size: item.selectedSize, qty: perPack });
  });
  for (const group of byPack.values()) group.packPrice = Math.round(group.total / group.packCount);
  return groups;
}

/** «48 ×1 · 50 ×2 · 52 ×1» — the pack's composition on order screens */
export const packGroupCompositionText = (sizes: OrderLineGroupSize[]) => sizes.map((s) => `${s.size} ×${s.qty}`).join(' · ');

/** Packs and items of an order: «Аналитика» and the invoice count both */
export function orderPackCounts(items: CartItem[]): { packs: number; pieces: number } {
  let packs = 0;
  let pieces = 0;
  for (const group of groupOrderLines(items)) {
    if (group.kind === 'pack') {
      packs += group.packCount;
      pieces += group.pieces;
    } else {
      pieces += Math.max(0, Number(group.item.quantity) || 0);
    }
  }
  return { packs, pieces };
}

/**
 * «Правка состава» changes a pack only whole (spec, stage 10): every line of the group gets `count` packs. A line
 * without `packPieces` (written before the field) keeps its share: quantity ÷ old count
 */
export function setPackGroupCount(items: CartItem[], packGroup: string, count: number): CartItem[] {
  const packs = Math.max(1, Math.floor(count));
  return items.map((item) => {
    if (item.packGroup !== packGroup) return item;
    const oldCount = Math.max(1, Math.floor(Number(item.packCount) || 1));
    const perPack = Number(item.packPieces) > 0 ? Number(item.packPieces) : Math.max(1, Math.round(item.quantity / oldCount));
    return { ...item, packCount: packs, packPieces: perPack, quantity: perPack * packs };
  });
}

/** Removes every line of the pack: one size of a pack is not removed alone */
export const removePackGroup = (items: CartItem[], packGroup: string): CartItem[] =>
  items.filter((item) => item.packGroup !== packGroup);

/**
 * A cart line of a size pack: `priceKind: 'pack'` with the pack's id, quantity — packs. A line of an order that came from
 * a pack has `packGroup` and a price per item: it is not a cart line and is never priced as one (review 12.10)
 */
export const isCartPackLine = (item: Pick<CartItem, 'priceKind' | 'packId' | 'packGroup'>): boolean =>
  item.priceKind === 'pack' && typeof item.packId === 'string' && item.packId.length > 0 && !item.packGroup;

/** The product sells the pack in this colour: the pack, or null (a pack the owner removed or a colour taken off it) */
export function soldPack(product: Product | undefined, packId: string | undefined, color: string) {
  const pack = productSizePacks(product).find((p) => p.id === packId);
  if (!pack || !product) return null;
  return sizePackColors(product, pack).some((c) => sameColor(c, color)) ? pack : null;
}

/**
 * The price of a cart line of a size pack (stage 20): one pack — its own price or the wholesale price × pieces
 * (`sizePackPrice`), composition and name from the product's pack; the volume discount does not apply to packs.
 * A product copy without `sizePacks` (the stored cart before the live document came) keeps what the line has; a product
 * that no longer has the pack, or a pack without a price, gives a line `packUnavailable` — it is not ordered
 * (`packLineProblems`, `placeOrder` refuses it)
 */
export function pricePackLine<T extends CartItem>(item: T): T {
  const product = item.product as Product | undefined;
  if (!product || !Array.isArray(product.sizePacks)) return { ...item, unitPrice: item.packPrice ?? item.unitPrice };
  // the colour too: a pack the owner no longer sells in this colour has no barcode and the server refuses it
  const pack = soldPack(product, item.packId, String(item.selectedColor ?? ''));
  const price = pack ? sizePackPrice(product, pack) : undefined;
  if (!pack || price === undefined) return { ...item, packUnavailable: true };
  const { packUnavailable: _gone, ...rest } = item as T & { packUnavailable?: boolean };
  return {
    ...rest,
    priceKind: 'pack',
    unitPrice: price,
    packPrice: price,
    packTitle: sizePackTitle(pack),
    packSizes: pack.sizes.map((s) => ({ size: s.size, qty: s.qty })),
  } as T;
}

/** Packs of a cart line can be ordered: the line has its composition and a price */
export function packLineProblems(items: CartItem[]): string[] {
  return items
    .filter(isCartPackLine)
    .filter((item) => (item as CartItem & { packUnavailable?: boolean }).packUnavailable || !(Number(item.packPrice) > 0))
    .map((item) => `«${item.product?.title ?? 'Товар'}»: ростовка «${item.packTitle || 'Ростовка'}» больше не продаётся — уберите её из корзины`);
}
