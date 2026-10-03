import { useEffect, useId, useRef } from 'react';
import { registerWindow } from './windowHistory';

/**
 * Keyboard and screen-reader behaviour of a window (the panel of a modal, not its backdrop):
 * - `role="dialog"`, `aria-modal`, named by its title (`titleId`) or `label`;
 * - focus moves into the window when it opens (`[data-autofocus]`, else the panel itself) and returns
 *   to the element that opened it when it closes;
 * - Tab / Shift+Tab stay inside the window;
 * - Escape closes only the top-most window;
 * - the browser's «Назад» closes the top-most window too and leaves the screen as it is (`windowHistory.ts`).
 * Portaled popups of Base UI (a select's menu) are outside the panel: keys pressed there are theirs.
 *
 * Usage: `const dialog = useDialogA11y(isOpen, onClose);` then
 * `<div ref={dialog.ref} {...dialog.props}>` on the panel and `id={dialog.titleId}` on its heading.
 */

const openDialogs: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)
  );
}

/** Keys pressed inside a portaled popup (Base UI select menu, toast): not the window's business */
function inFloatingLayer(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-floating-layer], [role="listbox"], [role="status"], [role="alert"]'));
}

interface DialogA11yOptions {
  /** Name when the window has no visible title */
  label?: string;
  /** false — do not close on Escape or «Назад» (e.g. while saving) */
  closeOnEscape?: boolean;
}

export function useDialogA11y(open: boolean, onClose: () => void, options: DialogA11yOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(options.closeOnEscape !== false);
  closeOnEscapeRef.current = options.closeOnEscape !== false;

  // «Назад» closes the window as Escape does; a window that stays open (unsaved changes ask first) keeps its entry
  useEffect(() => {
    if (!open) return;
    return registerWindow(() => {
      if (closeOnEscapeRef.current) onCloseRef.current();
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let node: HTMLElement | null = null;
    let registered = false;

    // The panel may mount a frame later (AnimatePresence, portals): wait for it
    const register = () => {
      node = ref.current;
      if (!node || registered) return;
      registered = true;
      openDialogs.push(node);
      if (!node.contains(document.activeElement)) {
        const target = node.querySelector<HTMLElement>('[data-autofocus]') ?? node;
        target.focus({ preventScroll: true });
      }
    };
    const frame = requestAnimationFrame(register);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!node || openDialogs[openDialogs.length - 1] !== node) return;
      if (inFloatingLayer(e.target) && !node.contains(e.target as Node)) return;
      if (e.key === 'Escape') {
        // An open select menu closes first (it handles Escape itself); a closed one stays in the DOM, hidden
        if (!closeOnEscapeRef.current || document.querySelector('[data-floating-layer]:not([hidden])')) return;
        e.stopPropagation();
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(node);
      if (items.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !node.contains(active);
      if (e.shiftKey && (active === first || active === node || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      if (node) {
        const index = openDialogs.lastIndexOf(node);
        if (index !== -1) openDialogs.splice(index, 1);
      }
      // Back to the button that opened the window (if it is still on the page); a window that opened
      // on its own over another one (a notice) gives the focus back to the window under it
      const below = openDialogs[openDialogs.length - 1];
      if (below && below.isConnected && !(opener && below.contains(opener))) below.focus({ preventScroll: true });
      else if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return {
    ref,
    titleId,
    props: {
      role: 'dialog' as const,
      'aria-modal': true,
      tabIndex: -1,
      ...(options.label ? { 'aria-label': options.label } : { 'aria-labelledby': titleId }),
    },
  };
}
