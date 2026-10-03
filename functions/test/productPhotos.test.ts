// Этап 6 (находка 18): в товаре — превью, полные фото — документы product_photos
import { describe, expect, test } from 'bun:test';
import { droppedPhotoIds, hasHeavyPhotos, isHeavyPhoto, splitProductPhotos, storedImagesEstimate } from '../../src/utils/productPhotos';

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
});
