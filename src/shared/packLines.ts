/**
 * A size pack («ростовка») in an order (stage 19 of docs/admin-wholesale-plan.md, stage 10 of docs/wholesale-spec.md).
 * In the cart a pack is one line; the order keeps it as lines of its sizes (`expandPackLines`), so stock deduction and
 * return per line, the stock journal `{order}_{line}`, sums, invoices and the price check work without special cases.
 * Screens show those lines as one pack (`groupOrderLines`). Code shared with Cloud Functions (`placeOrder`, stage 20).
 */
import type { CartItem } from '../types';
import { linePrice } from './orderLine';

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

const isCartPackLine = (item: CartItem): item is CartPackLine =>
  typeof item.packId === 'string' && Array.isArray((item as Partial<CartPackLine>).packSizes);

/**
 * The cart's lines as order lines: a pack line becomes lines of its sizes (`priceKind: 'pack'`, a shared `packGroup` —
 * the cart line's id), other lines stay as they are
 */
export function expandPackLines(items: CartItem[]): CartItem[] {
  return items.flatMap((item) => {
    if (!isCartPackLine(item)) return [item];
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
