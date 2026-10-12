import type { Product } from '../types';
import { withSizePackBarcodes } from '../shared/barcode';
import { pluralRu } from './pluralize';
import {
  SIZE_PACKS_MAX,
  SIZE_PACK_PRICE_MAX,
  SIZE_PACK_QTY_MAX,
  SIZE_PACK_TITLE_MAX,
  newSizePackId,
  productColorNames,
  productSizePacks,
  sameColor,
  sizePackLabelLine,
  sizePackPieces,
  type SizePack,
  type SizePackBarcode,
} from '../shared/sizePacks';

/**
 * Editing «Ростовок» in the product form (stage 18 of docs/admin-wholesale-plan.md): the rows the owner types, the check
 * on «Сохранить», and the packs the product is saved with. Apart from `src/shared/sizePacks.ts`, which the customer's
 * code and Cloud Functions read: this code stays in the admin chunk.
 */

/** One pack in the form: texts as typed, converted and checked only on «Сохранить» */
export interface SizePackDraft {
  /** Kept for a pack that already exists; a new one gets `pack-N` */
  id: string;
  title: string;
  /** «Все цвета»; otherwise only `colors` */
  allColors: boolean;
  colors: string[];
  /** Items of each size as typed: no entry or '' — the size is not in the pack */
  qty: Record<string, string>;
  /** Own price of the pack as typed; '' — wholesale price × pieces */
  price: string;
  /** Codes the pack has now: shown read-only, kept on save, missing ones are issued by `withSizePackBarcodes` */
  barcodes: SizePackBarcode[];
  /**
   * The composition the codes were issued for («48-50-52 / 1-2-1»): another composition gets new codes, so a label
   * already stuck on a pack never describes a different one
   */
  codedFor: string;
}

const INTEGER = /^\d+$/;
const compact = (text: string) => text.replace(/[\s ₽]/g, '');

/** The drafts of the product's packs (normalized the way the customer's code reads them), in the product's order */
export function packDraftsFromProduct(product: Pick<Product, 'sizes' | 'colors' | 'sizePacks'>): SizePackDraft[] {
  return productSizePacks(product).map((pack) => ({
    id: pack.id,
    title: pack.title ?? '',
    allColors: !pack.colors?.length,
    colors: pack.colors ?? [],
    qty: Object.fromEntries(pack.sizes.map((line) => [line.size, String(line.qty)])),
    price: pack.price ? String(pack.price) : '',
    barcodes: pack.barcodes ?? [],
    codedFor: sizePackLabelLine(pack),
  }));
}

/** An empty pack with a new id (`newSizePackId`: not the id of a deleted pack) */
export function newPackDraft(drafts: SizePackDraft[]): SizePackDraft {
  const id = newSizePackId(new Set(drafts.map((d) => d.id)));
  return { id, title: '', allColors: true, colors: [], qty: {}, price: '', barcodes: [], codedFor: '' };
}

const filledSizes = (draft: SizePackDraft, sizes: string[]) => sizes.filter((size) => (draft.qty[size] ?? '').trim() !== '');
const colorNamesOf = (colors: ({ name: string } | string)[]) => productColorNames({ colors });
/** The chosen colours that the product still has (a renamed or deleted colour drops out) */
const chosenColors = (draft: SizePackDraft, colors: string[]) => colors.filter((c) => draft.colors.some((n) => sameColor(n, c)));

/** The name in messages: the owner's, or the position */
export const packDraftLabel = (draft: SizePackDraft, index: number) => draft.title.trim() || `Ростовка ${index + 1}`;

/** The problems of the packs, in the form's list on «Сохранить»; a pack without any price is allowed */
export function sizePackErrors(drafts: SizePackDraft[], sizes: string[], colors: ({ name: string } | string)[]): string[] {
  const colorNames = colorNamesOf(colors);
  const errors: string[] = [];
  if (drafts.length > SIZE_PACKS_MAX) errors.push(`Ростовок у товара не больше ${SIZE_PACKS_MAX}: удалите лишние`);
  drafts.forEach((draft, index) => {
    const name = `«${packDraftLabel(draft, index)}»`;
    const filled = filledSizes(draft, sizes);
    if (filled.length === 0) errors.push(`${name}: укажите штуки хотя бы у одного размера`);
    for (const size of filled) {
      const text = compact(draft.qty[size] ?? '');
      const qty = Number(text);
      if (!INTEGER.test(text) || qty < 1 || qty > SIZE_PACK_QTY_MAX) {
        errors.push(`${name}: размер ${size} — штук должно быть целое число от 1 до ${SIZE_PACK_QTY_MAX}`);
      }
    }
    if (!draft.allColors && chosenColors(draft, colorNames).length === 0) {
      errors.push(`${name}: выберите цвет или включите «Все цвета»`);
    }
    const price = compact(draft.price);
    if (price !== '' && (!INTEGER.test(price) || Number(price) < 1 || Number(price) > SIZE_PACK_PRICE_MAX)) {
      errors.push(`${name}: цена упаковки — целое число рублей больше нуля`);
    }
  });
  return errors;
}

/** Items of a size as typed, or 0 when it is empty or not a number: for the preview, which never shows an error */
const lenientQty = (text: string) => {
  const n = Number(compact(text));
  return Number.isInteger(n) && n >= 1 && n <= SIZE_PACK_QTY_MAX ? n : 0;
};

/**
 * The pack the draft makes for the product's sizes and colours: lines in the product's size order. Empty or wrong items
 * are left out, so the same function serves the preview while typing and the save after the check.
 */
export function packFromDraft(draft: SizePackDraft, sizes: string[], colors: ({ name: string } | string)[]): SizePack {
  const colorNames = colorNamesOf(colors);
  const chosen = chosenColors(draft, colorNames);
  const price = Number(compact(draft.price));
  const title = draft.title.trim().slice(0, SIZE_PACK_TITLE_MAX);
  const lines = sizes.map((size) => ({ size, qty: lenientQty(draft.qty[size] ?? '') })).filter((line) => line.qty > 0);
  // the codes belong to the composition they were issued for: a changed pack gets new ones on save
  const keepCodes = draft.barcodes.length > 0 && draft.codedFor === sizePackLabelLine({ sizes: lines });
  return {
    id: draft.id,
    ...(title ? { title } : {}),
    ...(!draft.allColors && chosen.length > 0 && chosen.length < colorNames.length ? { colors: chosen } : {}),
    sizes: lines,
    ...(INTEGER.test(compact(draft.price)) && price >= 1 && price <= SIZE_PACK_PRICE_MAX ? { price } : {}),
    ...(keepCodes ? { barcodes: draft.barcodes } : {}),
  };
}

/** The colours a draft is sold in now: the chosen ones, or every colour of the product */
export function packDraftColors(draft: SizePackDraft, colors: ({ name: string } | string)[]): string[] {
  const names = colorNamesOf(colors);
  return draft.allColors ? names : chosenColors(draft, names);
}

/**
 * The product with its packs: `sizePacks` from the drafts (undefined when none, so the field is removed) and a barcode
 * for every colour of every pack. The other products' codes are taken into account, so a code is never repeated.
 */
export function productWithSizePacks<T extends Product>(product: T, drafts: SizePackDraft[], others: Product[]): T {
  const packs = drafts.map((draft) => packFromDraft(draft, product.sizes ?? [], product.colors ?? []));
  const withPacks = { ...product, sizePacks: packs.length > 0 ? packs : undefined };
  const [saved] = withSizePackBarcodes([withPacks, ...others.filter((p) => p.id !== product.id)], new Set([product.id]));
  return saved as T;
}

/** «2 ростовки: 48–52 (4 шт.), 50–56 (6 шт.)» for a closed block; '' — no packs */
export function sizePacksSummary(drafts: SizePackDraft[], sizes: string[], colors: ({ name: string } | string)[]): string {
  const packs = drafts.map((draft) => packFromDraft(draft, sizes, colors)).filter((pack) => pack.sizes.length > 0);
  if (packs.length === 0) return '';
  const word = pluralRu(packs.length, ['ростовка', 'ростовки', 'ростовок']);
  const range = (pack: SizePack) =>
    pack.sizes.length > 1 ? `${pack.sizes[0].size}–${pack.sizes[pack.sizes.length - 1].size}` : pack.sizes[0].size;
  return `${packs.length} ${word}: ${packs.map((pack) => `${range(pack)} (${sizePackPieces(pack)} шт.)`).join(', ')}`;
}
