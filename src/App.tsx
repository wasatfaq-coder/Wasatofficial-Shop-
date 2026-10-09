import { SizeCalculatorModal } from './components/lazyWindows';
import React, { Suspense, lazy, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from './types';
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
import { useAuth } from './context/AuthContext';
import { useCatalog } from './app/useCatalog';
import { useStorefrontData } from './app/useStorefrontData';
import { useAccountData } from './app/useAccountData';
import { useToasts } from './app/useToasts';
import { useCart } from './app/useCart';
import { useSupportChat } from './app/useSupportChat';
import { useCheckout } from './app/useCheckout';
import { useScreenHeadingFocus, useScreenHistory, useScreenState } from './app/screenHistory';
import { useProfile } from './app/useProfile';
import { useOrderNotifications } from './app/useOrderNotifications';
import { useCustomerOrders } from './app/useCustomerOrders';
import { useAdminActions } from './app/useAdminActions';

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
import { screenDocumentTitle } from './utils/screenMeta';
import { VariantPickerSheet } from './components/VariantPickerSheet';
import { DEFAULT_CATALOG_VIEW, type CatalogView } from './utils/productListing';
import { linePrice } from './shared/orderLine';

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

export default function App() {
  const { currentUser, isAdmin, loading: authLoading, loginWithGoogle } = useAuth();
  // Toasts and `persist` for writes that must not fail silently (useToasts.ts)
  const { toasts, setToasts, addToast, removeToast, persist } = useToasts();
  // The screen on show; the address follows it below (screenHistory.ts)
  const screen = useScreenState();
  const { activeTab, setActiveTab, pendingScroll, pendingSelectedProductId } = screen;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  // Catalog search: the same text in the computer's top bar, on the home screen and in the catalog
  const [catalogSearch, setCatalogSearch] = useState('');
  // Settings, promos, banners and delivery: live from Firestore, cached in the browser (useStorefrontData.ts)
  const {
    promos,
    setPromos,
    promosLoaded,
    promosFailed,
    requestPromos,
    bannerSlides,
    bannersLoaded,
    setBannerSlides,
    serverOrdersEnabled,
    storefrontSettings,
    setStorefrontSettings,
    deliveryMethods,
    setDeliveryMethods,
    pickupPoints,
    pickupPointsLoaded,
    pickupPointsFailed,
    setPickupPoints,
  } = useStorefrontData(
    isAdmin || activeTab === 'cart' || activeTab === 'checkout',
    isAdmin || activeTab === 'cart' || activeTab === 'checkout'
  );

  // The removed local admin password was kept here in plain text: erase it
  React.useEffect(() => {
    try {
      localStorage.removeItem('manstyle_admin_credentials');
      sessionStorage.removeItem('manstyle_admin_auth');
    } catch {}
  }, []);


  // Admin → «Витрина» → «Предзаказ»: sold-out variants can still be ordered
  const preorderMode = storefrontSettings?.isPreorderMode === true;

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

  // A code with a usage limit asks for a Google sign-in (finding 9): the toast's button opens the Google window
  const signInForPromo = () => {
    loginWithGoogle().catch((err: unknown) => {
      console.warn('Google sign-in for a promo code did not finish:', err);
      const code = (err as { code?: string })?.code ?? '';
      // the buyer closed the Google window: nothing to report
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      addToast('Не удалось войти через Google. Попробуйте ещё раз или войдите в «Профиле»', 'error');
    });
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
  } = useCart({
    promos,
    promosLoaded,
    promosFailed,
    requestPromos,
    preorderMode,
    addToast,
    setActiveTab,
    onOpenProduct: handleSelectProduct,
    signedInWithGoogle: Boolean(currentUser && !currentUser.isAnonymous),
    onSignIn: signInForPromo,
  });
  // Catalog with its reviews (useCatalog.ts). Every snapshot brings the cart's stock and prices up to date and
  // refreshes the open product
  const { products, setProducts, productsLoaded, productsError, fullCatalog, waitForCatalogIndex } = useCatalog((loadedProds) => {
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
  const { ownProfiles, orders, setOrders, productCosts, setProductCosts } = useAccountData({ authLoading, isAdmin, currentUser });

  // The visitor's profile (useProfile.ts)
  const { userProfile, handleUpdateProfile, handleSaveMeasurements } = useProfile({
    authLoading,
    currentUser,
    ownProfiles,
    persist,
    addToast,
  });
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
  // The catalog's sort and «Показать ещё» outlive the screen: «Назад» from a product returns to the same list (finding 22)
  const [catalogView, setCatalogView] = useState<CatalogView>(DEFAULT_CATALOG_VIEW);
  // Customers see the current store name even while Firestore still holds the template brand.
  // The admin panel gets the raw data, so the rename in «Витрина» can find and fix it.
  const storeName = getStoreName(storefrontSettings);
  const customerStorefront = React.useMemo(
    () => ({ ...withStoreNameFields(storefrontSettings, storeName), storeName }),
    [storefrontSettings, storeName]
  );
  // Tab title of the screen: «Каталог — …», a product's name on its screen (screenMeta.ts; WCAG 2.4.2, finding 31)
  const productTitle = activeTab === 'product-detail' ? selectedProduct?.title : undefined;
  React.useEffect(() => {
    document.title = screenDocumentTitle(activeTab, storeName, productTitle);
  }, [activeTab, productTitle, storeName]);
  // A new screen moves the focus to its heading: a screen reader reads it, Tab goes on from the new screen
  useScreenHeadingFocus(
    activeTab === 'product-detail' ? (selectedProduct ? `product-detail:${selectedProduct.id}` : null) : activeTab
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

  // Global Filter Match Counter for modal
  const filteredProductsCount = React.useMemo(() => {
    return products.filter((p) => matchesCatalogFilters(p, selectedCategory, catalogFilterState)).length;
  }, [products, selectedCategory, catalogFilterState]);

  const handleResetCatalogFilters = () => {
    setSelectedCategory('all');
    setCatalogFilterState(DEFAULT_FILTER_STATE);
  };

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
    chatThreadLoading,
    chatThreadFailed,
    handleSendMessageFromUser,
    handleRetryChatMessage,
    handleChangeChatMessage,
    handleSendMessageAsAdmin,
    handleClearChat,
  } = useSupportChat({
    authLoading,
    isAdmin,
    currentUser,
    userProfile,
    promos,
    setPromos,
    addToast,
    persist,
    chatOpen: isSupportChatOpen,
  });

  // Placing an order and the confirmation screen (useCheckout.ts)
  const { latestOrder, checkoutStockProblems, handleCompleteOrder } = useCheckout({
    activeTab,
    setActiveTab,
    currentUser,
    userProfile,
    products,
    setProducts,
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

  // Screen ↔ address, «Назад» and «Вперед» (screenHistory.ts)
  const { handleHeaderBack } = useScreenHistory(screen, {
    selectedProduct,
    setSelectedProduct,
    products,
    productsLoaded,
    latestOrder,
    addToast,
  });

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

  // A change of the customer's order while the site is open (useOrderNotifications.ts). «Смотреть статус» opens the
  // profile, and the profile opens the order once it is on screen (finding 23)
  const [orderToOpen, setOrderToOpen] = useState<string | null>(null);
  const openOrderStatus = (orderId: string) => {
    setOrderToOpen(orderId);
    setActiveTab('profile');
  };
  useOrderNotifications({ orders, isAdmin, currentUser, userProfile, setToasts, onOpenOrder: openOrderStatus });

  // Cancel, «Я получил заказ», a receipt and «Повторить заказ» in the profile (useCustomerOrders.ts)
  const { handleCancelOwnOrder, handleConfirmReceipt, handleSubmitPaymentReceipt, handleRepeatOrder } = useCustomerOrders({
    authLoading,
    currentUser,
    userProfile,
    orders,
    products,
    preorderMode,
    setCartItems,
    setChatMessages,
    addToast,
    setActiveTab,
  });

  // The admin panel's writes (useAdminActions.ts)
  const {
    adminProducts,
    handleUpdateProducts,
    handleUpdateOrders,
    handleUpdatePromos,
    handleUpdateBannerSlides,
    handleUpdateDeliveryMethods,
    handleUpdatePickupPoints,
    handleUpdateStorefrontSettings,
    handleSaveLegalText,
    handleApplyExchangeRates,
  } = useAdminActions({
    isAdmin,
    products,
    setProducts,
    productsLoaded,
    fullCatalog,
    waitForCatalogIndex,
    productCosts,
    setProductCosts,
    selectedProduct,
    setSelectedProduct,
    setCartItems,
    orders,
    setOrders,
    promos,
    setPromos,
    bannerSlides,
    bannersLoaded,
    setBannerSlides,
    deliveryMethods,
    setDeliveryMethods,
    pickupPoints,
    setPickupPoints,
    setStorefrontSettings,
    persist,
    addToast,
  });

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
          loading={chatThreadLoading}
          loadFailed={chatThreadFailed}
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
          cartSubtotal={cartItems.reduce((acc, item) => acc + linePrice(item) * item.quantity, 0)}
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
              view={catalogView}
              onViewChange={setCatalogView}
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
              pickupPointsLoaded={pickupPointsLoaded}
              pickupPointsFailed={pickupPointsFailed}
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
              onUpdateProducts={handleUpdateProducts}
              onUpdateOrders={handleUpdateOrders}
              promos={promos}
              onUpdatePromos={handleUpdatePromos}
              bannerSlides={bannerSlides}
              onUpdateBannerSlides={handleUpdateBannerSlides}
              chatMessages={chatMessages}
              onSendMessageAsAdmin={handleSendMessageAsAdmin}
              onClearChat={handleClearChat}
              onChangeChatMessage={(change) => handleChangeChatMessage(change, true)}
              storefrontSettings={storefrontSettings}
              onUpdateStorefrontSettings={handleUpdateStorefrontSettings}
              onSaveLegalText={handleSaveLegalText}
              onApplyExchangeRates={handleApplyExchangeRates}
              deliveryMethods={deliveryMethods}
              onUpdateDeliveryMethods={handleUpdateDeliveryMethods}
              pickupPoints={pickupPoints}
              onUpdatePickupPoints={handleUpdatePickupPoints}
              openOrderId={orderToOpen}
              onOrderOpened={() => setOrderToOpen(null)}
            />
          )}

          {activeTab === 'order-success' && latestOrder && (
            <OrderSuccessScreen
              orderId={latestOrder.id}
              totalPrice={latestOrder.totalPrice}
              deliveryMethod={latestOrder.deliveryMethod}
              deliveryAddress={latestOrder.deliveryAddress}
              paymentMethod={latestOrder.paymentMethod}
              notSavedInBrowser={latestOrder.notSavedInBrowser}
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
