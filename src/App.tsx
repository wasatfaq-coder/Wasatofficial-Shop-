import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab, Product, CartItem, UserProfile, Order, BodyMeasurements, PromoCode, BannerSlide, ChatMessage, AppliedPromoInfo, StorefrontSettings, DeliveryMethod, PickupPoint } from './types';
import { GUEST_USER_PROFILE } from './data/products';
import { INITIAL_CHAT_MESSAGES } from './data/marketingAndSupport';
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
  matchesMaterialFilter,
  isProductAvailableInSize,
} from './components/CatalogAdvancedFilter';
import { deductStockWithLogs, loadStorefrontSettings, saveStorefrontSettings, getVariantStock, isProductInStock } from './utils/inventory';
import { getDefaultDeliveryStages, getDefaultHistorySteps, getSynchronizedDeliveryStages } from './utils/deliveryStages';
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
} from './utils/firebaseSync';

import { HomeScreen } from './views/HomeScreen';
import { CatalogScreen } from './views/CatalogScreen';
import { ProductDetailScreen } from './views/ProductDetailScreen';
import { CartScreen } from './views/CartScreen';
import { CheckoutScreen } from './views/CheckoutScreen';
import { ProfileScreen } from './views/ProfileScreen';
import { FavoritesScreen } from './views/FavoritesScreen';
import { OrderSuccessScreen } from './views/OrderSuccessScreen';
import { validatePromo, PricingLine, QUICK_ORDER_DELIVERY_ID } from './shared/orderPricing';
import { extractColorName, extractSizeName } from './utils/inventory';
import { getStoreContacts, getStoreName, withStoreNameFields } from './utils/storeContacts';
import { formatDays } from './utils/pluralize';
import { productRatingValue } from './utils/productRating';

// Unique across customers: messages are create-only for customers (see firestore.rules)
function newChatMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPricingLine(item: CartItem): PricingLine {
  return {
    productId: item.product.id,
    category: item.product.category,
    price: item.product.price,
    quantity: item.quantity,
  };
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
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const saved = sessionStorage.getItem('manstyle_active_tab') as ActiveTab;
      const validTabs: ActiveTab[] = ['home', 'catalog', 'cart', 'favorites', 'profile', 'product-detail', 'checkout', 'order-success'];
      if (saved && validTabs.includes(saved)) return saved;
    } catch {
      // Fallback if sessionStorage unavailable
    }
    return 'home';
  });

  // Preserve activeTab in sessionStorage across any reloads
  React.useEffect(() => {
    try {
      sessionStorage.setItem('manstyle_active_tab', activeTab);
    } catch {
      // Ignore
    }
  }, [activeTab]);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  // Catalog, promos and banners come only from Firestore (Admin panel); no demo data meanwhile
  const [products, setProducts] = useState<Product[]>([]);
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
    deleteRemovedDocs('banners', bannerSlides, newBanners);
    setBannerSlides(newBanners);
    try {
      localStorage.setItem('manstyle_banners', JSON.stringify(newBanners));
    } catch {}
    syncAllBannersToFirestore(newBanners);
  };

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_CACHE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_CHAT_MESSAGES;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(CHAT_CACHE_STORAGE_KEY, JSON.stringify(chatMessages));
    } catch {}
  }, [chatMessages]);

  const [isChatTyping, setIsChatTyping] = useState(false);
  const [chatIdentity, setChatIdentity] = useState<ChatIdentity | null>(null);
  // When true, orders are placed and validated by the placeOrder Cloud Function
  const [serverOrdersEnabled, setServerOrdersEnabled] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState<StorefrontSettings>(loadStorefrontSettings);

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

  const pendingSelectedProductId = React.useRef<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(() => {
    try {
      // Restored from the catalog once it loads (see the products subscription)
      pendingSelectedProductId.current = sessionStorage.getItem('manstyle_selected_product_id');
    } catch {
      // Ignore
    }
    return null;
  });

  React.useEffect(() => {
    if (selectedProduct) {
      try {
        sessionStorage.setItem('manstyle_selected_product_id', selectedProduct.id);
      } catch {
        // Ignore
      }
    }
  }, [selectedProduct]);
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
  const [catalogFilterState, setCatalogFilterState] = useState<FilterState>({
    minPrice: 0,
    maxPrice: 35000,
    selectedSizes: [],
    selectedMaterials: [],
    onlyInStock: false,
    onlyNew: false,
    onlyDiscount: false,
    minRating: 0,
  });
  const [openCatalogFiltersImmediately, setOpenCatalogFiltersImmediately] = useState(false);
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
    deleteRemovedDocs('delivery_methods', deliveryMethods, updated);
    setDeliveryMethods(updated);
    saveLocalDeliveryMethods(updated);
    syncAllDeliveryMethodsToFirestore(updated);
  };

  const handleUpdatePickupPoints = (updated: PickupPoint[]) => {
    deleteRemovedDocs('pickup_points', pickupPoints, updated);
    setPickupPoints(updated);
    saveLocalPickupPoints(updated);
    syncAllPickupPointsToFirestore(updated);
  };

  // Global Filter Match Counter for modal
  const filteredProductsCount = React.useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchesPrice = p.price >= catalogFilterState.minPrice && p.price <= catalogFilterState.maxPrice;
      const matchesMaterial = matchesMaterialFilter(p.material, catalogFilterState.selectedMaterials);
      const matchesSize =
        catalogFilterState.selectedSizes.length === 0 ||
        catalogFilterState.selectedSizes.some((sz) => isProductAvailableInSize(p, sz));
      const matchesInStock = !catalogFilterState.onlyInStock || isProductInStock(p);
      const matchesNew = !catalogFilterState.onlyNew || p.isNew;
      const matchesDiscount = !catalogFilterState.onlyDiscount || (p.originalPrice && p.originalPrice > p.price);
      const matchesRating = productRatingValue(p) >= catalogFilterState.minRating;

      return (
        matchesCategory &&
        matchesPrice &&
        matchesMaterial &&
        matchesSize &&
        matchesInStock &&
        matchesNew &&
        matchesDiscount &&
        matchesRating
      );
    }).length;
  }, [products, selectedCategory, catalogFilterState]);

  const handleResetCatalogFilters = () => {
    setSelectedCategory('all');
    setCatalogFilterState({
      minPrice: 0,
      maxPrice: 35000,
      selectedSizes: [],
      selectedMaterials: [],
      onlyInStock: false,
      onlyNew: false,
      onlyDiscount: false,
      minRating: 0,
    });
  };

  const { currentUser, isAdmin, loading: authLoading } = useAuth();

  // 1. Real-time Firestore Subscriptions
  React.useEffect(() => {
    const unsubProds = subscribeToProducts((loadedProds) => {
      setProducts(loadedProds);
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
      setSelectedProduct((prev) => {
        const wantedId = prev?.id ?? pendingSelectedProductId.current;
        pendingSelectedProductId.current = null;
        if (!wantedId) return null;
        return loadedProds.find((p) => p.id === wantedId) || null;
      });
    });

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
    setChatMessages(INITIAL_CHAT_MESSAGES);
  }, [authLoading, isAdmin, chatIdentity]);

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
  } | null>(null);

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

    // 1. Play auditory chime
    playNotificationChime();

    // 2. Trigger browser native notification if permitted
    sendBrowserNotification(notif.title, {
      body: `${notif.subtitle}\n${notif.text}`,
    });

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

        if (statusChanged || cancelChanged || trackingChanged) {
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
  const addToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
  };

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

  // Add to Cart from Product Card quick plus button
  const handleAddToCartQuick = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const defaultColor = product.colors?.[0]?.name || 'Бежевый';
    const defaultSize = product.sizes?.[0] || 'M';
    const variantStock = getVariantStock(product, defaultColor, defaultSize);

    if (variantStock <= 0 && !isProductInStock(product)) {
      addToast(`Товар "${product.title}" временно закончился`, 'error');
      return;
    }

    const existingIndex = cartItems.findIndex(
      (item) =>
        item.product.id === product.id &&
        item.selectedColor === defaultColor &&
        item.selectedSize === defaultSize
    );

    if (existingIndex > -1) {
      const currentItem = cartItems[existingIndex];
      const maxAllowed = variantStock > 0 ? variantStock : 99;
      if (currentItem.quantity >= maxAllowed) {
        addToast(`Достигнут максимум в наличии (${maxAllowed} шт.) для ${product.title}`, 'info');
        return;
      }
      setCartItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
      addToast(`Увеличено количество: ${product.title}`, 'info');
    } else {
      const newItem: CartItem = {
        id: `cart-${Date.now()}`,
        product,
        selectedColor: defaultColor,
        selectedSize: defaultSize,
        quantity: 1,
      };
      setCartItems((prev) => [...prev, newItem]);
      addToast(`Добавлено в корзину: ${product.title}`, 'success');
    }
  };

  // Add to Cart with Options from Detail screen
  const handleAddToCartWithOptions = (
    product: Product,
    color: string,
    size: string,
    quantity: number
  ) => {
    const availableStock = getVariantStock(product, color, size);
    if (availableStock <= 0) {
      addToast(`К сожалению, ${product.title} (${color}, ${size}) нет в наличии`, 'error');
      return;
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
      const newTotalQty = Math.min(currentQty + clampedQuantity, availableStock);
      setCartItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: newTotalQty } : item
        )
      );
      addToast(`Обновлено количество в корзине: ${product.title} (${newTotalQty} шт.)`, 'info');
    } else {
      const newItem: CartItem = {
        id: `cart-${Date.now()}`,
        product,
        selectedColor: color,
        selectedSize: size,
        quantity: clampedQuantity,
      };
      setCartItems((prev) => [...prev, newItem]);
      addToast(`${product.title} (${color}, ${size}) добавлено в корзину!`, 'success');
    }
    setActiveTab('cart');
  };

  // Repeat a past order: current product data and stock, unavailable items are skipped
  const handleRepeatOrder = (items: CartItem[]) => {
    const toAdd: CartItem[] = [];
    let skipped = 0;
    items.forEach((item, idx) => {
      const product = products.find((p) => p.id === item.product?.id);
      const stock = product ? getVariantStock(product, item.selectedColor, item.selectedSize) : 0;
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
          const stock = getVariantStock(add.product, add.selectedColor, add.selectedSize);
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
            const stock = getVariantStock(item.product, item.selectedColor, item.selectedSize);
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
          const availableStock = getVariantStock(item.product, newColor, newSize);
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

    // Increment used count and update promo state
    setPromos((prev) =>
      prev.map((p) => (p.code === foundPromo.code ? { ...p, usedCount: p.usedCount + 1 } : p))
    );

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

    const discountText = isFixed
      ? `Скидка ${(discValue || 0).toLocaleString('ru-RU')} ₽`
      : `Скидка ${discValue || foundPromo.discountPercent}%`;

    addToast(`Промокод ${foundPromo.code} успешно применен! ${discountText}`, 'success');
    return true;
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    addToast('Промокод отменен', 'info');
  };

  // Support Chat Message Handlers (Live client + automated assistant + admin responses + media)
  const handleSendMessageFromUser = async (text: string, imageUrl?: string) => {
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
        return;
      }
    }
    const thread = {
      threadId: identity.uid,
      threadName: userProfile.name || userProfile.email || currentUser?.email || 'Гость',
    };

    const userMsg: ChatMessage = {
      id: newChatMessageId(),
      sender: 'user',
      text,
      imageUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...thread,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    saveChatMessageToFirestore(userMsg, identity.db);
    setIsChatTyping(true);

    setTimeout(() => {
      setIsChatTyping(false);
      let replyText = `Благодарим за обращение! Менеджер ${storeName} ответит вам в течение нескольких минут.`;
      const lower = text.toLowerCase();
      if (imageUrl) {
        replyText = 'Спасибо за прикрепленное фото! Консультант уже изучает изображение и поможет с оценкой или подбором.';
      } else if (lower.includes('размер') || lower.includes('подобрать')) {
        replyText = 'Воспользуйтесь «Калькулятором размеров» в меню или в карточке товара — он подберет размер по вашим росту, весу и обхватам.';
      } else if (lower.includes('доставк') || lower.includes('где заказ') || lower.includes('трек')) {
        replyText = 'Статус и отслеживание заказов — в разделе «Профиль» → «Заказы и трекинг». Сроки доставки для вашего адреса видны при оформлении заказа.';
      } else if (lower.includes('возврат') || lower.includes('обмен')) {
        replyText = `Возврат и обмен возможны в течение ${formatDays(storefrontSettings.returnPeriodDays ?? 14)}. Прикрепите фото бирки и товара прямо в чат — так мы оформим все быстрее.`;
      } else if (lower.includes('скидк') || lower.includes('промокод')) {
        replyText = 'Доступные промокоды можно выбрать в корзине — кнопка «Добавить купоны и промокоды». Менеджер также может подобрать для вас персональное предложение.';
      }

      const botMsg: ChatMessage = {
        id: newChatMessageId(),
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...thread,
      };
      setChatMessages((prev) => [...prev, botMsg]);
      saveChatMessageToFirestore(botMsg, identity.db);
    }, 1000);
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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, adminMsg]);
    saveChatMessageToFirestore(adminMsg);

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
          expiresAt: promoCard.expiryDate || '31 декабря 2026 г.',
          usedCount: 0,
          usageLimit: 1,
        };
        const updated = [newPromo, ...promos];
        setPromos(updated);
        syncAllPromosToFirestore(updated);
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
  const adminOwnThread = isAdmin ? chatMessages.filter((m) => m.threadId === currentUser?.uid) : [];
  const customerChatMessages = isAdmin
    ? adminOwnThread.length > 0
      ? adminOwnThread
      : INITIAL_CHAT_MESSAGES
    : chatMessages;

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
      (userProfile.address ? formatAddress(userProfile.address) : 'Москва, Пресненская наб., д. 12');
    const deliveryMethod = orderData.deliveryMethod || 'Курьерская доставка';
    const paymentMethod = orderData.paymentMethod || 'Карта (онлайн)';
    return { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod };
  };

  const finishOrder = (order: Pick<Order, 'id' | 'totalPrice' | 'deliveryMethod' | 'deliveryAddress'>) => {
    setCartItems([]);
    setAppliedPromo(null);
    setLatestOrder({
      id: order.id,
      totalPrice: order.totalPrice,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
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
      finishOrder(order);
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
    serverOrdersEnabled ? completeOrderOnServer(orderData) : Promise.resolve(completeOrderLocally(orderData));

  // Legacy client-side checkout, used until the Cloud Function is deployed and enabled
  const completeOrderLocally = (orderData: CompleteOrderData): boolean => {
    // Orders are create-only for customers, so IDs must not collide with existing ones
    const newOrderId = `WS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod } =
      resolveOrderDetails(orderData);
    const totalPrice = orderData.totalPrice ?? 0;
    const paymentStatus: Order['paymentStatus'] = paymentMethod.toLowerCase().includes('получении')
      ? 'paid_on_delivery'
      : 'paid';

    const newOrderBase = {
      id: newOrderId,
      date: `Сегодня, ${nowStr}`,
      items: orderData.items,
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

    // Deduct stock per size/color SKU and automatically write off log
    const { updatedProducts } = deductStockWithLogs(
      products,
      orderData.items,
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

    // Update promo usage count, revenue, and referral metrics
    if (appliedPromo?.code) {
      setPromos((prev) => {
        const nextPromos = prev.map((p) => {
          if (p.code.toUpperCase() === appliedPromo.code.toUpperCase()) {
            const commPercent = p.partnerCommissionPercent || 10;
            const newRevenue = (p.generatedRevenue || 0) + totalPrice;
            const newCommission = p.isReferral
              ? (p.commissionEarned || 0) + Math.round((totalPrice * commPercent) / 100)
              : p.commissionEarned;
            return {
              ...p,
              usedCount: (p.usedCount || 0) + 1,
              generatedRevenue: newRevenue,
              commissionEarned: newCommission,
            };
          }
          return p;
        });
        syncAllPromosToFirestore(nextPromos);
        return nextPromos;
      });
    }

    setOrders((prev) => [newOrder, ...prev]);
    saveOrderToFirestore(newOrder);
    if (!currentUser) {
      saveGuestOrder(newOrder);
    }
    
    // Atomically persist stock updates only for ordered products
    const orderedProductIds = new Set(orderData.items.map((i) => i.product.id));
    const modifiedProducts = updatedProducts.filter((p) => orderedProductIds.has(p.id));
    saveModifiedProductsToFirestore(modifiedProducts);

    finishOrder({ id: newOrderId, totalPrice, deliveryMethod, deliveryAddress });
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

  const handleUpdateProductInCatalog = (updatedProd: Product) => {
    setSelectedProduct(updatedProd);
    setProducts((prev) => {
      const nextProds = prev.map((p) => (p.id === updatedProd.id ? updatedProd : p));
      saveModifiedProductsToFirestore([updatedProd]);
      return nextProds;
    });
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
          onOpenMySizes={() => setIsMySizesModalOpen(true)}
          onNavigateTab={(tab) => setActiveTab(tab)}
          messages={customerChatMessages}
          onSendMessage={handleSendMessageFromUser}
          isTyping={isChatTyping}
          onApplyPromo={handleApplyPromo}
          onAddToCart={(productId, color, size) => {
            const prod = products.find((p) => p.id === productId);
            if (prod) {
              handleAddToCartWithOptions(
                prod,
                color || prod.colors?.[0]?.name || 'Бежевый',
                size || prod.sizes?.[0] || 'M',
                1
              );
            }
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

        {/* Top Header Bar (only shown on non-home screens) */}
        {activeTab !== 'home' && (
          <Header
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            cartCount={totalCartCount}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            selectedProductTitle={selectedProduct?.title}
            storeName={storeName}
          />
        )}

        {/* View Router Body */}
        <main className="px-4 flex-1 pt-1 overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
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
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogScreen
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
              filterState={catalogFilterState}
              onChangeFilterState={setCatalogFilterState}
              onResetFilters={handleResetCatalogFilters}
              onOpenFilters={() => setIsAdvancedFilterOpen(true)}
            />
          )}

          {activeTab === 'product-detail' && selectedProduct && (
            <ProductDetailScreen
              product={selectedProduct}
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
              onUpdateProduct={handleUpdateProductInCatalog}
              setActiveTab={setActiveTab}
              onCompleteOrder={handleCompleteOrder}
              onShowToast={addToast}
            />
          )}

          {activeTab === 'cart' && (
            <CartScreen
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
              hasDeliveryMethods={deliveryMethods.some((m) => m.isActive !== false)}
            />
          )}

          {activeTab === 'checkout' && (
            <CheckoutScreen
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
                deleteRemovedDocs('products', products, updatedProds);
                setProducts(updatedProds);
                syncAllProductsToFirestore(updatedProds);
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
                syncAllOrdersToFirestore(updatedOrders);
              }}
              promos={promos}
              onUpdatePromos={(updatedPromos) => {
                deleteRemovedDocs('promos', promos, updatedPromos);
                setPromos(updatedPromos);
                syncAllPromosToFirestore(updatedPromos);
              }}
              bannerSlides={bannerSlides}
              onUpdateBannerSlides={handleUpdateBannerSlides}
              chatMessages={chatMessages}
              onSendMessageAsAdmin={handleSendMessageAsAdmin}
              onClearChat={handleClearChat}
              storefrontSettings={storefrontSettings}
              onUpdateStorefrontSettings={(upd) => {
                setStorefrontSettings(upd);
                saveStorefrontSettings(upd);
                saveStorefrontSettingsToFirestore(upd);
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
              setActiveTab={setActiveTab}
            />
          )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Floating Bottom Navigation Bar */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          favoritesCount={favorites.length}
          cartCount={totalCartCount}
        />
      </div>
    </DeviceFrameWrapper>
  );
}
