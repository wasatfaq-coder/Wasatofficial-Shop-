import type { Product } from '../types';
import {
  newSizePackId,
  productSizePacks,
  sameColor,
  SIZE_PACK_PRICE_MAX,
  SIZE_PACK_QTY_MAX,
  SIZE_PACKS_MAX,
  type SizePack,
} from '../shared/sizePacks';

/**
 * «Ростовки» in the product CSV (stage 18 of docs/admin-wholesale-plan.md): one cell, packs separated by « | »,
 * a pack — sizes with items «48:1; 50:2; 52:1», its colours in brackets in front «(Синий, Чёрный)» (none — every
 * colour), its own price after «=» («= 4500»). Barcodes and names are not in the cell: a pack of the same sizes and
 * colours keeps the product's own (`mergeSizePacks`), a new one gets a barcode on saving.
 */

/** A pack read from the cell: no id, name or barcodes yet */
export type ImportedSizePack = Pick<SizePack, 'sizes' | 'colors' | 'price'>;

const NO_PACKS_CELLS = ['-', '—', 'нет'];

/** «(Синий) 48:1; 50:2 = 4500 | 46:1; 48:1» */
export function sizePacksCell(product: Product): string {
  return productSizePacks(product)
    .map((pack) => {
      const colors = pack.colors?.length ? `(${pack.colors.join(', ')}) ` : '';
      const sizes = pack.sizes.map((l) => `${l.size}:${l.qty}`).join('; ');
      return `${colors}${sizes}${pack.price ? ` = ${pack.price}` : ''}`;
    })
    .join(' | ');
}

/**
 * The packs of a cell: '' — empty, the product keeps its own; 'remove' — «-», remove them; null — not packs (the
 * import reports the row and changes nothing). Sizes and colours are checked against the product when it is merged
 * (`productSizePacks` drops what the product does not have).
 */
export function sizePacksFromCell(cell = ''): ImportedSizePack[] | 'remove' | '' | null {
  const text = cell.trim();
  if (!text) return '';
  if (NO_PACKS_CELLS.includes(text.toLowerCase())) return 'remove';
  const parts = text.split('|').map((p) => p.trim());
  if (parts.length > SIZE_PACKS_MAX || parts.some((p) => !p)) return null;
  const packs: ImportedSizePack[] = [];
  for (const part of parts) {
    const match = /^(?:\(([^)]*)\))?\s*([^=]+?)\s*(?:=\s*([\d\s]+)\s*(?:₽|руб\.?)?)?$/i.exec(part);
    if (!match) return null;
    const [, colorsText, sizesText, priceText] = match;
    const sizes: SizePack['sizes'] = [];
    for (const entry of sizesText.split(';').map((e) => e.trim()).filter(Boolean)) {
      const pair = /^(.+?)\s*:\s*(\d+)$/.exec(entry);
      if (!pair) return null;
      const qty = Number(pair[2]);
      if (!Number.isInteger(qty) || qty < 1 || qty > SIZE_PACK_QTY_MAX) return null;
      if (sizes.some((l) => l.size === pair[1].trim())) return null;
      sizes.push({ size: pair[1].trim(), qty });
    }
    if (sizes.length === 0) return null;
    const colors = (colorsText ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    const price = priceText ? Number(priceText.replace(/\s/g, '')) : undefined;
    if (price !== undefined && !(price > 0 && price <= SIZE_PACK_PRICE_MAX)) return null;
    packs.push({ sizes, ...(colors.length ? { colors } : {}), ...(price ? { price } : {}) });
  }
  return packs;
}

const sameSizes = (a: SizePack['sizes'], b: SizePack['sizes']) =>
  a.length === b.length && a.every((line, i) => line.size === b[i].size && line.qty === b[i].qty);
const sameColors = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((c) => b.some((x) => sameColor(x, c)));

/**
 * Packs of the file over the product's own: a pack of the same sizes and colours keeps its id, name and barcodes (a
 * re-imported export changes nothing but the price); the others are new.
 */
export function mergeSizePacks(own: SizePack[] | undefined, imported: ImportedSizePack[]): SizePack[] {
  const left = [...(own ?? [])];
  const ids = new Set(left.map((p) => p.id));
  const newId = () => newSizePackId(ids);
  return imported.map((pack) => {
    const i = left.findIndex((p) => sameSizes(p.sizes, pack.sizes) && sameColors(p.colors, pack.colors));
    const match = i >= 0 ? left.splice(i, 1)[0] : undefined;
    return {
      id: match?.id ?? newId(),
      ...(match?.title ? { title: match.title } : {}),
      ...(pack.colors?.length ? { colors: pack.colors } : {}),
      sizes: pack.sizes,
      ...(pack.price ? { price: pack.price } : {}),
      ...(match?.barcodes?.length ? { barcodes: match.barcodes } : {}),
    };
  });
}
