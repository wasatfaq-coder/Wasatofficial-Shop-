/**
 * Contract of the `placeOrder` Cloud Function, shared by the storefront and functions/.
 */
import type { Order } from '../types';
import type { AddressParts } from './personName';

export const FUNCTIONS_REGION = 'europe-west1';
export const PLACE_ORDER_FUNCTION = 'placeOrder';

/**
 * settings/server — public, admin-writable. When `serverOrdersEnabled` is true the
 * storefront places orders through the Cloud Function and firestore.rules stop accepting
 * orders, stock and promo-counter writes from clients.
 */
export const SERVER_CONFIG_DOC_ID = 'server';

/**
 * «Онлайн-витрина» in Admin → «Витрина»: switched off («Технические работы»), the site takes no orders — the checkout,
 * a 1-click order and placeOrder refuse (UX audit 03.10, finding 21; before, it only showed a banner on the home screen)
 */
export function storeAcceptsOrders(settings?: { isStoreOnline?: boolean } | null): boolean {
  return settings?.isStoreOnline !== false;
}

export const STORE_PAUSED_TEXT = 'Магазин временно не принимает заказы на сайте';

/**
 * Payment status of a new order. The site does not take money, so it never marks an order «Оплачен» itself:
 * the admin confirms payment in «Заказы». Payment on delivery is marked so the courier knows to collect it
 * (on checkout its title always contains «при получении»).
 */
export function initialPaymentStatus(paymentMethod: string): 'pending' | 'paid_on_delivery' {
  return paymentMethod.toLowerCase().includes('получении') ? 'paid_on_delivery' : 'pending';
}

export interface ServerConfig {
  serverOrdersEnabled?: boolean;
}

export interface PlaceOrderItem {
  productId: string;
  color: string;
  size: string;
  quantity: number;
}

export interface PlaceOrderRequest {
  items: PlaceOrderItem[];
  deliveryMethodId: string;
  deliveryAddress: string;
  paymentMethod: string;
  promoCode?: string;
  contact: {
    name: string;
    phone: string;
    email?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
  };
  /** Parts of the delivery address for the admin card (AddressParts) */
  addressParts?: AddressParts;
}

export interface PlaceOrderResponse {
  order: Order;
}
