import type { StorefrontSettings } from '../types';

/**
 * «Сброс» в «Витрине» (аудит 07.10, этап 8, находка 59-П1): очищает только то, что этот раздел и обещает очистить —
 * контакты, реквизиты, тексты консьерж-сервиса и бренда. Раньше раздел записывал вместо документа набор по умолчанию
 * целиком, и вместе с ним пропадали категории, способы оплаты, FAQ, форматы этикеток и график, а приём заказов снова
 * включался. Всё остальное в `settings/storefront` остаётся как было.
 */
export const STOREFRONT_RESET_FIELDS = [
  'storeSlogan',
  'phone',
  'email',
  'telegram',
  'whatsapp',
  'pickupAddress',
  'legalEntityName',
  'inn',
  'kpp',
  'ogrn',
  'bankName',
  'bik',
  'checkingAccount',
  'corrAccount',
  'legalAddress',
  'edo',
  'ceo',
  'conciergeDescription',
  'conciergeService1Title',
  'conciergeService1Desc',
  'conciergeService2Title',
  'conciergeService2Desc',
  'conciergeService3Title',
  'conciergeService3Desc',
  'brandPhilosophyTitle',
  'brandPhilosophyText',
  'brandMaterialsTitle',
  'brandMaterialsText',
  'brandCraftsmanshipTitle',
  'brandCraftsmanshipText',
  'brandGuaranteesTitle',
] as const satisfies readonly (keyof StorefrontSettings)[];

/** The settings with the section's contacts, legal details and texts emptied; everything else as it was */
export function resetStorefrontTexts(settings: StorefrontSettings): StorefrontSettings {
  const next: StorefrontSettings = { ...settings, brandGuaranteesList: [] };
  for (const field of STOREFRONT_RESET_FIELDS) next[field] = '';
  return next;
}
