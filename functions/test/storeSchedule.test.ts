// График работы магазина (docs/store-schedule-spec.md): статус по Москве, неделя, особые дни, проверка формы
import { describe, expect, test } from 'bun:test';
import {
  emptySchedule,
  isScheduleConfigured,
  moscowParts,
  scheduleErrors,
  scheduleStatus,
  statusText,
  upcomingExceptions,
  weekSummary,
} from '../../src/utils/storeSchedule';
import type { StoreSchedule } from '../../src/types';

// Пн–Пт 10:00–21:00, Сб 11:00–19:00, Вс выходной
const week = (): StoreSchedule => {
  const s = emptySchedule();
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) s.days[d] = { open: true, from: '10:00', to: '21:00' };
  s.days.sat = { open: true, from: '11:00', to: '19:00' };
  return s;
};
// 2026-10-05 — понедельник; время в UTC, Москва = UTC+3
const msk = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`);

describe('the moment in Moscow', () => {
  test('a buyer anywhere sees Moscow time', () => {
    expect(moscowParts(new Date('2026-10-04T22:30:00Z'))).toEqual({ date: '2026-10-05', weekday: 'mon', minutes: 90 });
  });
});

describe('status', () => {
  test('open: «Открыто до 21:00»', () => {
    expect(statusText(scheduleStatus(week(), msk('2026-10-05', '12:00'))!)).toBe('Открыто до 21:00');
  });

  test('before opening, after closing, at the weekend', () => {
    expect(statusText(scheduleStatus(week(), msk('2026-10-05', '08:00'))!)).toBe('Закрыто · откроется сегодня в 10:00');
    expect(statusText(scheduleStatus(week(), msk('2026-10-05', '21:00'))!)).toBe('Закрыто · откроется завтра в 10:00');
    // суббота после 19:00 → воскресенье выходной → понедельник
    expect(statusText(scheduleStatus(week(), msk('2026-10-10', '20:00'))!)).toBe('Закрыто · откроется в понедельник в 10:00');
  });

  test('a special day wins over the week, with its note', () => {
    const s = week();
    s.exceptions = [
      { date: '2026-10-05', closed: true, note: 'Инвентаризация' },
      { date: '2026-10-06', closed: false, from: '12:00', to: '16:00' },
    ];
    const monday = scheduleStatus(s, msk('2026-10-05', '12:00'))!;
    expect(monday).toEqual({ open: false, opens: 'завтра в 12:00', note: 'Инвентаризация' });
    expect(statusText(scheduleStatus(s, msk('2026-10-06', '15:00'))!)).toBe('Открыто до 16:00');
    expect(statusText(scheduleStatus(s, msk('2026-10-06', '17:00'))!)).toBe('Закрыто · откроется завтра в 10:00');
  });

  test('round the clock, a week of holidays, no schedule', () => {
    const allDay = emptySchedule();
    allDay.days.mon = { open: true, from: '00:00', to: '24:00' };
    expect(statusText(scheduleStatus(allDay, msk('2026-10-05', '23:59'))!)).toBe('Открыто до полуночи');
    const holidays = week();
    holidays.exceptions = Array.from({ length: 9 }, (_, i) => ({ date: `2026-10-${String(5 + i).padStart(2, '0')}`, closed: true }));
    expect(statusText(scheduleStatus(holidays, msk('2026-10-05', '12:00'))!)).toBe('Закрыто · откроется 14 окт в 10:00');
    expect(scheduleStatus(emptySchedule(), msk('2026-10-05', '12:00'))).toBeNull();
    expect(scheduleStatus(undefined, msk('2026-10-05', '12:00'))).toBeNull();
    expect(isScheduleConfigured(week())).toBe(true);
  });
});

describe('the week for buyers', () => {
  test('days in a row with the same hours go together', () => {
    expect(weekSummary(week())).toEqual([
      { days: 'Пн–Пт', hours: '10:00–21:00' },
      { days: 'Сб', hours: '11:00–19:00' },
      { days: 'Вс', hours: 'выходной' },
    ]);
  });

  test('special days of the next 30 days, in order', () => {
    const s = week();
    s.exceptions = [
      { date: '2026-12-31', closed: true, note: 'Новый год' },
      { date: '2026-10-20', closed: false, from: '12:00', to: '16:00' },
      { date: '2026-10-01', closed: true },
    ];
    expect(upcomingExceptions(s, msk('2026-10-05', '12:00'))).toEqual([
      { date: '2026-10-20', label: '20 окт', hours: '12:00–16:00', note: undefined },
    ]);
  });
});

describe('the form in «Витрина»', () => {
  test('end before start, no date, the same date twice', () => {
    const s = week();
    s.days.mon = { open: true, from: '21:00', to: '10:00' };
    s.exceptions = [
      { date: '', closed: true },
      { date: '2026-12-31', closed: true },
      { date: '2026-12-31', closed: false, from: '10:00', to: '10:00' },
    ];
    expect(scheduleErrors(s)).toEqual([
      'Понедельник: время окончания должно быть позже начала',
      'Особый день № 1: укажите дату',
      'Особый день 31 дек указан дважды',
      'Особый день 31 дек: время окончания должно быть позже начала',
    ]);
    expect(scheduleErrors(week())).toEqual([]);
  });
});

describe('the support chat header', () => {
  test('working now / when the store answers', async () => {
    const { chatHoursText } = await import('../../src/utils/storeSchedule');
    expect(chatHoursText(scheduleStatus(week(), msk('2026-10-05', '12:00'))!)).toBe('Сейчас работаем до 21:00');
    expect(chatHoursText(scheduleStatus(week(), msk('2026-10-05', '22:00'))!)).toBe('Сейчас нерабочее время · ответим завтра после 10:00');
    expect(chatHoursText(scheduleStatus(week(), msk('2026-10-10', '20:00'))!)).toBe('Сейчас нерабочее время · ответим в понедельник после 10:00');
  });
});
