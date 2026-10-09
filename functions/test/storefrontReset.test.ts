// «Сброс» в «Витрине» (аудит 07.10, этап 8, находка 59-П1): очищает контакты, реквизиты и тексты, но не категории,
// оплату, FAQ, этикетки, график, режимы и пороги — раньше вместо документа писался набор по умолчанию целиком
import { describe, expect, test } from 'bun:test';
import type { StorefrontSettings } from '../../src/types';
import { STOREFRONT_RESET_FIELDS, resetStorefrontTexts } from '../../src/utils/storefrontReset';

const filled = {
  storeName: 'Мой магазин',
  phone: '+7 999 000-00-00',
  email: 'shop@example.ru',
  inn: '7700000000',
  conciergeDescription: 'Подберём образ',
  brandPhilosophyText: 'Делаем на века',
  brandGuaranteesList: ['Возврат 14 дней'],
  storeBannerText: 'Скидки до 20 %',
  isStoreOnline: false,
  isExpressEnabled: false,
  isPreorderMode: true,
  lowStockThreshold: 7,
  freeDeliveryThreshold: 5000,
  returnPeriodDays: 14,
  unpaidOrderCancelDays: 3,
  workingHours: 'Без обеда',
  schedule: { days: [], exceptions: [] },
  categories: [{ id: 'shirts', name: 'Рубашки' }],
  paymentMethods: [{ id: 'cash', title: 'Наличными', isActive: true }],
  faqItems: [{ id: 'q1', question: 'Как вернуть?', answer: 'В течение 14 дней' }],
  labelFormats: [{ id: 'l1' }],
} as unknown as StorefrontSettings;

describe('resetStorefrontTexts', () => {
  const reset = resetStorefrontTexts(filled);

  test('clears contacts, legal details and the concierge and brand texts', () => {
    for (const field of STOREFRONT_RESET_FIELDS) expect(reset[field]).toBe('');
    expect(reset.brandGuaranteesList).toEqual([]);
  });

  test('keeps categories, payment, FAQ, labels, schedule, modes, thresholds and the name', () => {
    for (const key of [
      'storeName', 'storeBannerText', 'isStoreOnline', 'isExpressEnabled', 'isPreorderMode', 'lowStockThreshold',
      'freeDeliveryThreshold', 'returnPeriodDays', 'unpaidOrderCancelDays', 'workingHours', 'schedule', 'categories',
      'paymentMethods', 'faqItems', 'labelFormats',
    ] as const) {
      expect(reset[key]).toEqual(filled[key]);
    }
  });

  test('does not change the settings it was given', () => {
    expect(filled.phone).toBe('+7 999 000-00-00');
  });
});
