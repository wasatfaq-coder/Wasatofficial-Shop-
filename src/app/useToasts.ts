import { useState } from 'react';
import type { ToastMessage } from '../components/Toast';

/** The shop's toasts (`ToastContainer`) and `persist`: a write that must not fail silently */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Helper Toast launcher
  const addToast = (
    text: string,
    type: 'success' | 'info' | 'error' = 'success',
    action?: ToastMessage['action']
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    // The same message is not stacked twice (errors stay until closed)
    setToasts((prev) =>
      prev.some((t) => t.text === text && t.type === type) ? prev : [...prev, { id, text, type, ...(action ? { action } : {}) }]
    );
  };

  /**
   * Admin writes to Firestore: a rejected write (rules, network) shows an error toast instead of
   * failing silently. Resolves to false so the caller does not report «Сохранено».
   */
  const persist = (label: string, ...writes: Promise<unknown>[]): Promise<boolean> =>
    Promise.all(writes).then(
      () => true,
      (error) => {
        console.error(`Не сохранено: ${label}`, error);
        addToast(`Не сохранено: ${label}. Проверьте соединение и повторите`, 'error');
        return false;
      }
    );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, setToasts, addToast, removeToast, persist };
}

export type AddToast = ReturnType<typeof useToasts>['addToast'];
export type Persist = ReturnType<typeof useToasts>['persist'];
