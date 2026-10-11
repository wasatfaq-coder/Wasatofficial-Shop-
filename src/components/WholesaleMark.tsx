import React from 'react';

/**
 * «Опт» next to a wholesale line or order (stages 16–17 of docs/admin-wholesale-plan.md): the cart, the checkout,
 * «Мои заказы» and «Заказы». A text label, not a colour alone
 */
export const WholesaleMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-block px-1.5 py-px rounded-md bg-accent/10 text-accent text-[11px] font-extrabold leading-tight align-middle ${className}`}
  >
    Опт
  </span>
);
