// Отмена заказа («Доработки 3», задание владельца 02.10): кто и когда может отменить, «Архив», возврат на склад
import { describe, expect, test } from 'bun:test';
import {
  ARCHIVE_AFTER_MS,
  canCustomerCancel,
  cancelReasonText,
  cancelledByLabel,
  cancelledShare,
  customerCancelHint,
  isArchivedOrder,
} from '../../src/utils/orderCancel';
import { returnStockWithLogs, updateProductSkuStock } from '../../src/utils/inventory';
import { orderReturnMovementId, orderReturnReason } from '../../src/shared/stockMovements';
import type { CartItem, Order, Product } from '../../src/types';

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'WS-1',
  date: '2 окт., 12:00',
  createdAt: '2026-10-02T09:00:00.000Z',
  items: [],
  status: 'accepted',
  totalPrice: 1000,
  deliveryAddress: '',
  deliveryMethod: 'Курьер',
  customerUid: 'alice',
  ...overrides,
});

describe('who cancels', () => {
  test('the buyer cancels a signed-in order of their own in «Принят», once', () => {
    expect(canCustomerCancel(order(), 'alice')).toBe(true);
    expect(canCustomerCancel(order(), 'bob')).toBe(false);
    expect(canCustomerCancel(order(), undefined)).toBe(false);
    expect(canCustomerCancel(order({ customerUid: undefined }), 'alice')).toBe(false); // guest order
    expect(canCustomerCancel(order({ status: 'assembling' }), 'alice')).toBe(false);
    expect(canCustomerCancel(order({ isCancelled: true }), 'alice')).toBe(false);
    // cancelled by the store and brought back: through the chat
    expect(canCustomerCancel(order({ cancelledAt: '2026-10-01T10:00:00.000Z' }), 'alice')).toBe(false);
  });

  test('without the button the buyer is told why; nothing for finished orders', () => {
    expect(customerCancelHint(order(), 'alice')).toBe('');
    expect(customerCancelHint(order({ status: 'in_transit' }), 'alice')).toMatch(/через чат/);
    expect(customerCancelHint(order({ customerUid: undefined }), undefined)).toMatch(/без входа/);
    expect(customerCancelHint(order({ status: 'delivered' }), 'alice')).toBe('');
    expect(customerCancelHint(order({ isCancelled: true }), 'alice')).toBe('');
  });

  test('labels and the reason with the comment', () => {
    expect(cancelledByLabel({ cancelledBy: 'customer' })).toBe('Отменён клиентом');
    expect(cancelledByLabel({ cancelledBy: 'customer' }, 'customer')).toBe('Вы отменили заказ');
    expect(cancelledByLabel({})).toBe('Отменён');
    expect(cancelReasonText({ cancelReason: 'Другая причина', cancelComment: 'уезжаю' })).toBe('Другая причина — уезжаю');
    expect(cancelReasonText({ cancelReason: 'Заказ больше не нужен' })).toBe('Заказ больше не нужен');
  });

  test('share of cancelled orders of a customer', () => {
    expect(cancelledShare([])).toBeNull();
    expect(cancelledShare([{ isCancelled: true }, {}, {}])).toBe(33);
  });
});

describe('«Архив»', () => {
  const now = new Date('2026-10-10T12:00:00.000Z').getTime();

  test('a cancelled order goes there 3 days after the cancellation; an active one never by itself', () => {
    const cancelledAt = (msAgo: number) => new Date(now - msAgo).toISOString();
    expect(isArchivedOrder(order({ isCancelled: true, cancelledAt: cancelledAt(ARCHIVE_AFTER_MS) }), now)).toBe(true);
    expect(isArchivedOrder(order({ isCancelled: true, cancelledAt: cancelledAt(ARCHIVE_AFTER_MS - 60_000) }), now)).toBe(false);
    expect(isArchivedOrder(order({ createdAt: '2026-01-01T00:00:00.000Z' }), now)).toBe(false);
    // an older cancelled order without the time of cancellation: by the order's date
    expect(isArchivedOrder(order({ isCancelled: true, createdAt: '2026-10-01T00:00:00.000Z' }), now)).toBe(true);
  });

  test('the admin moves an order there or keeps it in the list', () => {
    expect(isArchivedOrder(order({ archived: true }), now)).toBe(true);
    expect(isArchivedOrder(order({ isCancelled: true, cancelledAt: '2026-10-01T00:00:00.000Z', archived: false }), now)).toBe(false);
  });
});

describe('back to stock', () => {
  const line = (size: string, quantity: number): CartItem => ({
    id: `c-${size}`,
    product: { id: 'p1', title: 'Пальто' } as Product,
    quantity,
    selectedColor: '',
    selectedSize: size,
  });
  const product = (inStock: boolean, m: number, l: number): Product =>
    ({ id: 'p1', title: 'Пальто', price: 1000, inStock, skus: [{ color: '', size: 'M', stock: m }, { color: '', size: 'L', stock: l }] }) as unknown as Product;

  test('a product taken off sale stays off when goods come back; a sold-out one is on sale again', () => {
    const hidden = returnStockWithLogs([product(false, 0, 4)], [line('M', 2)], 'WS-1').updatedProducts[0];
    expect(hidden.inStock).toBe(false);
    expect(hidden.skus?.[0].stock).toBe(2);
    const soldOut = returnStockWithLogs([product(false, 0, 0)], [line('M', 2)], 'WS-1').updatedProducts[0];
    expect(soldOut.inStock).toBe(true);
  });

  test('a stock edit in «Склад и SKU» does not put a product taken off sale back on sale (audit 02.10, finding 10)', () => {
    expect(updateProductSkuStock(product(false, 0, 4), '', 'M', 5).inStock).toBe(false);
    expect(updateProductSkuStock(product(false, 0, 0), '', 'M', 5).inStock).toBe(true);
    expect(updateProductSkuStock(product(true, 1, 0), '', 'M', 0).inStock).toBe(false);
  });

  test('the return entry of a line has its own id and the reason the rules expect', () => {
    expect(orderReturnMovementId('WS-1', 0)).toBe('WS-1_0_return');
    expect(orderReturnReason('WS-1')).toBe('Отмена заказа #WS-1');
  });
});
