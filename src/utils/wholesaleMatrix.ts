import type { CartItem, Product } from '../types';
import { isWholesaleLine, packSizeOf } from '../shared/wholesalePricing';
import { isCartPackLine } from '../shared/packLines';
import {
  sameColor,
  sizePackColors,
  sizePackPieces,
  sizePackPrice,
  type SizePack,
} from '../shared/sizePacks';
import { getOrderableStock } from './inventory';
import { heldByOtherLines } from './cartLines';
import type { WholesaleOffer, WholesaleStep } from './wholesaleOffer';

export const matrixCellKey = (color: string, second: string) => `${color}:::${second}`;

export interface WholesaleMatrixLine {
  color: string;
  size: string;
  packs: number;
  quantity: number;
}

export interface WholesaleMatrixSummary {
  lines: WholesaleMatrixLine[];
  selectedPacks: number;
  selectedPieces: number;
  effectiveUnitPrice: number;
  effectivePackPrice: number;
  totalPrice: number;
  appliedStep: WholesaleStep | null;
  minPacksRemaining: number;
}

/**
 * Maximum whole wholesale packs of `(color, size)` that can still be added on top of `cartItems`.
 */
export function maxWholesalePacksForCell(
  product: Product,
  color: string,
  size: string,
  cartItems: CartItem[],
  preorderMode = false
): number {
  const step = packSizeOf(product);
  const stock = getOrderableStock(product, color, size, preorderMode);
  const held = heldByOtherLines(cartItems, { product, selectedColor: color, selectedSize: size });
  return Math.max(0, Math.floor(Math.max(0, stock - held) / step));
}

/**
 * Summarizes the selected cells in the «Оптом» matrix (Colour × Size in wholesale packs).
 */
export function summarizeWholesaleMatrix(
  product: Product,
  offer: WholesaleOffer,
  cartItems: CartItem[],
  draft: Record<string, number>,
  preorderMode = false
): WholesaleMatrixSummary {
  const lines: WholesaleMatrixLine[] = [];
  for (const c of product.colors ?? []) {
    for (const sz of product.sizes ?? []) {
      const raw = Math.floor(Number(draft[matrixCellKey(c.name, sz)]) || 0);
      if (raw <= 0) continue;
      const maxPacks = maxWholesalePacksForCell(product, c.name, sz, cartItems, preorderMode);
      const packs = Math.min(raw, maxPacks);
      if (packs > 0) {
        lines.push({
          color: c.name,
          size: sz,
          packs,
          quantity: packs * offer.packSize,
        });
      }
    }
  }

  const selectedPacks = lines.reduce((sum, l) => sum + l.packs, 0);
  const selectedPieces = selectedPacks * offer.packSize;

  // Wholesale packs of this product already in the cart
  const cartProductPacks = cartItems.reduce((sum, item) => {
    if (item.product.id !== product.id || !isWholesaleLine(item) || isCartPackLine(item)) return sum;
    return sum + Math.floor(item.quantity / offer.packSize);
  }, 0);

  // Wholesale packs across the whole cart (when volume discount is counted by order)
  const cartOrderPacks = cartItems.reduce((sum, item) => {
    if (!isWholesaleLine(item) || isCartPackLine(item)) return sum;
    return sum + Math.floor(item.quantity / packSizeOf(item.product));
  }, 0);

  const scalePacks = (offer.countBy === 'order' ? cartOrderPacks : cartProductPacks) + selectedPacks;
  let appliedStep: WholesaleStep | null = null;
  for (const step of offer.steps) {
    if (scalePacks >= step.minPacks && (!appliedStep || step.minPacks > appliedStep.minPacks)) {
      appliedStep = step;
    }
  }

  const effectiveUnitPrice = appliedStep ? appliedStep.unitPrice : offer.unitPrice;
  const effectivePackPrice = effectiveUnitPrice * offer.packSize;
  const totalPrice = selectedPieces * effectiveUnitPrice;
  const minPacksRemaining = Math.max(0, offer.minPacks - (cartProductPacks + selectedPacks));

  return {
    lines,
    selectedPacks,
    selectedPieces,
    effectiveUnitPrice,
    effectivePackPrice,
    totalPrice,
    appliedStep,
    minPacksRemaining,
  };
}

export interface PackMatrixLine {
  color: string;
  pack: SizePack;
  packs: number;
  pieces: number;
  packPrice: number;
  lineTotal: number;
}

export interface PackMatrixSummary {
  lines: PackMatrixLine[];
  selectedPacks: number;
  selectedPieces: number;
  totalPrice: number;
}

/**
 * Maximum whole size-packs (`pack`) of `color` that can be selected in the matrix,
 * accounting for `cartItems` AND other size-packs of the same `color` selected in `draft`.
 */
export function maxSizePacksForCell(
  product: Product,
  pack: SizePack,
  color: string,
  allPacks: SizePack[],
  cartItems: CartItem[],
  draft: Record<string, number>
): number {
  if (!sizePackColors(product, pack).some((c) => sameColor(c, color))) return 0;
  if (pack.sizes.length === 0) return 0;

  let maxPacks = Infinity;
  for (const { size, qty } of pack.sizes) {
    if (!(qty > 0)) return 0;
    const stock = getOrderableStock(product, color, size, false);
    const heldInCart = heldByOtherLines(cartItems, { product, selectedColor: color, selectedSize: size });
    // Also subtract items of this (color, size) held by OTHER packs of the same color in `draft`
    let heldInDraft = 0;
    for (const otherPack of allPacks) {
      if (otherPack.id === pack.id) continue;
      const otherCount = Math.max(0, Math.floor(Number(draft[matrixCellKey(color, otherPack.id)]) || 0));
      if (otherCount <= 0) continue;
      const otherSizeQty = otherPack.sizes.find((s) => s.size === size)?.qty ?? 0;
      heldInDraft += otherCount * otherSizeQty;
    }
    const left = Math.max(0, stock - heldInCart - heldInDraft);
    maxPacks = Math.min(maxPacks, Math.floor(left / qty));
  }
  return Number.isFinite(maxPacks) ? maxPacks : 0;
}

/**
 * Summarizes the selected cells in the «Ростовкой» matrix (Colour × SizePack).
 */
export function summarizePackMatrix(
  product: Product,
  sizePacks: SizePack[],
  cartItems: CartItem[],
  draft: Record<string, number>
): PackMatrixSummary {
  const lines: PackMatrixLine[] = [];
  for (const c of product.colors ?? []) {
    for (const pack of sizePacks) {
      const raw = Math.floor(Number(draft[matrixCellKey(c.name, pack.id)]) || 0);
      if (raw <= 0) continue;
      const maxPacks = maxSizePacksForCell(product, pack, c.name, sizePacks, cartItems, draft);
      const packs = Math.min(raw, maxPacks);
      const packPrice = sizePackPrice(product, pack);
      if (packs > 0 && packPrice !== undefined) {
        const piecesPerPack = sizePackPieces(pack);
        lines.push({
          color: c.name,
          pack,
          packs,
          pieces: packs * piecesPerPack,
          packPrice,
          lineTotal: packs * packPrice,
        });
      }
    }
  }

  const selectedPacks = lines.reduce((sum, l) => sum + l.packs, 0);
  const selectedPieces = lines.reduce((sum, l) => sum + l.pieces, 0);
  const totalPrice = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  return {
    lines,
    selectedPacks,
    selectedPieces,
    totalPrice,
  };
}
