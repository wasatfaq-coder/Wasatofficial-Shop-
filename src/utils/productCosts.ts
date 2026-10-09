import { readPurchase, samePurchase, type ProductPurchase } from './currencyPricing';

/**
 * Admin only: what a product cost and where it is bought (`product_costs/{id}`, closed to customers by firestore.rules) —
 * the rouble cost, the purchase in a currency, the supplier and the supplier's article (stage 11 of
 * docs/admin-wholesale-plan.md). The document is written whole, so every save carries all of them.
 */
export interface ProductCostEntry {
  costPrice?: number;
  purchase?: ProductPurchase;
  /** Who the product is bought from: «ООО Текстиль», «Guangzhou Fashion» */
  supplier?: string;
  /** The product's article at the supplier — for reordering and checking the supplier's invoices */
  supplierSku?: string;
}

/** Longer text is cut: a supplier's name or article never takes more */
export const SUPPLIER_MAX_LENGTH = 120;
export const SUPPLIER_SKU_MAX_LENGTH = 60;

/** A supplier's name or article as stored: trimmed, one line, not longer than the limit; empty — none */
export function supplierText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
  return text || undefined;
}

/** The cost entry of a product (only the fields it has) */
export function costEntryOf(p: ProductCostEntry): ProductCostEntry {
  const supplier = supplierText(p.supplier, SUPPLIER_MAX_LENGTH);
  const supplierSku = supplierText(p.supplierSku, SUPPLIER_SKU_MAX_LENGTH);
  return {
    ...(typeof p.costPrice === 'number' ? { costPrice: p.costPrice } : {}),
    ...(p.purchase ? { purchase: p.purchase } : {}),
    ...(supplier ? { supplier } : {}),
    ...(supplierSku ? { supplierSku } : {}),
  };
}

/** The entry holds anything: an empty one removes the document */
export function hasCostData(entry: ProductCostEntry): boolean {
  const e = costEntryOf(entry);
  return e.costPrice !== undefined || !!e.purchase || !!e.supplier || !!e.supplierSku;
}

/** Two entries are the same (both absent counts as the same) */
export function sameCostEntry(a: ProductCostEntry | undefined, b: ProductCostEntry | undefined): boolean {
  const x = costEntryOf(a ?? {});
  const y = costEntryOf(b ?? {});
  return (
    x.costPrice === y.costPrice &&
    samePurchase(x.purchase, y.purchase) &&
    x.supplier === y.supplier &&
    x.supplierSku === y.supplierSku
  );
}

/** A `product_costs` document from the database; nothing usable — null */
export function readCostEntry(data: Record<string, unknown>): ProductCostEntry | null {
  const entry = costEntryOf({
    costPrice: typeof data.costPrice === 'number' ? data.costPrice : undefined,
    purchase: readPurchase(data.purchase) ?? undefined,
    supplier: data.supplier as string | undefined,
    supplierSku: data.supplierSku as string | undefined,
  });
  return hasCostData(entry) ? entry : null;
}
