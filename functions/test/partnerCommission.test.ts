// Комиссия партнёров для статистики: только оплаченные и полученные заказы (решение владельца 02.10)
import { describe, expect, test } from 'bun:test';
import { commissionBase, computePartnerCommissions, isCommissionConfirmed } from '../../src/utils/partnerCommission';
import type { Order, PromoCode } from '../../src/types';

const promo = (over: Partial<PromoCode> = {}): PromoCode =>
  ({ id: 'promo-blog', code: 'BLOG10', isReferral: true, partnerName: '@blogger', partnerCommissionPercent: 10, ...over }) as PromoCode;
const order = (over: Partial<Order> = {}): Order =>
  ({
    id: 'WS-1', date: '', items: [], deliveryAddress: '', deliveryMethod: 'Курьер',
    status: 'delivered', paymentStatus: 'paid', totalPrice: 5350, deliveryFee: 350, promoCode: 'blog10', ...over,
  }) as Order;

describe('isCommissionConfirmed', () => {
  test('paid and delivered counts', () => expect(isCommissionConfirmed(order())).toBe(true));
  test('paid but not delivered yet does not count', () => expect(isCommissionConfirmed(order({ status: 'in_transit' }))).toBe(false));
  test('delivered but not paid does not count', () => expect(isCommissionConfirmed(order({ paymentStatus: 'paid_on_delivery' }))).toBe(false));
  test('cancelled does not count', () => expect(isCommissionConfirmed(order({ isCancelled: true }))).toBe(false));
});

describe('commissionBase', () => {
  test('without delivery and refund', () => expect(commissionBase(order({ refundAmount: 1000 }))).toBe(4000));
});

describe('computePartnerCommissions', () => {
  test('percent of confirmed sales; pending ones are counted apart; cancelled are left out', () => {
    const [row] = computePartnerCommissions(
      [promo()],
      [
        order(),
        order({ id: 'WS-2', status: 'accepted', paymentStatus: 'pending' }),
        order({ id: 'WS-3', isCancelled: true }),
        order({ id: 'WS-4', promoCode: 'OTHER' }),
      ]
    );
    expect(row).toMatchObject({ confirmedOrders: 1, confirmedSales: 5000, commission: 500, pendingOrders: 1, pendingSales: 5000 });
  });

  test('the counter in the promo is not used: a raised commissionEarned does not change the result', () => {
    const [row] = computePartnerCommissions([promo({ commissionEarned: 48_000_000, usedCount: 50 })], [order()]);
    expect(row.commission).toBe(500);
  });

  test('without a percent there is no made-up commission', () => {
    const [row] = computePartnerCommissions([promo({ partnerCommissionPercent: undefined })], [order()]);
    expect(row).toMatchObject({ percent: null, commission: 0, confirmedSales: 5000 });
  });

  test('only partner codes', () => {
    expect(computePartnerCommissions([promo({ isReferral: false })], [order()])).toEqual([]);
  });
});
