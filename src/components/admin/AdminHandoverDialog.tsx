import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, X } from 'lucide-react';
import type { Order } from '../../types';
import { ModalPortal } from '../ModalPortal';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { fullName } from '../../shared/personName';

interface AdminHandoverDialogProps {
  /** The order being handed over, with its pickup code; null — closed */
  order: Order | null;
  /** «Подтвердить выдачу»: «Выдан» with the time; resolves to true when saved */
  onConfirm: (order: Order) => Promise<boolean>;
  onClose: () => void;
}

/**
 * «Забрать заказ» (задание владельца 02.10, «Доработки 4»): кто получает, оплачен ли заказ и код выдачи — крупно,
 * чтобы сверить с покупателем; «Подтвердить выдачу» переводит заказ в «Выдан». Открывается только для оплаченного
 * заказа или «Оплата при получении» (`canHandOver`).
 */
export const AdminHandoverDialog: React.FC<AdminHandoverDialogProps> = ({ order, onConfirm, onClose }) => {
  const [busy, setBusy] = useState(false);
  const dialog = useDialogA11y(Boolean(order), () => !busy && onClose(), { closeOnEscape: !busy });
  if (!order) return null;

  const name =
    fullName({ lastName: order.customerLastName, firstName: order.customerFirstName, middleName: order.customerMiddleName }) ||
    order.customerName ||
    'Покупатель';
  const paidOnDelivery = order.paymentStatus === 'paid_on_delivery';

  const confirm = async () => {
    setBusy(true);
    const done = await onConfirm(order);
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
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 text-accent">
                <KeyRound className="w-4 h-4" aria-hidden="true" />
              </div>
              <h3 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E]">
                Выдача заказа № {order.id}
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

          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-[11px] text-[#4E5C70]">Получатель</dt>
              <dd className="font-extrabold text-[#2D3A4E] break-words">{name}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[#4E5C70]">Оплата</dt>
              <dd>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-extrabold ${
                    paidOnDelivery ? 'bg-warning-soft text-warning border-warning/25' : 'bg-success-soft text-success border-success/25'
                  }`}
                >
                  {paidOnDelivery ? 'Оплата при получении — примите оплату' : 'Оплачено'}
                </span>
              </dd>
            </div>
          </dl>

          <div className="neu-inset rounded-2xl p-4 text-center space-y-1">
            <p className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider">Код выдачи</p>
            <p className="text-3xl font-extrabold font-mono tracking-widest text-[#2D3A4E]" aria-live="polite">
              {order.pickupCode}
            </p>
            <p className="text-xs text-[#4E5C70]">Попросите покупателя назвать код и сверьте</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              data-autofocus
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer neu-button-accent text-white"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>Подтвердить выдачу</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
