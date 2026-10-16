import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Package,
  Home,
  Copy,
  Check,
  ImagePlus,
  Landmark,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import { ActiveTab, Order, PaymentKind } from '../types';
import { currentStoreName } from '../utils/storeContacts';
import { copyToClipboard } from '../utils/clipboard';
import { PaymentRequisitesModal } from '../components/PaymentRequisitesModal';
import {
  canPayByRequisites,
  isReceiptOnReview,
  RECEIPT_ACCEPT,
  receiptFileError,
} from '../utils/paymentDetails';
import { compressReceiptImageFile } from '../utils/imageUpload';

interface OrderSuccessScreenProps {
  orderId: string;
  totalPrice: number;
  deliveryMethod: string;
  deliveryAddress: string;
  paymentMethod?: string;
  /** Instructions of the chosen method from Admin → «Оплата» (e.g. transfer details) */
  paymentInstructions?: string;
  /** A guest's order the browser did not keep (a private window, no room): it will not be in the profile */
  notSavedInBrowser?: boolean;
  /** Full order object when available for requisites payment / receipt attachment */
  order?: Order | null;
  onSubmitPaymentReceipt?: (order: Order, kind: PaymentKind, imageUrl: string) => Promise<boolean>;
  onOpenSupportChat?: (orderId?: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  setActiveTab: (tab: ActiveTab) => void;
}

export const OrderSuccessScreen: React.FC<OrderSuccessScreenProps> = ({
  orderId,
  totalPrice,
  deliveryMethod,
  deliveryAddress,
  paymentMethod,
  paymentInstructions,
  notSavedInBrowser = false,
  order = null,
  onSubmitPaymentReceipt,
  onOpenSupportChat,
  onShowToast,
  setActiveTab,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);
  const [isRequisitesOpen, setIsRequisitesOpen] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptSentLocal, setReceiptSentLocal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyOrderId = async () => {
    const ok = await copyToClipboard(orderId);
    if (ok) {
      setCopiedId(true);
      onShowToast?.(`Номер заказа ${orderId} скопирован`, 'success');
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyInstructions = async () => {
    if (!paymentInstructions?.trim()) return;
    const ok = await copyToClipboard(paymentInstructions.trim());
    if (ok) {
      setCopiedInstructions(true);
      onShowToast?.('Реквизиты оплаты скопированы', 'success');
      setTimeout(() => setCopiedInstructions(false), 2000);
    }
  };

  const hasRequisitesModal = Boolean(
    order && onSubmitPaymentReceipt && canPayByRequisites(order, order.customerUid)
  );
  const receiptAlreadyOnReview = receiptSentLocal || Boolean(order && isReceiptOnReview(order));
  const canAttachQuickReceipt = Boolean(
    order &&
      onSubmitPaymentReceipt &&
      !order.isCancelled &&
      order.paymentStatus !== 'paid' &&
      order.paymentStatus !== 'paid_on_delivery' &&
      !receiptAlreadyOnReview &&
      Boolean(paymentInstructions?.trim())
  );

  const handleDirectReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !order || !onSubmitPaymentReceipt) return;
    const problem = receiptFileError(file);
    if (problem) {
      onShowToast?.(problem, 'error');
      return;
    }
    setUploadingReceipt(true);
    try {
      const dataUrl = await compressReceiptImageFile(file);
      const sent = await onSubmitPaymentReceipt(order, 'card', dataUrl);
      if (sent) {
        setReceiptSentLocal(true);
      }
    } catch {
      onShowToast?.('Не удалось обработать фото чека — выберите JPG или PNG', 'error');
    } finally {
      setUploadingReceipt(false);
    }
  };

  return (
    <div className="py-8 space-y-6 text-center animate-in zoom-in-95 duration-300 max-w-sm mx-auto pb-28 lg:pb-10">
      {/* Celebration Icon */}
      <div className="relative w-28 h-28 rounded-full neu-flat p-2 flex items-center justify-center mx-auto">
        <div className="w-20 h-20 rounded-full neu-inset flex items-center justify-center text-success">
          <CheckCircle2 className="w-12 h-12 stroke-[2]" />
        </div>
      </div>

      <div className="space-y-2">
        <span className="neu-tone-success text-xs font-extrabold px-3.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Заказ оформлен • Активен
        </span>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
            Заказ № {orderId}
          </h2>
          <button
            type="button"
            onClick={handleCopyOrderId}
            className="w-8 h-8 rounded-xl neu-button inline-flex items-center justify-center text-text-secondary hover:text-accent cursor-pointer shrink-0"
            title="Скопировать номер заказа"
            aria-label="Скопировать номер заказа"
          >
            {copiedId ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-text-secondary max-w-xs mx-auto leading-relaxed font-medium">
          Спасибо за выбор {currentStoreName()}! Мы получили заказ: менеджер свяжется с вами, чтобы подтвердить его и оплату.
        </p>
      </div>

      {/* audit 07.10, finding 19: the guest's order history lives in this browser, and it did not keep this one */}
      {notSavedInBrowser && (
        <div role="status" className="rounded-2xl p-3.5 neu-tone-warning text-left space-y-1">
          <p className="text-xs font-extrabold text-text-primary">Запишите номер заказа: {orderId}</p>
          <p className="text-xs text-text-primary leading-relaxed">
            Браузер не сохранил заказ (приватный режим или не хватило места), поэтому в профиле его не будет. Заказ в магазине
            есть: назовите номер менеджеру или в чате поддержки.
          </p>
        </div>
      )}

      {paymentInstructions?.trim() && (
        <div className="neu-inset rounded-3xl p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-text-secondary">
              Оплата{paymentMethod ? `: ${paymentMethod}` : ''}
            </p>
            <button
              type="button"
              onClick={handleCopyInstructions}
              className="px-2.5 py-1 rounded-xl neu-button text-[11px] font-bold text-accent hover:text-accent-strong inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              {copiedInstructions ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Скопировать</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-text-primary leading-relaxed whitespace-pre-line">{paymentInstructions}</p>

          {receiptAlreadyOnReview && (
            <div className="rounded-2xl p-2.5 neu-tone-success flex items-center gap-2 text-xs font-bold text-success">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Чек об оплате отправлен на проверку</span>
            </div>
          )}

          {hasRequisitesModal && !receiptAlreadyOnReview && (
            <button
              type="button"
              onClick={() => setIsRequisitesOpen(true)}
              className="w-full py-2.5 px-3 rounded-2xl neu-button text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer"
            >
              <Landmark className="w-4 h-4" />
              <span>Реквизиты и отправка чека</span>
            </button>
          )}

          {!hasRequisitesModal && canAttachQuickReceipt && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={RECEIPT_ACCEPT}
                onChange={handleDirectReceiptFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingReceipt}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-2xl neu-button text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {uploadingReceipt ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Отправка чека…</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4" />
                    <span>Прикрепить чек об оплате</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {!paymentInstructions?.trim() && hasRequisitesModal && !receiptAlreadyOnReview && (
        <button
          type="button"
          onClick={() => setIsRequisitesOpen(true)}
          className="w-full py-3 px-4 rounded-2xl neu-button text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer"
        >
          <Landmark className="w-4 h-4" />
          <span>Оплатить по реквизитам / Прикрепить чек</span>
        </button>
      )}

      {/* Order Info Card with active status tracking box */}
      <div className="neu-flat rounded-3xl p-5 text-left space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-2xl neu-inset">
          <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
            <Package className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary font-medium">Текущий статус</p>
            <p className="text-xs font-extrabold text-accent flex items-center gap-1.5">
              <span>Принят в обработку</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs pt-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">Сумма заказа:</span>
            <span className="font-bold text-text-primary">{totalPrice.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Доставка:</span>
            <span className="font-bold text-text-primary">{deliveryMethod}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary shrink-0">Адрес:</span>
            <span className="font-bold text-text-primary truncate max-w-[200px]" title={deliveryAddress}>
              {deliveryAddress}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => setActiveTab('profile')}
          className="w-full neu-button-accent text-white rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer btn-confirm-order active:neu-inset-deep transition-all"
        >
          <span>Отследить заказ в профиле</span>
        </button>

        {onOpenSupportChat && (
          <button
            type="button"
            onClick={() => onOpenSupportChat(orderId)}
            className="w-full neu-button rounded-2xl py-3 font-bold text-xs text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Написать в чат по заказу</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('home')}
          className="w-full neu-button rounded-2xl py-3 font-bold text-xs text-text-secondary hover:text-text-primary flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <Home className="w-4 h-4" />
          <span>Вернуться на главную</span>
        </button>
      </div>

      {isRequisitesOpen && order && onSubmitPaymentReceipt && (
        <PaymentRequisitesModal
          order={order}
          onSubmitReceipt={async (ord, kind, img) => {
            const ok = await onSubmitPaymentReceipt(ord, kind, img);
            if (ok) setReceiptSentLocal(true);
            return ok;
          }}
          onClose={() => setIsRequisitesOpen(false)}
        />
      )}
    </div>
  );
};


