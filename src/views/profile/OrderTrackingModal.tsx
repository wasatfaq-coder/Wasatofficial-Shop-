import { useState, useMemo } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CancelOrderDialog } from '../../components/CancelOrderDialog';
import { OrderTimeline } from '../../components/OrderTimeline';
import {
  canCustomerConfirmReceipt,
  customerStepLabel,
  flowStatuses,
  isAwaitingReceipt,
  isCarrierOrder,
  orderDeliveryKind,
  showsPickupCode,
} from '../../utils/orderFlow';
import { canPayByRequisites, PAYMENT_STATUS_LABELS, paymentHint } from '../../utils/paymentDetails';
import { PaymentRequisitesModal } from '../../components/PaymentRequisitesModal';
import { canCustomerCancel, cancelledByLabel, cancelReasonText, customerCancelHint, formatCancelledAt } from '../../utils/orderCancel';
import { storeInitials, telHref } from '../../utils/storeContacts';
import {
  ShoppingBag,
  Headphones,
  Check,
  X,
  MapPin,
  CreditCard,
  Truck,
  Clock,
  Copy,
  Phone,
  Sparkles,
  Store,
  AlertCircle,
  MessageCircle,
  Bike,
  Zap,
  Mail,
  XCircle,
  PackageCheck,
  Landmark,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Order, Product } from '../../types';
import { isQuickOrderDelivery, QUICK_ORDER_DELIVERY_TITLE } from '../../shared/orderPricing';
import { copyToClipboard } from '../../utils/clipboard';
import {
  isRussianPostDelivery,
  isCourierDelivery,
  isPickupDelivery,
  pickupPlace,
} from '../../utils/deliveryStages';
import { useOrderLinePhotos } from '../../utils/productThumbs';
import { useDialogA11y } from '../../utils/useDialogA11y';
import type { ProfileScreenProps } from '../ProfileScreen';

import { getOrderStatusProgress } from './orderProgress';

type OrderTrackingModalProps = Pick<
  ProfileScreenProps,
  'orders' | 'onCancelOrder' | 'onConfirmReceipt' | 'onOpenSupportChat' | 'onRepeatOrder' | 'onShowToast' | 'onSubmitPaymentReceipt'
> & {
  selectedOrderIdForTracking: string | null;
  setSelectedOrderIdForTracking: (orderId: string | null) => void;
  /** Closes every window of the profile (the order window opens over the admin panel too) */
  onCloseModals: () => void;
  products: Product[];
  storeName: string;
  storePhone: string;
};

/** The order's window: progress, history, payment, delivery, lines, and the customer's actions with the order */
export const OrderTrackingModal = ({
  selectedOrderIdForTracking,
  setSelectedOrderIdForTracking,
  onCloseModals,
  orders,
  products,
  storeName,
  storePhone,
  onCancelOrder,
  onConfirmReceipt,
  onOpenSupportChat,
  onRepeatOrder,
  onShowToast,
  onSubmitPaymentReceipt,
}: OrderTrackingModalProps) => {
  const { currentUser } = useAuth();
  /** «Я получил заказ»: the confirmation */
  const [orderToConfirmReceipt, setOrderToConfirmReceipt] = useState<Order | null>(null);
  /** «Выбрать способ оплаты»: the order whose requisites window is open */
  const [orderToPay, setOrderToPay] = useState<Order | null>(null);
  /** «Отменить заказ» from the order window: the window with the reason */
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const trackingDialog = useDialogA11y(Boolean(selectedOrderIdForTracking), () => setSelectedOrderIdForTracking(null));

  // Derive active order reactively from orders prop
  const selectedOrderForTracking = useMemo(
    () => (selectedOrderIdForTracking ? orders.find((o) => o.id === selectedOrderIdForTracking) || null : null),
    [orders, selectedOrderIdForTracking]
  );
  const linePhoto = useOrderLinePhotos(selectedOrderForTracking?.items.map((it) => it.product) ?? [], products);



  return (
    <>
      {/* ================= DETAILED ORDER TRACKING MODAL ================= */}
      {selectedOrderForTracking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={trackingDialog.ref}
            {...trackingDialog.props}
            className="neu-modal rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col border border-white/80 text-[#2D3A4E] overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-[#BAC5D5]/50 shrink-0 bg-[#E3E8EF]">
              <div className="min-w-0">
                {/* On 320 px the «Трекинг» chip moves under the number instead of sliding under the close button */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 id={trackingDialog.titleId} className="text-base font-extrabold text-[#2D3A4E] whitespace-nowrap">
                    Заказ № {selectedOrderForTracking.id}
                  </h3>
                  <span className="text-[11px] font-extrabold text-accent neu-inset px-2.5 py-0.5 rounded-full">
                    Трекинг
                  </span>
                </div>
                <p className="text-xs text-[#4E5C70] font-medium">
                  Оформлен: {selectedOrderForTracking.date}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrderIdForTracking(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-transform shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Smooth Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar overscroll-contain transform-gpu">

            {/* Tracking Code Banner OR Clean Delivery Info Notice */}
            {(() => {
              const isPost = isRussianPostDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isTK = isCarrierOrder(selectedOrderForTracking);
              const isPickup = isPickupDelivery(selectedOrderForTracking.deliveryMethod);
              const isQuick = isQuickOrderDelivery(selectedOrderForTracking.deliveryMethod);
              const isExpress = !isQuick && ((selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('экспресс') || (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('express'));

              if (isPost) {
                return (
                  <div className="neu-inset rounded-2xl p-3.5 border border-accent/16 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-accent" />
                          {selectedOrderForTracking.deliveryMethod || 'Почтовое отправление'}
                        </span>
                        <p className="text-xs font-extrabold text-[#2D3A4E]">
                          {selectedOrderForTracking.trackingNumber ? `Трек-номер: ${selectedOrderForTracking.trackingNumber}` : 'Доставка в почтовое отделение связи'}
                        </p>
                      </div>
                      {selectedOrderForTracking.trackingNumber ? (
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(selectedOrderForTracking.trackingNumber || '');
                            onShowToast('Трек-номер Почты России скопирован в буфер', 'success');
                          }}
                          className="neu-button p-2 rounded-xl text-accent hover:text-accent-strong flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Копия трека</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-warning neu-inset px-2.5 py-1 rounded-lg">
                          Формируется
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#4E5C70] leading-snug">
                      Адрес доставки: {selectedOrderForTracking.deliveryAddress || 'Почтовый адрес получателя'}. Получение осуществляется в отделении связи по паспорту или SMS-коду без курьерского сопровождения.
                    </p>
                  </div>
                );
              }

              if (isTK) {
                if (selectedOrderForTracking.trackingNumber) {
                  return (
                    <div className="neu-inset rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-accent" />
                            Трек-номер отправления (ТК)
                          </span>
                          <p className="text-xs font-extrabold text-[#2D3A4E] tracking-wide font-mono">
                            {selectedOrderForTracking.trackingNumber}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            copyToClipboard(selectedOrderForTracking.trackingNumber || '');
                            onShowToast('Трек-номер скопирован в буфер', 'success');
                          }}
                          className="neu-button p-2 rounded-xl text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Копия</span>
                        </button>
                      </div>
                      <p className="text-xs text-[#4E5C70] leading-snug">
                        Направление: {selectedOrderForTracking.deliveryAddress || 'Пункт назначения ТК'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="neu-inset rounded-2xl p-3.5 border border-warning/70 space-y-2 text-warning">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-extrabold text-warning">
                          Трек-номер формируется транспортной компанией
                        </p>
                        <p className="text-xs text-warning leading-snug">
                          Заказ принят и готовится к передаче в транспортную компанию. Как только перевозчик зарегистрирует отправление, трек-номер появится в личном кабинете.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Non-TK: Courier / Pickup / Express
              return (
                <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
                        {isPickup ? <Store className="w-3.5 h-3.5 text-accent" /> : isQuick ? <MessageCircle className="w-3.5 h-3.5 text-accent" /> : isExpress ? <Zap className="w-3.5 h-3.5 text-warning" /> : <Bike className="w-3.5 h-3.5 text-accent" />}
                        {/* the store's own words only: no «бутик» or «курьерская служба магазина» it may not have */}
                        {isPickup ? 'Самовывоз' : isQuick ? 'Доставку согласует менеджер' : isExpress ? 'Срочная экспресс-доставка' : 'Доставка курьером'}
                      </span>
                      <p className="text-xs font-extrabold text-[#2D3A4E]">
                        {isQuick ? QUICK_ORDER_DELIVERY_TITLE : selectedOrderForTracking.deliveryMethod || (isPickup ? 'Самовывоз' : 'Курьерская доставка')}
                      </p>
                    </div>
                    {!isPickup && !isQuick && (
                      <span className="text-[11px] font-bold text-accent neu-flat px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0">До двери</span>
                    )}
                  </div>

                  <p className="text-xs text-[#4E5C70] leading-snug">
                    {isPickup
                      ? `Где забрать: ${pickupPlace(selectedOrderForTracking.deliveryAddress) || 'сообщит магазин'}. Трек-номера у самовывоза нет — заказ выдают по коду получения.`
                      : isQuick
                      ? !selectedOrderForTracking.deliveryAddress || selectedOrderForTracking.deliveryAddress === 'Уточнит менеджер'
                        ? 'Менеджер позвонит и согласует адрес, доставку и оплату.'
                        : `Менеджер позвонит и согласует доставку и оплату. Адрес: ${selectedOrderForTracking.deliveryAddress}.`
                      : `Адрес доставки: ${selectedOrderForTracking.deliveryAddress || 'не указан'}.`}
                  </p>
                </div>
              );
            })()}

            {/* Status Header Banner with Animated Milestone Progress Bar */}
            {(() => {
              const trackingStatusInfo = getOrderStatusProgress(selectedOrderForTracking);

              // The steps of this order's chain: a carrier has «Передан в ТК» and «Доставлен», pickup — «В пункте выдачи»
              const chain = flowStatuses(selectedOrderForTracking);
              const milestoneSteps = chain.map((key, i) => ({
                key,
                label: customerStepLabel(selectedOrderForTracking, key),
                threshold: Math.round(((i + 1) / chain.length) * 100),
              }));

              return (
                <div className="neu-inset rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0">
                      <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#4E5C70] block mb-1">
                        Текущий статус
                      </span>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <span
                          className={`text-xs font-extrabold neu-button px-3 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${trackingStatusInfo.text}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                          <span>{trackingStatusInfo.label}</span>
                        </span>
                        {!selectedOrderForTracking.isCancelled && (
                          <span className="text-[11px] font-extrabold text-accent neu-inset px-2.5 py-1 rounded-lg whitespace-nowrap">
                            {trackingStatusInfo.percent}% выполнено
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedOrderForTracking.estimatedDelivery && (
                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-[11px] text-[#4E5C70] font-bold block mb-1">Ожидается:</span>
                        <p className="text-xs font-extrabold text-[#2D3A4E] flex items-center sm:justify-end gap-1 whitespace-nowrap neu-inset px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span>{selectedOrderForTracking.estimatedDelivery}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Horizontal Milestone Tracker & Smooth Filling Path */}
                  <div className="space-y-2 pt-1">
                    {/* Visual Milestone Nodes */}
                    <div className="relative flex items-center justify-between z-10 px-1 gap-1">
                      {milestoneSteps.map((step, idx, arr) => {
                        const isStepDone = trackingStatusInfo.percent >= step.threshold;
                        const prevThreshold = idx === 0 ? 0 : arr[idx - 1].threshold;
                        const isStepActive =
                          !isStepDone && trackingStatusInfo.percent > prevThreshold;

                        return (
                          // No min-w-0: a column is as wide as its longest word, labels wrap only between words
                          <div key={step.key} className="flex flex-col items-center flex-1">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold transition-all shrink-0 ${
                                isStepDone
                                  ? 'neu-fill-accent text-white'
                                  : isStepActive
                                  ? 'neu-inset-deep text-accent border border-accent ring-1 ring-accent/30 font-extrabold'
                                  : 'neu-inset text-[#4E5C70]'
                              }`}
                            >
                              {isStepDone ? (
                                <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <span
                              className={`text-[11px] mt-1 font-bold leading-tight transition-colors text-center ${
                                isStepDone
                                  ? 'text-[#2D3A4E]'
                                  : isStepActive
                                  ? 'text-accent font-extrabold'
                                  : 'text-[#4E5C70]'
                              }`}
                              title={step.label}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Continuous Neumorphic Progress Track with Shimmer Beam */}
                    <div className="relative w-full h-2.5 rounded-full overflow-hidden neu-inset">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out relative bg-gradient-to-r from-accent via-[#7888EC] to-accent"
                        style={{ width: `${Math.max(4, trackingStatusInfo.percent)}%` }}
                      >
                        {!selectedOrderForTracking.isCancelled &&
                          selectedOrderForTracking.status !== 'delivered' && (
                            <div className="neu-progress-beam" />
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Payment by the store's requisites and the receipt («Доработки 5») */}
            {!selectedOrderForTracking.isCancelled && (() => {
              const order = selectedOrderForTracking;
              const status = order.paymentStatus ?? 'pending';
              if (status === 'paid_on_delivery' || status === 'refunded') return null;
              const canPay = Boolean(onSubmitPaymentReceipt) && canPayByRequisites(order, currentUser?.uid);
              const hint = paymentHint(order, currentUser?.uid);
              return (
                <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
                  <p className="text-xs text-[#2D3A4E] flex items-center justify-between gap-2">
                    <span className="font-extrabold">Оплата</span>
                    <span
                      className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${
                        status === 'paid'
                          ? 'bg-success-soft text-success border-success/30'
                          : 'bg-warning-soft text-warning border-warning/30'
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[status]}
                    </span>
                  </p>
                  {status === 'pending' && order.paymentRejectReason && (
                    <p role="status" className="rounded-xl bg-danger-soft border border-danger/25 px-2.5 py-2 text-xs text-[#2D3A4E]">
                      <strong className="text-danger">Чек отклонён:</strong> {order.paymentRejectReason}. Проверьте оплату и отправьте новый чек.
                    </p>
                  )}
                  {hint && status !== 'paid' && <p className="text-xs text-[#4E5C70] leading-relaxed">{hint}</p>}
                  {canPay && (
                    <button
                      type="button"
                      onClick={() => setOrderToPay(order)}
                      className="w-full neu-button py-2.5 px-4 rounded-2xl text-xs font-extrabold text-accent flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Landmark className="w-4 h-4" aria-hidden="true" />
                      <span>Выбрать способ оплаты</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Pickup code: the buyer names it to the courier or at the pickup point («Доработки 4») */}
            {showsPickupCode(selectedOrderForTracking) && (
              <div className="neu-inset rounded-2xl p-4 text-center space-y-1">
                <p className="text-[11px] font-extrabold text-[#4E5C70] uppercase tracking-wider">Код получения</p>
                <p className="text-2xl font-extrabold font-mono tracking-widest text-[#2D3A4E]">{selectedOrderForTracking.pickupCode}</p>
                <p className="text-xs text-[#4E5C70]">
                  {orderDeliveryKind(selectedOrderForTracking) === 'pickup'
                    ? 'Назовите код сотруднику пункта выдачи'
                    : 'Назовите код курьеру при получении'}
                </p>
              </div>
            )}

            {/* «Я получил заказ»: a carrier's order is closed by the buyer (or by the store for a guest) */}
            {isAwaitingReceipt(selectedOrderForTracking) && (
              <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
                <p className="text-xs text-[#2D3A4E] leading-relaxed">
                  {canCustomerConfirmReceipt(selectedOrderForTracking, currentUser?.uid)
                    ? 'Забрали посылку? Подтвердите получение — так магазин узнает, что заказ у вас.'
                    : 'Когда заберёте посылку, магазин отметит заказ полученным. Вопросы — в чат магазина.'}
                </p>
                {onConfirmReceipt && canCustomerConfirmReceipt(selectedOrderForTracking, currentUser?.uid) && (
                  <button
                    type="button"
                    onClick={() => setOrderToConfirmReceipt(selectedOrderForTracking)}
                    className="w-full neu-button py-2.5 px-4 rounded-2xl text-xs font-extrabold text-success flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Я получил заказ</span>
                  </button>
                )}
              </div>
            )}

            {/* История заказа: each step with its date and time (instead of «Этапы доставки» and «История статусов») */}
            <div className="neu-inset rounded-2xl p-4">
              <OrderTimeline order={selectedOrderForTracking} audience="customer" />
            </div>

            {/* Order Items Preview */}
            <div className="space-y-2 pt-1 border-t border-[#BAC5D5]/50">
              <span className="text-xs font-bold text-[#2D3A4E]">Состав заказа:</span>
              <div className="space-y-2">
                {selectedOrderForTracking.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between neu-inset p-2.5 rounded-xl"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={linePhoto(it.product)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded-lg object-cover neu-flat"
                      />
                      <div>
                        <p className="text-xs font-bold text-[#2D3A4E] leading-tight">
                          {it.product.title}
                        </p>
                        <p className="text-xs text-[#4E5C70]">
                          {it.selectedColor}, разм. {it.selectedSize} • {it.quantity} шт.
                          {it.isPreorder && <span className="font-bold text-accent"> • Предзаказ</span>}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-[#2D3A4E]">
                      {(((it.product?.price ?? 0) * (it.quantity ?? 1))).toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                ))}
              </div>
              {/* Adjusted Order & Partial Refund Notice for Client */}
              {selectedOrderForTracking.isAdjusted && (
                <div className="neu-inset rounded-2xl p-3 border border-success/60 space-y-1.5 text-xs text-success">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold flex items-center gap-1.5 text-success">
                      <Sparkles className="w-3.5 h-3.5 text-success" />
                      Состав заказа был скорректирован
                    </span>
                    {selectedOrderForTracking.refundAmount && selectedOrderForTracking.refundAmount > 0 && (
                      <span className="font-extrabold text-success neu-flat px-2 py-0.5 rounded-lg text-[11px]">
                        Возврат: {selectedOrderForTracking.refundAmount.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                  </div>
                  {selectedOrderForTracking.adjustmentReason && (
                    <p className="text-xs text-success">
                      Причина: {selectedOrderForTracking.adjustmentReason}
                    </p>
                  )}
                  {selectedOrderForTracking.originalTotalPrice && (
                    <p className="text-xs text-[#4E5C70]">
                      Исходная сумма: <span className="line-through">{selectedOrderForTracking.originalTotalPrice.toLocaleString('ru-RU')} ₽</span> • Текущая сумма: <strong className="text-[#2D3A4E]">{selectedOrderForTracking.totalPrice.toLocaleString('ru-RU')} ₽</strong>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Delivery address & Payment info */}
            <div className="space-y-1.5 text-xs text-[#4E5C70] neu-inset p-3.5 rounded-2xl">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#2D3A4E]">Адрес доставки:</span>
                  <p className="text-xs text-[#4E5C70]">
                    {selectedOrderForTracking.deliveryAddress} ({selectedOrderForTracking.deliveryMethod})
                  </p>
                </div>
              </div>
              {selectedOrderForTracking.paymentMethod && (
                <div className="flex items-center gap-2 pt-1">
                  <CreditCard className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-[11px] text-[#2D3A4E] font-semibold">
                    Оплата: {selectedOrderForTracking.paymentMethod}
                  </span>
                </div>
              )}
            </div>

            {/* Courier / Post / Boutique Support connection card */}
            {(() => {
              const isPost = isRussianPostDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isPickup = isPickupDelivery(selectedOrderForTracking.deliveryMethod);
              const isCourier = isCourierDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);

              if (isPost) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 border border-accent/12 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-accent font-extrabold text-xs shrink-0 border border-accent/16">
                        ПР
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#2D3A4E] leading-snug">Почта России</p>
                        <p className="text-xs text-[#4E5C70] leading-snug">Выдача в почтовом отделении</p>
                      </div>
                    </div>
                    {onOpenSupportChat && (
                      <button
                        type="button"
                        onClick={() => {
                          const orderId = selectedOrderForTracking.id;
                          setSelectedOrderIdForTracking(null);
                          onCloseModals();
                          onOpenSupportChat(orderId);
                        }}
                        className="py-1.5 px-3 rounded-xl neu-button text-accent hover:text-accent-strong hover:scale-105 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                        title="Написать в чат поддержки"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-accent" />
                        <span>Чат заботы</span>
                      </button>
                    )}
                  </div>
                );
              }

              if (isPickup) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 border border-white/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-accent font-extrabold text-xs shrink-0 border border-white/90">
                        {storeInitials(storeName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#2D3A4E] leading-snug">{storeName}</p>
                        <p className="text-xs text-[#4E5C70] leading-snug">Вопросы о выдаче заказа</p>
                      </div>
                    </div>
                    {onOpenSupportChat && (
                      <button
                        type="button"
                        onClick={() => {
                          const orderId = selectedOrderForTracking.id;
                          setSelectedOrderIdForTracking(null);
                          onCloseModals();
                          onOpenSupportChat(orderId);
                        }}
                        className="py-1.5 px-3 rounded-xl neu-button text-[#2D3A4E] hover:text-accent hover:scale-105 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                        title="Написать в чат поддержки"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-accent" />
                        <span>Чат</span>
                      </button>
                    )}
                  </div>
                );
              }

              if (isCourier) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 border border-white/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* No made-up courier: the store answers about delivery itself (owner's request 02.10) */}
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-accent shrink-0 border border-white/90">
                        <Headphones className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#2D3A4E] leading-snug">Менеджер по доставке</p>
                        <p className="text-xs text-[#4E5C70] leading-snug">{storeName}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {storePhone && !selectedOrderForTracking.isCancelled && selectedOrderForTracking.status !== 'delivered' && (
                        <a
                          href={telHref(storePhone)}
                          className="py-1.5 px-2.5 rounded-xl neu-button text-accent hover:scale-105 transition-transform flex items-center gap-1 text-[11px] font-extrabold cursor-pointer"
                          title={`Позвонить в магазин (${storePhone})`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Позвонить</span>
                        </a>
                      )}
                      {onOpenSupportChat && (
                        <button
                          type="button"
                          onClick={() => {
                            const orderId = selectedOrderForTracking.id;
                            setSelectedOrderIdForTracking(null);
                            onCloseModals();
                            onOpenSupportChat(orderId);
                          }}
                          className="py-1.5 px-2.5 rounded-xl neu-button text-[#2D3A4E] hover:text-accent hover:scale-105 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                          title="Написать в чат поддержки"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-accent" />
                          <span>Чат</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // General Transport Company (СДЭК / DPD / etc)
              return (
                <div className="neu-inset rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 border border-white/70">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-success font-extrabold text-xs shrink-0 border border-success/25">
                      ТК
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#2D3A4E] leading-snug">Транспортная компания</p>
                      <p className="text-xs text-[#4E5C70] leading-snug">Доставка до ПВЗ / по адресу</p>
                    </div>
                  </div>
                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        const orderId = selectedOrderForTracking.id;
                        setSelectedOrderIdForTracking(null);
                        onCloseModals();
                        onOpenSupportChat(orderId);
                      }}
                      className="py-1.5 px-3 rounded-xl neu-button text-[#2D3A4E] hover:text-accent hover:scale-105 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                      title="Написать в чат поддержки"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-accent" />
                      <span>Чат заботы</span>
                    </button>
                  )}
                </div>
              );
            })()}

            </div>

            {/* Sticky Action Footer */}
            <div className="p-3.5 sm:p-4 border-t border-[#BAC5D5]/50 shrink-0 bg-[#E3E8EF]">
              <button
                type="button"
                onClick={() => {
                  if (!onRepeatOrder) return;
                  onRepeatOrder(selectedOrderForTracking.items);
                  setSelectedOrderIdForTracking(null);
                }}
                className="w-full neu-button-accent py-3 px-4 rounded-2xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition-transform cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Повторить заказ</span>
              </button>
              {selectedOrderForTracking.isCancelled ? (
                <p className="mt-2.5 text-xs text-[#4E5C70] leading-relaxed">
                  <span className="font-bold text-danger">{cancelledByLabel(selectedOrderForTracking, 'customer')}</span>
                  {formatCancelledAt(selectedOrderForTracking) && ` · ${formatCancelledAt(selectedOrderForTracking)}`}
                  {cancelReasonText(selectedOrderForTracking) && (
                    <span className="block">Причина: {cancelReasonText(selectedOrderForTracking)}</span>
                  )}
                </p>
              ) : onCancelOrder && canCustomerCancel(selectedOrderForTracking, currentUser?.uid) ? (
                <button
                  type="button"
                  onClick={() => setOrderToCancel(selectedOrderForTracking)}
                  className="mt-2.5 w-full neu-button-danger py-2.5 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Отменить заказ</span>
                </button>
              ) : customerCancelHint(selectedOrderForTracking, currentUser?.uid) ? (
                <p className="mt-2.5 text-xs text-[#4E5C70] leading-relaxed text-center">
                  {customerCancelHint(selectedOrderForTracking, currentUser?.uid)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {onSubmitPaymentReceipt && (
        <PaymentRequisitesModal order={orderToPay} onSubmitReceipt={onSubmitPaymentReceipt} onClose={() => setOrderToPay(null)} />
      )}

      <ConfirmDialog
        isOpen={orderToConfirmReceipt !== null}
        title="Подтвердить получение?"
        tone="neutral"
        confirmLabel="Да, получил"
        cancelLabel="Ещё нет"
        confirmIcon={<PackageCheck className="w-4 h-4" />}
        message={`Заказ № ${orderToConfirmReceipt?.id ?? ''} станет «Получен». Подтверждайте, когда посылка уже у вас.`}
        onConfirm={() => {
          if (orderToConfirmReceipt && onConfirmReceipt) void onConfirmReceipt(orderToConfirmReceipt);
        }}
        onClose={() => setOrderToConfirmReceipt(null)}
      />

      {onCancelOrder && (
        <CancelOrderDialog
          order={orderToCancel}
          audience="customer"
          onConfirm={(reason, comment) => (orderToCancel ? onCancelOrder(orderToCancel, reason, comment) : Promise.resolve(false))}
          onClose={() => setOrderToCancel(null)}
        />
      )}

    </>
  );
};
