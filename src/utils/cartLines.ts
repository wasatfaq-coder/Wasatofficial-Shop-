/**
 * Lines of one variant in the cart. Since the wholesale part 2 (docs/admin-wholesale-plan.md, stages 16–17) one variant
 * may have two lines — retail and wholesale — and both take from one stock: each line can have only what the other
 * left (the checkout counts them together — `orderStockProblems`)
 */
import type { CartItem } from '../types';

type VariantLine = Pick<CartItem, 'id' | 'product' | 'selectedColor' | 'selectedSize' | 'quantity'> &
  Partial<Pick<CartItem, 'packId' | 'packSizes'>>;

export function sameVariant(a: Omit<VariantLine, 'id' | 'quantity'>, b: Omit<VariantLine, 'id' | 'quantity'>): boolean {
  return a.product?.id === b.product?.id && a.selectedColor === b.selectedColor && a.selectedSize === b.selectedSize;
}

/**
 * Items of `line`'s variant an item holds: a line of the variant — its quantity; a size pack of the product and colour
 * (stage 20, one cart line, `quantity` — packs) — packs × items of that size in one pack
 */
function itemsOfVariant(item: VariantLine, line: Omit<VariantLine, 'id' | 'quantity'>): number {
  const quantity = Number(item.quantity) || 0;
  if (item.packId && Array.isArray(item.packSizes)) {
    if (item.product?.id !== line.product?.id || item.selectedColor !== line.selectedColor) return 0;
    const perPack = item.packSizes.find((s) => s.size === line.selectedSize)?.qty ?? 0;
    return quantity * perPack;
  }
  return sameVariant(item, line) ? quantity : 0;
}

/** Items the other lines of this line's variant hold (`exceptId` — the line itself; none — every line counts) */
export function heldByOtherLines(items: VariantLine[], line: Omit<VariantLine, 'id' | 'quantity'>, exceptId?: string): number {
  return items.reduce((sum, item) => (item.id !== exceptId ? sum + itemsOfVariant(item, line) : sum), 0);
}

/**
 * Whole packs of a size pack the cart can still take: for each size — what the stock gives (`stockOf`, 0 for a product
 * off sale) minus what the other lines hold, ÷ items of the size in a pack; the smallest. No preorder for packs (owner's
 * decision 12.10)
 */
export function packsLeft(
  items: VariantLine[],
  pack: Pick<CartItem, 'product' | 'selectedColor'> & { packSizes: { size: string; qty: number }[] },
  stockOf: (size: string) => number,
  exceptId?: string
): number {
  if (pack.packSizes.length === 0) return 0;
  let packs = Infinity;
  for (const { size, qty } of pack.packSizes) {
    if (!(qty > 0)) return 0;
    const held = heldByOtherLines(items, { product: pack.product, selectedColor: pack.selectedColor, selectedSize: size }, exceptId);
    packs = Math.min(packs, Math.floor(Math.max(0, stockOf(size) - held) / qty));
  }
  return Number.isFinite(packs) ? packs : 0;
}
