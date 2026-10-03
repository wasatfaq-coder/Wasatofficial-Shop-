// Реквизиты оплаты и чек («Доработки 5», бриф владельца 02.10)
import { describe, expect, test } from 'bun:test';
import {
  canPayByRequisites,
  copyValue,
  displayValue,
  filledPaymentKinds,
  normalizeRequisites,
  paymentHint,
  receiptFileError,
  REQUISITE_FIELDS,
  reviewedOrder,
  validateRequisites,
} from '../../src/utils/paymentDetails';
import type { Order } from '../../src/types';

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'WS-1',
  date: '3 окт., 12:00',
  items: [],
  status: 'accepted',
  totalPrice: 4990,
  deliveryAddress: '',
  deliveryMethod: 'СДЭК',
  customerUid: 'alice',
  paymentStatus: 'pending',
  ...overrides,
});

const sbp = { phone: '79991234567', bank: 'Т-Банк', holder: 'Иванов Иван Иванович' };
const field = (kind: 'sbp' | 'card' | 'account', key: string) => REQUISITE_FIELDS[kind].find((f) => f.key === key)!;

describe('requisites fields', () => {
  test('lengths by the brief: phone, card 16–19, account and corr 20, BIK 9, INN 10/12, KPP for a company', () => {
    expect(validateRequisites('sbp', sbp)).toEqual({});
    expect(validateRequisites('sbp', { ...sbp, phone: '+7 (999) 123-45' })).toHaveProperty('phone');
    expect(validateRequisites('sbp', { ...sbp, phone: '8 999 123 45 67' })).toEqual({});
    expect(validateRequisites('card', { cardNumber: '2202 2000 0000 000', bank: 'Сбер', holder: 'И' })).toHaveProperty('cardNumber');
    expect(validateRequisites('card', { cardNumber: '2202200000000000123', bank: 'Сбер', holder: 'И' })).toEqual({});
    const ip = { orgName: 'ИП Иванов И. И.', account: '40802810000000000001', inn: '770000000001', bik: '044525225', corrAccount: '30101810400000000225' };
    expect(validateRequisites('account', ip)).toEqual({});
    // a company (INN of 10 digits) needs its KPP
    expect(validateRequisites('account', { ...ip, inn: '7700000001' })).toHaveProperty('kpp');
    expect(validateRequisites('account', { ...ip, inn: '7700000001', kpp: '770001001' })).toEqual({});
    expect(validateRequisites('account', { ...ip, account: '4080281000000000000' })).toHaveProperty('account');
    expect(validateRequisites('account', { ...ip, bik: '04452522A' })).toHaveProperty('bik');
  });

  test('numbers are stored and copied as digits, shown with their mask', () => {
    expect(normalizeRequisites('sbp', { ...sbp, phone: '+7 (999) 123-45-67' }).phone).toBe('79991234567');
    expect(displayValue(field('sbp', 'phone'), '79991234567')).toBe('+7 (999) 123-45-67');
    expect(copyValue(field('sbp', 'phone'), '+7 (999) 123-45-67')).toBe('79991234567');
    expect(displayValue(field('card', 'cardNumber'), '2202200000000000')).toBe('2202 2000 0000 0000');
    expect(copyValue(field('card', 'cardNumber'), '2202 2000 0000 0000')).toBe('2202200000000000');
    expect(copyValue(field('sbp', 'bank'), ' Т-Банк ')).toBe('Т-Банк');
    // an empty optional field is not stored
    expect(normalizeRequisites('account', { orgName: 'ИП', account: '1', inn: '1', bik: '1', corrAccount: '1', kpp: '' })).not.toHaveProperty('kpp');
  });
});

describe('what the buyer sees', () => {
  test('only the ways the store filled', () => {
    expect(filledPaymentKinds({ sbp, card: { cardNumber: '', bank: '', holder: '' } })).toEqual(['sbp']);
    expect(filledPaymentKinds(undefined)).toEqual([]);
  });

  test('«Выбрать способ оплаты» — own order waiting for payment with requisites', () => {
    const withDetails = order({ paymentDetails: { sbp } });
    expect(canPayByRequisites(withDetails, 'alice')).toBe(true);
    expect(canPayByRequisites(withDetails, 'bob')).toBe(false);
    expect(canPayByRequisites(withDetails, undefined)).toBe(false);
    expect(canPayByRequisites({ ...withDetails, paymentStatus: 'receipt_review' }, 'alice')).toBe(false);
    expect(canPayByRequisites({ ...withDetails, isCancelled: true }, 'alice')).toBe(false);
    expect(canPayByRequisites(order(), 'alice')).toBe(false);
    expect(paymentHint(order(), 'alice')).toMatch(/ещё не указал реквизиты/);
    expect(paymentHint(order(), undefined)).toMatch(/в чате/);
    expect(paymentHint({ ...withDetails, paymentStatus: 'receipt_review' }, 'alice')).toMatch(/Чек на проверке/);
  });

  test('receipt photo: JPG or PNG up to 15 MB', () => {
    expect(receiptFileError({ name: 'чек.jpg', type: 'image/jpeg', size: 2_000_000 })).toBeNull();
    expect(receiptFileError({ name: 'check.PNG', type: '', size: 2_000_000 })).toBeNull();
    expect(receiptFileError({ name: 'чек.pdf', type: 'application/pdf', size: 100_000 })).toMatch(/JPG или PNG/);
    expect(receiptFileError({ name: 'big.jpg', type: 'image/jpeg', size: 16 * 1024 * 1024 })).toMatch(/15 МБ/);
  });
});

describe('the admin checks the receipt', () => {
  const sent = order({ paymentStatus: 'receipt_review', paymentLog: [{ event: 'receipt', at: '2026-10-03T08:00:00.000Z', by: 'customer' }] });

  test('«Подтвердить оплату» → «Оплачен» with an entry of the admin', () => {
    const paid = reviewedOrder({ ...sent, paymentRejectReason: 'старая' }, 'confirm', { adminUid: 'owner' });
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.paymentRejectReason).toBeUndefined();
    expect(paid.paymentLog?.map((e) => `${e.event}/${e.by}`)).toEqual(['receipt/customer', 'confirmed/admin']);
    expect(paid.paymentLog?.[1].byUid).toBe('owner');
  });

  test('«Отклонить чек» → «Ожидает оплаты» with the reason the buyer sees', () => {
    const back = reviewedOrder(sent, 'reject', { reason: 'Не поступили средства' });
    expect(back.paymentStatus).toBe('pending');
    expect(back.paymentRejectReason).toBe('Не поступили средства');
    expect(back.paymentLog?.[1]).toMatchObject({ event: 'rejected', by: 'admin', note: 'Не поступили средства' });
  });
});
