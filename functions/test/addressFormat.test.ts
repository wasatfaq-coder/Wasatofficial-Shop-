import { describe, expect, it } from 'bun:test';
import {
  formatAddress,
  parseSmartAddress,
  toggleCourierCommentChip,
  cleanHouseNumber,
  cleanCityName,
} from '../../src/utils/addressFormat';

describe('addressFormat utilities', () => {
  it('normalizes duplicate prefixes in formatAddress (city, house, entrance, floor)', () => {
    expect(
      formatAddress({
        city: 'г. Москва',
        street: 'ул. Ленина',
        house: 'д. 15',
        entrance: 'подъезд 2',
        floor: 'эт. 5',
        apartment: 'кв. 42',
      }),
    ).toBe('г. Москва, ул. Ленина, д. 15, подъезд 2, эт. 5, кв. 42');
  });

  it('adds standard prefixes when omitted in formatAddress', () => {
    expect(
      formatAddress({
        city: 'Казань',
        street: 'ул. Баумана',
        house: '10А',
        building: '2',
        apartment: '12',
        entrance: '1',
        floor: '3',
        intercom: '12#',
      }),
    ).toBe('г. Казань, ул. Баумана, д. 10А, корп. 2, подъезд 1, эт. 3, кв. 12, домофон: 12#');
  });

  it('parses a single-line Russian address via parseSmartAddress', () => {
    const parsed = parseSmartAddress(
      '191025, г. Санкт-Петербург, пр-т Невский, д. 28, корп. 2, подъезд 3, этаж 4, кв. 15, домофон 15К',
    );
    expect(parsed.postalCode).toBe('191025');
    expect(parsed.city).toBe('Санкт-Петербург');
    expect(parsed.street).toBe('пр-т Невский');
    expect(parsed.house).toBe('28 к2');
    expect(parsed.entrance).toBe('3');
    expect(parsed.floor).toBe('4');
    expect(parsed.apartment).toBe('15');
    expect(parsed.intercom).toBe('15К');
  });

  it('parses shorthand comma-separated address with inline house and apartment', () => {
    const parsed = parseSmartAddress('Москва, ул. Тверская 12 кв 8');
    expect(parsed.city).toBe('Москва');
    expect(parsed.street).toBe('ул. Тверская');
    expect(parsed.house).toBe('12');
    expect(parsed.apartment).toBe('8');
  });

  it('toggles courier comment chips cleanly', () => {
    const afterAdd = toggleCourierCommentChip('', 'Позвонить за 30 минут');
    expect(afterAdd).toBe('Позвонить за 30 минут');

    const afterSecond = toggleCourierCommentChip(afterAdd, 'Оставить у двери');
    expect(afterSecond).toBe('Позвонить за 30 минут, Оставить у двери');

    const afterRemove = toggleCourierCommentChip(afterSecond, 'Позвонить за 30 минут');
    expect(afterRemove).toBe('Оставить у двери');
  });

  it('cleans house and city prefixes', () => {
    expect(cleanHouseNumber('д. 10')).toBe('10');
    expect(cleanHouseNumber('дом 15к2')).toBe('15к2');
    expect(cleanCityName('г. Казань')).toBe('Казань');
  });
});
