import { SavedAddress } from '../types';

export interface AddressComponents {
  /** Страна / регион — первым, если указан */
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  building?: string;
  entrance?: string;
  floor?: string;
  apartment?: string;
  intercom?: string;
  postalCode?: string;
}

export const POPULAR_RU_CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Казань',
  'Екатеринбург',
  'Новосибирск',
  'Краснодар',
] as const;

export const ADDRESS_TITLE_PRESETS = ['Дом', 'Работа', 'Родители', 'Дача'] as const;

export const COURIER_COMMENT_SUGGESTIONS = [
  'Позвонить за 30 минут',
  'Оставить у двери',
  'Не звонить в дверь',
  'Вход со двора',
] as const;

/** Strip leading "д.", "дом" so we never format "д. д. 10" */
export function cleanHouseNumber(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/^(?:дом\s+|д\.\s*|д\s+)/i, '').trim();
}

/** Strip leading "г.", "город" */
export function cleanCityName(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/^(?:город\s+|г\.\s*|г\s+)/i, '').trim();
}

/** Toggle a quick suggestion phrase inside a courier comment string */
export function toggleCourierCommentChip(current: string, chip: string): string {
  const trimmed = current.trim();
  if (!trimmed) return chip;
  const parts = trimmed
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const existsIdx = parts.findIndex((p) => p.toLowerCase() === chip.toLowerCase());
  if (existsIdx >= 0) {
    parts.splice(existsIdx, 1);
    return parts.join(', ');
  }
  return `${trimmed.replace(/[,.\s]+$/, '')}, ${chip}`;
}

/**
 * Smartly parses a single-line Russian address string into structured components.
 * Supports inputs like:
 * - "125009, г. Москва, ул. Тверская, д. 7, под. 2, эт. 4, кв. 12, домофон 12К"
 * - "Москва, Тверская 7, кв 12"
 * - "ул. Ленина 15к2, подъезд 3, этаж 5, кв. 44"
 */
export function parseSmartAddress(raw: string): Partial<AddressComponents> {
  const result: Partial<AddressComponents> = {};
  if (!raw || !raw.trim()) return result;

  let text = raw.trim();

  // 1. Extract 6-digit Russian postal code
  const postalMatch = text.match(/(?:^|[,\s])(\d{6})(?=[,\s]|$)/);
  if (postalMatch) {
    result.postalCode = postalMatch[1];
    text = text.replace(postalMatch[0], ' ');
  }

  const segments = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const remainingSegments: string[] = [];

  for (const seg of segments) {
    // Intercom
    const intercomMatch = seg.match(/^(?:код\s+домофона|домофон)\s*[:#-]?\s*(.+)$/i);
    if (intercomMatch) {
      result.intercom = intercomMatch[1].trim();
      continue;
    }

    // Entrance
    const entranceMatch = seg.match(/^(?:подъезд|под\.?|парадная)\s*№?\s*([0-9а-яa-z/-]+)$/i);
    if (entranceMatch) {
      result.entrance = entranceMatch[1].trim();
      continue;
    }

    // Floor
    const floorMatch = seg.match(/^(?:этаж|эт\.?)\s*№?\s*(-?\d+)$/i);
    if (floorMatch) {
      result.floor = floorMatch[1].trim();
      continue;
    }

    // Apartment / Office
    const aptMatch = seg.match(/^(?:квартира|кв\.?|офис|оф\.?|ап\.?)\s*№?\s*([0-9а-яa-z/-]+)$/i);
    if (aptMatch) {
      result.apartment = aptMatch[1].trim();
      continue;
    }

    // Explicit house segment: "д. 10", "дом 12к1"
    const houseMatch = seg.match(/^(?:дом|д\.?)\s*№?\s*(\d+[0-9а-яa-z/.\s-]*)$/i);
    if (houseMatch) {
      result.house = cleanHouseNumber(houseMatch[1]);
      continue;
    }

    // Explicit building/corpus segment if house already found
    const corpMatch = seg.match(/^(?:корпус|корп\.?|строение|стр\.?|к\.?)\s*([0-9а-яa-z/-]+)$/i);
    if (corpMatch && result.house) {
      result.house = `${result.house} к${corpMatch[1].trim()}`;
      continue;
    }

    // Region / Oblast / Krai / Republic
    if (/(?:^|\s)(?:область|обл\.|край|республика|респ\.|округ)(?:\s|$)/i.test(seg)) {
      result.region = seg;
      continue;
    }

    // Explicit city prefix: "г. Москва", "город Казань"
    const cityPrefixMatch = seg.match(/^(?:город|г\.?)\s+(.+)$/i);
    if (cityPrefixMatch && !result.city) {
      result.city = cleanCityName(cityPrefixMatch[1]);
      continue;
    }

    // Known popular city name as standalone segment
    const matchedPopularCity = POPULAR_RU_CITIES.find(
      (c) => c.toLowerCase() === seg.toLowerCase()
    );
    if (matchedPopularCity && !result.city) {
      result.city = matchedPopularCity;
      continue;
    }

    remainingSegments.push(seg);
  }

  // Inspect remaining segments for street + inline house/apt (e.g. "ул. Тверская 7 кв 12")
  for (const seg of remainingSegments) {
    let working = seg;

    // Extract trailing inline apartment if present: "Тверская 7 кв 12"
    const inlineApt = working.match(/\s+(?:квартира|кв\.?|офис|оф\.?)\s*([0-9а-яa-z/-]+)$/i);
    if (inlineApt && !result.apartment) {
      result.apartment = inlineApt[1].trim();
      working = working.slice(0, inlineApt.index).trim();
    }

    // Extract trailing house number from street line: "ул. Тверская д. 7" or "Тверская 7к1"
    const inlineHouse = working.match(
      /^(.*?)(?:[,\s]+(?:дом|д\.?)\s*|\s+)(\d+(?:[/-]\d+|\s*(?:корп\.?|стр\.?|к)\s*\d+|[а-яa-z])?)$/i
    );
    if (inlineHouse && inlineHouse[1].trim().length >= 2 && !result.house) {
      result.street = inlineHouse[1].trim().replace(/[,.\s]+$/, '');
      result.house = cleanHouseNumber(inlineHouse[2]);
      continue;
    }

    if (!result.street) {
      result.street = working;
    } else if (!result.house && /^\d+[0-9а-яa-z/-]*$/i.test(working)) {
      result.house = cleanHouseNumber(working);
    }
  }

  return result;
}

/**
 * Formats structured address components into a clean, human-readable Russian address string.
 * Example: "г. Москва, ул. Ленина, д. 10, подъезд 2, эт. 4, кв. 25, домофон: 45K, 101000"
 */
export function formatAddress(addr?: AddressComponents | Partial<SavedAddress> | null): string {
  if (!addr) return '';

  const parts: string[] = [];

  if (addr.region && addr.region.trim()) {
    parts.push(addr.region.trim());
  }

  if (addr.city && addr.city.trim()) {
    const cityClean = cleanCityName(addr.city);
    if (cityClean) {
      parts.push(`г. ${cityClean}`);
    }
  }

  const hClean = cleanHouseNumber(addr.house);

  if (addr.street && addr.street.trim()) {
    let streetPart = addr.street.trim();
    if (hClean) {
      // Avoid duplicating house if street already contains "д. <hClean>" at the end
      const alreadyHasHouse = new RegExp(`(?:(?:^|\\s|,)(?:дом|д\\.?)\\s*|,\\s*)${hClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(
        streetPart
      );
      if (!alreadyHasHouse) {
        streetPart += `, д. ${hClean}`;
      }
    }
    parts.push(streetPart);
  } else if (hClean) {
    parts.push(`д. ${hClean}`);
  }

  if (addr.building && addr.building.trim()) {
    parts.push(`корп. ${addr.building.trim()}`);
  }

  if (addr.entrance && addr.entrance.trim()) {
    const ent = addr.entrance.trim();
    parts.push(ent.toLowerCase().includes('под') ? ent : `подъезд ${ent}`);
  }

  if (addr.floor && addr.floor.trim()) {
    const fl = addr.floor.trim();
    parts.push(fl.toLowerCase().includes('эт') ? fl : `эт. ${fl}`);
  }

  if (addr.apartment && addr.apartment.trim()) {
    const apt = addr.apartment.trim();
    if (!/^(?:квартира|кв\.?|офис|оф\.?)\s*/i.test(apt)) {
      parts.push(`кв. ${apt}`);
    } else {
      parts.push(apt);
    }
  }

  if (addr.intercom && addr.intercom.trim()) {
    const ic = addr.intercom.trim();
    parts.push(ic.toLowerCase().includes('домофон') ? ic : `домофон: ${ic}`);
  }

  if (addr.postalCode && addr.postalCode.trim()) {
    parts.push(addr.postalCode.trim());
  }

  return parts.join(', ');
}

