import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        key="confirm-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4"
      >
        <div onClick={onClose} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          initial={{ scale: 0.93, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.93, opacity: 0, y: 12 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 z-10"
        >
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 ${
                  tone === 'danger' ? 'text-danger' : 'text-[#4B59BB]'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-extrabold text-[#2D3A4E]">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          <p className="text-xs text-[#4E5C70] leading-relaxed">{message}</p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer ${
                tone === 'danger' ? 'neu-button-danger' : 'neu-button text-[#4B59BB]'
              }`}
            >
              {confirmIcon ?? <Trash2 className="w-3.5 h-3.5" />}
              <span>{confirmLabel}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
