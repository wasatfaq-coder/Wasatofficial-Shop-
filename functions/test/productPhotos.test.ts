// Этап 6 (находка 18): в товаре — превью, полные фото — документы product_photos
import { describe, expect, test } from 'bun:test';
import {
  copyProductPhotos,
  droppedPhotoIds,
  hasHeavyPhotos,
  isHeavyPhoto,
  removedProductPhotoIds,
  splitProductPhotos,
  storedImagesEstimate,
  unusedPhotoIds,
} from '../../src/utils/productPhotos';

const heavy = 'data:image/jpeg;base64,' + 'A'.repeat(200_000);
const light = 'data:image/jpeg;base64,' + 'A'.repeat(10_000);
const link = 'https://example.com/photo.jpg';

describe('productPhotos', () => {
  test('only a heavy photo inside the product is moved out', () => {
    expect(isHeavyPhoto(heavy)).toBe(true);
    expect(isHeavyPhoto(light)).toBe(false);
    expect(isHeavyPhoto(link)).toBe(false);
    expect(hasHeavyPhotos({ images: [link, heavy] })).toBe(true);
    // already moved: the preview has a photo id
    expect(hasHeavyPhotos({ images: [link, heavy], photoIds: ['', 'p1_x'] })).toBe(false);
  });

  test('photos that stayed keep their documents; links and light photos stay in the product', async () => {
    const result = await splitProductPhotos('p1', [link, light, 'preview-1'], new Map([['preview-1', 'p1_old']]));
    expect(result).toEqual({ images: [link, light, 'preview-1'], photoIds: ['', '', 'p1_old'], newPhotos: [] });
  });

  test('removed photos are dropped, the size counts a heavy photo as its preview', () => {
    expect(droppedPhotoIds({ photoIds: ['p1_a', '', 'p1_b'] }, ['p1_b', ''])).toEqual(['p1_a']);
    expect(droppedPhotoIds(undefined, ['p1_b'])).toEqual([]);
    const sized = storedImagesEstimate([heavy, link]);
    expect(sized[0].length).toBe(45_000);
    expect(sized[1]).toBe(link);
  });

  // Дорожная карта, «Риски»: копия товара делила документы фото с оригиналом, удалённый товар оставлял свои фото
  test('a copy gets its own photo documents; a photo that was not read stays a preview', () => {
    const copy = copyProductPhotos('p2', ['p1_a', '', 'p1_gone'], { p1_a: heavy });
    expect(copy.newPhotos).toHaveLength(1);
    expect(copy.newPhotos[0]).toEqual({ id: copy.photoIds[0], productId: 'p2', data: heavy });
    expect(copy.photoIds[0].startsWith('p2_')).toBe(true);
    expect(copy.photoIds.slice(1)).toEqual(['', '']);
    // removing the photo from the copy drops only the copy's document
    expect(droppedPhotoIds({ photoIds: copy.photoIds }, [])).toEqual([copy.photoIds[0]]);
    expect(copyProductPhotos('p2', undefined, {})).toEqual({ photoIds: [], newPhotos: [] });
  });

  test("a removed product's photos are deleted, unless another product still shows them", () => {
    const original = { id: 'p1', photoIds: ['p1_a', 'p1_b'] };
    const oldCopy = { id: 'p2', photoIds: ['p1_a', ''] }; // made before the fix: shares p1_a
    expect(removedProductPhotoIds([original, oldCopy], [oldCopy])).toEqual(['p1_b']);
    expect(removedProductPhotoIds([original, oldCopy], [])).toEqual(['p1_a', 'p1_b']);
    expect(removedProductPhotoIds([original], [original])).toEqual([]);
    expect(removedProductPhotoIds([{ id: 'p3' }], [])).toEqual([]);
    // editing the original keeps a photo the old copy shows
    expect(unusedPhotoIds(droppedPhotoIds(original, ['p1_b']), [oldCopy])).toEqual([]);
  });
});
