import type { BannerSlide } from '../types';

/**
 * Banner schedule by Moscow time (admin audit 09.10, stage 8, finding 12). The form keeps «2026-10-10T18:00» —
 * the value of a datetime-local field — and that is Moscow time on every device: the owner's phone in another
 * time zone, the presets and the buyer's browser read it the same way. Before, the presets wrote UTC (a start
 * 3 hours off) and the home screen read the value by the buyer's own clock.
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // Москва — UTC+3 круглый год (как у промокодов, src/shared/orderPricing.ts)
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The moment of a schedule value, ms; null when empty or unreadable. A value with its own zone is read as is. */
export function bannerTime(value: string | undefined): number | null {
  if (!value) return null;
  const local = value.match(LOCAL_TIME);
  if (local) {
    const [, y, mo, d, h, mi] = local.map(Number);
    return Date.UTC(y, mo - 1, d, h, mi) - MSK_OFFSET_MS;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** The datetime-local value of a moment by Moscow time: «2026-10-10T18:00» */
export function moscowInputValue(at: number): string {
  return new Date(at + MSK_OFFSET_MS).toISOString().slice(0, 16);
}

/** «10 окт., 18:00» by Moscow time, for the banner list; the raw value when unreadable */
export function formatBannerTime(value: string): string {
  const t = bannerTime(value);
  if (t === null) return value;
  return new Date(t).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

export type BannerScheduleState = 'always' | 'scheduled' | 'live' | 'expired';

type Scheduled = Pick<BannerSlide, 'scheduleEnabled' | 'startDate' | 'endDate'>;

export function bannerScheduleState(slide: Scheduled, now: number): BannerScheduleState {
  if (!slide.scheduleEnabled) return 'always';
  const start = bannerTime(slide.startDate);
  const end = bannerTime(slide.endDate);
  if (start === null && end === null) return 'always';
  if (start !== null && now < start) return 'scheduled';
  if (end !== null && now > end) return 'expired';
  return 'live';
}

/** The home screen shows the banner: switched on and, with a schedule, within it */
export function isBannerShown(slide: Scheduled & Pick<BannerSlide, 'active'>, now: number): boolean {
  if (!slide.active) return false;
  const state = bannerScheduleState(slide, now);
  return state === 'always' || state === 'live';
}

export type BannerSchedulePreset = 'day' | 'three_days' | 'end_of_day' | 'week';

export const BANNER_SCHEDULE_PRESETS: { id: BannerSchedulePreset; label: string }[] = [
  { id: 'day', label: 'Сутки' },
  { id: 'three_days', label: '3 дня' },
  { id: 'end_of_day', label: 'До конца дня' },
  { id: 'week', label: 'Неделя' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** From now until the preset's end, both by Moscow time */
export function schedulePreset(preset: BannerSchedulePreset, now: number): { startDate: string; endDate: string } {
  const startDate = moscowInputValue(now);
  if (preset === 'end_of_day') {
    // at 23:59 the day is over: until the end of the next one
    const day = startDate.endsWith('T23:59') ? moscowInputValue(now + DAY_MS) : startDate;
    return { startDate, endDate: `${day.slice(0, 10)}T23:59` };
  }
  const days = preset === 'day' ? 1 : preset === 'three_days' ? 3 : 7;
  return { startDate, endDate: moscowInputValue(now + days * DAY_MS) };
}

/** Problems of the schedule the form would save; empty when it is fine */
export function bannerScheduleErrors(startDate: string, endDate: string): string[] {
  const start = startDate ? bannerTime(startDate) : null;
  const end = endDate ? bannerTime(endDate) : null;
  if (startDate && start === null) return ['Проверьте дату начала показа'];
  if (endDate && end === null) return ['Проверьте дату окончания показа'];
  if (start !== null && end !== null && end <= start) return ['Окончание показа должно быть позже начала'];
  return [];
}
