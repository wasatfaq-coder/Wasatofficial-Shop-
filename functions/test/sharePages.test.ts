// Страницы-превью товаров для мессенджеров и поисковиков (docs/seo-plan.md, этап 1): scripts/share-pages.ts
import { describe, expect, test } from 'bun:test';
import {
  catalogFingerprint,
  fromRest,
  metaBlock,
  productJsonLd,
  productMeta,
  productSummary,
  robotsTxt,
  shareProductFromEntry,
  shortText,
  sitemapXml,
  withMeta,
  type ShareProduct,
} from '../../scripts/share-pages';
import { catalogEntry } from '../../src/utils/catalogIndex';
import type { Product } from '../../src/types';

const SITE = 'https://shop.example';
const product: ShareProduct = {
  id: 'linen-shirt-01',
  title: 'Рубашка «Лён» <b>',
  description: 'Лёгкая рубашка из льна.\nСвободный крой, перламутровые пуговицы.',
  price: 2990,
  available: true,
  image: 'https://img.example/a.jpg?w=800&q=80',
};

describe('превью товара', () => {
  test('текст из базы не становится разметкой', () => {
    const html = productMeta({ ...product, description: '"><script>alert(1)</script>' }, SITE, 'Wasat Shop', false);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<b>');
    expect(html).toContain('Рубашка «Лён» &lt;b&gt; — Wasat Shop');
    expect(html).toContain('content="https://img.example/a.jpg?w=800&amp;q=80"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/product/linen-shirt-01" />`);
  });

  test('товар без фото — с обложкой магазина', () => {
    const html = productMeta({ ...product, image: '' }, SITE, 'Wasat Shop', false);
    expect(html).toContain(`<meta property="og:image" content="${SITE}/og-image.png" />`);
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  test('JSON-LD не закрывает тег script текстом товара', () => {
    const ld = productJsonLd({ ...product, description: '</script><script>alert(1)</script>' }, `${SITE}/product/x`);
    expect(ld.match(/<\/script>/g)).toHaveLength(1);
    const data = JSON.parse(ld.replace(/^<script[^>]*>|<\/script>$/g, ''));
    expect(data.offers).toEqual({
      '@type': 'Offer',
      url: `${SITE}/product/x`,
      price: 2990,
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
    });
  });

  test('описание: цена, старая цена, наличие и текст одной строкой', () => {
    // Intl ставит между разрядами неразрывный пробел
    const summary = (p: ShareProduct) => productSummary(p).replace(/\u00a0/g, ' ');
    expect(summary(product)).toBe('2 990 ₽ · Лёгкая рубашка из льна. Свободный крой, перламутровые пуговицы.');
    expect(summary({ ...product, originalPrice: 3990, available: false, description: '' })).toBe(
      '2 990 ₽ (было 3 990 ₽) · нет в наличии'
    );
  });

  test('длинный текст режется по слову', () => {
    const text = shortText('слово '.repeat(60), 30);
    expect(text.length).toBeLessThanOrEqual(30);
    expect(text).toBe('слово слово слово слово слово…');
  });

  test('проверочная версия закрыта от поисковиков', () => {
    const shell = metaBlock({ title: 't', description: 'd', url: SITE, type: 'website', siteName: 's', noindex: true });
    expect(shell).toContain('<meta name="robots" content="noindex, nofollow" />');
    // the shell is served for every screen's path: a canonical would glue them all to the root
    expect(shell).not.toContain('rel="canonical"');
    expect(robotsTxt(SITE, true)).toBe('User-agent: *\nDisallow: /\n');
    expect(robotsTxt(SITE, false)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test('блок заменяется в index.html целиком', () => {
    const html = '<head>\n<!-- seo:start -->\n<title>old</title>\n<!-- seo:end -->\n</head>';
    expect(withMeta(html, '<title>$& new</title>')).toBe('<head>\n<!-- seo:start -->\n    <title>$& new</title>\n    <!-- seo:end -->\n</head>');
    expect(() => withMeta('<head></head>', '')).toThrow();
  });

  test('sitemap: главная и товары с датой изменения', () => {
    const xml = sitemapXml(SITE, [{ ...product, updatedAt: '2026-10-02T10:00:00Z' }]);
    expect(xml).toContain(`<url><loc>${SITE}/</loc></url>`);
    expect(xml).toContain(`<url><loc>${SITE}/catalog</loc></url>`);
    expect(xml).toContain(`<url><loc>${SITE}/product/linen-shirt-01</loc><lastmod>2026-10-02</lastmod></url>`);
  });

  test('значения Firestore REST', () => {
    expect(
      fromRest({
        mapValue: {
          fields: {
            price: { integerValue: '3290' },
            images: { arrayValue: { values: [{ stringValue: 'a' }] } },
            skus: { arrayValue: {} },
            hiddenFromSale: { booleanValue: false },
          },
        },
      })
    ).toEqual({ price: 3290, images: ['a'], skus: [], hiddenFromSale: false });
  });

  test('отпечаток каталога меняется от цены, но не от даты правки', () => {
    const base = { storeName: 'Wasat Shop', slogan: '', products: [{ ...product, updatedAt: '2026-10-01T00:00:00Z' }] };
    const fp = catalogFingerprint(base);
    // продажа меняет остаток и дату товара, а превью — нет
    expect(catalogFingerprint({ ...base, products: [{ ...product, updatedAt: '2026-10-03T00:00:00Z' }] })).toBe(fp);
    expect(catalogFingerprint({ ...base, products: [{ ...product, price: 2490 }] })).not.toBe(fp);
    expect(catalogFingerprint({ ...base, storeName: 'Другое имя' })).not.toBe(fp);
  });

  test('отпечаток сравнивает фото по ключу: проверка раз в час не скачивает фото', () => {
    const base = { storeName: 'Wasat Shop', slogan: '', products: [{ ...product, imageKey: 'photo:linen_a1' }] };
    const fp = catalogFingerprint(base);
    // проверка без фото (image пустой) и сборка с адресом фото дают один отпечаток
    expect(catalogFingerprint({ ...base, products: [{ ...product, image: '', imageKey: 'photo:linen_a1' }] })).toBe(fp);
    // новое фото получает новый id — превью надо опубликовать заново
    expect(catalogFingerprint({ ...base, products: [{ ...product, imageKey: 'photo:linen_b2' }] })).not.toBe(fp);
  });

  test('проверка раз в час сверяет индекс каталога: отпечаток от остатка не меняется, от цены и нового фото — меняется', () => {
    const p = {
      id: 'linen-shirt-01', title: 'Рубашка', category: 'shirts', categoryLabel: 'Рубашка', price: 2990, description: 'Лён',
      material: 'Лён', images: ['data:image/jpeg;base64,AAAA'], photoIds: ['linen_a1'], colors: [], sizes: ['M'], inStock: true,
      skus: [{ id: 'm', color: '', size: 'M', stock: 3 }], rating: 0, reviewsCount: 0,
    } as Product;
    const share = (x: Product) => shareProductFromEntry(catalogEntry(x), 'Wasat Shop')!;
    expect(share(p)).toMatchObject({ title: 'Рубашка', price: 2990, available: true, imageKey: 'photo:linen_a1' });
    const fp = (x: Product) => catalogFingerprint({ storeName: 'Wasat Shop', slogan: '', products: [], indexed: [share(x)] });
    expect(fp({ ...p, skus: [{ id: 'm', color: '', size: 'M', stock: 1 }] })).toBe(fp(p));
    expect(fp({ ...p, price: 2490 })).not.toBe(fp(p));
    expect(fp({ ...p, photoIds: ['linen_b2'] })).not.toBe(fp(p));
    // снятый с витрины товар в превью не попадает, как и при чтении товаров
    expect(shareProductFromEntry(catalogEntry({ ...p, hiddenFromSale: true }), 'Wasat Shop')).toBeNull();
    // отпечаток по индексу не совпадает с отпечатком по товарам: смена источника публикует превью один раз
    expect(fp(p)).not.toBe(catalogFingerprint({ storeName: 'Wasat Shop', slogan: '', products: [share(p)] }));
  });
});
