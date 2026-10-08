// Индекс заказов (docs/orders-scale-plan.md, этап 4): src/utils/ordersIndex.ts
import { describe, expect, test } from 'bun:test';
import { buildOrdersIndex, isWholeOrdersIndex, ordersIndexParts, readOrdersIndex, type OrderIndexRow } from '../../src/utils/ordersIndex';

const row = (id: string, updatedAt?: number, over: Record<string, unknown> = {}): OrderIndexRow => ({
  id,
  data: { id, status: 'accepted', totalPrice: 2990, customerName: 'Иванов Иван', updatedAt: updatedAt ? { __timestamp: new Date(updatedAt).toISOString() } : null, ...over },
  ...(updatedAt ? { updatedAt } : {}),
});

describe('индекс заказов', () => {
  test('синхронизирован до самого позднего updatedAt; старые заказы без него не мешают', () => {
    const index = buildOrdersIndex([row('WS-2', 2_000), row('WS-1'), row('WS-3', 5_000)]);
    expect(index.syncedUpTo).toBe(5_000);
    expect(index.rows.map((r) => r.id)).toEqual(['WS-1', 'WS-2', 'WS-3']);
    expect(buildOrdersIndex([row('WS-1')]).syncedUpTo).toBe(0);
    expect(buildOrdersIndex([]).syncedUpTo).toBe(0);
  });

  test('хэш не зависит от порядка заказов и меняется от статуса, оплаты и удаления заказа', () => {
    const { hash } = buildOrdersIndex([row('WS-1', 1), row('WS-2', 2)]);
    expect(buildOrdersIndex([row('WS-2', 2), row('WS-1', 1)]).hash).toBe(hash);
    expect(buildOrdersIndex([row('WS-1', 1), row('WS-2', 3, { status: 'assembling' })]).hash).not.toBe(hash);
    expect(buildOrdersIndex([row('WS-1', 1), row('WS-2', 2, { paymentStatus: 'paid' })]).hash).not.toBe(hash);
    expect(buildOrdersIndex([row('WS-1', 1)]).hash).not.toBe(hash);
  });

  test('части сжимаются и читаются обратно; части разных записей не смешиваются', async () => {
    const { rows, hash, syncedUpTo } = buildOrdersIndex(Array.from({ length: 50 }, (_, i) => row(`WS-${100 + i}`, 1_000 + i)));
    const parts = await ordersIndexParts(rows, hash, syncedUpTo);
    expect(parts).toHaveLength(1);
    expect(parts[0].syncedUpTo).toBe(1_049);
    expect(isWholeOrdersIndex(parts)).toBe(true);
    const back = await readOrdersIndex(parts);
    expect(back?.rows).toEqual(rows);
    expect(back?.hash).toBe(hash);
    expect(back?.syncedUpTo).toBe(1_049);

    expect(await readOrdersIndex([])).toBeNull();
    expect(await readOrdersIndex([{ ...parts[0], parts: 2 }])).toBeNull();
    expect(await readOrdersIndex([{ ...parts[0], format: 0 }])).toBeNull();
  });

  test('большой индекс делится на части до 700 КБ сжатыми', async () => {
    // строки без повторов почти не сжимаются: 1 200 заказов по ≈ 1 КБ случайного текста
    const noise = (n: number) => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join('');
    const { rows, hash, syncedUpTo } = buildOrdersIndex(Array.from({ length: 1_200 }, (_, i) => row(`WS-${i}`, i + 1, { note: noise(100) })));
    const parts = await ordersIndexParts(rows, hash, syncedUpTo);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.orders.byteLength <= 700_000 && p.parts === parts.length)).toBe(true);
    expect((await readOrdersIndex([...parts].reverse()))?.rows).toEqual(rows);
    expect(isWholeOrdersIndex(parts.slice(1))).toBe(false);
  });
});
