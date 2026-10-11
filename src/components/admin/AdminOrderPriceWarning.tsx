import React, { useMemo } from 'react';
import { AdminHint } from './AdminHint';
import { AlertTriangle } from 'lucide-react';
import type { Order, Product } from '../../types';
import { orderPriceIssues, type OrderCheckContext } from '../../utils/orderPriceCheck';

/**
 * «Цены не совпадают с каталогом» before the payment is confirmed (audit 02.10, stage 5 without Blaze): prices of an order
 * from the browser are not checked by the database, so the owner sees what differs from the catalog, the order's sum,
 * the promo code, the delivery method and «Оплата» (`shop`, check 04.10).
 */
export const AdminOrderPriceWarning: React.FC<{ order: Order; products: Product[]; shop?: OrderCheckContext }> = ({
  order,
  products,
  shop,
}) => {
  const issues = useMemo(() => orderPriceIssues(order, products, shop), [order, products, shop]);
  if (issues.length === 0) return null;
  return (
    <div role="note" className="rounded-xl bg-danger-soft border border-danger/25 p-2.5 text-xs text-[#2D3A4E] space-y-1">
      <p className="flex items-center gap-1.5 font-extrabold text-danger">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Цены не совпадают с каталогом
        <AdminHint label="Цены не совпадают с каталогом">Цена в заказе другая, чем в каталоге. Сверьте сумму перед отправкой</AdminHint>
      </p>
      <ul className="list-disc pl-5 space-y-0.5">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p className="text-[#4E5C70]">
        Цена могла измениться после заказа, но заказ мог записать и посторонний. Сверьте сумму, прежде чем подтверждать
        оплату или отгружать.
      </p>
    </div>
  );
};
