import React, { useState, useMemo, useEffect, useRef, Suspense, useTransition } from 'react';
import { IS_PREVIEW_BUILD } from '../../utils/previewBuild';
import { useLoadFailed } from '../../utils/loadFailures';
import { LoadFailedNotice } from '../../components/LoadFailedNotice';
import { launchSteps } from '../../utils/launchChecklist';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  isReceiptOnReview,
  receiptReviewMessage,
  reviewedOrder,
  type ReceiptDecision,
} from '../../utils/paymentDetails';
import { m, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  Order,
  Product,
  PromoCode,
  BannerSlide,
  ChatMessage,
  DeliveryMethod,
  PickupPoint,
} from '../../types';
import type { AdminChatPayload } from '../../components/admin/AdminSupportChatTab';
import {
  loadLocalDeliveryMethods,
  saveLocalDeliveryMethods,
  loadLocalPickupPoints,
  saveLocalPickupPoints,
} from '../../data/deliveryData';
import { getCategories } from '../../utils/categories';
import { lowStockThresholdOf } from '../../utils/inventory';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { type AdminNavCounts, type AdminTab } from '../../components/admin/adminSections';
import { loadAdminNav, prefetchAdmin, prefetchAllAdminWhenIdle } from '../../components/admin/adminLoaders';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import { UnsavedChangesContext, useUnsavedRegistry } from '../../utils/unsavedChanges';
import { summarizeSupportThreads } from '../../utils/supportThreads';
import { useAdminReviews } from '../../utils/useAdminReviews';
import { useReviewHiddenSync } from '../../utils/useReviewHiddenSync';
import { countPendingReviews } from '../../utils/adminReviews';
import type { ProfileScreenProps } from '../ProfileScreen';


// The admin panel is a separate chunk (its sections, Base UI, charts): customers do not download it
const AdminTodayTab = lazyWithRetry(() => import('../../components/admin/AdminTodayTab').then((m) => ({ default: m.AdminTodayTab })));
const AdminAnalyticsTab = lazyWithRetry(() => import('../../components/admin/AdminAnalyticsTab').then((m) => ({ default: m.AdminAnalyticsTab })));
const AdminPromoConstructorTab = lazyWithRetry(() => import('../../components/admin/AdminPromoConstructorTab').then((m) => ({ default: m.AdminPromoConstructorTab })));
const AdminBannersTab = lazyWithRetry(() => import('../../components/admin/AdminBannersTab').then((m) => ({ default: m.AdminBannersTab })));
const AdminSupportInbox = lazyWithRetry(() => import('../../components/admin/AdminSupportInbox').then((m) => ({ default: m.AdminSupportInbox })));
const AdminRatesTab = lazyWithRetry(() => import('../../components/admin/AdminRatesTab').then((m) => ({ default: m.AdminRatesTab })));
const AdminInventoryTab = lazyWithRetry(() => import('../../components/admin/AdminInventoryTab').then((m) => ({ default: m.AdminInventoryTab })));
const AdminProductsTab = lazyWithRetry(() => import('../../components/admin/AdminProductsTab').then((m) => ({ default: m.AdminProductsTab })));
const AdminOrdersTab = lazyWithRetry(() => import('../../components/admin/AdminOrdersTab').then((m) => ({ default: m.AdminOrdersTab })));
const AdminCustomersTab = lazyWithRetry(() => import('../../components/admin/AdminCustomersTab').then((m) => ({ default: m.AdminCustomersTab })));
const AdminStorefrontTab = lazyWithRetry(() => import('../../components/admin/AdminStorefrontTab').then((m) => ({ default: m.AdminStorefrontTab })));
const BrandRenameCard = lazyWithRetry(() => import('../../components/admin/BrandRenameCard').then((m) => ({ default: m.BrandRenameCard })));
const AdminDeliveryTab = lazyWithRetry(() => import('../../components/admin/AdminDeliveryTab').then((m) => ({ default: m.AdminDeliveryTab })));
const AdminWholesaleTab = lazyWithRetry(() =>
  import('../../components/admin/AdminWholesaleTab').then((m) => ({ default: m.AdminWholesaleTab }))
);
const AdminReviewsTab = lazyWithRetry(() => import('../../components/admin/AdminReviewsTab').then((m) => ({ default: m.AdminReviewsTab })));
const AdminFaqTab = lazyWithRetry(() => import('../../components/admin/AdminFaqTab').then((m) => ({ default: m.AdminFaqTab })));
const AdminLegalTab = lazyWithRetry(() => import('../../components/admin/AdminLegalTab').then((m) => ({ default: m.AdminLegalTab })));
const AdminPaymentTab = lazyWithRetry(() => import('../../components/admin/AdminPaymentTab').then((m) => ({ default: m.AdminPaymentTab })));
const AdminCategoriesTab = lazyWithRetry(() => import('../../components/admin/AdminCategoriesTab').then((m) => ({ default: m.AdminCategoriesTab })));
const AdminNav = lazyWithRetry(() => loadAdminNav().then((m) => ({ default: m.AdminNav })));

/** While a section of the admin panel (a separate chunk) is loading */
const AdminLoading: React.FC = () => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-text-secondary">
    <RefreshCw className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
    Загрузка раздела…
  </div>
);

type ProfileAdminPanelProps = Pick<
  ProfileScreenProps,
  | 'orders'
  | 'onShowToast'
  | 'onUpdateProducts'
  | 'onUpdateOrders'
  | 'onUpdatePromos'
  | 'onUpdateBannerSlides'
  | 'onSendMessageAsAdmin'
  | 'onClearChat'
  | 'onChangeChatMessage'
  | 'storefrontSettings'
  | 'onUpdateStorefrontSettings'
  | 'onSaveLegalText'
  | 'onApplyExchangeRates'
  | 'deliveryMethods'
  | 'onUpdateDeliveryMethods'
  | 'pickupPoints'
  | 'onUpdatePickupPoints'
> & {
  isOpen: boolean;
  onClose: () => void;
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  /** An order from the panel opens the order's window over it */
  setSelectedOrderIdForTracking: (orderId: string | null) => void;
  products: Product[];
  promos: PromoCode[];
  bannerSlides: BannerSlide[];
  chatMessages: ChatMessage[];
};

/**
 * The admin panel window: «Сегодня» and the sections (each a separate chunk), unsaved edits asked about before closing or
 * switching, local copies of the lists the sections edit.
 */
export const ProfileAdminPanel = ({
  isOpen,
  onClose,
  adminTab,
  setAdminTab,
  setSelectedOrderIdForTracking,
  orders,
  products,
  promos,
  bannerSlides,
  chatMessages,
  deliveryMethods,
  pickupPoints,
  storefrontSettings,
  onShowToast,
  onUpdateProducts,
  onUpdateOrders,
  onUpdatePromos,
  onUpdateBannerSlides,
  onSendMessageAsAdmin,
  onClearChat,
  onChangeChatMessage,
  onUpdateStorefrontSettings,
  onSaveLegalText,
  onApplyExchangeRates,
  onUpdateDeliveryMethods,
  onUpdatePickupPoints,
}: ProfileAdminPanelProps) => {
  const { currentUser, isAdmin: isFirebaseAdmin } = useAuth();
  // Local products list state (backed by props)
  const [productsList, setProductsList] = useState<Product[]>(products);

  // Local Promos & Banners state synced with props
  const [localPromos, setLocalPromos] = useState<PromoCode[]>(promos);
  const [localBanners, setLocalBanners] = useState<BannerSlide[]>(bannerSlides);
  const [localChatMessages, setLocalChatMessages] = useState<ChatMessage[]>(chatMessages);
  const [localDeliveryMethods, setLocalDeliveryMethods] = useState<DeliveryMethod[]>(
    () => deliveryMethods || loadLocalDeliveryMethods()
  );
  const [localPickupPoints, setLocalPickupPoints] = useState<PickupPoint[]>(
    () => pickupPoints || loadLocalPickupPoints()
  );


  React.useEffect(() => {
    if (products) {
      setProductsList(products);
    }
  }, [products]);

  React.useEffect(() => {
    if (promos) {
      setLocalPromos(promos);
    }
  }, [promos]);

  React.useEffect(() => {
    if (bannerSlides) {
      setLocalBanners(bannerSlides);
    }
  }, [bannerSlides]);

  React.useEffect(() => {
    if (chatMessages) {
      setLocalChatMessages(chatMessages);
    }
  }, [chatMessages]);

  React.useEffect(() => {
    if (deliveryMethods) {
      setLocalDeliveryMethods(deliveryMethods);
    }
  }, [deliveryMethods]);

  React.useEffect(() => {
    if (pickupPoints) {
      setLocalPickupPoints(pickupPoints);
    }
  }, [pickupPoints]);

  const handleUpdateDeliveryMethodsList = (updated: DeliveryMethod[]) => {
    setLocalDeliveryMethods(updated);
    saveLocalDeliveryMethods(updated);
    return onUpdateDeliveryMethods?.(updated);
  };

  const handleUpdatePickupPointsList = (updated: PickupPoint[]) => {
    setLocalPickupPoints(updated);
    saveLocalPickupPoints(updated);
    return onUpdatePickupPoints?.(updated);
  };

  const handleUpdatePromosList = (updated: PromoCode[]) => {
    setLocalPromos(updated);
    return onUpdatePromos?.(updated);
  };

  const handleUpdateBannersList = (updated: BannerSlide[]) => {
    setLocalBanners(updated);
    return onUpdateBannerSlides?.(updated);
  };

  // The list shows the change at once and goes back when the save was refused before writing (the catalog is still
  // loading); a refusal of the database is undone by the next catalog snapshot
  const handleUpdateProductsList = (updated: Product[]) => {
    const before = productsList;
    setProductsList(updated);
    const saved = onUpdateProducts?.(updated);
    void Promise.resolve(saved).then((ok) => {
      if (ok === false) setProductsList((current) => (current === updated ? before : current));
    });
    return saved;
  };

  const handleUpdateOrders = (updated: Order[], seen?: Order[]) => onUpdateOrders?.(updated, seen);

  // Support inbox: one dialog per customer (AdminSupportInbox groups messages by threadId)
  const handleSendAdminMessage = (thread: { threadId: string; threadName: string }, payload: AdminChatPayload) => {
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      ...thread,
      sender: 'admin',
      text: payload.text,
      imageUrl: payload.imageUrl,
      promoCard: payload.promoCard,
      isInternalNote: payload.isInternalNote,
      productCard: payload.productCard,
      orderStatusUpdate: payload.orderStatusUpdate,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setLocalChatMessages((prev) => [...prev, newMsg]);
    onSendMessageAsAdmin?.(
      payload.text,
      payload.imageUrl,
      payload.promoCard,
      undefined,
      payload.isInternalNote,
      payload.productCard,
      payload.orderStatusUpdate,
      thread
    );
  };


  /**
   * «Подтвердить оплату» / «Отклонить чек» («Доработки 5»), from «Заказы» and from the chat: the order changes, the
   * buyer gets the store's message in the chat (and a notification while the site is open).
   */
  const handleReviewReceipt = async (order: Order, decision: ReceiptDecision, reason?: string): Promise<boolean> => {
    const next = reviewedOrder(order, decision, { adminUid: currentUser?.uid, reason });
    const saved = await handleUpdateOrders(orders.map((o) => (o.id === order.id ? next : o)));
    if (saved === false) return false;
    if (order.customerUid) {
      handleSendAdminMessage(
        { threadId: order.customerUid, threadName: order.customerName || 'Покупатель' },
        { text: receiptReviewMessage(order.id, decision, reason) }
      );
    }
    onShowToast(
      decision === 'confirm' ? `Оплата заказа № ${order.id} подтверждена` : `Чек к заказу № ${order.id} отклонён`,
      decision === 'confirm' ? 'success' : 'info'
    );
    return true;
  };


  const [supportTargetOrderId, setSupportTargetOrderId] = useState<string | null>(null);
  const [supportTargetThreadUid, setSupportTargetThreadUid] = useState<string | null>(null);
  const [ordersFilterPreset, setOrdersFilterPreset] = useState<{
    key: number;
    status?: Order['status'] | 'all';
    payment?: 'all' | NonNullable<Order['paymentStatus']>;
    search?: string;
  } | null>(null);
  // Unsaved edits in the panel's forms: closing or switching the section asks first
  const { registry: unsavedRegistry, unsavedLabels, hasUnsaved } = useUnsavedRegistry();
  type PendingAdminAction = ({ type: 'close' } | { type: 'tab'; tab: AdminTab }) & { labels: string[] };
  const [pendingAdminAction, setPendingAdminAction] = useState<PendingAdminAction | null>(null);
  // The question keeps its text while it fades out
  const shownAdminAction = useRef<PendingAdminAction | null>(null);
  if (pendingAdminAction) shownAdminAction.current = pendingAdminAction;
  const requestCloseAdmin = () => {
    if (hasUnsaved) setPendingAdminAction({ type: 'close', labels: unsavedLabels() });
    else onClose();
  };
  // A section switch is a transition: the current section stays on screen while the next one's code loads
  const [isTabPending, startTabTransition] = useTransition();
  const [requestedTab, setRequestedTab] = useState<AdminTab | null>(null);
  const switchAdminTab = (tab: AdminTab) => {
    setRequestedTab(tab);
    startTabTransition(() => setAdminTab(tab));
  };
  const requestAdminTab = (tab: AdminTab) => {
    if (tab === adminTab) return;
    if (hasUnsaved) setPendingAdminAction({ type: 'tab', tab, labels: unsavedLabels() });
    else switchAdminTab(tab);
  };
  const confirmPendingAdminAction = () => {
    const action = pendingAdminAction;
    setPendingAdminAction(null);
    if (action?.type === 'close') onClose();
    else if (action?.type === 'tab') switchAdminTab(action.tab);
  };
  const isAdminOpen = isOpen;
  // Admins get the panel's code while the browser is idle, so opening it and switching sections is instant
  useEffect(() => {
    if (!isFirebaseAdmin) return;
    return prefetchAllAdminWhenIdle(adminTab);
    // only on becoming admin (adminTab just picks the first section to fetch)
  }, [isFirebaseAdmin]);
  // Leaving the page (reload, closing the tab) with unsaved edits: the browser asks
  useEffect(() => {
    if (!isAdminOpen || !hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isAdminOpen, hasUnsaved]);
  const adminDialog = useDialogA11y(isAdminOpen, requestCloseAdmin);
  // What waits for the admin: new orders and dialogs where the customer wrote last
  // reviews waiting for the owner's check: «Сегодня» and the badge of «Отзывы» (the same queries the catalog listens to)
  const adminReviews = useAdminReviews(isAdminOpen);
  // the `hidden` mark customers' reads go by: decisions, the switch and reviews before 12.10 (owner's decision 12.10)
  useReviewHiddenSync(adminReviews, storefrontSettings.reviewPremoderation === true);
  const pendingReviews = useMemo(
    () => countPendingReviews(adminReviews.reviews, adminReviews.decisions, storefrontSettings.reviewPremoderation === true),
    [adminReviews.reviews, adminReviews.decisions, storefrontSettings.reviewPremoderation]
  );
  const adminCounts = useMemo<AdminNavCounts>(() => {
    if (!isAdminOpen) return {};
    const newOrders = orders.filter((o) => o.status === 'accepted' && !o.isCancelled).length;
    // receipts waiting for the check count too («Доработки 5»)
    const receipts = orders.filter(isReceiptOnReview).length;
    const awaiting = summarizeSupportThreads(localChatMessages, orders).filter((t) => t.awaitingReply).length;
    return {
      orders: { value: newOrders + receipts, label: receipts > 0 ? 'новых заказов и чеков на проверке' : 'новых заказов' },
      support: { value: awaiting, label: 'ждут ответа' },
      reviews: { value: pendingReviews, label: 'ждут проверки' },
    };
  }, [isAdminOpen, orders, localChatMessages, pendingReviews]);
  const ordersLoadFailed = useLoadFailed('orders');

  return (
    <>
      {/* ================= MODAL: ADMIN PANEL ================= */}
      <AnimatePresence>
        {isOpen && (
          <m.div
            key="admin-panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="admin-no-glow fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 overflow-y-auto overflow-x-hidden"
          >
            {/* Backdrop */}
            <div
              onClick={requestCloseAdmin}
              className="fixed inset-0 bg-text-primary/40 backdrop-blur-xs cursor-pointer"
            />

            <m.div
              key="admin-modal"
              ref={adminDialog.ref}
              {...adminDialog.props}
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              // Phone: the whole screen (no rounded frame and gaps eating ~40 px), from sm a window
              className="neu-modal rounded-none sm:rounded-3xl p-3 sm:p-6 max-w-5xl lg:max-w-none w-full sm:my-auto space-y-3 sm:space-y-4 h-[100dvh] sm:h-auto max-h-none sm:max-h-[92vh] lg:max-h-none lg:h-[calc(100vh-2rem)] flex flex-col sm:text-text-primary min-w-0 overflow-hidden relative z-10"
            >
            {/* Modal Header */}
            <div className="flex items-center justify-between neu-divider-b pb-2 sm:pb-3 shrink-0 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="hidden sm:flex w-9 h-9 rounded-xl neu-flat-sm items-center justify-center text-accent shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 id={adminDialog.titleId} className="text-sm sm:text-base font-extrabold text-text-primary leading-tight">
                      Панель администратора
                    </h3>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold neu-tone-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      {currentUser?.email}
                    </span>
                  </div>
                  {IS_PREVIEW_BUILD ? (
                    <p className="text-xs font-bold text-warning">Проверочная версия: изменения попадут в настоящий магазин</p>
                  ) : (
                    <p className="hidden sm:block text-xs font-medium text-text-secondary truncate">Каталог, склад, заказы и витрина</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="admin-modal-close-btn"
                  type="button"
                  onClick={requestCloseAdmin}
                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* the orders subscription failed: «Заказы», «Клиенты» and «Аналитика» would look empty (finding 15) */}
            {ordersLoadFailed && (
              <LoadFailedNotice
                className="shrink-0"
                title="Не удалось загрузить заказы"
                text="«Заказы», «Клиенты» и «Аналитика» сейчас могут быть пустыми или неполными. Проверьте соединение и обновите страницу."
              />
            )}

            {/* «Сегодня» and the sections (menu variant A); forms report unsaved edits to the panel */}
            <UnsavedChangesContext.Provider value={unsavedRegistry}>
            <SectionErrorBoundary title="Панель не открылась">
            <Suspense fallback={<AdminLoading />}>
            <AdminNav
              tab={adminTab}
              onRequestTab={requestAdminTab}
              onPrefetchTab={prefetchAdmin}
              pendingTab={isTabPending ? requestedTab : null}
              counts={adminCounts}
            >
              {/* One Suspense for all sections, above the keyed wrapper and the keyed error boundary: during a switch
                  (a transition) it keeps the current section instead of showing «Загрузка раздела…»; a keyed boundary
                  above it would remount it and show the fallback on every first open */}
              <Suspense fallback={<AdminLoading />}>
              <SectionErrorBoundary key={adminTab}>
                <m.div
                  key={adminTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="w-full"
                >
              {/* «Сегодня»: what waits for the owner, the launch steps first while the store is not ready */}
              {adminTab === 'today' && (
                <AdminTodayTab
                  orders={orders}
                  chatMessages={localChatMessages}
                  products={productsList}
                  lowStockThreshold={lowStockThresholdOf(storefrontSettings)}
                  unpaidCancelDays={storefrontSettings.unpaidOrderCancelDays}
                  launchSteps={launchSteps(productsList, localDeliveryMethods, storefrontSettings)}
                  isStoreOffline={storefrontSettings.isStoreOnline === false}
                  pendingReviews={pendingReviews}
                  onOpenTab={requestAdminTab}
                  onOpenOrdersWithFilter={(preset) => {
                    setOrdersFilterPreset({ key: Date.now(), ...preset });
                    requestAdminTab('orders');
                  }}
                />
              )}

              {/* --- TAB 1: ANALYTICS & FINANCIAL DASHBOARD --- */}
              {adminTab === 'analytics' && (
                <AdminAnalyticsTab
                  orders={orders}
                  products={productsList}
                  promos={localPromos}
                  onShowToast={onShowToast}
                  onSelectOrder={(ord) => setSelectedOrderIdForTracking(ord.id)}
                />
              )}

              {/* --- TAB 2: PRODUCTS CATALOG MANAGEMENT --- */}
              {adminTab === 'products' && (
                <AdminProductsTab
                  categories={getCategories(storefrontSettings)}
                  products={productsList}
                  settings={storefrontSettings}
                  onUpdateProducts={handleUpdateProductsList}
                  onShowToast={onShowToast}
                  lowStockThreshold={lowStockThresholdOf(storefrontSettings)}
                />
              )}

              {/* --- TAB 3: INVENTORY & SKU MANAGEMENT --- */}
              {adminTab === 'inventory' && (
                <AdminInventoryTab
                  products={productsList}
                  onUpdateProducts={handleUpdateProductsList}
                  onShowToast={onShowToast}
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                />
              )}

              {adminTab === 'reviews' && (
                <AdminReviewsTab
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                  products={productsList}
                  onShowToast={onShowToast}
                />
              )}

              {adminTab === 'wholesale' && (
                <AdminWholesaleTab
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                  products={productsList}
                  onShowToast={onShowToast}
                />
              )}

              {adminTab === 'rates' && (
                <AdminRatesTab
                  products={productsList}
                  onApply={
                    onApplyExchangeRates &&
                    (async (rates, repriced) => {
                      const ok = await onApplyExchangeRates(rates, repriced);
                      // the list shows new prices only once they are saved (refused or failed — the old ones stay)
                      if (ok) {
                        const byId = new Map(repriced.map((p) => [p.id, p]));
                        setProductsList((list) => list.map((p) => byId.get(p.id) ?? p));
                      }
                      return ok;
                    })
                  }
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 4: ORDERS MANAGEMENT --- */}
              {adminTab === 'orders' && (
                <AdminOrdersTab
                  orders={orders}
                  storefrontSettings={storefrontSettings}
                  products={productsList}
                  promos={promos}
                  deliveryMethods={localDeliveryMethods}
                  onUpdateOrders={handleUpdateOrders}
                  onShowToast={onShowToast}
                  onReviewReceipt={handleReviewReceipt}
                  externalFilter={ordersFilterPreset}
                  onOpenSupportChat={(orderId, customerName) => {
                    setSupportTargetOrderId(orderId);
                    setSupportTargetThreadUid(null);
                    requestAdminTab('support');
                    onShowToast(`Переход в чат поддержки по заказу #${orderId}${customerName ? ` (${customerName})` : ''}`, 'info');
                  }}
                />
              )}

              {/* --- TAB 4.1: DELIVERY METHODS & PICKUP POINTS MANAGEMENT --- */}
              {adminTab === 'delivery' && (
                <AdminDeliveryTab
                  deliveryMethods={localDeliveryMethods}
                  onUpdateDeliveryMethods={handleUpdateDeliveryMethodsList}
                  pickupPoints={localPickupPoints}
                  onUpdatePickupPoints={handleUpdatePickupPointsList}
                  onShowToast={onShowToast}
                  storefrontSettings={storefrontSettings}
                  onUpdateStorefrontSettings={onUpdateStorefrontSettings}
                />
              )}

              {/* --- TAB: CUSTOMERS & CRM --- */}
              {adminTab === 'customers' && (
                <AdminCustomersTab
                  products={productsList}
                  orders={orders}
                  onOpenCustomerOrders={(query) => {
                    setOrdersFilterPreset({
                      key: Date.now(),
                      status: 'all',
                      payment: 'all',
                      search: query,
                    });
                    requestAdminTab('orders');
                  }}
                  onOpenSupportChat={(orderId, customerName, customerUid) => {
                    setSupportTargetOrderId(orderId ?? null);
                    setSupportTargetThreadUid(customerUid ?? null);
                    requestAdminTab('support');
                    if (customerName) {
                      onShowToast(`Переход в диалог с клиентом ${customerName}`, 'info');
                    }
                  }}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 5: PROMO CODE CONSTRUCTOR --- */}
              {adminTab === 'promos' && (
                <AdminPromoConstructorTab
                  categories={getCategories(storefrontSettings)}
                  promos={localPromos}
                  products={productsList}
                  orders={orders}
                  onUpdatePromos={handleUpdatePromosList}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 6: HOMEPAGE BANNERS & SLIDER MANAGEMENT --- */}
              {adminTab === 'banners' && (
                <AdminBannersTab
                  categories={getCategories(storefrontSettings)}
                  banners={localBanners}
                  products={productsList}
                  promos={localPromos}
                  onUpdateBanners={handleUpdateBannersList}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 7: REAL-TIME SUPPORT CHAT --- */}
              {adminTab === 'support' && (
                <AdminSupportInbox
                  messages={localChatMessages}
                  orders={orders}
                  products={productsList}
                  promos={localPromos}
                  categories={getCategories(storefrontSettings)}
                  storefrontSettings={storefrontSettings}
                  initialOrderId={supportTargetOrderId}
                  initialThreadUid={supportTargetThreadUid}
                  onSend={handleSendAdminMessage}
                  onUpdateOrders={handleUpdateOrders}
                  onReviewReceipt={handleReviewReceipt}
                  onClearThread={(threadId) => onClearChat?.(threadId)}
                  onChangeMessage={async (change) => (onChangeChatMessage ? onChangeChatMessage(change) : false)}
                  onShowToast={onShowToast}
                />
              )}

              {adminTab === 'categories' && (
                <AdminCategoriesTab
                  settings={storefrontSettings}
                  products={productsList}
                  onUpdateSettings={onUpdateStorefrontSettings}
                  onUpdateProducts={handleUpdateProductsList}
                  onShowToast={onShowToast}
                />
              )}

              {adminTab === 'payment' && (
                <AdminPaymentTab
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                  onShowToast={onShowToast}
                />
              )}

              {adminTab === 'faq' && (
                <AdminFaqTab
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                  onShowToast={onShowToast}
                />
              )}

              {adminTab === 'legal' && (
                <AdminLegalTab
                  settings={storefrontSettings}
                  onSaveLegalText={onSaveLegalText}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 8: STOREFRONT & SYSTEM SETTINGS --- */}
              {adminTab === 'storefront' && (
                <div className="space-y-4">
                  <BrandRenameCard
                    settings={storefrontSettings}
                    deliveryMethods={deliveryMethods ?? []}
                    pickupPoints={pickupPoints ?? []}
                    bannerSlides={bannerSlides}
                    promos={promos}
                    onUpdateSettings={onUpdateStorefrontSettings}
                    onUpdateDeliveryMethods={onUpdateDeliveryMethods}
                    onUpdatePickupPoints={onUpdatePickupPoints}
                    onUpdateBannerSlides={onUpdateBannerSlides}
                    onUpdatePromos={onUpdatePromos}
                    onShowToast={onShowToast}
                  />
                  <AdminStorefrontTab
                    settings={storefrontSettings}
                    products={productsList}
                    onUpdateSettings={onUpdateStorefrontSettings}
                    onShowToast={onShowToast}
                  />
                </div>
              )}
                </m.div>
              </SectionErrorBoundary>
              </Suspense>
            </AdminNav>
            </Suspense>
            </SectionErrorBoundary>
            </UnsavedChangesContext.Provider>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>

      <ConfirmDialog
        isOpen={pendingAdminAction !== null}
        title={shownAdminAction.current?.type === 'close' ? 'Закрыть без сохранения?' : 'Перейти без сохранения?'}
        message={`Не сохранено: ${shownAdminAction.current?.labels.join(', ')}. Если ${
          shownAdminAction.current?.type === 'close' ? 'закрыть панель' : 'перейти в другой раздел'
        }, изменения пропадут.`}
        confirmLabel="Не сохранять"
        confirmIcon={<X className="w-4 h-4" />}
        cancelLabel="Вернуться к правкам"
        onConfirm={confirmPendingAdminAction}
        onClose={() => setPendingAdminAction(null)}
      />

    </>
  );
};
