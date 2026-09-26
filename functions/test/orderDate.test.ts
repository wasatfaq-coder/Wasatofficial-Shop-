import { describe, expect, test } from 'bun:test';
import { formatOrderDate, orderTimestamp } from '../../src/shared/orderDate';

describe('order date', () => {
  const now = new Date(2026, 8, 26, 15, 0); // 26 Sep 2026

  test('createdAt wins over the display text', () => {
    const at = '2026-09-20T10:30:00.000Z';
    expect(orderTimestamp({ createdAt: at, date: 'Сегодня, 14:30' }, now)).toBe(Date.parse(at));
  });

  test('«Сегодня» without createdAt is not a date', () => {
    expect(orderTimestamp({ date: 'Сегодня, 14:30' }, now)).toBeNull();
    expect(orderTimestamp({ date: 'Вчера' }, now)).toBeNull();
    expect(orderTimestamp({}, now)).toBeNull();
  });

  test('display texts with a day and a month', () => {
    expect(orderTimestamp({ date: '26 сент., 14:30' }, now)).toBe(new Date(2026, 8, 26, 14, 30).getTime());
    expect(orderTimestamp({ date: '15.08.2026' }, now)).toBe(new Date(2026, 7, 15).getTime());
    // no year and later than now: last year
    expect(orderTimestamp({ date: '3 дек., 10:00' }, now)).toBe(new Date(2025, 11, 3, 10, 0).getTime());
  });

  test('formatOrderDate is read back', () => {
    const at = new Date('2026-09-20T07:05:00.000Z'); // 10:05 in Moscow
    const text = formatOrderDate(at);
    expect(text).toMatch(/^20 сент\.?, 10:05$/);
  });
});
