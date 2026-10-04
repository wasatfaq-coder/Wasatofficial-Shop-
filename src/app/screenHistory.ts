import React, { useState } from 'react';
import type { ActiveTab, Product } from '../types';
import { currentRoutePath, parseRoute, readHistoryState, routePath, type HistoryEntryState } from '../utils/navigation';
import { afterWindowHistory, isWindowHistoryBusy, windowDepth } from '../utils/windowHistory';
import type { AddToast } from './useToasts';

/**
 * The screen on show and the shop's own history entries. Every screen change goes through `setActiveTab`;
 * the address follows the screen in `useScreenHistory` (called once the catalog and the last order are known).
 */
export function useScreenState() {
  // The screen comes from the address (/catalog, /product/{id}, an old #/…): reload, a shared link and «Назад» work
  const [initialRoute] = useState(() => parseRoute(window.location));
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() =>
    // The confirmation needs the order just placed: after a reload there is none
    !initialRoute || initialRoute.tab === 'order-success' ? 'home' : initialRoute.tab
  );

  // Browser history for the screens (the sync effects are in useScreenHistory)
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

  // A product from the address is restored once the catalog loads (see the products subscription)
  const pendingSelectedProductId = React.useRef<string | null>(initialRoute?.productId ?? null);

  return {
    activeTab,
    setActiveTab,
    setActiveTabState,
    pendingSelectedProductId,
    historyIdx,
    leavingScroll,
    pendingScroll,
    replaceNextRoute,
    isFirstRouteSync,
    shownPath,
    routeRetry,
    setRouteRetry,
  };
}

type ScreenState = ReturnType<typeof useScreenState>;

type ScreenHistoryOptions = {
  selectedProduct: Product | null;
  setSelectedProduct: React.Dispatch<React.SetStateAction<Product | null>>;
  products: Product[];
  productsLoaded: boolean;
  /** The order just placed: without it the confirmation screen is not shown */
  latestOrder: object | null;
  addToast: AddToast;
};

/**
 * Screen ↔ address: a new screen is a new history entry, «Назад» and «Вперед» of the browser show the screen from the
 * address with its scroll, links to the shop's screens open without a reload, a removed product leads to the catalog.
 */
export function useScreenHistory(
  {
    activeTab,
    setActiveTab,
    setActiveTabState,
    pendingSelectedProductId,
    historyIdx,
    leavingScroll,
    pendingScroll,
    replaceNextRoute,
    isFirstRouteSync,
    shownPath,
    routeRetry,
    setRouteRetry,
  }: ScreenState,
  { selectedProduct, setSelectedProduct, products, productsLoaded, latestOrder, addToast }: ScreenHistoryOptions
) {
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

  return { handleHeaderBack };
}
