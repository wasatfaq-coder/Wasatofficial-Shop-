// Лёгкий индекс каталога (docs/catalog-scale-plan.md, этап 2): src/utils/catalogIndex.ts
import { describe, expect, test } from 'bun:test';
import type { Product } from '../../src/types';
import { buildCatalogIndex, catalogEntry, catalogIndexParts, readCatalogIndex, thumbKey } from '../../src/utils/catalogIndex';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  title: 'Рубашка льняная',
  category: 'shirts',
  categoryLabel: 'Рубашки',
  price: 2990,
  description: 'Лёгкая рубашка из льна',
  material: 'Лён',
  images: ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'],
  photoIds: ['p1_a', 'p1_b'],
  colors: [{ name: 'Бежевый', hex: '#D8C8A8' }],
  sizes: ['S', 'M', 'L'],
  inStock: true,
  skus: [
    { id: 's', color: 'Бежевый', size: 'S', stock: 0 },
    { id: 'm', color: 'Бежевый', size: 'M', stock: 2 },
    { id: 'l', color: 'Бежевый', size: 'L', stock: 1 },
  ],
  rating: 4.9,
  reviewsCount: 42,
  ...over,
});

describe('индекс каталога', () => {
  test('строка товара: размеры в наличии, рейтинг только по настоящим отзывам, без фото и вариантов', () => {
    const entry = catalogEntry(product());
    expect(entry.availableSizes).toEqual(['M', 'L']);
    expect(entry.available).toBe(true);
    expect(entry.hidden).toBe(false);
    // 4.9 и 42 в товаре — не отзывы: рейтинга нет
    expect(entry.rating).toBeUndefined();
    expect(entry.thumb).toBe('p:p1_a');
    expect(entry.photoCount).toBe(2);
    expect(JSON.stringify(entry)).not.toContain('base64');
    expect('skus' in entry).toBe(false);

    const review = (id: string, rating: number) => ({ id, authorName: id, rating, date: '', comment: '' });
    const reviewed = catalogEntry(product({ reviews: [review('r1', 4), review('r2', 5)] }));
    expect(reviewed.rating).toBe(4.5);
    expect(reviewed.reviewsCount).toBe(2);
  });

  test('снятый с витрины и распроданный товар: в наличии ни одного размера', () => {
    expect(catalogEntry(product({ hiddenFromSale: true })).availableSizes).toEqual([]);
    expect(catalogEntry(product({ hiddenFromSale: true })).hidden).toBe(true);
    const soldOut = catalogEntry(product({ skus: product().skus!.map((s) => ({ ...s, stock: 0 })) }));
    expect(soldOut.available).toBe(false);
    expect(soldOut.availableSizes).toEqual([]);
  });

  test('миниатюра: по id полного фото, по хэшу лёгкого фото, ссылка — без миниатюры', () => {
    expect(thumbKey(product())).toBe('p:p1_a');
    const light = thumbKey(product({ photoIds: [] }));
    expect(light).toMatch(/^h:[0-9a-f]{13}$/);
    expect(thumbKey(product({ photoIds: [], images: ['data:image/jpeg;base64,CCCC'] }))).not.toBe(light);
    const link = catalogEntry(product({ images: ['https://img.example/a.jpg'], photoIds: [] }));
    expect(link.thumb).toBeUndefined();
    expect(link.image).toBe('https://img.example/a.jpg');
    expect(thumbKey(product({ images: [] }))).toBe('');
  });

  test('хэш не зависит от порядка товаров и меняется от цены, остатка и отзыва', () => {
    const a = product();
    const b = product({ id: 'p2', title: 'Поло' });
    const { hash } = buildCatalogIndex([a, b]);
    expect(buildCatalogIndex([b, a]).hash).toBe(hash);
    expect(buildCatalogIndex([{ ...a, price: 2490 }, b]).hash).not.toBe(hash);
    expect(buildCatalogIndex([{ ...a, skus: a.skus!.map((s) => ({ ...s, stock: 0 })) }, b]).hash).not.toBe(hash);
  });

  test('части сжимаются и читаются обратно; части разных записей не смешиваются', async () => {
    const products = Array.from({ length: 50 }, (_, i) => product({ id: `p${i}`, title: `Товар ${i}` }));
    const { entries, hash } = buildCatalogIndex(products);
    const parts = await catalogIndexParts(entries, hash);
    expect(parts).toHaveLength(1);
    expect(parts[0].entries.byteLength).toBeLessThan(JSON.stringify(entries).length);
    const back = await readCatalogIndex(parts);
    expect(back?.hash).toBe(hash);
    expect(back?.entries).toEqual(entries);

    expect(await readCatalogIndex([])).toBeNull();
    expect(await readCatalogIndex([{ ...parts[0], parts: 2 }])).toBeNull();
    expect(await readCatalogIndex([{ ...parts[0], format: 0 }])).toBeNull();
  });
});
