// «Комментарий к переводу» в реквизитах оплаты: режимы, подстановка номера заказа, проверка длины
import { describe, expect, test } from 'bun:test';
import {
  normalizeTransferComment,
  resolveTransferComment,
  storedTransferComment,
  TRANSFER_COMMENT_MAX,
  validateTransferComment,
} from '../../src/utils/paymentDetails';

describe('resolveTransferComment', () => {
  test('old templates and orders without the field keep «Заказ № …»', () => {
    expect(resolveTransferComment(undefined, 'WS-1')).toBe('Заказ № WS-1');
    expect(resolveTransferComment({ mode: 'order' }, 'WS-1')).toBe('Заказ № WS-1');
    expect(resolveTransferComment({ mode: 'bogus' } as never, 'WS-1')).toBe('Заказ № WS-1');
  });

  test('«Без комментария» gives an empty comment', () => {
    expect(resolveTransferComment({ mode: 'none' }, 'WS-1')).toBe('');
  });

  test('custom text replaces every {номер}', () => {
    expect(resolveTransferComment({ mode: 'custom', text: 'Оплата {номер} / {номер}' }, 'WS-7')).toBe('Оплата WS-7 / WS-7');
    expect(resolveTransferComment({ mode: 'custom', text: '  За одежду ' }, 'WS-7')).toBe('За одежду');
  });

  test('custom text left empty means no comment', () => {
    expect(resolveTransferComment({ mode: 'custom', text: '   ' }, 'WS-7')).toBe('');
    expect(resolveTransferComment({ mode: 'custom' }, 'WS-7')).toBe('');
  });
});

describe('validateTransferComment', () => {
  test('up to 140 characters is valid, more is an error', () => {
    expect(validateTransferComment({ mode: 'custom', text: 'a'.repeat(TRANSFER_COMMENT_MAX) })).toBeNull();
    expect(validateTransferComment({ mode: 'custom', text: 'a'.repeat(TRANSFER_COMMENT_MAX + 1) })).toContain('140');
  });

  test('other modes and a missing setting are valid', () => {
    expect(validateTransferComment(undefined)).toBeNull();
    expect(validateTransferComment({ mode: 'none' })).toBeNull();
    expect(validateTransferComment({ mode: 'order' })).toBeNull();
  });
});

describe('stored form', () => {
  test('only custom keeps its text', () => {
    expect(storedTransferComment({ mode: 'order', text: 'x' })).toEqual({ mode: 'order' });
    expect(storedTransferComment({ mode: 'custom', text: ' Привет {номер} ' })).toEqual({ mode: 'custom', text: 'Привет {номер}' });
    expect(normalizeTransferComment(null)).toEqual({ mode: 'order' });
  });
});
