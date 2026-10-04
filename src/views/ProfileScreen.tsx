import React, { useState, useEffect } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StoreHours } from '../components/StoreHours';
import { isScheduleConfigured } from '../utils/storeSchedule';
import { motion, AnimatePresence } from 'motion/react';
import { AccountDataModal } from '../components/AccountDataModal';
import { currentStoreName, getStoreContacts, getStoreName, telHref } from '../utils/storeContacts';
import { fullName, namePartsOf } from '../shared/personName';
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
  MapPin,
  Plus,
  Trash2,
  Phone,
  Sparkles,
  Ruler,
  ShieldCheck,
  Layers,
  MessageCircle,
  Send,
  Database,
  Scale,
  Scissors,
  Shirt,
  Info,
} from 'lucide-react';
import { NeumorphicSlider } from '../components/NeumorphicSlider';
import { calculateRussianPattern, RUSSIAN_SIZE_TABLE_ROWS } from '../utils/russianSizing';
import { useAuth } from '../context/AuthContext';
import { UserProfile, Order, CartItem, ActiveTab, SavedAddress, Product, PromoCode, BannerSlide, ChatMessage, StorefrontSettings, SaveStorefrontSettings, DeliveryMethod, PickupPoint, PaymentKind } from '../types';
import type { LegalDocId } from '../utils/legalDocs';
import { formatAddress } from '../utils/addressFormat';
import type { ChatMessageChange } from '../utils/firebaseSync';
import { isNotificationSupported, requestNotificationPermission, showSystemNotification } from '../utils/pushNotifications';
import { NeumorphicSwitch } from '../components/NeumorphicSwitch';
import { useDialogA11y } from '../utils/useDialogA11y';
import { isAdminTab, type AdminTab } from '../components/admin/adminSections';
import { prefetchAdmin } from '../components/admin/adminLoaders';
import { ProfileOrdersModal } from './profile/ProfileOrdersModal';
import { OrderTrackingModal } from './profile/OrderTrackingModal';
import { ProfileAdminPanel } from './profile/ProfileAdminPanel';

export interface ProfileScreenProps {
  profile: UserProfile;
  allUsers?: UserProfile[];
  orders: Order[];
  products?: Product[];
  favoritesCount: number;
  onUpdateProfile: (updated: UserProfile) => void;
  setActiveTab: (tab: ActiveTab) => void;
  onRepeatOrder?: (items: CartItem[]) => void;
  /** The buyer cancels their own order (App.tsx: cancellation, then the goods back to stock) */
  onCancelOrder?: (order: Order, reason: string, comment: string) => Promise<boolean>;
  /** «Я получил заказ» (a carrier's order): «Получен» with the time of the tap */
  onConfirmReceipt?: (order: Order) => Promise<boolean>;
  /** «Оплачено» с фото чека («Доработки 5»): фото в чат заказа и «Чек на проверке»; true — отправлено */
  onSubmitPaymentReceipt?: (order: Order, kind: PaymentKind, imageUrl: string) => Promise<boolean>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** With an order: the chat opens with «Вопрос по заказу № …» typed in (audit 02.10, finding 26) */
  onOpenSupportChat?: (orderId?: string) => void;
  /** Resolves to false when the database refused the write (the error toast is already shown) */
  onUpdateProducts?: (products: Product[]) => Promise<boolean> | void;
  onUpdateOrders?: (orders: Order[]) => Promise<boolean> | void;
  promos?: PromoCode[];
  /** Resolves to false when the database refused the write (the error toast is already shown) */
  onUpdatePromos?: (promos: PromoCode[]) => Promise<boolean> | void;
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
  /** Admin → «Документы»: the store's edition of the offer / policy, null — the template */
  onSaveLegalText?: (id: LegalDocId, text: string | null) => Promise<boolean>;
  deliveryMethods?: DeliveryMethod[];
  onUpdateDeliveryMethods?: (methods: DeliveryMethod[]) => void;
  pickupPoints?: PickupPoint[];
  onUpdatePickupPoints?: (points: PickupPoint[]) => void;
}

/** Admin panel section for this browser session (internal key, not renamed) */
const ADMIN_TAB_STORAGE_KEY = 'manstyle_admin_tab';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  allUsers = [],
  orders,
  products = [],
  favoritesCount,
  onUpdateProfile,
  setActiveTab,
  onRepeatOrder,
  onCancelOrder,
  onConfirmReceipt,
  onSubmitPaymentReceipt,
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
  onSaveLegalText,
  deliveryMethods,
  onUpdateDeliveryMethods,
  pickupPoints,
  onUpdatePickupPoints,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  // Фамилия, имя, отчество (owner's request 02.10); an old single name is split into parts for the buyer to check
  const [lastName, setLastName] = useState(() => namePartsOf(profile).lastName || '');
  const [firstName, setFirstName] = useState(() => namePartsOf(profile).firstName || '');
  const [middleName, setMiddleName] = useState(() => namePartsOf(profile).middleName || '');
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [notifications, setNotifications] = useState(profile.notificationsEnabled);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'orders' | 'addresses' | 'support' | 'faq' | 'admin' | 'security' | null
  >(null);
  const addressesDialog = useDialogA11y(activeModal === 'addresses', () => setActiveModal(null));
  const supportDialog = useDialogA11y(activeModal === 'support', () => setActiveModal(null));

  // Keep local state in sync if prop changes
  React.useEffect(() => {
    const parts = namePartsOf(profile);
    setLastName(parts.lastName || '');
    setFirstName(parts.firstName || '');
    setMiddleName(parts.middleName || '');
    setEmail(profile.email);
    setPhone(profile.phone);
    setNotifications(profile.notificationsEnabled);
  }, [profile.name, profile.lastName, profile.firstName, profile.middleName, profile.email, profile.phone, profile.notificationsEnabled]);

  // Admin Authentication & Credentials State
  const { currentUser, loginWithGoogle, logoutUser, isAdmin: isFirebaseAdmin } = useAuth();
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
  // Selected order IDs for detailed tracking & interactive delivery map
  const [selectedOrderIdForTracking, setSelectedOrderIdForTracking] = useState<string | null>(null);
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
  const [addrRegion, setAddrRegion] = useState('');
  const [addrComment, setAddrComment] = useState('');
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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = { lastName: lastName.trim(), firstName: firstName.trim(), middleName: middleName.trim() };
    onUpdateProfile({
      ...profile,
      ...parts,
      // The full name stays in `name`: «Клиенты», the chat and older screens read it
      name: fullName(parts),
      email,
      phone,
      notificationsEnabled: notifications,
    });
    setIsEditingProfile(false);
    onShowToast('Профиль успешно обновлен', 'success');
  };

  /**
   * Уведомления о статусе заказа: системные — только когда браузер их разрешил (на телефоне — через
   * `public/notification-sw.js`). Переключатель показывает, придут ли они на самом деле: включено в профиле и
   * разрешено браузером (браузер без уведомлений — только звук и сообщение на сайте).
   */
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    isNotificationSupported() ? Notification.permission : 'unsupported'
  );
  const notificationsOn =
    notifications !== false && (notificationPermission === 'granted' || notificationPermission === 'unsupported');

  const saveNotifications = (enabled: boolean) => {
    setNotifications(enabled);
    onUpdateProfile({ ...profile, notificationsEnabled: enabled });
  };

  const toggleNotifications = async () => {
    if (notificationsOn) {
      saveNotifications(false);
      onShowToast('Уведомления о заказах выключены', 'info');
      return;
    }
    if (!isNotificationSupported()) {
      saveNotifications(true);
      onShowToast('Этот браузер не показывает системные уведомления: смена статуса будет видна на сайте, пока он открыт', 'info');
      return;
    }
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      saveNotifications(true);
      const shown = await showSystemNotification(currentStoreName(), { body: 'Уведомления о статусе заказов включены' });
      onShowToast(
        shown
          ? 'Уведомления включены: о смене статуса заказа сообщим, пока сайт открыт'
          : 'Уведомления включены, но браузер не показал пробное — проверьте уведомления Chrome в настройках телефона',
        'success'
      );
    } else if (perm === 'denied') {
      onShowToast(
        'Браузер запретил уведомления — как разрешить, написано под переключателем',
        'error'
      );
    } else {
      onShowToast('Разрешение не дано: нажмите ещё раз и выберите «Разрешить»', 'info');
    }
  };

  // The profile is reset by App when the account is gone; nothing is written here: a write right after the sign-out
  // went into the previous account's document and wiped its addresses (audit 02.10, finding 23)
  const handleFullLogout = async () => {
    try {
      if (currentUser) {
        await logoutUser();
      }
    } catch (e) {
      console.warn('Logout error:', e);
      onShowToast('Не удалось выйти из аккаунта. Проверьте соединение и попробуйте ещё раз.', 'error');
      return;
    }
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
    setAddrRegion('');
    setAddrComment('');
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
    setAddrRegion(addr.region || '');
    setAddrComment(addr.comment || '');
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
            region: addrRegion.trim(),
            comment: addrComment.trim(),
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
        region: addrRegion.trim(),
        comment: addrComment.trim(),
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
  // The store's hours from «Витрина»: the status, the week and the comment (docs/store-schedule-spec.md)
  const storeSchedule = storefrontSettings?.schedule;
  const hasHours = Boolean(workingHours) || isScheduleConfigured(storeSchedule);

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
                <div className="w-full h-full rounded-full flex items-center justify-center text-accent text-xl font-extrabold">
                  {profile.name?.trim() ? profile.name.trim()[0].toUpperCase() : <User className="w-7 h-7" />}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-lg font-bold text-[#2D3A4E] leading-tight break-words">
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
                className="w-8 h-8 -m-1.5 rounded-lg flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {(
                [
                  ['profile-last-name', 'Фамилия', 'family-name', 'text', lastName, setLastName],
                  ['profile-first-name', 'Имя', 'given-name', 'text', firstName, setFirstName],
                  ['profile-middle-name', 'Отчество (если есть)', 'additional-name', 'text', middleName, setMiddleName],
                  ['profile-email', 'Email', 'email', 'email', email, setEmail],
                  ['profile-phone', 'Телефон', 'tel', 'tel', phone, setPhone],
                ] as const
              ).map(([id, label, autoComplete, type, value, setValue]) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-[11px] font-bold text-[#4E5C70] mb-1 ml-1">
                    {label}
                  </label>
                  <input
                    id={id}
                    type={type}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full neu-inset rounded-xl py-2 px-3 text-xs text-[#2D3A4E]"
                  />
                </div>
              ))}
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

      {/* Admin entry at the top of the profile (it was at the very bottom); only for verified admins */}
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
          <div className="w-10 h-10 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
            <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#2D3A4E]">Панель администратора</p>
            <p className="text-xs text-[#4E5C70]">Модули каталога, заказов, акций и настроек витрины</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-[#4E5C70] group-hover:text-accent transition-colors" />
        </div>
      </button>
      )}

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
                  <h3 className="text-sm font-bold text-[#2D3A4E]">{isFirebaseAdmin ? 'Данные магазина' : 'Аккаунт'}</h3>
                </div>
                <p className="text-xs text-[#4E5C70]">
                  {isFirebaseAdmin
                    ? 'Каталог, заказы, акции и чат сохраняются в базе при каждом изменении'
                    : 'Заказы, адреса и переписка сохраняются на всех ваших устройствах'}
                </p>
              </div>
            </div>

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
                  <p className="text-xs text-[#4E5C70] truncate">{currentUser.email}</p>
                </div>
              </div>

            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-[#BAC5D5]/20 space-y-2 text-xs">
              <p className="text-[#4E5C70] text-xs leading-relaxed">
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
                type="button"
                onClick={handleOpenAddAddress}
                className="inline-flex items-center min-h-6 text-accent font-bold underline ml-1 cursor-pointer"
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
                    <p className="text-xs text-[#4E5C70] truncate">
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
                <p className="text-xs text-[#4E5C70] font-medium truncate">
                  {profileRussianPattern.recommendedFit}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[11px] font-bold text-[#4E5C70] block">Стандартный размер</span>
              <span className="text-sm font-extrabold text-accent neu-inset px-2 py-0.5 rounded-lg inline-block">
                {profileRussianPattern.topSizeLabel}
              </span>
            </div>
          </div>

          {/* Key Russian Pattern Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Верхняя одежда</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.topSizeLabel}
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                ПОГ: {Math.round((profile.bodyMeasurements?.chest ?? 104) / 2)} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Брюки / Джинсы</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.bottomSizeLabel}
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                Пояс: {profile.bodyMeasurements?.waist ?? 95} см
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Ростовка РФ</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
                {profileRussianPattern.heightGroupNumber}-я группа
              </span>
              <span className="text-[11px] text-[#4E5C70] block mt-0.5">
                {profileRussianPattern.heightRange}
              </span>
            </div>

            <div className="neu-flat rounded-2xl p-2.5 text-center border border-white/70">
              <span className="text-[11px] text-[#4E5C70] font-medium block">Полнота / ИМТ</span>
              <span className="text-xs font-extrabold text-[#2D3A4E]">
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
              <span className="text-[#2D3A4E] font-extrabold">
                {profile.bodyMeasurements?.height ?? 184} см • {profile.bodyMeasurements?.weight ?? 94} кг
              </span>
            </div>
            <div>
              ОГ / ОТ / ОБ:{' '}
              <span className="text-[#2D3A4E] font-extrabold">
                {profile.bodyMeasurements?.chest ?? 104} • {profile.bodyMeasurements?.waist ?? 95} • {profile.bodyMeasurements?.hips ?? 98} см
              </span>
            </div>
          </div>
        </div>
        ) : (
          <div className="neu-inset rounded-3xl p-4 border border-white/60 text-center space-y-1">
            <p className="text-xs font-bold text-[#2D3A4E]">Мерки еще не указаны</p>
            <p className="text-xs text-[#4E5C70]">
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
      {(pickupAddress || hasHours || storePhone || storeTelegram) && (
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

          {(pickupAddress || hasHours) && (
            <div className="neu-inset rounded-2xl p-3 space-y-1.5 text-xs text-[#2D3A4E]">
              {pickupAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{pickupAddress}</span>
                </div>
              )}
              <StoreHours schedule={storeSchedule} comment={workingHours} />
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

          <div className="p-3.5 neu-inset rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D3A4E]">Уведомления</p>
                <p className="text-xs text-[#4E5C70]">О смене статуса заказа, пока сайт открыт</p>
                {notificationPermission === 'denied' && (
                  <p className="text-xs font-bold text-danger">
                    Запрещены в браузере: значок слева от адреса сайта → «Уведомления» → «Разрешить», затем включите снова
                  </p>
                )}
              </div>
            </div>

            <NeumorphicSwitch
              checked={notificationsOn}
              onChange={() => void toggleNotifications()}
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
      <ProfileOrdersModal
        isOpen={activeModal === 'orders'}
        onCloseModals={() => setActiveModal(null)}
        orders={orders}
        products={products}
        onOpenSupportChat={onOpenSupportChat}
        setSelectedOrderIdForTracking={setSelectedOrderIdForTracking}
        storePhone={storePhone}
      />

      {/* ================= DETAILED ORDER TRACKING MODAL ================= */}
      <OrderTrackingModal
        selectedOrderIdForTracking={selectedOrderIdForTracking}
        setSelectedOrderIdForTracking={setSelectedOrderIdForTracking}
        onCloseModals={() => setActiveModal(null)}
        orders={orders}
        products={products}
        storeName={storeName}
        storePhone={storePhone}
        onCancelOrder={onCancelOrder}
        onConfirmReceipt={onConfirmReceipt}
        onOpenSupportChat={onOpenSupportChat}
        onRepeatOrder={onRepeatOrder}
        onShowToast={onShowToast}
        onSubmitPaymentReceipt={onSubmitPaymentReceipt}
      />

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
                      <span className="text-xs font-extrabold text-[#2D3A4E]">{addr.title}</span>
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
            className="neu-modal rounded-[28px] p-6 max-w-md w-full max-h-[90dvh] flex flex-col gap-4 relative text-[#2D3A4E] border border-white/80">
            <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/50 shrink-0">
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

            {/* The form scrolls inside the window: with region and comment it is taller than a phone screen */}
            <form onSubmit={handleSaveAddress} className="space-y-4 text-xs flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2 pb-1">
              <div>
                <label htmlFor="profile-addr-title" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Название (например: Дом, Работа)
                </label>
                <input
                  id="profile-addr-title"
                  type="text"
                  value={addrTitle}
                  onChange={(e) => setAddrTitle(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="Дом"
                  required
                />
              </div>

              <div>
                <label htmlFor="profile-addr-region" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Страна / регион
                </label>
                <input
                  id="profile-addr-region"
                  type="text"
                  autoComplete="address-level1"
                  value={addrRegion}
                  onChange={(e) => setAddrRegion(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                  placeholder="Россия, Московская область"
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
                  <label htmlFor="profile-addr-postal" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">Индекс</label>
                  <input
                    id="profile-addr-postal"
                    type="text"
                    value={addrPostal}
                    onChange={(e) => setAddrPostal(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-3 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="101000"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-addr-street" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Улица
                </label>
                <input
                  id="profile-addr-street"
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
                  <label htmlFor="profile-addr-house" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Номер дома
                  </label>
                  <input
                    id="profile-addr-house"
                    type="text"
                    value={addrHouse}
                    onChange={(e) => setAddrHouse(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="д. 10 / 12к1"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-entrance" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Подъезд
                  </label>
                  <input
                    id="profile-addr-entrance"
                    type="text"
                    value={addrEntrance}
                    onChange={(e) => setAddrEntrance(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="2"
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-floor" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Этаж
                  </label>
                  <input
                    id="profile-addr-floor"
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
                  <label htmlFor="profile-addr-apartment" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Квартира / Офис
                  </label>
                  <input
                    id="profile-addr-apartment"
                    type="text"
                    value={addrApartment}
                    onChange={(e) => setAddrApartment(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="кв. 25"
                  />
                </div>
                <div>
                  <label htmlFor="profile-addr-intercom" className="block text-[11px] font-bold text-[#2D3A4E] mb-1">
                    Код домофона
                  </label>
                  <input
                    id="profile-addr-intercom"
                    type="text"
                    value={addrIntercom}
                    onChange={(e) => setAddrIntercom(e.target.value)}
                    className="w-full neu-inset rounded-2xl py-2.5 px-3 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A]"
                    placeholder="25K / #1234"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-addr-comment" className="block text-xs font-bold text-[#2D3A4E] mb-1.5">
                  Комментарий курьеру
                </label>
                <textarea
                  id="profile-addr-comment"
                  rows={2}
                  maxLength={300}
                  value={addrComment}
                  onChange={(e) => setAddrComment(e.target.value)}
                  className="w-full neu-inset rounded-2xl py-2.5 px-3.5 text-xs font-semibold text-[#2D3A4E] placeholder:text-[#56647A] resize-y"
                  placeholder="Например: позвонить за час, шлагбаум со двора"
                />
              </div>

              {/* Delivery Preview */}
              <div className="neu-inset rounded-2xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                  Адрес для курьера:
                </span>
                <p className="text-xs font-bold text-[#2D3A4E] leading-relaxed break-words">
                  {formatAddress({
                    region: addrRegion,
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
                  <p className="text-xs text-[#4E5C70] font-medium">
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
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2D3A4E]">
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
                  <span className="text-xs font-extrabold text-accent block my-0.5">
                    {currentRussianPattern.topSizeLabel}
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    ПОГ: {Math.round(measChest / 2)} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Низ РФ</span>
                  <span className="text-xs font-extrabold text-accent block my-0.5">
                    {currentRussianPattern.bottomSizeLabel}
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    Пояс: {measWaist} см
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Ростовка</span>
                  <span className="text-xs font-extrabold text-[#2D3A4E] block my-0.5">
                    {currentRussianPattern.heightGroupNumber}-я группа
                  </span>
                  <span className="text-[11px] text-[#4E5C70] block truncate">
                    {currentRussianPattern.heightRange}
                  </span>
                </div>

                <div className="neu-flat rounded-xl p-2 text-center border border-white/70">
                  <span className="text-[11px] font-bold text-[#4E5C70] block">Полнота</span>
                  <span className="text-xs font-extrabold text-[#2D3A4E] block my-0.5">
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
                                  ? 'neu-inset text-accent font-extrabold'
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
                            ? 'neu-pill-active font-extrabold'
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
      <ProfileAdminPanel
        isOpen={activeModal === 'admin' && isFirebaseAdmin}
        onClose={() => setActiveModal(null)}
        adminTab={adminTab}
        setAdminTab={setAdminTab}
        setSelectedOrderIdForTracking={setSelectedOrderIdForTracking}
        orders={orders}
        allUsers={allUsers}
        products={products}
        promos={promos}
        bannerSlides={bannerSlides}
        chatMessages={chatMessages}
        deliveryMethods={deliveryMethods}
        pickupPoints={pickupPoints}
        storefrontSettings={storefrontSettings}
        onShowToast={onShowToast}
        onUpdateProducts={onUpdateProducts}
        onUpdateOrders={onUpdateOrders}
        onUpdatePromos={onUpdatePromos}
        onUpdateBannerSlides={onUpdateBannerSlides}
        onSendMessageAsAdmin={onSendMessageAsAdmin}
        onClearChat={onClearChat}
        onChangeChatMessage={onChangeChatMessage}
        onUpdateStorefrontSettings={onUpdateStorefrontSettings}
        onSaveLegalText={onSaveLegalText}
        onUpdateDeliveryMethods={onUpdateDeliveryMethods}
        onUpdatePickupPoints={onUpdatePickupPoints}
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
                  <h3 id={supportDialog.titleId} className="text-sm font-extrabold uppercase tracking-wider text-[#2D3A4E]">
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
                        className="text-accent font-extrabold text-base hover:underline block"
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
                  <StoreHours schedule={storeSchedule} comment={workingHours} />
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
