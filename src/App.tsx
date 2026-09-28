import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab, Product, CartItem, UserProfile, Order, BodyMeasurements, PromoCode, BannerSlide, ChatMessage, SupportStatus, AppliedPromoInfo, StorefrontSettings, DeliveryMethod, PickupPoint, ReviewVote, StoredReview } from './types';
import { GUEST_USER_PROFILE } from './data/products';
import { loadLocalDeliveryMethods, saveLocalDeliveryMethods, loadLocalPickupPoints, saveLocalPickupPoints } from './data/deliveryData';
import { playNotificationChime, sendBrowserNotification, getOrderStatusNotification } from './utils/pushNotifications';
import { DeviceFrameWrapper } from './components/DeviceFrameWrapper';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SidebarDrawer } from './components/SidebarDrawer';
import { ToastContainer, ToastMessage } from './components/Toast';
import { PromoModal } from './components/PromoModal';
import { SupportChatModal } from './components/SupportChatModal';
import { SizeCalculatorModal } from './components/SizeCalculatorModal';
import { BrandRequisitesModal } from './components/BrandRequisitesModal';
import {
  CatalogAdvancedFilter,
  FilterState,
  DEFAULT_FILTER_STATE,
  matchesCatalogFilters,
} from './components/CatalogAdvancedFilter';
import {
  deductStockWithLogs,
  loadStorefrontSettings,
  saveStorefrontSettings,
  getOrderableStock,
  isPreorderVariant,
} from './utils/inventory';
import { getDefaultHistorySteps, getSynchronizedDeliveryStages } from './utils/deliveryStages';
import { formatAddress } from './utils/addressFormat';
import { ADMIN_EMAIL, useAuth } from './context/AuthContext';
import {
  ChatIdentity,
  createGuestChatIdentity,
  db,
  placeOrderOnServer,
  restoreGuestChatIdentity,
} from './firebase';
import {
  subscribeToProducts,
  subscribeToOrders,
  subscribeToPromos,
  subscribeToStorefrontSettings,
  subscribeToChatMessages,
  subscribeToUsers,
  subscribeToOwnUserProfile,
  saveOrderToFirestore,
  saveModifiedProductsToFirestore,
  syncAllProductsToFirestore,
  deleteRemovedDocs,
  changedItems,
  recordPromoUsageInFirestore,
  syncAllOrdersToFirestore,
  syncAllPromosToFirestore,
  saveStorefrontSettingsToFirestore,
  saveChatMessageToFirestore,
  clearChatMessagesInFirestore,
  saveUserProfileToFirestore,
  subscribeToBanners,
  syncAllBannersToFirestore,
  subscribeToDeliveryMethods,
  syncAllDeliveryMethodsToFirestore,
  subscribeToPickupPoints,
  subscribeToServerConfig,
  syncAllPickupPointsToFirestore,
  subscribeToReviews,
  subscribeToReviewVotes,
  chatMessageOrder,
  applyChatMessageChange,
  applyChatMessageChangeLocally,
  ChatMessageChange,
  subscribeToSupportStatus,
} from './utils/firebaseSync';
import { mergeProductReviews } from './utils/reviews';

import { HomeScreen } from './views/HomeScreen';
import { CatalogScreen } from './views/CatalogScreen';
import { ProductDetailScreen } from './views/ProductDetailScreen';
import { CartScreen } from './views/CartScreen';
import { CheckoutScreen } from './views/CheckoutScreen';
import { ProfileScreen } from './views/ProfileScreen';
import { FavoritesScreen } from './views/FavoritesScreen';
import { OrderSuccessScreen } from './views/OrderSuccessScreen';
import { validatePromo, toPricingLine, QUICK_ORDER_DELIVERY_ID } from './shared/orderPricing';
import { formatOrderDate } from './shared/orderDate';
import { extractColorName, extractSizeName } from './utils/inventory';
import { getStoreContacts, getStoreName, publicSetting, withStoreName, withStoreNameFields } from './utils/storeContacts';
import { getCategories } from './utils/categories';
import { promoDiscountText } from './utils/promoLabel';
import { hasOrderableVariant, needsVariantChoice } from './utils/variantSelection';
import { VariantPickerSheet } from './components/VariantPickerSheet';
import { parseRouteHash, readHistoryState, routeHash, type HistoryEntryState } from './utils/navigation';

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

const GUEST_ORDERS_STORAGE_KEY = 'manstyle_guest_orders';
// v2: the chat is per customer now; don't show the old shared-chat cache
const CHAT_CACHE_STORAGE_KEY = 'manstyle_chat_messages_v2';

// Guests cannot read orders back from Firestore, so their history lives in this browser
function loadGuestOrders(): Order[] {
  try {
    const raw = localStorage.getItem(GUEST_ORDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestOrder(order: Order) {
  try {
    localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify([order, ...loadGuestOrders()]));
  } catch {}
}

export default function App() {
  // The screen comes from the address (#/catalog, #/product/{id}): reload, a shared link and «Назад» work
  const [initialRoute] = useState(() => parseRouteHash(window.location.hash));
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
  /** Every screen change goes through here: remembers the scroll of the screen being left */
  const setActiveTab = React.useCallback((tab: ActiveTab) => {
    leavingScroll.current = window.scrollY;
    setActiveTabState(tab);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  // Catalog, promos and banners come only from Firestore (Admin panel); no demo data meanwhile
  const [catalogProducts, setProducts] = useState<Product[]>([]);
  // Reviews live in their own collections and are merged into the products for display
  const [storedReviews, setStoredReviews] = useState<StoredReview[]>([]);
  const [reviewVotes, setReviewVotes] = useState<ReviewVote[]>([]);
  const products = React.useMemo(
    () => mergeProductReviews(catalogProducts, storedReviews, reviewVotes),
    [catalogProducts, storedReviews, reviewVotes]
  );
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

  // Dynamic Marketing & Support States
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [bannerSlides, setBannerSlides] = useState<BannerSlide[]>(() => {
    try {
      const saved = localStorage.getItem('manstyle_banners');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const handleUpdateBannerSlides = (newBanners: BannerSlide[]) => {
    const removed = deleteRemovedDocs('banners', bannerSlides, newBanners);
    setBannerSlides(newBanners);
    try {
      localStorage.setItem('manstyle_banners', JSON.stringify(newBanners));
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

  React.useEffect(() => {
    try {
      localStorage.setItem(CHAT_CACHE_STORAGE_KEY, JSON.stringify(chatMessages));
    } catch {}
  }, [chatMessages]);

  // Delivery state of the customer's own chat messages (a failed one stays on screen with «повторить»)
  const [pendingChatIds, setPendingChatIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failedChatMessages, setFailedChatMessages] = useState<ChatMessage[]>([]);
  const [chatIdentity, setChatIdentity] = useState<ChatIdentity | null>(null);
  // When true, orders are placed and validated by the placeOrder Cloud Function
  const [serverOrdersEnabled, setServerOrdersEnabled] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState<StorefrontSettings>(loadStorefrontSettings);
  // Admin → «Витрина» → «Предзаказ»: sold-out variants can still be ordered
  const preorderMode = storefrontSettings?.isPreorderMode === true;

  // Sync storefront settings on custom update event
  React.useEffect(() => {
    const handleStorefrontUpdate = () => {
      setStorefrontSettings(loadStorefrontSettings());
    };
    window.addEventListener('manstyle_storefront_settings_updated', handleStorefrontUpdate);
    return () => window.removeEventListener('manstyle_storefront_settings_updated', handleStorefrontUpdate);
  }, []);

  // Saved cart, or empty. Earlier versions put three demo items (ids 'cart-init-*') into every new
  // visitor's cart and brought them back after the cart was emptied; those items are dropped here.
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('manstyle_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((item: CartItem) => !String(item?.id).startsWith('cart-init-'));
        }
      }
    } catch {}
    return [];
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('manstyle_cart', JSON.stringify(cartItems));
    } catch {}
  }, [cartItems]);

  // A product from the address is restored once the catalog loads (see the products subscription)
  const pendingSelectedProductId = React.useRef<string | null>(initialRoute?.productId ?? null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Screen → address. A new screen is a new history entry (so «Назад» returns to it) and opens
  // at the top; the confirmation replaces the checkout entry, «Назад» does not return to paying
  const routeProductId =
    activeTab === 'product-detail' ? selectedProduct?.id ?? pendingSelectedProductId.current ?? undefined : undefined;
  React.useEffect(() => {
    // A product that is not resolved yet (catalog loading) or is gone: wait, see the not-found effect
    if (activeTab === 'product-detail' && !routeProductId) return;
    const hash = routeHash({ tab: activeTab, productId: routeProductId });
    if (isFirstRouteSync.current) {
      isFirstRouteSync.current = false;
      replaceNextRoute.current = false;
      window.history.scrollRestoration = 'manual';
      window.history.replaceState({ wasat: true, idx: 0 } satisfies HistoryEntryState, '', hash);
      return;
    }
    // Already there: a Back/Forward the popstate handler applied
    if (window.location.hash === hash) return;
    const replace = replaceNextRoute.current || activeTab === 'order-success';
    replaceNextRoute.current = false;
    window.history.replaceState(
      { ...readHistoryState(window.history.state), wasat: true, idx: historyIdx.current, scrollY: leavingScroll.current } satisfies HistoryEntryState,
      ''
    );
    if (replace) {
      window.history.replaceState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '', hash);
    } else {
      historyIdx.current += 1;
      window.history.pushState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '', hash);
    }
    pendingScroll.current = 0;
  }, [activeTab, routeProductId]);
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
    if (currentUser?.uid) {
      saveUserProfileToFirestore(currentUser.uid, updated);
    }
  };
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState(false);
  const [isMySizesModalOpen, setIsMySizesModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [catalogFilterState, setCatalogFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoInfo | null>(null);

  // Delivery Methods and Pickup Points State
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>(loadLocalDeliveryMethods);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>(loadLocalPickupPoints);

  // Customers see the current store name even while Firestore still holds the template brand.
  // The admin panel gets the raw data, so the rename in «Витрина» can find and fix it.
  const storeName = getStoreName(storefrontSettings);
  const customerStorefront = React.useMemo(
    () => ({ ...withStoreNameFields(storefrontSettings, storeName), storeName }),
    [storefrontSettings, storeName]
  );
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

  const { currentUser, isAdmin, loading: authLoading } = useAuth();

  // 1. Real-time Firestore Subscriptions
  React.useEffect(() => {
    const unsubProds = subscribeToProducts((loadedProds) => {
      setProducts(loadedProds);
      setProductsLoaded(true);
      // Synchronize cart with latest stock & prices from cloud
      setCartItems((prevCart) =>
        prevCart
          .filter((ci) => loadedProds.some((p) => p.id === ci.product.id))
          .map((ci) => {
            const fresh = loadedProds.find((p) => p.id === ci.product.id);
            return fresh ? { ...ci, product: fresh } : ci;
          })
      );
      // Refresh selected product if currently open
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

    const unsubReviews = subscribeToReviews(setStoredReviews);
    const unsubReviewVotes = subscribeToReviewVotes(setReviewVotes);

    const unsubPromos = subscribeToPromos((loadedPromos) => {
      if (loadedPromos) {
        setPromos(loadedPromos);
      }
    });

    const unsubServerConfig = subscribeToServerConfig((config) => {
      setServerOrdersEnabled(config.serverOrdersEnabled === true);
    });

    const unsubSettings = subscribeToStorefrontSettings((loadedSettings) => {
      if (loadedSettings) {
        setStorefrontSettings(loadedSettings);
        // Cached copy: components without props read the store name from it (currentStoreName)
        saveStorefrontSettings(loadedSettings);
      }
    });

    // An empty list is a real state (the owner removed everything): always apply it
    const unsubBanners = subscribeToBanners((loadedBanners) => {
      setBannerSlides(loadedBanners);
      try {
        localStorage.setItem('manstyle_banners', JSON.stringify(loadedBanners));
      } catch {}
    });

    const unsubDelivery = subscribeToDeliveryMethods((loadedMethods) => {
      setDeliveryMethods(loadedMethods);
      saveLocalDeliveryMethods(loadedMethods);
    });

    const unsubPickup = subscribeToPickupPoints((loadedPoints) => {
      setPickupPoints(loadedPoints);
      saveLocalPickupPoints(loadedPoints);
    });

    return () => {
      unsubProds();
      unsubReviews();
      unsubReviewVotes();
      unsubPromos();
      unsubSettings();
      unsubServerConfig();
      unsubBanners();
      unsubDelivery();
      unsubPickup();
    };
  }, []);

  // 1b. Orders & customer profiles are private (see firestore.rules):
  // admins see everything, signed-in customers only their own data,
  // guests keep their orders in this browser only.
  React.useEffect(() => {
    if (authLoading) return;

    if (isAdmin) {
      const unsubOrders = subscribeToOrders((loadedOrders) => setOrders(loadedOrders));
      const unsubUsers = subscribeToUsers((loadedUsers) => setAllUsers(loadedUsers));
      return () => {
        unsubOrders();
        unsubUsers();
      };
    }

    if (currentUser) {
      const unsubOrders = subscribeToOrders(
        (loadedOrders) => setOrders(loadedOrders),
        undefined,
        currentUser.uid
      );
      const unsubUsers = subscribeToOwnUserProfile(currentUser.uid, (loadedUsers) =>
        setAllUsers(loadedUsers)
      );
      return () => {
        unsubOrders();
        unsubUsers();
      };
    }

    setOrders(loadGuestOrders());
    setAllUsers([]);
  }, [authLoading, isAdmin, currentUser]);

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
          name: currentUser.displayName || existing?.name || prev.name,
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

  // Manual full sync helper
  const handleManualFirebaseSync = async () => {
    try {
      await syncAllProductsToFirestore(products);
      await syncAllOrdersToFirestore(orders);
      await syncAllPromosToFirestore(promos);
      await syncAllBannersToFirestore(bannerSlides);
      await syncAllDeliveryMethodsToFirestore(deliveryMethods);
      await syncAllPickupPointsToFirestore(pickupPoints);
      await saveStorefrontSettingsToFirestore(storefrontSettings);
      if (currentUser) {
        await saveUserProfileToFirestore(currentUser.uid, userProfile);
      }
      addToast('Все данные сохранены в базе', 'success');
    } catch (err) {
      console.error('Firebase Sync Error:', err);
      addToast('Не удалось сохранить данные в базе', 'error');
    }
  };

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
      const route = parseRouteHash(window.location.hash) ?? { tab: 'home' as ActiveTab };
      const entry = readHistoryState(e.state);
      if (entry) {
        historyIdx.current = entry.idx;
      } else {
        // A link or an edited address: a new entry of the shop's history
        historyIdx.current += 1;
        window.history.replaceState({ wasat: true, idx: historyIdx.current } satisfies HistoryEntryState, '');
      }
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
  const previousOrdersMapRef = React.useRef<Map<string, { status: Order['status']; isCancelled?: boolean; trackingNumber?: string }>>(new Map());
  const isInitialOrdersLoadRef = React.useRef(true);

  // Trigger push notification on order status change
  const triggerOrderStatusPushNotification = (
    order: Order,
    oldStatus?: Order['status'],
    newStatus?: Order['status']
  ) => {
    const notif = getOrderStatusNotification(order, oldStatus, newStatus);

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
        if (isOwnOrder && (statusChanged || cancelChanged || trackingChanged)) {
          triggerOrderStatusPushNotification(currentOrder, prev.status, currentOrder.status);
        }
      }

      // Update reference
      previousOrdersMapRef.current.set(currentOrder.id, {
        status: currentOrder.status,
        isCancelled: currentOrder.isCancelled,
        trackingNumber: currentOrder.trackingNumber,
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
    const isFixed = foundPromo.discountType === 'fixed';
    const discValue = foundPromo.discountValue !== undefined ? foundPromo.discountValue : foundPromo.discountPercent;

    setAppliedPromo({
      code: foundPromo.code,
      discountPercent: foundPromo.discountPercent,
      discountType: foundPromo.discountType || (isFixed ? 'fixed' : 'percent'),
      discountValue: discValue,
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
    setChatMessages((prev) =>
      threadId === undefined ? [] : prev.filter((m) => (m.threadId ?? null) !== threadId)
    );
    await clearChatMessagesInFirestore(threadId);
    addToast(threadId === undefined ? 'История чата поддержки очищена' : 'Диалог очищен', 'info');
  };

  // Admins load every thread; in the storefront chat they only see their own
  const ownThread = isAdmin ? chatMessages.filter((m) => m.threadId === currentUser?.uid) : chatMessages;
  // Failed messages are not in Firestore: keep them on screen (in send order) until they are retried
  const customerChatMessages = [
    ...ownThread.filter((m) => !failedChatMessages.some((f) => f.id === m.id)),
    ...failedChatMessages,
  ].sort((a, b) => chatMessageOrder(a) - chatMessageOrder(b));

  const hasActivePromos = promos.some((p) => p.active);

  // Complete Order
  type CompleteOrderData = {
    items: CartItem[];
    contact?: { name: string; phone: string; email?: string };
    address?: string;
    deliveryMethod?: string;
    deliveryMethodId?: string; // absent for the one-click quick order
    totalPrice?: number;
    paymentMethod?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
  };

  const resolveOrderDetails = (orderData: CompleteOrderData) => {
    const customerName =
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
    return { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod };
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
        },
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

  const handleCompleteOrder = (orderData: CompleteOrderData): Promise<boolean> =>
    serverOrdersEnabled ? completeOrderOnServer(orderData) : completeOrderLocally(orderData);

  // Legacy client-side checkout, used until the Cloud Function is deployed and enabled
  const completeOrderLocally = async (orderData: CompleteOrderData): Promise<boolean> => {
    // Orders are create-only for customers, so IDs must not collide with existing ones
    const newOrderId = `WS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const placedAt = new Date();

    const { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod } =
      resolveOrderDetails(orderData);
    const totalPrice = orderData.totalPrice ?? 0;
    const paymentStatus: Order['paymentStatus'] = paymentMethod.toLowerCase().includes('получении')
      ? 'paid_on_delivery'
      : 'paid';

    // Sold-out variants ordered in preorder mode are marked and not taken from stock
    const orderItems: CartItem[] = orderData.items.map((item) =>
      isPreorderVariant(item.product, item.selectedColor, item.selectedSize, preorderMode)
        ? { ...item, isPreorder: true }
        : item
    );

    const newOrderBase = {
      id: newOrderId,
      // the exact moment is createdAt (analytics, sorting); date is its display text
      createdAt: placedAt.toISOString(),
      date: formatOrderDate(placedAt),
      items: orderItems,
      status: 'accepted' as const,
      totalPrice,
      deliveryAddress,
      deliveryMethod,
      customerName,
      customerPhone,
      customerEmail,
      customerUid: currentUser?.uid,
      paymentMethod,
      paymentStatus,
      trackingNumber: undefined,
      estimatedDelivery: 'Через 1-2 дня',
    };

    const newOrder: Order = {
      ...newOrderBase,
      historySteps: getDefaultHistorySteps(newOrderBase),
      deliveryStages: getSynchronizedDeliveryStages(newOrderBase as Order),
    };

    // The order must reach the database before it is shown as placed and stock is taken:
    // a rejected write (rules, network error) used to be reported as a successful order
    try {
      await saveOrderToFirestore(newOrder);
    } catch (err) {
      console.error('Order was not saved:', err);
      addToast('Не удалось оформить заказ. Проверьте соединение и попробуйте еще раз.', 'error');
      return false;
    }

    // Deduct stock per size/color SKU and automatically write off log
    const { updatedProducts } = deductStockWithLogs(
      products,
      orderItems,
      newOrderId,
      customerName
    );
    setProducts(updatedProducts);

    // If active product was modified, sync selectedProduct
    if (selectedProduct) {
      const updatedSel = updatedProducts.find((p) => p.id === selectedProduct.id);
      if (updatedSel) {
        setSelectedProduct(updatedSel);
      }
    }

    // Promo usage, revenue and referral commission (a 1-click order has no promo, as on the server)
    const usedPromo = orderData.deliveryMethodId && appliedPromo?.code
      ? promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase())
      : undefined;
    if (usedPromo) {
      void recordPromoUsageInFirestore(usedPromo, totalPrice);
    }

    setOrders((prev) => [newOrder, ...prev]);
    if (!currentUser) {
      saveGuestOrder(newOrder);
    }
    
    // Atomically persist stock updates only for ordered products
    const orderedProductIds = new Set(orderData.items.map((i) => i.product.id));
    const modifiedProducts = updatedProducts.filter((p) => orderedProductIds.has(p.id));
    saveModifiedProductsToFirestore(modifiedProducts);

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
  const cartProductIds = cartItems.map((item) => item.product.id);

  const handleSaveMeasurements = (measurements: BodyMeasurements) => {
    const updated: UserProfile = {
      ...userProfile,
      bodyMeasurements: measurements,
    };
    handleUpdateProfile(updated);
    addToast('Параметры фигуры сохранены в профиле', 'success');
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
          activeTab={activeTab}
          cartCount={totalCartCount}
          favoritesCount={favorites.length}
          onOpenMySizes={() => setIsMySizesModalOpen(true)}
          onOpenFilters={() => setIsAdvancedFilterOpen(true)}
          onOpenSupportChat={() => setIsSupportChatOpen(true)}
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

        <BrandRequisitesModal
          isOpen={isBrandModalOpen}
          onClose={() => setIsBrandModalOpen(false)}
          storefrontSettings={customerStorefront}
          onOpenSupportChat={() => setIsSupportChatOpen(true)}
        />

        <SupportChatModal
          isOpen={isSupportChatOpen}
          storePhone={getStoreContacts(storefrontSettings).phone}
          onClose={() => setIsSupportChatOpen(false)}
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

        <SizeCalculatorModal
          isOpen={isMySizesModalOpen}
          onClose={() => setIsMySizesModalOpen(false)}
          availableSizes={['S', 'M', 'L', 'XL', 'XXL']}
          onSelectSize={(sz) => addToast(`Сохранен рекомендуемый размер: ${sz}`, 'success')}
          productFit="regular"
          userProfile={userProfile}
          onSaveMeasurements={handleSaveMeasurements}
        />

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

        {/* Promo message from Admin → «Витрина»: shown when switched on and filled in */}
        {storefrontSettings?.isStoreBannerVisible && publicSetting(storefrontSettings.storeBannerText) && (
          <aside aria-label="Объявление магазина" className="px-4 pt-2">
            <p className="max-w-lg mx-auto neu-flat-sm rounded-2xl px-3 py-2 flex items-center justify-center gap-2 text-center text-xs font-bold text-[#2D3A4E]">
              {storefrontSettings.bannerBadgeText?.trim() && (
                <span className="px-1.5 py-0.5 rounded-md bg-accent text-white text-[11px] font-black uppercase shrink-0">
                  {storefrontSettings.bannerBadgeText.trim()}
                </span>
              )}
              <span>{withStoreName(publicSetting(storefrontSettings.storeBannerText), getStoreName(storefrontSettings))}</span>
            </p>
          </aside>
        )}

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
        <main className="px-4 flex-1 pt-1 overflow-x-hidden">
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
              {activeTab === 'home' && (
            <HomeScreen
              products={products}
              favorites={favorites}
              cartItemIds={cartProductIds}
              recentlyViewed={recentlyViewed}
              onClearRecentlyViewed={handleClearRecentlyViewed}
              onRemoveFromRecentlyViewed={handleRemoveFromRecentlyViewed}
              onSelectProduct={handleSelectProduct}
              onToggleFavorite={handleToggleFavorite}
              onAddToCart={handleAddToCartQuick}
              setActiveTab={setActiveTab}
              onSelectCategory={setSelectedCategory}
              onOpenDrawer={() => setIsDrawerOpen(true)}
              bannerSlides={customerBannerSlides}
              storefrontSettings={customerStorefront}
              onOpenSupportChat={() => setIsSupportChatOpen(true)}
              onApplyPromo={handleApplyPromo}
              onShowToast={addToast}
              userProfile={userProfile}
              onOpenMySizes={() => setIsMySizesModalOpen(true)}
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
              favorites={favorites}
              cartItemIds={cartProductIds}
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
            />
          )}

          {activeTab === 'product-detail' && selectedProduct && (
            <ProductDetailScreen
              preorderMode={preorderMode}
              product={products.find((p) => p.id === selectedProduct.id) ?? selectedProduct}
              returnPeriodDays={storefrontSettings.returnPeriodDays}
              freeDeliveryThreshold={storefrontSettings.freeDeliveryThreshold}
              isFavorite={favorites.includes(selectedProduct.id)}
              cartCount={totalCartCount}
              recentlyViewed={recentlyViewed.filter((p) => p.id !== selectedProduct.id)}
              onClearRecentlyViewed={handleClearRecentlyViewed}
              onRemoveFromRecentlyViewed={handleRemoveFromRecentlyViewed}
              userProfile={userProfile}
              onSaveMeasurements={handleSaveMeasurements}
              onToggleFavorite={handleToggleFavorite}
              onAddToCartWithOptions={handleAddToCartWithOptions}
              onSelectProduct={handleSelectProduct}
              setActiveTab={setActiveTab}
              onCompleteOrder={handleCompleteOrder}
              onShowToast={addToast}
            />
          )}

          {activeTab === 'cart' && (
            <CartScreen
              hasActivePromos={hasActivePromos}
              preorderMode={preorderMode}
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
              cartItemIds={cartProductIds}
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
              products={products}
              favoritesCount={favorites.length}
              recentlyViewed={recentlyViewed}
              favorites={favorites}
              onSelectProduct={handleSelectProduct}
              onToggleFavorite={handleToggleFavorite}
              onUpdateProfile={handleUpdateProfile}
              setActiveTab={setActiveTab}
              onRepeatOrder={handleRepeatOrder}
              onShowToast={addToast}
              onOpenSupportChat={() => setIsSupportChatOpen(true)}
              onUpdateProducts={(updatedProds) => {
                void persist(
                  'товары',
                  deleteRemovedDocs('products', products, updatedProds),
                  syncAllProductsToFirestore(changedItems(products, updatedProds))
                );
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
                    setSelectedProduct(null);
                    if (activeTab === 'product-detail') {
                      setActiveTab('home');
                    }
                  }
                }
              }}
              onUpdateOrders={(updatedOrders) => {
                setOrders(updatedOrders);
                void persist('заказы', syncAllOrdersToFirestore(changedItems(orders, updatedOrders)));
              }}
              promos={promos}
              onUpdatePromos={(updatedPromos) => {
                void persist(
                  'промокоды',
                  deleteRemovedDocs('promos', promos, updatedPromos),
                  syncAllPromosToFirestore(changedItems(promos, updatedPromos))
                );
                setPromos(updatedPromos);
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
              deliveryMethods={deliveryMethods}
              onUpdateDeliveryMethods={handleUpdateDeliveryMethods}
              pickupPoints={pickupPoints}
              onUpdatePickupPoints={handleUpdatePickupPoints}
              onSyncFirebase={handleManualFirebaseSync}
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
