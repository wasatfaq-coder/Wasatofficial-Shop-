/**
 * График работы магазина (docs/store-schedule-spec.md): статус «Открыто до 21:00 / Закрыто · откроется …», неделя
 * короткими строками, ближайшие особые дни и проверка формы в «Витрине». Время — московское: магазин в Москве.
 */
import type { StoreSchedule, StoreScheduleException, StoreScheduleHours, StoreWeekday } from '../types';

export const STORE_TIME_ZONE = 'Europe/Moscow';

export const WEEKDAYS: { key: StoreWeekday; short: string; full: string; on: string }[] = [
  { key: 'mon', short: 'Пн', full: 'Понедельник', on: 'в понедельник' },
  { key: 'tue', short: 'Вт', full: 'Вторник', on: 'во вторник' },
  { key: 'wed', short: 'Ср', full: 'Среда', on: 'в среду' },
  { key: 'thu', short: 'Чт', full: 'Четверг', on: 'в четверг' },
  { key: 'fri', short: 'Пт', full: 'Пятница', on: 'в пятницу' },
  { key: 'sat', short: 'Сб', full: 'Суббота', on: 'в субботу' },
  { key: 'sun', short: 'Вс', full: 'Воскресенье', on: 'в воскресенье' },
];

/** Особых дней в графике не больше этого (документ настроек не разрастается) */
export const MAX_SCHEDULE_EXCEPTIONS = 30;

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const UTC_WEEKDAY: StoreWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** «с — до» в одном дне: время в формате «ЧЧ:ММ», конец позже начала, «24:00» — до полуночи */
export function validHours(from?: string, to?: string): boolean {
  return Boolean(from && to && TIME.test(from) && TIME.test(to) && from !== '24:00' && toMinutes(to) > toMinutes(from));
}

/** Неделя, где все дни выходные, — заготовка для формы: часы подставлены, чтобы включать день одним нажатием */
export function emptySchedule(): StoreSchedule {
  const day = (): StoreScheduleHours => ({ open: false, from: '10:00', to: '21:00' });
  return {
    days: { mon: day(), tue: day(), wed: day(), thu: day(), fri: day(), sat: day(), sun: day() },
    exceptions: [],
  };
}

/** Есть хотя бы один рабочий день — график задан и показывается покупателю */
export function isScheduleConfigured(schedule?: StoreSchedule | null): schedule is StoreSchedule {
  return Boolean(schedule?.days && WEEKDAYS.some(({ key }) => schedule.days[key]?.open));
}

/** Дата, день недели и минуты от полуночи по Москве */
export function moscowParts(at: Date): { date: string; weekday: StoreWeekday; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, weekday: weekdayOf(date), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const weekdayOf = (date: string): StoreWeekday => {
  const [y, m, d] = date.split('-').map(Number);
  return UTC_WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** «31 дек» */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''}`;
}

/** Часы на дату: особый день важнее недели */
export function hoursOn(
  schedule: StoreSchedule,
  date: string
): { open: boolean; from?: string; to?: string; note?: string; special: boolean } {
  const special = schedule.exceptions?.find((e) => e.date === date);
  if (special) {
    return !special.closed && validHours(special.from, special.to)
      ? { open: true, from: special.from, to: special.to, note: special.note?.trim() || undefined, special: true }
      : { open: false, note: special.note?.trim() || undefined, special: true };
  }
  const day = schedule.days[weekdayOf(date)];
  return day?.open && validHours(day.from, day.to)
    ? { open: true, from: day.from, to: day.to, special: false }
    : { open: false, special: false };
}

export interface ScheduleStatus {
  open: boolean;
  /** До скольких открыто сегодня («21:00»), если открыто */
  until?: string;
  /** Когда откроется: «сегодня в 10:00», «завтра в 10:00», «в понедельник в 10:00», «5 янв в 10:00» */
  opens?: string;
  /** Подпись особого дня сегодня («Новый год») */
  note?: string;
}

/** Статус магазина в момент `at`; график не задан — null (покупатель видит только комментарий) */
export function scheduleStatus(schedule: StoreSchedule | null | undefined, at: Date): ScheduleStatus | null {
  if (!isScheduleConfigured(schedule)) return null;
  const now = moscowParts(at);
  const today = hoursOn(schedule, now.date);
  if (today.open && now.minutes >= toMinutes(today.from!) && now.minutes < toMinutes(today.to!)) {
    return { open: true, until: today.to, note: today.note };
  }
  for (let i = 0; i < 15; i++) {
    const date = addDays(now.date, i);
    const day = hoursOn(schedule, date);
    if (!day.open || (i === 0 && now.minutes >= toMinutes(day.from!))) continue;
    const when =
      i === 0
        ? 'сегодня'
        : i === 1
        ? 'завтра'
        : i < 7
        ? WEEKDAYS.find((w) => w.key === weekdayOf(date))!.on
        : shortDate(date);
    return { open: false, opens: `${when} в ${day.from}`, note: today.note };
  }
  return { open: false, note: today.note };
}

/** «Открыто до 21:00» / «Закрыто · откроется завтра в 10:00» */
export function statusText(status: ScheduleStatus): string {
  if (status.open) return status.until === '24:00' ? 'Открыто до полуночи' : `Открыто до ${status.until}`;
  return status.opens ? `Закрыто · откроется ${status.opens}` : 'Закрыто';
}

const hoursText = (day: StoreScheduleHours | undefined) =>
  !day?.open || !validHours(day.from, day.to)
    ? 'выходной'
    : day.from === '00:00' && day.to === '24:00'
    ? 'круглосуточно'
    : `${day.from}–${day.to}`;

/** Неделя короткими строками: дни подряд с одинаковыми часами — вместе («Пн–Пт», «10:00–21:00») */
export function weekSummary(schedule: StoreSchedule): { days: string; hours: string }[] {
  const rows: { first: string; last: string; hours: string }[] = [];
  for (const { key, short } of WEEKDAYS) {
    const hours = hoursText(schedule.days[key]);
    const prev = rows[rows.length - 1];
    if (prev && prev.hours === hours) prev.last = short;
    else rows.push({ first: short, last: short, hours });
  }
  return rows.map((r) => ({ days: r.first === r.last ? r.first : `${r.first}–${r.last}`, hours: r.hours }));
}

/** Особые дни с сегодняшнего по `days` дней вперёд, по порядку: «31 дек — выходной (Новый год)» */
export function upcomingExceptions(
  schedule: StoreSchedule,
  at: Date,
  days = 30
): { date: string; label: string; hours: string; note?: string }[] {
  const today = moscowParts(at).date;
  const last = addDays(today, days);
  return (schedule.exceptions ?? [])
    .filter((e) => DATE.test(e.date) && e.date >= today && e.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      label: shortDate(e.date),
      hours: e.closed || !validHours(e.from, e.to) ? 'выходной' : `${e.from}–${e.to}`,
      note: e.note?.trim() || undefined,
    }));
}

/** Ошибки формы «График работы» в «Витрине»; пусто — можно сохранять */
export function scheduleErrors(schedule: StoreSchedule): string[] {
  const errors: string[] = [];
  for (const { key, full } of WEEKDAYS) {
    const day = schedule.days[key];
    if (day?.open && !validHours(day.from, day.to)) errors.push(`${full}: время окончания должно быть позже начала`);
  }
  const exceptions = schedule.exceptions ?? [];
  if (exceptions.length > MAX_SCHEDULE_EXCEPTIONS) errors.push(`Особых дней — не больше ${MAX_SCHEDULE_EXCEPTIONS}`);
  const seen = new Set<string>();
  exceptions.forEach((e: StoreScheduleException, i) => {
    const name = DATE.test(e.date) ? shortDate(e.date) : `№ ${i + 1}`;
    if (!DATE.test(e.date)) errors.push(`Особый день ${name}: укажите дату`);
    else if (seen.has(e.date)) errors.push(`Особый день ${name} указан дважды`);
    seen.add(e.date);
    if (!e.closed && !validHours(e.from, e.to)) errors.push(`Особый день ${name}: время окончания должно быть позже начала`);
  });
  return errors;
}

/** Под шапкой чата поддержки: «Сейчас работаем до 21:00» / «Сейчас нерабочее время · ответим завтра после 10:00» */
export function chatHoursText(status: ScheduleStatus): string {
  if (status.open) return status.until === '24:00' ? 'Сейчас работаем до полуночи' : `Сейчас работаем до ${status.until}`;
  return status.opens
    ? `Сейчас нерабочее время · ответим ${status.opens.replace(/ в (\d)/, ' после $1')}`
    : 'Сейчас нерабочее время';
}
