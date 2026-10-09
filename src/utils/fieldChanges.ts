/**
 * Which top-level fields of a document the admin changed (admin audit 09.10, findings 6 and 7). The admin panel holds
 * a copy of products and orders; writing the whole copy back would undo what a buyer wrote in the same seconds —
 * stock taken by an order, a cancellation, a receipt. Only the changed fields go to the database (`update`), the rest
 * stay as the database has them. No Firestore here: plain comparison, tested on its own.
 */

/** JSON with object keys sorted: the same data built in another key order compares equal */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Date) return v;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

export const sameValue = (a: unknown, b: unknown) => a === b || stableJson(a) === stableJson(b);

export interface FieldChanges {
  /** Fields with a new or changed value */
  set: Record<string, unknown>;
  /** Fields the new version no longer has */
  removed: string[];
}

/** Top-level fields that differ between two versions of a document (undefined counts as absent) */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ignore: readonly string[] = []
): FieldChanges {
  const set: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined || ignore.includes(key)) continue;
    if (!sameValue(before[key], value)) set[key] = value;
  }
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined && after[key] === undefined && !ignore.includes(key)) removed.push(key);
  }
  return { set, removed };
}

export const hasFieldChanges = (changes: FieldChanges) => changes.removed.length > 0 || Object.keys(changes.set).length > 0;

/** Order fields a buyer writes (cancel, «Я получил», a receipt, stock back — firestore.rules `isCustomer*`) */
export const BUYER_ORDER_FIELDS = [
  'status',
  'statusLog',
  'paymentStatus',
  'paymentReceipt',
  'paymentLog',
  'isCancelled',
  'cancelledBy',
  'cancelReason',
  'cancelComment',
  'cancelledAt',
  'estimatedDelivery',
  'stockReturned',
] as const;

/** Always compared when the admin writes a buyer field: a status change must not revive a cancelled order */
const ORDER_STATE_FIELDS = ['status', 'paymentStatus', 'isCancelled'] as const;

/**
 * Fields whose value in the database must still be what the admin saw, for this change to be written: the buyer
 * fields the admin changes, plus the order's state. Empty — the change touches no buyer field and needs no check.
 */
export function orderFieldsToCheck(changes: FieldChanges): string[] {
  const touched = [...Object.keys(changes.set), ...changes.removed].filter((key) =>
    (BUYER_ORDER_FIELDS as readonly string[]).includes(key)
  );
  if (touched.length === 0) return [];
  return Array.from(new Set([...ORDER_STATE_FIELDS, ...touched]));
}

/** The fields (of `fields`) whose value in the database differs from what the admin saw */
export function changedSince(seen: Record<string, unknown>, current: Record<string, unknown>, fields: readonly string[]): string[] {
  return fields.filter((key) => !sameValue(seen[key] ?? null, current[key] ?? null));
}
