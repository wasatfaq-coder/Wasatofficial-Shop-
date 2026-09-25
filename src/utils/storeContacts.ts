import type { StorefrontSettings } from '../types';
import { loadStorefrontSettings } from './inventory';

/**
 * Demo contacts and legal details shipped with the original template. They were seeded into
 * Firestore (settings/storefront) on first launch, so they may still be stored there.
 * Customers must never see them: fake phone numbers and requisites of a non-existent
 * company mislead buyers. Real values are entered in Admin → «Витрина».
 */
const DEMO_VALUES = new Set(
  [
    '+7 (495) 123-45-67',
    '+7 (999) 000-00-00',
    '8 (800) 555-35-35',
    'concierge@manstyle.ru',
    '@manstyle_official',
    'Москва, Пресненская наб. 12, Башня Федерация Восток, 2 этаж',
    'ООО «МЭНСТАЙЛ РУС»',
    '7704829104',
    '770401001',
    '1217700458921',
    'ПАО «Сбербанк России», г. Москва',
    '044525225',
    '40702810938000012345',
    '30101810400000000225',
    '125009, г. Москва, Столешников переулок, д. 14, стр. 1, офис 402',
    'Диадок (ID: 2BM-7704829104-770401001), СБИС',
    'Смирнов Александр Владимирович',
  ].map((v) => v.toLowerCase())
);

export const STORE_NAME_DEFAULT = 'Wasat Shop';

/** The template's brand. It is still stored in Firestore until the owner runs the rename in Admin → «Витрина». */
export const LEGACY_BRAND_PATTERN = /MANSTYLE|ManStyle|Manstyle/g;

/** Store name to show: the saved one, unless it is unset or the template brand. */
export function getStoreName(settings?: Partial<StorefrontSettings> | null): string {
  const saved = (settings?.storeName ?? '').trim();
  if (!saved || new RegExp(`^(${LEGACY_BRAND_PATTERN.source})$`, 'i').test(saved)) return STORE_NAME_DEFAULT;
  return saved;
}

/** Two-letter monogram of the store name for avatar badges: «Wasat Shop» → «WS» */
export function storeInitials(name: string): string {
  const letters = name.trim().split(/\s+/).map((word) => word[0] ?? '').join('');
  return (letters || name.slice(0, 2)).slice(0, 2).toUpperCase();
}

/** Store name for code without access to the settings props: read from the cached settings */
export function currentStoreName(): string {
  return getStoreName(loadStorefrontSettings());
}

/** Template texts seeded into Firestore with «&» and «ё», and their current wording (exact matches only) */
const LEGACY_TEMPLATE_TEXTS: Record<string, string> = {
  'Бутик премиальной мужской одежды & обуви': 'Бутик премиальной мужской одежды и обуви',
  'Натуральный 100% лён и дышащие ткани': 'Натуральный 100% лен и дышащие ткани',
  '100% ЛЁН': '100% ЛЕН',
};

/** A text from Firestore with the template wording updated and the template brand replaced by the store name. */
export function withStoreName(text: string | undefined | null, storeName: string = STORE_NAME_DEFAULT): string {
  const value = text ?? '';
  return (LEGACY_TEMPLATE_TEXTS[value] ?? value).replace(LEGACY_BRAND_PATTERN, storeName);
}

/** Keys that hold identifiers, codes, links or images: never renamed */
const TECHNICAL_KEY = /id$|code|url|image|link|href|icon|color|sku|barcode/i;

/** Copy of a Firestore record for customers: the template brand replaced in its text fields */
export function withStoreNameFields<T extends object>(record: T, storeName: string = STORE_NAME_DEFAULT): T {
  const out: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (TECHNICAL_KEY.test(key)) continue;
    if (typeof value === 'string') out[key] = withStoreName(value, storeName);
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      out[key] = value.map((v) => withStoreName(v, storeName));
    }
  }
  return out as T;
}

/** A settings value safe to show to customers: trimmed, or '' when unset or a template demo value. */
export function publicSetting(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  return DEMO_VALUES.has(trimmed.toLowerCase()) ? '' : trimmed;
}

export interface StoreContacts {
  phone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  pickupAddress: string;
}

export function getStoreContacts(settings?: Partial<StorefrontSettings> | null): StoreContacts {
  return {
    phone: publicSetting(settings?.phone),
    email: publicSetting(settings?.email),
    telegram: publicSetting(settings?.telegram),
    whatsapp: publicSetting(settings?.whatsapp),
    pickupAddress: publicSetting(settings?.pickupAddress),
  };
}

export interface LegalDetails {
  companyName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  bankName: string;
  bik: string;
  checkingAccount: string;
  corrAccount: string;
  legalAddress: string;
  edo: string;
  ceo: string;
}

export function getLegalDetails(settings?: Partial<StorefrontSettings> | null): LegalDetails {
  return {
    companyName: publicSetting(settings?.legalEntityName),
    inn: publicSetting(settings?.inn),
    kpp: publicSetting(settings?.kpp),
    ogrn: publicSetting(settings?.ogrn),
    bankName: publicSetting(settings?.bankName),
    bik: publicSetting(settings?.bik),
    checkingAccount: publicSetting(settings?.checkingAccount),
    corrAccount: publicSetting(settings?.corrAccount),
    legalAddress: publicSetting(settings?.legalAddress),
    edo: publicSetting(settings?.edo),
    ceo: publicSetting(settings?.ceo),
  };
}

/** Digits and leading "+" for a tel: link. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}
