import { useState } from 'react';
import { groupOrderLines } from '../../shared/packLines';
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
  Search,
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
import { useLoadFailed } from '../../utils/loadFailures';
import { LoadFailedNotice } from '../../components/LoadFailedNotice';
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
  const [searchQuery, setSearchQuery] = useState('');

  const ordersDialog = useDialogA11y(isOpen, onCloseModals);
  // the orders subscription failed (finding 15): said instead of «Заказов не найдено»
  const ordersLoadFailed = useLoadFailed('orders');
  const linePhoto = useOrderLinePhotos(isOpen ? orders.flatMap((o) => groupOrderLines(o.items).slice(0, 4).map((g) => g.item.product)) : [], products);

  const filteredOrders = orders.filter((ord) => {
    if (orderFilter === 'active' && (ord.isCancelled || ord.status === 'delivered')) return false;
    if (orderFilter === 'completed' && !ord.isCancelled && ord.status !== 'delivered') return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      ord.id.toLowerCase().includes(q) ||
      (ord.trackingNumber && ord.trackingNumber.toLowerCase().includes(q)) ||
      ord.items.some((item) => item.product?.title?.toLowerCase().includes(q))
    );
  });


  return (
    <>
      {/* ================= MODAL: ORDER HISTORY & TRACKING ================= */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-text-primary/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={ordersDialog.ref}
            {...ordersDialog.props}
            className="neu-modal rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col text-text-primary overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between gap-2 neu-divider-b p-4 sm:p-5 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                  <Package className="w-5 h-5 stroke-[2.2] shrink-0" />
                </div>
                <div className="min-w-0">
                  <h3 id={ordersDialog.titleId} className="text-base font-extrabold text-text-primary">История и трекинг заказов</h3>
                  <p className="text-xs text-text-secondary font-medium">Все ваши заказы в одном месте</p>
                </div>
              </div>
              <button
                onClick={() => onCloseModals()}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer transition-transform shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* Sticky Fixed Filter Pills & Search */}
            <div className="neu-divider-b px-4 sm:px-5 py-2.5 shrink-0 bg-[#E3E8EF] space-y-2">
              {orders.length > 2 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Номер заказа, трек-номер или товар"
                    aria-label="Поиск по заказам"
                    className="w-full h-9 pl-8 pr-3 rounded-xl neu-inset text-xs text-text-primary placeholder:text-text-muted"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                {[
                  { id: 'all', label: 'Все заказы' },
                  { id: 'active', label: 'Активные' },
                  { id: 'completed', label: 'Завершенные' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setOrderFilter(f.id as any)}
                    className={`min-h-8 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      orderFilter === f.id
                        ? 'neu-pill-active font-extrabold'
                        : 'neu-button text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Smooth Scrollable Order List Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 no-scrollbar overscroll-contain transform-gpu">
              {ordersLoadFailed && <LoadFailedNotice title="Не удалось загрузить заказы" />}
              {filteredOrders.length === 0 ? (
                ordersLoadFailed ? null : <div className="text-center py-10 space-y-2 neu-inset rounded-2xl p-6">
                  <ShoppingBag className="w-10 h-10 text-text-secondary mx-auto opacity-50" />
                  <p className="text-xs font-extrabold text-text-primary">Заказов не найдено</p>
                  <p className="text-xs text-text-secondary">Сделайте первый заказ в нашем каталоге!</p>
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
                            <span className="text-sm font-extrabold text-text-primary whitespace-nowrap">№ {ord.id}</span>
                            <span
                              className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${
                                !ord.isCancelled && ord.status !== 'delivered'
                                  ? 'neu-pill-active neu-inset-deep-animated text-accent'
                                  : `${statusInfo.text} neu-flat`
                              }`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-text-secondary font-medium">{ord.date}</p>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-extrabold text-text-primary">
                            {(ord.totalPrice ?? 0).toLocaleString('ru-RU')} ₽
                          </span>
                          <p className="text-xs text-text-secondary">
                            {ord.items.reduce((a, b) => a + b.quantity, 0)} тов.
                          </p>
                        </div>
                      </div>

                      {/* Mini visual status progress line */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-text-secondary">
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
                                <span className="text-[11px] font-bold text-accent neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1">
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
                                <span className="text-[11px] font-bold text-text-primary neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1">
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

                            <span className="text-[11px] text-text-secondary font-medium">
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
                          {groupOrderLines(ord.items).slice(0, 4).map((group, idx) => (
                            <img
                              key={idx}
                              src={linePhoto(group.item.product)}
                              alt=""
                              className="w-10 h-10 rounded-xl object-cover neu-flat p-0.5 shrink-0"
                            />
                          ))}
                          {groupOrderLines(ord.items).length > 4 && (
                            <span className="text-[11px] font-extrabold text-text-secondary neu-inset px-2 py-1 rounded-xl">
                              +{groupOrderLines(ord.items).length - 4}
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
                              className="p-2 rounded-xl neu-button text-text-secondary hover:text-accent hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
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
