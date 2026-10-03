import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X, XCircle } from 'lucide-react';
import type { Order } from '../types';
import { ModalPortal } from './ModalPortal';
import { useDialogA11y } from '../utils/useDialogA11y';
import { pluralRu } from '../utils/pluralize';
import {
  ADMIN_CANCEL_REASONS,
  CANCEL_COMMENT_MAX,
  CUSTOMER_CANCEL_REASONS,
  OTHER_CANCEL_REASON,
} from '../utils/orderCancel';

interface CancelOrderDialogProps {
  /** The order to cancel, or the admin's bulk selection; null — the window is closed */
  order: Order | Order[] | null;
  /** The buyer in the profile or the admin in «Заказы»: own reasons and own words */
  audience: 'customer' | 'admin';
  /** Resolves to true when the order is cancelled (the window closes), false to stay with the choice made */
  onConfirm: (reason: string, comment: string) => Promise<boolean>;
  onClose: () => void;
  /** «Удалить заказ» of an active order: cancelled first, then deleted or archived (owner's decision 03.10) */
  intent?: 'cancel' | 'delete';
}

/**
 * «Отменить заказ?» with the reason (a list and a comment, required for «Другая причина») and what is cancelled.
 * The buyer's and the admin's cancellation (owner's request 02.10; audit 02.10, finding 14: the admin cancelled with one
 * tap, without a reason). Focus starts on «Не отменять», so Enter by accident cancels nothing.
 */
export const CancelOrderDialog: React.FC<CancelOrderDialogProps> = ({ order: target, audience, onConfirm, onClose, intent = 'cancel' }) => {
  const list = target === null ? [] : Array.isArray(target) ? target : [target];
  const order = list[0] ?? null;
  const isBulk = list.length > 1;
  const isOpen = list.length > 0;
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useDialogA11y(isOpen, () => !busy && onClose(), { closeOnEscape: !busy });

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setComment('');
    setError('');
    setBusy(false);
  }, [isOpen, order?.id]);

  if (!order) return null;
  const reasons = audience === 'customer' ? CUSTOMER_CANCEL_REASONS : ADMIN_CANCEL_REASONS;
  const itemsCount = list.reduce((sum, o) => sum + (o.items ?? []).reduce((n, it) => n + (it.quantity || 0), 0), 0);
  const totalSum = list.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0);
  // a receipt on the check may mean the money is already sent
  const isPaid = list.some((o) => o.paymentStatus === 'paid' || o.paymentStatus === 'receipt_review');
  const errorId = `cancel-order-error-${order.id}`;

  const submit = async () => {
    const text = comment.trim();
    if (!reason) {
      setError('Выберите причину отмены');
      return;
    }
    if (reason === OTHER_CANCEL_REASON && !text) {
      setError('Напишите причину в комментарии');
      document.getElementById('cancel-order-comment')?.focus();
      return;
    }
    setError('');
    setBusy(true);
    const done = await onConfirm(reason, text);
    setBusy(false);
    if (done) onClose();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
        <div onClick={() => !busy && onClose()} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
        <div
          ref={dialog.ref}
          {...dialog.props}
          className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto neu-modal rounded-3xl p-5 space-y-4 z-10"
        >
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 text-danger">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              </div>
              <h3 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E]">
                {isBulk
                  ? `Отменить ${list.length} ${pluralRu(list.length, ['заказ', 'заказа', 'заказов'])}?`
                  : intent === 'delete'
                  ? `Удалить заказ № ${order.id}?`
                  : `Отменить заказ № ${order.id}?`}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Закрыть"
              className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
            </button>
          </div>

          <div className="neu-inset rounded-2xl p-2.5 text-xs text-[#2D3A4E] space-y-0.5">
            <p className="font-bold">
              {itemsCount} {pluralRu(itemsCount, ['товар', 'товара', 'товаров'])} · {totalSum.toLocaleString('ru-RU')} ₽
            </p>
            {isBulk ? (
              <p className="text-[#4E5C70] break-words">{list.map((o) => `№ ${o.id}`).join(', ')}</p>
            ) : (
              audience === 'admin' && order.customerName && <p className="text-[#4E5C70]">{order.customerName}</p>
            )}
          </div>

          <fieldset className="space-y-2" aria-describedby={error ? errorId : undefined}>
            <legend className="text-xs font-extrabold text-[#2D3A4E] mb-2">Причина отмены</legend>
            <div role="radiogroup" aria-label="Причина отмены" aria-invalid={Boolean(error && !reason)} className="space-y-1.5">
              {reasons.map((item) => {
                const selected = reason === item;
                return (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setReason(item);
                      setError('');
                    }}
                    className={`w-full min-h-9 px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2.5 cursor-pointer ${
                      selected ? 'neu-pill-active text-[#2D3A4E]' : 'neu-button text-[#2D3A4E]'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${selected ? 'neu-fill-accent' : 'neu-inset'}`}
                      aria-hidden="true"
                    >
                      {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span>{item}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="cancel-order-comment" className="text-xs font-extrabold text-[#2D3A4E]">
              Комментарий{reason === OTHER_CANCEL_REASON ? '' : ' (необязательно)'}
            </label>
            <textarea
              id="cancel-order-comment"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (error) setError('');
              }}
              maxLength={CANCEL_COMMENT_MAX}
              rows={2}
              aria-invalid={Boolean(error && reason === OTHER_CANCEL_REASON && !comment.trim())}
              aria-describedby={error ? errorId : undefined}
              className="w-full neu-inset rounded-xl px-3 py-2 text-xs text-[#2D3A4E] outline-none resize-y"
            />
          </div>

          {error && (
            <p id={errorId} role="alert" className="text-xs font-bold text-danger">
              {error}
            </p>
          )}

          <p className="text-xs text-[#4E5C70] leading-relaxed">
            {audience === 'customer'
              ? 'Товары вернутся на склад, заказ останется в истории отменённым.'
              : intent === 'delete'
              ? 'Сначала заказ отменяется и товары возвращаются на склад. Затем выберите: удалить навсегда или перенести в «Архив».'
              : 'Товары вернутся на склад, заказ перейдёт в «Отменены», а через 3 дня — в «Архив».'}
            {isPaid &&
              (audience === 'customer'
                ? ' Заказ уже оплачен: о возврате денег договоритесь с магазином в чате.'
                : isBulk
                ? ' Оплаченные заказы получат статус «Возврат средств», деньги покупателям верните сами.'
                : ' Заказ оплачен: статус оплаты станет «Возврат средств», деньги покупателю верните сами.')}
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              data-autofocus
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            >
              Не отменять
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer neu-button-danger"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{busy ? 'Отменяем…' : isBulk ? 'Отменить заказы' : 'Отменить заказ'}</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
