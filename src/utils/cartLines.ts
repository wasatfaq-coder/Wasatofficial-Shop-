/**
 * Lines of one variant in the cart. Since the wholesale part 2 (docs/admin-wholesale-plan.md, stages 16–17) one variant
 * may have two lines — retail and wholesale — and both take from one stock: each line can have only what the other
 * left (the checkout counts them together — `orderStockProblems`)
 */
import type { CartItem } from '../types';

type VariantLine = Pick<CartItem, 'id' | 'product' | 'selectedColor' | 'selectedSize' | 'quantity'>;

export function sameVariant(a: Omit<VariantLine, 'id' | 'quantity'>, b: Omit<VariantLine, 'id' | 'quantity'>): boolean {
  return a.product?.id === b.product?.id && a.selectedColor === b.selectedColor && a.selectedSize === b.selectedSize;
}

/** Items the other lines of this line's variant hold (`exceptId` — the line itself; none — every line counts) */
export function heldByOtherLines(items: VariantLine[], line: Omit<VariantLine, 'id' | 'quantity'>, exceptId?: string): number {
  return items.reduce(
    (sum, item) => (item.id !== exceptId && sameVariant(item, line) ? sum + (Number(item.quantity) || 0) : sum),
    0
  );
}
