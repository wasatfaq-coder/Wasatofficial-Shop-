/**
 * Фамилия, имя и отчество покупателя (решение владельца 02.10: три поля вместо «Имя и фамилия»).
 * Полное имя одной строкой — «Фамилия Имя Отчество» — остаётся в `name` профиля и `customerName` заказа: его читают
 * «Клиенты», накладные, этикетки, чат и старые заказы. Shared with Cloud Functions — no browser APIs.
 */

export interface PersonName {
  lastName?: string;
  firstName?: string;
  middleName?: string;
}

const clean = (value?: string) => (value ?? '').replace(/\s+/g, ' ').trim();

/** «Фамилия Имя Отчество» без пустых частей */
export function fullName(name: PersonName): string {
  return [name.lastName, name.firstName, name.middleName].map(clean).filter(Boolean).join(' ');
}

/** True when at least one part is filled */
export function hasNameParts(name: PersonName): boolean {
  return Boolean(clean(name.lastName) || clean(name.firstName) || clean(name.middleName));
}

/**
 * Parts of a name saved before the three fields existed. The old field was «Имя и фамилия», so two words are
 * «Имя Фамилия»; three or more follow the Russian order «Фамилия Имя Отчество». The buyer sees the result in the form
 * and can correct it — nothing is saved until they do.
 */
export function splitLegacyName(name: string): PersonName {
  const words = clean(name).split(' ').filter(Boolean);
  if (words.length === 0) return {};
  if (words.length === 1) return { firstName: words[0] };
  if (words.length === 2) return { firstName: words[0], lastName: words[1] };
  return { lastName: words[0], firstName: words[1], middleName: words.slice(2).join(' ') };
}

/** Saved parts, or the old single name split into parts */
export function namePartsOf(source: PersonName & { name?: string }): PersonName {
  if (hasNameParts(source)) {
    return { lastName: clean(source.lastName), firstName: clean(source.firstName), middleName: clean(source.middleName) };
  }
  return splitLegacyName(source.name ?? '');
}

/**
 * Почта России и транспортные компании выдают посылку по паспорту: им нужно полное ФИО с отчеством
 * (галочка «Нет отчества» — для тех, у кого его нет). `title` — название способа, которое задал магазин.
 */
export function requiresFullName(method: { type?: string; title?: string }): boolean {
  if (method.type === 'post') return true;
  const title = (method.title ?? '').toLowerCase();
  return /почт|сдэк|cdek|boxberry|боксберри|dpd|pec|пэк|деловые линии|dellin|яндекс доставк|5post|пятёрочк|пятерочк|транспортн/.test(title);
}

/** Parts of a delivery address kept in the order for the admin card with copy buttons */
export interface AddressParts {
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  building?: string;
  entrance?: string;
  floor?: string;
  intercom?: string;
  apartment?: string;
  postalCode?: string;
  comment?: string;
}

export const ADDRESS_PART_KEYS: (keyof AddressParts)[] = [
  'region', 'city', 'street', 'house', 'building', 'entrance', 'floor', 'intercom', 'apartment', 'postalCode', 'comment',
];

/** Only filled parts, each trimmed and cut to a sane length (the rules limit the order's size) */
export function cleanAddressParts(parts: AddressParts): AddressParts | undefined {
  const out: AddressParts = {};
  for (const key of ADDRESS_PART_KEYS) {
    const value = clean(parts[key]).slice(0, key === 'comment' ? 300 : 120);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
