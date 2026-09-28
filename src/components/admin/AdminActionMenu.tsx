import React from 'react';
import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal } from 'lucide-react';

export interface AdminAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  /** Destructive (delete): red text, kept last and after a separator */
  danger?: boolean;
  /** A line above the item */
  separatorBefore?: boolean;
}

/**
 * «Ещё» menu for rarely used actions of a list row (Base UI Menu: role="menu", arrows, Escape, focus back to the
 * button). The popup is portaled above the admin panel (data-floating-layer, like NeumorphicSelect); styles neu-*.
 */
export const AdminActionMenu: React.FC<{ actions: AdminAction[]; label?: string; className?: string }> = ({
  actions,
  label = 'Ещё',
  className = '',
}) => (
  <Menu.Root>
    <Menu.Trigger
      className={`h-8 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer data-[popup-open]:text-accent ${className}`}
    >
      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      <span>{label}</span>
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner data-floating-layer="" className="z-[260] outline-none" sideOffset={6} collisionPadding={8} align="end">
        <Menu.Popup className="min-w-[14rem] max-w-[calc(100vw-16px)] p-1.5 neu-dropdown rounded-2xl border border-white/80 outline-none space-y-1 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
          {actions.map((action) => (
            <React.Fragment key={action.id}>
              {action.separatorBefore && <Menu.Separator className="my-1 h-px bg-[#BAC5D5]/60" />}
              <Menu.Item
                onClick={action.onSelect}
                className={`neu-option w-full min-h-9 px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2.5 cursor-pointer select-none outline-none ${
                  action.danger ? 'text-danger' : 'text-[#2D3A4E]'
                }`}
              >
                {action.icon && (
                  <span aria-hidden="true" className="w-4 h-4 flex items-center justify-center shrink-0">
                    {action.icon}
                  </span>
                )}
                {action.label}
              </Menu.Item>
            </React.Fragment>
          ))}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
