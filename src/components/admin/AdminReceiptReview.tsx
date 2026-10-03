import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquare, X, XCircle } from 'lucide-react';
import type { Order, Product } from '../../types';
import { AdminOrderPriceWarning } from './AdminOrderPriceWarning';
import { ModalPortal } from '../ModalPortal';
import { useDialogA11y } from '../../utils/useDialogA11y';
import {
  OTHER_REJECT_REASON,
  PAYMENT_KIND_TITLES,
  RECEIPT_REJECT_REASONS,
  type ReceiptDecision,
} from '../../utils/paymentDetails';

/** «Чек на проверке»: a pulsing badge — the money has to be checked by hand (brief §4); still without motion when reduced */
export const ReceiptReviewBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/40 ${className}`}
  >
    <span className="relative flex w-2 h-2" aria-hidden="true">
      <span className="absolute inline-flex w-full h-full rounded-full bg-warning opacity-75 animate-ping" />
      <span className="relative inline-flex w-2 h-2 rounded-full bg-warning" />
    </span>
    Чек на проверке
  </span>
);

export type ReviewReceipt = (order: Order, decision: ReceiptDecision, reason?: string) => Promise<boolean>;

interface AdminReceiptReviewProps {
  order: Order;
  onReview: ReviewReceipt;
  /** «Открыть чек в чате» (in «Заказы»); absent in the chat itself */
  onOpenChat?: () => void;
  /** The catalog: «Цены не совпадают с каталогом» right above the buttons (in the chat; «Заказы» show it in the card) */
  products?: Product[];
}

/**
 * The receipt the buyer sent («Доработки 5» §4): which way and when, «Подтвердить оплату» (→ «Оплачен», the buyer gets
 * a message and a notification) and «Отклонить чек» with the reason (→ «Ожидает оплаты»).
 */
export const AdminReceiptReview: React.FC<AdminReceiptReviewProps> = ({ order, onReview, onOpenChat, products }) => {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const receipt = order.paymentReceipt;
  const sentAt = receipt?.at ? new Date(receipt.at) : null;

  const confirm = async () => {
    setBusy(true);
    await onReview(order, 'confirm');
    setBusy(false);
  };

  return (
    <div className="rounded-xl bg-warning-soft border border-warning/30 p-2.5 space-y-2 text-xs text-[#2D3A4E]">
      <div className="flex items-center gap-2 flex-wrap">
        <ReceiptReviewBadge />
        <span className="font-bold">
          {receipt ? PAYMENT_KIND_TITLES[receipt.method] : 'Чек'}
          {sentAt && !Number.isNaN(sentAt.getTime()) && (
            <span className="font-medium text-[#4E5C70]">
              {' '}· {sentAt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      </div>
      {products && <AdminOrderPriceWarning order={order} products={products} />}
      <p className="text-[#4E5C70]">Сверьте поступление {(order.totalPrice ?? 0).toLocaleString('ru-RU')} ₽ и подтвердите оплату или отклоните чек.</p>
      <div className="flex items-center gap-2 flex-wrap">
        {onOpenChat && (
          <button
            type="button"
            onClick={onOpenChat}
            className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            Открыть чек в чате
          </button>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="h-8 px-3 neu-button rounded-xl text-xs font-extrabold text-success flex items-center gap-1.5 cursor-pointer"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
          Подтвердить оплату
        </button>
        <button
          type="button"
          onClick={() => setRejecting(true)}
          disabled={busy}
          className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-danger flex items-center gap-1.5 cursor-pointer"
        >
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          Отклонить чек
        </button>
      </div>
      <RejectReceiptDialog
        order={rejecting ? order : null}
        onConfirm={(reason) => onReview(order, 'reject', reason)}
        onClose={() => setRejecting(false)}
      />
    </div>
  );
};

/** «Отклонить чек?»: a reason from the list or in own words (required for «Другая причина») */
const RejectReceiptDialog: React.FC<{
  order: Order | null;
  onConfirm: (reason: string) => Promise<boolean>;
  onClose: () => void;
}> = ({ order, onConfirm, onClose }) => {
  const isOpen = Boolean(order);
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
  }, [isOpen]);

  if (!order) return null;

  const submit = async () => {
    const text = comment.trim();
    if (!reason) {
      setError('Выберите причину');
      return;
    }
    if (reason === OTHER_REJECT_REASON && !text) {
      setError('Напишите причину');
      document.getElementById('reject-receipt-comment')?.focus();
      return;
    }
    setBusy(true);
    const full = reason === OTHER_REJECT_REASON ? text : text ? `${reason}. ${text}` : reason;
    const done = await onConfirm(full);
    setBusy(false);
    if (done) onClose();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
        <div onClick={() => !busy && onClose()} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
        <div ref={dialog.ref} {...dialog.props} className="relative w-full max-w-sm max-h-[90dvh] overflow-y-auto neu-modal rounded-3xl p-5 space-y-4 z-10">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
            <h3 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E]">
              Отклонить чек к заказу № {order.id}?
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Закрыть"
              className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div role="radiogroup" aria-label="Причина" className="space-y-1.5">
            {[...RECEIPT_REJECT_REASONS, OTHER_REJECT_REASON].map((item) => {
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
                  <span className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${selected ? 'neu-fill-accent' : 'neu-inset'}`} aria-hidden="true">
                    {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {item}
                </button>
              );
            })}
          </div>
          <div className="space-y-1">
            <label htmlFor="reject-receipt-comment" className="text-xs font-extrabold text-[#2D3A4E]">
              Комментарий покупателю{reason === OTHER_REJECT_REASON ? '' : ' (необязательно)'}
            </label>
            <textarea
              id="reject-receipt-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={300}
              rows={2}
              className="w-full neu-inset rounded-xl px-3 py-2 text-xs text-[#2D3A4E] outline-none resize-y"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-bold text-danger">
              {error}
            </p>
          )}
          <p className="text-xs text-[#4E5C70]">Заказ снова будет ждать оплаты, покупатель увидит причину в заказе и в чате.</p>
          <div className="flex items-center gap-2">
            <button
              data-autofocus
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] cursor-pointer"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer neu-button-danger"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
              Отклонить чек
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
