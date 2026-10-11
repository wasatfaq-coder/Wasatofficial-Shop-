// Admin audit 09.10, findings 6 and 7: the admin panel writes only the fields it changed
import { describe, expect, test } from 'bun:test';
import { changedFields, changedSince, holdsChange, orderFieldsToCheck, stableJson } from '../../src/utils/fieldChanges';

describe('changedFields', () => {
  const skus = [{ id: 's1', color: 'Белый', size: 'M', stock: 3 }];
  const product = { id: 'p1', title: 'Рубашка', price: 4000, category: 'shirts', skus, inStock: true };

  test('a bulk action changes its fields only: stock is not written back', () => {
    const hidden = { ...product, inStock: false, hiddenFromSale: true };
    expect(changedFields(product, hidden)).toEqual({ set: { inStock: false, hiddenFromSale: true }, removed: [] });
  });

  test('the same data in another key order is no change; a removed field is listed', () => {
    const reordered = { skus: [{ stock: 3, size: 'M', color: 'Белый', id: 's1' }], inStock: true, category: 'shirts', price: 4000, title: 'Рубашка', id: 'p1' };
    expect(changedFields(product, reordered)).toEqual({ set: {}, removed: [] });
    const withDiscount = { ...product, originalPrice: 5000, discountPercent: 20 };
    expect(changedFields(withDiscount, { ...withDiscount, originalPrice: undefined, discountPercent: undefined })).toEqual({
      set: {},
      removed: ['originalPrice', 'discountPercent'],
    });
    expect(stableJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(stableJson({ a: [{ c: 2, d: 1 }], b: 1 }));
  });

  test('ignored fields are never written', () => {
    expect(changedFields({ id: 'o', updatedAt: 1 }, { id: 'o', updatedAt: 2 }, ['updatedAt'])).toEqual({ set: {}, removed: [] });
  });
});

describe('orders: what is checked before a write', () => {
  const order = { id: 'WS-1', status: 'accepted', paymentStatus: 'pending', isCancelled: false, managerNote: '' };

  test('a note or a track number needs no check; a status change checks the order state', () => {
    expect(orderFieldsToCheck(changedFields(order, { ...order, managerNote: 'позвонить' }))).toEqual([]);
    expect(orderFieldsToCheck(changedFields(order, { ...order, status: 'assembling', statusLog: [{ status: 'assembling' }] }))).toEqual([
      'status',
      'paymentStatus',
      'isCancelled',
      'statusLog',
    ]);
  });

  test('a buyer cancel meanwhile stops the admin status change; an unrelated change does not', () => {
    const check = ['status', 'paymentStatus', 'isCancelled'];
    expect(changedSince(order, { ...order, isCancelled: true, cancelledBy: 'customer' }, check)).toEqual(['isCancelled']);
    expect(changedSince(order, { ...order, stockReturned: true }, check)).toEqual([]);
    // an absent field and null are the same
    expect(changedSince({ id: 'o' }, { id: 'o', paymentReceipt: null }, ['paymentReceipt'])).toEqual([]);
  });
});

describe('holdsChange: the database already has this very change', () => {
  const log = [{ status: 'cancelled', at: '2026-10-10T08:00:00.000Z', by: 'admin' }];
  const cancel = changedFields(
    { id: 'o', status: 'in_transit', paymentStatus: 'paid', isCancelled: false },
    { id: 'o', status: 'in_transit', paymentStatus: 'refunded', isCancelled: true, cancelledBy: 'admin', statusLog: log }
  );

  test('the admin\'s own cancel that already landed is not a buyer change', () => {
    const db = { id: 'o', status: 'in_transit', paymentStatus: 'refunded', isCancelled: true, cancelledBy: 'admin', statusLog: log };
    expect(holdsChange(db, cancel)).toBe(true);
  });

  test('a buyer\'s cancel meanwhile is still a change', () => {
    const db = {
      id: 'o', status: 'in_transit', paymentStatus: 'paid', isCancelled: true, cancelledBy: 'customer',
      statusLog: [{ status: 'cancelled', at: '2026-10-10T07:59:00.000Z', by: 'customer' }],
    };
    expect(holdsChange(db, cancel)).toBe(false);
  });

  test('a removed field still in the database is not held', () => {
    const changes = { set: {}, removed: ['paymentReceipt'] };
    expect(holdsChange({ id: 'o', paymentReceipt: { url: 'x' } }, changes)).toBe(false);
    expect(holdsChange({ id: 'o' }, changes)).toBe(true);
  });
});
