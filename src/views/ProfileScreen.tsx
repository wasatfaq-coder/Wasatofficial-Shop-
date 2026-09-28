import React, { useState, useMemo, useEffect, useRef, lazy, Suspense, useTransition } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { motion, AnimatePresence } from 'motion/react';
import { AccountDataModal } from '../components/AccountDataModal';
import { currentStoreName, getStoreContacts, getStoreName, storeInitials, telHref } from '../utils/storeContacts';
import { GUEST_USER_PROFILE } from '../data/products';
import { FAQModal } from '../components/FAQModal';
import {
  User,
  ShoppingBag,
  Heart,
  Headphones,
  FileText,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Pencil,
  Check,
  X,
  Package,
  MapPin,
  CreditCard,
  Plus,
  Trash2,
  Truck,
  Clock,
  Copy,
  Phone,
  Sparkles,
  Ruler,
  ShieldCheck,
  Layers,
  Store,
  RefreshCw,
  AlertCircle,
  Navigation,
  MessageCircle,
  Send,
  Database,
  Scale,
  Scissors,
  Shirt,
  Info,
  Bike,
  Zap,
  Mail,
} from 'lucide-react';
import { NeumorphicSlider } from '../components/NeumorphicSlider';
import { calculateRussianPattern, RUSSIAN_SIZE_TABLE_ROWS } from '../utils/russianSizing';
import { useAuth } from '../context/AuthContext';
import { UserProfile, Order, CartItem, OrderStatusHistoryStep, ActiveTab, SavedAddress, Product, PromoCode, BannerSlide, ChatMessage, StorefrontSettings, SaveStorefrontSettings, DeliveryMethod, PickupPoint } from '../types';
import { formatAddress } from '../utils/addressFormat';
import type { AdminChatPayload } from '../components/admin/AdminSupportChatTab';
import type { ChatMessageChange } from '../utils/firebaseSync';
import { DeliveryTrackingMapModal } from '../components/DeliveryTrackingMapModal';
import { copyToClipboard } from '../utils/clipboard';
import { isNotificationSupported, requestNotificationPermission } from '../utils/pushNotifications';
import {
  getSynchronizedDeliveryStages,
  ORDER_STATUS_LABELS,
  isTransportCompanyDelivery,
  isRussianPostDelivery,
  isCourierDelivery,
  isPickupDelivery,
  getDefaultHistorySteps,
} from '../utils/deliveryStages';
import {
  loadLocalDeliveryMethods,
  saveLocalDeliveryMethods,
  loadLocalPickupPoints,
  saveLocalPickupPoints,
} from '../data/deliveryData';
import { getCategories } from '../utils/categories';
import { productImage } from '../utils/productImage';
import { NeumorphicSwitch } from '../components/NeumorphicSwitch';
import { useDialogA11y } from '../utils/useDialogA11y';
import { isAdminTab, type AdminNavCounts, type AdminTab } from '../components/admin/adminSections';
import { loadAdminNav, prefetchAdmin, prefetchAllAdminWhenIdle } from '../components/admin/adminLoaders';
import { UnsavedChangesContext, useUnsavedRegistry } from '../utils/unsavedChanges';
import { summarizeSupportThreads } from '../utils/supportThreads';

// The admin panel is a separate chunk (its sections, Base UI, charts): customers do not download it
const AdminAnalyticsTab = lazy(() => import('../components/admin/AdminAnalyticsTab').then((m) => ({ default: m.AdminAnalyticsTab })));
const AdminPromoConstructorTab = lazy(() => import('../components/admin/AdminPromoConstructorTab').then((m) => ({ default: m.AdminPromoConstructorTab })));
const AdminBannersTab = lazy(() => import('../components/admin/AdminBannersTab').then((m) => ({ default: m.AdminBannersTab })));
const AdminSupportInbox = lazy(() => import('../components/admin/AdminSupportInbox').then((m) => ({ default: m.AdminSupportInbox })));
const AdminInventoryTab = lazy(() => import('../components/admin/AdminInventoryTab').then((m) => ({ default: m.AdminInventoryTab })));
const AdminProductsTab = lazy(() => import('../components/admin/AdminProductsTab').then((m) => ({ default: m.AdminProductsTab })));
const AdminOrdersTab = lazy(() => import('../components/admin/AdminOrdersTab').then((m) => ({ default: m.AdminOrdersTab })));
const AdminCustomersTab = lazy(() => import('../components/admin/AdminCustomersTab').then((m) => ({ default: m.AdminCustomersTab })));
const AdminStorefrontTab = lazy(() => import('../components/admin/AdminStorefrontTab').then((m) => ({ default: m.AdminStorefrontTab })));
const BrandRenameCard = lazy(() => import('../components/admin/BrandRenameCard').then((m) => ({ default: m.BrandRenameCard })));
const AdminDeliveryTab = lazy(() => import('../components/admin/AdminDeliveryTab').then((m) => ({ default: m.AdminDeliveryTab })));
const AdminFaqTab = lazy(() => import('../components/admin/AdminFaqTab').then((m) => ({ default: m.AdminFaqTab })));
const AdminPaymentTab = lazy(() => import('../components/admin/AdminPaymentTab').then((m) => ({ default: m.AdminPaymentTab })));
const AdminCategoriesTab = lazy(() => import('../components/admin/AdminCategoriesTab').then((m) => ({ default: m.AdminCategoriesTab })));
const AdminNav = lazy(() => loadAdminNav().then((m) => ({ default: m.AdminNav })));

interface ProfileScreenProps {
  profile: UserProfile;
  allUsers?: UserProfile[];
  orders: Order[];
  products?: Product[];
  favoritesCount: number;
  recentlyViewed?: Product[];
  favorites?: string[];
  onSelectProduct?: (product: Product) => void;
  onToggleFavorite?: (product: Product, e: React.MouseEvent) => void;
  onUpdateProfile: (updated: UserProfile) => void;
  setActiveTab: (tab: ActiveTab) => void;
  onRepeatOrder?: (items: CartItem[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenSupportChat?: () => void;
  onUpdateProducts?: (products: Product[]) => void;
  onUpdateOrders?: (orders: Order[]) => void;
  promos?: PromoCode[];
  onUpdatePromos?: (promos: PromoCode[]) => void;
  bannerSlides?: BannerSlide[];
  onUpdateBannerSlides?: (banners: BannerSlide[]) => void;
  chatMessages?: ChatMessage[];
  onSendMessageAsAdmin?: (
    text: string,
    imageUrl?: string,
    promoCard?: ChatMessage['promoCard'],
    tag?: ChatMessage['tag'],
    isInternalNote?: boolean,
    productCard?: ChatMessage['productCard'],
    orderStatusUpdate?: ChatMessage['orderStatusUpdate'],
    thread?: Pick<ChatMessage, 'threadId' | 'threadName'>
  ) => void;
  /** undefined: whole chat, null: legacy messages without a thread, string: one customer's thread */
  onClearChat?: (threadId?: string | null) => void;
  /** Staff: edit, «удалить у себя» / «у всех» — any message, any time */
  onChangeChatMessage?: (change: ChatMessageChange) => Promise<boolean>;
  storefrontSettings?: StorefrontSettings;
  onUpdateStorefrontSettings?: SaveStorefrontSettings;
  onSyncFirebase?: () => Promise<void>;
  deliveryMethods?: DeliveryMethod[];
  onUpdateDeliveryMethods?: (methods: DeliveryMethod[]) => void;
  pickupPoints?: PickupPoint[];
  onUpdatePickupPoints?: (points: PickupPoint[]) => void;
}

/** While a section of the admin panel (a separate chunk) is loading */
const AdminLoading: React.FC = () => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-[#4E5C70]">
    <RefreshCw className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
    Загрузка раздела…
  </div>
);

/** Admin panel section for this browser session (internal key, not renamed) */
const ADMIN_TAB_STORAGE_KEY = 'manstyle_admin_tab';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  allUsers = [],
  orders,
  products = [],
  favoritesCount,
  recentlyViewed = [],
  favorites = [],
  onSelectProduct,
  onToggleFavorite,
  onUpdateProfile,
  setActiveTab,
  onRepeatOrder,
  onShowToast,
  onOpenSupportChat,
  onUpdateProducts,
  onUpdateOrders,
  promos = [],
  onUpdatePromos,
  bannerSlides = [],
  onUpdateBannerSlides,
  chatMessages = [],
  onSendMessageAsAdmin,
  onClearChat,
  onChangeChatMessage,
  storefrontSettings,
  onUpdateStorefrontSettings,
  onSyncFirebase,
  deliveryMethods,
  onUpdateDeliveryMethods,
  pickupPoints,
  onUpdatePickupPoints,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [notifications, setNotifications] = useState(profile.notificationsEnabled);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'orders' | 'addresses' | 'support' | 'faq' | 'admin' | 'security' | null
  >(null);
  const addressesDialog = useDialogA11y(activeModal === 'addresses', () => setActiveModal(null));
  const ordersDialog = useDialogA11y(activeModal === 'orders', () => setActiveModal(null));
  const supportDialog = useDialogA11y(activeModal === 'support', () => setActiveModal(null));

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

  // Keep local state in sync if prop changes
  React.useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setPhone(profile.phone);
    setNotifications(profile.notificationsEnabled);
  }, [profile.name, profile.email, profile.phone, profile.notificationsEnabled]);

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
    if (onUpdateDeliveryMethods) onUpdateDeliveryMethods(updated);
  };

  const handleUpdatePickupPointsList = (updated: PickupPoint[]) => {
    setLocalPickupPoints(updated);
    saveLocalPickupPoints(updated);
    if (onUpdatePickupPoints) onUpdatePickupPoints(updated);
  };

  const handleUpdatePromosList = (updated: PromoCode[]) => {
    setLocalPromos(updated);
    if (onUpdatePromos) onUpdatePromos(updated);
  };

  const handleUpdateBannersList = (updated: BannerSlide[]) => {
    setLocalBanners(updated);
    if (onUpdateBannerSlides) onUpdateBannerSlides(updated);
  };

  const handleUpdateProductsList = (updated: Product[]) => {
    setProductsList(updated);
    if (onUpdateProducts) onUpdateProducts(updated);
  };

  const handleUpdateOrders = (updated: Order[]) => {
    if (onUpdateOrders) onUpdateOrders(updated);
  };

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

  // Admin Authentication & Credentials State
  const { currentUser, loginWithGoogle, logoutUser, isAdmin: isFirebaseAdmin } = useAuth();
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);


  const handleOpenAdminPanel = () => {
    if (!isFirebaseAdmin) {
      onShowToast(
        currentUser
          ? 'У этого аккаунта нет прав администратора'
          : 'Войдите через Google под аккаунтом администратора',
        'error'
      );
      return;
    }
    // Access is the Google admin account itself; firestore.rules enforce it on every write
    prefetchAdmin(adminTab);
    setActiveModal('admin');
  };

  const handleTriggerSync = async () => {
    if (onSyncFirebase) {
      setIsSyncingFirebase(true);
      try {
        await onSyncFirebase();
      } finally {
        setIsSyncingFirebase(false);
      }
    }
  };

  const handleGoogleAuthClick = async () => {
    setIsGoogleSigningIn(true);
    try {
      const user = await loginWithGoogle();
      if (user) {
        onShowToast(`Вы успешно вошли: ${user.displayName || user.email}`, 'success');
      }
    } catch (err: unknown) {
      console.error('Google Auth Error:', err);
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'auth/popup-blocked') {
        onShowToast('Окно входа заблокировано браузером. Разрешите всплывающие окна или откройте сайт в новой вкладке.', 'error');
      } else if (errCode === 'auth/popup-closed-by-user') {
        onShowToast('Окно авторизации закрыто', 'info');
      } else {
        onShowToast('Ошибка авторизации через Google', 'error');
      }
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleGoogleLogoutClick = async () => {
    try {
      await logoutUser();
      onShowToast('Вы вышли из учетной записи Google', 'info');
    } catch (err) {
      console.error('Google Logout Error:', err);
      onShowToast('Ошибка при выходе из аккаунта', 'error');
    }
  };


  // Admin panel section: kept for the session, so reopening the panel returns to it
  const [adminTab, setAdminTab] = useState<AdminTab>(() => {
    try {
      const saved = sessionStorage.getItem(ADMIN_TAB_STORAGE_KEY);
      return isAdminTab(saved) ? saved : 'analytics';
    } catch {
      return 'analytics';
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_TAB_STORAGE_KEY, adminTab);
    } catch {}
  }, [adminTab]);
  const [supportTargetOrderId, setSupportTargetOrderId] = useState<string | null>(null);
  // Unsaved edits in the panel's forms: closing or switching the section asks first
  const { registry: unsavedRegistry, unsavedLabels, hasUnsaved } = useUnsavedRegistry();
  type PendingAdminAction = ({ type: 'close' } | { type: 'tab'; tab: AdminTab }) & { labels: string[] };
  const [pendingAdminAction, setPendingAdminAction] = useState<PendingAdminAction | null>(null);
  // The question keeps its text while it fades out
  const shownAdminAction = useRef<PendingAdminAction | null>(null);
  if (pendingAdminAction) shownAdminAction.current = pendingAdminAction;
  const requestCloseAdmin = () => {
    if (hasUnsaved) setPendingAdminAction({ type: 'close', labels: unsavedLabels() });
    else setActiveModal(null);
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
    if (action?.type === 'close') setActiveModal(null);
    else if (action?.type === 'tab') switchAdminTab(action.tab);
  };
  const isAdminOpen = activeModal === 'admin' && isFirebaseAdmin;
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
  const adminCounts = useMemo<AdminNavCounts>(() => {
    if (!isAdminOpen) return {};
    const newOrders = orders.filter((o) => o.status === 'accepted' && !o.isCancelled).length;
    const awaiting = summarizeSupportThreads(localChatMessages, orders).filter((t) => t.awaitingReply).length;
    return {
      orders: { value: newOrders, label: 'новых заказов' },
      support: { value: awaiting, label: 'ждут ответа' },
    };
  }, [isAdminOpen, orders, localChatMessages]);

  // Selected order IDs for detailed tracking & interactive delivery map
  const [selectedOrderIdForTracking, setSelectedOrderIdForTracking] = useState<string | null>(null);
  const trackingDialog = useDialogA11y(Boolean(selectedOrderIdForTracking), () => setSelectedOrderIdForTracking(null));
  const [selectedOrderIdForMap, setSelectedOrderIdForMap] = useState<string | null>(null);

  // Derive active order reactively from orders prop
  const selectedOrderForTracking = useMemo(
    () => (selectedOrderIdForTracking ? orders.find((o) => o.id === selectedOrderIdForTracking) || null : null),
    [orders, selectedOrderIdForTracking]
  );

  const selectedOrderForMap = useMemo(
    () => (selectedOrderIdForMap ? orders.find((o) => o.id === selectedOrderIdForMap) || null : null),
    [orders, selectedOrderIdForMap]
  );

  // Listen for open order tracking events (from Push Notification click)
  React.useEffect(() => {
    const handleOpenTracking = (e: Event) => {
      const customEvent = e as CustomEvent<{ orderId?: string }>;
      if (customEvent.detail?.orderId) {
        setSelectedOrderIdForTracking(customEvent.detail.orderId);
      }
    };
    window.addEventListener('manstyle_open_order_tracking', handleOpenTracking);
    return () => window.removeEventListener('manstyle_open_order_tracking', handleOpenTracking);
  }, []);

  // Address edit modal state
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const addressFormDialog = useDialogA11y(isAddingAddress, () => setIsAddingAddress(false));
  const [addrTitle, setAddrTitle] = useState('Дом');
  const [addrCity, setAddrCity] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrHouse, setAddrHouse] = useState('');
  const [addrEntrance, setAddrEntrance] = useState('');
  const [addrFloor, setAddrFloor] = useState('');
  const [addrApartment, setAddrApartment] = useState('');
  const [addrIntercom, setAddrIntercom] = useState('');
  const [addrPostal, setAddrPostal] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);

  // Body measurements modal state
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(false);
  const measurementsDialog = useDialogA11y(isEditingMeasurements, () => setIsEditingMeasurements(false));
  const [showGostTable, setShowGostTable] = useState(false);
  const [measHeight, setMeasHeight] = useState(profile.bodyMeasurements?.height ?? 184);
  const [measWeight, setMeasWeight] = useState(profile.bodyMeasurements?.weight ?? 94);
  const [measChest, setMeasChest] = useState(profile.bodyMeasurements?.chest ?? 104);
  const [measWaist, setMeasWaist] = useState(profile.bodyMeasurements?.waist ?? 95);
  const [measHips, setMeasHips] = useState(profile.bodyMeasurements?.hips ?? 98);
  const [measFit, setMeasFit] = useState<'tight' | 'regular' | 'loose'>(
    profile.bodyMeasurements?.fitPreference ?? 'regular'
  );

  // Synchronize state when profile measurements change
  React.useEffect(() => {
    if (profile.bodyMeasurements) {
      if (profile.bodyMeasurements.height !== undefined) setMeasHeight(profile.bodyMeasurements.height);
      if (profile.bodyMeasurements.weight !== undefined) setMeasWeight(profile.bodyMeasurements.weight);
      if (profile.bodyMeasurements.chest !== undefined) setMeasChest(profile.bodyMeasurements.chest);
      if (profile.bodyMeasurements.waist !== undefined) setMeasWaist(profile.bodyMeasurements.waist);
      if (profile.bodyMeasurements.hips !== undefined) setMeasHips(profile.bodyMeasurements.hips);
      if (profile.bodyMeasurements.fitPreference !== undefined) setMeasFit(profile.bodyMeasurements.fitPreference);
    }
  }, [profile.bodyMeasurements]);

  // Dynamic real-time calculation of Russian sizing pattern (ГОСТ 31399-2009)
  const currentRussianPattern = calculateRussianPattern(
    measHeight,
    measWeight,
    measChest,
    measWaist,
    measHips,
    measFit
  );

  // Saved profile Russian pattern for the summary card
  const profileRussianPattern = calculateRussianPattern(
    profile.bodyMeasurements?.height ?? 184,
    profile.bodyMeasurements?.weight ?? 94,
    profile.bodyMeasurements?.chest ?? 104,
    profile.bodyMeasurements?.waist ?? 95,
    profile.bodyMeasurements?.hips ?? 98,
    profile.bodyMeasurements?.fitPreference ?? 'regular'
  );

  const handleSaveMeasurements = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...profile,
      bodyMeasurements: {
        height: measHeight,
        weight: measWeight,
        chest: measChest,
        waist: measWaist,
        hips: measHips,
        fitPreference: measFit,
        preferredSize: currentRussianPattern.topInternationalSize,
        russianSizeTop: currentRussianPattern.topSizeLabel,
        russianSizeBottom: currentRussianPattern.bottomSizeLabel,
        heightGroup: currentRussianPattern.heightGroupLabel,
        bodyType: currentRussianPattern.fullnessLabel,
      },
    });
    setIsEditingMeasurements(false);
    onShowToast(`Параметры сохранены: ${currentRussianPattern.topSizeLabel}, ${currentRussianPattern.heightRange}`, 'success');
  };

  // Filter for orders modal
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...profile,
      name,
      email,
      phone,
      notificationsEnabled: notifications,
    });
    setIsEditingProfile(false);
    onShowToast('Профиль успешно обновлен', 'success');
  };

  const toggleNotifications = async () => {
    const nextVal = !notifications;
    if (nextVal) {
      if (isNotificationSupported()) {
        try {
          const perm = await requestNotificationPermission();
          if (perm === 'granted') {
            setNotifications(true);
            onUpdateProfile({
              ...profile,
              notificationsEnabled: true,
            });
            onShowToast('Push-уведомления включены! Статусы заказов будут приходить на устройство', 'success');
            try {
              new Notification(currentStoreName(), {
                body: 'Уведомления успешно подключены!',
                icon: '/favicon.ico',
              });
            } catch {}
            return;
          } else if (perm === 'denied') {
            onShowToast('Уведомления заблокированы в настройках браузера', 'info');
            setNotifications(false);
            onUpdateProfile({
              ...profile,
              notificationsEnabled: false,
            });
            return;
          }
        } catch {
          // sandbox fallback
        }
      }
    }
    setNotifications(nextVal);
    onUpdateProfile({
      ...profile,
      notificationsEnabled: nextVal,
    });
    onShowToast(nextVal ? 'Уведомления включены' : 'Уведомления отключены', 'info');
  };

  const handleFullLogout = async () => {
    try {
      if (currentUser) {
        await logoutUser();
      }
    } catch (e) {
      console.warn('Logout error:', e);
    }
    try {
      localStorage.removeItem('manstyle_user_profile');
    } catch {}
    onUpdateProfile(GUEST_USER_PROFILE);
    onShowToast('Вы успешно вышли из аккаунта', 'info');
  };

  // --- Address Handlers ---
  const handleOpenAddAddress = () => {
    setEditingAddress(null);
    setAddrTitle('Дом');
    setAddrCity('');
    setAddrStreet('');
    setAddrHouse('');
    setAddrEntrance('');
    setAddrFloor('');
    setAddrApartment('');
    setAddrIntercom('');
    setAddrPostal('');
    setAddrIsDefault(profile.savedAddresses.length === 0);
    setIsAddingAddress(true);
  };

  const handleOpenEditAddress = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setAddrTitle(addr.title);
    setAddrCity(addr.city);
    setAddrStreet(addr.street);
    setAddrHouse(addr.house || '');
    setAddrEntrance(addr.entrance || '');
    setAddrFloor(addr.floor || '');
    setAddrApartment(addr.apartment || '');
    setAddrIntercom(addr.intercom || '');
    setAddrPostal(addr.postalCode || '');
    setAddrIsDefault(addr.isDefault || false);
    setIsAddingAddress(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrStreet.trim()) {
      onShowToast('Укажите название улицы', 'error');
      return;
    }
    if (!addrHouse.trim() && !/\b(д\.|дом|\d)/i.test(addrStreet)) {
      onShowToast('Пожалуйста, укажите номер дома', 'error');
      return;
    }

    let updatedAddresses = [...profile.savedAddresses];

    if (editingAddress) {
      // Edit
      updatedAddresses = updatedAddresses.map((a) => {
        if (a.id === editingAddress.id) {
          return {
            ...a,
            title: addrTitle.trim() || 'Адрес',
            city: addrCity.trim(),
            street: addrStreet.trim(),
            house: addrHouse.trim(),
            entrance: addrEntrance.trim(),
            floor: addrFloor.trim(),
            apartment: addrApartment.trim(),
            intercom: addrIntercom.trim(),
            postalCode: addrPostal.trim(),
            isDefault: addrIsDefault,
          };
        }
        return addrIsDefault ? { ...a, isDefault: false } : a;
      });
    } else {
      // New
      const newAddr: SavedAddress = {
        id: `addr-${Date.now()}`,
        title: addrTitle.trim() || 'Адрес',
        city: addrCity.trim(),
        street: addrStreet.trim(),
        house: addrHouse.trim(),
        entrance: addrEntrance.trim(),
        floor: addrFloor.trim(),
        apartment: addrApartment.trim(),
        intercom: addrIntercom.trim(),
        postalCode: addrPostal.trim(),
        isDefault: addrIsDefault || updatedAddresses.length === 0,
      };
      if (addrIsDefault) {
        updatedAddresses = updatedAddresses.map((a) => ({ ...a, isDefault: false }));
      }
      updatedAddresses.push(newAddr);
    }

    onUpdateProfile({ ...profile, savedAddresses: updatedAddresses });
    setIsAddingAddress(false);
    onShowToast(editingAddress ? 'Адрес изменен' : 'Адрес успешно добавлен', 'success');
  };

  const handleDeleteAddress = (id: string) => {
    const updated = profile.savedAddresses.filter((a) => a.id !== id);
    onUpdateProfile({ ...profile, savedAddresses: updated });
    onShowToast('Адрес удален', 'info');
  };

  const handleSetDefaultAddress = (id: string) => {
    const updated = profile.savedAddresses.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    onUpdateProfile({ ...profile, savedAddresses: updated });
    onShowToast('Основной адрес сохранен', 'success');
  };

  // Helper for tracking progress % and stage colors
  const getOrderStatusProgress = (status: Order['status'], isCancelled?: boolean) => {
    if (isCancelled) {
      return { percent: 0, label: 'Отменен', color: 'bg-danger', text: 'text-danger' };
    }
    switch (status) {
      case 'accepted':
        return { percent: 20, label: ORDER_STATUS_LABELS.accepted, color: 'bg-accent', text: 'text-accent-strong' };
      case 'assembling':
        return { percent: 45, label: ORDER_STATUS_LABELS.assembling, color: 'bg-warning', text: 'text-warning' };
      case 'in_transit':
        return { percent: 75, label: ORDER_STATUS_LABELS.in_transit, color: 'bg-accent', text: 'text-accent-strong' };
      case 'ready':
        return { percent: 90, label: ORDER_STATUS_LABELS.ready, color: 'bg-success', text: 'text-success' };
      case 'delivered':
        return { percent: 100, label: ORDER_STATUS_LABELS.delivered, color: 'bg-success', text: 'text-success' };
      default:
        return { percent: 10, label: 'В обработке', color: 'bg-accent', text: 'text-accent-strong' };
    }
  };

  const filteredOrders = orders.filter((ord) => {
    if (orderFilter === 'active') return !ord.isCancelled && ord.status !== 'delivered';
    if (orderFilter === 'completed') return ord.isCancelled || ord.status === 'delivered';
    return true;
  });

  // Storefront & Boutique settings values with defaults
  const storeName = getStoreName(storefrontSettings);
  const storeSlogan = (storefrontSettings?.storeSlogan ?? '').trim();
  // Demo template contacts are never shown to customers (see storeContacts.ts)
  const {
    phone: storePhone,
    email: storeEmail,
    telegram: storeTelegram,
    pickupAddress,
  } = getStoreContacts(storefrontSettings);
  const workingHours = (storefrontSettings?.workingHours ?? '').trim();

  return (
    <div className="space-y-5 pb-28 lg:pb-10 animate-in fade-in duration-300">
      {/* Profile Card Header */}
      <div className="neu-flat rounded-3xl p-3.5">
        {!isEditingProfile ? (
          <div className="neu-inset rounded-2xl p-4 flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-full neu-flat p-1 shrink-0 overflow-hidden">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center text-accent text-xl font-black">
                  {profile.name?.trim() ? profile.name.trim()[0].toUpperCase() : <User className="w-7 h-7" />}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-lg font-bold text-[#2D3A4E] leading-tight truncate">
                {profile.name?.trim() || 'Гость'}
              </h2>
              <p className={`text-xs text-[#4E5C70] ${profile.email ? 'truncate' : 'leading-snug'}`}>
                {profile.email || 'Заполните профиль, чтобы оформлять заказы быстрее'}
              </p>

              <button
                onClick={() => setIsEditingProfile(true)}
                className="neu-button rounded-full px-3 py-1 text-[11px] font-bold text-[#2D3A4E] hover:text-accent inline-flex items-center gap-1.5 mt-1 cursor-pointer transition-transform"
              >
                <Pencil className="w-3 h-3 text-accent" />
                <span>Редактировать</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="neu-inset rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/60">
              <span className="text-xs font-bold text-[#2D3A4E]">Редактирование профиля</span>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="text-[#4E5C70] hover:text-[#2D3A4E]"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя"
                className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E]"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E]"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон"
                className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E]"
              />
            </div>

            <button
              type="submit"
              className="w-full neu-button-accent text-white rounded-xl py-2.5 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить</span>
            </button>
          </form>
        )}
      </div>

      {/* Section 1: Мои заказы */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Мои заказы
        </h3>
        <div className="neu-flat rounded-3xl p-3">
          <button
            onClick={() => setActiveModal('orders')}
            className="w-full p-3.5 neu-button rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#2D3A4E]">Заказы и трекинг</p>
                  {orders.some((o) => o.status !== 'delivered') && (
                    <span className="neu-inset-deep neu-inset-deep-animated text-accent font-extrabold text-[11px] px-2.5 py-0.5 rounded-full border border-accent/30">
                      Активен
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#4E5C70]">Отслеживание, статус и детализация ({orders.length})</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70]" />
          </button>
        </div>
      </div>

      {/* Account & sign-in (cloud sync details are shown to admins only) */}
      <div className="neu-flat rounded-3xl p-3.5 space-y-3">
        <div className="neu-inset rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                {isFirebaseAdmin ? <Database className="w-5 h-5 stroke-[2.2]" /> : <User className="w-5 h-5 stroke-[2.2]" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-[#2D3A4E]">{isFirebaseAdmin ? 'Синхронизация данных' : 'Аккаунт'}</h3>
                  {isFirebaseAdmin && (
                    <span className="neu-flat-sm px-2 py-0.5 rounded-full text-[11px] font-black text-success flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      База данных подключена
                    </span>
                  )}
                  {isFirebaseAdmin && (
                    <span className="neu-fill-accent text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Админ
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#4E5C70]">
                  {isFirebaseAdmin
                    ? 'Каталог, заказы, акции и чат хранятся в облаке'
                    : 'Заказы, адреса и переписка сохраняются на всех ваших устройствах'}
                </p>
              </div>
            </div>

            {isFirebaseAdmin && (
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncingFirebase}
              title="Принудительно синхронизировать все данные с облаком"
              className="neu-button rounded-xl p-2.5 text-accent hover:scale-105 transition-all cursor-pointer shrink-0 disabled:opacity-60"
              aria-label="Принудительно синхронизировать все данные с облаком"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingFirebase ? 'animate-spin text-accent' : ''}`} />
            </button>
            )}
          </div>

          {/* User Auth Status Details */}
          {currentUser ? (
            <div className="p-2.5 rounded-xl bg-[#BAC5D5]/20 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || ''}
                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/60"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full neu-flat-sm flex items-center justify-center font-bold text-accent shrink-0 text-xs">
                    {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-[#2D3A4E] truncate">
                    {currentUser.displayName || 'Пользователь Google'}
                  </p>
                  <p className="text-[11px] text-[#4E5C70] truncate">{currentUser.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogoutClick}
                className="neu-button-danger px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 transition-transform"
              >
                <LogOut className="w-3 h-3" />
                <span>Выйти</span>
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-[#BAC5D5]/20 space-y-2 text-xs">
              <p className="text-[#4E5C70] text-[11px] leading-relaxed">
                Войдите через Google, чтобы видеть историю заказов и переписку с поддержкой на любом устройстве:
              </p>
              <button
                type="button"
                onClick={handleGoogleAuthClick}
                disabled={isGoogleSigningIn}
                className="w-full neu-button rounded-xl py-2 px-3 flex items-center justify-center gap-2 font-bold text-[#2D3A4E] hover:text-accent transition-all text-xs cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isGoogleSigningIn ? 'Вход…' : 'Войти через Google'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Адреса доставки (Saved Addresses) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Адреса доставки
          </h3>
          <button
            onClick={() => setActiveModal('addresses')}
            className="neu-button px-2.5 py-1 rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 cursor-pointer hover:text-[#2D3A4E] transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Управление ({profile.savedAddresses.length})</span>
          </button>
        </div>

        <div className="neu-flat rounded-3xl p-4 space-y-2.5">
          {profile.savedAddresses.length === 0 ? (
            <div className="text-center py-3 text-xs text-[#4E5C70]">
              Сохраненных адресов нет.{' '}
              <button
                onClick={handleOpenAddAddress}
                className="text-accent font-bold underline ml-1 cursor-pointer"
              >
                Добавить адрес
              </button>
            </div>
          ) : (
            profile.savedAddresses.map((addr) => (
              <div
                key={addr.id}
                className="neu-inset rounded-2xl p-3 flex items-center justify-between gap-2"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#2D3A4E]">{addr.title}</span>
                      {addr.isDefault && (
                        <span className="text-[11px] font-bold text-success neu-inset px-2 py-0.5 rounded-full">
                          Основной
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#4E5C70] truncate">
                      г. {addr.city}, {addr.street} {addr.apartment ? `, ${addr.apartment}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditAddress(addr)}
                    className="p-2 neu-button rounded-xl text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                    title="Редактировать адрес"
                    aria-label="Редактировать адрес"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            onClick={handleOpenAddAddress}
            className="w-full py-3 neu-button rounded-2xl text-xs font-bold text-accent flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Добавить новый адрес</span>
          </button>
        </div>
      </div>

      {/* Section: Параметры фигуры & Лекало РФ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Мерки профиля и лекало РФ
          </h3>
          <button
            onClick={() => {
              if (profile.bodyMeasurements) {
                setMeasHeight(profile.bodyMeasurements.height ?? 184);
                setMeasWeight(profile.bodyMeasurements.weight ?? 94);
                setMeasChest(profile.bodyMeasurements.chest ?? 104);
                setMeasWaist(profile.bodyMeasurements.waist ?? 95);
                setMeasHips(profile.bodyMeasurements.hips ?? 98);
                setMeasFit(profile.bodyMeasurements.fitPreference ?? 'regular');
              }
              setIsEditingMeasurements(true);
            }}
            className="neu-button px-2.5 py-1 rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 cursor-pointer hover:text-[#2D3A4E] transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Изменить</span>
          </button>
        </div>

        {profile.bodyMeasurements ? (
        <div className="neu-inset rounded-3xl p-4 space-y-3.5 border border-white/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                <Ruler className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#2D3A4E] truncate">
                  Российское размерное лекало
                </p>
                <p className="text-[11px] text-[#4E5C70] font-medium truncate">
                  {profileRussianPattern.recommendedFit}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[11px] font-bold text-[#4E5C70] block">Стандартный размер</span>
              <span className="text-sm font-black text-accent neu-inset px-2 py-0.5 rounded-lg inline-block">
                {profileRussianPattern.topSizeLabel}
              </span>
            </div>
          </div>

          {/* Key Russian Pattern Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Верхняя одежда</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.topSizeLabel}
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                ПОГ: {Math.round((profile.bodyMeasurements?.chest ?? 104) / 2)} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Брюки / Джинсы</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.bottomSizeLabel}
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                Пояс: {profile.bodyMeasurements?.waist ?? 95} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Ростовка РФ</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.heightGroupNumber}-я группа
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                {profileRussianPattern.heightRange}
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Полнота / ИМТ</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.fullnessGroup}-я полнота
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                ИМТ: {profileRussianPattern.bmi}
              </span>
            </div>
          </div>

          {/* Measurements summary strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#BAC5D5]/40 text-[11px] font-bold text-[#4E5C70]">
            <div>
              Мерки тела:{' '}
              <span className="text-[#2D3A4E] font-black">
                {profile.bodyMeasurements?.height ?? 184} см • {profile.bodyMeasurements?.weight ?? 94} кг
              </span>
            </div>
            <div>
              ОГ / ОТ / ОБ:{' '}
              <span className="text-[#2D3A4E] font-black">
                {profile.bodyMeasurements?.chest ?? 104} • {profile.bodyMeasurements?.waist ?? 95} • {profile.bodyMeasurements?.hips ?? 98} см
              </span>
            </div>
          </div>
        </div>
        ) : (
          <div className="neu-inset rounded-3xl p-4 border border-white/60 text-center space-y-1">
            <p className="text-xs font-bold text-[#2D3A4E]">Мерки еще не указаны</p>
            <p className="text-[11px] text-[#4E5C70]">
              Нажмите «Изменить» и укажите рост, вес и обхваты — подберем размер по российским лекалам.
            </p>
          </div>
        )}
      </div>

      {/* Section 4: Избранное */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Избранное
        </h3>
        <div className="neu-flat rounded-3xl p-3">
          <button
            onClick={() => setActiveTab('favorites')}
            className="w-full p-3.5 neu-button rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <Heart className="w-5 h-5 fill-accent/20" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Избранные товары</p>
                <p className="text-xs text-[#4E5C70]">
                  Сохраненные модели ({favoritesCount})
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70]" />
          </button>
        </div>
      </div>

      {/* Store contacts: only what the owner filled in. The chat is in «Поддержка» below */}
      {(pickupAddress || workingHours || storePhone || storeTelegram) && (
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Контакты магазина
        </h3>
        <div className="neu-flat rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#2D3A4E]">{storeName}</p>
              {storeSlogan && <p className="text-xs text-[#4E5C70]">{storeSlogan}</p>}
            </div>
          </div>

          {(pickupAddress || workingHours) && (
            <div className="neu-inset rounded-2xl p-3 space-y-1.5 text-xs text-[#2D3A4E]">
              {pickupAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{pickupAddress}</span>
                </div>
              )}
              {workingHours && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#4E5C70] shrink-0" />
                  <span className="text-[#4E5C70]">{workingHours}</span>
                </div>
              )}
            </div>
          )}

          {(storePhone || storeTelegram) && (
            <div className="flex items-center gap-2 flex-wrap">
              {storePhone && (
                <a
                  href={telHref(storePhone)}
                  className="flex-1 min-w-[150px] py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center justify-center gap-1.5 whitespace-nowrap transition-all"
                >
                  <Phone className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>{storePhone}</span>
                </a>
              )}
              {storeTelegram && (
                <a
                  href={`https://t.me/${storeTelegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-[150px] py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-accent flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span>{storeTelegram}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Section 5: Поддержка */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Поддержка
        </h3>
        <div className="neu-flat rounded-3xl p-3 space-y-2">
          <button
            onClick={() => {
              if (onOpenSupportChat) {
                onOpenSupportChat();
              } else {
                setActiveModal('support');
              }
            }}
            className="w-full p-3.5 neu-button rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Служба поддержки</p>
                <p className="text-xs text-[#4E5C70]">Онлайн-чат с магазином</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70]" />
          </button>

          <button
            onClick={() => setActiveModal('faq')}
            className="w-full p-3.5 neu-button rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Часто задаваемые вопросы</p>
                <p className="text-xs text-[#4E5C70]">Возврат, гарантия, доставка</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70]" />
          </button>
        </div>
      </div>

      {/* Section 6: Настройки */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Настройки
        </h3>
        <div className="neu-flat rounded-3xl p-3 space-y-2">
          {/* Admin Panel Item Trigger */}
          {/* Admin entry is only shown to verified admins (Google sign-in) */}
          {isFirebaseAdmin && (
          <button
            id="admin-panel-trigger-btn"
            type="button"
            onClick={handleOpenAdminPanel}
            onPointerEnter={() => prefetchAdmin(adminTab)}
            onPointerDown={() => prefetchAdmin(adminTab)}
            onFocus={() => prefetchAdmin(adminTab)}
            className="w-full p-3.5 neu-button rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-accent shrink-0 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-[#2D3A4E]">Панель администратора</p>
                  <span className="neu-fill-accent text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Управление
                  </span>
                  {isFirebaseAdmin ? (
                    <span className="neu-button px-2 py-0.5 rounded-full text-[11px] font-black text-success flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Доступ открыт
                    </span>
                  ) : (
                    <span className="neu-inset px-2 py-0.5 rounded-full text-[11px] font-bold text-[#4E5C70] flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Требуется вход Google
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#4E5C70]">Модули каталога, заказов, акций и настроек витрины</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-[#4E5C70] group-hover:text-accent transition-colors" />
            </div>
          </button>
          )}

          <div className="p-3.5 neu-inset rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Уведомления</p>
                <p className="text-xs text-[#4E5C70]">Push о статусе заказов</p>
              </div>
            </div>

            <NeumorphicSwitch
              checked={notifications}
              onChange={() => toggleNotifications()}
              label="Уведомления о статусе заказов"
            />
          </div>

          <button
            onClick={() => setActiveModal('security')}
            className="w-full p-3.5 neu-button rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Аккаунт и данные</p>
                <p className="text-xs text-[#4E5C70]">Вход через Google, выгрузка данных</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70]" />
          </button>
        </div>
      </div>

      {/* Logout Action Button (only for a signed-in customer) */}
      {currentUser && (
      <button
        onClick={handleFullLogout}
        className="w-full neu-button-danger rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm active:scale-[0.99] transition-all cursor-pointer border-transparent"
      >
        <LogOut className="w-5 h-5 stroke-[2]" />
        <span>Выйти из аккаунта</span>
      </button>
      )}

      {/* ================= MODAL: ORDER HISTORY & TRACKING ================= */}
      {activeModal === 'orders' && (
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
                  <p className="text-[11px] text-[#4E5C70] font-medium">Все ваши заказы в одном месте</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
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
                  <p className="text-[11px] text-[#4E5C70]">Сделайте первый заказ в нашем каталоге!</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredOrders.map((ord) => {
                    const statusInfo = getOrderStatusProgress(ord.status, ord.isCancelled);
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
                            <span className="text-sm font-black text-[#2D3A4E] whitespace-nowrap">№ {ord.id}</span>
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
                          <p className="text-[11px] text-[#4E5C70] font-medium">{ord.date}</p>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-black text-[#2D3A4E]">
                            {(ord.totalPrice ?? 0).toLocaleString('ru-RU')} ₽
                          </span>
                          <p className="text-[11px] text-[#4E5C70]">
                            {ord.items.reduce((a, b) => a + b.quantity, 0)} тов.
                          </p>
                        </div>
                      </div>

                      {/* Mini visual status progress line */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-[#4E5C70]">
                          <span>Прогресс доставки</span>
                          <span className="text-accent font-black">{statusInfo.percent}%</span>
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
                        const isTK = isTransportCompanyDelivery(ord.deliveryMethod, ord.trackingCompany);
                        const isPickup = isPickupDelivery(ord.deliveryMethod);
                        const isCourier = isCourierDelivery(ord.deliveryMethod, ord.trackingCompany);
                        const isExpress = (ord.deliveryMethod || '').toLowerCase().includes('экспресс') || (ord.deliveryMethod || '').toLowerCase().includes('express');

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
                                  ) : isExpress ? (
                                    <Zap className="w-3 h-3 text-warning" />
                                  ) : (
                                    <Bike className="w-3 h-3 text-accent" />
                                  )}
                                  {ord.deliveryMethod || 'Курьерская доставка'}
                                </span>
                                {isCourier && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderIdForMap(ord.id);
                                    }}
                                    className="p-1 px-2 neu-button rounded-lg text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                    title="Открыть карту перемещения курьера"
                                  >
                                    <Navigation className="w-3 h-3" />
                                    <span>Карта</span>
                                  </button>
                                )}
                              </div>
                            )}

                            <span className="text-[11px] text-[#4E5C70] font-medium">
                              {isPost ? 'Почтовое отправление' : isTK ? (ord.deliveryMethod || 'ТК') : isPickup ? 'Самовывоз' : 'Курьерская доставка'}
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
                              src={productImage(it.product)}
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
                                setActiveModal(null);
                                setSelectedOrderIdForMap(null);
                                onOpenSupportChat();
                                onShowToast(`Чат заботы открыт по заказу #${ord.id}`, 'info');
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

      {/* ================= DETAILED ORDER TRACKING MODAL ================= */}
      {selectedOrderForTracking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={trackingDialog.ref}
            {...trackingDialog.props}
            className="neu-modal rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col border border-white/80 text-[#2D3A4E] overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#BAC5D5]/50 shrink-0 bg-[#E3E8EF]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 id={trackingDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">
                    Заказ № {selectedOrderForTracking.id}
                  </h3>
                  <span className="text-[11px] font-extrabold text-accent neu-inset px-2.5 py-0.5 rounded-full">
                    Трекинг
                  </span>
                </div>
                <p className="text-[11px] text-[#4E5C70] font-medium">
                  Оформлен: {selectedOrderForTracking.date}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrderIdForTracking(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-transform"
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
              const isTK = isTransportCompanyDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isPickup = isPickupDelivery(selectedOrderForTracking.deliveryMethod);
              const isCourier = isCourierDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isExpress = (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('экспресс') || (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('express');

              if (isPost) {
                return (
                  <div className="neu-inset rounded-2xl p-3.5 border border-accent/16 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-accent" />
                          {selectedOrderForTracking.deliveryMethod || 'Почтовое отправление'}
                        </span>
                        <p className="text-xs font-black text-[#2D3A4E]">
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
                    <p className="text-[11px] text-[#4E5C70] leading-snug">
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
                          <p className="text-xs font-black text-[#2D3A4E] tracking-wide font-mono">
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
                      <p className="text-[11px] text-[#4E5C70] leading-snug">
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
                        <p className="text-xs font-black text-warning">
                          Трек-номер формируется транспортной компанией
                        </p>
                        <p className="text-[11px] text-warning leading-snug">
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
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
                        {isPickup ? <Store className="w-3.5 h-3.5 text-accent" /> : isExpress ? <Zap className="w-3.5 h-3.5 text-warning" /> : <Bike className="w-3.5 h-3.5 text-accent" />}
                        {isPickup ? 'Самовывоз из бутика' : isExpress ? 'Срочная экспресс-доставка' : `Курьерская служба ${storeName}`}
                      </span>
                      <p className="text-xs font-black text-[#2D3A4E]">
                        {selectedOrderForTracking.deliveryMethod || (isPickup ? 'Самовывоз' : 'Курьерская доставка')}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-accent neu-flat px-2 py-0.5 rounded-lg">
                      {isPickup ? 'В бутике' : 'До двери'}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#4E5C70] leading-snug">
                    {isPickup
                      ? `Пункт выдачи: ${selectedOrderForTracking.deliveryAddress || `Бутик ${storeName}`}. Заказ выдается сотрудниками бутика без трек-номера.`
                      : `Адрес доставки: ${selectedOrderForTracking.deliveryAddress || 'Адрес клиента'}. Заказ доставляется штатной службой ${storeName} без сторонних трек-номеров.`}
                  </p>

                  {isCourier && (
                    <button
                      type="button"
                      onClick={() => setSelectedOrderIdForMap(selectedOrderForTracking.id)}
                      className="w-full py-2.5 px-3.5 neu-button rounded-xl text-xs font-black text-accent flex items-center justify-center gap-2 hover:scale-[1.02] transition-all cursor-pointer"
                    >
                      <Navigation className="w-4 h-4 text-accent animate-pulse" />
                      <span>Открыть карту перемещения курьера</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Status Header Banner with Animated Milestone Progress Bar */}
            {(() => {
              const trackingStatusInfo = getOrderStatusProgress(
                selectedOrderForTracking.status,
                selectedOrderForTracking.isCancelled
              );

              const milestoneSteps: { key: Order['status']; label: string; threshold: number }[] = [
                { key: 'accepted', label: 'Принят', threshold: 20 },
                { key: 'assembling', label: 'Сборка', threshold: 45 },
                { key: 'in_transit', label: 'В пути', threshold: 75 },
                { key: 'ready', label: 'Готов', threshold: 90 },
                { key: 'delivered', label: 'Вручен', threshold: 100 },
              ];

              return (
                <div className="neu-inset rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0">
                      <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#4E5C70] block mb-1">
                        Текущий статус
                      </span>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <span
                          className={`text-xs font-black neu-button px-3 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${trackingStatusInfo.text}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                          <span>{trackingStatusInfo.label}</span>
                        </span>
                        {!selectedOrderForTracking.isCancelled && (
                          <span className="text-[11px] font-black text-accent neu-inset px-2.5 py-1 rounded-lg whitespace-nowrap">
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
                          <div key={step.key} className="flex flex-col items-center flex-1 min-w-0">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all shrink-0 ${
                                isStepDone
                                  ? 'neu-fill-accent text-white'
                                  : isStepActive
                                  ? 'neu-inset-deep text-accent border border-accent ring-1 ring-accent/30 font-black'
                                  : 'neu-inset text-[#4E5C70]/70'
                              }`}
                            >
                              {isStepDone ? (
                                <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <span
                              className={`text-[11px] mt-1 font-bold transition-colors text-center truncate max-w-full ${
                                isStepDone
                                  ? 'text-[#2D3A4E]'
                                  : isStepActive
                                  ? 'text-accent font-black'
                                  : 'text-[#4E5C70]/70'
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

            {/* Delivery Stages Timeline (Real Admin Synced Data) */}
            <div className="neu-inset rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#BAC5D5]/40 pb-2">
                <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  Этапы доставки
                </span>
                <span className="text-[11px] text-accent font-black neu-flat-sm px-2 py-0.5 rounded-full">
                  Онлайн данные
                </span>
              </div>

              {(() => {
                const stages = getSynchronizedDeliveryStages(selectedOrderForTracking);

                return (
                  <div className="relative space-y-0 pt-1">
                    {stages.map((stage, idx) => {
                      const isCompleted = stage.status === 'completed';
                      const isActive = stage.status === 'active';
                      const isLast = idx === stages.length - 1;

                      const nextStage = stages[idx + 1];
                      const isPathToNextFilled = isCompleted && nextStage && nextStage.status === 'completed';
                      const isPathToNextActive = (isCompleted && nextStage && nextStage.status === 'active') || (isActive && nextStage);

                      return (
                        <div key={stage.id || idx} className="relative flex items-start gap-3">
                          {/* Left Column: Stage Node & Animated Vertical Path to Next Step */}
                          <div className="flex flex-col items-center self-stretch shrink-0">
                            {/* Step Node Circle */}
                            <div
                              className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black transition-all z-10 ${
                                isCompleted
                                  ? 'neu-fill-accent text-white'
                                  : isActive
                                  ? 'neu-inset-deep text-accent border border-accent ring-2 ring-accent/20'
                                  : 'neu-inset text-[#4E5C70]'
                              }`}
                            >
                              {isCompleted ? (
                                <Check className="w-4 h-4 stroke-[3]" />
                              ) : (
                                idx + 1
                              )}
                            </div>

                            {/* Connecting Path Groove between this stage and the next */}
                            {!isLast && (
                              <div className="relative w-1.5 flex-1 my-1 neu-inset rounded-full overflow-hidden min-h-[38px]">
                                <div
                                  className={`w-full rounded-full transition-all duration-500 ease-out relative ${
                                    isPathToNextFilled
                                      ? 'h-full bg-gradient-to-b from-accent to-[#7888EC]'
                                      : isPathToNextActive
                                      ? 'h-full bg-gradient-to-b from-accent via-[#8594F7] to-[#BAC5D5]'
                                      : 'h-0 bg-transparent'
                                  }`}
                                >
                                  {(isPathToNextFilled || isPathToNextActive) && (
                                    <div className="neu-progress-beam-vertical" />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Stage Details Card */}
                          <div
                            className={`flex-1 min-w-0 mb-3 rounded-2xl p-3 sm:p-3.5 border transition-all ${
                              isActive
                                ? 'neu-inset-deep border-accent/50'
                                : isCompleted
                                ? 'neu-flat-sm border-accent/40'
                                : 'neu-flat-sm border-white/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isActive
                                        ? 'text-accent font-black'
                                        : isCompleted
                                        ? 'text-[#2D3A4E]'
                                        : 'text-[#4E5C70]'
                                    }`}
                                  >
                                    {stage.title}
                                  </span>
                                  {isActive && (
                                    <span className="text-[11px] font-extrabold text-accent neu-inset px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                                      <span>В процессе</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#4E5C70] leading-snug mt-1">
                                  {stage.desc}
                                </p>
                              </div>

                              {stage.time && (
                                <span
                                  className={`text-[11px] font-mono shrink-0 px-2 py-0.5 rounded-md font-bold ${
                                    isActive
                                      ? 'text-accent neu-inset'
                                      : isCompleted
                                      ? 'text-success neu-flat'
                                      : 'text-[#4E5C70]'
                                  }`}
                                >
                                  {stage.time}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Detailed History Timeline */}
            {(() => {
              const rawHistory = selectedOrderForTracking.historySteps;
              const hasCustomHistory = Array.isArray(rawHistory) && rawHistory.length > 0;

              // Generate clean chronological steps
              const stepsToRender: OrderStatusHistoryStep[] = hasCustomHistory
                ? rawHistory.map((step: any, idx) => {
                    const isStepActuallyCompleted =
                      selectedOrderForTracking.status === 'accepted' && !selectedOrderForTracking.isCancelled
                        ? idx === 0 || String(step.title || '').toLowerCase().includes('принят')
                        : Boolean(step.completed);

                    return {
                      title: step.title || `Этап ${idx + 1}`,
                      date: step.date || selectedOrderForTracking.date || 'Сегодня',
                      completed: isStepActuallyCompleted,
                      description: step.description,
                    };
                  })
                : getDefaultHistorySteps(selectedOrderForTracking);

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#2D3A4E]">История статусов:</span>
                    <span className="text-[11px] text-[#4E5C70] font-semibold">
                      Выполнено: {stepsToRender.filter((s) => s.completed).length} из {stepsToRender.length}
                    </span>
                  </div>
                  <div className="relative space-y-0">
                    {stepsToRender.map((step, idx, arr) => {
                      const isLast = idx === arr.length - 1;
                      const isPathFilled = step.completed && arr[idx + 1]?.completed;

                      return (
                        <div key={idx} className="relative flex items-start gap-3">
                          <div className="flex flex-col items-center self-stretch shrink-0">
                            <div
                              className={`w-3.5 h-3.5 rounded-full mt-1.5 shrink-0 transition-all ${
                                step.completed
                                  ? 'bg-accent ring-4 ring-accent/20'
                                  : 'bg-[#BAC5D5]'
                              }`}
                            />
                            {!isLast && (
                              <div className="w-1 flex-1 my-1 neu-inset rounded-full min-h-[26px] overflow-hidden">
                                <div
                                  className={`w-full h-full transition-all duration-300 ${
                                    isPathFilled
                                      ? 'bg-accent'
                                      : 'bg-transparent'
                                  }`}
                                />
                              </div>
                            )}
                          </div>

                          <div
                            className={`flex-1 neu-flat-sm rounded-xl p-3 border mb-2.5 transition-all ${
                              step.completed
                                ? 'border-accent/50'
                                : 'border-white/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs gap-2">
                              <span className="font-bold text-[#2D3A4E] truncate">{step.title}</span>
                              <span className="text-[11px] text-[#4E5C70] font-medium shrink-0">{step.date}</span>
                            </div>
                            {step.description && (
                              <p className="text-[11px] text-[#4E5C70] leading-snug mt-0.5">
                                {step.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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
                        src={productImage(it.product)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded-lg object-cover neu-flat"
                      />
                      <div>
                        <p className="text-xs font-bold text-[#2D3A4E] leading-tight">
                          {it.product.title}
                        </p>
                        <p className="text-[11px] text-[#4E5C70]">
                          {it.selectedColor}, разм. {it.selectedSize} • {it.quantity} шт.
                          {it.isPreorder && <span className="font-bold text-accent"> • Предзаказ</span>}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-[#2D3A4E]">
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
                      <span className="font-black text-success neu-flat px-2 py-0.5 rounded-lg text-[11px]">
                        Возврат: {selectedOrderForTracking.refundAmount.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                  </div>
                  {selectedOrderForTracking.adjustmentReason && (
                    <p className="text-[11px] text-success">
                      Причина: {selectedOrderForTracking.adjustmentReason}
                    </p>
                  )}
                  {selectedOrderForTracking.originalTotalPrice && (
                    <p className="text-[11px] text-[#4E5C70]">
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
                  <p className="text-[11px] text-[#4E5C70]">
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
              const isExpress = (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('экспресс') || (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('express');

              if (isPost) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 border border-accent/12 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-accent font-black text-xs shrink-0 border border-accent/16">
                        ПР
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[#2D3A4E] truncate">Почта России</p>
                        <p className="text-[11px] text-[#4E5C70] truncate">Выдача в почтовом отделении</p>
                      </div>
                    </div>
                    {onOpenSupportChat && (
                      <button
                        type="button"
                        onClick={() => {
                          const orderId = selectedOrderForTracking.id;
                          setSelectedOrderIdForTracking(null);
                          setActiveModal(null);
                          setSelectedOrderIdForMap(null);
                          onOpenSupportChat();
                          onShowToast(`Чат заботы открыт по заказу #${orderId}`, 'info');
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
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-accent font-black text-xs shrink-0 border border-white/90">
                        {storeInitials(storeName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[#2D3A4E] truncate">Бутик {storeName}</p>
                        <p className="text-[11px] text-[#4E5C70] truncate">Выдача заказов</p>
                      </div>
                    </div>
                    {onOpenSupportChat && (
                      <button
                        type="button"
                        onClick={() => {
                          const orderId = selectedOrderForTracking.id;
                          setSelectedOrderIdForTracking(null);
                          setActiveModal(null);
                          setSelectedOrderIdForMap(null);
                          onOpenSupportChat();
                          onShowToast(`Чат заботы открыт по заказу #${orderId}`, 'info');
                        }}
                        className="py-1.5 px-3 rounded-xl neu-button text-[#2D3A4E] hover:text-accent hover:scale-105 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                        title="Написать в чат поддержки"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-accent" />
                        <span>Консьерж</span>
                      </button>
                    )}
                  </div>
                );
              }

              if (isCourier) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 border border-white/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-accent font-black text-xs shrink-0 border border-white/90">
                        АС
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black text-[#2D3A4E] truncate">
                            {isExpress ? 'Иван (Экспресс)' : 'Алексей Смирнов'}
                          </p>
                          <span className="text-[11px] font-bold text-warning neu-flat px-1 py-0.2 rounded shrink-0">
                            ★ 4.96
                          </span>
                        </div>
                        <p className="text-[11px] text-[#4E5C70] truncate">
                          {isExpress ? `Срочный курьер ${storeName}` : `Курьер ${storeName}`}
                        </p>
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
                            setActiveModal(null);
                            setSelectedOrderIdForMap(null);
                            onOpenSupportChat();
                            onShowToast(`Чат заботы открыт по заказу #${orderId}`, 'info');
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
                    <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center text-success font-black text-xs shrink-0 border border-success/25">
                      ТК
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#2D3A4E] truncate">Транспортная компания</p>
                      <p className="text-[11px] text-[#4E5C70] truncate">Доставка до ПВЗ / по адресу</p>
                    </div>
                  </div>
                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        const orderId = selectedOrderForTracking.id;
                        setSelectedOrderIdForTracking(null);
                        setActiveModal(null);
                        setSelectedOrderIdForMap(null);
                        onOpenSupportChat();
                        onShowToast(`Чат заботы открыт по заказу #${orderId}`, 'info');
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
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SAVED ADDRESSES MANAGEMENT ================= */}
      {activeModal === 'addresses' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={addressesDialog.ref}
            {...addressesDialog.props}
            className="neu-modal rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col border border-white/80 text-[#2D3A4E] overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 p-4 sm:p-5 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-accent" />
                <h3 id={addressesDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">Адреса доставки</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-transform"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Smooth Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 no-scrollbar overscroll-contain transform-gpu">
              {profile.savedAddresses.map((addr) => (
                <div key={addr.id} className="neu-inset rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#2D3A4E]">{addr.title}</span>
                      {addr.isDefault && (
                        <span className="text-[11px] font-bold text-success bg-success-soft px-2 py-0.5 rounded-full">
                          Основной
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditAddress(addr)}
                        className="p-1.5 neu-button rounded-xl text-[#4E5C70] hover:text-[#2D3A4E]"
                        title="Редактировать"
                        aria-label="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setAddressToDelete(addr.id)}
                        className="p-1.5 neu-button-danger rounded-xl"
                        title="Удалить"
                        aria-label="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[#2D3A4E] font-semibold leading-relaxed">
                    {formatAddress(addr)}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {addr.house && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        д. {addr.house}
                      </span>
                    )}
                    {addr.entrance && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        подъезд {addr.entrance}
                      </span>
                    )}
                    {addr.floor && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        эт. {addr.floor}
                      </span>
                    )}
                    {addr.apartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        {addr.apartment.toLowerCase().includes('кв') || addr.apartment.toLowerCase().includes('оф')
                          ? addr.apartment
                          : `кв. ${addr.apartment}`}
                      </span>
                    )}
                    {addr.intercom && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-accent">
                        домофон: {addr.intercom}
                      </span>
                    )}
                  </div>

                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefaultAddress(addr.id)}
                      className="text-[11px] font-bold text-accent hover:underline pt-1 block cursor-pointer"
                    >
                      Сделать основным адресом
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-3.5 sm:p-4 border-t border-[#BAC5D5]/50 shrink-0 bg-[#E3E8EF]">
              <button
                type="button"
                onClick={handleOpenAddAddress}
                className="w-full neu-button-accent rounded-2xl py-3 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-transform"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Добавить новый адрес</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT ADDRESS FORM ================= */}
      {isAddingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={addressFormDialog.ref}
            {...addressFormDialog.props}
            className="neu-modal rounded-[28px] p-6 max-w-md w-full space-y-4 relative text-[#2D3A4E] border border-white/80">
            <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/50">
              <h3 id={addressFormDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">
                {editingAddress ? 'Редактировать адрес' : 'Добавить адрес'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingAddress(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-colors cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Название (например: Дом, Работа)
                </label>
                <input
                  type="text"
                  value={addrTitle}
                  onChange={(e) => setAddrTitle(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="Дом"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-addr-city" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Город</label>
                  <input
                    id="profile-addr-city"
                    type="text"
                    autoComplete="address-level2"
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="Город"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Индекс</label>
                  <input
                    type="text"
                    value={addrPostal}
                    onChange={(e) => setAddrPostal(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="101000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Улица
                </label>
                <input
                  type="text"
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="ул. Тверская, Ленинский проспект"
                  required
                />
              </div>

              {/* Номер дома, Подъезд, Этаж */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Номер дома
                  </label>
                  <input
                    type="text"
                    value={addrHouse}
                    onChange={(e) => setAddrHouse(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="д. 10 / 12к1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Подъезд
                  </label>
                  <input
                    type="text"
                    value={addrEntrance}
                    onChange={(e) => setAddrEntrance(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Этаж
                  </label>
                  <input
                    type="text"
                    value={addrFloor}
                    onChange={(e) => setAddrFloor(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="4"
                  />
                </div>
              </div>

              {/* Квартира / Офис & Код домофона */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Квартира / Офис
                  </label>
                  <input
                    type="text"
                    value={addrApartment}
                    onChange={(e) => setAddrApartment(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="кв. 25"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Код домофона
                  </label>
                  <input
                    type="text"
                    value={addrIntercom}
                    onChange={(e) => setAddrIntercom(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="25K / #1234"
                  />
                </div>
              </div>

              {/* Delivery Preview */}
              <div className="neu-inset rounded-2xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                  Адрес для курьера:
                </span>
                <p className="text-xs font-bold text-[#2D3A4E] leading-relaxed break-words">
                  {formatAddress({
                    city: addrCity,
                    postalCode: addrPostal,
                    street: addrStreet,
                    house: addrHouse,
                    entrance: addrEntrance,
                    floor: addrFloor,
                    apartment: addrApartment,
                    intercom: addrIntercom,
                  }) || 'Укажите улицу и номер дома'}
                </p>
              </div>

              <div
                onClick={() => setAddrIsDefault(!addrIsDefault)}
                className="flex items-center gap-3 pt-1 cursor-pointer select-none group"
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                    addrIsDefault
                      ? 'neu-fill-accent text-white'
                      : 'neu-inset text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="font-bold text-xs text-[#2D3A4E] group-hover:text-accent">
                  Сделать основным адресом
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAddress(false)}
                  className="flex-1 py-3.5 neu-button rounded-2xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 neu-button-accent rounded-2xl text-xs font-extrabold text-white transition-all active:scale-[0.98] cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT BODY MEASUREMENTS & RUSSIAN PATTERN ================= */}
      {isEditingMeasurements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={measurementsDialog.ref}
            {...measurementsDialog.props}
            className="neu-modal rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col border border-white/80 text-[#2D3A4E] overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 p-4 sm:p-5 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent">
                  <Ruler className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 id={measurementsDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">
                    Мерки профиля и лекало РФ
                  </h3>
                  <p className="text-[11px] text-[#4E5C70] font-medium">
                    Стандарты ГОСТ 31399-2009 / ГОСТ Р 52771-2007
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingMeasurements(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-transform"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form wrapping body and sticky footer */}
            <form onSubmit={handleSaveMeasurements} className="flex-1 flex flex-col min-h-0">
              {/* Smooth Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 no-scrollbar overscroll-contain transform-gpu">

            {/* Russian Sizing Pattern (Лекало РФ) Live Summary */}
            <div className="neu-inset rounded-2xl p-3.5 space-y-3 border border-white/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#2D3A4E]">
                    Размерное лекало РФ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGostTable(!showGostTable)}
                  className="neu-button px-2 py-0.5 rounded-lg text-[11px] font-bold text-accent hover:text-[#2D3A4E] cursor-pointer"
                >
                  {showGostTable ? 'Скрыть таблицу' : 'Таблица ГОСТ'}
                </button>
              </div>

              {/* 4 Bento Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Верх РФ</span>
                  <span className="text-xs font-black text-accent block my-0.5">
                    {currentRussianPattern.topSizeLabel}
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    ПОГ: {Math.round(measChest / 2)} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Низ РФ</span>
                  <span className="text-xs font-black text-accent block my-0.5">
                    {currentRussianPattern.bottomSizeLabel}
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    Пояс: {measWaist} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Ростовка</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {currentRussianPattern.heightGroupNumber}-я группа
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    {currentRussianPattern.heightRange}
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Полнота</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {currentRussianPattern.fullnessGroup}-я группа
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    Дроп: {currentRussianPattern.dropValue} см
                  </span>
                </div>
              </div>

              {/* Dynamic Recommendation Banner */}
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#4E5C70] pt-1 border-t border-[#BAC5D5]/40">
                <Info className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate">
                  {currentRussianPattern.recommendedFit} • ИМТ: {currentRussianPattern.bmi} ({currentRussianPattern.bmiStatus})
                </span>
              </div>

              {/* Collapsible Russian Size Grid Table */}
              {showGostTable && (
                <div className="neu-flat rounded-xl p-3 border border-white/80 space-y-2 mt-2 animate-in fade-in">
                  <div className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center justify-between">
                    <span>Сетка размеров РФ (ГОСТ 31399-2009)</span>
                    <span className="text-[11px] text-accent font-bold">Мужская одежда</span>
                  </div>
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-[11px] text-center border-collapse">
                      <thead>
                        <tr className="border-b border-[#BAC5D5]/50 text-[#4E5C70] font-bold">
                          <th className="py-1 px-1 text-left">Размер РФ</th>
                          <th className="py-1 px-1">Междунар.</th>
                          <th className="py-1 px-1">Обхват груди</th>
                          <th className="py-1 px-1">Талия</th>
                          <th className="py-1 px-1">Бедра</th>
                          <th className="py-1 px-1">Джинсы (W)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RUSSIAN_SIZE_TABLE_ROWS.map((row) => {
                          const isMatch = currentRussianPattern.topRussianSize === row.ru;
                          return (
                            <tr
                              key={row.ru}
                              className={`border-b border-[#BAC5D5]/30 transition-colors ${
                                isMatch
                                  ? 'neu-inset text-accent font-black'
                                  : 'text-[#2D3A4E]'
                              }`}
                            >
                              <td className="py-1 px-1 font-bold text-left">RU {row.ru}</td>
                              <td className="py-1 px-1">{row.int}</td>
                              <td className="py-1 px-1">{row.chest} см</td>
                              <td className="py-1 px-1">{row.waist} см</td>
                              <td className="py-1 px-1">{row.hips} см</td>
                              <td className="py-1 px-1 font-mono font-bold">{row.jeans}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Sliders Container with Neumorphic Tactile Sliders */}
            <div className="space-y-3.5">
              {/* Height Slider */}
              <NeumorphicSlider
                id="meas-slider-height"
                label="Рост"
                value={measHeight}
                min={160}
                max={205}
                unit="см"
                icon={<Ruler className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`${currentRussianPattern.heightGroupNumber}-я ростовка РФ (${currentRussianPattern.heightRange})`}
                recommendedValue={184}
                onChange={setMeasHeight}
              />

              {/* Weight Slider */}
              <NeumorphicSlider
                id="meas-slider-weight"
                label="Вес"
                value={measWeight}
                min={50}
                max={130}
                unit="кг"
                icon={<Scale className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`ИМТ: ${currentRussianPattern.bmi} • ${currentRussianPattern.bmiStatus}`}
                recommendedValue={94}
                onChange={setMeasWeight}
              />

              {/* Chest Slider */}
              <NeumorphicSlider
                id="meas-slider-chest"
                label="Обхват груди"
                value={measChest}
                min={80}
                max={140}
                unit="см"
                icon={<Shirt className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`ПОГ: ${Math.round(measChest / 2)} см → Российский размер: RU ${currentRussianPattern.topRussianSize} (${currentRussianPattern.topInternationalSize})`}
                recommendedValue={104}
                onChange={setMeasChest}
              />

              {/* Waist Slider */}
              <NeumorphicSlider
                id="meas-slider-waist"
                label="Обхват талии"
                value={measWaist}
                min={65}
                max={130}
                unit="см"
                icon={<Scissors className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`Джинсовый пояс: ${currentRussianPattern.jeansWaistSize} • Дроп: ${currentRussianPattern.dropValue} см`}
                recommendedValue={95}
                onChange={setMeasWaist}
              />

              {/* Hips Slider */}
              <NeumorphicSlider
                id="meas-slider-hips"
                label="Обхват бедер"
                value={measHips}
                min={80}
                max={140}
                unit="см"
                icon={<Layers className="w-4 h-4 stroke-[2.2]" />}
                subtitle={`Соответствие лекалу брюк: RU ${currentRussianPattern.bottomRussianSize}`}
                recommendedValue={98}
                onChange={setMeasHips}
              />

              {/* Fit Preference */}
              <div className="space-y-2 neu-inset rounded-2xl p-3 border border-white/40">
                <span className="text-xs font-extrabold text-[#2D3A4E] block">
                  Предпочитаемая посадка:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'tight', label: 'Облегающая', sub: 'Slim Fit' },
                    { id: 'regular', label: 'Стандартная', sub: 'Regular' },
                    { id: 'loose', label: 'Свободная', sub: 'Oversize' },
                  ].map((pref) => {
                    const isActive = measFit === pref.id;
                    return (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => setMeasFit(pref.id as any)}
                        className={`py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isActive
                            ? 'neu-pill-active font-black'
                            : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                        }`}
                      >
                        <span>{pref.label}</span>
                        <span className="text-[11px] opacity-75">{pref.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

              {/* Action Buttons - Sticky Footer */}
              <div className="p-3.5 sm:p-4 border-t border-[#BAC5D5]/50 flex gap-2.5 shrink-0 bg-[#E3E8EF]">
                <button
                  type="button"
                  onClick={() => setIsEditingMeasurements(false)}
                  className="flex-1 py-3 neu-button rounded-xl text-[#4E5C70] font-bold text-xs hover:text-[#2D3A4E] cursor-pointer transition-transform"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 neu-button-accent rounded-xl font-extrabold text-xs text-white cursor-pointer transition-transform flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Сохранить лекало</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADMIN PANEL ================= */}
      <AnimatePresence>
        {activeModal === 'admin' && isFirebaseAdmin && (
          <motion.div
            key="admin-panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="admin-no-glow fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto overflow-x-hidden"
          >
            {/* Backdrop */}
            <div
              onClick={requestCloseAdmin}
              className="fixed inset-0 bg-[#2D3A4E]/40 backdrop-blur-xs cursor-pointer"
            />

            <motion.div
              key="admin-modal"
              ref={adminDialog.ref}
              {...adminDialog.props}
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="neu-modal rounded-3xl p-3.5 sm:p-6 max-w-5xl lg:max-w-none w-full my-auto space-y-4 max-h-[92vh] lg:max-h-none lg:h-[calc(100vh-2rem)] flex flex-col border border-white/80 text-[#2D3A4E] min-w-0 overflow-hidden relative z-10"
            >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3 shrink-0 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 id={adminDialog.titleId} className="text-sm sm:text-base font-extrabold text-[#2D3A4E] leading-tight">
                      Панель администратора
                    </h3>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black text-success bg-success-soft border border-success/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      {currentUser?.email}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-[11px] font-medium text-[#4E5C70] truncate">Каталог, склад, заказы и витрина</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="admin-modal-close-btn"
                  type="button"
                  onClick={requestCloseAdmin}
                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer shrink-0"
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 4 groups → sections → the section; forms report unsaved edits to the panel */}
            <UnsavedChangesContext.Provider value={unsavedRegistry}>
            <Suspense fallback={<AdminLoading />}>
            <AdminNav
              tab={adminTab}
              onRequestTab={requestAdminTab}
              onPrefetchTab={prefetchAdmin}
              pendingTab={isTabPending ? requestedTab : null}
              counts={adminCounts}
            >
              {/* One boundary for all sections, above the keyed wrapper: during a switch (a transition) it keeps
                  the current section instead of showing «Загрузка раздела…» */}
              <Suspense fallback={<AdminLoading />}>
                <motion.div
                  key={adminTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="w-full"
                >
              {/* --- TAB 1: ANALYTICS & FINANCIAL DASHBOARD --- */}
              {adminTab === 'analytics' && (
                <AdminAnalyticsTab
                  orders={orders}
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
                  onUpdateProducts={handleUpdateProductsList}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 3: INVENTORY & SKU MANAGEMENT --- */}
              {adminTab === 'inventory' && (
                <AdminInventoryTab
                  products={productsList}
                  onUpdateProducts={(upd) => {
                    setProductsList(upd);
                    if (onUpdateProducts) onUpdateProducts(upd);
                  }}
                  onShowToast={onShowToast}
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                />
              )}

              {/* --- TAB 4: ORDERS MANAGEMENT --- */}
              {adminTab === 'orders' && (
                <AdminOrdersTab
                  orders={orders}
                  storefrontSettings={storefrontSettings}
                  products={productsList}
                  onUpdateOrders={handleUpdateOrders}
                  onUpdateProducts={handleUpdateProductsList}
                  onShowToast={onShowToast}
                  onOpenSupportChat={(orderId, customerName) => {
                    setSupportTargetOrderId(orderId);
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
                  users={allUsers}
                  orders={orders}
                  onOpenSupportChat={(orderId, customerName) => {
                    if (orderId) setSupportTargetOrderId(orderId);
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
                  initialOrderId={supportTargetOrderId}
                  onSend={handleSendAdminMessage}
                  onUpdateOrders={handleUpdateOrders}
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
                    onUpdateSettings={onUpdateStorefrontSettings}
                    onShowToast={onShowToast}
                  />
                </div>
              )}
                </motion.div>
              </Suspense>
            </AdminNav>
            </Suspense>
            </UnsavedChangesContext.Provider>
          </motion.div>
        </motion.div>
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

      {/* ================= MODAL: FAQ ACCORDION ================= */}
      <FAQModal
        isOpen={activeModal === 'faq'}
        freeDeliveryThreshold={storefrontSettings?.freeDeliveryThreshold}
        returnPeriodDays={storefrontSettings?.returnPeriodDays}
        storePhone={storePhone}
        storeEmail={storeEmail}
        faqItems={storefrontSettings?.faqItems}
        onClose={() => setActiveModal(null)}
        onOpenSupportChat={onOpenSupportChat}
        onShowToast={onShowToast}
      />

      {/* ================= MODAL: SUPPORT & HOTLINE ================= */}
      <AnimatePresence>
        {activeModal === 'support' && (
          <motion.div
            key="support-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          >
            {/* Backdrop */}
            <div
              onClick={() => setActiveModal(null)}
              className="fixed inset-0 bg-[#2D3A4E]/40 backdrop-blur-xs cursor-pointer"
            />

            <motion.div
              ref={supportDialog.ref}
              {...supportDialog.props}
              key="support-modal"
              initial={{ scale: 0.93, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="neu-modal rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 text-[#2D3A4E] border border-white/80 relative z-10"
            >
              <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center text-accent">
                    <Headphones className="w-4 h-4" />
                  </div>
                  <h3 id={supportDialog.titleId} className="text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Служба заботы {storeName}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-[#4E5C70] leading-relaxed">
                <p className="font-bold text-[#2D3A4E]">Мы на связи и готовы помочь с любым вопросом!</p>
                {storePhone && (
                <div className="neu-inset rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#2D3A4E]">Телефон магазина:</p>
                      <a
                        href={telHref(storePhone)}
                        className="text-accent font-black text-base hover:underline block"
                      >
                        {storePhone}
                      </a>
                    </div>
                    <a
                      href={telHref(storePhone)}
                      className="neu-button p-2.5 rounded-xl text-accent hover:scale-105 transition-transform"
                      title="Позвонить"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                  {workingHours && <p className="text-[11px] text-[#4E5C70]">{workingHours}</p>}
                </div>
                )}

                <div className="space-y-2 pt-1">
                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        onOpenSupportChat();
                      }}
                      className="w-full neu-button-accent py-2.5 px-4 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-transform"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Открыть онлайн-чат заботы</span>
                    </button>
                  )}

                  {storeEmail && (
                    <a
                      href={`mailto:${storeEmail}`}
                      className="w-full neu-button py-2.5 px-4 rounded-xl text-xs font-bold text-[#2D3A4E] flex items-center justify-center gap-2 cursor-pointer hover:text-accent transition-colors"
                    >
                      <span>Email: {storeEmail}</span>
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delivery Tracking Interactive Map Modal */}
      <DeliveryTrackingMapModal
        isOpen={!!selectedOrderForMap}
        onClose={() => setSelectedOrderIdForMap(null)}
        order={selectedOrderForMap}
        storePhone={storePhone}
        onOpenSupportChat={onOpenSupportChat}
        onShowToast={onShowToast}
      />

      {/* Neumorphic Security Settings Modal */}
      <AccountDataModal
        isOpen={activeModal === 'security'}
        onClose={() => setActiveModal(null)}
        profile={profile}
        orders={orders}
        googleEmail={currentUser?.email}
        onSignOut={handleGoogleLogoutClick}
        onShowToast={onShowToast}
      />

      <ConfirmDialog
        isOpen={addressToDelete !== null}
        title="Удалить адрес?"
        message="Адрес будет удален из сохраненных."
        onConfirm={() => addressToDelete && handleDeleteAddress(addressToDelete)}
        onClose={() => setAddressToDelete(null)}
      />
    </div>
  );
};
