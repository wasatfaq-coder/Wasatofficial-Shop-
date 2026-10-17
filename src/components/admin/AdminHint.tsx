import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { CircleHelp } from 'lucide-react';

/**
 * «Для чего это» next to a section, field or button of the admin panel (docs/admin-wholesale-plan.md, stage 3; texts —
 * docs/admin-wholesale/hints.md, approved by the owner as they are). A small «?» button: a tap opens a short text, a mouse
 * hover opens it too. Base UI Popover portaled above the panel (data-floating-layer): Escape closes only the hint, not
 * the panel. The button names what it explains, so a screen reader hears «Что это: Выручка».
 *
 * A press on «?» that the hover has already opened keeps the hint open. Base UI closes such a hint when the press comes
 * later than 0.5 s after the hover opened it (a «patient click»): the owner who pointed at «?», read and pressed lost the
 * text, and the CI browser, slower than a laptop, did the same (admin-hints.spec.ts on main, 11.10). The press pins the
 * hint instead — moving the pointer away no longer closes it — and the next press, Escape or a press outside does.
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
  const [open, setOpen] = React.useState(false);
  const openedByHover = React.useRef(false);
  // A slow press pinned the hint: Base UI's own closing (the press itself, the pointer leaving «?») is cancelled, so its
  // state stays open with ours and only the next press, Escape or a press outside close it
  const pinned = React.useRef(false);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === 'trigger-press' && openedByHover.current) {
          details.cancel();
          openedByHover.current = false;
          pinned.current = true;
          return;
        }
        if (!next && details.reason === 'trigger-hover' && pinned.current) {
          details.cancel();
          return;
        }
        if (!next) pinned.current = false;
        openedByHover.current = next && details.reason === 'trigger-hover';
        setOpen(next);
      }}
    >
      <Popover.Trigger
        openOnHover
        delay={250}
        aria-label={`Что это: ${label}`}
        className={`inline-flex items-center justify-center w-8 h-8 -m-1 shrink-0 rounded-full text-text-secondary hover:text-accent cursor-pointer align-middle ${className}`}
      >
        <CircleHelp className="w-4 h-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner data-floating-layer="" className="z-[260] outline-none" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className="max-w-[min(18rem,calc(100vw-16px))] px-3 py-2 neu-dropdown rounded-2xl outline-none text-xs leading-snug text-text-primary font-normal normal-case tracking-normal text-left transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
