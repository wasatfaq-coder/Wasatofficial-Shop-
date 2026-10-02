import { Order, PromoCode } from '../types';
import { orderRevenue } from './analyticsEngine';

/**
 * Partner commission for statistics, counted from the orders themselves. The promo's `commissionEarned` counter
 * grows when an order is placed and a visitor can raise it (audit 02.10, finding 2), so it is not used here.
 * Commission is not paid out by the site: this is what the owner reconciles before paying a partner.
 */

/** An order counts for a partner only when it is paid and received by the customer */
export function isCommissionConfirmed(order: Order): boolean {
  return !order.isCancelled && order.paymentStatus === 'paid' && order.status === 'delivered';
}

/** Sales the commission is taken from: the order total minus a refund and the delivery fee */
export function commissionBase(order: Order): number {
  const delivery = Number(order.deliveryFee) || 0;
  return Math.max(0, orderRevenue(order) - delivery);
}

/** The partner's percent, or null when it is not set (no commission is made up) */
export function partnerPercent(promo: PromoCode): number | null {
  const percent = Number(promo.partnerCommissionPercent);
  return Number.isFinite(percent) && percent > 0 ? percent : null;
}

export interface PartnerCommission {
  promoId: string;
  code: string;
  partnerName?: string;
  percent: number | null;
  /** Paid and received orders with the code */
  confirmedOrders: number;
  confirmedSales: number;
  commission: number;
  /** Orders with the code that are not paid or not received yet (cancelled ones are left out) */
  pendingOrders: number;
  pendingSales: number;
}

/** Commission of every partner promo code over the given orders (all of them or one period's) */
export function computePartnerCommissions(promos: PromoCode[], orders: Order[]): PartnerCommission[] {
  const byCode = new Map<string, PartnerCommission>();
  for (const promo of promos) {
    if (!promo.isReferral) continue;
    byCode.set(promo.code.trim().toUpperCase(), {
      promoId: promo.id,
      code: promo.code,
      partnerName: promo.partnerName,
      percent: partnerPercent(promo),
      confirmedOrders: 0,
      confirmedSales: 0,
      commission: 0,
      pendingOrders: 0,
      pendingSales: 0,
    });
  }
  for (const order of orders) {
    const row = byCode.get(order.promoCode?.trim().toUpperCase() ?? '');
    if (!row || order.isCancelled) continue;
    const base = commissionBase(order);
    if (isCommissionConfirmed(order)) {
      row.confirmedOrders += 1;
      row.confirmedSales += base;
    } else {
      row.pendingOrders += 1;
      row.pendingSales += base;
    }
  }
  for (const row of byCode.values()) {
    row.commission = row.percent === null ? 0 : Math.round((row.confirmedSales * row.percent) / 100);
  }
  return [...byCode.values()];
}
