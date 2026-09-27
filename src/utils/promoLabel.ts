import type { AppliedPromoInfo } from '../types';

/** «500 ₽» for a fixed promo, «10%» for a percentage one */
export function promoDiscountText(promo: Pick<AppliedPromoInfo, 'discountType' | 'discountValue' | 'discountPercent'>): string {
  return promo.discountType === 'fixed'
    ? `${(promo.discountValue || 0).toLocaleString('ru-RU')} ₽`
    : `${promo.discountValue || promo.discountPercent || 0}%`;
}
