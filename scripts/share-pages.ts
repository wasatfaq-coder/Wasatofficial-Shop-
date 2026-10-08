// Страницы-превью товаров для мессенджеров и поисковиков (docs/seo-plan.md, этап 1). Запускается после `vite build`
// (`bun run build:share`, deploy.yml): читает каталог из боевой базы как любой посетитель (без ключей и записи) и пишет
// в dist/ product/{id}.html (заголовок, описание, фото и цена товара в <head>), catalog.html, offer.html и privacy.html
// (свои заголовок, описание и canonical — аудит 07.10, находка 53), sitemap.xml и robots.txt.
// Боты Telegram и WhatsApp не выполняют JS: превью товара может быть только в HTML, который отдаёт Hosting. Приложение
// на этой странице то же (index.html), оно открывает экран товара по адресу (src/utils/navigation.ts). Каталог меняется
// в админке между деплоями: новый товар до следующей сборки открывается по общей странице магазина (rewrite на
// index.html), только превью у ссылки общее.
// Без сети или при ошибке базы сборка не падает: остаются общие описание, sitemap и robots.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import firebaseConfig from '../firebase-applet-config.json';
import type { Product, StorefrontSettings } from '../src/types';
import { CATALOG_INDEX_COLLECTION, readCatalogIndex, type CatalogEntry, type CatalogIndexPart } from '../src/utils/catalogIndex';
import { isHiddenFromSale } from '../src/utils/inventory';
import { getStoreName, withStoreName, withStoreNameFields } from '../src/utils/storeContacts';
import {
  INDEXED_SCREENS,
  homeDocumentTitle,
  screenDescription,
  screenDocumentTitle,
  type IndexedScreen,
} from '../src/utils/screenMeta';

/** Product ids that are safe as a file name and a path segment; any other product keeps the store's common preview */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
const DESCRIPTION_LENGTH = 160;

export interface ShareProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  available: boolean;
  /** Absolute URL of the photo for og:image, '' — no photo (or not computed: the fingerprint run) */
  image: string;
  /**
   * Which photo the preview shows, without its bytes: `photo:{id}` for a full photo (a photo document never changes —
   * a new photo gets a new id), else a hash of the photo's source. The fingerprint compares this, not the photo
   */
  imageKey?: string;
  updatedAt?: string;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** JSON inside <script>: «</script>» and «<!--» in the store's texts must not end the tag */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** One line without line breaks, cut at a word to `max` characters */
export function shortText(text: string, max = DESCRIPTION_LENGTH): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const atWord = line[cut.length] === ' ' ? cut : cut.slice(0, cut.lastIndexOf(' '));
  return `${(atWord.length > max / 2 ? atWord : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

export function formatRub(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
}

export function productPath(id: string): string {
  return `/product/${encodeURIComponent(id)}`;
}

/** «3 290 ₽ (было 4 000 ₽) · Описание…» — what a messenger shows under the product's name */
export function productSummary(p: ShareProduct): string {
  const price = p.originalPrice && p.originalPrice > p.price
    ? `${formatRub(p.price)} (было ${formatRub(p.originalPrice)})`
    : formatRub(p.price);
  const stock = p.available ? '' : ' · нет в наличии';
  const description = shortText(p.description, DESCRIPTION_LENGTH - price.length - stock.length - 3);
  return `${price}${stock}${description ? ` · ${description}` : ''}`;
}

const STORE_TAIL = 'каталог с фильтрами по размеру, цвету и цене, подбор размера, заказ онлайн и чат с магазином.';

export function storeDescription(storeName: string, slogan: string): string {
  return slogan ? `${storeName}: ${shortText(slogan, 60)} — ${STORE_TAIL}` : `Магазин мужской одежды ${storeName}: ${STORE_TAIL}`;
}

/** The store's cover (public/og-image.png): the preview of the shop and of a product without a photo */
export function storeCover(site: string, storeName: string): PageImage {
  return { url: `${site}/og-image.png`, type: 'image/png', width: 1200, height: 630, alt: `${storeName} — магазин мужской одежды` };
}

export interface PageImage {
  url: string;
  type?: string;
  width?: number;
  height?: number;
  alt?: string;
}

interface PageMeta {
  title: string;
  description: string;
  url: string;
  /** Only a product's page: the shop's shell (index.html) is served for every screen's path */
  canonical?: boolean;
  type: 'website' | 'product';
  siteName: string;
  image?: PageImage;
  noindex: boolean;
  extra?: string;
}

/** The <head> block between <!-- seo:start --> and <!-- seo:end --> of index.html */
export function metaBlock(m: PageMeta): string {
  const tags = [
    `<title>${escapeHtml(m.title)}</title>`,
    `<meta name="description" content="${escapeHtml(m.description)}" />`,
    m.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '',
    m.canonical ? `<link rel="canonical" href="${escapeHtml(m.url)}" />` : '',
    `<meta property="og:type" content="${m.type}" />`,
    `<meta property="og:site_name" content="${escapeHtml(m.siteName)}" />`,
    '<meta property="og:locale" content="ru_RU" />',
    `<meta property="og:title" content="${escapeHtml(m.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(m.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(m.url)}" />`,
    m.image ? `<meta property="og:image" content="${escapeHtml(m.image.url)}" />` : '',
    m.image?.type ? `<meta property="og:image:type" content="${escapeHtml(m.image.type)}" />` : '',
    m.image?.width ? `<meta property="og:image:width" content="${m.image.width}" />` : '',
    m.image?.height ? `<meta property="og:image:height" content="${m.image.height}" />` : '',
    m.image?.alt ? `<meta property="og:image:alt" content="${escapeHtml(m.image.alt)}" />` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}" />`,
    m.extra ?? '',
  ];
  return tags.filter(Boolean).join('\n    ');
}

export function productJsonLd(p: ShareProduct, url: string): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: shortText(p.description, 500) || undefined,
    image: p.image ? [p.image] : undefined,
    url,
    offers: {
      '@type': 'Offer',
      url,
      price: p.price,
      priceCurrency: 'RUB',
      availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  return `<script type="application/ld+json">${scriptJson(data)}</script>`;
}

export function productMeta(p: ShareProduct, site: string, siteName: string, noindex: boolean): string {
  const url = `${site}${productPath(p.id)}`;
  const priceTags = [
    `<meta property="product:price:amount" content="${p.price}" />`,
    '<meta property="product:price:currency" content="RUB" />',
    productJsonLd(p, url),
  ].join('\n    ');
  return metaBlock({
    title: screenDocumentTitle('product-detail', siteName, p.title),
    description: productSummary(p),
    url,
    canonical: true,
    type: 'product',
    siteName,
    image: p.image ? { url: p.image, alt: p.title } : storeCover(site, siteName),
    noindex,
    extra: priceTags,
  });
}

/**
 * The catalog and the documents (audit 07.10, finding 53): a page of their own (dist/{screen}.html, Hosting serves it
 * for /{screen}), so search engines do not see them as the main page under another address
 */
export function screenMeta(screen: IndexedScreen, site: string, siteName: string, noindex: boolean): string {
  return metaBlock({
    title: screenDocumentTitle(screen, siteName),
    description: screenDescription(screen, siteName),
    url: `${site}/${screen}`,
    canonical: true,
    type: 'website',
    siteName,
    image: storeCover(site, siteName),
    noindex,
  });
}

const SEO_BLOCK = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;

export function withMeta(indexHtml: string, block: string): string {
  if (!SEO_BLOCK.test(indexHtml)) throw new Error('index.html: no <!-- seo:start --> … <!-- seo:end --> block');
  return indexHtml.replace(SEO_BLOCK, () => `<!-- seo:start -->\n    ${block}\n    <!-- seo:end -->`);
}

export function sitemapXml(site: string, products: ShareProduct[]): string {
  const urls = [
    `  <url><loc>${escapeHtml(`${site}/`)}</loc></url>`,
    `  <url><loc>${escapeHtml(`${site}/catalog`)}</loc></url>`,
    ...products.map((p) => {
      const lastmod = p.updatedAt ? `<lastmod>${p.updatedAt.slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${escapeHtml(`${site}${productPath(p.id)}`)}</loc>${lastmod}</url>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(site: string, noindex: boolean): string {
  // Preview channels hold the real shop's data: search engines must not index them as a second shop
  if (noindex) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Firestore REST, as an anonymous visitor (products, settings and product_photos are readable by everyone)
// ---------------------------------------------------------------------------------------------------------------

type RestValue = Record<string, unknown>;

export function fromRest(value: RestValue | undefined): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return ((value.arrayValue as { values?: RestValue[] }).values ?? []).map(fromRest);
  }
  if ('mapValue' in value) return fromRestFields((value.mapValue as { fields?: Record<string, RestValue> }).fields);
  return undefined;
}

function fromRestFields(fields: Record<string, RestValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, fromRest(v)]));
}

const DOCUMENTS = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

/** What the run took from the database (the free quota counts documents and bytes): printed at the end */
const usage = { documents: 0, bytes: 0 };

async function restJson(url: string, init?: RequestInit): Promise<unknown> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}key=${firebaseConfig.apiKey}`, { ...init, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  usage.bytes += Buffer.byteLength(text);
  return JSON.parse(text);
}

type RestDocument = { name: string; fields?: Record<string, RestValue>; updateTime?: string };

/**
 * The fields of a product that its preview and the hidden-from-sale check use. Photos and variants are not among them:
 * the previews inside a product are ≈ 45 КБ each, and the run reads every product (docs/catalog-scale-plan.md, finding 3)
 */
const PREVIEW_FIELDS = ['title', 'price', 'originalPrice', 'description', 'inStock', 'hiddenFromSale', 'photoIds'];

async function readProducts(): Promise<{ product: Product; updatedAt?: string }[]> {
  // runQuery, not a collection GET: the REST list endpoint is refused to anonymous visitors even with «allow read: if true»
  const rows = (await restJson(`${DOCUMENTS}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'products' }], select: { fields: PREVIEW_FIELDS.map((fieldPath) => ({ fieldPath })) } },
    }),
  })) as { document?: RestDocument }[];
  const products = rows.flatMap((row) => {
    if (!row.document) return [];
    usage.documents += 1;
    const id = row.document.name.split('/').pop()!;
    return [{ product: { ...fromRestFields(row.document.fields), id } as unknown as Product, updatedAt: row.document.updateTime }];
  });
  const safe = products.map(({ product }) => product).filter((p) => SAFE_ID.test(p.id));
  // An old product without `hiddenFromSale` and with «нет в наличии» is hidden when it has stock left (isHiddenFromSale)
  const legacy = safe.filter((p) => typeof p.hiddenFromSale !== 'boolean' && p.inStock === false);
  const skus = await readFields(legacy.map((p) => `products/${p.id}`), ['skus']);
  for (const p of legacy) p.skus = (skus.get(`products/${p.id}`)?.skus as Product['skus']) ?? [];
  // A product whose first photo is a link or a light photo (no full photo document) shows it from `images`
  const withoutPhoto = safe.filter((p) => !p.photoIds?.[0]);
  const images = await readFields(withoutPhoto.map((p) => `products/${p.id}`), ['images']);
  for (const p of withoutPhoto) p.images = (images.get(`products/${p.id}`)?.images as string[] | undefined) ?? [];
  // …and when the product keeps its previews in product_previews (stage 6), from there
  const moved = withoutPhoto.filter((p) => p.images[0] === '');
  const previews = await readFields(moved.map((p) => `product_previews/${p.id}`), ['images']);
  for (const p of moved) {
    const first = (previews.get(`product_previews/${p.id}`)?.images as string[] | undefined)?.[0];
    if (first) p.images = [first, ...p.images.slice(1)];
  }
  return products;
}

/** Some fields of a few documents in one request (batchGet), by path */
async function readFields(paths: string[], fields: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const root = DOCUMENTS.replace(/^https?:\/\/[^/]+\/v1\//, '');
  for (let i = 0; i < paths.length; i += 100) {
    const rows = (await restJson(`${DOCUMENTS}:batchGet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documents: paths.slice(i, i + 100).map((p) => `${root}/${p}`), mask: { fieldPaths: fields } }),
    })) as { found?: RestDocument }[];
    for (const row of rows) {
      if (!row.found) continue;
      usage.documents += 1;
      out.set(row.found.name.slice(root.length + 1), fromRestFields(row.found.fields));
    }
  }
  return out;
}

/**
 * The light catalog index (`catalog_index`, docs/catalog-scale-plan.md): one document for hundreds of products, so the
 * hourly check reads it instead of the products (stage 3). null — no index yet (the owner's session writes it) or a
 * broken one: the check reads the products, as before
 */
async function readIndex(): Promise<CatalogEntry[] | null> {
  const rows = (await restJson(`${DOCUMENTS}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: CATALOG_INDEX_COLLECTION }] } }),
  })) as { document?: RestDocument }[];
  const parts = rows.flatMap((row) => {
    if (!row.document?.fields) return [];
    usage.documents += 1;
    const { entries, ...fields } = row.document.fields;
    const bytes = typeof entries?.bytesValue === 'string' ? Buffer.from(entries.bytesValue, 'base64') : Buffer.alloc(0);
    return [{ ...fromRestFields(fields), entries: new Uint8Array(bytes) } as CatalogIndexPart];
  });
  return (await readCatalogIndex(parts).catch(() => null))?.entries ?? null;
}

/** What the preview of an index line shows, as `toShareProduct` for a product; the photo by its miniature's key */
export function shareProductFromEntry(entry: CatalogEntry, storeName: string): ShareProduct | null {
  if (!SAFE_ID.test(entry.id) || !entry.title || typeof entry.price !== 'number') return null;
  if (isHiddenFromSale(entry as unknown as Product)) return null;
  const p = withStoreNameFields(entry, storeName);
  const photoId = entry.thumb?.startsWith('p:') ? entry.thumb.slice(2) : '';
  const imageKey = photoId && SAFE_ID.test(photoId)
    ? `photo:${photoId}`
    : entry.thumb
      ? `thumb:${entry.thumb}`
      : entry.image
        ? `src:${createHash('sha256').update(entry.image).digest('hex').slice(0, 16)}`
        : '';
  return {
    id: entry.id,
    title: p.title,
    description: p.description ?? '',
    price: entry.price,
    originalPrice: entry.originalPrice,
    available: entry.inStock !== false,
    image: '',
    imageKey,
  };
}

async function readDoc(docPath: string): Promise<Record<string, unknown> | null> {
  const doc = (await restJson(`${DOCUMENTS}/${docPath}`)) as { fields?: Record<string, RestValue> } | null;
  if (doc) usage.documents += 1;
  return doc ? fromRestFields(doc.fields) : null;
}

/**
 * Full photos kept between runs (GitHub Actions cache, `.share-cache/` in the workflows): a photo document never changes,
 * so the build reads only photos it has not seen. `ids.txt` lists the photos in use — the workflows key the cache by it
 */
const PHOTO_CACHE = path.resolve(import.meta.dirname, '..', '.share-cache', 'photos');

async function fullPhoto(photoId: string): Promise<string | null> {
  const file = path.join(PHOTO_CACHE, photoId);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const doc = await readDoc(`product_photos/${encodeURIComponent(photoId)}`).catch(() => null);
  if (typeof doc?.data !== 'string') return null;
  mkdirSync(PHOTO_CACHE, { recursive: true });
  writeFileSync(file, doc.data);
  return doc.data;
}

/** Drops photos no product uses any more and writes the list of those in use */
function prunePhotoCache(inUse: Set<string>) {
  if (!existsSync(PHOTO_CACHE)) return;
  for (const name of readdirSync(PHOTO_CACHE)) if (!inUse.has(name)) rmSync(path.join(PHOTO_CACHE, name));
  writeFileSync(path.join(PHOTO_CACHE, '..', 'ids.txt'), `${[...inUse].sort().join('\n')}\n`);
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * og:image needs a link: a photo stored as data: becomes a file in dist/share/ (its hash in the name, so a new photo is
 * a new link). Without `dist` (the fingerprint run) only the link is computed
 */
function imageUrl(source: string, productId: string, site: string, dist: string | null): string {
  if (/^https:\/\//.test(source)) return source;
  const match = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(source);
  const ext = match && IMAGE_TYPES[match[1]];
  if (!match || !ext) return '';
  const bytes = Buffer.from(match[2], 'base64');
  const name = `${productId}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}.${ext}`;
  if (dist) {
    mkdirSync(path.join(dist, 'share'), { recursive: true });
    writeFileSync(path.join(dist, 'share', name), bytes);
  }
  return `${site}/share/${name}`;
}

async function toShareProduct(
  { product, updatedAt }: { product: Product; updatedAt?: string },
  storeName: string,
  site: string,
  dist: string | null
): Promise<ShareProduct | null> {
  if (!SAFE_ID.test(product.id) || !product.title || typeof product.price !== 'number') return null;
  if (isHiddenFromSale(product)) return null;
  const p = withStoreNameFields(product, storeName);
  // the full photo (product_photos) is sharper in a large preview than the catalog's light copy; the fingerprint run
  // (no `dist`) does not read photos at all — the key says which one the preview shows
  const photoId = product.photoIds?.[0] && SAFE_ID.test(product.photoIds[0]) ? product.photoIds[0] : '';
  const preview = product.images?.[0] ?? '';
  const imageKey = photoId ? `photo:${photoId}` : preview ? `src:${createHash('sha256').update(preview).digest('hex').slice(0, 16)}` : '';
  let image = '';
  if (dist) {
    const source = (photoId ? await fullPhoto(photoId) : null) ?? preview;
    image = source ? imageUrl(source, product.id, site, dist) : '';
  }
  return {
    id: product.id,
    title: p.title,
    description: p.description ?? '',
    price: product.price,
    originalPrice: product.originalPrice,
    available: product.inStock !== false,
    image,
    imageKey,
    updatedAt,
  };
}

interface Catalog {
  storeName: string;
  slogan: string;
  products: ShareProduct[];
  /** The products as the index shows them: the fingerprint is taken from these when there is an index */
  indexed: ShareProduct[] | null;
  /** false — the database did not answer: the pages keep the common preview */
  read: boolean;
}

/**
 * `pages: false` (the hourly check) needs only the fingerprint: with an index the products are not read at all
 */
async function readCatalog(site: string, dist: string | null, pages = true): Promise<Catalog> {
  try {
    const settings = (await readDoc('settings/storefront')) as Partial<StorefrontSettings> | null;
    const storeName = getStoreName(settings);
    const slogan = withStoreName(typeof settings?.storeSlogan === 'string' ? settings.storeSlogan.trim() : '', storeName);
    const entries = await readIndex().catch((err) => {
      console.warn(`::warning::Индекс каталога не прочитан, сверяю по товарам: ${String(err)}`);
      return null;
    });
    const indexed = entries
      ? entries.map((e) => shareProductFromEntry(e, storeName)).filter((p): p is ShareProduct => p !== null)
      : null;
    indexed?.sort((a, b) => a.id.localeCompare(b.id));
    if (indexed && !pages) return { storeName, slogan, products: [], indexed, read: true };
    const rows = await readProducts();
    const products = (await Promise.all(rows.map((row) => toShareProduct(row, storeName, site, dist)))).filter(
      (p): p is ShareProduct => p !== null
    );
    products.sort((a, b) => a.id.localeCompare(b.id));
    if (dist) prunePhotoCache(new Set(products.flatMap((p) => (p.imageKey?.startsWith('photo:') ? [p.imageKey.slice(6)] : []))));
    return { storeName, slogan, products, indexed, read: true };
  } catch (err) {
    console.warn(`::warning::Каталог не прочитан, страницы товаров не созданы (общее превью магазина): ${String(err)}`);
    return { storeName: getStoreName(null), slogan: '', products: [], indexed: null, read: false };
  }
}

/**
 * What the previews show (docs/seo-plan.md, stage 3): the scheduled workflow publishes Hosting again only when it
 * changes. Without the edit date: a sale changes the product's stock and its date, not its preview. The photo is
 * compared by its key: the hourly check does not download photos (docs/catalog-scale-plan.md, stage 1)
 */
export function catalogFingerprint(c: Pick<Catalog, 'storeName' | 'slogan' | 'products'> & { indexed?: ShareProduct[] | null }): string {
  // the index (stage 3) when there is one: the check reads one document; the build compares the same thing
  const products = (c.indexed ?? c.products).map(({ updatedAt: _updatedAt, image: _image, ...shown }) => shown);
  const shown = c.indexed ? { source: 'index', storeName: c.storeName, slogan: c.slogan, products } : { storeName: c.storeName, slogan: c.slogan, products };
  return createHash('sha256').update(JSON.stringify(shown)).digest('hex');
}

export const MANIFEST_FILE = 'share-manifest.json';

const usageLine = () => `Firestore: ${usage.documents} документов, ${Math.round(usage.bytes / 1024)} КБ`;

function siteUrl(): string {
  return (process.env.SITE_URL || `https://${firebaseConfig.projectId}.web.app`).replace(/\/+$/, '');
}

async function main() {
  const site = siteUrl();
  // `--fingerprint`: print what the previews would show, write nothing (share-pages.yml compares it with the site's)
  if (process.argv.includes('--fingerprint')) {
    const catalog = await readCatalog(site, null, false);
    if (!catalog.read) process.exit(1);
    console.log(catalogFingerprint(catalog));
    // stdout is the fingerprint (share-pages.yml reads it): the usage goes to stderr
    console.error(usageLine());
    return;
  }
  const dist = path.resolve(import.meta.dirname, '..', 'dist');
  const indexPath = path.join(dist, 'index.html');
  if (!existsSync(indexPath)) throw new Error('dist/index.html is missing: run `bun run build` first');
  const noindex = process.env.VITE_PREVIEW_BUILD === 'true';
  const indexHtml = readFileSync(indexPath, 'utf8');
  const catalog = await readCatalog(site, dist);
  const { storeName, slogan, products } = catalog;

  writeFileSync(
    indexPath,
    withMeta(indexHtml, metaBlock({
      title: homeDocumentTitle(storeName),
      description: storeDescription(storeName, slogan),
      url: `${site}/`,
      type: 'website',
      siteName: storeName,
      image: storeCover(site, storeName),
      noindex,
    }))
  );
  for (const screen of INDEXED_SCREENS) {
    writeFileSync(path.join(dist, `${screen}.html`), withMeta(indexHtml, screenMeta(screen, site, storeName, noindex)));
  }
  mkdirSync(path.join(dist, 'product'), { recursive: true });
  for (const p of products) {
    writeFileSync(path.join(dist, 'product', `${p.id}.html`), withMeta(indexHtml, productMeta(p, site, storeName, noindex)));
  }
  writeFileSync(path.join(dist, 'sitemap.xml'), sitemapXml(site, noindex ? [] : products));
  writeFileSync(path.join(dist, 'robots.txt'), robotsTxt(site, noindex));
  // A build without the catalog has no fingerprint: the next scheduled run publishes the pages
  writeFileSync(
    path.join(dist, MANIFEST_FILE),
    `${JSON.stringify({ fingerprint: catalog.read ? catalogFingerprint(catalog) : null, products: products.length })}\n`
  );
  console.log(`share pages: ${products.length} товаров, адрес ${site}${noindex ? ' (проверочная версия, noindex)' : ''}`);
  console.log(usageLine());
}

if (import.meta.main) await main();
