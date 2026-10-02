// Журнал склада в базе (находка 17): записи заказа — по одной на строку, без строк предзаказа
import { describe, expect, test } from 'bun:test';
import { orderMovementId, orderStockMovements } from '../../src/shared/stockMovements';
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
