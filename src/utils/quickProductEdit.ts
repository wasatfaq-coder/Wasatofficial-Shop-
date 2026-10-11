import type { Product, ProductSKU } from '../types';
import { withMissingSkus } from './inventory';

/**
 * Quick edits from the admin's product list (stage 4 of docs/admin-wholesale-plan.md, findings 27, 28 and А9): the price
 * without opening the form, the stock of each variation and the products a bulk price change puts below their cost.
 */

/** A product whose price is below its cost in ₽ (`costPrice`, admin only); `loss` — how much each sale loses */
export interface BelowCostLine {
  id: string;
  title: string;
  price: number;
  cost: number;
  loss: number;
}

/** Products priced below their cost: a warning, not a ban — a clearance sale may be meant (А9) */
export function belowCostLines(products: Product[]): BelowCostLine[] {
  return products.flatMap((p) => {
    const cost = Number(p.costPrice);
    if (!(cost > 0) || !(p.price > 0) || p.price >= cost) return [];
    return [{ id: p.id, title: p.title, price: p.price, cost, loss: Math.ceil(cost - p.price) }];
  });
}

/** «Цена» and «Старая цена» of the quick edit; an empty old price removes it */
export function quickPriceError(price: number, oldPrice: number | undefined): string {
  if (!Number.isFinite(price) || price <= 0) return 'Цена — число больше нуля';
  if (oldPrice !== undefined && (!Number.isFinite(oldPrice) || oldPrice < 0)) return 'Старая цена — число не меньше нуля';
  if (oldPrice !== undefined && oldPrice > 0 && oldPrice <= price) return 'Старая цена должна быть выше цены — иначе оставьте её пустой';
  return '';
}

/** Badges a sale puts on the card («Сезонные скидки» of the bulk window): they go with the old price */
const SALE_BADGES = new Set(['SALE', 'Скидка']);

/**
 * The product with the new price: the old price only above the price, the discount percent from the two prices, so the
 * badge and «-N%» of customers match (`shownOldPrice`/`shownBadge`). Without an old price a «SALE» / «Скидка» badge goes
 * too, as «Снять скидки» does: a customer would see a sale that is not there. Nothing else changes.
 */
export function withQuickPrice(product: Product, price: number, oldPrice: number | undefined): Product {
  const hasOld = oldPrice !== undefined && oldPrice > price;
  return {
    ...product,
    price,
    originalPrice: hasOld ? oldPrice : undefined,
    discountPercent: hasOld ? Math.round((1 - price / oldPrice) * 100) : undefined,
    badge: !hasOld && product.badge && SALE_BADGES.has(product.badge) ? undefined : product.badge,
  };
}

/** The key of a variation in the quick stock edit: colour and size, not the position */
export const variantKey = (sku: Pick<ProductSKU, 'color' | 'size'>) => `${sku.color}|${sku.size}`;

/** Every colour × size of the product, saved or not yet (a colour from an old CSV import — stock 0) */
export function quickStockVariants(product: Product): ProductSKU[] {
  return withMissingSkus(product);
}

export interface QuickStockChange {
  productId: string;
  productTitle: string;
  color: string;
  size: string;
  /** New minus the stock seen when the window opened: a sale while the window was open stays sold */
  delta: number;
}

/**
 * The stock changes of the typed values: only the variations whose value differs from the shown stock, by the difference
 * (like an operation in «Склад и SKU»). `error` — a value that is not a whole number from 0.
 */
export function quickStockChanges(
  product: Product,
  variants: ProductSKU[],
  values: Record<string, string>
): { changes: QuickStockChange[]; error: string } {
  const changes: QuickStockChange[] = [];
  for (const sku of variants) {
    const typed = values[variantKey(sku)];
    if (typed === undefined || typed.trim() === '') continue;
    const next = Number(typed.trim());
    if (!Number.isInteger(next) || next < 0) {
      return { changes: [], error: `${sku.color}, ${sku.size}: остаток — целое число от 0` };
    }
    const shown = Math.max(0, Number(sku.stock) || 0);
    if (next !== shown) {
      changes.push({ productId: product.id, productTitle: product.title, color: sku.color, size: sku.size, delta: next - shown });
    }
  }
  return { changes, error: '' };
}
