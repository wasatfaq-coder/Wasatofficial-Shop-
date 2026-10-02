// Фото строки заказа — только из каталога (аудит 02.10, находка 3): ссылку из самого заказа пишет посетитель
import { describe, expect, test } from 'bun:test';
import { orderLineImage, PRODUCT_IMAGE_PLACEHOLDER } from '../../src/utils/productImage';

describe('orderLineImage', () => {
  const catalog = [{ id: 'p1', images: ['https://shop.example/p1.jpg'] }];
  test('the photo comes from the catalog', () => {
    expect(orderLineImage({ id: 'p1' }, catalog)).toBe('https://shop.example/p1.jpg');
  });
  test('a link stored in the order is never shown, even when the product is gone', () => {
    const line = { id: 'gone', images: ['https://attacker.example/pixel.gif'] };
    expect(orderLineImage(line, catalog)).toBe(PRODUCT_IMAGE_PLACEHOLDER);
    expect(orderLineImage(line)).toBe(PRODUCT_IMAGE_PLACEHOLDER);
  });
});
