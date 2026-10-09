import React from 'react';
import type { BannerSlide, CartItem, DeliveryMethod, Order, PickupPoint, Product, PromoCode, StorefrontSettings } from '../types';
import type { LegalDocId } from '../utils/legalDocs';
import { saveLocalDeliveryMethods, saveLocalPickupPoints } from '../data/deliveryData';
import { saveStorefrontSettings } from '../utils/inventory';
import { hasHeavyPhotos, removedProductPhotoIds } from '../utils/productPhotos';
import { hasInlineBannerImage } from '../utils/bannerImages';
import { hasInlinePreviews } from '../utils/productPreviews';
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
  saveExchangeRates,
  updateProductPrices,
  type ProductCostEntry,
} from '../utils/firebaseSync';
import { samePurchase, type ExchangeRates } from '../utils/currencyPricing';
import { BANNERS_STORAGE_KEY } from './useStorefrontData';
import type { AddToast, Persist } from './useToasts';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

type AdminActionOptions = {
  isAdmin: boolean;
  products: Product[];
  setProducts: SetState<Product[]>;
  productsLoaded: boolean;
  /** The full catalog is loaded (not index lines): «Применить» of the rates waits for it */
  fullCatalog: boolean;
  productCosts: Record<string, ProductCostEntry>;
  setProductCosts: SetState<Record<string, ProductCostEntry>>;
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
  fullCatalog,
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
            const entry = productCosts[p.id];
            if (!entry) return p;
            const cost = entry.costPrice ?? p.costPrice;
            return cost === p.costPrice && samePurchase(entry.purchase, p.purchase)
              ? p
              : { ...p, costPrice: cost, purchase: entry.purchase };
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
  // product_photos (stage 6 of the audit 02.10, finding 18) and the previews to product_previews (stage 6 of
  // docs/catalog-scale-plan.md). Once per session, product by product; a product just saved from the form (previews in
  // place, `previewKey` set) is already stored without them
  const photosMovedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAdmin || !productsLoaded || photosMovedRef.current) return;
    const heavy = products.filter((p) => hasHeavyPhotos(p) || (hasInlinePreviews(p) && !p.previewKey));
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
    // Right after sign-in the admin may still hold index lines (no photos, texts or composition): a product written from
    // one would lose them (admin audit 09.10, finding 4)
    if (!fullCatalog) {
      addToast('Каталог ещё загружается: подождите несколько секунд и сохраните снова', 'info');
      return Promise.resolve(false);
    }
    const changed = changedItems(adminProducts, updatedWithCosts);
    const kept = new Set(updatedWithCosts.map((p) => p.id));
    const costChanges: ({ id: string } & ProductCostEntry)[] = [
      ...changed
        .filter((p) => p.costPrice !== productCosts[p.id]?.costPrice || !samePurchase(p.purchase, productCosts[p.id]?.purchase))
        .map((p) => ({ id: p.id, costPrice: p.costPrice, purchase: p.purchase })),
      ...Object.keys(productCosts).filter((id) => !kept.has(id)).map((id) => ({ id })),
    ];
    const saved = persist(
      'товары',
      deleteRemovedDocs('products', adminProducts, updatedWithCosts),
      deleteRemovedDocs('product_previews', adminProducts, updatedWithCosts),
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
      for (const { id, costPrice, purchase } of costChanges) {
        if (typeof costPrice === 'number' || purchase) next[id] = { costPrice, purchase };
        else delete next[id];
      }
      return next;
    });
    // Cost and purchase stay in the admin panel: products in the cart and in orders go without them
    const updatedProds = updatedWithCosts.map(({ costPrice: _cost, purchase: _purchase, ...p }) => p);
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

  /**
   * «Курсы и наценка» → «Применить»: the new prices (price field only), the costs of those products, then the rates —
   * the rates last, so «Последний раз применено» never shows over old prices. Nothing is removed. Refused until
   * the full catalog is loaded: right after sign-in the admin may still hold index lines or no products at all.
   */
  const handleApplyExchangeRates = (rates: ExchangeRates, repriced: Product[]) => {
    if (!fullCatalog) {
      addToast('Каталог ещё загружается: подождите несколько секунд и нажмите «Применить» снова', 'info');
      return Promise.resolve(false);
    }
    const known = new Set(adminProducts.map((p) => p.id));
    const changed = repriced.filter((p) => known.has(p.id) && p.purchase);
    const saved = persist(
      'курсы и цены',
      (async () => {
        await updateProductPrices(
          changed.map((p) => ({ id: p.id, price: p.price, originalPrice: p.originalPrice, discountPercent: p.discountPercent }))
        );
        await saveProductCosts(changed.map((p) => ({ id: p.id, costPrice: p.costPrice, purchase: p.purchase })));
        await saveExchangeRates(rates);
      })()
    );
    void saved.then((ok) => {
      if (!ok || changed.length === 0) return;
      const byId = new Map(changed.map((p) => [p.id, p]));
      setProductCosts((prev) => {
        const next = { ...prev };
        for (const p of changed) next[p.id] = { costPrice: p.costPrice, purchase: p.purchase };
        return next;
      });
      setProducts((prev) =>
        prev.map((p) => {
          const next = byId.get(p.id);
          if (!next) return p;
          const { originalPrice: _old, discountPercent: _percent, ...rest } = p;
          return {
            ...rest,
            price: next.price,
            ...(typeof next.originalPrice === 'number' ? { originalPrice: next.originalPrice } : {}),
            ...(typeof next.discountPercent === 'number' ? { discountPercent: next.discountPercent } : {}),
          };
        })
      );
    });
    return saved;
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
    handleApplyExchangeRates,
  };
}
