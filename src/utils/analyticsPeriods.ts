/**
 * Periods of «Аналитика»: ready periods (7 days … 12 months) and the owner's own dates, grouped by day, week or month.
 * Time is the owner's browser time, as everywhere in the section. Plain data: no browser APIs.
 */

export type AnalyticsPeriod = '7d' | '14d' | '30d' | '6m' | '1y';
export type AnalyticsGrouping = 'day' | 'week' | 'month';

/** The owner's dates: «YYYY-MM-DD», both days included */
export interface CustomPeriod {
  from: string;
  to: string;
}

export type PeriodSelection = AnalyticsPeriod | CustomPeriod;

/** More bars than this do not fit the chart: such a range is not grouped by day (or by week) */
export const MAX_DAY_BUCKETS = 92;
export const MAX_WEEK_BUCKETS = 106;

const DAY_PRESETS: Record<'7d' | '14d' | '30d', number> = { '7d': 7, '14d': 14, '30d': 30 };

const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_MONTHS_FULL = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const RU_MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const RU_WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function isCustomPeriod(selection: PeriodSelection): selection is CustomPeriod {
  return typeof selection === 'object' && selection !== null;
}

/** YYYY-MM-DD in local time */
export function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight of «YYYY-MM-DD»; not a real date — null */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const daysBetween = (start: Date, end: Date) =>
  Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);

export interface ResolvedPeriod {
  /** First day, local midnight */
  start: Date;
  /** The day after the last one, local midnight (not included) */
  end: Date;
  /** Start of the previous period it is compared with (it ends at `start`) */
  prevStart: Date;
  days: number;
}

/**
 * The dates a period covers today. Ready periods by day end today; 6 and 12 months are whole calendar months up to the
 * current one and compare with as many months before. The owner's dates compare with as many days right before them;
 * dates in the wrong order are swapped.
 */
export function resolvePeriod(selection: PeriodSelection, now: Date = new Date()): ResolvedPeriod {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (isCustomPeriod(selection)) {
    const a = parseDateKey(selection.from) ?? today;
    const b = parseDateKey(selection.to) ?? today;
    const [first, last] = a <= b ? [a, b] : [b, a];
    const end = addDays(last, 1);
    const days = daysBetween(first, end);
    return { start: first, end, prevStart: addDays(first, -days), days };
  }
  if (selection === '6m' || selection === '1y') {
    const months = selection === '6m' ? 6 : 12;
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - months * 2 + 1, 1);
    return { start, end, prevStart, days: daysBetween(start, end) };
  }
  const days = DAY_PRESETS[selection];
  const start = addDays(today, -(days - 1));
  return { start, end: addDays(today, 1), prevStart: addDays(start, -days), days };
}

/** Groupings a period can be shown by: by day up to ~3 months, by week up to ~2 years, by month always */
export function allowedGroupings(period: Pick<ResolvedPeriod, 'days'>): AnalyticsGrouping[] {
  const groupings: AnalyticsGrouping[] = [];
  if (period.days <= MAX_DAY_BUCKETS) groupings.push('day');
  if (Math.ceil(period.days / 7) + 1 <= MAX_WEEK_BUCKETS) groupings.push('week');
  groupings.push('month');
  return groupings;
}

/** How a period is grouped unless the owner chose: by day up to a month, by week up to half a year, then by month */
export function defaultGrouping(selection: PeriodSelection, now: Date = new Date()): AnalyticsGrouping {
  if (selection === '6m' || selection === '1y') return 'month';
  if (!isCustomPeriod(selection)) return 'day';
  const { days } = resolvePeriod(selection, now);
  if (days <= 31) return 'day';
  if (days <= 186) return 'week';
  return 'month';
}

/** The chosen grouping if the period allows it, otherwise the nearest larger one */
export function fitGrouping(grouping: AnalyticsGrouping, period: Pick<ResolvedPeriod, 'days'>): AnalyticsGrouping {
  const allowed = allowedGroupings(period);
  if (allowed.includes(grouping)) return grouping;
  return allowed[0];
}

export interface PeriodBucket {
  start: number;
  end: number;
  dateKey: string;
  /** Short axis label: «Пн 15», «15 авг», «ОКТ» */
  label: string;
  /** «15 авг», «окт 2026» */
  date: string;
  /** «15 августа 2026», «5–11 октября 2026», «Октябрь 2026» */
  fullDate: string;
  /** «Пн», «Неделя», «Месяц» */
  weekday: string;
}

function weekText(first: Date, last: Date): string {
  if (first.getTime() === last.getTime()) return `${first.getDate()} ${RU_MONTHS_FULL[first.getMonth()]} ${first.getFullYear()}`;
  const sameYear = first.getFullYear() === last.getFullYear();
  if (first.getMonth() === last.getMonth() && sameYear) {
    return `${first.getDate()}–${last.getDate()} ${RU_MONTHS_FULL[last.getMonth()]} ${last.getFullYear()}`;
  }
  const head = `${first.getDate()} ${RU_MONTHS_SHORT[first.getMonth()]}${sameYear ? '' : ` ${first.getFullYear()}`}`;
  return `${head} – ${last.getDate()} ${RU_MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
}

/**
 * The period's bars, oldest first. A week starts on Monday and a month on the 1st; the first and the last bar are cut
 * to the period, so no bar counts days outside it.
 */
export function periodBuckets(period: ResolvedPeriod, grouping: AnalyticsGrouping): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  const endMs = period.end.getTime();
  const longDays = period.days > 14;
  let cursor = period.start;
  while (cursor.getTime() < endMs) {
    let next: Date;
    if (grouping === 'day') next = addDays(cursor, 1);
    else if (grouping === 'week') next = addDays(cursor, 7 - ((cursor.getDay() + 6) % 7));
    else next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const bucketEnd = next.getTime() < endMs ? next : period.end;
    const m = cursor.getMonth();
    if (grouping === 'month') {
      buckets.push({
        start: cursor.getTime(),
        end: bucketEnd.getTime(),
        dateKey: `${cursor.getFullYear()}-${String(m + 1).padStart(2, '0')}`,
        label: RU_MONTHS_SHORT[m].toUpperCase(),
        date: `${RU_MONTHS_SHORT[m]} ${cursor.getFullYear()}`,
        fullDate: `${RU_MONTHS_NOMINATIVE[m]} ${cursor.getFullYear()}`,
        weekday: 'Месяц',
      });
    } else if (grouping === 'week') {
      const date = `${cursor.getDate()} ${RU_MONTHS_SHORT[m]}`;
      buckets.push({
        start: cursor.getTime(),
        end: bucketEnd.getTime(),
        dateKey: `W${dateKeyOf(cursor)}`,
        label: date,
        date,
        fullDate: weekText(cursor, addDays(bucketEnd, -1)),
        weekday: 'Неделя',
      });
    } else {
      const weekday = RU_WEEKDAYS[cursor.getDay()];
      const date = `${cursor.getDate()} ${RU_MONTHS_SHORT[m]}`;
      buckets.push({
        start: cursor.getTime(),
        end: bucketEnd.getTime(),
        dateKey: dateKeyOf(cursor),
        label: longDays ? date : `${weekday} ${cursor.getDate()}`,
        date,
        fullDate: `${cursor.getDate()} ${RU_MONTHS_FULL[m]} ${cursor.getFullYear()}`,
        weekday,
      });
    }
    cursor = bucketEnd;
  }
  return buckets;
}

/** «20 сент. — 26 сент.», «апр. 2026 — сент. 2026», «1 янв. 2025 — 9 окт. 2026»: what the period covers */
export function periodRangeText(selection: PeriodSelection, now: Date = new Date()): string {
  const { start, end } = resolvePeriod(selection, now);
  const last = addDays(end, -1);
  if (selection === '6m' || selection === '1y') {
    const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }).replace(/\s*г\.$/, '');
    return `${fmt(start)} — ${fmt(last)}`;
  }
  const withYear = start.getFullYear() !== last.getFullYear() || start.getFullYear() !== now.getFullYear();
  const fmt = (d: Date) =>
    d
      .toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
      .replace(/\s*г\.$/, '');
  return start.getTime() === last.getTime() ? fmt(start) : `${fmt(start)} — ${fmt(last)}`;
}

/** «в день», «в неделю», «в месяц» */
export function perBucketText(grouping: AnalyticsGrouping): string {
  return grouping === 'day' ? 'в день' : grouping === 'week' ? 'в неделю' : 'в месяц';
}

/** «по дням», «по неделям», «по месяцам» */
export function groupingText(grouping: AnalyticsGrouping): string {
  return grouping === 'day' ? 'по дням' : grouping === 'week' ? 'по неделям' : 'по месяцам';
}
