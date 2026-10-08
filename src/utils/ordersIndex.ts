import { gzipText, gunzipText, shortHash } from './catalogIndex';

/**
 * Индекс заказов (docs/orders-scale-plan.md, этап 4): все заказы магазина как они лежат в базе, сжатые в один-два
 * документа `orders_index`. Владелец читает их вместо 1 800 документов заказов (этап 5), а поверх — заказы, изменённые
 * после записи индекса (`updatedAt` новее `syncedUpTo`). Пишет его сессия администратора (`useOrdersIndexSync`), пока нет
 * Cloud Functions; читает и пишет только администратор: в заказах имена, телефоны и адреса покупателей. Код без
 * браузерных API, кроме сжатия.
 */

/** Bump when a row changes shape: the admin session then rewrites the index */
export const ORDERS_INDEX_FORMAT = 1;
export const ORDERS_INDEX_COLLECTION = 'orders_index';
/** One part's compressed orders; a document holds up to 1 MiB, the rest is the other fields and a margin */
const PART_MAX_BYTES = 700_000;

/**
 * An order document as stored, so that the admin reads it back through the same normalisation as the document itself
 * (the delivery stages keep their times). Dates of the database are `{ __timestamp: ISO }`, as in the backup copy
 */
export interface OrderIndexRow {
  id: string;
  data: Record<string, unknown>;
  /** The order's `updatedAt` in ms (stage 2): absent at orders written before it and while a write is pending */
  updatedAt?: number;
}

export interface OrdersIndexPart {
  format: number;
  part: number;
  parts: number;
  /** Of all rows: equal hashes — nothing to rewrite */
  hash: string;
  /** The latest `updatedAt` among the rows: orders changed after the write have a later one */
  syncedUpTo: number;
  /** gzip of the JSON array of this part's rows */
  orders: Uint8Array;
  updatedAt: string;
}

/** Rows in a stable order (by id), the hash the stored index is compared by and the time it is synced up to */
export function buildOrdersIndex(rows: OrderIndexRow[]): { rows: OrderIndexRow[]; hash: string; syncedUpTo: number } {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const syncedUpTo = sorted.reduce((latest, row) => Math.max(latest, row.updatedAt ?? 0), 0);
  return { rows: sorted, hash: `${ORDERS_INDEX_FORMAT}-${shortHash(JSON.stringify(sorted))}`, syncedUpTo };
}

/** The index as documents of `orders_index` (p0, p1, …): one part while it fits, about 2 000–4 000 orders */
export async function ordersIndexParts(
  rows: OrderIndexRow[],
  hash: string,
  syncedUpTo: number,
  at = new Date()
): Promise<OrdersIndexPart[]> {
  for (let parts = 1; ; parts++) {
    const size = Math.ceil(rows.length / parts) || 1;
    const chunks = Array.from({ length: parts }, (_, i) => rows.slice(i * size, (i + 1) * size));
    const packed = await Promise.all(chunks.map((chunk) => gzipText(JSON.stringify(chunk))));
    if (packed.every((p) => p.byteLength <= PART_MAX_BYTES) || size === 1) {
      return packed.map((bytes, part) => ({
        format: ORDERS_INDEX_FORMAT, part, parts, hash, syncedUpTo, orders: bytes, updatedAt: at.toISOString(),
      }));
    }
  }
}

export const ordersIndexPartId = (part: number) => `p${part}`;

/** The stored parts belong together: one format, every part of one write. Otherwise the index is built anew */
export function isWholeOrdersIndex(parts: Pick<OrdersIndexPart, 'format' | 'part' | 'parts' | 'hash'>[]): boolean {
  const first = parts[0];
  if (!first || first.format !== ORDERS_INDEX_FORMAT) return false;
  const sorted = [...parts].sort((a, b) => a.part - b.part);
  return sorted.length === first.parts && sorted.every((p, i) => p.part === i && p.hash === first.hash && p.parts === first.parts);
}

/** The rows back from the stored parts; null while the parts do not belong together */
export async function readOrdersIndex(parts: OrdersIndexPart[]): Promise<{ rows: OrderIndexRow[]; hash: string; syncedUpTo: number } | null> {
  if (!isWholeOrdersIndex(parts)) return null;
  const sorted = [...parts].sort((a, b) => a.part - b.part);
  const chunks = await Promise.all(sorted.map(async (p) => JSON.parse(await gunzipText(p.orders)) as OrderIndexRow[]));
  return { rows: chunks.flat(), hash: sorted[0].hash, syncedUpTo: sorted[0].syncedUpTo };
}
