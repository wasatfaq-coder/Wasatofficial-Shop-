import type { Product, ProductSKU } from '../types';
import { getProductRating } from './productRating';

/**
 * Лёгкий индекс каталога (docs/catalog-scale-plan.md, этап 2): строка на товар — всё, что нужно поиску, фильтрам,
 * сортировкам, карточке и корзине, без фото и текстов карточки. Покупатель читает индекс одним-двумя документами вместо всех товаров;
 * пишет его сессия администратора (`useCatalogIndexSync`), пока нет Cloud Functions. Код без браузерных API, кроме
 * сжатия (`CompressionStream` есть и в браузерах, и в Bun).
 */

/** Bump when an entry changes shape: the admin session then rewrites the index */
export const CATALOG_INDEX_FORMAT = 1;
export const CATALOG_INDEX_COLLECTION = 'catalog_index';
export const PRODUCT_THUMBS_COLLECTION = 'product_thumbs';
/** One part's compressed entries; a document holds up to 1 MiB, the rest is the other fields and a margin */
const PART_MAX_BYTES = 700_000;

/**
 * A product without what a card, the search and the filters do not need: no photos (only the miniature's key or a photo
 * link), no card sections. Variants stay (colour, size, stock): the size and «в наличии» filters and the cart use them
 */
export type CatalogEntry = Pick<
  Product,
  'id' | 'title' | 'category' | 'categoryLabel' | 'price' | 'originalPrice' | 'badge' | 'material' | 'description' |
  'sizes' | 'colors' | 'inStock' | 'hiddenFromSale' | 'isPopular' | 'isNew' | 'fit'
> & {
  skus: Pick<ProductSKU, 'id' | 'color' | 'size' | 'stock' | 'skuCode'>[];
  /** From real reviews only (getProductRating): the product's own `rating` may be a template number */
  reviewRating?: number;
  reviewCount?: number;
  /** The first photo as a link (a photo from the internet): the card shows it as it is */
  image?: string;
  /** The first photo is a data: photo — its miniature is `product_thumbs/{id}`, made from this photo (thumbKey) */
  thumb?: string;
  photoCount: number;
};

export interface CatalogIndexPart {
  format: number;
  part: number;
  parts: number;
  /** Of all entries: equal hashes — nothing to rewrite */
  hash: string;
  /** gzip of the JSON array of this part's entries */
  entries: Uint8Array;
  updatedAt: string;
}

/** FNV-1a, 52 bits as hex: a key for a photo and a version of the index, not a protection */
export function shortHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + (h2 & 0xfffff).toString(16).padStart(5, '0'));
}

/**
 * Which photo the miniature is made from: the full photo's id (a photo document never changes), else a hash of the
 * data: photo. '' — no miniature (no photo, or a link that the card shows itself)
 */
export function thumbKey(product: Pick<Product, 'images' | 'photoIds'>): string {
  const first = product.images?.[0] ?? '';
  if (!first.startsWith('data:image/')) return '';
  const photoId = product.photoIds?.[0];
  return photoId ? `p:${photoId}` : `h:${shortHash(first)}`;
}

/** The index line of a product; `product.reviews` are the merged real reviews (mergeProductReviews) */
export function catalogEntry(product: Product): CatalogEntry {
  const rating = getProductRating(product);
  const first = product.images?.[0] ?? '';
  const thumb = thumbKey(product);
  const entry: CatalogEntry = {
    id: product.id,
    title: product.title ?? '',
    category: product.category ?? '',
    categoryLabel: product.categoryLabel ?? '',
    price: Number(product.price) || 0,
    material: product.material ?? '',
    description: product.description ?? '',
    sizes: product.sizes ?? [],
    colors: (product.colors ?? []).map((c) => ({ name: c.name, hex: c.hex })),
    inStock: product.inStock !== false,
    skus: (product.skus ?? []).map((sku) => {
      const light: CatalogEntry['skus'][number] = { id: sku.id, color: sku.color, size: sku.size, stock: Number(sku.stock) || 0 };
      if (sku.skuCode) light.skuCode = sku.skuCode;
      return light;
    }),
    photoCount: product.images?.length ?? 0,
  };
  if (typeof product.originalPrice === 'number') entry.originalPrice = product.originalPrice;
  if (product.badge) entry.badge = product.badge;
  if (typeof product.hiddenFromSale === 'boolean') entry.hiddenFromSale = product.hiddenFromSale;
  if (product.isNew) entry.isNew = true;
  if (product.isPopular) entry.isPopular = true;
  if (product.fit) entry.fit = product.fit;
  if (rating) {
    entry.reviewRating = rating.rating;
    entry.reviewCount = rating.count;
  }
  if (thumb) entry.thumb = thumb;
  else if (/^https:\/\//.test(first)) entry.image = first;
  return entry;
}

/** Entries in a stable order (by id) and the hash the stored index is compared by */
export function buildCatalogIndex(products: Product[]): { entries: CatalogEntry[]; hash: string } {
  const entries = products.map(catalogEntry).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries, hash: `${CATALOG_INDEX_FORMAT}-${shortHash(JSON.stringify(entries))}` };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const gzipText = (text: string) => pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
export const gunzipText = async (bytes: Uint8Array) => new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));

/** The index as documents of `catalog_index` (p0, p1, …): one part while it fits, about 2 000–3 000 products */
export async function catalogIndexParts(entries: CatalogEntry[], hash: string, at = new Date()): Promise<CatalogIndexPart[]> {
  for (let parts = 1; ; parts++) {
    const size = Math.ceil(entries.length / parts) || 1;
    const chunks = Array.from({ length: parts }, (_, i) => entries.slice(i * size, (i + 1) * size));
    const packed = await Promise.all(chunks.map((chunk) => gzipText(JSON.stringify(chunk))));
    if (packed.every((p) => p.byteLength <= PART_MAX_BYTES) || size === 1) {
      return packed.map((bytes, part) => ({ format: CATALOG_INDEX_FORMAT, part, parts, hash, entries: bytes, updatedAt: at.toISOString() }));
    }
  }
}

export const catalogIndexPartId = (part: number) => `p${part}`;

/**
 * The entries back from the stored parts; null while the parts do not belong together (no parts, another format, a
 * part missing or from another write) — the caller keeps what it had
 */
export async function readCatalogIndex(parts: CatalogIndexPart[]): Promise<{ entries: CatalogEntry[]; hash: string } | null> {
  const first = parts[0];
  if (!first || first.format !== CATALOG_INDEX_FORMAT) return null;
  const sorted = [...parts].sort((a, b) => a.part - b.part);
  if (sorted.length !== first.parts || sorted.some((p, i) => p.part !== i || p.hash !== first.hash || p.parts !== first.parts)) return null;
  const chunks = await Promise.all(sorted.map(async (p) => JSON.parse(await gunzipText(p.entries)) as CatalogEntry[]));
  return { entries: chunks.flat(), hash: first.hash };
}

/**
 * A catalog product from its index line (stage 3): what the cards, the search, the filters and the cart need. No
 * photos (the card reads the miniature, productThumbs.ts), no card sections (the product page reads the document) and
 * no reviews: the rating of the line stands for them until the product page reads them (stage 4)
 */
export function productFromEntry(entry: CatalogEntry): Product {
  const { image, thumb: _thumb, photoCount: _photoCount, reviewRating, reviewCount, skus, ...fields } = entry;
  return {
    ...fields,
    skus: skus.map((sku) => ({ ...sku })),
    images: image ? [image] : [],
    rating: 0,
    reviewsCount: 0,
    catalogRating: reviewCount ? { rating: reviewRating ?? 0, count: reviewCount } : null,
  };
}

/** Product id → its miniature's key, for the products whose card reads a miniature */
export const thumbKeysOf = (entries: CatalogEntry[]) =>
  new Map(entries.flatMap((e) => (e.thumb ? [[e.id, e.thumb] as [string, string]] : [])));

/** The browser can read the index (gzip): without it the catalog is read whole, as before stage 3 */
export const canReadCatalogIndex = () => typeof DecompressionStream === 'function';
