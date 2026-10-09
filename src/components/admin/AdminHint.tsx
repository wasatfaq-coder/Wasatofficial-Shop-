import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { CircleHelp } from 'lucide-react';

/**
 * «Для чего это» next to a section, field or button of the admin panel (docs/admin-wholesale-plan.md, stage 3; texts —
 * docs/admin-wholesale/hints.md, approved by the owner as they are). A small «?» button: a tap opens a short text, a mouse
 * hover opens it too. Base UI Popover portaled above the panel (data-floating-layer): Escape closes only the hint, not
 * the panel. The button names what it explains, so a screen reader hears «Что это: Выручка».
 */
export function AdminHint({
  label,
  children,
  className = '',
}: {
  /** What the hint explains, as the owner sees it on the screen: «Выручка», «Мин. сумма чека» */
  label: string;
  /** The text, up to ~90 characters */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={250}
        aria-label={`Что это: ${label}`}
        className={`inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-full text-[#4E5C70] hover:text-accent cursor-pointer align-middle ${className}`}
      >
        <CircleHelp className="w-4 h-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner data-floating-layer="" className="z-[260] outline-none" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className="max-w-[min(18rem,calc(100vw-16px))] px-3 py-2 neu-dropdown rounded-2xl border border-white/80 outline-none text-xs leading-snug text-[#2D3A4E] font-normal normal-case tracking-normal text-left transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
