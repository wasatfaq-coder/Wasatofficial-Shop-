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
  applyExchangeRateChanges,
  savePriceChanges,
  type ProductCostEntry,
} from '../utils/firebaseSync';
import { auth } from '../firebase';
import { priceChangeEntries } from '../utils/priceChanges';
import { samePurchase, type ExchangeRates } from '../utils/currencyPricing';
import { withPriceChange, withPriceHistories } from '../utils/priceHistory';
import { BANNERS_STORAGE_KEY } from './useStorefrontData';
import type { AddToast, Persist } from './useToasts';
import type { WaitForCatalogIndex } from './useCatalogIndexSync';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

/** Who changed the prices, for the price journal: the admin's Google account */
const adminOperator = () => auth.currentUser?.email || auth.currentUser?.uid || 'Администратор';

type AdminActionOptions = {
  isAdmin: boolean;
  products: Product[];
  setProducts: SetState<Product[]>;
  productsLoaded: boolean;
  /** The full catalog is loaded (not index lines): «Применить» of the rates waits for it */
  fullCatalog: boolean;
  /** Resolves once customers' catalog index has the products as they are now (`useCatalogIndexSync`) */
  waitForCatalogIndex: WaitForCatalogIndex;
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

  const handleUpdateProducts = (edited: Product[]) => {
    // Right after sign-in the admin may still hold index lines (no photos, texts or composition): a product written from
    // one would lose them (admin audit 09.10, finding 4)
    if (!fullCatalog) {
      addToast('Каталог ещё загружается: подождите несколько секунд и сохраните снова', 'info');
      return Promise.resolve(false);
    }
    // a changed price keeps the old one: unpaid orders are checked against the price of their time (finding 1)
    const updatedWithCosts = withPriceHistories(adminProducts, edited);
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
      syncAllProductsToFirestore(changed, adminProducts),
      saveProductCosts(costChanges)
    );
    // the price journal (admin audit 09.10, finding 11): written once the prices are saved, its failure only logged —
    // the products are already saved, and «Не сохранено» would make the owner save them again
    const journal = priceChangeEntries(adminProducts, changed, { operator: adminOperator() });
    if (journal.length > 0) {
      void saved.then((ok) => ok && savePriceChanges(journal).catch((err) => console.error('Price journal entries were not written:', err)));
    }
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

  // Orders this session wrote, with the version it changed. A flow that saves twice before the next render (a cancel,
  // then its promo release) builds the second change on the first: that change is compared with what was written,
  // not with the list before it. A newer render (a snapshot) has its own version and is compared with that, so data
  // the database got meanwhile is never written back (admin audit 09.10, finding 7).
  const writtenOrdersRef = React.useRef(new Map<string, { from: Order; to: Order }>());

  const handleUpdateOrders = async (updatedOrders: Order[]) => {
    const shown = new Map(orders.map((o) => [o.id, o]));
    const baseOf = (id: string) => {
      const written = writtenOrdersRef.current.get(id);
      const current = shown.get(id);
      return written && written.from === current ? written.to : current;
    };
    const changed = updatedOrders.filter((o) => o !== baseOf(o.id) && o !== shown.get(o.id));
    const seen = changed.flatMap((o) => {
      const base = baseOf(o.id);
      return base ? [base] : [];
    });
    // only the changed orders on screen: the caller's list may be older than a snapshot that arrived meanwhile
    // (a deleted order — one the caller's render had and the list has not — goes away)
    const changedById = new Map(changed.map((o) => [o.id, o]));
    const kept = new Set(updatedOrders.map((o) => o.id));
    setOrders((prev) => {
      const known = new Set(prev.map((o) => o.id));
      const rest = prev.filter((o) => kept.has(o.id) || !shown.has(o.id)).map((o) => changedById.get(o.id) ?? o);
      return [...changed.filter((o) => !known.has(o.id)), ...rest];
    });
    let changedMeanwhile: Order[] = [];
    const saved = await persist(
      'заказы',
      syncAllOrdersToFirestore(changed, seen).then((conflicts) => {
        changedMeanwhile = conflicts;
      })
    );
    if (saved && changedMeanwhile.length === 0) {
      for (const o of changed) {
        const current = shown.get(o.id);
        if (current) writtenOrdersRef.current.set(o.id, { from: current, to: o });
      }
    }
    if (!saved || changedMeanwhile.length === 0) return saved;
    // the buyer cancelled, paid or confirmed receipt meanwhile: their version stays, the admin sees it and decides again
    const fresh = new Map(changedMeanwhile.map((o) => [o.id, o]));
    setOrders((prev) => prev.map((o) => fresh.get(o.id) ?? o));
    const ids = changedMeanwhile.map((o) => `№ ${o.id}`).join(', ');
    addToast(`Не сохранено: заказ ${ids} изменил покупатель, пока вы его правили. Проверьте заказ и повторите`, 'error');
    return false;
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
    const byIdNow = new Map(adminProducts.map((p) => [p.id, p]));
    const now = new Date();
    const changed = repriced
      .filter((p) => byIdNow.has(p.id) && p.purchase)
      .map((p) => ({ ...p, priceHistory: withPriceChange(byIdNow.get(p.id)!, p.price, now) }));
    const saved = persist(
      'курсы и цены',
      applyExchangeRateChanges(
        changed.map((p) => ({
          id: p.id,
          price: p.price,
          originalPrice: p.originalPrice,
          discountPercent: p.discountPercent,
          priceHistory: p.priceHistory,
        })),
        changed.map((p) => ({ id: p.id, costPrice: p.costPrice, purchase: p.purchase })),
        rates
      )
    );
    // the price journal after the prices, like any product save: its failure is only logged
    const journal = priceChangeEntries(adminProducts, changed, { operator: adminOperator(), rates, now });
    if (journal.length > 0) {
      void saved.then((ok) => ok && savePriceChanges(journal).catch((err) => console.error('Price journal entries were not written:', err)));
    }
    const applied = saved.then((ok) => {
      if (!ok || changed.length === 0) return ok;
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
            ...(next.priceHistory ? { priceHistory: next.priceHistory } : {}),
            ...(typeof next.originalPrice === 'number' ? { originalPrice: next.originalPrice } : {}),
            ...(typeof next.discountPercent === 'number' ? { discountPercent: next.discountPercent } : {}),
          };
        })
      );
      // «Курсы применены» only once customers' catalog has the new prices (admin audit 09.10, finding 10)
      return waitForCatalogIndex().then((synced) => {
        if (!synced) {
          addToast('Каталог покупателей ещё обновляется: не закрывайте админку минуту', 'info');
        }
        return true;
      });
    });
    return applied;
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
