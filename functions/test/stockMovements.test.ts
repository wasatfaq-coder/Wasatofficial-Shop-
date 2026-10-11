// Журнал склада в базе (находка 17): записи заказа — по одной на строку, без строк предзаказа
import { describe, expect, test } from 'bun:test';
import { adjustedOrderShortfall, orderHeldStock, orderMovementId, orderStockMovements } from '../../src/shared/stockMovements';
import { skuCodeForLine } from '../../src/utils/inventory';
import type { CartItem, Product } from '../../src/types';

const shirt = {
  id: 'p1', title: 'Рубашка', price: 4000, category: 'shirts', inStock: true,
  skus: [{ id: 'p1-m', color: 'Белый', size: 'M', stock: 5, skuCode: 'WS-P1-BEL-M' }],
} as unknown as Product;
const line = (quantity: number, extra: Partial<CartItem> = {}): CartItem =>
  ({ id: 'l', product: { id: 'p1', title: 'Рубашка' }, quantity, selectedColor: 'Белый', selectedSize: 'M', ...extra }) as CartItem;

describe('orderStockMovements', () => {
  test('one entry per line taken from stock, with the id the rules expect', () => {
    const at = new Date('2026-09-30T12:00:00Z');
    const order = { id: 'WS-1', customerName: 'Иван', items: [line(2), line(1, { isPreorder: true }), line(3)] };
    const movements = orderStockMovements(order, at, (l) => skuCodeForLine([shirt], l));
    expect(movements.map((m) => m.id)).toEqual([orderMovementId('WS-1', 0), 'WS-1_2']);
    expect(movements[0]).toMatchObject({
      type: 'order', orderId: 'WS-1', lineIndex: 0, productId: 'p1', changeQuantity: -2,
      skuCode: 'WS-P1-BEL-M', operator: 'Покупатель', createdAt: '2026-09-30T12:00:00.000Z', reason: 'Заказ #WS-1',
    });
    // the customer's browser does not know the stock before and after: the fields are left out, not guessed
    expect(movements[0].previousStock).toBeUndefined();
    expect(movements[0].newStock).toBeUndefined();
  });
});

// аудит 07.10, находка 2: после «Правки состава» строки сдвигаются, а записи {заказ}_{строка} остаются прежними
describe('an order after «Правка состава» — by variant, not by line number', () => {
  const entry = (productId: string, color: string, size: string, changeQuantity: number) =>
    ({ productId, productTitle: productId, color, size, changeQuantity });
  const item = (productId: string, color: string, size: string, quantity: number, extra: Partial<CartItem> = {}) =>
    ({ id: `${productId}-${size}`, product: { id: productId, title: productId }, quantity, selectedColor: color, selectedSize: size, ...extra }) as CartItem;

  test('held stock sums every entry of the order: write-off, adjustment, return', () => {
    const held = orderHeldStock([
      entry('p1', 'Белый', 'M', -2), // {заказ}_0
      entry('p2', 'Синий', 'L', -1), // {заказ}_1
      entry('p1', 'белый ', 'M', 1), // «Правка состава»: one back
      entry('p3', 'Чёрный', 'S', -3), // «Правка состава»: a new line
    ]);
    expect(held.get('p1|белый|m')?.held).toBe(1);
    expect(held.get('p2|синий|l')?.held).toBe(1);
    expect(held.get('p3|чёрный|s')?.held).toBe(3);
  });

  test('line 0 removed and a line added: nothing is «не списан», cancelling returns what is held', () => {
    // the order was [p1 ×2, p2 ×1]; the admin removed p1 (returned) and added p3 ×3 — now [p2 ×1, p3 ×3]
    const held = orderHeldStock([
      entry('p1', 'Белый', 'M', -2),
      entry('p2', 'Синий', 'L', -1),
      entry('p1', 'Белый', 'M', 2),
      entry('p3', 'Чёрный', 'S', -3),
    ]);
    const items = [item('p2', 'Синий', 'L', 1), item('p3', 'Чёрный', 'S', 3)];
    // by line number, line 1 (p3) has the entry {заказ}_1 of p2 and would look short, the new line 2 would not exist
    expect(adjustedOrderShortfall(items, held)).toEqual({ missing: [], short: [] });
    const toReturn = [...held.values()].filter((v) => v.held > 0).map((v) => [v.productId, v.held]);
    expect(toReturn).toEqual([['p2', 1], ['p3', 3]]);
  });

  test('a variant with nothing taken is «не списан», one taken short is «не хватило»; preorder is not taken', () => {
    const held = orderHeldStock([entry('p1', 'Белый', 'M', -1)]);
    const items = [
      item('p1', 'Белый', 'M', 3),
      item('p4', 'Серый', 'XL', 2),
      item('p5', 'Серый', 'XL', 1, { isPreorder: true }),
    ];
    expect(adjustedOrderShortfall(items, held)).toEqual({
      missing: [1],
      short: [{ lineIndex: 0, taken: 1, ordered: 3 }],
    });
  });
});
