import type { StorefrontSettings } from '../../../types';
import { sameValue } from '../../../utils/unsavedChanges';

/**
 * Поля `settings/storefront`, которые правит форма «Витрины» во всех разделах, кроме «Резервной копии» (она пишет сразу).
 * «Применить» берёт из формы только их, а остальное (категории, оплату, FAQ, порог и режимы доставки, этикетки, опт)
 * оставляет таким, каким его сейчас хранит база: устаревшая копия формы не откатит то, что другой раздел сохранил
 * за это время (аудит 07.10, этап 8, находка 59-П3). Новое поле формы — сюда.
 */
export const STOREFRONT_FORM_FIELDS = [
  // Приём заказов
  'isStoreOnline',
  'isPreorderMode',
  'unpaidOrderCancelDays',
  'returnPeriodDays',
  // Контакты и график
  'storeName',
  'storeSlogan',
  'phone',
  'email',
  'telegram',
  'whatsapp',
  'pickupAddress',
  'workingHours',
  'schedule',
  'isStoreBannerVisible',
  'bannerBadgeText',
  'storeBannerText',
  // Реквизиты
  'legalEntityName',
  'ceo',
  'legalAddress',
  'edo',
  'inn',
  'kpp',
  'ogrn',
  'bankName',
  'bik',
  'checkingAccount',
  'corrAccount',
  // Тексты о бренде
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
  'brandGuaranteesList',
] as const satisfies readonly (keyof StorefrontSettings)[];

const asRecord = (settings: StorefrontSettings) => settings as unknown as Record<string, unknown>;

/**
 * `base` (то, что сохранено) с полями формы из `form`. Ключ, который форма очистила (его в `form` нет или он
 * `undefined`), в результате тоже `undefined`: запись уберёт его из документа.
 */
export function mergeFormFields(base: StorefrontSettings, form: StorefrontSettings): StorefrontSettings {
  const next: Record<string, unknown> = { ...asRecord(base) };
  const source = asRecord(form);
  for (const field of STOREFRONT_FORM_FIELDS) next[field] = source[field];
  return next as unknown as StorefrontSettings;
}

/** Правил ли владелец поля формы (только они), по сравнению с сохранённой версией */
export function formFieldsChanged(local: StorefrontSettings, saved: StorefrontSettings): boolean {
  const a = asRecord(local);
  const b = asRecord(saved);
  return STOREFRONT_FORM_FIELDS.some((field) => !sameValue(a[field], b[field]));
}

/**
 * Новая версия из базы поверх формы: что владелец не трогал, обновляется (например, название после «Заменить на …»),
 * его неприменённые правки остаются. `previous` — версия базы, которую форма знала до этого.
 */
export function mergeIncoming(
  local: StorefrontSettings,
  previous: StorefrontSettings,
  incoming: StorefrontSettings
): StorefrontSettings {
  const next: Record<string, unknown> = { ...asRecord(incoming) };
  const edited = asRecord(local);
  const known = asRecord(previous);
  for (const field of STOREFRONT_FORM_FIELDS) {
    if (!sameValue(edited[field], known[field])) next[field] = edited[field];
  }
  return next as unknown as StorefrontSettings;
}

/**
 * Число из поля: целое от 1 до `max`; пусто, ноль и не число — `undefined` («не задано»). Дробное округляется
 * (1500.5 — это 1501, а не 15 005). Одна функция для всех числовых полей «Витрины».
 */
export function parseWholeNumber(raw: string, max: number): number | undefined {
  const value = Math.round(Number(raw.replace(',', '.')));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(max, value);
}

/** Самый большой срок возврата, дней */
export const MAX_RETURN_PERIOD_DAYS = 365;
/** Самый большой срок до отмены неоплаченного заказа, дней */
export const MAX_UNPAID_CANCEL_DAYS = 30;

export type StorefrontSectionId = 'orders' | 'contacts' | 'requisites' | 'brand' | 'data';

export const STOREFRONT_SECTIONS: readonly { id: StorefrontSectionId; label: string }[] = [
  { id: 'orders', label: 'Приём заказов' },
  { id: 'contacts', label: 'Контакты и график' },
  { id: 'requisites', label: 'Реквизиты' },
  { id: 'brand', label: 'Тексты о бренде' },
  { id: 'data', label: 'Резервная копия' },
];

/** Что раздел получает от «Витрины»: форма и запись поля в неё */
export interface StorefrontSectionProps {
  settings: StorefrontSettings;
  patch: (change: Partial<StorefrontSettings>) => void;
}
