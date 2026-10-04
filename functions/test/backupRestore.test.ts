// Находка 19 (аудит 02.10): восстановление базы из файла «Скачать копию базы»
import { describe, expect, test } from 'bun:test';
import { chunkWrites, fromBackupValue, parseBackup, planMove, planRestore, type ParsedBackup } from '../../src/utils/backupRestore';

const file = (collections: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 'wasat-shop-backup', version: 1, createdAt: '2026-10-01T10:00:00.000Z', databaseId: 'db1', collections, failed: {}, ...extra });
const toDate = (iso: string) => ({ date: iso });

describe('parseBackup', () => {
  test('reads the file of «Скачать копию базы»', () => {
    const parsed = parseBackup(file({ products: [{ id: 'p1', data: { title: 'Рубашка' } }], unknown_things: [{ id: 'x', data: {} }] }));
    expect(typeof parsed).toBe('object');
    const backup = parsed as ParsedBackup;
    expect(backup.collections.products).toEqual([{ id: 'p1', data: { title: 'Рубашка' } }]);
    // a collection this site does not know is left out
    expect(backup.collections.unknown_things).toBeUndefined();
  });

  test('refuses other files and damaged collections', () => {
    expect(parseBackup('not json')).toContain('не копия базы');
    expect(parseBackup(JSON.stringify({ products: [] }))).toContain('не копия базы');
    expect(parseBackup(file({}, { version: 2 }))).toContain('версией');
    expect(parseBackup(file({ products: [{ id: 'a/b', data: {} }] }))).toContain('повреждена');
    expect(parseBackup(file({ orders: { id: 'x' } }))).toContain('повреждена');
  });
});

describe('fromBackupValue', () => {
  test('dates come back as dates, inside lists and maps too', () => {
    const value = { sentAt: { __timestamp: '2026-10-01T10:00:00.000Z' }, log: [{ at: { __timestamp: '2026-10-02T10:00:00.000Z' } }], n: 3 };
    expect(fromBackupValue(value, toDate)).toEqual({
      sentAt: { date: '2026-10-01T10:00:00.000Z' }, log: [{ at: { date: '2026-10-02T10:00:00.000Z' } }], n: 3,
    });
  });
});

describe('planRestore', () => {
  const backup = parseBackup(file({
    products: [{ id: 'p1', data: { title: 'A', costPrice: 900 } }, { id: 'p2', data: { title: 'B' } }],
    orders: [{ id: 'WS-1', data: { totalPrice: 100 } }],
    reviews: [{ id: 'p1_u1', data: { text: 'ok' } }],
    admins: [{ id: 'u1', data: {} }],
  })) as ParsedBackup;

  test('«Только недостающие» writes what is absent; reviews and admins are never written', () => {
    const writes = planRestore(backup, ['products', 'orders', 'reviews', 'admins'], 'missing', { products: new Set(['p1']), orders: new Set(), product_costs: new Set() }, toDate);
    expect(writes.map((w) => `${w.collection}/${w.id}`)).toEqual(['product_costs/p1', 'products/p2', 'orders/WS-1']);
  });

  test('«Как в копии» writes everything chosen; cost price leaves the product for product_costs', () => {
    const writes = planRestore(backup, ['products'], 'overwrite', {}, toDate);
    expect(writes).toEqual([
      { collection: 'product_costs', id: 'p1', data: { costPrice: 900 } },
      { collection: 'products', id: 'p1', data: { title: 'A' } },
      { collection: 'products', id: 'p2', data: { title: 'B' } },
    ]);
  });

  test('«Как в копии» does not rewrite a chat photo already in the database: the rules let it only be created', () => {
    const photos = parseBackup(file({ chat_images: [{ id: 'm1', data: { data: 'x' } }, { id: 'm2', data: { data: 'y' } }] })) as ParsedBackup;
    const writes = planRestore(photos, ['chat_images'], 'overwrite', { chat_images: new Set(['m1']) }, toDate);
    expect(writes.map((w) => w.id)).toEqual(['m2']);
  });

  test('cost price from product_costs of the copy wins over the old one inside the product', () => {
    const withCosts = parseBackup(file({
      products: [{ id: 'p1', data: { title: 'A', costPrice: 900 } }],
      product_costs: [{ id: 'p1', data: { costPrice: 1000 } }],
    })) as ParsedBackup;
    const writes = planRestore(withCosts, ['products', 'product_costs'], 'overwrite', {}, toDate);
    expect(writes.filter((w) => w.collection === 'product_costs')).toEqual([{ collection: 'product_costs', id: 'p1', data: { costPrice: 1000 } }]);
  });
});

// Перенос в бесплатную базу (default) (docs/firestore-free-tier-plan.md, этап 2)
describe('planMove', () => {
  const source = parseBackup(file({
    products: [{ id: 'p1', data: { title: 'A', costPrice: 900 } }],
    orders: [{ id: 'WS-1', data: { totalPrice: 100 } }],
    reviews: [{ id: 'p1_u1', data: { comment: 'ok' } }, { id: 'p1_u2', data: { comment: 'да' } }],
    review_votes: [{ id: 'p1_u1_u2', data: { uid: 'u2' } }],
    admins: [{ id: 'u1', data: {} }],
  })) as ParsedBackup;
  const ids = (writes: { collection: string; id: string }[]) => writes.map((w) => `${w.collection}/${w.id}`);

  test('«Перенести» copies every collection as it is, reviews and votes too; admins are added in the Console', () => {
    expect(ids(planMove(source, 'overwrite', {}, toDate))).toEqual([
      'product_costs/p1', 'products/p1', 'orders/WS-1', 'reviews/p1_u1', 'reviews/p1_u2', 'review_votes/p1_u1_u2',
    ]);
  });

  test('a review or vote already in the new database is not written again: the rules let the admin only create it', () => {
    const existing = { reviews: new Set(['p1_u1']), review_votes: new Set(['p1_u1_u2']) };
    expect(ids(planMove(source, 'overwrite', existing, toDate))).toEqual(['product_costs/p1', 'products/p1', 'orders/WS-1', 'reviews/p1_u2']);
  });

  test('«Докопировать новое» leaves what was moved before', () => {
    const existing = { products: new Set(['p1']), product_costs: new Set(['p1']), orders: new Set<string>(), reviews: new Set(['p1_u1']), review_votes: new Set<string>() };
    expect(ids(planMove(source, 'missing', existing, toDate))).toEqual(['orders/WS-1', 'reviews/p1_u2', 'review_votes/p1_u1_u2']);
  });
});

describe('chunkWrites', () => {
  test('at most 450 writes and ≈ 9 МБ per batch', () => {
    const small = Array.from({ length: 1000 }, (_, i) => ({ collection: 'orders', id: `o${i}`, data: { n: i } }));
    expect(chunkWrites(small).map((c) => c.length)).toEqual([450, 450, 100]);
    const photo = 'x'.repeat(800_000);
    const heavy = Array.from({ length: 30 }, (_, i) => ({ collection: 'products', id: `p${i}`, data: { image: photo } }));
    const chunks = chunkWrites(heavy);
    expect(chunks.length).toBe(3);
    expect(chunks.every((c) => c.length <= 11)).toBe(true);
  });
});
