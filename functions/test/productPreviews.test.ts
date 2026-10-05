// Превью фото вне документа товара (docs/catalog-scale-plan.md, этап 6): src/utils/productPreviews.ts
import { describe, expect, test } from 'bun:test';
import type { Product } from '../../src/types';
import { thumbKey } from '../../src/utils/catalogIndex';
import { parseProductsFromCSV } from '../../src/utils/csvHelpers';
import { hasInlinePreviews, previewsMoved, splitProductPreviews, withProductPreviews } from '../../src/utils/productPreviews';

const A = 'data:image/jpeg;base64,AAAA';
const B = 'data:image/webp;base64,BBBB';
const link = 'https://example.com/photo.jpg';
const product = (over: Partial<Product> = {}): Product =>
  ({ id: 'p1', title: 'Рубашка', price: 2990, images: [A, link, B], photoIds: ['p1_a', '', 'p1_b'], ...over }) as Product;

describe('превью товара', () => {
  test('превью уходят в отдельный документ, ссылки остаются в товаре', () => {
    const { stored, previews } = splitProductPreviews(product());
    expect(previews).toEqual({ productId: 'p1', images: [A, '', B] });
    expect(stored.images).toEqual(['', link, '']);
    expect(stored.photoIds).toEqual(['p1_a', '', 'p1_b']);
    expect(stored.previewKey).toBeTruthy();
    expect(hasInlinePreviews(stored)).toBe(false);
    expect(previewsMoved(stored)).toBe(true);
  });

  test('прочитанные превью возвращаются на место, и тот же товар даёт тот же хэш', () => {
    const { stored, previews } = splitProductPreviews(product());
    const shown = withProductPreviews(stored, previews);
    expect(shown.images).toEqual([A, link, B]);
    expect(splitProductPreviews(shown).stored.previewKey).toBe(stored.previewKey);
    expect(splitProductPreviews(product({ images: [B, link, A] })).stored.previewKey).not.toBe(stored.previewKey);
  });

  test('товар без фото внутри не меняется', () => {
    const plain = product({ images: [link], photoIds: undefined });
    expect(splitProductPreviews(plain)).toEqual({ stored: plain, previews: null });
  });

  test('товар, у которого прочитана только часть превью, не сохраняется: остальные пропали бы', () => {
    const { stored } = splitProductPreviews(product());
    const partly = { ...stored, images: [A, link, ''] };
    expect(() => splitProductPreviews(partly)).toThrow();
  });

  test('миниатюра не перестраивается из-за переноса превью, если есть полное фото', () => {
    const { stored } = splitProductPreviews(product());
    expect(thumbKey(stored)).toBe(thumbKey(product()));
    const noPhoto = product({ photoIds: undefined });
    expect(thumbKey(splitProductPreviews(noPhoto).stored)).toMatch(/^v:/);
    expect(thumbKey(product({ images: [link] }))).toBe('');
  });
});

describe('импорт CSV и перенесённые превью', () => {
  const csv = (image: string) =>
    `ID,Название,Категория,Цена,Старая цена,В наличии,Остаток,Размеры,Цвета,Картинка,Описание\np1,Рубашка,shirts,4000,,Да,0,M,,${image},`;

  test('пустая ячейка фото у товара из каталога оставляет его фото, новый товар без фото пропускается', () => {
    const catalog = [{ id: 'p1', colors: [] }] as unknown as Product[];
    const kept = parseProductsFromCSV(csv(''), catalog);
    expect(kept.products).toHaveLength(1);
    expect('images' in kept.products[0]).toBe(false);
    expect(parseProductsFromCSV(csv(''), []).skipped).toBe(1);
    expect(parseProductsFromCSV(csv(link), catalog).products[0].images).toEqual([link]);
  });
});
