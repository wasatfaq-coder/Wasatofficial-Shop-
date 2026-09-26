/**
 * Order date: the exact moment is `createdAt` (ISO), `date` is only its display text.
 * Shared with Cloud Functions — no browser APIs.
 */

const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «26 сент., 14:30» (Moscow time) — the display text of a new order's date */
export function formatOrderDate(at: Date): string {
  return at.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

/**
 * When the order was placed, in ms; null when unknown. Older orders have no `createdAt` and only a display
 * text: a date with a day and a month is read from it, «Сегодня, 14:30» is not (it was written once and
 * never meant «today» afterwards).
 */
export function orderTimestamp(
  order: { createdAt?: unknown; date?: unknown },
  now: Date = new Date()
): number | null {
  if (typeof order.createdAt === 'string' || typeof order.createdAt === 'number') {
    const t = new Date(order.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof order.date !== 'string') return null;
  const text = order.date.trim().toLowerCase();

  // 15.08.2026 or 15/08/26
  const numeric = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return new Date(year, Number(numeric[2]) - 1, Number(numeric[1])).getTime();
  }
  // 2026-08-15…
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const t = Date.parse(text);
    return Number.isNaN(t) ? null : t;
  }
  // «26 сент., 14:30», «15 августа 2026»
  const words = text.match(/^(\d{1,2})\s+([а-яё]+)\.?(?:\s+(\d{4}))?(?:[^\d]*(\d{1,2}):(\d{2}))?/);
  if (words) {
    const month = RU_MONTHS.findIndex((m) => words[2].startsWith(m.slice(0, 3)));
    if (month === -1) return null;
    const hours = words[4] ? Number(words[4]) : 12;
    const minutes = words[5] ? Number(words[5]) : 0;
    let year = words[3] ? Number(words[3]) : now.getFullYear();
    let t = new Date(year, month, Number(words[1]), hours, minutes).getTime();
    // without a year the date is the latest one not in the future
    if (!words[3] && t > now.getTime()) {
      year -= 1;
      t = new Date(year, month, Number(words[1]), hours, minutes).getTime();
    }
    return t;
  }
  return null;
}
