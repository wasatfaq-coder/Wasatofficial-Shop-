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
import { isCartPackLine, pricePackLine } from './packLines';
import { brokenPackPieces } from './sizePacks';

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

/**
 * Discount on a «Разбитая упаковка» (stage 3 of docs/broken-pack-plan.md / stage 14 of docs/unified-plan.md):
 * calculated from the product's `wholesalePrice` per item, either as a percent (`kind === 'percent'`) or a fixed sum in
 * roubles off each item (`kind === 'fixed'`).
 */
export interface BrokenPackDiscount {
  kind: VolumeDiscountKind;
  value: number;
}

/** `settings/storefront.wholesale` (public: the cart counts the discount in the browser) */
export interface WholesaleSettings {
  volumeDiscount?: VolumeDiscountScale;
  /** Minimum sum of wholesale lines (wholesale and size packs) in an order, roubles; absent or 0 — no minimum */
  minOrderAmount?: number;
  /** Discount on broken packs (% or ₽ off wholesalePrice per item) */
  brokenPackDiscount?: BrokenPackDiscount;
}

export const MAX_VOLUME_TIERS = 10;
/** A larger percent is almost surely a typo (the wholesale price is already lowered) */
export const MAX_VOLUME_PERCENT = 90;
export const MAX_MIN_WHOLESALE_AMOUNT = 10_000_000;
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

/** A line priced wholesale (a size-run pack too; broken packs are NOT wholesale for minimum order or volume discount, decision O10) */
export function isWholesaleLine(item: Pick<CartItem, 'priceKind'>): boolean {
  return item.priceKind === 'wholesale' || item.priceKind === 'pack';
}

/** A line from a «Разбитая упаковка» (`priceKind === 'broken'`) */
export function isBrokenPackLine(item: Pick<CartItem, 'priceKind'>): boolean {
  return item.priceKind === 'broken';
}

/**
 * Reads `brokenPackDiscount` from either a `BrokenPackDiscount` object, `WholesaleSettings`, or `StorefrontSettings`.
 * Returns `undefined` when absent or invalid.
 */
export function readBrokenPackDiscount(source: unknown): BrokenPackDiscount | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const obj = source as Record<string, unknown>;
  const raw =
    obj.brokenPackDiscount && typeof obj.brokenPackDiscount === 'object'
      ? (obj.brokenPackDiscount as Record<string, unknown>)
      : obj.wholesale && typeof obj.wholesale === 'object' && (obj.wholesale as Record<string, unknown>).brokenPackDiscount
      ? ((obj.wholesale as Record<string, unknown>).brokenPackDiscount as Record<string, unknown>)
      : obj;
  if (!raw || typeof raw !== 'object') return undefined;
  const kind: VolumeDiscountKind = raw.kind === 'fixed' ? 'fixed' : 'percent';
  const value = Number(raw.value);
  if (!isPositive(value)) return undefined;
  if (kind === 'percent' && value > MAX_VOLUME_PERCENT) return undefined;
  return { kind, value };
}

/** Validation errors for a broken pack discount draft; empty — valid */
export function brokenPackDiscountErrors(discount: BrokenPackDiscount | undefined | null): string[] {
  if (!discount) return [];
  const errors: string[] = [];
  if (!isPositive(discount.value)) {
    errors.push('Скидка на разбитую упаковку должна быть больше нуля');
  } else if (discount.kind === 'percent' && discount.value > MAX_VOLUME_PERCENT) {
    errors.push(`Скидка на разбитую упаковку — не больше ${MAX_VOLUME_PERCENT} %`);
  }
  return errors;
}

/**
 * Price of one item in «Разбитая упаковка» mode: base is `product.wholesalePrice` (or `product.price` if no wholesalePrice),
 * minus `brokenPackDiscount` (percent or fixed roubles per item), rounded to whole roubles, never below 1 ₽.
 */
export function brokenPackDiscountedPrice(
  baseWholesalePrice: number,
  discount: BrokenPackDiscount | undefined | null
): number {
  if (!Number.isFinite(baseWholesalePrice) || baseWholesalePrice <= 0) return 0;
  if (!discount || !isPositive(discount.value)) return Math.round(baseWholesalePrice);
  const price =
    discount.kind === 'fixed'
      ? Math.round(baseWholesalePrice - discount.value)
      : Math.round((baseWholesalePrice * (100 - discount.value)) / 100);
  // never 0 ₽: a fixed discount saved before a lower wholesale price is set (review 16.10, finding 5)
  return Math.max(1, price);
}

/**
 * Whether a cart line or product variant can be priced as a broken pack:
 * - For a cart line: `priceKind === 'broken'` AND the product is sold «В розницу и оптом» (`saleChannelOf(product) === 'both'`) with a valid wholesale price.
 * - For a product variant `(product, color, size)`: `saleChannelOf(product) === 'both'`, has a wholesale price, and (when sizePacks are defined) belongs to a broken pack in that colour.
 */
export function goesBrokenPack(item: Pick<CartItem, 'product' | 'priceKind'>): boolean;
export function goesBrokenPack(
  product: Product,
  color: string,
  size: string,
  stockOfSize?: (size: string) => number
): boolean;
export function goesBrokenPack(
  first: Pick<CartItem, 'product' | 'priceKind'> | Product,
  color?: string,
  size?: string,
  _stockOfSize?: (size: string) => number
): boolean {
  if (typeof color === 'string' && typeof size === 'string') {
    const product = first as Product;
    if (!product || saleChannelOf(product) !== 'both' || !hasWholesalePrice(product)) return false;
    // only leftover pieces above whole packs: no size pack — no broken pack (review 16.10, finding 1)
    return brokenPackPieces(product, color, size) > 0;
  }
  const item = first as Pick<CartItem, 'product' | 'priceKind'>;
  const product = item.product;
  if (!product || item.priceKind !== 'broken') return false;
  return saleChannelOf(product) === 'both' && hasWholesalePrice(product);
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

/**
 * One item's price after the step: whole roubles, not below 1 ₽, as the broken pack (audit 29.10, finding 3): «Опт»
 * checks a step only when it is saved, and a wholesale price lowered later (the form, «Курсы → Применить») made a fixed
 * step reach 0 ₽ — the browser and `placeOrder` took the line for free
 */
export function volumeDiscountedPrice(base: number, tier: VolumeDiscountTier | null, kind: VolumeDiscountKind): number {
  if (!tier) return base;
  const price = kind === 'fixed' ? base - tier.value : Math.round((base * (100 - tier.value)) / 100);
  return Math.max(1, price);
}

/**
 * The line goes wholesale: the buyer chose it, or the product is sold only wholesale. A stored cart line (before
 * `priceCartLines`) is read the same way: the cart and «Повторить заказ» match lines by it
 */
export function goesWholesale(item: Pick<CartItem, 'product' | 'priceKind'>): boolean {
  const product = item.product;
  if (!product || !sellsWholesale(product)) return false;
  return item.priceKind === 'wholesale' || saleChannelOf(product) === 'wholesale';
}

/**
 * The cart's lines with their prices: wholesale lines get `unitPrice` = wholesale price minus the volume step,
 * broken pack lines get `unitPrice` = wholesale price minus `brokenPackDiscount` (no volume step, no promo),
 * and the rest lose any own price (retail, the product's price).
 * The single place a line's price is set: the cart, the checkout and `placeOrder` all call it
 */
export function priceCartLines<T extends PricedLine>(items: T[], settings?: WholesaleSettings | null): T[] {
  const scale = readVolumeDiscount(settings?.volumeDiscount);
  const brokenDiscount = readBrokenPackDiscount(settings);
  // a size pack is priced by its own price (stage 20); it is not a pack of `wholesalePackSize` and gets no volume step
  const sizePack = items.map((item) => isCartPackLine(item as unknown as CartItem));
  // a line of an order that came from a pack keeps its price per item (the pack's price split by `splitPackPrice`)
  const orderPack = items.map((item) => item.priceKind === 'pack' && Boolean((item as unknown as CartItem).packGroup));
  const broken = items.map((item, i) => !sizePack[i] && !orderPack[i] && goesBrokenPack(item));
  const wholesale = items.map((item, i) => !sizePack[i] && !orderPack[i] && !broken[i] && goesWholesale(item));
  const keyOf = (item: T) => (scale?.countBy === 'order' ? '*' : item.product.id);
  const packs = new Map<string, number>();
  items.forEach((item, i) => {
    if (wholesale[i]) packs.set(keyOf(item), (packs.get(keyOf(item)) ?? 0) + linePacks(item));
  });
  return items.map((item, i) => {
    if (sizePack[i]) return pricePackLine(item as unknown as CartItem) as unknown as T;
    if (orderPack[i]) return item;
    const { unitPrice: _price, priceKind: _kind, volumeDiscountPerUnit: _discount, packSize: _size, ...rest } = item;
    if (broken[i]) {
      const base = item.product.wholesalePrice as number;
      const unit = brokenPackDiscountedPrice(base, brokenDiscount);
      return {
        ...rest,
        priceKind: 'broken',
        unitPrice: unit,
      } as T;
    }
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

/** Minimum wholesale order sum in whole roubles, or undefined when not set */
export function readMinWholesaleAmount(settings?: WholesaleSettings | null): number | undefined {
  return isWholeInRange(settings?.minOrderAmount, 1, MAX_MIN_WHOLESALE_AMOUNT) ? settings!.minOrderAmount : undefined;
}

/** Sum of all wholesale lines (including size-run packs) in the cart or order */
export function wholesaleOrderSubtotal(items: Pick<CartItem, 'product' | 'quantity' | 'priceKind' | 'unitPrice'>[]): number {
  let sum = 0;
  for (const item of items) {
    if (isWholesaleLine(item)) sum += linePrice(item) * (Number(item.quantity) || 0);
  }
  return sum;
}

/**
 * What stops the wholesale lines of a priced cart from being ordered: not whole packs, fewer packs than the product's
 * minimum (all its variants together), or total wholesale sum below `settings.minOrderAmount`. Empty — fine
 */
export function wholesaleLineProblems(items: PricedLine[], settings?: WholesaleSettings | null): string[] {
  const byProduct = new Map<string, { product: PricedLine['product']; packs: number; uneven: boolean }>();
  for (const item of items) {
    // size packs are whole by construction (one line = whole packs) and have no minimum
    if (!isWholesaleLine(item) || !item.product || item.priceKind === 'pack') continue;
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
  const minAmount = readMinWholesaleAmount(settings);
  if (minAmount !== undefined && items.some(isWholesaleLine)) {
    const subtotal = wholesaleOrderSubtotal(items);
    if (subtotal < minAmount) {
      const diff = minAmount - subtotal;
      problems.push(
        `Минимальная сумма оптового заказа — ${minAmount.toLocaleString('ru-RU')} ₽ (сейчас ${subtotal.toLocaleString('ru-RU')} ₽, добавьте ещё на ${diff.toLocaleString('ru-RU')} ₽)`
      );
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

export interface BrokenPackExcess {
  product: Product;
  color: string;
  size: string;
  /** Pieces asked for this variant in all broken pack lines */
  quantity: number;
  /** Pieces left above whole packs (`brokenPackPieces`) */
  pieces: number;
}

/**
 * Broken pack lines asking for more pieces of a variant than are left above whole packs (review 16.10, finding 1):
 * the browser's checkout and placeOrder sum every broken line of the variant, so splitting the order does not help.
 */
export function brokenPackExcess(
  lines: { product: Product; color: string; size: string; quantity: number }[]
): BrokenPackExcess[] {
  const byVariant = new Map<string, BrokenPackExcess>();
  for (const line of lines) {
    const key = `${line.product.id}|${line.color.trim().toLowerCase()}|${line.size.trim().toLowerCase()}`;
    const entry = byVariant.get(key);
    if (entry) entry.quantity += line.quantity;
    else byVariant.set(key, { ...line, pieces: brokenPackPieces(line.product, line.color, line.size) });
  }
  return [...byVariant.values()].filter((e) => e.quantity > e.pieces);
}
