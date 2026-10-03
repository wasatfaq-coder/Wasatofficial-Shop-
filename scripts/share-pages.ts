// Страницы-превью товаров для мессенджеров и поисковиков (docs/seo-plan.md, этап 1). Запускается после `vite build`
// (`bun run build:share`, deploy.yml): читает каталог из боевой базы как любой посетитель (без ключей и записи) и пишет
// в dist/ product/{id}.html (заголовок, описание, фото и цена товара в <head>), sitemap.xml и robots.txt.
// Боты Telegram и WhatsApp не выполняют JS: превью товара может быть только в HTML, который отдаёт Hosting. Приложение
// на этой странице то же (index.html), оно открывает экран товара по адресу (src/utils/navigation.ts). Каталог меняется
// в админке между деплоями: новый товар до следующей сборки открывается по общей странице магазина (rewrite на
// index.html), только превью у ссылки общее.
// Без сети или при ошибке базы сборка не падает: остаются общие описание, sitemap и robots.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import firebaseConfig from '../firebase-applet-config.json';
import type { Product, StorefrontSettings } from '../src/types';
import { isHiddenFromSale } from '../src/utils/inventory';
import { getStoreName, withStoreName, withStoreNameFields } from '../src/utils/storeContacts';

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
  /** Absolute URL of the photo for og:image, '' — no photo */
  image: string;
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
    title: `${p.title} — ${siteName}`,
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

async function restJson(url: string, init?: RequestInit): Promise<unknown> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}key=${firebaseConfig.apiKey}`, { ...init, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function readProducts(): Promise<{ product: Product; updatedAt?: string }[]> {
  // runQuery, not a collection GET: the REST list endpoint is refused to anonymous visitors even with «allow read: if true»
  const rows = (await restJson(`${DOCUMENTS}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'products' }] } }),
  })) as { document?: { name: string; fields?: Record<string, RestValue>; updateTime?: string } }[];
  return rows.flatMap((row) => {
    if (!row.document) return [];
    const id = row.document.name.split('/').pop()!;
    return [{ product: { ...fromRestFields(row.document.fields), id } as unknown as Product, updatedAt: row.document.updateTime }];
  });
}

async function readDoc(docPath: string): Promise<Record<string, unknown> | null> {
  const doc = (await restJson(`${DOCUMENTS}/${docPath}`)) as { fields?: Record<string, RestValue> } | null;
  return doc ? fromRestFields(doc.fields) : null;
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** og:image needs a link: a photo stored as data: becomes a file in dist/share/ (its hash in the name, so a new photo is a new link) */
function imageUrl(source: string, productId: string, site: string, dist: string): string {
  if (/^https:\/\//.test(source)) return source;
  const match = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(source);
  const ext = match && IMAGE_TYPES[match[1]];
  if (!match || !ext) return '';
  const bytes = Buffer.from(match[2], 'base64');
  const name = `${productId}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}.${ext}`;
  mkdirSync(path.join(dist, 'share'), { recursive: true });
  writeFileSync(path.join(dist, 'share', name), bytes);
  return `${site}/share/${name}`;
}

async function toShareProduct(
  { product, updatedAt }: { product: Product; updatedAt?: string },
  storeName: string,
  site: string,
  dist: string
): Promise<ShareProduct | null> {
  if (!SAFE_ID.test(product.id) || !product.title || typeof product.price !== 'number') return null;
  if (isHiddenFromSale(product)) return null;
  const p = withStoreNameFields(product, storeName);
  // the full photo (product_photos) is sharper in a large preview than the catalog's light copy
  const photoId = product.photoIds?.[0];
  const fullPhoto = photoId ? await readDoc(`product_photos/${encodeURIComponent(photoId)}`).catch(() => null) : null;
  const source = typeof fullPhoto?.data === 'string' ? fullPhoto.data : product.images?.[0] ?? '';
  return {
    id: product.id,
    title: p.title,
    description: p.description ?? '',
    price: product.price,
    originalPrice: product.originalPrice,
    available: product.inStock !== false,
    image: source ? imageUrl(source, product.id, site, dist) : '',
    updatedAt,
  };
}

async function main() {
  const dist = path.resolve(import.meta.dirname, '..', 'dist');
  const indexPath = path.join(dist, 'index.html');
  if (!existsSync(indexPath)) throw new Error('dist/index.html is missing: run `bun run build` first');
  const site = (process.env.SITE_URL || `https://${firebaseConfig.projectId}.web.app`).replace(/\/+$/, '');
  const noindex = process.env.VITE_PREVIEW_BUILD === 'true';
  const indexHtml = readFileSync(indexPath, 'utf8');

  let storeName = getStoreName(null);
  let slogan = '';
  let products: ShareProduct[] = [];
  try {
    const settings = (await readDoc('settings/storefront')) as Partial<StorefrontSettings> | null;
    storeName = getStoreName(settings);
    slogan = withStoreName(typeof settings?.storeSlogan === 'string' ? settings.storeSlogan.trim() : '', storeName);
    const rows = await readProducts();
    products = (await Promise.all(rows.map((row) => toShareProduct(row, storeName, site, dist)))).filter(
      (p): p is ShareProduct => p !== null
    );
  } catch (err) {
    console.warn(`::warning::Каталог не прочитан, страницы товаров не созданы (общее превью магазина): ${String(err)}`);
  }

  writeFileSync(
    indexPath,
    withMeta(indexHtml, metaBlock({
      title: `${storeName} — мужская одежда`,
      description: storeDescription(storeName, slogan),
      url: `${site}/`,
      type: 'website',
      siteName: storeName,
      image: storeCover(site, storeName),
      noindex,
    }))
  );
  mkdirSync(path.join(dist, 'product'), { recursive: true });
  for (const p of products) {
    writeFileSync(path.join(dist, 'product', `${p.id}.html`), withMeta(indexHtml, productMeta(p, site, storeName, noindex)));
  }
  writeFileSync(path.join(dist, 'sitemap.xml'), sitemapXml(site, noindex ? [] : products));
  writeFileSync(path.join(dist, 'robots.txt'), robotsTxt(site, noindex));
  console.log(`share pages: ${products.length} товаров, адрес ${site}${noindex ? ' (проверочная версия, noindex)' : ''}`);
}

if (import.meta.main) await main();
