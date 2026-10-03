import React from 'react';
import { Menu } from '@base-ui/react/menu';
import { Check } from 'lucide-react';

export interface AdminChoice<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * A choice of one value from a button (order status, payment status in «Заказы»; audit 02.10, finding 38). Base UI
 * Menu: role="menu" with menuitemradio + aria-checked, arrows, Escape closes only the menu (not the admin panel), focus
 * back to the button. The popup is portaled above the panel (data-floating-layer); styles neu-*. The current value is
 * pressed in, as everywhere else.
 */
export function AdminChoiceMenu<T extends string>({
  value,
  choices,
  onChoose,
  label,
  triggerClassName,
  children,
}: {
  value: T;
  choices: AdminChoice<T>[];
  onChoose: (value: T) => void;
  /** «Статус заказа», «Статус оплаты»: the button's name with the current value */
  label: string;
  triggerClassName: string;
  /** What the button shows */
  children: React.ReactNode;
}) {
  const current = choices.find((c) => c.value === value)?.label ?? '';
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`${label}: ${current}`} title={label} className={triggerClassName}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner data-floating-layer="" className="z-[260] outline-none" sideOffset={6} collisionPadding={8} align="end">
          <Menu.Popup className="min-w-[12rem] max-w-[calc(100vw-16px)] p-1.5 neu-dropdown rounded-2xl border border-white/80 outline-none space-y-1 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
            <Menu.RadioGroup value={value} onValueChange={(next) => next !== value && onChoose(next as T)}>
              {choices.map((choice) => (
                <Menu.RadioItem
                  key={choice.value}
                  value={choice.value}
                  closeOnClick
                  className={`w-full min-h-9 px-3 py-2 rounded-xl text-left text-xs text-[#2D3A4E] flex items-center gap-2 cursor-pointer select-none outline-none ${
                    choice.value === value ? 'neu-pill-active font-extrabold' : 'neu-option font-bold'
                  }`}
                >
                  {choice.icon && (
                    <span aria-hidden="true" className="w-4 h-4 flex items-center justify-center shrink-0">
                      {choice.icon}
                    </span>
                  )}
                  <span className="flex-1">{choice.label}</span>
                  <Menu.RadioItemIndicator className="shrink-0 text-accent">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
