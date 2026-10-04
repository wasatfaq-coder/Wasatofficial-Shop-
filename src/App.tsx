import { SizeCalculatorModal } from './components/lazyWindows';
import React, { Suspense, lazy, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab, Product, CartItem, UserProfile, Order, BodyMeasurements, BannerSlide, DeliveryMethod, PickupPoint, PaymentKind } from './types';
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
import { ToastContainer } from './components/Toast';
import { DesktopHeader } from './components/DesktopHeader';
import {
  CatalogAdvancedFilter,
  FilterState,
  DEFAULT_FILTER_STATE,
  matchesCatalogFilters,
} from './components/CatalogAdvancedFilter';
import { saveStorefrontSettings, getOrderableStock } from './utils/inventory';
import { hasHeavyPhotos, removedProductPhotoIds } from './utils/productPhotos';
import { pluralRu } from './utils/pluralize';
import { ADMIN_EMAIL, useAuth } from './context/AuthContext';
import { auth } from './firebase';
import {
  cancelOrderAsCustomer,
  confirmOrderReceipt,
  submitPaymentReceipt,
  returnCancelledOrderStock,
  syncAllProductsToFirestore,
  saveProductCosts,
  moveProductCostsToPrivate,
  moveProductPhotosOut,
  deleteProductPhotos,
  deleteRemovedDocs,
  changedItems,
  syncAllOrdersToFirestore,
  syncAllPromosToFirestore,
  saveStorefrontSettingsToFirestore,
  saveLegalText,
  saveUserProfileToFirestore,
  syncAllBannersToFirestore,
  syncAllDeliveryMethodsToFirestore,
  syncAllPickupPointsToFirestore,
} from './utils/firebaseSync';
import { useCatalog } from './app/useCatalog';
import { BANNERS_STORAGE_KEY, useStorefrontData } from './app/useStorefrontData';
import { useAccountData } from './app/useAccountData';
import { useToasts } from './app/useToasts';
import { useCart } from './app/useCart';
import { useSupportChat } from './app/useSupportChat';
import { useCheckout } from './app/useCheckout';

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
import { isPromoListed } from './shared/orderPricing';
import { storeAcceptsOrders } from './shared/orderApi';
import { getStoreContacts, getStoreName, publicSetting, withStoreName, withStoreNameFields } from './utils/storeContacts';
import { getCategories } from './utils/categories';
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

// Default profile of earlier versions (the shop admin's name, email, phone and office address)
function isLegacyDemoProfile(profile: Partial<UserProfile>): boolean {
  return (
    profile.name === 'Администратор MANSTYLE' ||
    (profile.email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
    (profile.savedAddresses || []).some((a) => a.id === 'addr-1' && a.title === 'Офис MANSTYLE')
  );
}

export default function App() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  // Toasts and `persist` for writes that must not fail silently (useToasts.ts)
  const { toasts, setToasts, addToast, removeToast, persist } = useToasts();
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

  // The removed local admin password was kept here in plain text: erase it
  React.useEffect(() => {
    try {
      localStorage.removeItem('manstyle_admin_credentials');
      sessionStorage.removeItem('manstyle_admin_auth');
    } catch {}
  }, []);


  // Admin → «Витрина» → «Предзаказ»: sold-out variants can still be ordered
  const preorderMode = storefrontSettings?.isPreorderMode === true;

  // A product from the address is restored once the catalog loads (see the products subscription)
  const pendingSelectedProductId = React.useRef<string | null>(initialRoute?.productId ?? null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // Filled as the visitor opens products; no made-up history
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  // Product Selection handler
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, 8);
    });
    setActiveTab('product-detail');
  };

  // Favorites, the cart and the applied promo (useCart.ts)
  const {
    favorites,
    cartItems,
    setCartItems,
    appliedPromo,
    setAppliedPromo,
    variantPickerProduct,
    setVariantPickerProduct,
    totalCartCount,
    handleToggleFavorite,
    handleAddToCartQuick,
    handleAddToCartWithOptions,
    handleUpdateQuantity,
    handleRemoveCartItem,
    handleUpdateCartItemVariant,
    handleMoveToFavoritesFromCart,
    handleClearCart,
    handleApplyPromo,
    handleRemovePromo,
  } = useCart({ promos, preorderMode, addToast, setActiveTab, onOpenProduct: handleSelectProduct });
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

  // Signed out: the profile of that account leaves this browser (only locally — nothing is written); the chat
  // clears itself (useSupportChat.ts)
  const signedInUidRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (authLoading) return;
    const uid = currentUser?.uid ?? null;
    if (signedInUidRef.current && !uid) {
      setUserProfile(GUEST_USER_PROFILE);
      try {
        localStorage.removeItem('manstyle_user_profile');
      } catch {}
    }
    signedInUidRef.current = uid;
  }, [authLoading, currentUser]);

  // The support chat (useSupportChat.ts)
  const {
    chatMessages,
    setChatMessages,
    chatIdentity,
    setChatIdentity,
    supportStatus,
    pendingChatIds,
    failedChatMessages,
    customerChatMessages,
    handleSendMessageFromUser,
    handleRetryChatMessage,
    handleChangeChatMessage,
    handleSendMessageAsAdmin,
    handleClearChat,
  } = useSupportChat({ authLoading, isAdmin, currentUser, userProfile, promos, setPromos, addToast, persist });

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


  // Placing an order and the confirmation screen (useCheckout.ts)
  const { latestOrder, checkoutStockProblems, handleCompleteOrder } = useCheckout({
    activeTab,
    setActiveTab,
    currentUser,
    userProfile,
    products,
    setProducts,
    selectedProduct,
    setSelectedProduct,
    cartItems,
    setCartItems,
    appliedPromo,
    setAppliedPromo,
    promos,
    preorderMode,
    deliveryMethods,
    storefrontSettings,
    serverOrdersEnabled,
    chatIdentity,
    setChatIdentity,
    setOrders,
    addToast,
  });

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

  const hasActivePromos = promos.some((p) => isPromoListed(p));
  const catalogStatus: CatalogStatus = productsLoaded ? 'ready' : productsError ? 'error' : 'loading';
  // Once the first screen has its catalog, the other customer screens are fetched in idle time
  const prefetchedScreens = React.useRef(false);
  React.useEffect(() => {
    if (!productsLoaded || prefetchedScreens.current) return;
    prefetchedScreens.current = true;
    prefetchCustomerScreensWhenIdle();
  }, [productsLoaded]);

  const handleClearRecentlyViewed = () => {
    setRecentlyViewed([]);
    addToast('История просмотров очищена', 'info');
  };

  const handleRemoveFromRecentlyViewed = (productId: string) => {
    setRecentlyViewed((prev) => prev.filter((p) => p.id !== productId));
  };

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
                // a removed product's photos go after it: a product never points at a missing photo
                const orphanPhotos = removedProductPhotoIds(adminProducts, updatedWithCosts);
                if (orphanPhotos.length > 0) {
                  void saved.then((ok) => ok && deleteProductPhotos(orphanPhotos).catch((err) => console.error('Photos of removed products stayed:', err)));
                }
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
