import type { Order } from '../../types';
import { customerStatusLabel, flowStatuses } from '../../utils/orderFlow';
import { cancelledByLabel } from '../../utils/orderCancel';

// Progress by the order's own chain of statuses (src/shared/orderFlow.ts): steps done of its steps
const STATUS_TONE: Record<Order['status'], { color: string; text: string }> = {
  accepted: { color: 'bg-accent', text: 'text-accent-strong' },
  assembling: { color: 'bg-warning', text: 'text-warning' },
  in_transit: { color: 'bg-accent', text: 'text-accent-strong' },
  ready: { color: 'bg-success', text: 'text-success' },
  delivered: { color: 'bg-success', text: 'text-success' },
};
export const getOrderStatusProgress = (order: Order) => {
  if (order.isCancelled) {
    return { percent: 0, label: cancelledByLabel(order, 'customer'), color: 'bg-danger', text: 'text-danger' };
  }
  const chain = flowStatuses(order);
  const percent = Math.round(((chain.indexOf(order.status) + 1) / chain.length) * 100);
  return { percent, label: customerStatusLabel(order), ...(STATUS_TONE[order.status] ?? STATUS_TONE.accepted) };
};
