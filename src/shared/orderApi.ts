/**
 * Contract of the `placeOrder` Cloud Function, shared by the storefront and functions/.
 */
import type { Order } from '../types';

export const FUNCTIONS_REGION = 'europe-west1';
export const PLACE_ORDER_FUNCTION = 'placeOrder';

/**
 * settings/server — public, admin-writable. When `serverOrdersEnabled` is true the
 * storefront places orders through the Cloud Function and firestore.rules stop accepting
 * orders, stock and promo-counter writes from clients.
 */
export const SERVER_CONFIG_DOC_ID = 'server';

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
  };
}

export interface PlaceOrderResponse {
  order: Order;
}
