import type { Order } from '../types';
import { adminStatusLabel } from './orderFlow';

/** Chip of an order status: the same colours and words in «Заказы», «Клиенты» and «Аналитика» */
const STATUS_CHIP: Record<Order['status'], string> = {
  accepted: 'bg-accent/5 text-accent border-accent/20',
  assembling: 'bg-warning-soft text-warning border-warning/25',
  in_transit: 'bg-accent/10 text-accent border-accent/30',
  ready: 'bg-success-soft text-success border-success/25',
  delivered: 'bg-[#D8DFE8] text-[#2D3A4E] border-[#BAC5D5]',
};

export function orderStatusChip(order: Order): { label: string; className: string } {
  if (order.isCancelled) {
    return {
      label: order.cancelledBy === 'customer' ? 'Отменён клиентом' : 'Отменен',
      className: 'bg-danger-soft text-danger border-danger/25',
    };
  }
  return {
    label: adminStatusLabel(order),
    className: STATUS_CHIP[order.status] ?? 'bg-[#D8DFE8] text-[#2D3A4E] border-[#BAC5D5]',
  };
}
