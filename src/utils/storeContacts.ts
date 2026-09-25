import type { StorefrontSettings } from '../types';

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
