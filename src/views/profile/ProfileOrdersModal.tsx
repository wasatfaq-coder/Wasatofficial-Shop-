import { useState } from 'react';
import { telHref } from '../../utils/storeContacts';
import {
  ShoppingBag,
  ChevronRight,
  X,
  Package,
  Truck,
  Clock,
  Phone,
  Store,
  MessageCircle,
  Bike,
  Zap,
  Mail,
} from 'lucide-react';
import { Product } from '../../types';
import { isQuickOrderDelivery, QUICK_ORDER_DELIVERY_TITLE } from '../../shared/orderPricing';
import {
  isRussianPostDelivery,
  isCourierDelivery,
  isPickupDelivery,
} from '../../utils/deliveryStages';
import { isCarrierOrder } from '../../utils/orderFlow';
import { useOrderLinePhotos } from '../../utils/productThumbs';
import { useDialogA11y } from '../../utils/useDialogA11y';
import type { ProfileScreenProps } from '../ProfileScreen';

import { getOrderStatusProgress } from './orderProgress';

type ProfileOrdersModalProps = Pick<ProfileScreenProps, 'orders' | 'onOpenSupportChat'> & {
  isOpen: boolean;
  /** Closes every window of the profile (the order windows open over the admin panel too) */
  onCloseModals: () => void;
  products: Product[];
  setSelectedOrderIdForTracking: (orderId: string | null) => void;
  storePhone: string;
};

/** «История и трекинг заказов»: the customer's orders with a filter; «Детали» opens the order's window */
export const ProfileOrdersModal = ({
  isOpen,
  onCloseModals,
  orders,
  products,
  onOpenSupportChat,
  setSelectedOrderIdForTracking,
  storePhone,
}: ProfileOrdersModalProps) => {
  // Filter for orders modal
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');

  const ordersDialog = useDialogA11y(isOpen, onCloseModals);
  const linePhoto = useOrderLinePhotos(isOpen ? orders.flatMap((o) => o.items.slice(0, 4).map((it) => it.product)) : [], products);

  const filteredOrders = orders.filter((ord) => {
    if (orderFilter === 'active') return !ord.isCancelled && ord.status !== 'delivered';
    if (orderFilter === 'completed') return ord.isCancelled || ord.status === 'delivered';
    return true;
  });


  return (
    <>
      {/* ================= MODAL: ORDER HISTORY & TRACKING ================= */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={ordersDialog.ref}
            {...ordersDialog.props}
            className="neu-modal rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col border border-white/80 text-[#2D3A4E] overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 p-4 sm:p-5 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent">
                  <Package className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 id={ordersDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">История и трекинг заказов</h3>
                  <p className="text-xs text-[#4E5C70] font-medium">Все ваши заказы в одном месте</p>
                </div>
              </div>
              <button
                onClick={() => onCloseModals()}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-transform"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sticky Fixed Filter Pills */}
            <div className="flex items-center gap-2 border-b border-[#BAC5D5]/50 px-4 sm:px-5 py-2.5 shrink-0 bg-[#E3E8EF]">
              {[
                { id: 'all', label: 'Все заказы' },
                { id: 'active', label: 'Активные' },
                { id: 'completed', label: 'Завершенные' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOrderFilter(f.id as any)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    orderFilter === f.id
                      ? 'neu-pill-active font-extrabold'
                      : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Smooth Scrollable Order List Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 no-scrollbar overscroll-contain transform-gpu">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-10 space-y-2 neu-inset rounded-2xl p-6">
                  <ShoppingBag className="w-10 h-10 text-[#4E5C70] mx-auto opacity-50" />
                  <p className="text-xs font-extrabold text-[#2D3A4E]">Заказов не найдено</p>
                  <p className="text-xs text-[#4E5C70]">Сделайте первый заказ в нашем каталоге!</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredOrders.map((ord) => {
                    const statusInfo = getOrderStatusProgress(ord);
                    return (
                      <div
                        key={ord.id}
                        className="neu-inset rounded-2xl p-4 space-y-3"
                        style={{ contain: 'layout paint' }}
                      >
                      {/* Top Header info */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            <span className="text-sm font-extrabold text-[#2D3A4E] whitespace-nowrap">№ {ord.id}</span>
                            <span
                              className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${
                                !ord.isCancelled && ord.status !== 'delivered'
                                  ? 'neu-inset-deep neu-inset-deep-animated text-accent border border-accent/30'
                                  : `${statusInfo.text} neu-flat`
                              }`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-[#4E5C70] font-medium">{ord.date}</p>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-extrabold text-[#2D3A4E]">
                            {(ord.totalPrice ?? 0).toLocaleString('ru-RU')} ₽
                          </span>
                          <p className="text-xs text-[#4E5C70]">
                            {ord.items.reduce((a, b) => a + b.quantity, 0)} тов.
                          </p>
                        </div>
                      </div>

                      {/* Mini visual status progress line */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-[#4E5C70]">
                          <span>Прогресс доставки</span>
                          <span className="text-accent font-extrabold">{statusInfo.percent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden neu-inset relative">
                          <div
                            className={`h-full ${statusInfo.color} transition-all duration-700 ease-out rounded-full relative`}
                            style={{ width: `${Math.max(4, statusInfo.percent)}%` }}
                          >
                            {!ord.isCancelled && ord.status !== 'delivered' && (
                              <div className="neu-progress-beam" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Tracking number badge & delivery method for client order item */}
                      {(() => {
                        const isPost = isRussianPostDelivery(ord.deliveryMethod, ord.trackingCompany);
                        const isTK = isCarrierOrder(ord);
                        const isPickup = isPickupDelivery(ord.deliveryMethod);
                        // «Заказ в 1 клик»: the manager agrees the delivery (older ones said «Экспресс курьер (1 клик)»)
                        const isQuick = isQuickOrderDelivery(ord.deliveryMethod);
                        const isExpress = !isQuick && ((ord.deliveryMethod || '').toLowerCase().includes('экспресс') || (ord.deliveryMethod || '').toLowerCase().includes('express'));

                        return (
                          <div className="flex items-center justify-between text-xs pt-0.5 flex-wrap gap-1.5">
                            {isPost ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-accent neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1 border border-accent/12">
                                  <Mail className="w-3 h-3 text-accent" />
                                  Почта России
                                </span>
                                {ord.trackingNumber ? (
                                  <span className="text-[11px] font-mono font-bold text-accent neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1">
                                    {ord.trackingNumber}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-medium text-warning neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-warning" />
                                    Трек формируется
                                  </span>
                                )}
                              </div>
                            ) : isTK ? (
                              ord.trackingNumber ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-mono font-bold text-accent neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1">
                                    <Truck className="w-3 h-3 text-accent" />
                                    {ord.trackingNumber}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] font-medium text-warning neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-warning" />
                                  Трек-номер формируется
                                </span>
                              )
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-[#2D3A4E] neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1">
                                  {isPickup ? (
                                    <Store className="w-3 h-3 text-accent" />
                                  ) : isQuick ? (
                                    <MessageCircle className="w-3 h-3 text-accent" />
                                  ) : isExpress ? (
                                    <Zap className="w-3 h-3 text-warning" />
                                  ) : (
                                    <Bike className="w-3 h-3 text-accent" />
                                  )}
                                  {isQuick ? QUICK_ORDER_DELIVERY_TITLE : ord.deliveryMethod || 'Курьерская доставка'}
                                </span>
                              </div>
                            )}

                            <span className="text-[11px] text-[#4E5C70] font-medium">
                              {isPost
                                ? 'Почтовое отправление'
                                : isTK
                                ? ord.deliveryMethod || 'ТК'
                                : isPickup
                                ? 'Самовывоз'
                                : isQuick
                                ? 'Доставку согласует менеджер'
                                : 'Курьерская доставка'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Items previews thumbnails & quick actions */}
                      <div className="flex items-center justify-between pt-1 gap-2 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                          {ord.items.slice(0, 4).map((it, idx) => (
                            <img
                              key={idx}
                              src={linePhoto(it.product)}
                              alt=""
                              className="w-10 h-10 rounded-xl object-cover neu-flat p-0.5 shrink-0"
                            />
                          ))}
                          {ord.items.length > 4 && (
                            <span className="text-[11px] font-extrabold text-[#4E5C70] neu-inset px-2 py-1 rounded-xl">
                              +{ord.items.length - 4}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {storePhone && isCourierDelivery(ord.deliveryMethod, ord.trackingCompany) && !ord.isCancelled && ord.status !== 'delivered' && (
                            <a
                              href={telHref(storePhone)}
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 rounded-xl neu-button text-accent hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
                              title={`Позвонить в магазин (${storePhone})`}
                              aria-label={`Позвонить в магазин (${storePhone})`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {onOpenSupportChat && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderIdForTracking(null);
                                onCloseModals();
                                onOpenSupportChat(ord.id);
                              }}
                              className="p-2 rounded-xl neu-button text-[#4E5C70] hover:text-accent hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
                              title="Написать в службу поддержки"
                              aria-label="Написать в службу поддержки"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedOrderIdForTracking(ord.id)}
                            className="neu-button px-3 py-2 rounded-xl text-xs font-bold text-accent flex items-center gap-1 shrink-0 transition-transform cursor-pointer"
                          >
                            <span>Детали</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

    </>
  );
};
