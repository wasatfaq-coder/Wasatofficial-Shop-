// Admin audit 09.10, stage 8, finding 12: the banner schedule is Moscow time on every device
import { describe, expect, test } from 'bun:test';
import {
  bannerScheduleErrors,
  bannerScheduleState,
  bannerTime,
  formatBannerTime,
  isBannerShown,
  moscowInputValue,
  schedulePreset,
} from '../../src/utils/bannerSchedule';

// 10.10.2026 15:30 по Москве = 12:30 UTC
const NOW = Date.UTC(2026, 9, 10, 12, 30);

describe('banner schedule by Moscow time', () => {
  test('a form value is Moscow time, a value with its own zone is read as is', () => {
    expect(bannerTime('2026-10-10T18:00')).toBe(Date.UTC(2026, 9, 10, 15, 0));
    expect(bannerTime('2026-10-10T18:00:00Z')).toBe(Date.UTC(2026, 9, 10, 18, 0));
    expect(bannerTime('')).toBeNull();
    expect(bannerTime('завтра')).toBeNull();
  });

  test('presets start now and end by Moscow time (before: UTC, 3 hours off)', () => {
    expect(moscowInputValue(NOW)).toBe('2026-10-10T15:30');
    expect(schedulePreset('day', NOW)).toEqual({ startDate: '2026-10-10T15:30', endDate: '2026-10-11T15:30' });
    expect(schedulePreset('end_of_day', NOW)).toEqual({ startDate: '2026-10-10T15:30', endDate: '2026-10-10T23:59' });
    expect(schedulePreset('week', NOW).endDate).toBe('2026-10-17T15:30');
    // 22:30 UTC is already the next day in Moscow
    expect(schedulePreset('end_of_day', Date.UTC(2026, 9, 10, 22, 30)).endDate).toBe('2026-10-11T23:59');
    // at 23:59 Moscow — until the end of the next day, not a zero-length show
    expect(schedulePreset('end_of_day', Date.UTC(2026, 9, 10, 20, 59)).endDate).toBe('2026-10-11T23:59');
  });

  test('state and showing on the home screen', () => {
    const slide = { active: true, scheduleEnabled: true, startDate: '2026-10-10T16:00', endDate: '2026-10-10T23:59' };
    expect(bannerScheduleState(slide, NOW)).toBe('scheduled');
    expect(isBannerShown(slide, NOW)).toBe(false);
    expect(bannerScheduleState(slide, Date.UTC(2026, 9, 10, 13, 0))).toBe('live');
    expect(bannerScheduleState(slide, Date.UTC(2026, 9, 10, 21, 0))).toBe('expired');
    expect(bannerScheduleState({ ...slide, scheduleEnabled: false }, NOW)).toBe('always');
    expect(isBannerShown({ ...slide, scheduleEnabled: false, active: false }, NOW)).toBe(false);
  });

  test('the end must come after the start', () => {
    expect(bannerScheduleErrors('2026-10-10T18:00', '2026-10-10T17:00')).toEqual(['Окончание показа должно быть позже начала']);
    expect(bannerScheduleErrors('2026-10-10T18:00', '')).toEqual([]);
  });

  test('the list shows Moscow time', () => {
    expect(formatBannerTime('2026-10-10T18:00')).toContain('18:00');
  });
});
