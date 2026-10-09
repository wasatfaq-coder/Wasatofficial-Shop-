import React, { useState, useEffect, useMemo } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isScheduleConfigured } from '../utils/storeSchedule';
import { AccountDataModal } from '../components/AccountDataModal';
import { currentStoreName, getStoreContacts, getStoreName } from '../utils/storeContacts';
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
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LoadFailedNotice } from '../components/LoadFailedNotice';
import {
  UserProfile,
  Order,
  CartItem,
  ActiveTab,
  Product,
  PromoCode,
  BannerSlide,
  ChatMessage,
  StorefrontSettings,
  SaveStorefrontSettings,
  DeliveryMethod,
  PickupPoint,
  PaymentKind,
} from '../types';
import type { LegalDocId } from '../utils/legalDocs';
import type { ExchangeRates } from '../utils/currencyPricing';
import type { ChatMessageChange } from '../utils/firebaseSync';
import { isNotificationSupported, requestNotificationPermission, showSystemNotification } from '../utils/pushNotifications';
import { NeumorphicSwitch } from '../components/NeumorphicSwitch';
import { isAdminTab, type AdminTab } from '../components/admin/adminSections';
import { prefetchAdmin } from '../components/admin/adminLoaders';
import { ProfileOrdersModal } from './profile/ProfileOrdersModal';
import { OrderTrackingModal } from './profile/OrderTrackingModal';
import { ProfileAdminPanel } from './profile/ProfileAdminPanel';
import { useAddressBook } from './profile/useAddressBook';
import { useMeasurementsForm } from './profile/useMeasurementsForm';
import { SavedAddressesModal } from './profile/SavedAddressesModal';
import { AddressFormModal } from './profile/AddressFormModal';
import { MeasurementsModal } from './profile/MeasurementsModal';
import { ProfileSupportModal } from './profile/ProfileSupportModal';
import { ProfileAccountCard } from './profile/ProfileAccountCard';
import { ProfileMeasurementsCard } from './profile/ProfileMeasurementsCard';
import { ProfileStoreContacts } from './profile/ProfileStoreContacts';

export interface ProfileScreenProps {
  profile: UserProfile;
  /** the visitor's orders; for the admin — every order of the shop (the admin panel and its order tracking) */
  orders: Order[];
  products?: Product[];
  favoritesCount: number;
  /** true once saved (finding 13): the forms close and say «Сохранено» only then */
  onUpdateProfile: (updated: UserProfile) => Promise<boolean>;
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
  /** «Курсы и наценка» → «Применить»: rates and recalculated products in one save */
  onApplyExchangeRates?: (rates: ExchangeRates, repriced: Product[]) => Promise<boolean>;
  deliveryMethods?: DeliveryMethod[];
  onUpdateDeliveryMethods?: (methods: DeliveryMethod[]) => void;
  pickupPoints?: PickupPoint[];
  onUpdatePickupPoints?: (points: PickupPoint[]) => void;
  /** «Смотреть статус» in an order notification: this order's tracking opens (App keeps it until then) */
  openOrderId?: string | null;
  /** The order asked for in `openOrderId` is open: App forgets it */
  onOrderOpened?: () => void;
}

/** Admin panel section for this browser session (internal key, not renamed) */
const ADMIN_TAB_STORAGE_KEY = 'manstyle_admin_tab';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
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
  onApplyExchangeRates,
  deliveryMethods,
  onUpdateDeliveryMethods,
  pickupPoints,
  onUpdatePickupPoints,
  openOrderId = null,
  onOrderOpened,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
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

  // Keep local state in sync if prop changes — not while the form is open: a refused save puts the profile back, and
  // the form keeps what was typed (finding 13)
  React.useEffect(() => {
    if (isEditingProfile) return;
    const parts = namePartsOf(profile);
    setLastName(parts.lastName || '');
    setFirstName(parts.firstName || '');
    setMiddleName(parts.middleName || '');
    setEmail(profile.email);
    setPhone(profile.phone);
    setNotifications(profile.notificationsEnabled);
  }, [isEditingProfile, profile.name, profile.lastName, profile.firstName, profile.middleName, profile.email, profile.phone, profile.notificationsEnabled]);

  // Admin Authentication & Credentials State
  const { currentUser, logoutUser, isAdmin: isFirebaseAdmin, adminCheckFailed } = useAuth();
  // «Мои заказы» of the admin are their own, not every order of the shop the admin panel gets (docs/orders-scale-plan.md,
  // finding 5)
  const ownOrders = useMemo(
    () => (isFirebaseAdmin ? orders.filter((o) => o.customerUid === currentUser?.uid) : orders),
    [isFirebaseAdmin, orders, currentUser?.uid]
  );

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
  // «Смотреть статус» in an order notification: the order opens once the profile is on screen (finding 23)
  React.useEffect(() => {
    if (!openOrderId) return;
    setSelectedOrderIdForTracking(openOrderId);
    onOrderOpened?.();
  }, [openOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addressBook = useAddressBook(profile, onUpdateProfile, onShowToast);
  const {
    addressToDelete,
    setAddressToDelete,
    handleOpenAddAddress,
    handleOpenEditAddress,
    handleDeleteAddress,
  } = addressBook;

  const measurementsForm = useMeasurementsForm(profile, onUpdateProfile, onShowToast);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProfile) return;
    const parts = { lastName: lastName.trim(), firstName: firstName.trim(), middleName: middleName.trim() };
    setIsSavingProfile(true);
    const saved = await onUpdateProfile({
      ...profile,
      ...parts,
      // The full name stays in `name`: «Клиенты», the chat and older screens read it
      name: fullName(parts),
      email,
      phone,
      notificationsEnabled: notifications,
    });
    setIsSavingProfile(false);
    // not saved: the form stays with what was typed (the toast said why)
    if (!saved) return;
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

  /** false — the profile did not save it: the switch goes back */
  const saveNotifications = async (enabled: boolean): Promise<boolean> => {
    const before = notifications;
    setNotifications(enabled);
    const saved = await onUpdateProfile({ ...profile, notificationsEnabled: enabled });
    if (!saved) setNotifications(before);
    return saved;
  };

  const toggleNotifications = async () => {
    if (notificationsOn) {
      if (await saveNotifications(false)) onShowToast('Уведомления о заказах выключены', 'info');
      return;
    }
    if (!isNotificationSupported()) {
      if (!(await saveNotifications(true))) return;
      onShowToast('Этот браузер не показывает системные уведомления: смена статуса будет видна на сайте, пока он открыт', 'info');
      return;
    }
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      if (!(await saveNotifications(true))) return;
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
              disabled={isSavingProfile}
              className="w-full neu-button-accent text-white rounded-xl py-2.5 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-wait"
            >
              <Check className="w-4 h-4" />
              <span>{isSavingProfile ? 'Сохранение…' : 'Сохранить'}</span>
            </button>
          </form>
        )}
      </div>

      {/* The rights were not read (finding 20): said here, where the admin entry would be; it appears once they are */}
      {!isFirebaseAdmin && adminCheckFailed && (
        <LoadFailedNotice
          title="Не удалось проверить права доступа"
          text="Если это аккаунт администратора, кнопка панели появится, когда база ответит. Проверьте соединение или обновите страницу."
        />
      )}

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
                  {ownOrders.some((o) => o.status !== 'delivered') && (
                    <span className="neu-inset-deep neu-inset-deep-animated text-accent font-extrabold text-[11px] px-2.5 py-0.5 rounded-full border border-accent/30">
                      Активен
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#4E5C70]">Отслеживание, статус и детализация ({ownOrders.length})</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#4E5C70]" />
          </button>
        </div>
      </div>

      {/* Account & sign-in (cloud sync details are shown to admins only) */}
      <ProfileAccountCard onShowToast={onShowToast} />

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
      <ProfileMeasurementsCard profile={profile} form={measurementsForm} />

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
      <ProfileStoreContacts
        storeName={storeName}
        storeSlogan={storeSlogan}
        pickupAddress={pickupAddress}
        storePhone={storePhone}
        storeTelegram={storeTelegram}
        storeSchedule={storeSchedule}
        workingHours={workingHours}
        hasHours={hasHours}
      />

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
        orders={ownOrders}
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
      <SavedAddressesModal
        isOpen={activeModal === 'addresses'}
        onClose={() => setActiveModal(null)}
        profile={profile}
        book={addressBook}
      />

      {/* ================= MODAL: ADD / EDIT ADDRESS FORM ================= */}
      <AddressFormModal book={addressBook} />

      {/* ================= MODAL: EDIT BODY MEASUREMENTS & RUSSIAN PATTERN ================= */}
      <MeasurementsModal form={measurementsForm} />

      {/* ================= MODAL: ADMIN PANEL ================= */}
      <ProfileAdminPanel
        isOpen={activeModal === 'admin' && isFirebaseAdmin}
        onClose={() => setActiveModal(null)}
        adminTab={adminTab}
        setAdminTab={setAdminTab}
        setSelectedOrderIdForTracking={setSelectedOrderIdForTracking}
        orders={orders}
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
        onApplyExchangeRates={onApplyExchangeRates}
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
      <ProfileSupportModal
        isOpen={activeModal === 'support'}
        onClose={() => setActiveModal(null)}
        storeName={storeName}
        storePhone={storePhone}
        storeEmail={storeEmail}
        storeSchedule={storeSchedule}
        workingHours={workingHours}
        onOpenSupportChat={onOpenSupportChat}
      />

      {/* Neumorphic Security Settings Modal */}
      <AccountDataModal
        isOpen={activeModal === 'security'}
        onClose={() => setActiveModal(null)}
        profile={profile}
        orders={ownOrders}
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
