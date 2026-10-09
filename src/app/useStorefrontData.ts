import React, { useState } from 'react';
import type { BannerSlide, DeliveryMethod, PickupPoint, PromoCode, StorefrontSettings } from '../types';
import { loadLocalDeliveryMethods, saveLocalDeliveryMethods, loadLocalPickupPoints, saveLocalPickupPoints } from '../data/deliveryData';
import { loadStorefrontSettings, saveStorefrontSettings } from '../utils/inventory';
import {
  subscribeToBanners,
  subscribeToDeliveryMethods,
  subscribeToPickupPoints,
  subscribeToPromos,
  subscribeToServerConfig,
  subscribeToStorefrontSettings,
} from '../utils/firebaseSync';

// Internal key: the banners cached in customers' browsers (CLAUDE.md, «manstyle_*»)
export const BANNERS_STORAGE_KEY = 'manstyle_banners';

function loadCachedBanners(): BannerSlide[] {
  try {
    const saved = localStorage.getItem(BANNERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * What every visitor reads about the shop, live from Firestore: «Витрина» settings, banners, delivery methods and the
 * server-orders switch. The browser keeps a copy of settings, banners and delivery, so the
 * first screen has them before the database answers.
 *
 * Promos — only once they are needed (docs/catalog-scale-plan.md, stage 4): `wantPromos` (the cart, the checkout, the
 * admin) or `requestPromos()` (a code applied from a banner or the chat). Most visits never open the cart; once read,
 * the promos stay subscribed for the rest of the visit.
 *
 * Pickup points — the same way (audit 07.10, finding 51): only the checkout and the admin show them, so the subscription
 * starts with `wantPickupPoints` (from the cart on, to be ready by the checkout) and stays for the visit; until the
 * database answers the browser's copy is shown, and `pickupPointsLoaded` tells «not added» from «not read yet».
 */
export function useStorefrontData(wantPromos: boolean, wantPickupPoints: boolean) {
  // Catalog, promos and banners come only from Firestore (Admin panel); no demo data meanwhile
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [promosLoaded, setPromosLoaded] = useState(false);
  const [promosRequested, setPromosRequested] = useState(false);
  // The promos subscription ended with an error (finding 15): a code waiting for them is not «checked» forever, and the
  // next request subscribes again (a failed subscription does not come back by itself)
  const [promosFailed, setPromosFailed] = useState(false);
  const [promosAttempt, setPromosAttempt] = useState(0);
  const promosFailedRef = React.useRef(false);
  const readPromos = wantPromos || promosRequested;
  const [bannerSlides, setBannerSlides] = useState<BannerSlide[]>(loadCachedBanners);
  // false while the banners are the browser's copy: the admin's session moves pictures only from the database's
  const [bannersLoaded, setBannersLoaded] = useState(false);
  // When true, orders are placed and validated by the placeOrder Cloud Function
  const [serverOrdersEnabled, setServerOrdersEnabled] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState<StorefrontSettings>(loadStorefrontSettings);
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>(loadLocalDeliveryMethods);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>(loadLocalPickupPoints);
  const [pickupPointsRequested, setPickupPointsRequested] = useState(false);
  const [pickupPointsLoaded, setPickupPointsLoaded] = useState(false);
  const readPickupPoints = wantPickupPoints || pickupPointsRequested;

  React.useEffect(() => {
    if (wantPickupPoints) setPickupPointsRequested(true);
  }, [wantPickupPoints]);

  React.useEffect(() => {
    if (!readPickupPoints) return;
    return subscribeToPickupPoints((loadedPoints) => {
      setPickupPoints(loadedPoints);
      setPickupPointsLoaded(true);
      saveLocalPickupPoints(loadedPoints);
    });
  }, [readPickupPoints]);

  // Sync storefront settings on custom update event
  React.useEffect(() => {
    const handleStorefrontUpdate = () => {
      setStorefrontSettings(loadStorefrontSettings());
    };
    window.addEventListener('manstyle_storefront_settings_updated', handleStorefrontUpdate);
    return () => window.removeEventListener('manstyle_storefront_settings_updated', handleStorefrontUpdate);
  }, []);

  React.useEffect(() => {
    if (wantPromos) setPromosRequested(true);
  }, [wantPromos]);

  React.useEffect(() => {
    if (!readPromos) return;
    return subscribeToPromos(
      (loadedPromos) => {
        if (loadedPromos) {
          setPromos(loadedPromos);
          setPromosLoaded(true);
        }
      },
      () => {
        promosFailedRef.current = true;
        setPromosFailed(true);
      }
    );
  }, [readPromos, promosAttempt]);

  const requestPromos = React.useCallback(() => {
    setPromosRequested(true);
    if (!promosFailedRef.current) return;
    promosFailedRef.current = false;
    setPromosFailed(false);
    setPromosAttempt((n) => n + 1);
  }, []);

  React.useEffect(() => {
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
      setBannersLoaded(true);
      try {
        localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(loadedBanners));
      } catch {}
    });

    const unsubDelivery = subscribeToDeliveryMethods((loadedMethods) => {
      setDeliveryMethods(loadedMethods);
      saveLocalDeliveryMethods(loadedMethods);
    });

    return () => {
      unsubSettings();
      unsubServerConfig();
      unsubBanners();
      unsubDelivery();
    };
  }, []);

  return {
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
    setPickupPoints,
  };
}
