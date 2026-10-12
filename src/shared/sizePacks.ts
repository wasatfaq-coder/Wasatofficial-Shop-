/**
 * «Ростовка» — a size pack of one colour (stage 18 of docs/admin-wholesale-plan.md, stage 9 of docs/wholesale-spec.md):
 * the owner sets which sizes go into one pack and how many of each («48 ×1, 50 ×2, 52 ×1»), the pack price and the
 * colours it is sold in; every colour of a pack has its own barcode (src/shared/barcode.ts). Owner's decision 11.10:
 * apart from the wholesale pack of one variation (`wholesalePackSize`), which stays as it is.
 *
 * In the public product (`products/{id}.sizePacks`, written by the admin), not in the catalog index: the customer does not
 * see packs yet (stage 20). Code shared with Cloud Functions: `placeOrder` will check the packs with the same functions.
 */

export interface SizePackLine {
  size: string;
  qty: number;
}

export interface SizePackBarcode {
  color: string;
  code: string;
}

export interface SizePack {
  id: string;
  /** The owner's name of the pack; empty — the composition names it */
  title?: string;
  /** The colours the pack is sold in; empty or absent — every colour of the product */
  colors?: string[];
  /** Sizes of the product and how many of each are in one pack */
  sizes: SizePackLine[];
  /** Price of one pack, ₽; absent — the wholesale price × pieces (`sizePackPrice`) */
  price?: number;
  /** One barcode per colour of the pack */
  barcodes?: SizePackBarcode[];
}

type PackOwner = { sizes?: string[]; colors?: ({ name: string } | string)[]; sizePacks?: SizePack[]; wholesalePrice?: number };
type StockOwner = PackOwner & { skus?: { color: string; size: string; stock: number }[] };

/** Packs of one product: more is a price list, not a product */
export const SIZE_PACKS_MAX = 10;
/** Items of one size in a pack */
export const SIZE_PACK_QTY_MAX = 99;
export const SIZE_PACK_TITLE_MAX = 60;
/** Price of one pack, ₽ */
export const SIZE_PACK_PRICE_MAX = 10_000_000;

const colorName = (c: { name: string } | string) => (typeof c === 'string' ? c : c?.name ?? '').trim();
export const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The product's colour names, as written in the product */
export function productColorNames(product: Pick<PackOwner, 'colors'>): string[] {
  return (product.colors ?? []).map(colorName).filter(Boolean);
}

/**
 * The packs as stored and used: only sizes of the product (in its order, each once) with 1–99 items, only its colours
 * (a pack left without any of the colours it named is dropped — it would otherwise silently become «every colour»),
 * a sane price, barcodes of the pack's colours. A pack without sizes is dropped. Reads the database defensively.
 */
export function productSizePacks(product: PackOwner | null | undefined): SizePack[] {
  const raw = product?.sizePacks;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const sizes = Array.isArray(product?.sizes) ? product!.sizes : [];
  const colors = productColorNames(product ?? {});
  const seenIds = new Set<string>();
  const packs: SizePack[] = [];
  for (const pack of raw.slice(0, SIZE_PACKS_MAX)) {
    const id = typeof pack?.id === 'string' ? pack.id.trim() : '';
    if (!id || seenIds.has(id)) continue;
    const qtyBySize = new Map<string, number>();
    for (const line of Array.isArray(pack.sizes) ? pack.sizes : []) {
      const qty = Number(line?.qty);
      if (typeof line?.size === 'string' && Number.isInteger(qty) && qty >= 1 && qty <= SIZE_PACK_QTY_MAX && !qtyBySize.has(line.size)) {
        qtyBySize.set(line.size, qty);
      }
    }
    const lines = sizes.filter((s) => qtyBySize.has(s)).map((size) => ({ size, qty: qtyBySize.get(size)! }));
    if (lines.length === 0) continue;
    const named = Array.isArray(pack.colors) ? pack.colors.filter((c): c is string => typeof c === 'string' && Boolean(c.trim())) : [];
    const packColors = colors.filter((c) => named.some((n) => sameColor(n, c)));
    if (named.length > 0 && packColors.length === 0) continue;
    const price = Number(pack.price);
    const title = typeof pack.title === 'string' ? pack.title.trim().slice(0, SIZE_PACK_TITLE_MAX) : '';
    const sold = packColors.length > 0 ? packColors : colors;
    const barcodes = (Array.isArray(pack.barcodes) ? pack.barcodes : []).filter(
      (b, i, all): b is SizePackBarcode =>
        typeof b?.code === 'string' &&
        Boolean(b.code.trim()) &&
        typeof b.color === 'string' &&
        sold.some((c) => sameColor(c, b.color)) &&
        all.findIndex((x) => typeof x?.color === 'string' && sameColor(x.color, b.color)) === i
    );
    seenIds.add(id);
    packs.push({
      id,
      ...(title ? { title } : {}),
      ...(packColors.length > 0 && packColors.length < colors.length ? { colors: packColors } : {}),
      sizes: lines,
      ...(Number.isFinite(price) && price > 0 && price <= SIZE_PACK_PRICE_MAX ? { price: Math.round(price) } : {}),
      ...(barcodes.length > 0 ? { barcodes: barcodes.map((b) => ({ color: b.color, code: b.code.trim() })) } : {}),
    });
  }
  return packs;
}

/**
 * Id of a new pack: never one the product has, and not the number of a deleted pack either — orders will keep `packId`
 * (stage 19), and an old order line must not point at another pack
 */
export function newSizePackId(taken: Set<string>, now: number = Date.now()): string {
  const base = `pack-${now.toString(36)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Items in one pack */
export const sizePackPieces = (pack: Pick<SizePack, 'sizes'>) => pack.sizes.reduce((sum, line) => sum + line.qty, 0);

/** The colours the pack is sold in: its own, or every colour of the product */
export function sizePackColors(product: Pick<PackOwner, 'colors'>, pack: Pick<SizePack, 'colors' | 'sizes'>): string[] {
  const colors = productColorNames(product);
  if (!pack.colors?.length) return colors;
  return colors.filter((c) => pack.colors!.some((n) => sameColor(n, c)));
}

/** Price of one pack: its own, or the wholesale price of an item × pieces; undefined — neither is set */
export function sizePackPrice(product: Pick<PackOwner, 'wholesalePrice'>, pack: Pick<SizePack, 'price' | 'sizes'>): number | undefined {
  if (typeof pack.price === 'number' && pack.price > 0) return pack.price;
  const wholesale = Number(product.wholesalePrice);
  return Number.isFinite(wholesale) && wholesale > 0 ? Math.round(wholesale * sizePackPieces(pack)) : undefined;
}

/** «48 ×1 · 50 ×2 · 52 ×1» */
export const sizePackCompositionText = (pack: Pick<SizePack, 'sizes'>) =>
  pack.sizes.map((line) => `${line.size} ×${line.qty}`).join(' · ');

/** The label line: «48-50-52 / 1-2-1» (spec: «48-50-52-54-56 / 1-1-1-1-1») */
export const sizePackLabelLine = (pack: Pick<SizePack, 'sizes'>) =>
  `${pack.sizes.map((l) => l.size).join('-')} / ${pack.sizes.map((l) => l.qty).join('-')}`;

/** The pack's name: the owner's title, or «Ростовка 48–52» */
export function sizePackTitle(pack: Pick<SizePack, 'title' | 'sizes'>): string {
  if (pack.title?.trim()) return pack.title.trim();
  const sizes = pack.sizes.map((l) => l.size);
  return `Ростовка ${sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes[0] ?? ''}`.trim();
}

/** The pack's barcode for one colour, or '' */
export const sizePackBarcode = (pack: Pick<SizePack, 'barcodes'>, color: string) =>
  pack.barcodes?.find((b) => sameColor(b.color, color))?.code ?? '';

/**
 * How many whole packs of the colour the stock makes: for each size of the pack — stock ÷ items of that size, the
 * smallest of them. A size without a variation counts as 0. Physical stock: «Снят с витрины» does not change it.
 */
export function sizePacksAvailable(product: StockOwner, pack: Pick<SizePack, 'sizes'>, color: string): number {
  let packs = Infinity;
  for (const line of pack.sizes) {
    const stock = (product.skus ?? [])
      .filter((s) => sameColor(s.color ?? '', color) && s.size === line.size)
      .reduce((sum, s) => sum + Math.max(0, Number(s.stock) || 0), 0);
    packs = Math.min(packs, Math.floor(stock / line.qty));
  }
  return Number.isFinite(packs) ? packs : 0;
}
