import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SecuritySettingsModal } from '../components/SecuritySettingsModal';
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
  ChevronDown,
  Pencil,
  Check,
  X,
  Package,
  MapPin,
  CreditCard,
  Plus,
  Trash2,
  Truck,
  CheckCircle,
  Clock,
  Copy,
  Phone,
  Sparkles,
  ExternalLink,
  Ruler,
  ShieldCheck,
  BarChart3,
  Tag,
  Sliders,
  Settings,
  Layers,
  Store,
  Filter,
  Search,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  Boxes,
  Barcode,
  Image as ImageIcon,
  Navigation,
  MessageCircle,
  Send,
  KeyRound,
  Cloud,
  Database,
  Users,
  Scale,
  Scissors,
  Shirt,
  Info,
  Activity,
  AlertTriangle,
  Bike,
  Zap,
  Mail,
} from 'lucide-react';
import { NeumorphicSlider } from '../components/NeumorphicSlider';
import { calculateRussianPattern, RUSSIAN_SIZE_TABLE_ROWS } from '../utils/russianSizing';
import { useAuth } from '../context/AuthContext';
import { UserProfile, Order, OrderStatusHistoryStep, ActiveTab, SavedAddress, SavedCard, Product, PromoCode, BannerSlide, ChatMessage, StorefrontSettings, AdminCredentials, DeliveryMethod, PickupPoint } from '../types';
import { formatAddress } from '../utils/addressFormat';
import { PRODUCTS } from '../data/products';
import { INITIAL_PROMO_CODES, INITIAL_BANNER_SLIDES, INITIAL_CHAT_MESSAGES } from '../data/marketingAndSupport';
import { AdminAnalyticsTab } from '../components/admin/AdminAnalyticsTab';
import { AdminPromoConstructorTab } from '../components/admin/AdminPromoConstructorTab';
import { AdminBannersTab } from '../components/admin/AdminBannersTab';
import { AdminSupportChatTab } from '../components/admin/AdminSupportChatTab';
import { AdminInventoryTab } from '../components/admin/AdminInventoryTab';
import { AdminProductsTab } from '../components/admin/AdminProductsTab';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminCustomersTab } from '../components/admin/AdminCustomersTab';
import { AdminStorefrontTab } from '../components/admin/AdminStorefrontTab';
import { AdminDeliveryTab } from '../components/admin/AdminDeliveryTab';
import { AdminAuthModal } from '../components/admin/AdminAuthModal';
import { AdminChangeCredentialsModal } from '../components/admin/AdminChangeCredentialsModal';
import { DeliveryTrackingMapModal } from '../components/DeliveryTrackingMapModal';
import { copyToClipboard } from '../utils/clipboard';
import {
  getAdminCredentials,
  subscribeToCredentialsChanges,
} from '../utils/adminAuth';
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
  INITIAL_DELIVERY_METHODS,
  INITIAL_PICKUP_POINTS,
  loadLocalDeliveryMethods,
  saveLocalDeliveryMethods,
  loadLocalPickupPoints,
  saveLocalPickupPoints,
} from '../data/deliveryData';

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
    orderStatusUpdate?: ChatMessage['orderStatusUpdate']
  ) => void;
  onClearChat?: () => void;
  storefrontSettings?: StorefrontSettings;
  onUpdateStorefrontSettings?: (settings: StorefrontSettings) => void;
  onSyncFirebase?: () => Promise<void>;
  deliveryMethods?: DeliveryMethod[];
  onUpdateDeliveryMethods?: (methods: DeliveryMethod[]) => void;
  pickupPoints?: PickupPoint[];
  onUpdatePickupPoints?: (points: PickupPoint[]) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  allUsers = [],
  orders,
  products = PRODUCTS,
  favoritesCount,
  recentlyViewed = [],
  favorites = [],
  onSelectProduct,
  onToggleFavorite,
  onUpdateProfile,
  setActiveTab,
  onShowToast,
  onOpenSupportChat,
  onUpdateProducts,
  onUpdateOrders,
  promos = INITIAL_PROMO_CODES,
  onUpdatePromos,
  bannerSlides = INITIAL_BANNER_SLIDES,
  onUpdateBannerSlides,
  chatMessages = INITIAL_CHAT_MESSAGES,
  onSendMessageAsAdmin,
  onClearChat,
  storefrontSettings,
  onUpdateStorefrontSettings,
  onSyncFirebase,
  deliveryMethods,
  onUpdateDeliveryMethods,
  pickupPoints,
  onUpdatePickupPoints,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [notifications, setNotifications] = useState(profile.notificationsEnabled);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'orders' | 'addresses' | 'cards' | 'support' | 'faq' | 'admin' | 'security' | null
  >(null);

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

  const handleSendAdminMessage = (
    text: string,
    imageUrl?: string,
    promoCard?: ChatMessage['promoCard'],
    tag?: ChatMessage['tag'],
    isInternalNote?: boolean,
    productCard?: ChatMessage['productCard'],
    orderStatusUpdate?: ChatMessage['orderStatusUpdate']
  ) => {
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'admin',
      text,
      imageUrl,
      promoCard,
      tag,
      isInternalNote,
      productCard,
      orderStatusUpdate,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setLocalChatMessages((prev) => [...prev, newMsg]);
    if (onSendMessageAsAdmin) {
      onSendMessageAsAdmin(text, imageUrl, promoCard, tag, isInternalNote, productCard, orderStatusUpdate);
    }
  };

  // Admin Authentication & Credentials State
  const { currentUser, loginWithGoogle, logoutUser, isAdmin: isFirebaseAdmin } = useAuth();
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('manstyle_admin_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [adminCreds, setAdminCreds] = useState<AdminCredentials>(() => getAdminCredentials());
  const [isChangeCredentialsModalOpen, setIsChangeCredentialsModalOpen] = useState(false);

  // Admin access requires a Firebase admin account (enforced by firestore.rules);
  // the local password is only a second step. Drop the session when admin rights are lost.
  React.useEffect(() => {
    if (!isFirebaseAdmin) {
      setIsAdminAuthenticated(false);
      try {
        sessionStorage.removeItem('manstyle_admin_auth');
      } catch {
        // ignore
      }
    }
  }, [isFirebaseAdmin]);

  // Subscribe to credentials updates across tabs and modals
  React.useEffect(() => {
    return subscribeToCredentialsChanges((updated) => {
      setAdminCreds(updated);
    });
  }, []);

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
    if (isAdminAuthenticated) {
      setActiveModal('admin');
    } else {
      setIsAdminAuthModalOpen(true);
    }
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

  const handleAdminAuthSuccess = () => {
    setIsAdminAuthenticated(true);
    try {
      sessionStorage.setItem('manstyle_admin_auth', 'true');
    } catch {
      // ignore
    }
    setIsAdminAuthModalOpen(false);
    setActiveModal('admin');
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    try {
      sessionStorage.removeItem('manstyle_admin_auth');
    } catch {
      // ignore
    }
    setActiveModal(null);
    onShowToast('Сессия администратора завершена. Доступ закрыт', 'info');
  };

  // Admin Panel Tab & Filter state
  const [adminTab, setAdminTab] = useState<
    'analytics' | 'products' | 'inventory' | 'orders' | 'delivery' | 'customers' | 'promos' | 'banners' | 'support' | 'storefront'
  >('analytics');
  const [supportTargetOrderId, setSupportTargetOrderId] = useState<string | null>(null);

  // Selected order IDs for detailed tracking & interactive delivery map
  const [selectedOrderIdForTracking, setSelectedOrderIdForTracking] = useState<string | null>(null);
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
  const [addrTitle, setAddrTitle] = useState('Дом');
  const [addrCity, setAddrCity] = useState('Москва');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrHouse, setAddrHouse] = useState('');
  const [addrEntrance, setAddrEntrance] = useState('');
  const [addrFloor, setAddrFloor] = useState('');
  const [addrApartment, setAddrApartment] = useState('');
  const [addrIntercom, setAddrIntercom] = useState('');
  const [addrPostal, setAddrPostal] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);

  // Card edit modal state
  const [editingCard, setEditingCard] = useState<SavedCard | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardBank, setCardBank] = useState('Т-Банк');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('IVAN PETROV');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardType, setCardType] = useState<'mir' | 'visa' | 'mastercard'>('mir');
  const [cardIsDefault, setCardIsDefault] = useState(false);

  // Body measurements modal state
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(false);
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
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            setNotifications(true);
            onUpdateProfile({
              ...profile,
              notificationsEnabled: true,
            });
            onShowToast('Push-уведомления включены! Статусы заказов будут приходить на устройство', 'success');
            try {
              new Notification('MANSTYLE', {
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
      sessionStorage.removeItem('manstyle_admin_auth');
    } catch {}
    setIsAdminAuthenticated(false);
    onUpdateProfile({
      name: 'Гость MANSTYLE',
      email: '',
      phone: '',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
      address: { street: '', city: 'Москва', postalCode: '' },
      savedAddresses: [],
      savedCards: [],
      notificationsEnabled: true,
      bonusPoints: 0,
    });
    onShowToast('Вы успешно вышли из аккаунта', 'info');
  };

  // --- Address Handlers ---
  const handleOpenAddAddress = () => {
    setEditingAddress(null);
    setAddrTitle('Дом');
    setAddrCity('Москва');
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
            city: addrCity.trim() || 'Москва',
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
        city: addrCity.trim() || 'Москва',
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

  // --- Card Handlers ---
  const handleOpenAddCard = () => {
    setEditingCard(null);
    setCardBank('Т-Банк');
    setCardNumber('');
    setCardHolder(profile.name.toUpperCase() || 'IVAN PETROV');
    setCardExpiry('08/28');
    setCardType('mir');
    setCardIsDefault(profile.savedCards.length === 0);
    setIsAddingCard(true);
  };

  const handleOpenEditCard = (card: SavedCard) => {
    setEditingCard(card);
    setCardBank(card.bankName);
    setCardNumber(card.cardNumber);
    setCardHolder(card.cardHolder);
    setCardExpiry(card.expiryDate);
    setCardType(card.cardType);
    setCardIsDefault(card.isDefault || false);
    setIsAddingCard(true);
  };

  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber.trim()) {
      onShowToast('Укажите номер карты', 'error');
      return;
    }

    const maskedNum = cardNumber.length > 4 ? `•••• ${cardNumber.slice(-4)}` : cardNumber;
    let updatedCards = [...profile.savedCards];

    if (editingCard) {
      updatedCards = updatedCards.map((c) => {
        if (c.id === editingCard.id) {
          return {
            ...c,
            bankName: cardBank,
            cardNumber: maskedNum,
            cardHolder: cardHolder,
            expiryDate: cardExpiry,
            cardType: cardType,
            isDefault: cardIsDefault,
          };
        }
        return cardIsDefault ? { ...c, isDefault: false } : c;
      });
    } else {
      const newCard: SavedCard = {
        id: `card-${Date.now()}`,
        bankName: cardBank,
        cardNumber: maskedNum,
        cardHolder: cardHolder,
        expiryDate: cardExpiry,
        cardType: cardType,
        isDefault: cardIsDefault || updatedCards.length === 0,
      };
      if (cardIsDefault) {
        updatedCards = updatedCards.map((c) => ({ ...c, isDefault: false }));
      }
      updatedCards.push(newCard);
    }

    onUpdateProfile({ ...profile, savedCards: updatedCards });
    setIsAddingCard(false);
    onShowToast(editingCard ? 'Карта обновлена' : 'Способ оплаты сохранен', 'success');
  };

  const handleDeleteCard = (id: string) => {
    const updated = profile.savedCards.filter((c) => c.id !== id);
    onUpdateProfile({ ...profile, savedCards: updated });
    onShowToast('Карта удалена', 'info');
  };

  const handleSetDefaultCard = (id: string) => {
    const updated = profile.savedCards.map((c) => ({
      ...c,
      isDefault: c.id === id,
    }));
    onUpdateProfile({ ...profile, savedCards: updated });
    onShowToast('Основная карта выбрана', 'success');
  };

  // Helper for tracking progress % and stage colors
  const getOrderStatusProgress = (status: Order['status'], isCancelled?: boolean) => {
    if (isCancelled) {
      return { percent: 0, label: 'Отменен', color: 'bg-rose-500', text: 'text-rose-700' };
    }
    switch (status) {
      case 'accepted':
        return { percent: 20, label: ORDER_STATUS_LABELS.accepted, color: 'bg-blue-600', text: 'text-blue-900' };
      case 'assembling':
        return { percent: 45, label: ORDER_STATUS_LABELS.assembling, color: 'bg-amber-500', text: 'text-amber-700' };
      case 'in_transit':
        return { percent: 75, label: ORDER_STATUS_LABELS.in_transit, color: 'bg-indigo-600', text: 'text-indigo-800' };
      case 'ready':
        return { percent: 90, label: ORDER_STATUS_LABELS.ready, color: 'bg-emerald-600', text: 'text-emerald-800' };
      case 'delivered':
        return { percent: 100, label: ORDER_STATUS_LABELS.delivered, color: 'bg-emerald-600', text: 'text-emerald-800' };
      default:
        return { percent: 10, label: 'В обработке', color: 'bg-blue-600', text: 'text-blue-800' };
    }
  };

  const filteredOrders = orders.filter((ord) => {
    if (orderFilter === 'active') return !ord.isCancelled && ord.status !== 'delivered';
    if (orderFilter === 'completed') return ord.isCancelled || ord.status === 'delivered';
    return true;
  });

  // Storefront & Boutique settings values with defaults
  const storeName = storefrontSettings?.storeName || 'MANSTYLE';
  const storeSlogan = storefrontSettings?.storeSlogan || 'Бутик мужской одежды & аксессуаров';
  const storePhone = storefrontSettings?.phone || '+7 (495) 123-45-67';
  const storeTelegram = storefrontSettings?.telegram || '@manstyle_official';
  const pickupAddress =
    storefrontSettings?.pickupAddress ||
    'Москва, Пресненская наб. 12, Башня Федерация Восток, 2 этаж';
  const workingHours = storefrontSettings?.workingHours || 'Ежедневно с 10:00 до 22:00';

  return (
    <div className="space-y-5 pb-28 animate-in fade-in duration-300">
      {/* Profile Card Header */}
      <div className="neu-card rounded-3xl p-3.5">
        {!isEditingProfile ? (
          <div className="neu-inset rounded-2xl p-4 flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-full neu-flat p-1 shrink-0 overflow-hidden">
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-full h-full object-cover rounded-full"
              />
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-lg font-bold text-[#2D3A4E] leading-tight truncate">
                {profile.name}
              </h2>
              <p className="text-xs text-[#5C6B80] truncate">{profile.email}</p>

              <button
                onClick={() => setIsEditingProfile(true)}
                className="neu-button rounded-full px-3 py-1 text-[11px] font-bold text-[#2D3A4E] hover:text-[#5F6ED0] inline-flex items-center gap-1.5 mt-1 cursor-pointer active:scale-95 transition-transform"
              >
                <Pencil className="w-3 h-3 text-[#5F6ED0]" />
                <span>Редактировать</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="neu-inset rounded-2xl p-4 space-y-3 bg-[#E3E8EF]">
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/60">
              <span className="text-xs font-bold text-[#2D3A4E]">Редактирование профиля</span>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="text-[#5C6B80] hover:text-[#2D3A4E]"
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
                className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E] focus:outline-none bg-[#E3E8EF]"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E] focus:outline-none bg-[#E3E8EF]"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон"
                className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E] focus:outline-none bg-[#E3E8EF]"
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
        <div className="neu-card rounded-3xl p-3">
          <button
            onClick={() => setActiveModal('orders')}
            className="w-full p-3.5 neu-inset rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#2D3A4E]">Заказы и трекинг</p>
                  {orders.some((o) => o.status !== 'delivered') && (
                    <span className="neu-inset-deep neu-inset-deep-animated text-[#5F6ED0] font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border border-[#5F6ED0]/30">
                      Активен
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5C6B80]">Отслеживание, статус и детализация ({orders.length})</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5C6B80]" />
          </button>
        </div>
      </div>

      {/* Firebase Cloud Synchronization & Auth Section */}
      <div className="neu-card rounded-3xl p-3.5 space-y-3">
        <div className="neu-inset rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <Database className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-[#2D3A4E]">Firebase Cloud</h3>
                  <span className="neu-button px-2 py-0.5 rounded-full text-[10px] font-black text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Firestore активен
                  </span>
                  {isFirebaseAdmin && (
                    <span className="neu-button-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Админ
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5C6B80]">
                  Синхронизация каталога, заказов, акций и чата с Firestore
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncingFirebase}
              title="Принудительно синхронизировать все данные с Firestore"
              className="neu-button rounded-xl p-2.5 text-[#5F6ED0] hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingFirebase ? 'animate-spin text-[#5F6ED0]' : ''}`} />
            </button>
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
                  <div className="w-7 h-7 rounded-full neu-button flex items-center justify-center font-bold text-[#5F6ED0] shrink-0 text-xs">
                    {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-[#2D3A4E] truncate">
                    {currentUser.displayName || 'Google Пользователь'}
                  </p>
                  <p className="text-[11px] text-[#5C6B80] truncate">{currentUser.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogoutClick}
                className="neu-button px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
              >
                <LogOut className="w-3 h-3" />
                <span>Выйти</span>
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-[#BAC5D5]/20 space-y-2 text-xs">
              <p className="text-[#5C6B80] text-[11px] leading-relaxed">
                Войдите через Google для привязки заказов и автоматической синхронизации личных данных с облаком:
              </p>
              <button
                type="button"
                onClick={handleGoogleAuthClick}
                disabled={isGoogleSigningIn}
                className="w-full neu-button rounded-xl py-2 px-3 flex items-center justify-center gap-2 font-bold text-[#2D3A4E] hover:text-[#5F6ED0] active:scale-95 transition-all text-xs cursor-pointer disabled:opacity-60"
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
                <span>{isGoogleSigningIn ? 'Авторизация...' : 'Войти через Google (Firebase Auth)'}</span>
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
            className="text-[11px] font-bold text-[#5F6ED0] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Управление ({profile.savedAddresses.length})</span>
          </button>
        </div>

        <div className="neu-card rounded-3xl p-4 space-y-2.5">
          {profile.savedAddresses.length === 0 ? (
            <div className="text-center py-3 text-xs text-[#5C6B80]">
              Сохраненных адресов нет.{' '}
              <button
                onClick={handleOpenAddAddress}
                className="text-[#5F6ED0] font-bold underline ml-1 cursor-pointer"
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
                  <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#2D3A4E]">{addr.title}</span>
                      {addr.isDefault && (
                        <span className="text-[10px] font-bold text-emerald-800 neu-inset px-2 py-0.5 rounded-full">
                          Основной
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5C6B80] truncate">
                      г. {addr.city}, {addr.street} {addr.apartment ? `, ${addr.apartment}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditAddress(addr)}
                    className="p-2 neu-button rounded-xl text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
                    title="Редактировать адрес"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            onClick={handleOpenAddAddress}
            className="w-full py-3 neu-button rounded-2xl text-xs font-bold text-[#5F6ED0] flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Добавить новый адрес</span>
          </button>
        </div>
      </div>

      {/* Section 3: Способы оплаты (Saved Cards) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Способы оплаты
          </h3>
          <button
            onClick={() => setActiveModal('cards')}
            className="text-[11px] font-bold text-[#5F6ED0] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Управление ({profile.savedCards.length})</span>
          </button>
        </div>

        <div className="neu-card rounded-3xl p-4 space-y-2.5">
          {profile.savedCards.length === 0 ? (
            <div className="text-center py-3 text-xs text-[#5C6B80]">
              Сохраненных карт нет.{' '}
              <button
                onClick={handleOpenAddCard}
                className="text-[#5F6ED0] font-bold underline ml-1 cursor-pointer"
              >
                Привязать карту
              </button>
            </div>
          ) : (
            profile.savedCards.map((card) => (
              <div
                key={card.id}
                className="neu-inset rounded-2xl p-3 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 font-bold text-xs uppercase">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#2D3A4E]">{card.bankName}</span>
                      <span className="text-[10px] uppercase font-bold text-[#5C6B80]">
                        {card.cardNumber}
                      </span>
                      {card.isDefault && (
                        <span className="text-[10px] font-bold text-emerald-800 neu-inset px-2 py-0.5 rounded-full">
                          Основная
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#5C6B80]">
                      Срок до {card.expiryDate} • {card.cardHolder}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenEditCard(card)}
                  className="p-2 neu-button rounded-xl text-[#5C6B80] hover:text-[#2D3A4E] shrink-0 cursor-pointer"
                  title="Изменить карту"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}

          <button
            onClick={handleOpenAddCard}
            className="w-full py-3 neu-button rounded-2xl text-xs font-bold text-[#5F6ED0] flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Привязать новую карту</span>
          </button>
        </div>
      </div>

      {/* Section: Параметры фигуры & Лекало РФ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase">
            Мерки профиля & Лекало РФ
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
            className="neu-button px-2.5 py-1 rounded-xl text-xs font-bold text-[#5F6ED0] flex items-center gap-1.5 cursor-pointer hover:text-[#2D3A4E] active:scale-95 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Изменить</span>
          </button>
        </div>

        <div className="neu-inset rounded-3xl p-4 space-y-3.5 bg-[#E3E8EF] border border-white/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 bg-[#E3E8EF]">
                <Ruler className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#2D3A4E] truncate">
                  Российское размерное лекало
                </p>
                <p className="text-[11px] text-[#5C6B80] font-medium truncate">
                  {profileRussianPattern.recommendedFit}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-[#5C6B80] block">Стандартный размер</span>
              <span className="text-sm font-black text-[#5F6ED0] neu-inset px-2 py-0.5 rounded-lg inline-block bg-[#E3E8EF]">
                {profileRussianPattern.topSizeLabel}
              </span>
            </div>
          </div>

          {/* Key Russian Pattern Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="neu-flat rounded-2xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
              <span className="text-[10px] text-[#5C6B80] font-medium block">Верхняя одежда</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.topSizeLabel}
              </span>
              <span className="text-[9px] text-[#5C6B80] block mt-0.5">
                ПОГ: {Math.round((profile.bodyMeasurements?.chest ?? 104) / 2)} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
              <span className="text-[10px] text-[#5C6B80] font-medium block">Брюки / Джинсы</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.bottomSizeLabel}
              </span>
              <span className="text-[9px] text-[#5C6B80] block mt-0.5">
                Пояс: {profile.bodyMeasurements?.waist ?? 95} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
              <span className="text-[10px] text-[#5C6B80] font-medium block">Ростовка РФ</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.heightGroupNumber}-я группа
              </span>
              <span className="text-[9px] text-[#5C6B80] block mt-0.5">
                {profileRussianPattern.heightRange}
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center bg-[#E3E8EF] border border-white/70">
              <span className="text-[10px] text-[#5C6B80] font-medium block">Полнота / ИМТ</span>
              <span className="text-xs font-black text-[#2D3A4E]">
                {profileRussianPattern.fullnessGroup}-я полнота
              </span>
              <span className="text-[9px] text-[#5C6B80] block mt-0.5">
                ИМТ: {profileRussianPattern.bmi}
              </span>
            </div>
          </div>

          {/* Measurements summary strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#BAC5D5]/40 text-[11px] font-bold text-[#5C6B80]">
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
      </div>

      {/* Section 4: Избранное */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Избранное
        </h3>
        <div className="neu-card rounded-3xl p-3">
          <button
            onClick={() => setActiveTab('favorites')}
            className="w-full p-3.5 neu-inset rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <Heart className="w-5 h-5 fill-[#5F6ED0]/20" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Избранные товары</p>
                <p className="text-xs text-[#5C6B80]">
                  Сохраненные модели ({favoritesCount})
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5C6B80]" />
          </button>
        </div>
      </div>

      {/* Section: Флагманский бутик & Консьерж */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Флагманский бутик
        </h3>
        <div className="neu-inset rounded-3xl p-4 sm:p-5 space-y-3 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF]">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E]">
                  {storeName} • Флагманский бутик
                </h3>
                <p className="text-[10px] text-[#5C6B80] font-medium">{storeSlogan}</p>
              </div>
            </div>
            <span className="neu-inset px-2.5 py-1 rounded-xl text-[10px] font-black text-emerald-700 bg-[#E3E8EF]">
              Открыт
            </span>
          </div>

          <div className="space-y-2 text-xs text-[#2D3A4E] pt-1">
            <div className="neu-inset rounded-2xl p-3 space-y-1 bg-[#E3E8EF]">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0 mt-0.5" />
                <span className="font-semibold text-[11px] leading-relaxed">{pickupAddress}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Clock className="w-3.5 h-3.5 text-[#5C6B80] shrink-0" />
                <span className="text-[11px] text-[#5C6B80] font-medium">{workingHours}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <a
                href={`tel:${storePhone.replace(/[^\d+]/g, '')}`}
                className="flex-1 min-w-[130px] py-2.5 px-3 neu-inset rounded-xl text-[11px] font-black text-[#2D3A4E] hover:text-[#5F6ED0] flex items-center justify-center gap-1.5 transition-all bg-[#E3E8EF] border border-transparent hover:border-[#5F6ED0]/30"
              >
                <Phone className="w-3.5 h-3.5 text-[#5F6ED0]" />
                <span>{storePhone}</span>
              </a>

              {onOpenSupportChat ? (
                <button
                  type="button"
                  onClick={onOpenSupportChat}
                  className="flex-1 min-w-[130px] py-2.5 px-3 neu-button-accent rounded-xl text-[11px] font-black text-white flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Чат с консьержем</span>
                </button>
              ) : (
                <a
                  href={`https://t.me/${storeTelegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-[130px] py-2.5 px-3 neu-inset rounded-xl text-[11px] font-black text-[#5F6ED0] flex items-center justify-center gap-1.5 bg-[#E3E8EF] border border-transparent"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{storeTelegram}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Поддержка */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Поддержка
        </h3>
        <div className="neu-card rounded-3xl p-3 space-y-2">
          <button
            onClick={() => {
              if (onOpenSupportChat) {
                onOpenSupportChat();
              } else {
                setActiveModal('support');
              }
            }}
            className="w-full p-3.5 neu-inset rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Служба поддержки</p>
                <p className="text-xs text-[#5C6B80]">Помощь и консультации 24/7</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5C6B80]" />
          </button>

          <button
            onClick={() => setActiveModal('faq')}
            className="w-full p-3.5 neu-inset rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Часто задаваемые вопросы</p>
                <p className="text-xs text-[#5C6B80]">Возврат, гарантия, доставка</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5C6B80]" />
          </button>
        </div>
      </div>

      {/* Section 6: Настройки */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Настройки
        </h3>
        <div className="neu-card rounded-3xl p-3 space-y-2">
          {/* Admin Panel Item Trigger */}
          <button
            id="admin-panel-trigger-btn"
            type="button"
            onClick={handleOpenAdminPanel}
            className="w-full p-3.5 neu-inset rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all group cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-[#2D3A4E]">Панель администратора</p>
                  <span className="neu-button-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Управление
                  </span>
                  {isAdminAuthenticated && isFirebaseAdmin ? (
                    <span className="neu-button px-2 py-0.5 rounded-full text-[10px] font-black text-emerald-600 bg-[#E3E8EF] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Админ Firebase
                    </span>
                  ) : (
                    <span className="neu-inset px-2 py-0.5 rounded-full text-[10px] font-bold text-[#5C6B80] bg-[#E3E8EF] flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      {isFirebaseAdmin ? 'Требуется пароль' : 'Требуется вход Google'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5C6B80]">Модули каталога, заказов, акций и настроек витрины</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-[#5C6B80] group-hover:text-[#5F6ED0] transition-colors" />
            </div>
          </button>

          <div className="p-3.5 neu-inset rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Уведомления</p>
                <p className="text-xs text-[#5C6B80]">Push о статусе заказов</p>
              </div>
            </div>

            <button
              onClick={toggleNotifications}
              className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                notifications ? 'neu-button-accent text-white' : 'neu-inset bg-[#BAC5D5]/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white neu-flat-sm border border-white/90 transform transition-transform duration-200 ${
                  notifications ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <button
            onClick={() => setActiveModal('security')}
            className="w-full p-3.5 neu-inset rounded-2xl flex items-center justify-between text-left hover:opacity-95 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Безопасность данных</p>
                <p className="text-xs text-[#5C6B80]">Конфиденциальность, пароль и 2FA</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5C6B80]" />
          </button>
        </div>
      </div>

      {/* Logout Action Button */}
      <button
        onClick={handleFullLogout}
        className="w-full neu-inset rounded-2xl p-4 flex items-center justify-center gap-2 text-[#5C6B80] hover:text-[#7E525E] font-bold text-sm active:scale-[0.99] transition-all cursor-pointer bg-[#E3E8EF] border border-transparent hover:border-[#7E525E]/30"
      >
        <LogOut className="w-5 h-5 stroke-[2]" />
        <span>Выйти из аккаунта</span>
      </button>

      {/* ================= MODAL: ORDER HISTORY & TRACKING ================= */}
      {activeModal === 'orders' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-lg w-full space-y-4 max-h-[88vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-[#5F6ED0]">
                  <Package className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#2D3A4E]">История и трекинг заказов</h3>
                  <p className="text-[11px] text-[#5C6B80] font-medium">Все ваши заказы в одном месте</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order Filter Pills */}
            <div className="flex items-center gap-2 border-b border-[#BAC5D5]/50 pb-3">
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
                      ? 'neu-button-accent text-white font-extrabold'
                      : 'neu-button text-[#5C6B80] hover:text-[#2D3A4E]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Order list */}
            {filteredOrders.length === 0 ? (
              <div className="text-center py-10 space-y-2 neu-inset rounded-2xl p-6">
                <ShoppingBag className="w-10 h-10 text-[#5C6B80] mx-auto opacity-50" />
                <p className="text-xs font-extrabold text-[#2D3A4E]">Заказов не найдено</p>
                <p className="text-[11px] text-[#5C6B80]">Сделайте первый заказ в нашем каталоге!</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredOrders.map((ord) => {
                  const statusInfo = getOrderStatusProgress(ord.status, ord.isCancelled);
                  return (
                    <div
                      key={ord.id}
                      className="neu-inset rounded-2xl p-4 space-y-3 bg-[#E3E8EF]"
                    >
                      {/* Top Header info */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            <span className="text-sm font-black text-[#2D3A4E] whitespace-nowrap">№ {ord.id}</span>
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${
                                !ord.isCancelled && ord.status !== 'delivered'
                                  ? 'neu-inset-deep neu-inset-deep-animated text-[#5F6ED0] bg-[#E3E8EF] border border-[#5F6ED0]/30'
                                  : `${statusInfo.text} neu-flat`
                              }`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#5C6B80] font-medium">{ord.date}</p>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-black text-[#2D3A4E]">
                            {(ord.totalPrice ?? 0).toLocaleString('ru-RU')} ₽
                          </span>
                          <p className="text-[10px] text-[#5C6B80]">
                            {ord.items.reduce((a, b) => a + b.quantity, 0)} тов.
                          </p>
                        </div>
                      </div>

                      {/* Mini visual status progress line */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-[#5C6B80]">
                          <span>Прогресс доставки</span>
                          <span className="text-[#5F6ED0] font-black">{statusInfo.percent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden neu-inset relative bg-[#D8DFEB]">
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
                                <span className="text-[10px] font-bold text-blue-700 neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1 bg-blue-50/80 border border-blue-200/60">
                                  <Mail className="w-3 h-3 text-blue-600" />
                                  Почта России
                                </span>
                                {ord.trackingNumber ? (
                                  <span className="text-[10px] font-mono font-bold text-[#5F6ED0] neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1 bg-[#E3E8EF]">
                                    {ord.trackingNumber}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-amber-800 neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1 bg-amber-50/60">
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    Трек формируется
                                  </span>
                                )}
                              </div>
                            ) : isTK ? (
                              ord.trackingNumber ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold text-[#5F6ED0] neu-flat px-2 py-0.5 rounded-lg flex items-center gap-1 bg-[#E3E8EF]">
                                    <Truck className="w-3 h-3 text-[#5F6ED0]" />
                                    {ord.trackingNumber}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] font-medium text-amber-800 neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1 bg-amber-50/60">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  Трек-номер формируется
                                </span>
                              )
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-[#2D3A4E] neu-inset px-2 py-0.5 rounded-lg flex items-center gap-1 bg-[#E3E8EF]">
                                  {isPickup ? (
                                    <Store className="w-3 h-3 text-[#5F6ED0]" />
                                  ) : isExpress ? (
                                    <Zap className="w-3 h-3 text-amber-500" />
                                  ) : (
                                    <Bike className="w-3 h-3 text-[#5F6ED0]" />
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
                                    className="p-1 px-2 neu-button rounded-lg text-[10px] font-bold text-[#5F6ED0] flex items-center gap-1 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                                    title="Открыть карту перемещения курьера"
                                  >
                                    <Navigation className="w-3 h-3" />
                                    <span>Карта</span>
                                  </button>
                                )}
                              </div>
                            )}

                            <span className="text-[10px] text-[#5C6B80] font-medium">
                              {isPost ? 'Посылка 1-го класса' : isTK ? (ord.deliveryMethod || 'ТК') : isPickup ? 'Самовывоз' : 'Курьерская доставка'}
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
                              src={it.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                              alt=""
                              className="w-10 h-10 rounded-xl object-cover neu-flat p-0.5 shrink-0"
                            />
                          ))}
                          {ord.items.length > 4 && (
                            <span className="text-[10px] font-extrabold text-[#5C6B80] neu-inset px-2 py-1 rounded-xl">
                              +{ord.items.length - 4}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isCourierDelivery(ord.deliveryMethod, ord.trackingCompany) && !ord.isCancelled && ord.status !== 'delivered' && (
                            <a
                              href="tel:+79165550199"
                              onClick={(e) => {
                                e.stopPropagation();
                                onShowToast('Вызов курьера: +7 (916) 555-01-99', 'info');
                              }}
                              className="p-2 rounded-xl neu-button text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
                              title="Позвонить курьеру (+7 916 555-01-99)"
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
                              className="p-2 rounded-xl neu-button text-[#5C6B80] hover:text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
                              title="Написать в службу поддержки"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedOrderIdForTracking(ord.id)}
                            className="neu-button-accent px-3 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1 shrink-0 active:scale-95 transition-transform cursor-pointer"
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
      )}

      {/* ================= DETAILED ORDER TRACKING MODAL ================= */}
      {selectedOrderForTracking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E] overscroll-contain transform-gpu">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-[#2D3A4E]">
                    Заказ № {selectedOrderForTracking.id}
                  </h3>
                  <span className="text-[10px] font-extrabold text-[#5F6ED0] neu-inset px-2.5 py-0.5 rounded-full">
                    Трекинг
                  </span>
                </div>
                <p className="text-[11px] text-[#5C6B80] font-medium">
                  Оформлен: {selectedOrderForTracking.date}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrderIdForTracking(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tracking Code Banner OR Clean Delivery Info Notice */}
            {(() => {
              const isPost = isRussianPostDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isTK = isTransportCompanyDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isPickup = isPickupDelivery(selectedOrderForTracking.deliveryMethod);
              const isCourier = isCourierDelivery(selectedOrderForTracking.deliveryMethod, selectedOrderForTracking.trackingCompany);
              const isExpress = (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('экспресс') || (selectedOrderForTracking.deliveryMethod || '').toLowerCase().includes('express');

              if (isPost) {
                return (
                  <div className="neu-inset rounded-2xl p-3.5 bg-blue-50/70 border border-blue-200/80 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-blue-600" />
                          Почта России • Отправление 1-го класса
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
                          className="neu-button p-2 rounded-xl text-blue-700 hover:text-blue-900 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Копия трека</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-800 neu-inset px-2.5 py-1 rounded-lg bg-amber-50">
                          Формируется
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5C6B80] leading-snug">
                      Адрес доставки: {selectedOrderForTracking.deliveryAddress || 'Почтовый адрес получателя'}. Получение осуществляется в отделении связи по паспорту или SMS-коду без курьерского сопровождения.
                    </p>
                  </div>
                );
              }

              if (isTK) {
                if (selectedOrderForTracking.trackingNumber) {
                  return (
                    <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-[#5C6B80] uppercase tracking-wider flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-[#5F6ED0]" />
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
                          className="neu-button p-2 rounded-xl text-[#5C6B80] hover:text-[#2D3A4E] flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Копия</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-[#5C6B80] leading-snug">
                        Направление: {selectedOrderForTracking.deliveryAddress || 'Пункт назначения ТК'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="neu-inset rounded-2xl p-3.5 bg-amber-50/80 border border-amber-300/70 space-y-2 text-amber-900">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-black text-amber-900">
                          Трек-номер формируется транспортной компанией
                        </p>
                        <p className="text-[11px] text-amber-800 leading-snug">
                          Заказ принят и готовится к передаче в транспортную компанию. Как только перевозчик зарегистрирует отправление, трек-номер появится в личном кабинете.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Non-TK: Courier / Pickup / Express
              return (
                <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-[#5C6B80] uppercase tracking-wider flex items-center gap-1">
                        {isPickup ? <Store className="w-3.5 h-3.5 text-[#5F6ED0]" /> : isExpress ? <Zap className="w-3.5 h-3.5 text-amber-500" /> : <Bike className="w-3.5 h-3.5 text-[#5F6ED0]" />}
                        {isPickup ? 'Самовывоз из бутика' : isExpress ? 'Срочная экспресс-доставка' : 'Курьерская служба MANSTYLE'}
                      </span>
                      <p className="text-xs font-black text-[#2D3A4E]">
                        {selectedOrderForTracking.deliveryMethod || (isPickup ? 'Самовывоз' : 'Курьерская доставка')}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-[#5F6ED0] neu-flat px-2 py-0.5 rounded-lg bg-white/70">
                      {isPickup ? 'В бутике' : 'До двери'}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#5C6B80] leading-snug">
                    {isPickup
                      ? `Пункт выдачи: ${selectedOrderForTracking.deliveryAddress || 'Бутик MANSTYLE'}. Заказ выдается сотрудниками бутика без трек-номера.`
                      : `Адрес доставки: ${selectedOrderForTracking.deliveryAddress || 'Адрес клиента'}. Заказ доставляется штатной службой MANSTYLE без сторонних трек-номеров.`}
                  </p>

                  {isCourier && (
                    <button
                      type="button"
                      onClick={() => setSelectedOrderIdForMap(selectedOrderForTracking.id)}
                      className="w-full py-2.5 px-3.5 neu-button rounded-xl text-xs font-black text-[#5F6ED0] flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                    >
                      <Navigation className="w-4 h-4 text-[#5F6ED0] animate-pulse" />
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
                <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#5C6B80] block mb-1">
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
                          <span className="text-[10px] font-black text-[#5F6ED0] neu-inset px-2.5 py-1 rounded-lg whitespace-nowrap">
                            {trackingStatusInfo.percent}% выполнено
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedOrderForTracking.estimatedDelivery && (
                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-[10px] text-[#5C6B80] font-bold block mb-1">Ожидается:</span>
                        <p className="text-xs font-extrabold text-[#2D3A4E] flex items-center sm:justify-end gap-1 whitespace-nowrap neu-inset px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0" />
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
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all shrink-0 ${
                                isStepDone
                                  ? 'neu-button-accent text-white shadow-sm'
                                  : isStepActive
                                  ? 'neu-inset-deep text-[#5F6ED0] bg-[#E3E8EF] border border-[#5F6ED0] ring-1 ring-[#5F6ED0]/30 font-black'
                                  : 'neu-inset text-[#5C6B80]/70 bg-[#E3E8EF]'
                              }`}
                            >
                              {isStepDone ? (
                                <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <span
                              className={`text-[9px] mt-1 font-bold transition-colors text-center truncate max-w-full ${
                                isStepDone
                                  ? 'text-[#2D3A4E]'
                                  : isStepActive
                                  ? 'text-[#5F6ED0] font-black'
                                  : 'text-[#5C6B80]/70'
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
                    <div className="relative w-full h-2.5 rounded-full overflow-hidden neu-inset bg-[#D8DFEB]">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out relative bg-gradient-to-r from-[#5F6ED0] via-[#7888EC] to-[#5F6ED0]"
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
            <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
              <div className="flex items-center justify-between border-b border-[#BAC5D5]/40 pb-2">
                <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#5F6ED0]" />
                  Этапы доставки
                </span>
                <span className="text-[10px] text-[#5F6ED0] font-black neu-button px-2 py-0.5 rounded-full">
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
                              className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black transition-all z-10 ${
                                isCompleted
                                  ? 'neu-button-accent text-white shadow-sm'
                                  : isActive
                                  ? 'neu-inset-deep text-[#5F6ED0] bg-[#E3E8EF] border border-[#5F6ED0] ring-2 ring-[#5F6ED0]/20'
                                  : 'neu-inset text-[#5C6B80] bg-[#E3E8EF]'
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
                              <div className="relative w-1.5 flex-1 my-1 neu-inset rounded-full bg-[#D5DEEB] overflow-hidden min-h-[38px]">
                                <div
                                  className={`w-full rounded-full transition-all duration-500 ease-out relative ${
                                    isPathToNextFilled
                                      ? 'h-full bg-gradient-to-b from-[#5F6ED0] to-[#7888EC]'
                                      : isPathToNextActive
                                      ? 'h-full bg-gradient-to-b from-[#5F6ED0] via-[#8594F7] to-[#BAC5D5]'
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
                                ? 'neu-inset-deep border-[#5F6ED0]/50 bg-[#E3E8EF]'
                                : isCompleted
                                ? 'neu-flat-sm border-[#5F6ED0]/40 bg-[#E3E8EF]'
                                : 'neu-flat-sm border-white/60 opacity-60 bg-[#E3E8EF]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isActive
                                        ? 'text-[#5F6ED0] font-black'
                                        : isCompleted
                                        ? 'text-[#2D3A4E]'
                                        : 'text-[#5C6B80]'
                                    }`}
                                  >
                                    {stage.title}
                                  </span>
                                  {isActive && (
                                    <span className="text-[9px] font-extrabold text-[#5F6ED0] neu-inset px-2 py-0.5 rounded-full flex items-center gap-1 bg-[#E3E8EF]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#5F6ED0] animate-ping" />
                                      <span>В процессе</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#5C6B80] leading-snug mt-1">
                                  {stage.desc}
                                </p>
                              </div>

                              {stage.time && (
                                <span
                                  className={`text-[10px] font-mono shrink-0 px-2 py-0.5 rounded-md font-bold ${
                                    isActive
                                      ? 'text-[#5F6ED0] neu-inset bg-[#E3E8EF]'
                                      : isCompleted
                                      ? 'text-emerald-800 neu-flat bg-[#E3E8EF]'
                                      : 'text-[#5C6B80]'
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
                    <span className="text-[10px] text-[#5C6B80] font-semibold">
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
                                  ? 'bg-[#5F6ED0] ring-4 ring-[#5F6ED0]/20'
                                  : 'bg-[#BAC5D5]'
                              }`}
                            />
                            {!isLast && (
                              <div className="w-1 flex-1 my-1 neu-inset rounded-full bg-[#D5DEEB] min-h-[26px] overflow-hidden">
                                <div
                                  className={`w-full h-full transition-all duration-300 ${
                                    isPathFilled
                                      ? 'bg-[#5F6ED0]'
                                      : 'bg-transparent'
                                  }`}
                                />
                              </div>
                            )}
                          </div>

                          <div
                            className={`flex-1 neu-flat-sm rounded-xl p-3 border mb-2.5 transition-all ${
                              step.completed
                                ? 'border-[#5F6ED0]/50'
                                : 'border-white/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs gap-2">
                              <span className="font-bold text-[#2D3A4E] truncate">{step.title}</span>
                              <span className="text-[10px] text-[#5C6B80] font-medium shrink-0">{step.date}</span>
                            </div>
                            {step.description && (
                              <p className="text-[11px] text-[#5C6B80] leading-snug mt-0.5">
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
                    className="flex items-center justify-between neu-inset p-2.5 rounded-xl bg-[#E3E8EF]"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={it.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded-lg object-cover neu-flat"
                      />
                      <div>
                        <p className="text-xs font-bold text-[#2D3A4E] leading-tight">
                          {it.product.title}
                        </p>
                        <p className="text-[10px] text-[#5C6B80]">
                          {it.selectedColor}, разм. {it.selectedSize} • {it.quantity} шт.
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
                <div className="neu-inset rounded-2xl p-3 bg-emerald-50/60 border border-emerald-300/60 space-y-1.5 text-xs text-emerald-900">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold flex items-center gap-1.5 text-emerald-800">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Состав заказа был скорректирован
                    </span>
                    {selectedOrderForTracking.refundAmount && selectedOrderForTracking.refundAmount > 0 && (
                      <span className="font-black text-emerald-700 neu-flat px-2 py-0.5 rounded-lg text-[11px]">
                        Возврат: {selectedOrderForTracking.refundAmount.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                  </div>
                  {selectedOrderForTracking.adjustmentReason && (
                    <p className="text-[11px] text-emerald-700">
                      Причина: {selectedOrderForTracking.adjustmentReason}
                    </p>
                  )}
                  {selectedOrderForTracking.originalTotalPrice && (
                    <p className="text-[10px] text-[#5C6B80]">
                      Исходная сумма: <span className="line-through">{selectedOrderForTracking.originalTotalPrice.toLocaleString('ru-RU')} ₽</span> • Текущая сумма: <strong className="text-[#2D3A4E]">{selectedOrderForTracking.totalPrice.toLocaleString('ru-RU')} ₽</strong>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Delivery address & Payment info */}
            <div className="space-y-1.5 text-xs text-[#5C6B80] neu-inset bg-[#E3E8EF] p-3.5 rounded-2xl">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#5F6ED0] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#2D3A4E]">Адрес доставки:</span>
                  <p className="text-[11px] text-[#5C6B80]">
                    {selectedOrderForTracking.deliveryAddress} ({selectedOrderForTracking.deliveryMethod})
                  </p>
                </div>
              </div>
              {selectedOrderForTracking.paymentMethod && (
                <div className="flex items-center gap-2 pt-1">
                  <CreditCard className="w-4 h-4 text-[#5F6ED0] shrink-0" />
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
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-blue-50/40 border border-blue-200/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center bg-white text-blue-700 font-black text-xs shrink-0 shadow-sm border border-blue-200/80">
                        ПР
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[#2D3A4E] truncate">Почта России</p>
                        <p className="text-[10px] text-[#5C6B80] truncate">Отправление 1-го класса &bull; Выдача в отделении</p>
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
                        className="py-1.5 px-3 rounded-xl neu-button text-blue-700 hover:text-blue-900 hover:scale-105 active:scale-95 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                        title="Написать в чат поддержки"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                        <span>Чат заботы</span>
                      </button>
                    )}
                  </div>
                );
              }

              if (isPickup) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] flex items-center justify-between gap-3 border border-white/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center bg-white text-[#5F6ED0] font-black text-xs shrink-0 shadow-sm border border-white/90">
                        MS
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[#2D3A4E] truncate">Бутик MANSTYLE</p>
                        <p className="text-[10px] text-[#5C6B80] truncate">Персональный стилист &bull; Примерочный зал</p>
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
                        className="py-1.5 px-3 rounded-xl neu-button text-[#2D3A4E] hover:text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                        title="Написать в чат поддержки"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[#5F6ED0]" />
                        <span>Консьерж</span>
                      </button>
                    )}
                  </div>
                );
              }

              if (isCourier) {
                return (
                  <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] flex items-center justify-between gap-3 border border-white/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center bg-white text-[#5F6ED0] font-black text-xs shrink-0 shadow-sm border border-white/90">
                        АС
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black text-[#2D3A4E] truncate">
                            {isExpress ? 'Иван (Экспресс)' : 'Алексей Смирнов'}
                          </p>
                          <span className="text-[9px] font-bold text-amber-700 neu-flat px-1 py-0.2 rounded bg-amber-50 shrink-0">
                            ★ 4.96
                          </span>
                        </div>
                        <p className="text-[10px] text-[#5C6B80] truncate">
                          {isExpress ? 'Срочный курьер ManStyle' : 'Курьер ManStyle • Lada Largus'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!selectedOrderForTracking.isCancelled && selectedOrderForTracking.status !== 'delivered' && (
                        <a
                          href="tel:+79165550199"
                          onClick={() => onShowToast('Вызов курьера: +7 (916) 555-01-99', 'info')}
                          className="py-1.5 px-2.5 rounded-xl neu-button text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform flex items-center gap-1 text-[11px] font-extrabold cursor-pointer"
                          title="Позвонить курьеру (+7 916 555-01-99)"
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
                          className="py-1.5 px-2.5 rounded-xl neu-button text-[#2D3A4E] hover:text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                          title="Написать в чат поддержки"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-[#5F6ED0]" />
                          <span>Чат</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // General Transport Company (СДЭК / DPD / etc)
              return (
                <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] flex items-center justify-between gap-3 border border-white/70">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center bg-white text-emerald-600 font-black text-xs shrink-0 shadow-sm border border-emerald-200/80">
                      ТК
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#2D3A4E] truncate">Транспортная компания</p>
                      <p className="text-[10px] text-[#5C6B80] truncate">Доставка до ПВЗ / по адресу</p>
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
                      className="py-1.5 px-3 rounded-xl neu-button text-[#2D3A4E] hover:text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform flex items-center gap-1 text-[11px] font-bold cursor-pointer shrink-0"
                      title="Написать в чат поддержки"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#5F6ED0]" />
                      <span>Чат заботы</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  onShowToast('Товары заказа снова добавлены в корзину', 'success');
                }}
                className="flex-1 neu-button-accent py-3 px-4 rounded-2xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#5F6ED0]" />
                <h3 className="text-base font-extrabold text-[#2D3A4E]">Адреса доставки</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {profile.savedAddresses.map((addr) => (
                <div key={addr.id} className="neu-inset rounded-2xl p-3.5 space-y-2 bg-[#E3E8EF]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900">{addr.title}</span>
                      {addr.isDefault && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Основной
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditAddress(addr)}
                        className="p-1.5 neu-button rounded-xl text-slate-600 hover:text-slate-900"
                        title="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="p-1.5 neu-button rounded-xl text-[#5C6B80] hover:text-[#7E525E]"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                    {formatAddress(addr)}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {addr.house && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#2D3A4E] bg-white/70">
                        д. {addr.house}
                      </span>
                    )}
                    {addr.entrance && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#2D3A4E] bg-white/70">
                        подъезд {addr.entrance}
                      </span>
                    )}
                    {addr.floor && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#2D3A4E] bg-white/70">
                        эт. {addr.floor}
                      </span>
                    )}
                    {addr.apartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#2D3A4E] bg-white/70">
                        {addr.apartment.toLowerCase().includes('кв') || addr.apartment.toLowerCase().includes('оф')
                          ? addr.apartment
                          : `кв. ${addr.apartment}`}
                      </span>
                    )}
                    {addr.intercom && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#5F6ED0] bg-[#5F6ED0]/10">
                        домофон: {addr.intercom}
                      </span>
                    )}
                  </div>

                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefaultAddress(addr.id)}
                      className="text-[11px] font-bold text-[#5F6ED0] hover:underline pt-1 block cursor-pointer"
                    >
                      Сделать основным адресом
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleOpenAddAddress}
              className="w-full neu-button-accent rounded-2xl py-3 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Добавить новый адрес</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT ADDRESS FORM ================= */}
      {isAddingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="neu-modal rounded-[28px] p-6 max-w-md w-full space-y-4 relative text-[#2D3A4E] border border-white/80">
            <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/50">
              <h3 className="text-base font-extrabold text-[#2D3A4E]">
                {editingAddress ? 'Редактировать адрес' : 'Добавить адрес'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingAddress(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] transition-colors cursor-pointer"
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
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
                  placeholder="Дом"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Город</label>
                  <input
                    type="text"
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
                    placeholder="Москва"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Индекс</label>
                  <input
                    type="text"
                    value={addrPostal}
                    onChange={(e) => setAddrPostal(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
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
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
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
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
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
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
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
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
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
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
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
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none bg-[#E3E8EF]"
                    placeholder="25K / #1234"
                  />
                </div>
              </div>

              {/* Delivery Preview */}
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-1">
                <span className="text-[10px] font-bold text-[#5C6B80] uppercase tracking-wider block">
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
                      ? 'neu-button-accent text-white'
                      : 'neu-inset text-transparent bg-[#E3E8EF]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="font-bold text-xs text-[#2D3A4E] group-hover:text-[#5F6ED0]">
                  Сделать основным адресом
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAddress(false)}
                  className="flex-1 py-3.5 neu-button rounded-2xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] transition-colors cursor-pointer"
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

      {/* ================= MODAL: SAVED CARDS MANAGEMENT ================= */}
      {activeModal === 'cards' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#5F6ED0]" />
                <h3 className="text-base font-extrabold text-[#2D3A4E]">Способы оплаты</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {profile.savedCards.map((card) => (
                <div key={card.id} className="neu-inset rounded-2xl p-3.5 space-y-2 bg-[#E3E8EF]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#2D3A4E]">{card.bankName}</span>
                      <span className="text-[10px] uppercase font-bold text-[#5C6B80]">
                        {card.cardNumber}
                      </span>
                      {card.isDefault && (
                        <span className="text-[10px] font-bold text-emerald-700 neu-inset px-2 py-0.5 rounded-full">
                          Основная
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditCard(card)}
                        className="p-1.5 neu-button rounded-xl text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
                        title="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="p-1.5 neu-button rounded-xl text-[#5C6B80] hover:text-[#7E525E] cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#5C6B80]">
                    Владелец: {card.cardHolder} • Действует до: {card.expiryDate}
                  </p>

                  {!card.isDefault && (
                    <button
                      onClick={() => handleSetDefaultCard(card.id)}
                      className="text-[11px] font-bold text-[#5F6ED0] hover:underline pt-1 block cursor-pointer"
                    >
                      Сделать основной картой
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleOpenAddCard}
              className="w-full neu-button-accent rounded-2xl py-3 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Привязать карту</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT CARD FORM ================= */}
      {isAddingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 border border-white/80 text-[#2D3A4E]">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2">
              <h3 className="text-sm font-extrabold text-[#2D3A4E]">
                {editingCard ? 'Изменить карту' : 'Привязка новой карты'}
              </h3>
              <button
                onClick={() => setIsAddingCard(false)}
                className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Название банка
                </label>
                <input
                  type="text"
                  value={cardBank}
                  onChange={(e) => setCardBank(e.target.value)}
                  className="w-full neu-inset rounded-xl py-2.5 px-3 text-[#2D3A4E] focus:outline-none placeholder:text-[#5C6B80]/60"
                  placeholder="Т-Банк, Сбербанк, Альфа-Банк"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Номер карты (16 цифр)
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="w-full neu-inset rounded-xl py-2.5 px-3 text-[#2D3A4E] focus:outline-none font-mono placeholder:text-[#5C6B80]/60"
                  placeholder="2200 7000 0000 4821"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Срок действия (ММ/ГГ)
                </label>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  className="w-full neu-inset rounded-xl py-2.5 px-3 text-[#2D3A4E] focus:outline-none placeholder:text-[#5C6B80]/60"
                  placeholder="08/28"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Платежная система
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 neu-inset rounded-xl bg-[#E3E8EF]">
                  {[
                    { id: 'mir', label: 'МИР' },
                    { id: 'visa', label: 'Visa' },
                    { id: 'mastercard', label: 'Mastercard' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCardType(t.id as any)}
                      className={`py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                        cardType === t.id
                          ? 'neu-button text-[#5F6ED0] bg-[#E3E8EF]'
                          : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                  Имя владельца на карте
                </label>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                  className="w-full neu-inset rounded-xl py-2.5 px-3 text-[#2D3A4E] focus:outline-none uppercase placeholder:text-[#5C6B80]/60"
                  placeholder="IVAN PETROV"
                  required
                />
              </div>

              <button
                type="button"
                onClick={() => setCardIsDefault(!cardIsDefault)}
                className="flex items-center gap-2.5 pt-1 text-left w-full group cursor-pointer"
              >
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                    cardIsDefault
                      ? 'neu-button-accent text-white'
                      : 'neu-inset text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="font-bold text-xs text-[#2D3A4E] group-hover:text-[#5F6ED0]">
                  Сделать основной картой
                </span>
              </button>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCard(false)}
                  className="flex-1 py-2.5 neu-button rounded-xl text-[#5C6B80] font-bold hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 neu-button-accent rounded-xl font-extrabold text-white cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-4 sm:p-6 max-w-lg w-full space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar border border-white/80 text-[#2D3A4E] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF]">
                  <Ruler className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#2D3A4E]">
                    Мерки профиля & Лекало РФ
                  </h3>
                  <p className="text-[11px] text-[#5C6B80] font-medium">
                    Стандарты ГОСТ 31399-2009 / ГОСТ Р 52771-2007
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingMeasurements(false)}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Russian Sizing Pattern (Лекало РФ) Live Summary */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3 border border-white/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#5F6ED0]" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#2D3A4E]">
                    Размерное лекало РФ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGostTable(!showGostTable)}
                  className="neu-button px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#5F6ED0] hover:text-[#2D3A4E] cursor-pointer"
                >
                  {showGostTable ? 'Скрыть таблицу' : 'Таблица ГОСТ'}
                </button>
              </div>

              {/* 4 Bento Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="neu-flat rounded-xl p-2 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[9px] font-bold text-[#5C6B80] block">Верх РФ</span>
                  <span className="text-xs font-black text-[#5F6ED0] block my-0.5">
                    {currentRussianPattern.topSizeLabel}
                  </span>
                  <span className="text-[9px] text-[#5C6B80] block truncate">
                    ПОГ: {Math.round(measChest / 2)} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[9px] font-bold text-[#5C6B80] block">Низ РФ</span>
                  <span className="text-xs font-black text-[#5F6ED0] block my-0.5">
                    {currentRussianPattern.bottomSizeLabel}
                  </span>
                  <span className="text-[9px] text-[#5C6B80] block truncate">
                    Пояс: {measWaist} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[9px] font-bold text-[#5C6B80] block">Ростовка</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {currentRussianPattern.heightGroupNumber}-я группа
                  </span>
                  <span className="text-[9px] text-[#5C6B80] block truncate">
                    {currentRussianPattern.heightRange}
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center bg-[#E3E8EF] border border-white/70">
                  <span className="text-[9px] font-bold text-[#5C6B80] block">Полнота</span>
                  <span className="text-xs font-black text-[#2D3A4E] block my-0.5">
                    {currentRussianPattern.fullnessGroup}-я группа
                  </span>
                  <span className="text-[9px] text-[#5C6B80] block truncate">
                    Дроп: {currentRussianPattern.dropValue} см
                  </span>
                </div>
              </div>

              {/* Dynamic Recommendation Banner */}
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#5C6B80] pt-1 border-t border-[#BAC5D5]/40">
                <Info className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0" />
                <span className="truncate">
                  {currentRussianPattern.recommendedFit} • ИМТ: {currentRussianPattern.bmi} ({currentRussianPattern.bmiStatus})
                </span>
              </div>

              {/* Collapsible Russian Size Grid Table */}
              {showGostTable && (
                <div className="neu-flat rounded-xl p-3 bg-[#E3E8EF] border border-white/80 space-y-2 mt-2 animate-in fade-in">
                  <div className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center justify-between">
                    <span>Сетка размеров РФ (ГОСТ 31399-2009)</span>
                    <span className="text-[10px] text-[#5F6ED0] font-bold">Мужская одежда</span>
                  </div>
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-[10px] text-center border-collapse">
                      <thead>
                        <tr className="border-b border-[#BAC5D5]/50 text-[#5C6B80] font-bold">
                          <th className="py-1 px-1 text-left">Размер РФ</th>
                          <th className="py-1 px-1">Междунар.</th>
                          <th className="py-1 px-1">Обхват груди</th>
                          <th className="py-1 px-1">Талия</th>
                          <th className="py-1 px-1">Бёдра</th>
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
                                  ? 'neu-inset text-[#5F6ED0] font-black bg-[#DDE4F0]'
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

            {/* Sliders Form with Neumorphic Tactile Sliders */}
            <form onSubmit={handleSaveMeasurements} className="space-y-3.5">
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
                label="Обхват бёдер"
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
              <div className="space-y-2 neu-inset rounded-2xl p-3 bg-[#E3E8EF] border border-white/40">
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
                            ? 'neu-inset-deep neu-inset-deep-animated text-[#5F6ED0] font-black bg-[#E3E8EF] border border-[#5F6ED0]/40'
                            : 'neu-button text-[#5C6B80] hover:text-[#2D3A4E]'
                        }`}
                      >
                        <span>{pref.label}</span>
                        <span className="text-[9px] opacity-75">{pref.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
                <button
                  type="button"
                  onClick={() => setIsEditingMeasurements(false)}
                  className="flex-1 py-3 neu-button rounded-xl text-[#5C6B80] font-bold text-xs hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-transform"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 neu-button-accent rounded-xl font-extrabold text-xs text-white cursor-pointer active:scale-95 transition-transform flex items-center justify-center gap-1.5 shadow-md"
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
        {activeModal === 'admin' && isFirebaseAdmin && isAdminAuthenticated && (
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
              onClick={() => setActiveModal(null)}
              className="fixed inset-0 bg-[#2D3A4E]/40 backdrop-blur-xs cursor-pointer"
            />

            <motion.div
              key="admin-modal"
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="neu-modal rounded-3xl p-3.5 sm:p-6 max-w-5xl w-full my-auto space-y-4 max-h-[92vh] flex flex-col border border-white/80 text-[#2D3A4E] min-w-0 overflow-hidden relative z-10"
            >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3 shrink-0 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-[#2D3A4E] truncate">Панель администратора</h3>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {adminCreds.username}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] font-medium text-[#5C6B80] truncate">Управление каталогом, складом, аналитикой и витриной MANSTYLE</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="admin-change-credentials-header-btn"
                  type="button"
                  onClick={() => setIsChangeCredentialsModalOpen(true)}
                  className="h-9 px-3 rounded-xl neu-button flex items-center gap-1.5 text-xs font-bold text-[#5F6ED0] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
                  title="Изменить логин и пароль администратора"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Учетные данные</span>
                </button>
                <button
                  id="admin-logout-btn"
                  type="button"
                  onClick={handleAdminLogout}
                  className="h-9 px-3 rounded-xl neu-button flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 active:scale-95 transition-all cursor-pointer"
                  title="Выйти из сессии администратора"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Выйти</span>
                </button>
                <button
                  id="admin-modal-close-btn"
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs (Neumorphic Inset Bar with Elevated Active Pill) */}
            <div className="admin-tab-bar rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar scroll-smooth bg-[#E3E8EF] w-full max-w-full">
              {[
                { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
                { id: 'products', label: 'Каталог', icon: Layers },
                { id: 'inventory', label: 'Склад & SKU', icon: Boxes },
                { id: 'orders', label: 'Заказы', icon: Package },
                { id: 'delivery', label: 'Доставка & ПВЗ', icon: Truck },
                { id: 'customers', label: 'Клиенты', icon: Users },
                { id: 'promos', label: 'Промокоды', icon: Tag },
                { id: 'banners', label: 'Баннеры', icon: ImageIcon },
                { id: 'support', label: 'Чат поддержки', icon: Headphones },
                { id: 'storefront', label: 'Витрина', icon: Store },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = adminTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setAdminTab(tab.id as any);
                    }}
                    className={`relative min-w-[90px] sm:min-w-[105px] py-2 px-3 rounded-xl font-extrabold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 active:scale-95 select-none ${
                      isActive
                        ? 'text-[#5F6ED0] font-black'
                        : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="adminTabPillIndicator"
                        className="absolute inset-0 rounded-xl admin-tab-active z-0"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#5F6ED0]' : 'text-[#5C6B80]'}`} />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Content Container with Smooth Tab Appearance */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-1 scrollbar-thin min-w-0 w-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={adminTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="w-full"
                >
              {/* --- TAB 1: ANALYTICS & FINANCIAL DASHBOARD --- */}
              {adminTab === 'analytics' && (
                <AdminAnalyticsTab
                  orders={orders}
                  products={productsList}
                  promos={localPromos}
                  onShowToast={onShowToast}
                  onSelectOrder={(ord) => setSelectedOrderIdForTracking(ord.id)}
                  onUpdateOrders={onUpdateOrders}
                  onResubscribeFirestore={onSyncFirebase}
                />
              )}

              {/* --- TAB 2: PRODUCTS CATALOG MANAGEMENT --- */}
              {adminTab === 'products' && (
                <AdminProductsTab
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
                />
              )}

              {/* --- TAB 4: ORDERS MANAGEMENT --- */}
              {adminTab === 'orders' && (
                <AdminOrdersTab
                  orders={orders}
                  products={productsList}
                  onUpdateOrders={handleUpdateOrders}
                  onUpdateProducts={handleUpdateProductsList}
                  onShowToast={onShowToast}
                  onOpenSupportChat={(orderId, customerName) => {
                    setSupportTargetOrderId(orderId);
                    setAdminTab('support');
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
                    setAdminTab('support');
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
                  promos={localPromos}
                  products={productsList}
                  onUpdatePromos={handleUpdatePromosList}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 6: HOMEPAGE BANNERS & SLIDER MANAGEMENT --- */}
              {adminTab === 'banners' && (
                <AdminBannersTab
                  banners={localBanners}
                  products={productsList}
                  promos={localPromos}
                  onUpdateBanners={handleUpdateBannersList}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 7: REAL-TIME SUPPORT CHAT --- */}
              {adminTab === 'support' && (
                <AdminSupportChatTab
                  messages={localChatMessages}
                  orders={orders}
                  products={productsList}
                  promos={localPromos}
                  initialOrderId={supportTargetOrderId}
                  onSendMessageAsAdmin={handleSendAdminMessage}
                  onUpdateOrders={handleUpdateOrders}
                  onUpdatePromos={handleUpdatePromosList}
                  onClearChat={onClearChat}
                  onShowToast={onShowToast}
                />
              )}

              {/* --- TAB 8: STOREFRONT & SYSTEM SETTINGS --- */}
              {adminTab === 'storefront' && (
                <AdminStorefrontTab
                  settings={storefrontSettings}
                  onUpdateSettings={onUpdateStorefrontSettings}
                  onShowToast={onShowToast}
                />
              )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* ================= MODAL: FAQ ACCORDION ================= */}
      <FAQModal
        isOpen={activeModal === 'faq'}
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
              key="support-modal"
              initial={{ scale: 0.93, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="neu-modal rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 text-[#2D3A4E] border border-white/80 relative z-10"
            >
              <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0]">
                    <Headphones className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Служба заботы MANSTYLE
                  </h3>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-[#5C6B80] leading-relaxed">
                <p className="font-bold text-[#2D3A4E]">Мы на связи и готовы помочь с любым вопросом!</p>
                <div className="neu-inset rounded-2xl p-3.5 space-y-2 bg-[#E3E8EF]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#2D3A4E]">Бесплатная горячая линия:</p>
                      <a
                        href="tel:88005553535"
                        className="text-[#5F6ED0] font-black text-base hover:underline block"
                      >
                        8 (800) 555-35-35
                      </a>
                    </div>
                    <a
                      href="tel:88005553535"
                      className="neu-button p-2.5 rounded-xl text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform"
                      title="Позвонить прямо сейчас"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                  <p className="text-[11px] text-[#5C6B80]">Ежедневно с 09:00 до 21:00 (звонок по РФ бесплатный)</p>
                </div>

                <div className="space-y-2 pt-1">
                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        onOpenSupportChat();
                      }}
                      className="w-full neu-button-accent py-2.5 px-4 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Открыть онлайн-чат заботы</span>
                    </button>
                  )}

                  <a
                    href="mailto:support@manstyle-store.ru"
                    className="w-full neu-button py-2.5 px-4 rounded-xl text-xs font-bold text-[#2D3A4E] flex items-center justify-center gap-2 cursor-pointer hover:text-[#5F6ED0] transition-colors"
                  >
                    <span>Email: support@manstyle-store.ru</span>
                  </a>
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
        onOpenSupportChat={onOpenSupportChat}
        onShowToast={onShowToast}
      />

      {/* Neumorphic Admin Authentication Modal */}
      <AdminAuthModal
        isOpen={isAdminAuthModalOpen}
        onClose={() => setIsAdminAuthModalOpen(false)}
        onSuccess={handleAdminAuthSuccess}
        onShowToast={onShowToast}
      />

      {/* Neumorphic Admin Change Credentials Modal */}
      <AdminChangeCredentialsModal
        isOpen={isChangeCredentialsModalOpen}
        onClose={() => setIsChangeCredentialsModalOpen(false)}
        onSuccess={(updated) => {
          setAdminCreds(updated);
        }}
        onShowToast={onShowToast}
      />

      {/* Neumorphic Security Settings Modal */}
      <SecuritySettingsModal
        isOpen={activeModal === 'security'}
        onClose={() => setActiveModal(null)}
        userEmail={profile.email}
        isGoogleUser={!!currentUser}
        twoFactorEnabled={profile.notificationsEnabled}
        onToggleTwoFactor={(enabled) => {
          onUpdateProfile({
            ...profile,
            notificationsEnabled: enabled,
          });
        }}
        onUpdateEmail={(newEmail) => {
          onUpdateProfile({
            ...profile,
            email: newEmail,
          });
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
};
