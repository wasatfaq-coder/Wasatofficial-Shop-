import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ImagePlus, Landmark, Loader2, X } from 'lucide-react';
import type { Order, PaymentKind, PaymentRequisitesByKind } from '../types';
import { ModalPortal } from './ModalPortal';
import { CopyValueRow } from './CopyValueRow';
import { useDialogA11y } from '../utils/useDialogA11y';
import { compressReceiptImageFile } from '../utils/imageUpload';
import {
  copyValue,
  displayValue,
  filledPaymentKinds,
  PAYMENT_KIND_TITLES,
  RECEIPT_ACCEPT,
  receiptFileError,
  REQUISITE_FIELDS,
} from '../utils/paymentDetails';

interface PaymentRequisitesModalProps {
  /** The order to pay; null — closed */
  order: Order | null;
  /** «Подтвердить оплату»: the photo to the order's chat and «Чек на проверке»; true when sent */
  onSubmitReceipt: (order: Order, kind: PaymentKind, imageUrl: string) => Promise<boolean>;
  onClose: () => void;
}

type Step = 'choose' | 'details' | 'receipt';

/**
 * «Выбрать способ оплаты» (brief «Доработки 5» §3): the ways the store filled for this order → the requisites, each
 * field with «Скопировать» (numbers — digits only) → «Оплачено» → a photo of the receipt (JPG/PNG up to 15 MB, compressed)
 * → «Подтвердить оплату». The window scrolls inside the screen; the buttons stay at its bottom.
 */
export const PaymentRequisitesModal: React.FC<PaymentRequisitesModalProps> = ({ order, onSubmitReceipt, onClose }) => {
  const kinds = filledPaymentKinds(order?.paymentDetails);
  const [step, setStep] = useState<Step>('choose');
  const [kind, setKind] = useState<PaymentKind | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = preparing || sending;
  const dialog = useDialogA11y(Boolean(order), () => !busy && onClose(), { closeOnEscape: !busy });

  useEffect(() => {
    if (!order) return;
    const only = kinds.length === 1 ? kinds[0] : null;
    setKind(only);
    setStep(only ? 'details' : 'choose');
    setImage(null);
    setFileName('');
    setError('');
    // a new order opens the window from its first screen
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = receiptFileError(file);
    if (problem) {
      setError(problem);
      setImage(null);
      return;
    }
    setError('');
    setPreparing(true);
    try {
      const dataUrl = await compressReceiptImageFile(file);
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl) || dataUrl.length > 900000) {
        setError('Не удалось подготовить фото — попробуйте снимок экрана с чеком');
        setImage(null);
      } else {
        setImage(dataUrl);
        setFileName(file.name);
      }
    } catch {
      setError('Не удалось открыть файл — выберите фото чека JPG или PNG');
      setImage(null);
    } finally {
      setPreparing(false);
    }
  };

  const submit = async () => {
    if (!kind || !image) return;
    setSending(true);
    const done = await onSubmitReceipt(order, kind, image);
    setSending(false);
    if (done) onClose();
  };

  const fields = kind ? (order.paymentDetails?.[kind] as PaymentRequisitesByKind[PaymentKind] | undefined) : undefined;
  const values = (fields ?? {}) as unknown as Record<string, string | undefined>;
  const total = order.totalPrice ?? 0;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
        <div onClick={() => !busy && onClose()} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
        <div
          ref={dialog.ref}
          {...dialog.props}
          className="relative w-full max-w-md max-h-[90dvh] flex flex-col neu-modal rounded-3xl p-4 sm:p-5 gap-3 z-10"
        >
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {step !== 'choose' && (kinds.length > 1 || step === 'receipt') ? (
                <button
                  type="button"
                  onClick={() => setStep(step === 'receipt' ? 'details' : 'choose')}
                  disabled={busy}
                  aria-label="Назад"
                  className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 text-accent">
                  <Landmark className="w-4 h-4" aria-hidden="true" />
                </div>
              )}
              <h3 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E] min-w-0">
                {step === 'receipt' ? 'Чек об оплате' : step === 'details' && kind ? PAYMENT_KIND_TITLES[kind] : 'Способ оплаты'}
                <span className="block text-[11px] font-bold text-[#4E5C70]">
                  Заказ № {order.id} · {total.toLocaleString('ru-RU')} ₽
                </span>
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

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2 space-y-2.5">
            {step === 'choose' && (
              <div role="radiogroup" aria-label="Способ оплаты" className="space-y-2">
                {kinds.map((k) => {
                  const selected = kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setKind(k)}
                      className={`w-full min-h-11 px-3 py-2.5 rounded-2xl text-left text-sm font-bold flex items-center gap-3 cursor-pointer ${
                        selected ? 'neu-pill-active text-[#2D3A4E]' : 'neu-button text-[#2D3A4E]'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${selected ? 'neu-fill-accent' : 'neu-inset'}`} aria-hidden="true">
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      {PAYMENT_KIND_TITLES[k]}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 'details' && kind && (
              <>
                <CopyValueRow label="Сумма к оплате, ₽" value={total.toLocaleString('ru-RU')} copyText={String(total)} />
                {REQUISITE_FIELDS[kind].map((field) => (
                  <CopyValueRow
                    key={field.key}
                    label={field.label}
                    value={displayValue(field, values[field.key])}
                    copyText={copyValue(field, values[field.key])}
                  />
                ))}
                <CopyValueRow label="Комментарий к переводу" value={`Заказ № ${order.id}`} />
                <p className="text-xs text-[#4E5C70] leading-relaxed">
                  Переведите сумму заказа по этим реквизитам, затем нажмите «Оплачено» и приложите фото чека.
                </p>
              </>
            )}

            {step === 'receipt' && (
              <>
                <p className="text-xs text-[#4E5C70] leading-relaxed">
                  Сфотографируйте чек или сделайте снимок экрана из приложения банка: должны читаться сумма, дата и получатель.
                  Формат JPG или PNG, до 15 МБ.
                </p>
                <label
                  htmlFor="payment-receipt-file"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void takeFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`block rounded-2xl p-4 text-center cursor-pointer border-2 border-dashed ${
                    dragOver ? 'border-accent bg-accent/10' : error ? 'border-danger/60' : 'border-[#BAC5D5]'
                  } neu-inset`}
                >
                  {image ? (
                    <img src={image} alt="Чек об оплате" className="max-h-56 w-auto mx-auto rounded-xl object-contain" />
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 text-xs text-[#2D3A4E]">
                      {preparing ? <Loader2 className="w-6 h-6 animate-spin text-accent" aria-hidden="true" /> : <ImagePlus className="w-6 h-6 text-accent" aria-hidden="true" />}
                      <span className="font-extrabold">{preparing ? 'Готовим фото…' : 'Выбрать фото чека'}</span>
                      <span className="text-[#4E5C70]">или перетащите файл сюда</span>
                    </span>
                  )}
                  {image && <span className="block mt-2 text-[11px] font-bold text-accent">{fileName} · заменить</span>}
                </label>
                <input
                  ref={fileInput}
                  id="payment-receipt-file"
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  className="sr-only"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'payment-receipt-error' : undefined}
                  onChange={(e) => {
                    void takeFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {error && (
                  <p id="payment-receipt-error" role="alert" className="text-xs font-bold text-danger">
                    {error}
                  </p>
                )}
                <p className="text-[11px] text-[#4E5C70]">Фото уйдёт в чат магазина, магазин сверит поступление и подтвердит оплату.</p>
              </>
            )}
          </div>

          <div className="shrink-0 pt-1">
            {step === 'choose' && (
              <button
                type="button"
                onClick={() => kind && setStep('details')}
                disabled={!kind}
                className={`w-full py-3 rounded-2xl text-sm font-extrabold cursor-pointer ${kind ? 'neu-button-accent text-white' : 'neu-button-disabled text-[#4E5C70]'}`}
              >
                Показать реквизиты
              </button>
            )}
            {step === 'details' && (
              <button
                type="button"
                onClick={() => setStep('receipt')}
                className="w-full py-3 rounded-2xl text-sm font-extrabold cursor-pointer neu-button-accent text-white flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                Оплачено
              </button>
            )}
            {step === 'receipt' && (
              <button
                type="button"
                onClick={submit}
                disabled={!image || busy}
                className={`w-full py-3 rounded-2xl text-sm font-extrabold cursor-pointer flex items-center justify-center gap-2 ${
                  image && !busy ? 'neu-button-accent text-white' : 'neu-button-disabled text-[#4E5C70]'
                }`}
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {sending ? 'Отправляем…' : 'Подтвердить оплату'}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
