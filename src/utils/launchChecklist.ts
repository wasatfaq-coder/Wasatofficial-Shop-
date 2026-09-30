import type { DeliveryMethod, Product, StorefrontSettings } from '../types';
import type { AdminTab } from '../components/admin/adminSections';
import { missingLegalRequisites } from './legalDocs';

export interface LaunchStep {
  id: string;
  title: string;
  /** What is still missing, in the owner's words */
  hint: string;
  done: boolean;
  /** Not needed for the first sale: the card hides without it and does not count it as left */
  optional?: boolean;
  tab: AdminTab;
}

/**
 * What the owner fills in before the first sale, in the order a customer meets it. The same «empty = not set»
 * logic as NotConfigured: without these the customer sees «не настроено» or cannot place an order.
 */
export function launchSteps(
  products: Pick<Product, 'id'>[],
  deliveryMethods: Pick<DeliveryMethod, 'isActive'>[],
  settings: Partial<StorefrontSettings> | null | undefined
): LaunchStep[] {
  const missingLegal = missingLegalRequisites(settings);
  return [
    {
      id: 'categories',
      title: 'Категории',
      hint: 'Разделы каталога, по которым покупатель ищет товар',
      // same filter as getCategories (categories.ts pulls in the icon components, not for Cloud Functions tests)
      done: (settings?.categories ?? []).some((c) => c.id && c.name.trim()),
      tab: 'categories',
    },
    {
      id: 'products',
      title: 'Первый товар',
      hint: 'Фото, цена, размеры и остаток',
      done: products.length > 0,
      tab: 'products',
    },
    {
      id: 'delivery',
      title: 'Способ доставки',
      hint: 'Без него оформление заказа недоступно',
      done: deliveryMethods.some((m) => m.isActive !== false),
      tab: 'delivery',
    },
    {
      id: 'payment',
      title: 'Способ оплаты',
      hint: 'Без него оформление заказа недоступно',
      done: (settings?.paymentMethods ?? []).some((m) => m.isActive !== false && m.title.trim()),
      tab: 'payment',
    },
    {
      id: 'legal',
      title: 'Реквизиты продавца',
      // Решение владельца 01.10: магазин работает без реквизитов; без них оферта и политика не показываются
      hint: 'Необязательно. Пока их нет, покупатель не видит оферту и политику',
      done: missingLegal.length === 0,
      optional: true,
      tab: 'storefront', // реквизиты — в «Витрине»
    },
  ];
}
