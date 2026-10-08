// «Аналитика» → «Топ товаров» (аудит 07.10, находка 7): фото — только из каталога, как в «Заказах». Строку заказа
// пишет посетитель, и ссылка из неё открылась бы у владельца — чужой сервер узнал бы его IP
import { describe, expect, test } from 'bun:test';
import { computePeriodBreakdown } from '../../src/utils/analyticsEngine';
import { orderLineImage, PRODUCT_IMAGE_PLACEHOLDER } from '../../src/utils/productImage';
import type { Order } from '../../src/types';

const PIXEL = 'https://attacker.example/pixel.gif';
const fakeOrder = {
  id: 'WS-FAKE1',
  status: 'accepted',
  totalPrice: 20000,
  items: [{ product: { id: 'p1', title: 'Пальто', price: 10000, images: [PIXEL] }, quantity: 2 }],
} as unknown as Order;

describe('top products of the period', () => {
  test('carry no picture from the order: only id, title and numbers', () => {
    const { topProducts } = computePeriodBreakdown([fakeOrder]);
    expect(topProducts).toEqual([{ id: 'p1', title: 'Пальто', quantity: 2, revenue: 20000 }]);
    expect(JSON.stringify(topProducts)).not.toContain('attacker.example');
  });

  test('the screen draws the catalog photo by id, the placeholder when the product is gone — never the link', () => {
    const [top] = computePeriodBreakdown([fakeOrder]).topProducts;
    expect(orderLineImage(top, [{ id: 'p1', images: ['https://shop.example/p1.jpg'] }])).toBe('https://shop.example/p1.jpg');
    expect(orderLineImage(top, [])).toBe(PRODUCT_IMAGE_PLACEHOLDER);
    expect(orderLineImage({ ...top, images: [PIXEL] } as { id: string }, [])).toBe(PRODUCT_IMAGE_PLACEHOLDER);
  });
});
