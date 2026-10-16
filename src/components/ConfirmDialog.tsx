import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { ModalPortal } from './ModalPortal';
import { useDialogA11y } from '../utils/useDialogA11y';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  /** Icon on the confirm button; a trash can by default */
  confirmIcon?: React.ReactNode;
  /** 'neutral' for a bulk change that is not a deletion: accent button instead of the danger one */
  tone?: 'danger' | 'neutral';
  onConfirm: () => void;
  onClose: () => void;
  /** What is being removed (thumbnail, name…), shown in a pressed-in box as in the cart's remove dialog */
  preview?: React.ReactNode;
  /** Label of the button that keeps the item; «Отмена» by default */
  cancelLabel?: string;
}

/**
 * Confirmation before a destructive action (delete, clear). Rendered above any modal,
 * including the admin panel. The destructive button is neu-button-danger, never a filled one.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Удалить',
  confirmIcon,
  tone = 'danger',
  onConfirm,
  onClose,
  preview,
  cancelLabel = 'Отмена',
}) => {
  // Focus goes to the safe button («Отмена»): Enter by accident does not delete
  const dialog = useDialogA11y(isOpen, onClose);
  return (
  <ModalPortal>
  <AnimatePresence>
    {isOpen && (
      <m.div
        key="confirm-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4"
      >
        <div onClick={onClose} className="fixed inset-0 bg-text-primary/50 backdrop-blur-xs cursor-pointer" />
        <m.div
          ref={dialog.ref}
          {...dialog.props}
          role="alertdialog"
          initial={{ scale: 0.93, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.93, opacity: 0, y: 12 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 z-10"
        >
          <div className="flex items-center justify-between gap-3 pb-2 neu-divider-b">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 ${
                  tone === 'danger' ? 'text-danger' : 'text-accent'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
              </div>
              <h3 id={dialog.titleId} className="text-sm font-extrabold text-text-primary">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
            >
              <X className="w-4 h-4 stroke-[2.5] shrink-0" />
            </button>
          </div>

          {preview && (
            <div className="neu-inset rounded-2xl p-2.5 flex items-center gap-3 min-w-0">{preview}</div>
          )}

          <p className="text-xs text-text-secondary leading-relaxed">{message}</p>

          <div className="flex items-center gap-2 pt-1">
            <button
              data-autofocus
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                tone === 'danger' ? 'neu-button-danger' : 'neu-button text-accent'
              }`}
            >
              {confirmIcon ?? <Trash2 className="w-3.5 h-3.5" />}
              <span>{confirmLabel}</span>
            </button>
          </div>
        </m.div>
      </m.div>
    )}
  </AnimatePresence>
  </ModalPortal>
);
};
