import React from 'react';
import type { BannerSlide, CartItem, DeliveryMethod, Order, PickupPoint, Product, PromoCode, StorefrontSettings } from '../types';
import type { LegalDocId } from '../utils/legalDocs';
import { saveLocalDeliveryMethods, saveLocalPickupPoints } from '../data/deliveryData';
import { saveStorefrontSettings } from '../utils/inventory';
import { hasHeavyPhotos, removedProductPhotoIds } from '../utils/productPhotos';
import { hasInlineBannerImage } from '../utils/bannerImages';
import { pluralRu } from '../utils/pluralize';
import {
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
  syncAllBannersToFirestore,
  syncAllDeliveryMethodsToFirestore,
  syncAllPickupPointsToFirestore,
} from '../utils/firebaseSync';
import { BANNERS_STORAGE_KEY } from './useStorefrontData';
import type { AddToast, Persist } from './useToasts';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

type AdminActionOptions = {
  isAdmin: boolean;
  products: Product[];
  setProducts: SetState<Product[]>;
  productsLoaded: boolean;
  productCosts: Record<string, number>;
  setProductCosts: SetState<Record<string, number>>;
  selectedProduct: Product | null;
  setSelectedProduct: SetState<Product | null>;
  setCartItems: SetState<CartItem[]>;
  orders: Order[];
  setOrders: SetState<Order[]>;
  promos: PromoCode[];
  setPromos: SetState<PromoCode[]>;
  bannerSlides: BannerSlide[];
  /** The banners came from the database (not only the browser's copy) */
  bannersLoaded: boolean;
  setBannerSlides: SetState<BannerSlide[]>;
  deliveryMethods: DeliveryMethod[];
  setDeliveryMethods: SetState<DeliveryMethod[]>;
  pickupPoints: PickupPoint[];
  setPickupPoints: SetState<PickupPoint[]>;
  setStorefrontSettings: SetState<StorefrontSettings>;
  persist: Persist;
  addToast: AddToast;
};

/**
 * The admin panel's writes (products with cost prices, orders, promos, banners, delivery, «Витрина», documents)
 * and the admin session's moves of old data out of products. Each write goes through `persist`: «Сохранено» only
 * after the database answered.
 */
export function useAdminActions({
  isAdmin,
  products,
  setProducts,
  productsLoaded,
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
}: AdminActionOptions) {
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

  // Pictures still inside banners (every visitor downloaded them on any screen): the admin's session moves them to
  // banner_images (docs/catalog-scale-plan.md, stage 5). Checked once, on the banners from the database
  const bannersCheckedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAdmin || !bannersLoaded || bannersCheckedRef.current) return;
    bannersCheckedRef.current = true;
    if (bannerSlides.some(hasInlineBannerImage)) void persist('картинки баннеров', syncAllBannersToFirestore(bannerSlides));
  }, [isAdmin, bannersLoaded, bannerSlides]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdateBannerSlides = (newBanners: BannerSlide[]) => {
    const removed = Promise.all([
      deleteRemovedDocs('banners', bannerSlides, newBanners),
      deleteRemovedDocs('banner_images', bannerSlides, newBanners),
    ]).then(() => undefined);
    setBannerSlides(newBanners);
    try {
      localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(newBanners));
    } catch {}
    return persist('баннеры', removed, syncAllBannersToFirestore(newBanners));
  };

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

  const handleUpdateProducts = (updatedWithCosts: Product[]) => {
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
  };

  const handleUpdateOrders = (updatedOrders: Order[]) => {
    setOrders(updatedOrders);
    return persist('заказы', syncAllOrdersToFirestore(changedItems(orders, updatedOrders)));
  };

  const handleUpdatePromos = (updatedPromos: PromoCode[]) => {
    const saved = persist(
      'промокоды',
      deleteRemovedDocs('promos', promos, updatedPromos),
      syncAllPromosToFirestore(changedItems(promos, updatedPromos))
    );
    setPromos(updatedPromos);
    // «Промокоды» say «создан/обновлен» and close the form only after the database answered (UX audit 03.10, finding 5)
    return saved;
  };

  const handleUpdateStorefrontSettings = (upd: StorefrontSettings) => {
    setStorefrontSettings(upd);
    saveStorefrontSettings(upd);
    return persist('настройки витрины', saveStorefrontSettingsToFirestore(upd));
  };

  const handleSaveLegalText = (id: LegalDocId, text: string | null) => persist('документ', saveLegalText(id, text));

  return {
    adminProducts,
    handleUpdateProducts,
    handleUpdateOrders,
    handleUpdatePromos,
    handleUpdateBannerSlides,
    handleUpdateDeliveryMethods,
    handleUpdatePickupPoints,
    handleUpdateStorefrontSettings,
    handleSaveLegalText,
  };
}
