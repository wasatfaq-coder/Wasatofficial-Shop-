import type { Order } from '../types';
import { adminStatusLabel } from './orderFlow';

/** Chip of an order status: the same colours and words in «Заказы», «Клиенты» and «Аналитика» */
const STATUS_CHIP: Record<Order['status'], string> = {
  accepted: 'neu-tone-info border-transparent',
  assembling: 'neu-tone-warning border-transparent',
  in_transit: 'neu-tone-info border-transparent',
  ready: 'neu-tone-success border-transparent',
  delivered: 'neu-inset text-text-primary border-[#BAC5D5]/50',
};

export function orderStatusChip(order: Order): { label: string; className: string } {
  if (order.isCancelled) {
    return {
      label: order.cancelledBy === 'customer' ? 'Отменён клиентом' : 'Отменен',
      className: 'neu-tone-danger border-transparent',
    };
  }
  return {
    label: adminStatusLabel(order),
    className: STATUS_CHIP[order.status] ?? 'neu-inset text-text-primary border-[#BAC5D5]/50',
  };
}
