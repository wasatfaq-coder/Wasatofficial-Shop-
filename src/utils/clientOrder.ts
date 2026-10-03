import type { CartItem, DeliveryMethod, Order } from '../types';
import { formatOrderDate } from '../shared/orderDate';
import { initialPaymentStatus } from '../shared/orderApi';
import { deliveryKindOfMethod, estimatedDeliveryOf, initialStatusLog } from '../shared/orderFlow';
import type { AddressParts, PersonName } from '../shared/personName';
import { getDefaultHistorySteps, getSynchronizedDeliveryStages } from './deliveryStages';

/** What the checkout knows about an order from the browser (`completeOrderLocally` in App.tsx) */
export interface ClientOrderInput {
  id: string;
  placedAt: Date;
  /** Lines with the light copy of the product (`toOrderLineProduct`, no photos) */
  items: CartItem[];
  totalPrice: number;
  deliveryAddress: string;
  deliveryMethod: string;
  /** The chosen method of «Доставка и ПВЗ»; absent for a 1-click order */
  method?: Pick<DeliveryMethod, 'id' | 'type' | 'title'> & Partial<Pick<DeliveryMethod, 'duration'>>;
  customerName: string;
  nameParts?: PersonName;
  customerPhone: string;
  customerEmail: string;
  customerUid: string;
  addressParts?: AddressParts;
  paymentMethod: string;
  deliveryFee?: number;
  discountAmount?: number;
  promoCode?: string;
}

/**
 * The order document the browser writes (аудит 02.10, находка 22). The rules test writes what this function builds
 * (`scripts/client-order-sample.ts`), so a new field here fails `bun run test:rules` until `isClientOrderShape` takes it —
 * instead of every order of the site being refused after the deploy.
 */
export function buildClientOrder(input: ClientOrderInput): Order {
  const base = {
    id: input.id,
    // the exact moment is createdAt (analytics, sorting); date is its display text
    createdAt: input.placedAt.toISOString(),
    date: formatOrderDate(input.placedAt),
    items: input.items,
    status: 'accepted' as const,
    totalPrice: input.totalPrice,
    deliveryAddress: input.deliveryAddress,
    deliveryMethod: input.deliveryMethod,
    customerName: input.customerName,
    customerLastName: input.nameParts?.lastName || undefined,
    customerFirstName: input.nameParts?.firstName || undefined,
    customerMiddleName: input.nameParts?.middleName || undefined,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    customerUid: input.customerUid,
    deliveryAddressParts: input.addressParts,
    paymentMethod: input.paymentMethod,
    paymentStatus: initialPaymentStatus(input.paymentMethod),
    // The same breakdown as orders placed by placeOrder: promo analytics and the invoice read it
    deliveryFee: input.deliveryFee,
    discountAmount: input.discountAmount || undefined,
    promoCode: input.promoCode,
    trackingNumber: undefined,
    estimatedDelivery: estimatedDeliveryOf(input.method),
    // its chain of statuses and the first entry of the history (src/shared/orderFlow.ts, as in placeOrder)
    deliveryKind: input.method ? deliveryKindOfMethod(input.method) : undefined,
    statusLog: initialStatusLog(input.placedAt),
  };
  return {
    ...base,
    historySteps: getDefaultHistorySteps(base),
    deliveryStages: getSynchronizedDeliveryStages(base as Order),
  };
}
