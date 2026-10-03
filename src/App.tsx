import { SizeCalculatorModal } from './components/lazyWindows';
import React, { Suspense, lazy, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab, Product, CartItem, UserProfile, Order, BodyMeasurements, PromoCode, BannerSlide, ChatMessage, SupportStatus, AppliedPromoInfo, DeliveryMethod, PickupPoint, PaymentKind } from './types';
import { GUEST_USER_PROFILE } from './data/products';
import { saveLocalDeliveryMethods, saveLocalPickupPoints } from './data/deliveryData';
import {
  playNotificationChime,
  sendBrowserNotification,
  getOrderStatusNotification,
  getOrderPaymentNotification,
  type OrderNotificationPayload,
} from './utils/pushNotifications';
import { DeviceFrameWrapper } from './components/DeviceFrameWrapper';
import { DesktopTitleRow, Header, screenTitle } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SidebarDrawer } from './components/SidebarDrawer';
import { ToastContainer, ToastMessage } from './components/Toast';
import { DesktopHeader } from './components/DesktopHeader';
import {
  CatalogAdvancedFilter,
  FilterState,
  DEFAULT_FILTER_STATE,
  matchesCatalogFilters,
} from './components/CatalogAdvancedFilter';
import {
  withOrderDeducted,
  saveStorefrontSettings,
  getOrderableStock,
  orderStockProblems,
  stockProblemText,
  isPreorderVariant,
} from './utils/inventory';
import { formatAddress } from './utils/addressFormat';
import { buildClientOrder } from './utils/clientOrder';
import { hasHeavyPhotos } from './utils/productPhotos';
import { pluralRu } from './utils/pluralize';
import { ADMIN_EMAIL, useAuth } from './context/AuthContext';
import {
  ChatIdentity,
  auth,
  createGuestChatIdentity,
  db,
  forgetGuestChatIdentity,
  placeOrderOnServer,
  restoreGuestChatIdentity,
} from './firebase';
import {
  subscribeToChatMessages,
  placeClientOrder,
  orderRateWaitSeconds,
  handOverGuestData,
  deductOrderLineStock,
  cancelOrderAsCustomer,
  confirmOrderReceipt,
  submitPaymentReceipt,
  returnCancelledOrderStock,
  syncAllProductsToFirestore,
  saveProductCosts,
  moveProductCostsToPrivate,
  moveProductPhotosOut,
  deleteRemovedDocs,
  changedItems,
  recordPromoUsageInFirestore,
  syncAllOrdersToFirestore,
  syncAllPromosToFirestore,
  saveStorefrontSettingsToFirestore,
  saveLegalText,
  saveChatMessageToFirestore,
  clearChatMessagesInFirestore,
  saveUserProfileToFirestore,
  syncAllBannersToFirestore,
  syncAllDeliveryMethodsToFirestore,
  syncAllPickupPointsToFirestore,
  chatMessageOrder,
  applyChatMessageChange,
  applyChatMessageChangeLocally,
  ChatMessageChange,
  subscribeToSupportStatus,
} from './utils/firebaseSync';
import { useCatalog } from './app/useCatalog';
import { BANNERS_STORAGE_KEY, useStorefrontData } from './app/useStorefrontData';
import { useAccountData } from './app/useAccountData';
import { forgetGuestOrders, saveGuestOrder } from './app/guestOrders';

import { HomeScreen } from './views/HomeScreen';
import { CatalogScreen } from './views/CatalogScreen';
import { ProductDetailScreen } from './views/ProductDetailScreen';
import { CartScreen } from './views/CartScreen';
import { PreviewBanner } from './components/PreviewBanner';
import { LazyMount } from './components/LazyMount';
import {
  loadBrandRequisitesModal,
  loadCheckoutScreen,
  loadFavoritesScreen,
  loadOrderSuccessScreen,
  loadProfileScreen,
  loadPromoModal,
  loadSupportChatModal,
  prefetchCustomerScreensWhenIdle,
} from './customerLoaders';
import type { CatalogStatus } from './components/CatalogLoadState';
import { CART_STORAGE_KEY, loadStoredCart, toStoredCart } from './utils/cartStorage';
import { validatePromo, toPricingLine, isPromoListed, promoDiscountKind, QUICK_ORDER_DELIVERY_ID } from './shared/orderPricing';
import { toOrderLineProduct } from './shared/orderLine';
import { STORE_PAUSED_TEXT, storeAcceptsOrders } from './shared/orderApi';
import { cleanAddressParts, fullName, hasNameParts, namePartsOf, type AddressParts, type PersonName } from './shared/personName';
import { extractColorName, extractSizeName } from './utils/inventory';
import { getStoreContacts, getStoreName, publicSetting, withStoreName, withStoreNameFields } from './utils/storeContacts';
import { getCategories } from './utils/categories';
import { promoDiscountText } from './utils/promoLabel';
import { hasOrderableVariant, needsVariantChoice } from './utils/variantSelection';
import { VariantPickerSheet } from './components/VariantPickerSheet';
import { currentRoutePath, parseRoute, readHistoryState, routePath, type HistoryEntryState } from './utils/navigation';
import { afterWindowHistory, isWindowHistoryBusy, windowDepth } from './utils/windowHistory';

// Legal documents: a separate chunk with the templates, loaded when a document is opened
const LegalDocumentScreen = lazy(() => import('./views/LegalDocumentScreen'));
/** A screen loaded on demand (usually already prefetched): a quiet line instead of an empty page */
const ScreenLoading: React.FC = () => (
  <p className="px-4 py-10 text-center text-xs text-[#4E5C70]" role="status">
    Загрузка…
  </p>
);

// Not needed on the first screen: loaded on demand and prefetched in idle time (customerLoaders.ts)
const ProfileScreen = lazy(() => loadProfileScreen().then((m) => ({ default: m.ProfileScreen })));
const CheckoutScreen = lazy(() => loadCheckoutScreen().then((m) => ({ default: m.CheckoutScreen })));
const OrderSuccessScreen = lazy(() => loadOrderSuccessScreen().then((m) => ({ default: m.OrderSuccessScreen })));
const FavoritesScreen = lazy(() => loadFavoritesScreen().then((m) => ({ default: m.FavoritesScreen })));
const SupportChatModal = lazy(() => loadSupportChatModal().then((m) => ({ default: m.SupportChatModal })));
const PromoModal = lazy(() => loadPromoModal().then((m) => ({ default: m.PromoModal })));
const BrandRequisitesModal = lazy(() => loadBrandRequisitesModal().then((m) => ({ default: m.BrandRequisitesModal })));

// Unique across customers: messages are create-only for customers (see firestore.rules)
function newChatMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Default profile of earlier versions (the shop admin's name, email, phone and office address)
function isLegacyDemoProfile(profile: Partial<UserProfile>): boolean {
  return (
    profile.name === 'Администратор MANSTYLE' ||
    (profile.email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
    (profile.savedAddresses || []).some((a) => a.id === 'addr-1' && a.title === 'Офис MANSTYLE')
  );
}

// v2: the chat is per customer now; don't show the old shared-chat cache
const CHAT_CACHE_STORAGE_KEY = 'manstyle_chat_messages_v2';

export default function App() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  // The screen comes from the address (/catalog, /product/{id}, an old #/…): reload, a shared link and «Назад» work
  const [initialRoute] = useState(() => parseRoute(window.location));
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() =>
    // The confirmation needs the order just placed: after a reload there is none
    !initialRoute || initialRoute.tab === 'order-success' ? 'home' : initialRoute.tab
  );

  // Browser history for the screens (see the sync effect below the product state)
  const historyIdx = React.useRef(0);
  const leavingScroll = React.useRef(0);
  const pendingScroll = React.useRef<number | null>(null);
  const replaceNextRoute = React.useRef(false);
  const isFirstRouteSync = React.useRef(true);
  // The address of the screen on show: a popstate to it with the same idx only closed a window (windowHistory.ts)
  const shownPath = React.useRef('');
  // A screen change waited for a window to take its history entry back: sync the address again
  const [routeRetry, setRouteRetry] = useState(0);
  /** Every screen change goes through here: remembers the scroll of the screen being left */
  const setActiveTab = React.useCallback((tab: ActiveTab) => {
    leavingScroll.current = window.scrollY;
    setActiveTabState(tab);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  // Catalog search: the same text in the computer's top bar, on the home screen and in the catalog
  const [catalogSearch, setCatalogSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('manstyle_favorites');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('manstyle_favorites', JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  // Settings, promos, banners and delivery: live from Firestore, cached in the browser (useStorefrontData.ts)
  const {
    promos,
    setPromos,
    bannerSlides,
    setBannerSlides,
    serverOrdersEnabled,
    storefrontSettings,
    setStorefrontSettings,
    deliveryMethods,
    setDeliveryMethods,
    pickupPoints,
    setPickupPoints,
  } = useStorefrontData();

  const handleUpdateBannerSlides = (newBanners: BannerSlide[]) => {
    const removed = deleteRemovedDocs('banners', bannerSlides, newBanners);
    setBannerSlides(newBanners);
    try {
      localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(newBanners));
    } catch {}
    return persist('баннеры', removed, syncAllBannersToFirestore(newBanners));
  };

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_CACHE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // The removed local admin password was kept here in plain text: erase it
  React.useEffect(() => {
    try {
      localStorage.removeItem('manstyle_admin_credentials');
      sessionStorage.removeItem('manstyle_admin_auth');
    } catch {}
  }, []);


  // Delivery state of the customer's own chat messages (a failed one stays on screen with «повторить»)
  const [pendingChatIds, setPendingChatIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failedChatMessages, setFailedChatMessages] = useState<ChatMessage[]>([]);
  const [chatIdentity, setChatIdentity] = useState<ChatIdentity | null>(null);
  // Admin → «Витрина» → «Предзаказ»: sold-out variants can still be ordered
  const preorderMode = storefrontSettings?.isPreorderMode === true;

  // Saved cart (light lines, cartStorage.ts); the full products come from the catalog subscription
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      return loadStoredCart(localStorage.getItem(CART_STORAGE_KEY));
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(toStoredCart(cartItems)));
    } catch (err) {
      console.error('Cart was not saved in the browser:', err);
    }
  }, [cartItems]);

  // A product from the address is restored once the catalog loads (see the products subscription)
  const pendingSelectedProductId = React.useRef<string | null>(initialRoute?.productId ?? null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // Catalog with its reviews (useCatalog.ts). Every snapshot brings the cart's stock and prices up to date and
  // refreshes the open product
  const { products, setProducts, productsLoaded, productsError } = useCatalog((loadedProds) => {
    setCartItems((prevCart) =>
      prevCart
        .filter((ci) => loadedProds.some((p) => p.id === ci.product.id))
        .map((ci) => {
          const fresh = loadedProds.find((p) => p.id === ci.product.id);
          return fresh ? { ...ci, product: fresh } : ci;
        })
    );
    // Read the pending id outside the updater: React may call updaters twice (StrictMode),
    // and a ref cleared inside it would lose the product from the address on the second call
    const pendingId = pendingSelectedProductId.current;
    pendingSelectedProductId.current = null;
    setSelectedProduct((prev) => {
      const wantedId = prev?.id ?? pendingId;
      if (!wantedId) return null;
      return loadedProds.find((p) => p.id === wantedId) || null;
    });
  });
  // Orders, profiles and cost prices: whose depends on the sign-in (useAccountData.ts)
  const { allUsers, orders, setOrders, productCosts, setProductCosts } = useAccountData({ authLoading, isAdmin, currentUser });

  // Screen → address. A new screen is a new history entry (so «Назад» returns to it) and opens
  // at the top; the confirmation replaces the checkout entry, «Назад» does not return to paying.
  // Open windows have entries of their own over the screen's (windowHistory.ts)
  const routeProductId =
    activeTab === 'product-detail' ? selectedProduct?.id ?? pendingSelectedProductId.current ?? undefined : undefined;
  React.useEffect(() => {
    // A product that is not resolved yet (catalog loading) or is gone: wait, see the not-found effect
    if (activeTab === 'product-detail' && !routeProductId) return;
    const path = routePath({ tab: activeTab, productId: routeProductId });
    if (isFirstRouteSync.current) {
      isFirstRouteSync.current = false;
      replaceNextRoute.current = false;
      window.history.scrollRestoration = 'manual';
      // An old #/… link becomes the screen's path; the query (ad tags) stays
      window.history.replaceState({ wasat: true, idx: 0 } satisfies HistoryEntryState, '', path + window.location.search);
      shownPath.current = path;
      return;
    }
    // Already there: a Back/Forward the popstate handler applied
    if (currentRoutePath() === path) return;
    // A window has just closed and is taking its history entry back: the new address goes after it
    if (isWindowHistoryBusy()) {
      afterWindowHistory(() => setRouteRetry((n) => n + 1));
      return;
    }
    // The confirmation replaces only the checkout; after «Заказ в 1 клик» «Назад» returns to the product or the cart
    const replace =
      replaceNextRoute.current || (activeTab === 'order-success' && shownPath.current === routePath({ tab: 'checkout' }));
    replaceNextRoute.current = false;
    shownPath.current = path;
    pendingScroll.current = 0;
    if (windowDepth(window.history.state) > 0) {
      // Left the screen from a window: the window's entry becomes the new screen's, «Назад» returns to the screen
      // under the window (its scroll was saved when the window opened)
      historyIdx.current += 1;
      window.history.replaceState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '', path);
      return;
    }
    window.history.replaceState(
      { ...readHistoryState(window.history.state), wasat: true, idx: historyIdx.current, scrollY: leavingScroll.current } satisfies HistoryEntryState,
      ''
    );
    if (replace) {
      window.history.replaceState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '', path);
    } else {
      historyIdx.current += 1;
      window.history.pushState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '', path);
    }
  }, [activeTab, routeProductId, routeRetry]);
  // Filled as the visitor opens products; no made-up history
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('manstyle_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Older versions shipped the shop admin's personal data as the default profile and
        // cached it in every visitor's browser. Drop such a cache; the admin's own profile
        // is restored from Firebase Auth after sign-in.
        if (parsed && typeof parsed === 'object' && !isLegacyDemoProfile(parsed)) {
          return { ...GUEST_USER_PROFILE, ...parsed };
        }
        localStorage.removeItem('manstyle_user_profile');
      }
    } catch {}
    return GUEST_USER_PROFILE;
  });

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated);
    try {
      localStorage.setItem('manstyle_user_profile', JSON.stringify(updated));
    } catch {}
    // Only into the account that is signed in right now: right after «Выйти» this closure still holds the previous
    // user, and the guest profile used to overwrite their addresses and measurements (audit 02.10, finding 23)
    if (currentUser?.uid && auth.currentUser?.uid === currentUser.uid) {
      // The profile (addresses, measurements) must not be lost silently: a refused write says so
      void persist('профиль', saveUserProfileToFirestore(currentUser.uid, updated));
    }
  };
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState(false);
  /** «Вопрос по заказу № …» typed into the chat opened from an order (finding 26) */
  const [chatDraft, setChatDraft] = useState('');
  // An order passed in (the profile's order buttons) types «Вопрос по заказу № …»; a click event is not an order
  const openSupportChat = (orderId?: unknown) => {
    setChatDraft(typeof orderId === 'string' && orderId ? `Вопрос по заказу № ${orderId}: ` : '');
    setIsSupportChatOpen(true);
  };
  const [isMySizesModalOpen, setIsMySizesModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [catalogFilterState, setCatalogFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoInfo | null>(null);

  // Customers see the current store name even while Firestore still holds the template brand.
  // The admin panel gets the raw data, so the rename in «Витрина» can find and fix it.
  const storeName = getStoreName(storefrontSettings);
  const customerStorefront = React.useMemo(
    () => ({ ...withStoreNameFields(storefrontSettings, storeName), storeName }),
    [storefrontSettings, storeName]
  );
  // Tab title: a product's name on its screen (the browser's history, bookmarks and search results show it)
  const productTitle = activeTab === 'product-detail' ? selectedProduct?.title : undefined;
  React.useEffect(() => {
    document.title = productTitle ? `${productTitle} — ${storeName}` : `${storeName} — мужская одежда`;
  }, [productTitle, storeName]);
  const customerDeliveryMethods = React.useMemo(
    () => deliveryMethods.map((m) => withStoreNameFields(m, storeName)),
    [deliveryMethods, storeName]
  );
  const customerBannerSlides = React.useMemo(
    () => bannerSlides.map((s) => withStoreNameFields(s, storeName)),
    [bannerSlides, storeName]
  );
  const customerPickupPoints = React.useMemo(
    () => pickupPoints.map((pt) => withStoreNameFields(pt, storeName)),
    [pickupPoints, storeName]
  );

  const handleUpdateDeliveryMethods = (updated: DeliveryMethod[]) => {
    const removed = deleteRemovedDocs('delivery_methods', deliveryMethods, updated);
    setDeliveryMethods(updated);
    saveLocalDeliveryMethods(updated);
    return persist('способы доставки', removed, syncAllDeliveryMethodsToFirestore(updated));
  };

  const handleUpdatePickupPoints = (updated: PickupPoint[]) => {
    const removed = deleteRemovedDocs('pickup_points', pickupPoints, updated);
    setPickupPoints(updated);
    saveLocalPickupPoints(updated);
    return persist('пункты выдачи', removed, syncAllPickupPointsToFirestore(updated));
  };

  // Global Filter Match Counter for modal
  const filteredProductsCount = React.useMemo(() => {
    return products.filter((p) => matchesCatalogFilters(p, selectedCategory, catalogFilterState)).length;
  }, [products, selectedCategory, catalogFilterState]);

  const handleResetCatalogFilters = () => {
    setSelectedCategory('all');
    setCatalogFilterState(DEFAULT_FILTER_STATE);
  };

  // Only a customer's own thread is cached (it opens at once next time). The admin's chat — every customer's
  // messages and staff notes — never stays in this browser (audit 02.10, finding 24)
  React.useEffect(() => {
    try {
      if (isAdmin) localStorage.removeItem(CHAT_CACHE_STORAGE_KEY);
      else localStorage.setItem(CHAT_CACHE_STORAGE_KEY, JSON.stringify(chatMessages));
    } catch {}
  }, [chatMessages, isAdmin]);

  // Signed out: the profile and the chat of that account leave this browser (only locally — nothing is written)
  const signedInUidRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (authLoading) return;
    const uid = currentUser?.uid ?? null;
    if (signedInUidRef.current && !uid) {
      setUserProfile(GUEST_USER_PROFILE);
      setChatMessages([]);
      try {
        localStorage.removeItem('manstyle_user_profile');
        localStorage.removeItem(CHAT_CACHE_STORAGE_KEY);
      } catch {}
    }
    signedInUidRef.current = uid;
  }, [authLoading, currentUser]);

  // 1c. Support chat identity: signed-in customers chat as themselves, guests reuse
  // an anonymous chat session if they started one earlier (created on first message).
  React.useEffect(() => {
    if (authLoading) return;
    if (currentUser) {
      setChatIdentity({ uid: currentUser.uid, db, isGuest: false });
      return;
    }
    let cancelled = false;
    setChatIdentity(null);
    restoreGuestChatIdentity().then((identity) => {
      if (!cancelled) setChatIdentity(identity);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser]);

  // 1c'. A guest signed in with Google: the orders and the chat of the guest's anonymous sign-in move to the account
  // (audit 02.10, finding 26). Both sides agree in this browser (rules), then the guest's session ends
  React.useEffect(() => {
    if (authLoading || !currentUser || isAdmin) return;
    let cancelled = false;
    restoreGuestChatIdentity().then(async (guest) => {
      if (cancelled || !guest || guest.uid === currentUser.uid) return;
      try {
        const { orderIds, messages } = await handOverGuestData(guest, currentUser.uid);
        forgetGuestOrders(orderIds);
        await forgetGuestChatIdentity();
        const parts = [
          orderIds.length > 0 ? `${orderIds.length} ${pluralRu(orderIds.length, ['заказ', 'заказа', 'заказов'])}` : '',
          messages > 0 ? 'переписка с магазином' : '',
        ].filter(Boolean);
        if (parts.length > 0) addToast(`Перенесено в ваш аккаунт то, что было без входа: ${parts.join(' и ')}`, 'success');
      } catch (err) {
        // the guest's orders stay visible from this browser; the move is tried again at the next sign-in
        console.error('Guest orders and chat were not moved to the account:', err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1d. Chat messages: admins see every thread, customers only their own
  React.useEffect(() => {
    if (authLoading) return;
    if (isAdmin) {
      return subscribeToChatMessages((loadedMsgs) => setChatMessages(loadedMsgs));
    }
    if (chatIdentity) {
      return subscribeToChatMessages((loadedMsgs) => setChatMessages(loadedMsgs), undefined, {
        threadId: chatIdentity.uid,
        db: chatIdentity.db,
      });
    }
    setChatMessages([]);
  }, [authLoading, isAdmin, chatIdentity]);

  // 1e. Status of the customer's own dialog, set by the staff (shown in «Служба заботы»)
  const [supportStatus, setSupportStatus] = useState<SupportStatus | null>(null);
  React.useEffect(() => {
    setSupportStatus(null);
    if (!chatIdentity) return;
    return subscribeToSupportStatus(chatIdentity.uid, chatIdentity.db, setSupportStatus);
  }, [chatIdentity]);

  // 2. Sync profile from Firebase Auth user & users collection
  React.useEffect(() => {
    if (currentUser) {
      const existing = allUsers.find(
        (u) =>
          (u.uid && u.uid === currentUser.uid) ||
          (u.email && u.email.toLowerCase() === (currentUser.email || '').toLowerCase())
      );
      setUserProfile((prev) => {
        const merged: UserProfile = {
          ...prev,
          ...(existing || {}),
          // The name the buyer saved (Фамилия Имя Отчество) wins over the Google account's name
          name: existing?.name || currentUser.displayName || prev.name,
          email: currentUser.email || existing?.email || prev.email,
          avatar: currentUser.photoURL || existing?.avatar || prev.avatar,
          bonusPoints: existing?.bonusPoints ?? prev.bonusPoints ?? 0,
        };
        try {
          localStorage.setItem('manstyle_user_profile', JSON.stringify(merged));
        } catch {}
        return merged;
      });
    }
  }, [currentUser, allUsers]);


  // Latest Order info for confirmation screen
  const [latestOrder, setLatestOrder] = useState<{
    id: string;
    totalPrice: number;
    deliveryMethod: string;
    deliveryAddress: string;
    paymentMethod?: string;
  } | null>(null);

  // Browser «Назад» / «Вперед»: show the screen from the address and restore its scroll
  const productsRef = React.useRef(products);
  productsRef.current = products;
  const productsLoadedRef = React.useRef(productsLoaded);
  productsLoadedRef.current = productsLoaded;
  const latestOrderRef = React.useRef(latestOrder);
  latestOrderRef.current = latestOrder;
  React.useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const entry = readHistoryState(e.state);
      // The same entry of the screen: «Назад» closed a window over it (windowHistory.ts), the screen stays
      if (entry && entry.idx === historyIdx.current && currentRoutePath() === shownPath.current) return;
      const route = parseRoute(window.location) ?? { tab: 'home' as ActiveTab };
      if (entry) {
        historyIdx.current = entry.idx;
      } else {
        // A link or an edited address (an old #/… too): a new entry of the shop's history, at the screen's path
        historyIdx.current += 1;
        window.history.replaceState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '', routePath(route));
      }
      shownPath.current = currentRoutePath();
      pendingScroll.current = entry?.scrollY ?? 0;
      if (route.tab === 'product-detail' && route.productId) {
        const product = productsRef.current.find((p) => p.id === route.productId);
        // Not in the loaded catalog: gone (the not-found effect leads to the catalog); else wait for it
        pendingSelectedProductId.current = product || productsLoadedRef.current ? null : route.productId;
        setSelectedProduct(product ?? null);
      }
      if (route.tab === 'order-success' && !latestOrderRef.current) {
        replaceNextRoute.current = true;
        setActiveTabState('home');
      } else {
        setActiveTabState(route.tab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // A link to a screen of the shop (the other document under the offer, an old #/… in a text) opens the screen without
  // reloading the page and the catalog; product links (ProductCard) open their product themselves
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      const route = parseRoute(url) ?? (url.pathname === '/' && !url.hash ? { tab: 'home' as ActiveTab } : null);
      if (!route || route.tab === 'product-detail' || route.tab === 'order-success') return;
      e.preventDefault();
      setActiveTab(route.tab);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [setActiveTab]);

  // A product link to a product that no longer exists: back to the catalog instead of an empty page
  React.useEffect(() => {
    if (productsLoaded && activeTab === 'product-detail' && !selectedProduct && !pendingSelectedProductId.current) {
      replaceNextRoute.current = true;
      setActiveTab('catalog');
      addToast('Товар не найден: возможно, его сняли с продажи', 'info');
    }
  }, [productsLoaded, activeTab, selectedProduct]);

  /** «Назад» in the header: the previous screen of this visit, else the parent screen */
  const handleHeaderBack = () => {
    if ((readHistoryState(window.history.state)?.idx ?? 0) > 0) {
      window.history.back();
      return;
    }
    setActiveTab(activeTab === 'checkout' ? 'cart' : activeTab === 'product-detail' ? 'catalog' : 'home');
  };

  // Global tactile feedback on button click/tap
  React.useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, [role="button"], .neu-button, .neu-pressable, a')) {
        if ('vibrate' in navigator) {
          try {
            navigator.vibrate(6);
          } catch {
            // Ignore if vibration permissions unavailable
          }
        }
      }
    };
    window.addEventListener('pointerdown', handleGlobalClick);
    return () => window.removeEventListener('pointerdown', handleGlobalClick);
  }, []);

  // Order status changes push notification watcher
  const previousOrdersMapRef = React.useRef<
    Map<string, { status: Order['status']; isCancelled?: boolean; trackingNumber?: string; paymentStatus?: Order['paymentStatus'] }>
  >(new Map());
  const isInitialOrdersLoadRef = React.useRef(true);

  // Trigger push notification on order status change
  const triggerOrderStatusPushNotification = (
    order: Order,
    oldStatus?: Order['status'],
    newStatus?: Order['status'],
    payload?: OrderNotificationPayload
  ) => {
    const notif = payload ?? getOrderStatusNotification(order, oldStatus, newStatus);

    // Sound and a system notification only when the customer left notifications on in the profile
    if (userProfile.notificationsEnabled !== false) {
      playNotificationChime();
      sendBrowserNotification(notif.title, {
        body: `${notif.subtitle}\n${notif.text}`,
      });
    }

    // 3. Trigger In-App Rich Push Toast
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [
      ...prev,
      {
        id,
        type: 'order_status',
        title: notif.title,
        subtitle: notif.subtitle,
        text: notif.text,
        badgeText: notif.badgeText,
        badgeBg: notif.badgeBg,
        icon: notif.icon,
        orderId: order.id,
        oldStatus,
        newStatus,
        duration: 7000,
        action: {
          label: 'Смотреть статус',
          onClick: () => {
            setActiveTab('profile');
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('manstyle_open_order_tracking', {
                  detail: { orderId: order.id },
                })
              );
            }, 100);
          },
        },
      },
    ]);
  };

  React.useEffect(() => {
    if (!orders || orders.length === 0) return;

    if (isInitialOrdersLoadRef.current) {
      orders.forEach((o) => {
        previousOrdersMapRef.current.set(o.id, {
          status: o.status,
          isCancelled: o.isCancelled,
          trackingNumber: o.trackingNumber,
          paymentStatus: o.paymentStatus,
        });
      });
      isInitialOrdersLoadRef.current = false;
      return;
    }

    // Compare with previous status snapshot
    orders.forEach((currentOrder) => {
      const prev = previousOrdersMapRef.current.get(currentOrder.id);
      if (prev) {
        const statusChanged = prev.status !== currentOrder.status;
        const cancelChanged = !prev.isCancelled && Boolean(currentOrder.isCancelled);
        const trackingChanged = !prev.trackingNumber && Boolean(currentOrder.trackingNumber);

        // An admin loads every customer's orders: «ваш заказ» is only about their own
        const isOwnOrder = !isAdmin || currentOrder.customerUid === currentUser?.uid;
        // The buyer cancelled it themselves: the profile already said so
        const ownCancel = cancelChanged && currentOrder.cancelledBy === 'customer';
        // «Я получил заказ» — the buyer's own step too
        const ownStep = statusChanged && currentOrder.statusLog?.[currentOrder.statusLog.length - 1]?.by === 'customer';
        if (isOwnOrder && ((statusChanged && !ownStep) || (cancelChanged && !ownCancel) || trackingChanged)) {
          triggerOrderStatusPushNotification(currentOrder, prev.status, currentOrder.status);
        }
        // the store checked the receipt («Доработки 5»): confirmed or rejected
        const paymentNotif =
          isOwnOrder && prev.paymentStatus === 'receipt_review'
            ? getOrderPaymentNotification(currentOrder, currentOrder.paymentStatus)
            : null;
        if (paymentNotif) triggerOrderStatusPushNotification(currentOrder, prev.status, currentOrder.status, paymentNotif);
      }

      // Update reference
      previousOrdersMapRef.current.set(currentOrder.id, {
        status: currentOrder.status,
        isCancelled: currentOrder.isCancelled,
        trackingNumber: currentOrder.trackingNumber,
        paymentStatus: currentOrder.paymentStatus,
      });
    });
  }, [orders]);

  // Helper Toast launcher
  const addToast = (
    text: string,
    type: 'success' | 'info' | 'error' = 'success',
    action?: ToastMessage['action']
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    // The same message is not stacked twice (errors stay until closed)
    setToasts((prev) =>
      prev.some((t) => t.text === text && t.type === type) ? prev : [...prev, { id, text, type, ...(action ? { action } : {}) }]
    );
  };

  /**
   * Admin writes to Firestore: a rejected write (rules, network) shows an error toast instead of
   * failing silently. Resolves to false so the caller does not report «Сохранено».
   */
  const persist = (label: string, ...writes: Promise<unknown>[]): Promise<boolean> =>
    Promise.all(writes).then(
      () => true,
      (error) => {
        console.error(`Не сохранено: ${label}`, error);
        addToast(`Не сохранено: ${label}. Проверьте соединение и повторите`, 'error');
        return false;
      }
    );

  // The admin panel sees products with their cost price; everything else keeps the public products
  const adminProducts = React.useMemo(
    () =>
      isAdmin
        ? products.map((p) => {
            const cost = productCosts[p.id];
            return cost !== undefined && cost !== p.costPrice ? { ...p, costPrice: cost } : p;
          })
        : products,
    [isAdmin, products, productCosts]
  );

  // Cost prices once saved inside products are readable by every visitor: the admin's session moves them
  // to `product_costs` (copy and removal in one batch)
  const costsMovedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAdmin || !productsLoaded || costsMovedRef.current) return;
    const legacy = products.filter((p) => typeof p.costPrice === 'number');
    if (legacy.length === 0) return;
    costsMovedRef.current = true;
    void persist('себестоимость товаров', moveProductCostsToPrivate(legacy));
  }, [isAdmin, productsLoaded, products]);

  // Photos still inside products (each visitor downloaded them with the catalog): the admin's session moves them to
  // product_photos and leaves previews in the products (stage 6, finding 18). Once per session, product by product
  const photosMovedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAdmin || !productsLoaded || photosMovedRef.current) return;
    const heavy = products.filter(hasHeavyPhotos);
    if (heavy.length === 0) return;
    photosMovedRef.current = true;
    void (async () => {
      let moved = 0;
      for (const product of heavy) {
        try {
          if (await moveProductPhotosOut(product)) moved++;
        } catch (err) {
          console.error(`Photos of product ${product.id} were not moved:`, err);
        }
      }
      if (moved > 0) {
        addToast(`Фото ${moved} ${pluralRu(moved, ['товара', 'товаров', 'товаров'])} вынесены из карточек: каталог у покупателей грузится быстрее`, 'info');
      }
    })();
  }, [isAdmin, productsLoaded, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Toggle Favorite
  const handleToggleFavorite = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorites.includes(product.id)) {
      setFavorites((prev) => prev.filter((id) => id !== product.id));
      addToast(`Удалено из избранного: ${product.title}`, 'info');
    } else {
      setFavorites((prev) => [...prev, product.id]);
      addToast(`Добавлено в избранное: ${product.title}`, 'success');
    }
  };

  // «+» on a product card: one variant is added at once, several — the customer picks one first
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const openCartAction = { label: 'В корзину', onClick: () => setActiveTab('cart') };

  const handleAddToCartQuick = (product: Product, e?: React.MouseEvent): boolean => {
    e?.stopPropagation();
    if (!hasOrderableVariant(product, preorderMode)) {
      addToast(`Товар "${product.title}" временно закончился`, 'error');
      return false;
    }
    if (needsVariantChoice(product)) {
      setVariantPickerProduct(product);
      return false;
    }
    const color = product.colors?.[0]?.name || '';
    const size = product.sizes?.[0] || '';
    // No invented colour or size: without them the customer picks a variant in the product card
    if (!color || !size) {
      handleSelectProduct(product);
      return false;
    }
    return handleAddToCartWithOptions(product, color, size, 1);
  };

  // Add a chosen variant to the cart. The customer stays on the page: the toast links to the cart
  const handleAddToCartWithOptions = (
    product: Product,
    color: string,
    size: string,
    quantity: number
  ): boolean => {
    const availableStock = getOrderableStock(product, color, size, preorderMode);
    if (availableStock <= 0) {
      addToast(`К сожалению, ${product.title} (${color}, ${size}) нет в наличии`, 'error');
      return false;
    }

    const clampedQuantity = Math.min(quantity, availableStock);
    const existingIndex = cartItems.findIndex(
      (item) =>
        item.product.id === product.id &&
        item.selectedColor === color &&
        item.selectedSize === size
    );

    if (existingIndex > -1) {
      const currentQty = cartItems[existingIndex].quantity;
      if (currentQty >= availableStock) {
        addToast(`В корзине уже максимум: ${product.title} (${availableStock} шт.)`, 'info', openCartAction);
        return false;
      }
      const newTotalQty = Math.min(currentQty + clampedQuantity, availableStock);
      setCartItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: newTotalQty } : item
        )
      );
      addToast(`В корзине ${newTotalQty} шт.: ${product.title} (${color}, ${size})`, 'success', openCartAction);
    } else {
      const newItem: CartItem = {
        id: `cart-${Date.now()}`,
        product,
        selectedColor: color,
        selectedSize: size,
        quantity: clampedQuantity,
      };
      setCartItems((prev) => [...prev, newItem]);
      addToast(
        `${isPreorderVariant(product, color, size, preorderMode) ? 'Предзаказ добавлен' : 'Добавлено'} в корзину: ${product.title} (${color}, ${size})`,
        'success',
        openCartAction
      );
    }
    return true;
  };

  /**
   * The buyer cancels their order in the profile («Доработки 3»): the cancellation first (the rules check it), then
   * the goods back to stock line by line. A return cut off by the network is repeated next time (effect below);
   * meanwhile «Заказы» offers the admin «Вернуть на склад».
   */
  const stockReturnTriedRef = React.useRef(new Set<string>());
  const handleCancelOwnOrder = async (order: Order, reason: string, comment: string): Promise<boolean> => {
    // Before the write: its local snapshot would start the repeat below alongside this return
    stockReturnTriedRef.current.add(order.id);
    try {
      await cancelOrderAsCustomer(order.id, reason, comment, new Date());
    } catch (err) {
      stockReturnTriedRef.current.delete(order.id);
      console.error('Order cancellation was refused:', err);
      addToast('Не удалось отменить заказ. Проверьте соединение или напишите в чат магазина.', 'error');
      return false;
    }
    try {
      await returnCancelledOrderStock(order);
      addToast(`Заказ № ${order.id} отменён`, 'success');
    } catch (err) {
      console.error(`Stock of the cancelled order ${order.id} was not returned:`, err);
      addToast(`Заказ № ${order.id} отменён. Возврат товаров на склад магазин проверит сам.`, 'info');
    }
    return true;
  };

  /** «Я получил заказ»: a carrier's order becomes «Получен» with the time of the tap (rule isCustomerReceiptConfirm) */
  const handleConfirmReceipt = async (order: Order): Promise<boolean> => {
    try {
      await confirmOrderReceipt(order, new Date());
      addToast(`Заказ № ${order.id} получен. Спасибо!`, 'success');
      return true;
    } catch (err) {
      console.error('Receipt confirmation was refused:', err);
      addToast('Не удалось подтвердить получение. Проверьте соединение или напишите в чат магазина.', 'error');
      return false;
    }
  };

  /**
   * «Оплачено» с фото чека («Доработки 5»): фото с подписью уходит в чат магазина, заказ — «Чек на проверке»
   * (правило isCustomerReceiptSubmit). Только вошедший покупатель: гость получает реквизиты в чате.
   */
  const handleSubmitPaymentReceipt = async (order: Order, kind: PaymentKind, imageUrl: string): Promise<boolean> => {
    if (!currentUser || currentUser.isAnonymous) return false;
    try {
      const message = await submitPaymentReceipt(
        order,
        kind,
        imageUrl,
        { threadId: currentUser.uid, threadName: userProfile.name || currentUser.email || 'Покупатель' },
        new Date()
      );
      setChatMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      addToast(`Чек отправлен. Магазин проверит оплату заказа № ${order.id}`, 'success');
      return true;
    } catch (err) {
      console.error('Payment receipt was not sent:', err);
      addToast('Чек не отправлен. Проверьте соединение и попробуйте ещё раз — или отправьте фото в чат магазина.', 'error');
      return false;
    }
  };

  // A cancellation whose goods did not all get back to stock (network, closed tab): once a session
  React.useEffect(() => {
    if (!currentUser || authLoading) return;
    for (const order of orders) {
      if (
        order.customerUid !== currentUser.uid ||
        !order.isCancelled ||
        order.cancelledBy !== 'customer' ||
        order.stockReturned !== false ||
        stockReturnTriedRef.current.has(order.id)
      ) {
        continue;
      }
      stockReturnTriedRef.current.add(order.id);
      returnCancelledOrderStock(order).catch((err) =>
        console.error(`Stock of the cancelled order ${order.id} was not returned again:`, err)
      );
    }
  }, [orders, currentUser, authLoading]);

  // Repeat a past order: current product data and stock, unavailable items are skipped
  const handleRepeatOrder = (items: CartItem[]) => {
    const toAdd: CartItem[] = [];
    let skipped = 0;
    items.forEach((item, idx) => {
      const product = products.find((p) => p.id === item.product?.id);
      const stock = product ? getOrderableStock(product, item.selectedColor, item.selectedSize, preorderMode) : 0;
      if (!product || stock <= 0) {
        skipped += 1;
        return;
      }
      toAdd.push({
        id: `cart-${Date.now()}-${idx}`,
        product,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: Math.min(item.quantity, stock),
      });
    });

    if (toAdd.length === 0) {
      addToast('Товаров из этого заказа сейчас нет в наличии', 'error');
      return;
    }

    setCartItems((prev) => {
      const next = [...prev];
      for (const add of toAdd) {
        const i = next.findIndex(
          (c) =>
            c.product.id === add.product.id &&
            c.selectedColor === add.selectedColor &&
            c.selectedSize === add.selectedSize
        );
        if (i > -1) {
          const stock = getOrderableStock(add.product, add.selectedColor, add.selectedSize, preorderMode);
          next[i] = { ...next[i], quantity: Math.min(next[i].quantity + add.quantity, stock) };
        } else {
          next.push(add);
        }
      }
      return next;
    });
    addToast(
      skipped > 0
        ? `Товары добавлены в корзину. Нет в наличии: ${skipped}`
        : 'Товары заказа добавлены в корзину',
      skipped > 0 ? 'info' : 'success'
    );
    setActiveTab('cart');
  };

  // Update quantity in cart
  const handleUpdateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
    } else {
      setCartItems((prev) =>
        prev.map((item) => {
          if (item.id === cartItemId) {
            const stock = getOrderableStock(item.product, item.selectedColor, item.selectedSize, preorderMode);
            const clamped = stock > 0 ? Math.min(newQty, stock) : newQty;
            return { ...item, quantity: clamped };
          }
          return item;
        })
      );
    }
  };

    // Remove from cart
  const handleRemoveCartItem = (cartItemId: string) => {
    const itemToRemove = cartItems.find((i) => i.id === cartItemId);
    setCartItems((prev) => prev.filter((item) => item.id !== cartItemId));
    if (itemToRemove) {
      addToast(`Удалено из корзины: ${itemToRemove.product.title}`, 'info');
    }
  };

  // Update item variant (color / size) directly in cart
  const handleUpdateCartItemVariant = (cartItemId: string, newColor: string, newSize: string) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id === cartItemId) {
          const availableStock = getOrderableStock(item.product, newColor, newSize, preorderMode);
          const clampedQty = Math.max(1, Math.min(item.quantity, Math.max(1, availableStock)));
          return {
            ...item,
            selectedColor: newColor,
            selectedSize: newSize,
            quantity: clampedQty,
          };
        }
        return item;
      })
    );
    addToast('Параметры товара в корзине обновлены', 'info');
  };

  // Move item from cart to favorites
  const handleMoveToFavoritesFromCart = (item: CartItem) => {
    if (!favorites.includes(item.product.id)) {
      setFavorites((prev) => [...prev, item.product.id]);
    }
    handleRemoveCartItem(item.id);
    addToast(`Перемещено в избранное: ${item.product.title}`, 'success');
  };

  // Clear Cart
  const handleClearCart = () => {
    setCartItems([]);
    addToast('Корзина очищена', 'info');
  };

  // Apply Promo with full rule validation
  const handleApplyPromo = (code: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    const foundPromo = promos.find((p) => p.code.toUpperCase() === cleanCode);

    if (!foundPromo) {
      addToast('Промокод не найден', 'error');
      return false;
    }

    const promoError = validatePromo(foundPromo, cartItems.map(toPricingLine));
    if (promoError) {
      addToast(promoError, 'error');
      return false;
    }

    // usedCount grows only when an order with the promo is placed (not on applying it)
    const isFixed = promoDiscountKind(foundPromo) === 'fixed';
    const discValue = foundPromo.discountValue !== undefined ? foundPromo.discountValue : foundPromo.discountPercent;

    setAppliedPromo({
      code: foundPromo.code,
      discountPercent: foundPromo.discountPercent,
      discountType: isFixed ? 'fixed' : 'percent',
      discountValue: discValue,
      minOrderAmount: foundPromo.minOrderAmount,
      isReferral: foundPromo.isReferral,
      partnerName: foundPromo.partnerName,
      partnerCommissionPercent: foundPromo.partnerCommissionPercent,
      applicableCategories: foundPromo.applicableCategories,
      applicableProductIds: foundPromo.applicableProductIds,
    });

    const discountText = promoDiscountText({
      discountType: isFixed ? 'fixed' : 'percent',
      discountValue: discValue,
      discountPercent: foundPromo.discountPercent,
    });

    addToast(`Промокод ${foundPromo.code} применен: скидка ${discountText}`, 'success');
    return true;
  };

  // An applied promo is checked again whenever the cart or the code changes: a shrunk cart, an expired or
  // switched-off code must not reach the order with the discount
  React.useEffect(() => {
    if (!appliedPromo) return;
    if (cartItems.length === 0) {
      setAppliedPromo(null);
      return;
    }
    const current = promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase());
    const problem = current ? validatePromo(current, cartItems.map(toPricingLine)) : 'Промокод больше не действует';
    if (problem) {
      setAppliedPromo(null);
      addToast(`Промокод ${appliedPromo.code} снят. ${problem}`, 'info');
    }
    // addToast is recreated on every render; the check depends only on the cart and the codes
  }, [cartItems, promos, appliedPromo]);

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    addToast('Промокод отменен', 'info');
  };

  // Support chat: the customer writes to the store's staff (no automatic replies)
  const deliverChatMessage = async (msg: ChatMessage, targetDb: ChatIdentity['db']) => {
    setPendingChatIds((prev) => new Set(prev).add(msg.id));
    setFailedChatMessages((prev) => prev.filter((m) => m.id !== msg.id));
    try {
      await saveChatMessageToFirestore(msg, targetDb);
    } catch (err) {
      console.error('Chat message was not sent:', err);
      setFailedChatMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg]);
      addToast('Сообщение не отправлено. Проверьте соединение и нажмите «повторить»', 'error');
    } finally {
      setPendingChatIds((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
    }
  };

  /** false: the message could not be sent at all (the text stays in the field) */
  const handleSendMessageFromUser = async (text: string, imageUrl?: string): Promise<boolean> => {
    // Each customer has a private thread; guests get an anonymous chat identity on first message
    let identity = chatIdentity;
    if (!identity) {
      try {
        identity = await createGuestChatIdentity();
        setChatIdentity(identity);
      } catch (err) {
        console.error('Guest chat sign-in failed:', err);
        const code = (err as { code?: string })?.code;
        // Anonymous sign-in disabled in Firebase Console → guests must use Google sign-in
        const anonymousDisabled = code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation';
        addToast(
          anonymousDisabled
            ? 'Чтобы написать в поддержку, войдите через Google в разделе «Профиль»'
            : 'Не удалось подключиться к чату. Проверьте соединение и попробуйте еще раз.',
          'error'
        );
        return false;
      }
    }

    const userMsg: ChatMessage = {
      id: newChatMessageId(),
      sender: 'user',
      text,
      imageUrl,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      threadId: identity.uid,
      threadName: userProfile.name || userProfile.email || currentUser?.email || 'Гость',
    };
    setChatMessages((prev) => [...prev, userMsg]);
    void deliverChatMessage(userMsg, identity.db);
    return true;
  };

  const handleRetryChatMessage = (messageId: string) => {
    const msg = failedChatMessages.find((m) => m.id === messageId);
    const identity = chatIdentity;
    if (!msg || !identity) return;
    void deliverChatMessage(msg, identity.db);
  };

  /**
   * Edit / «удалить у себя» / «удалить у всех». The customer uses their chat identity's database
   * (rules allow own messages within 15 minutes), staff the main one. Local state first, rolled back on error.
   */
  const handleChangeChatMessage = async (change: ChatMessageChange, asStaff = false): Promise<boolean> => {
    if (!asStaff && failedChatMessages.some((m) => m.id === change.id)) {
      // never reached the server: only the local copy exists
      if (change.type !== 'edit') {
        setFailedChatMessages((prev) => prev.filter((m) => m.id !== change.id));
        setChatMessages((prev) => prev.filter((m) => m.id !== change.id));
      }
      return true;
    }
    const targetDb = asStaff ? undefined : chatIdentity?.db;
    if (!asStaff && !targetDb) return false;
    const before = chatMessages;
    setChatMessages((prev) => applyChatMessageChangeLocally(prev, change));
    try {
      await applyChatMessageChange(change, targetDb);
      return true;
    } catch (err) {
      console.error('Chat message change failed:', err);
      setChatMessages(before);
      addToast(
        asStaff
          ? 'Не удалось изменить сообщение. Проверьте соединение'
          : 'Изменить или удалить сообщение можно в течение 15 минут после отправки',
        'error'
      );
      return false;
    }
  };

  const handleSendMessageAsAdmin = (
    text: string,
    imageUrl?: string,
    promoCard?: ChatMessage['promoCard'],
    tag?: ChatMessage['tag'],
    isInternalNote?: boolean,
    productCard?: ChatMessage['productCard'],
    orderStatusUpdate?: ChatMessage['orderStatusUpdate'],
    thread?: Pick<ChatMessage, 'threadId' | 'threadName'>
  ) => {
    const adminMsg: ChatMessage = {
      id: newChatMessageId(),
      ...thread,
      sender: 'admin',
      text,
      imageUrl,
      promoCard,
      tag,
      isInternalNote,
      productCard,
      orderStatusUpdate,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, adminMsg]);
    void persist('сообщение в чате', saveChatMessageToFirestore(adminMsg));

    // If a promo code was generated from the chat, automatically register it into the promos pool so the client can use it!
    if (promoCard) {
      const exists = promos.some((p) => p.code.toUpperCase() === promoCard.code.toUpperCase());
      if (!exists) {
        const newPromo: PromoCode = {
          id: `promo-care-${Date.now()}`,
          code: promoCard.code.toUpperCase(),
          title: `Компенсация (${promoCard.code.toUpperCase()})`,
          discountPercent: promoCard.discountType === 'percent' ? promoCard.discountValue : 0,
          discountValue: promoCard.discountValue,
          discountType: promoCard.discountType,
          description: promoCard.description || 'Персональный промокод от службы заботы',
          minOrderAmount: 0,
          active: true,
          // no invented deadline: without a date the code works until it is used
          ...(promoCard.expiryDate ? { expiresAt: promoCard.expiryDate } : {}),
          usedCount: 0,
          usageLimit: 1,
        };
        const updated = [newPromo, ...promos];
        setPromos(updated);
        void persist('промокод из чата', syncAllPromosToFirestore([newPromo]));
      }
    }
  };

  /** threadId: undefined — whole chat, null — legacy messages without a thread, string — one customer */
  const handleClearChat = async (threadId?: string | null) => {
    // Cleared on screen only after the database deleted the messages: otherwise they would come back
    if (!(await persist('очистка чата', clearChatMessagesInFirestore(threadId)))) return;
    setChatMessages((prev) =>
      threadId === undefined ? [] : prev.filter((m) => (m.threadId ?? null) !== threadId)
    );
    addToast(threadId === undefined ? 'История чата поддержки очищена' : 'Диалог очищен', 'info');
  };

  // Admins load every thread; in the storefront chat they only see their own
  const ownThread = isAdmin ? chatMessages.filter((m) => m.threadId === currentUser?.uid) : chatMessages;
  // Failed messages are not in Firestore: keep them on screen (in send order) until they are retried
  const customerChatMessages = [
    ...ownThread.filter((m) => !failedChatMessages.some((f) => f.id === m.id)),
    ...failedChatMessages,
  ].sort((a, b) => chatMessageOrder(a) - chatMessageOrder(b));

  const hasActivePromos = promos.some((p) => isPromoListed(p));
  const catalogStatus: CatalogStatus = productsLoaded ? 'ready' : productsError ? 'error' : 'loading';
  // Once the first screen has its catalog, the other customer screens are fetched in idle time
  const prefetchedScreens = React.useRef(false);
  React.useEffect(() => {
    if (!productsLoaded || prefetchedScreens.current) return;
    prefetchedScreens.current = true;
    prefetchCustomerScreensWhenIdle();
  }, [productsLoaded]);

  // Complete Order
  type CompleteOrderData = {
    items: CartItem[];
    contact?: { name: string; phone: string; email?: string } & PersonName;
    address?: string;
    addressParts?: AddressParts;
    deliveryMethod?: string;
    deliveryMethodId?: string; // absent for the one-click quick order
    totalPrice?: number;
    deliveryFee?: number;
    discountAmount?: number;
    paymentMethod?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
  };

  const resolveOrderDetails = (orderData: CompleteOrderData) => {
    // Checkout sends Фамилия / Имя / Отчество; the order keeps them and the full name in customerName
    const nameParts: PersonName | undefined =
      orderData.contact && hasNameParts(orderData.contact) ? namePartsOf(orderData.contact) : undefined;
    const customerName =
      (nameParts && fullName(nameParts)) ||
      orderData.contact?.name ||
      orderData.customerName ||
      userProfile.name ||
      'Покупатель';
    const customerPhone =
      orderData.contact?.phone ||
      orderData.customerPhone ||
      userProfile.phone ||
      '';
    const customerEmail =
      orderData.contact?.email ||
      orderData.customerEmail ||
      userProfile.email ||
      '';
    const deliveryAddress =
      orderData.address ||
      (userProfile.savedAddresses?.[0] ? formatAddress(userProfile.savedAddresses[0]) : '') ||
      (userProfile.address ? formatAddress(userProfile.address) : '') ||
      'Уточнит менеджер';
    // Quick (1-click) orders have no delivery or payment choice: the manager agrees them with the buyer
    const deliveryMethod = orderData.deliveryMethod || 'Уточнит менеджер';
    const paymentMethod = orderData.paymentMethod || 'Уточнит менеджер';
    const addressParts = orderData.addressParts ? cleanAddressParts(orderData.addressParts) : undefined;
    return { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod, nameParts, addressParts };
  };

  const finishOrder = (
    order: Pick<Order, 'id' | 'totalPrice' | 'deliveryMethod' | 'deliveryAddress'> & { paymentMethod?: string },
    orderData: CompleteOrderData
  ) => {
    // A 1-click order from the product page is not the cart: only the ordered lines leave it
    const orderedLineIds = new Set(orderData.items.map((item) => item.id));
    setCartItems((prev) => prev.filter((item) => !orderedLineIds.has(item.id)));
    // the promo is applied only to a full checkout (1-click orders go without it)
    if (orderData.deliveryMethodId) setAppliedPromo(null);
    setLatestOrder({
      id: order.id,
      totalPrice: order.totalPrice,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
    });
    addToast(`Заказ № ${order.id} успешно оформлен!`, 'success');
    setActiveTab('order-success');
  };

  // Server-validated checkout: the placeOrder Cloud Function recalculates prices,
  // delivery and promo discount and deducts stock in a transaction.
  const completeOrderOnServer = async (orderData: CompleteOrderData): Promise<boolean> => {
    const details = resolveOrderDetails(orderData);
    try {
      const { order } = await placeOrderOnServer({
        items: orderData.items.map((item) => ({
          productId: item.product.id,
          color: extractColorName(item.selectedColor),
          size: extractSizeName(item.selectedSize),
          quantity: item.quantity,
        })),
        deliveryMethodId: orderData.deliveryMethodId || QUICK_ORDER_DELIVERY_ID,
        deliveryAddress: details.deliveryAddress,
        paymentMethod: details.paymentMethod,
        promoCode: orderData.deliveryMethodId ? appliedPromo?.code : undefined,
        contact: {
          name: details.customerName,
          phone: details.customerPhone,
          email: details.customerEmail || undefined,
          ...details.nameParts,
        },
        addressParts: details.addressParts,
      });
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      if (!currentUser) {
        saveGuestOrder(order);
      }
      finishOrder(order, orderData);
      return true;
    } catch (err) {
      console.error('placeOrder failed:', err);
      // HttpsError messages from placeOrder are user-facing; transport errors are just "internal"
      const message =
        err instanceof Error && err.message && err.message !== 'internal'
          ? err.message
          : 'Не удалось оформить заказ. Проверьте соединение и попробуйте еще раз.';
      addToast(message, 'error');
      return false;
    }
  };

  /** What the cart has beyond the stock now: the checkout lists it and does not send the order */
  const checkoutStockProblems = React.useMemo(
    () => (activeTab === 'checkout' ? orderStockProblems(cartItems, products, preorderMode) : []),
    [activeTab, cartItems, products, preorderMode]
  );

  const handleCompleteOrder = (orderData: CompleteOrderData): Promise<boolean> => {
    // «Технические работы» in «Витрина»: no orders (the checkout and the 1-click window say so before this)
    if (!storeAcceptsOrders(storefrontSettings)) {
      addToast(`${STORE_PAUSED_TEXT}. Напишите в чат поддержки.`, 'error');
      return Promise.resolve(false);
    }
    return serverOrdersEnabled ? completeOrderOnServer(orderData) : completeOrderLocally(orderData);
  };

  // Legacy client-side checkout, used until the Cloud Function is deployed and enabled
  const completeOrderLocally = async (orderData: CompleteOrderData): Promise<boolean> => {
    // The stock as the catalog has it now (finding 4): the checkout shows the same list next to «Подтвердить», this
    // stops a 1-click order and a catalog that changed after the page was opened
    const stockProblems = orderStockProblems(orderData.items, products, preorderMode);
    if (stockProblems.length > 0) {
      addToast(`Не хватает на складе: ${stockProblems.map(stockProblemText).join('; ')}. Измените корзину.`, 'error');
      return false;
    }
    // Every order has an owner (rules, stage 5 without Blaze): the signed-in buyer or the guest's anonymous session —
    // the same one the guest's support chat uses
    let orderOwner: { uid: string; db: ChatIdentity['db'] };
    if (currentUser) {
      orderOwner = { uid: currentUser.uid, db };
    } else {
      try {
        const identity = chatIdentity?.isGuest ? chatIdentity : await createGuestChatIdentity();
        if (identity !== chatIdentity) setChatIdentity(identity);
        orderOwner = { uid: identity.uid, db: identity.db };
      } catch (err) {
        console.error('Guest sign-in for the order failed:', err);
        addToast('Не удалось оформить заказ без входа. Войдите через Google в «Профиле» или проверьте соединение.', 'error');
        return false;
      }
    }

    // Orders are create-only for customers, so IDs must not collide with existing ones
    const newOrderId = `WS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const placedAt = new Date();

    const { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod, nameParts, addressParts } =
      resolveOrderDetails(orderData);
    const totalPrice = orderData.totalPrice ?? 0;
    // A 1-click order has no promo, as on the server
    const orderPromo = orderData.deliveryMethodId && appliedPromo?.code && orderData.discountAmount !== 0
      ? promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase())
      : undefined;

    // Sold-out variants ordered in preorder mode are marked and not taken from stock; the order keeps a light
    // copy of the product (toOrderLineProduct) without photo links: the rules refuse links in a browser's order
    // (an outside picture would open at the staff's screen), and order screens take photos from the catalog
    const orderItems: CartItem[] = orderData.items.map((item) => ({
      ...item,
      product: { ...toOrderLineProduct(item.product), images: [] },
      ...(isPreorderVariant(item.product, item.selectedColor, item.selectedSize, preorderMode) ? { isPreorder: true } : {}),
    }));

    const orderMethod = orderData.deliveryMethodId
      ? deliveryMethods.find((m) => m.id === orderData.deliveryMethodId)
      : undefined;
    const newOrder = buildClientOrder({
      id: newOrderId,
      placedAt,
      items: orderItems,
      totalPrice,
      deliveryAddress,
      deliveryMethod,
      method: orderMethod,
      customerName,
      nameParts,
      customerPhone,
      customerEmail,
      customerUid: orderOwner.uid,
      addressParts,
      paymentMethod,
      deliveryFee: orderData.deliveryFee,
      discountAmount: orderData.discountAmount,
      promoCode: orderPromo?.code,
    });

    // The order must reach the database before it is shown as placed and stock is taken:
    // a rejected write (rules, network error) used to be reported as a successful order
    try {
      await placeClientOrder(newOrder, orderOwner.uid, orderOwner.db);
    } catch (err) {
      console.error('Order was not saved:', err);
      // the rules take one order in 30 s from a sign-in: say how long to wait instead of «check the connection»
      const wait = await orderRateWaitSeconds(orderOwner.uid, orderOwner.db);
      addToast(
        wait > 0
          ? `Заказы можно оформлять не чаще раза в 30 секунд. Попробуйте снова через ${wait} ${pluralRu(wait, ['секунду', 'секунды', 'секунд'])}.`
          : 'Не удалось оформить заказ. Проверьте соединение и попробуйте еще раз.',
        'error'
      );
      return false;
    }

    // The new stock shows at once; the database is changed by the line transactions below
    const updatedProducts = withOrderDeducted(products, orderItems);
    setProducts(updatedProducts);

    // If active product was modified, sync selectedProduct
    if (selectedProduct) {
      const updatedSel = updatedProducts.find((p) => p.id === selectedProduct.id);
      if (updatedSel) {
        setSelectedProduct(updatedSel);
      }
    }

    // One more use of the promo by this order (a 1-click order has no promo, as on the server)
    if (orderPromo) {
      // The order is placed either way; a refused counter write is logged with the order number
      recordPromoUsageInFirestore(orderPromo, newOrderId, orderOwner.db).catch((err) =>
        console.error(`Promo usage for ${newOrderId} was not recorded:`, err)
      );
    }

    // the orders subscription may already hold it (the local write is seen at once): one card, not two
    setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    if (!currentUser) {
      saveGuestOrder(newOrder);
    }
    
    // Stock line by line, each in one transaction with its journal entry («Склад и SKU» → «Журнал движений»):
    // the rules let a customer take only what the saved order ordered, once per line. The order is already saved:
    // a refused write must not turn it into a failure for the customer
    const takenAt = new Date();
    void (async () => {
      for (const [lineIndex, line] of orderItems.entries()) {
        try {
          await deductOrderLineStock(newOrderId, line, lineIndex, takenAt);
        } catch (err) {
          console.error(`Stock for ${newOrderId}, line ${lineIndex} was not written off:`, err);
        }
      }
    })();

    finishOrder({ id: newOrderId, totalPrice, deliveryMethod, deliveryAddress, paymentMethod }, orderData);
    return true;
  };

  // Product Selection handler
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, 8);
    });
    setActiveTab('product-detail');
  };


  const handleClearRecentlyViewed = () => {
    setRecentlyViewed([]);
    addToast('История просмотров очищена', 'info');
  };

  const handleRemoveFromRecentlyViewed = (productId: string) => {
    setRecentlyViewed((prev) => prev.filter((p) => p.id !== productId));
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const handleSaveMeasurements = (measurements: BodyMeasurements) => {
    const updated: UserProfile = {
      ...userProfile,
      bodyMeasurements: measurements,
    };
    handleUpdateProfile(updated);
    addToast(
      measurements.preferredSize
        ? `Параметры и размер ${measurements.preferredSize} сохранены в профиле`
        : 'Параметры фигуры сохранены в профиле',
      'success'
    );
  };

  return (
    <DeviceFrameWrapper>
      <div className="relative min-h-full flex flex-col justify-between">
        <ToastContainer toasts={toasts} onDismiss={removeToast} />

        {/* «+» on a card with several sizes or colours: the customer picks the variant */}
        <VariantPickerSheet
          product={variantPickerProduct}
          preorderMode={preorderMode}
          onClose={() => setVariantPickerProduct(null)}
          onAdd={(product, color, size) => handleAddToCartWithOptions(product, color, size, 1)}
          onOpenProduct={handleSelectProduct}
        />

        <SidebarDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          setActiveTab={setActiveTab}
          onOpenMySizes={() => setIsMySizesModalOpen(true)}
          onOpenFilters={() => setIsAdvancedFilterOpen(true)}
          onOpenSupportChat={openSupportChat}
          onOpenBrandDetails={() => setIsBrandModalOpen(true)}
          storefrontSettings={customerStorefront}
        />

        <CatalogAdvancedFilter
          products={products}
          filterState={catalogFilterState}
          onChangeFilterState={setCatalogFilterState}
          onResetFilters={handleResetCatalogFilters}
          filteredCount={filteredProductsCount}
          isOpenModal={isAdvancedFilterOpen}
          onCloseModal={() => setIsAdvancedFilterOpen(false)}
          onApplyModal={() => {
            setIsAdvancedFilterOpen(false);
            setActiveTab('catalog');
          }}
          isInlineExpanded={false}
          onToggleInline={() => {}}
        />

        <LazyMount when={isBrandModalOpen}>
        <BrandRequisitesModal
          isOpen={isBrandModalOpen}
          onClose={() => setIsBrandModalOpen(false)}
          storefrontSettings={customerStorefront}
          onOpenSupportChat={openSupportChat}
        />
        </LazyMount>

        <LazyMount when={isSupportChatOpen}>
        <SupportChatModal
          isOpen={isSupportChatOpen}
          draftText={chatDraft}
          imageDb={chatIdentity?.db}
          storePhone={getStoreContacts(storefrontSettings).phone}
          storeSchedule={storefrontSettings.schedule}
          onClose={() => {
            setIsSupportChatOpen(false);
            setChatDraft('');
          }}
          messages={customerChatMessages}
          onSendMessage={handleSendMessageFromUser}
          pendingIds={pendingChatIds}
          failedIds={new Set(failedChatMessages.map((m) => m.id))}
          onRetry={handleRetryChatMessage}
          onChangeMessage={(change) => handleChangeChatMessage(change)}
          supportStatus={supportStatus}
          statusSeenKey={chatIdentity ? chatIdentity.uid : null}
          onApplyPromo={handleApplyPromo}
          onShowToast={addToast}
          onAddToCart={(productId, color, size) => {
            const prod = products.find((p) => p.id === productId);
            if (!prod) return;
            // The staff member named the variant: add it; otherwise the customer picks one (no default size)
            if (color && size) handleAddToCartWithOptions(prod, color, size, 1);
            else handleAddToCartQuick(prod);
          }}
          onSelectProductById={(productId) => {
            const prod = products.find((p) => p.id === productId);
            if (prod) {
              handleSelectProduct(prod);
            }
          }}
        />
        </LazyMount>

        <LazyMount when={isMySizesModalOpen}>
        <SizeCalculatorModal
          isOpen={isMySizesModalOpen}
          onClose={() => setIsMySizesModalOpen(false)}
          availableSizes={['S', 'M', 'L', 'XL', 'XXL']}
          onSelectSize={() => {}}
          purpose="profile"
          productFit="regular"
          userProfile={userProfile}
          onSaveMeasurements={handleSaveMeasurements}
        />
        </LazyMount>

        <LazyMount when={isPromoModalOpen}>
        <PromoModal
          isOpen={isPromoModalOpen}
          onClose={() => setIsPromoModalOpen(false)}
          appliedPromo={appliedPromo}
          onApplyPromo={handleApplyPromo}
          onRemovePromo={handleRemovePromo}
          cartSubtotal={cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0)}
          cartItems={cartItems}
          promos={promos}
        />
        </LazyMount>

        <PreviewBanner />

        {/* Promo message from Admin → «Витрина»: shown when switched on and filled in */}
        {storefrontSettings?.isStoreBannerVisible && publicSetting(storefrontSettings.storeBannerText) && (
          <aside aria-label="Объявление магазина" className="px-4 pt-2 lg:px-6">
            <p className="max-w-lg lg:max-w-none mx-auto neu-flat-sm rounded-2xl px-3 py-2 flex items-center justify-center gap-2 text-center text-xs font-bold text-[#2D3A4E]">
              {storefrontSettings.bannerBadgeText?.trim() && (
                <span className="px-1.5 py-0.5 rounded-md bg-accent text-white text-[11px] font-extrabold uppercase shrink-0">
                  {storefrontSettings.bannerBadgeText.trim()}
                </span>
              )}
              <span>{withStoreName(publicSetting(storefrontSettings.storeBannerText), getStoreName(storefrontSettings))}</span>
            </p>
          </aside>
        )}

        {/* Computer (lg+): top bar with search and sections instead of the bottom menu */}
        <DesktopHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          storeName={storeName}
          cartCount={totalCartCount}
          favoritesCount={favorites.length}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          searchQuery={catalogSearch}
          onSearchChange={setCatalogSearch}
          products={products}
          categories={getCategories(storefrontSettings)}
          onSelectProduct={handleSelectProduct}
          onSelectCategory={setSelectedCategory}
        />

        {/* Top Header Bar (only shown on non-home screens) */}
        {activeTab !== 'home' && (
          <Header
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onBack={handleHeaderBack}
            cartCount={totalCartCount}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            selectedProductTitle={selectedProduct?.title}
            storeName={storeName}
          />
        )}

        {/* View Router Body */}
        <main className="px-4 lg:px-6 flex-1 pt-1 lg:pt-5 overflow-x-clip">
          {activeTab !== 'home' && (
            <DesktopTitleRow
              title={screenTitle(activeTab, totalCartCount, storeName, selectedProduct?.title)}
              onBack={handleHeaderBack}
            />
          )}
          <AnimatePresence
            mode="wait"
            initial={false}
            onExitComplete={() => {
              // New screen from the top; «Назад» — where the customer left it
              const y = pendingScroll.current;
              pendingScroll.current = null;
              if (y !== null) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
            }}
          >
            <motion.div
              key={activeTab === 'product-detail' && selectedProduct ? `tab-product-${selectedProduct.id}` : `tab-${activeTab}`}
              initial={{ opacity: 0, y: 8, scale: 0.992 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.992 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="w-full h-full"
            >
              <Suspense fallback={<ScreenLoading />}>
              {activeTab === 'home' && (
            <HomeScreen
              products={products}
              catalogStatus={catalogStatus}
              favorites={favorites}
              recentlyViewed={recentlyViewed}
              onClearRecentlyViewed={handleClearRecentlyViewed}
              onRemoveFromRecentlyViewed={handleRemoveFromRecentlyViewed}
              onSelectProduct={handleSelectProduct}
              onToggleFavorite={handleToggleFavorite}
              onAddToCart={handleAddToCartQuick}
              setActiveTab={setActiveTab}
              onSelectCategory={setSelectedCategory}
              onOpenDrawer={() => setIsDrawerOpen(true)}
              searchQuery={catalogSearch}
              onSearchChange={setCatalogSearch}
              bannerSlides={customerBannerSlides}
              storefrontSettings={customerStorefront}
              onApplyPromo={handleApplyPromo}
              onShowToast={addToast}
              userProfile={userProfile}
              onOpenFilters={() => setIsAdvancedFilterOpen(true)}
              onSaveMeasurements={handleSaveMeasurements}
              onAddToCartWithOptions={handleAddToCartWithOptions}
              preorderMode={preorderMode}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogScreen
              categories={getCategories(storefrontSettings)}
              products={products}
              catalogStatus={catalogStatus}
              favorites={favorites}
              recentlyViewed={recentlyViewed}
              onClearRecentlyViewed={handleClearRecentlyViewed}
              onRemoveFromRecentlyViewed={handleRemoveFromRecentlyViewed}
              userProfile={userProfile}
              onSaveMeasurements={handleSaveMeasurements}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onSelectProduct={handleSelectProduct}
              onToggleFavorite={handleToggleFavorite}
              onAddToCart={handleAddToCartQuick}
              onAddToCartWithOptions={handleAddToCartWithOptions}
              preorderMode={preorderMode}
              filterState={catalogFilterState}
              onChangeFilterState={setCatalogFilterState}
              onResetFilters={handleResetCatalogFilters}
              onOpenFilters={() => setIsAdvancedFilterOpen(true)}
              searchQuery={catalogSearch}
              onSearchChange={setCatalogSearch}
            />
          )}

          {activeTab === 'product-detail' && selectedProduct && (
            <ProductDetailScreen
              preorderMode={preorderMode}
              ordersPaused={!storeAcceptsOrders(storefrontSettings)}
              product={products.find((p) => p.id === selectedProduct.id) ?? selectedProduct}
              returnPeriodDays={storefrontSettings.returnPeriodDays}
              freeDeliveryThreshold={storefrontSettings.freeDeliveryThreshold}
              isFavorite={favorites.includes(selectedProduct.id)}
              recentlyViewed={recentlyViewed.filter((p) => p.id !== selectedProduct.id)}
              onClearRecentlyViewed={handleClearRecentlyViewed}
              onRemoveFromRecentlyViewed={handleRemoveFromRecentlyViewed}
              userProfile={userProfile}
              onSaveMeasurements={handleSaveMeasurements}
              onToggleFavorite={handleToggleFavorite}
              onAddToCartWithOptions={handleAddToCartWithOptions}
              onSelectProduct={handleSelectProduct}
              onCompleteOrder={handleCompleteOrder}
              onShowToast={addToast}
            />
          )}

          {activeTab === 'cart' && (
            <CartScreen
              hasActivePromos={hasActivePromos}
              preorderMode={preorderMode}
              ordersPaused={!storeAcceptsOrders(storefrontSettings)}
              cartItems={cartItems}
              favorites={favorites}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveCartItem}
              onUpdateVariant={handleUpdateCartItemVariant}
              onMoveToFavorites={handleMoveToFavoritesFromCart}
              onToggleFavorite={handleToggleFavorite}
              onClearCart={handleClearCart}
              setActiveTab={setActiveTab}
              onShowToast={addToast}
              appliedPromo={appliedPromo}
              onApplyPromo={handleApplyPromo}
              onOpenPromoModal={() => setIsPromoModalOpen(true)}
              onRemovePromo={handleRemovePromo}
              onCompleteOrder={handleCompleteOrder}
              storefrontSettings={customerStorefront}
              deliveryMethods={customerDeliveryMethods}
              checkoutBlocker={
                !deliveryMethods.some((m) => m.isActive !== false)
                  ? 'Способы доставки'
                  : !(storefrontSettings.paymentMethods ?? []).some((m) => m.isActive !== false)
                  ? 'Способы оплаты'
                  : null
              }
            />
          )}

          {activeTab === 'checkout' && (
            <CheckoutScreen
              hasActivePromos={hasActivePromos}
              cartItems={cartItems}
              stockProblems={checkoutStockProblems}
              userProfile={userProfile}
              onCompleteOrder={handleCompleteOrder}
              setActiveTab={setActiveTab}
              appliedPromo={appliedPromo}
              onOpenPromoModal={() => setIsPromoModalOpen(true)}
              storefrontSettings={customerStorefront}
              onShowToast={addToast}
              deliveryMethods={customerDeliveryMethods}
              pickupPoints={customerPickupPoints}
            />
          )}

          {activeTab === 'favorites' && (
            <FavoritesScreen
              products={products}
              favorites={favorites}
              onSelectProduct={handleSelectProduct}
              onToggleFavorite={handleToggleFavorite}
              onAddToCart={handleAddToCartQuick}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileScreen
              profile={userProfile}
              allUsers={allUsers}
              orders={orders}
              products={adminProducts}
              favoritesCount={favorites.length}
              onUpdateProfile={handleUpdateProfile}
              setActiveTab={setActiveTab}
              onRepeatOrder={handleRepeatOrder}
              onCancelOrder={handleCancelOwnOrder}
              onConfirmReceipt={handleConfirmReceipt}
              onSubmitPaymentReceipt={handleSubmitPaymentReceipt}
              onShowToast={addToast}
              onOpenSupportChat={openSupportChat}
              onUpdateProducts={(updatedWithCosts: Product[]) => {
                const changed = changedItems(adminProducts, updatedWithCosts);
                const kept = new Set(updatedWithCosts.map((p) => p.id));
                const costChanges: { id: string; costPrice?: number }[] = [
                  ...changed
                    .filter((p) => p.costPrice !== productCosts[p.id])
                    .map((p) => ({ id: p.id, costPrice: p.costPrice })),
                  ...Object.keys(productCosts).filter((id) => !kept.has(id)).map((id) => ({ id })),
                ];
                const saved = persist(
                  'товары',
                  deleteRemovedDocs('products', adminProducts, updatedWithCosts),
                  syncAllProductsToFirestore(changed),
                  saveProductCosts(costChanges)
                );
                setProductCosts((prev) => {
                  const next = { ...prev };
                  for (const { id, costPrice } of costChanges) {
                    if (typeof costPrice === 'number') next[id] = costPrice;
                    else delete next[id];
                  }
                  return next;
                });
                // The cost price stays in the admin panel: products in the cart and in orders go without it
                const updatedProds = updatedWithCosts.map(({ costPrice: _cost, ...p }) => p);
                setProducts(updatedProds);
                // Synchronize cart with updated products & remove deleted items
                setCartItems((prevCart) =>
                  prevCart
                    .filter((ci) => updatedProds.some((p) => p.id === ci.product.id))
                    .map((ci) => {
                      const freshProd = updatedProds.find((p) => p.id === ci.product.id);
                      return freshProd ? { ...ci, product: freshProd } : ci;
                    })
                );
                if (selectedProduct) {
                  const matched = updatedProds.find((p) => p.id === selectedProduct.id);
                  if (matched) {
                    setSelectedProduct(matched);
                  } else {
                    // the admin is in the profile here: the product page is not open
                    setSelectedProduct(null);
                  }
                }
                return saved;
              }}
              onUpdateOrders={(updatedOrders) => {
                setOrders(updatedOrders);
                return persist('заказы', syncAllOrdersToFirestore(changedItems(orders, updatedOrders)));
              }}
              promos={promos}
              onUpdatePromos={(updatedPromos) => {
                const saved = persist(
                  'промокоды',
                  deleteRemovedDocs('promos', promos, updatedPromos),
                  syncAllPromosToFirestore(changedItems(promos, updatedPromos))
                );
                setPromos(updatedPromos);
                // «Промокоды» say «создан/обновлен» and close the form only after the database answered (UX audit 03.10, finding 5)
                return saved;
              }}
              bannerSlides={bannerSlides}
              onUpdateBannerSlides={handleUpdateBannerSlides}
              chatMessages={chatMessages}
              onSendMessageAsAdmin={handleSendMessageAsAdmin}
              onClearChat={handleClearChat}
              onChangeChatMessage={(change) => handleChangeChatMessage(change, true)}
              storefrontSettings={storefrontSettings}
              onUpdateStorefrontSettings={(upd) => {
                setStorefrontSettings(upd);
                saveStorefrontSettings(upd);
                return persist('настройки витрины', saveStorefrontSettingsToFirestore(upd));
              }}
              onSaveLegalText={(id, text) => persist('документ', saveLegalText(id, text))}
              deliveryMethods={deliveryMethods}
              onUpdateDeliveryMethods={handleUpdateDeliveryMethods}
              pickupPoints={pickupPoints}
              onUpdatePickupPoints={handleUpdatePickupPoints}
            />
          )}

          {activeTab === 'order-success' && latestOrder && (
            <OrderSuccessScreen
              orderId={latestOrder.id}
              totalPrice={latestOrder.totalPrice}
              deliveryMethod={latestOrder.deliveryMethod}
              deliveryAddress={latestOrder.deliveryAddress}
              paymentMethod={latestOrder.paymentMethod}
              paymentInstructions={
                (storefrontSettings.paymentMethods ?? []).find(
                  (m) => m.title.trim() && latestOrder.paymentMethod?.startsWith(m.title.trim())
                )?.description
              }
              setActiveTab={setActiveTab}
            />
          )}

          {(activeTab === 'offer' || activeTab === 'privacy') && (
            <Suspense
              fallback={
                <p className="px-4 py-10 text-center text-xs text-[#4E5C70]" role="status">
                  Загрузка документа…
                </p>
              }
            >
              <LegalDocumentScreen docId={activeTab} settings={customerStorefront} />
            </Suspense>
          )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Floating Bottom Navigation Bar: hidden on checkout so it does not cover the form and the pay button */}
        {activeTab !== 'checkout' && (
          <BottomNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            favoritesCount={favorites.length}
            cartCount={totalCartCount}
          />
        )}
      </div>
    </DeviceFrameWrapper>
  );
}
