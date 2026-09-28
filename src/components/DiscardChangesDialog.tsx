import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Closing a form with unsaved edits (Escape, «×», «Отмена»): asks first; without edits closes at once.
 * `const guard = useDiscardGuard(isDirty, close)` → `guard.requestClose` on every close point and
 * `<DiscardChangesDialog {...guard.dialogProps} what="Изменения товара" />`.
 */
export function useDiscardGuard(dirty: boolean, close: () => void) {
  const [isAsking, setIsAsking] = useState(false);
  return {
    requestClose: () => (dirty ? setIsAsking(true) : close()),
    dialogProps: { isOpen: isAsking, onConfirm: close, onClose: () => setIsAsking(false) },
  };
}

interface DiscardChangesDialogProps {
  isOpen: boolean;
  /** What is lost, e.g. «Изменения товара» */
  what: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const DiscardChangesDialog: React.FC<DiscardChangesDialogProps> = ({ isOpen, what, onConfirm, onClose }) => (
  <ConfirmDialog
    isOpen={isOpen}
    title="Закрыть без сохранения?"
    message={`${what} не сохранены и пропадут.`}
    confirmLabel="Не сохранять"
    confirmIcon={<X className="w-4 h-4" />}
    cancelLabel="Вернуться к правкам"
    onConfirm={onConfirm}
    onClose={onClose}
  />
);
