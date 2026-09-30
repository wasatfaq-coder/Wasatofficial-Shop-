import type { DeliveryMethod, Product, StorefrontSettings } from '../types';
import type { AdminTab } from '../components/admin/adminSections';
import { getCategories } from './categories';
import { missingLegalRequisites } from './legalDocs';

export interface LaunchStep {
  id: string;
  title: string;
  /** What is still missing, in the owner's words */
  hint: string;
  done: boolean;
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
      done: getCategories(settings).length > 0,
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
      hint: missingLegal.length > 0 ? `Для оферты не хватает: ${missingLegal.join(', ')}` : 'Для оферты и политики',
      done: missingLegal.length === 0,
      tab: 'storefront', // реквизиты — в «Витрине»
    },
  ];
}
