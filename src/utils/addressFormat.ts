import { SavedAddress } from '../types';

export interface AddressComponents {
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

/**
 * Formats structured address components into a clean, human-readable Russian address string.
 * Example: "г. Москва, ул. Ленина, д. 10, под. 2, эт. 4, кв. 25, домофон: 45K, 101000"
 */
export function formatAddress(addr?: AddressComponents | Partial<SavedAddress> | null): string {
  if (!addr) return '';

  const parts: string[] = [];

  if (addr.city && addr.city.trim()) {
    const cityTrimmed = addr.city.trim();
    parts.push(cityTrimmed.toLowerCase().startsWith('г.') ? cityTrimmed : `г. ${cityTrimmed}`);
  }

  if (addr.street && addr.street.trim()) {
    let streetPart = addr.street.trim();
    if (addr.house && addr.house.trim()) {
      const hTrim = addr.house.trim();
      // If user hasn't already typed "д." or "дом" in street
      if (!/\b(д\.|дом)\b/i.test(streetPart)) {
        streetPart += `, д. ${hTrim}`;
      }
    }
    parts.push(streetPart);
  } else if (addr.house && addr.house.trim()) {
    parts.push(`д. ${addr.house.trim()}`);
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
    if (!/\b(кв|оф|квартира|офис)\b/i.test(apt)) {
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
