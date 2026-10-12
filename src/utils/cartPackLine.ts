/**
 * How the screens word a cart line of a size pack («ростовка», stage 20 of docs/admin-wholesale-plan.md): one row with
 * the pack's name and composition, «× N уп. = M шт.». Prices are not counted here (`linePrice`, `pricePackLine`).
 */
import type { CartItem } from '../types';
import { isCartPackLine } from '../shared/packLines';
import { sizePackCompositionText, sizePackPieces } from '../shared/sizePacks';

export interface PackLineInfo {
  title: string;
  /** «48 ×1 · 50 ×2 · 52 ×1» */
  composition: string;
  /** Packs in the line (its quantity) */
  packs: number;
  /** Items in one pack */
  perPack: number;
  /** Items in the line: packs × items in one pack */
  pieces: number;
}

/** The pack words of a cart line; null — an ordinary line */
export function packLineInfo(item: Pick<CartItem, 'priceKind' | 'packId' | 'packTitle' | 'packSizes' | 'quantity'>): PackLineInfo | null {
  if (!isCartPackLine(item)) return null;
  const sizes = item.packSizes ?? [];
  const perPack = sizePackPieces({ sizes });
  const packs = Math.max(0, Math.floor(Number(item.quantity) || 0));
  return {
    title: item.packTitle?.trim() || 'Ростовка',
    composition: sizePackCompositionText({ sizes }),
    packs,
    perPack,
    pieces: packs * perPack,
  };
}

/** Items a cart line holds: the quantity, or packs × items in a pack for a size pack line */
export const cartLinePieces = (item: CartItem): number => packLineInfo(item)?.pieces ?? (Number(item.quantity) || 0);

/** «× 2 уп. = 8 шт.» */
export const packLineCountText = (info: Pick<PackLineInfo, 'packs' | 'pieces'>) => `× ${info.packs} уп. = ${info.pieces} шт.`;

/** The line's name for buttons: «Рубашка, Ростовка 48–52» (a pack line) or just the title */
export const cartLineName = (item: CartItem): string => {
  const pack = packLineInfo(item);
  return pack ? `${item.product.title}, ${pack.title}` : item.product.title;
};
