/**
 * Wholesale prices and the volume discount (owner's task 09.10, stages 16–17 of docs/admin-wholesale-plan.md). Shared by
 * the storefront and `placeOrder`: no browser APIs.
 *
 * A wholesale line is priced by the product's `wholesalePrice` — already the lowered price, so promo codes and the
 * product's own discount (`originalPrice`) never apply to it. The only thing that lowers it further is the volume
 * discount of «Опт» (`settings/storefront.wholesale.volumeDiscount`): steps «from N packs», each a percent or a sum in
 * roubles off one item. Packs are counted per product (all its colours and sizes) or over the whole order — the owner
 * chooses. A pack is `wholesalePackSize` items of one variant (1 by default); wholesale lines are ordered in whole packs.
 */
import type { CartItem, Order, Product } from '../types';
import { linePrice } from './orderLine';

/** Who a product is sold to; absent — both */
export type SaleChannel = 'both' | 'retail' | 'wholesale';

export const SALE_CHANNELS: { id: SaleChannel; title: string }[] = [
  { id: 'both', title: 'В розницу и оптом' },
  { id: 'wholesale', title: 'Только оптом' },
  { id: 'retail', title: 'Только в розницу' },
];

export type VolumeDiscountKind = 'percent' | 'fixed';
/** Packs are counted per product (all its variants) or over all wholesale lines of the order */
export type VolumeCountBy = 'product' | 'order';

/** «From `minPacks` packs — `value` off»: percent of the wholesale price or roubles off one item */
export interface VolumeDiscountTier {
  minPacks: number;
  value: number;
}

export interface VolumeDiscountScale {
  kind: VolumeDiscountKind;
  countBy: VolumeCountBy;
  /** By `minPacks`, ascending */
  tiers: VolumeDiscountTier[];
}

/** `settings/storefront.wholesale` (public: the cart counts the discount in the browser) */
export interface WholesaleSettings {
  volumeDiscount?: VolumeDiscountScale;
}

export const MAX_VOLUME_TIERS = 10;
/** A larger percent is almost surely a typo (the wholesale price is already lowered) */
export const MAX_VOLUME_PERCENT = 90;
const MAX_PACKS = 100_000;
const MAX_PACK_SIZE = 1_000;

type WholesaleProduct = Pick<Product, 'saleChannel' | 'wholesalePrice' | 'wholesalePackSize' | 'wholesaleMinPacks'>;
type PricedLine = Pick<CartItem, 'product' | 'quantity' | 'priceKind' | 'unitPrice' | 'volumeDiscountPerUnit' | 'packSize'>;

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isWholeInRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

export function saleChannelOf(product: Pick<Product, 'saleChannel'>): SaleChannel {
  return product.saleChannel === 'retail' || product.saleChannel === 'wholesale' ? product.saleChannel : 'both';
}

export function hasWholesalePrice(product: Pick<Product, 'wholesalePrice'>): boolean {
  return isPositive(product.wholesalePrice);
}

/** The product can be bought wholesale: a wholesale price and not «только в розницу» */
export function sellsWholesale(product: WholesaleProduct): boolean {
  return saleChannelOf(product) !== 'retail' && hasWholesalePrice(product);
}

/**
 * The product can be bought by the item at its retail price. «Только оптом» without a wholesale price stays on retail
 * sale: otherwise the product could not be bought at all
 */
export function sellsRetail(product: WholesaleProduct): boolean {
  return saleChannelOf(product) !== 'wholesale' || !hasWholesalePrice(product);
}

/** Items in one wholesale pack */
export function packSizeOf(product: Pick<Product, 'wholesalePackSize'>): number {
  return isWholeInRange(product.wholesalePackSize, 1, MAX_PACK_SIZE) ? product.wholesalePackSize : 1;
}

/** The fewest packs of the product in a wholesale order */
export function minPacksOf(product: Pick<Product, 'wholesaleMinPacks'>): number {
  return isWholeInRange(product.wholesaleMinPacks, 1, MAX_PACKS) ? product.wholesaleMinPacks : 1;
}

/** A line priced wholesale (a size-run pack later, too) */
export function isWholesaleLine(item: Pick<CartItem, 'priceKind'>): boolean {
  return item.priceKind === 'wholesale' || item.priceKind === 'pack';
}

/** Whole packs in a line */
export function linePacks(item: Pick<CartItem, 'quantity' | 'product'>): number {
  return Math.floor((Number(item.quantity) || 0) / packSizeOf(item.product ?? {}));
}

/** The scale as stored; anything that is not a valid step is dropped rather than trusted. No steps — no discount */
export function readVolumeDiscount(value: unknown): VolumeDiscountScale | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const kind: VolumeDiscountKind = v.kind === 'fixed' ? 'fixed' : 'percent';
  const countBy: VolumeCountBy = v.countBy === 'order' ? 'order' : 'product';
  const byMin = new Map<number, number>();
  for (const raw of Array.isArray(v.tiers) ? v.tiers : []) {
    const t = (raw ?? {}) as Record<string, unknown>;
    if (!isWholeInRange(t.minPacks, 1, MAX_PACKS) || !isPositive(t.value)) continue;
    if (kind === 'percent' && t.value > MAX_VOLUME_PERCENT) continue;
    byMin.set(t.minPacks, t.value);
  }
  const tiers = [...byMin].map(([minPacks, value]) => ({ minPacks, value })).sort((a, b) => a.minPacks - b.minPacks);
  return tiers.length ? { kind, countBy, tiers: tiers.slice(0, MAX_VOLUME_TIERS) } : undefined;
}

/** What the owner has to fix in the scale before saving; empty — ready. Values may be NaN (an empty or wrong field) */
export function volumeDiscountErrors(scale: VolumeDiscountScale): string[] {
  const errors: string[] = [];
  if (scale.tiers.length > MAX_VOLUME_TIERS) errors.push(`Не больше ${MAX_VOLUME_TIERS} ступеней`);
  const seen = new Set<number>();
  scale.tiers.forEach((t, i) => {
    const n = i + 1;
    if (!isWholeInRange(t.minPacks, 1, MAX_PACKS)) errors.push(`Ступень ${n}: число упаковок — целое, от 1`);
    else if (seen.has(t.minPacks)) errors.push(`Ступень ${n}: ступень «от ${t.minPacks} уп.» уже есть`);
    else seen.add(t.minPacks);
    if (!isPositive(t.value)) errors.push(`Ступень ${n}: скидка больше нуля`);
    else if (scale.kind === 'percent' && t.value > MAX_VOLUME_PERCENT) {
      errors.push(`Ступень ${n}: скидка не больше ${MAX_VOLUME_PERCENT} %`);
    }
  });
  if (errors.length) return errors;
  // more packs never give a smaller discount: otherwise one pack more would make the order dearer
  const sorted = [...scale.tiers].sort((a, b) => a.minPacks - b.minPacks);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].value < sorted[i - 1].value) {
      errors.push(`Скидка от ${sorted[i].minPacks} уп. меньше, чем от ${sorted[i - 1].minPacks} уп.`);
    }
  }
  return errors;
}

/** The step reached by this many packs; none — null */
export function volumeTierFor(packs: number, scale: VolumeDiscountScale | undefined): VolumeDiscountTier | null {
  let reached: VolumeDiscountTier | null = null;
  for (const tier of scale?.tiers ?? []) if (packs >= tier.minPacks) reached = tier;
  return reached;
}

/** One item's price after the step: whole roubles, never below zero */
export function volumeDiscountedPrice(base: number, tier: VolumeDiscountTier | null, kind: VolumeDiscountKind): number {
  if (!tier) return base;
  const price = kind === 'fixed' ? base - tier.value : Math.round((base * (100 - tier.value)) / 100);
  return Math.max(0, price);
}

/** The line goes wholesale: the buyer chose it, or the product is sold only wholesale */
function goesWholesale(item: PricedLine): boolean {
  const product = item.product;
  if (!product || !sellsWholesale(product)) return false;
  return item.priceKind === 'wholesale' || saleChannelOf(product) === 'wholesale';
}

/**
 * The cart's lines with their prices: wholesale lines get `unitPrice` = wholesale price minus the volume step, the rest
 * lose any own price (retail, the product's price — also a wholesale choice on a product that is no longer sold
 * wholesale). The single place a line's price is set: the cart, the checkout and `placeOrder` all call it
 */
export function priceCartLines<T extends PricedLine>(items: T[], settings?: WholesaleSettings | null): T[] {
  const scale = readVolumeDiscount(settings?.volumeDiscount);
  const wholesale = items.map(goesWholesale);
  const keyOf = (item: T) => (scale?.countBy === 'order' ? '*' : item.product.id);
  const packs = new Map<string, number>();
  items.forEach((item, i) => {
    if (wholesale[i]) packs.set(keyOf(item), (packs.get(keyOf(item)) ?? 0) + linePacks(item));
  });
  return items.map((item, i) => {
    const { unitPrice: _price, priceKind: _kind, volumeDiscountPerUnit: _discount, packSize: _size, ...rest } = item;
    if (!wholesale[i]) return rest as T;
    const base = item.product.wholesalePrice as number;
    const unit = volumeDiscountedPrice(base, volumeTierFor(packs.get(keyOf(item)) ?? 0, scale), scale?.kind ?? 'percent');
    return {
      ...rest,
      priceKind: 'wholesale',
      unitPrice: unit,
      packSize: packSizeOf(item.product),
      ...(base - unit > 0 ? { volumeDiscountPerUnit: base - unit } : {}),
    } as T;
  });
}

/**
 * What stops the wholesale lines of a priced cart from being ordered: not whole packs, fewer packs than the product's
 * minimum (all its variants together). Empty — fine
 */
export function wholesaleLineProblems(items: PricedLine[]): string[] {
  const byProduct = new Map<string, { product: PricedLine['product']; packs: number; uneven: boolean }>();
  for (const item of items) {
    if (!isWholesaleLine(item) || !item.product) continue;
    const entry = byProduct.get(item.product.id) ?? { product: item.product, packs: 0, uneven: false };
    entry.packs += linePacks(item);
    if ((Number(item.quantity) || 0) % packSizeOf(item.product) !== 0) entry.uneven = true;
    byProduct.set(item.product.id, entry);
  }
  const problems: string[] = [];
  for (const { product, packs, uneven } of byProduct.values()) {
    const size = packSizeOf(product);
    if (uneven) problems.push(`«${product.title}»: оптом — только целыми упаковками по ${size} шт.`);
    else if (packs < minPacksOf(product)) {
      problems.push(`«${product.title}»: оптом — от ${minPacksOf(product)} уп.${size > 1 ? ` по ${size} шт.` : ''}`);
    }
  }
  return problems;
}

/** The order has wholesale lines — the «Опт» mark in «Заказы» and wholesale revenue in «Аналитика» */
export function isWholesaleOrder(order: Pick<Order, 'items'>): boolean {
  return (order.items ?? []).some(isWholesaleLine);
}

/** Sum of the order's lines, wholesale and retail apart (before the promo discount and delivery) */
export function orderLinesByChannel(order: Pick<Order, 'items'>): { wholesale: number; retail: number } {
  let wholesale = 0;
  let retail = 0;
  for (const item of order.items ?? []) {
    const sum = linePrice(item) * (Number(item.quantity) || 0);
    if (isWholesaleLine(item)) wholesale += sum;
    else retail += sum;
  }
  return { wholesale, retail };
}
