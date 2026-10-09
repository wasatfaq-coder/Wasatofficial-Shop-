import type { AddressParts } from './shared/personName';
import type { DeliveryKind, OrderStatusLogEntry } from './shared/orderFlow';
import type { ProductPurchase } from './utils/currencyPricing';
export interface BodyMeasurements {
  height: number;
  weight: number;
  chest: number;
  waist: number;
  hips: number;
  fitPreference?: 'tight' | 'regular' | 'loose';
  preferredSize?: string;
  russianSizeTop?: string;
  russianSizeBottom?: string;
  heightGroup?: string;
  bodyType?: string;
}

export interface ProductSKU {
  id: string; // unique SKU identifier, e.g. "bomber-jacket-03-blue-L"
  color: string; // e.g. "Синий" or "Темно-синий"
  size: string; // e.g. "L" or "M"
  stock: number; // exact stock count (0 = out of stock)
  skuCode?: string; // e.g. "MS-JK03-BLU-L"
  barcode?: string; // e.g. "4607182930123"
}

export interface FabricCompositionItem {
  fiber: string;
  percentage: number;
}

export interface CareInstructionItem {
  icon: 'wash' | 'bleach' | 'dry' | 'iron' | 'clean';
  label: string;
  desc: string;
}

/** A highlight card under the product description, e.g. «Эко-материал — 100% лен» */
export interface ProductFeature {
  title: string;
  text?: string;
}

/** A characteristic row in «Состав и ткань», e.g. «Застежка — молния YKK» */
export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductReview {
  id: string;
  authorName: string;
  rating: number; // 1 to 5
  date: string; // e.g. "14 сентября 2026"
  comment: string;
  sizePurchased?: string;
  colorPurchased?: string;
  verifiedPurchase?: boolean;
  pros?: string;
  cons?: string;
  helpfulCount?: number;
  /** Author's uid: reviews from the `reviews` collection (one per customer and product) */
  uid?: string;
  productId?: string;
  createdAt?: string;
  /** Loaded from the `reviews` collection and merged in; never stored inside the product */
  fromCollection?: boolean;
  /** Who marked the review «Полезно» (from `review_votes`) */
  voterUids?: string[];
}

/** A document of the `reviews` collection: id = `${productId}_${uid}` */
export interface StoredReview {
  id: string;
  productId: string;
  uid: string;
  authorName: string;
  rating: number;
  comment: string;
  pros?: string;
  cons?: string;
  sizePurchased?: string;
  colorPurchased?: string;
  date: string;
  createdAt: string;
}

/** A document of the `review_votes` collection: id = `${reviewId}_${uid}` */
export interface ReviewVote {
  reviewId: string;
  productId: string;
  uid: string;
}

export interface Product {
  id: string;
  title: string;
  category: string; // 'shirts' | 'tshirts' | 'jackets' | 'trousers' | 'sweatshirts' | 'suits' | 'linen' | 'accessories';
  categoryLabel: string;
  price: number;
  costPrice?: number; // Себестоимость для расчета маржинальности
  /**
   * Purchase in dollars or yuan (`product_costs/{id}.purchase`, admin only, like costPrice): «Курсы и наценка»
   * recalculates price and costPrice from it (src/utils/currencyPricing.ts). Never stored in the product
   */
  purchase?: ProductPurchase;
  originalPrice?: number;
  badge?: string;
  description: string;
  material: string;
  fabricComposition?: FabricCompositionItem[];
  fabricDensity?: string; // e.g. "185 г/м²"
  careInstructions?: CareInstructionItem[];
  /** Card sections edited in Admin → product → «Структура карточки»; an empty one is not shown */
  features?: ProductFeature[];
  specs?: ProductSpec[];
  weave?: string;
  countryOfOrigin?: string;
  certifications?: string[];
  /** Previews for cards and lists (or links); full photos are `product_photos/{photoIds[i]}` (stage 6, productPhotos.ts) */
  images: string[];
  /** Id of the full photo of images[i] in `product_photos`; '' — a link or a light photo kept in the product */
  photoIds?: string[];
  /** The data: previews of `images` are in `product_previews/{id}` ('' here in their place): a hash of them (stage 6) */
  previewKey?: string;
  colors: { name: string; hex: string }[];
  sizes: string[];
  /** «Есть в наличии»: false when sold out (or, in old products without hiddenFromSale, taken off sale with stock left) */
  inStock: boolean;
  /**
   * «Снят с витрины» — the admin's switch, apart from «sold out» (owner's decision 02.10, finding 12): with preorders on,
   * a sold-out product taken off sale used to be preordered. Old products without the field: inStock false with stock left
   */
  hiddenFromSale?: boolean;
  skus?: ProductSKU[]; // Breakdown per size and color
  isPopular?: boolean;
  isNew?: boolean;
  rating: number;
  reviewsCount: number;
  fit?: 'slim' | 'regular' | 'oversize';
  reviews?: ProductReview[];
  /**
   * Rating from the catalog index while the product's reviews are not read (docs/catalog-scale-plan.md, stage 4):
   * null — no reviews. Only in the browser, never stored
   */
  catalogRating?: { rating: number; count: number } | null;
}

export interface CartItem {
  id: string; // unique item cart id
  product: Product;
  selectedColor: string;
  selectedSize: string;
  quantity: number;
  /** Ordered while out of stock in preorder mode: not deducted from (or returned to) stock */
  isPreorder?: boolean;
}

export interface SavedAddress {
  id: string;
  title: string; // e.g. "Дом", "Работа", "Дача"
  city: string;
  street: string;
  house?: string; // Номер дома
  building?: string; // Корпус / строение
  entrance?: string; // Подъезд
  floor?: string; // Этаж
  apartment?: string; // Квартира / офис
  intercom?: string; // Код домофона
  postalCode?: string;
  /** Страна / регион (для Почты России и ТК) */
  region?: string;
  /** Комментарий курьеру */
  comment?: string;
  isDefault?: boolean;
}

export interface UserProfile {
  /** «Фамилия Имя Отчество» одной строкой — из частей ниже (fullName в src/shared/personName.ts) */
  name: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  email: string;
  phone: string;
  avatar: string;
  address: {
    street: string;
    city: string;
    postalCode: string;
    house?: string;
    building?: string;
    entrance?: string;
    floor?: string;
    apartment?: string;
    intercom?: string;
  };
  savedAddresses: SavedAddress[];
  notificationsEnabled: boolean;
  bodyMeasurements?: BodyMeasurements;
  bonusPoints?: number;
  uid?: string;
  updatedAt?: string;
  createdAt?: string;
  lastActive?: string;
  managerNotes?: string;
  tags?: string[];
}

export interface CustomerRecord {
  id: string; // uid or normalized email/phone
  uid?: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  isRegisteredUser: boolean;
  registeredAt?: string;
  lastActiveAt?: string;
  bonusPoints: number;
  /** Paid money only (orderRevenue): «Сумма покупок» (owner's decision 02.10, finding 29) */
  totalSpent: number;
  ordersCount: number;
  /** Paid orders: «Постоянный покупатель» from 2 */
  paidOrdersCount: number;
  completedOrdersCount: number;
  averageOrderValue: number;
  orders: Order[];
  savedAddresses: SavedAddress[];
  primaryAddress?: string;
  bodyMeasurements?: BodyMeasurements;
  managerNotes?: string;
  tags: string[];
}

export interface DeliveryMethod {
  id: string;
  title: string;
  duration: string;
  price: number;
  icon: string;
  description?: string;
  type?: 'courier' | 'pickup' | 'post' | 'express' | 'custom';
  freeThreshold?: number;
  isActive?: boolean;
  sortOrder?: number;
  highlightBadge?: string;
  minOrderAmount?: number;
}

export interface PickupPoint {
  id: string;
  name: string;
  city: string;
  address: string;
  metro?: string;
  schedule: string;
  phone: string;
  note?: string;
  isActive: boolean;
  isDefault?: boolean;
}

export interface OrderStatusHistoryStep {
  title: string;
  date: string;
  completed: boolean;
  description?: string;
}

export interface DeliveryStage {
  id: string;
  title: string;
  desc: string;
  status: 'completed' | 'active' | 'pending';
  time: string;
}

export interface OrderAdjustmentLog {
  id: string;
  date: string;
  reason: string;
  previousTotal: number;
  newTotal: number;
  refundAmount?: number;
  additionalCharge?: number;
  note?: string;
  changedItemsSummary: string;
}

/** Ways to pay by requisites («Доработки 5»): СБП, card transfer, bank account */
export type PaymentKind = 'sbp' | 'card' | 'account';

export interface SbpRequisites {
  phone: string;
  bank: string;
  holder: string;
}
export interface CardRequisites {
  cardNumber: string;
  bank: string;
  holder: string;
}
export interface AccountRequisites {
  /** Organisation or «ИП Фамилия И. О.» */
  orgName: string;
  account: string;
  inn: string;
  kpp?: string;
  bik: string;
  corrAccount: string;
  bank?: string;
}
export interface PaymentRequisitesByKind {
  sbp: SbpRequisites;
  card: CardRequisites;
  account: AccountRequisites;
}
/** Requisites of one order: only the ways the admin filled */
export type OrderPaymentDetails = { [K in PaymentKind]?: PaymentRequisitesByKind[K] };

/** A named set of requisites («Сбербанк — ИП Иванов»): `payment_templates/{id}`, admin only */
export type PaymentTemplate = {
  [K in PaymentKind]: { id: string; name: string; kind: K; fields: PaymentRequisitesByKind[K]; updatedAt?: string };
}[PaymentKind];

export interface PaymentLogEntry {
  event: 'receipt' | 'confirmed' | 'rejected';
  /** ISO time */
  at: string;
  by: 'customer' | 'admin';
  byUid?: string;
  note?: string;
}

export interface Order {
  id: string;
  date: string;
  items: CartItem[];
  status: 'accepted' | 'assembling' | 'in_transit' | 'ready' | 'delivered';
  totalPrice: number;
  originalTotalPrice?: number;
  isAdjusted?: boolean;
  refundAmount?: number;
  adjustmentReason?: string;
  adjustmentLogs?: OrderAdjustmentLog[];
  deliveryAddress: string;
  deliveryMethod: string;
  paymentMethod?: string;
  /** «Чек на проверке» (receipt_review): the buyer sent a photo of the receipt, the admin checks it («Доработки 5») */
  paymentStatus?: 'pending' | 'receipt_review' | 'paid' | 'paid_on_delivery' | 'refunded';
  /** Requisites the admin applied to this order (`src/utils/paymentDetails.ts`): the buyer sees only filled ones */
  paymentDetails?: OrderPaymentDetails;
  /** The buyer's «Оплачено»: the way paid, the time and the chat message with the receipt photo */
  paymentReceipt?: { method: PaymentKind; at: string; messageId: string };
  /** «Отклонить чек»: the reason the buyer sees until a new receipt */
  paymentRejectReason?: string;
  /** Receipt sent, confirmed, rejected — with time and who («Доработки 5») */
  paymentLog?: PaymentLogEntry[];
  trackingCompany?: 'cdek' | 'pochta' | 'boxberry' | 'yandex' | 'dhl' | 'other';
  trackingNumber?: string;
  estimatedDelivery?: string;
  historySteps?: OrderStatusHistoryStep[];
  deliveryStages?: DeliveryStage[];
  managerNote?: string;
  isCancelled?: boolean;
  /** One of the reasons in `src/utils/orderCancel.ts` (older orders: free text) */
  cancelReason?: string;
  /** The buyer's or the admin's words to the reason */
  cancelComment?: string;
  /** ISO time of the cancellation (older orders: display text) */
  cancelledAt?: string;
  /** Who cancelled: the buyer in the profile or the store in «Заказы» */
  cancelledBy?: 'customer' | 'admin';
  /**
   * The buyer's cancellation returned every line to stock. False while it has not (a write failed, or the order
   * is older than the stock journal): «Заказы» then offers «Вернуть на склад».
   */
  stockReturned?: boolean;
  /**
   * The promo code use of a cancelled order went back to the code (`usedCount` − 1, `promo_uses/{заказ}` removed by the
   * admin's session, audit 07.10, finding 6): a one-time code is usable again
   */
  promoReleased?: boolean;
  /** «Архив» in «Заказы»: true — moved by the admin, false — taken back (a cancelled order goes there by itself) */
  archived?: boolean;
  /** Delivery kind at order time: its chain of statuses (`src/shared/orderFlow.ts`); older orders — by the method's name */
  deliveryKind?: DeliveryKind;
  /** Every status change with its time to the second and who made it — the order's history */
  statusLog?: OrderStatusLogEntry[];
  /** Code the buyer names to the courier or at pickup («842-190»), made by the admin's browser */
  pickupCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerUid?: string; // Firebase Auth uid of the customer (absent for guest orders)
  // Set by the placeOrder Cloud Function (server-validated orders)
  placedVia?: 'server';
  createdAt?: string; // ISO timestamp
  /**
   * Last write of the order, server time in ms (docs/orders-scale-plan.md, stage 2): every write sets it
   * (`serverTimestamp()` in firebaseSync.ts, `placeOrder`), so the admin can read only orders changed since a moment.
   * In the database it is a Timestamp; `normalizeOrderFromFirestore` turns it into ms
   */
  updatedAt?: number;
  promoCode?: string;
  discountAmount?: number;
  deliveryFee?: number;
  /** Parts of `customerName` («Фамилия Имя Отчество»): orders placed since 02.10 */
  customerLastName?: string;
  customerFirstName?: string;
  customerMiddleName?: string;
  /** Parts of `deliveryAddress` for the admin card with copy buttons; absent for pickup and older orders */
  deliveryAddressParts?: AddressParts;
}

export type ActiveTab =
  | 'home'
  | 'catalog'
  | 'cart'
  | 'favorites'
  | 'profile'
  | 'product-detail'
  | 'checkout'
  | 'order-success'
  /** legal documents (LegalDocumentScreen) */
  | 'offer'
  | 'privacy';

export interface PromoCode {
  id: string;
  code: string;
  discountPercent: number; // For backward compatibility
  discountType?: 'percent' | 'fixed'; // 'percent' (-15%) or 'fixed' (-500 ₽)
  discountValue?: number; // Numeric value: 15 for 15% or 500 for 500 ₽
  title: string;
  description: string;
  minOrderAmount?: number;
  /** Последний день действия, «2026-08-31» (по Москве, включительно); у старых кодов — текстом, см. promoExpiryDate */
  expiresAt?: string;
  usageLimit?: number;
  usedCount: number;
  applicableCategories?: string[]; // category IDs or empty for all
  applicableProductIds?: string[]; // product IDs or empty for all
  active: boolean;
  /**
   * Показывать в окне «Промокоды» у покупателя. Без поля: партнёрские, одноразовые из рассылки и из чата — нет,
   * остальные — да (`isPromoListed`)
   */
  isPublic?: boolean;
  badgeText?: string;
  isPopular?: boolean;
  // Batch code generator properties
  isBatch?: boolean;
  batchName?: string;
  // Referral & Influencer Partner tracking
  isReferral?: boolean;
  partnerName?: string; // e.g. "@alex_fashion", "Блогер Максим"
  partnerCommissionPercent?: number; // e.g. 10%
  generatedRevenue?: number; // e.g. 84 900 ₽
  commissionEarned?: number; // e.g. 8 490 ₽
}

export interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  btnText: string;
  image: string;
  mobileImage?: string; // Vertical/mobile tailored aspect ratio
  desktopImage?: string; // Widescreen desktop aspect ratio
  actionType?: 'category' | 'product' | 'promo' | 'catalog'; // Deeplink action type
  targetCategory?: string; // 'all' | 'shirts' | 'tshirts' | 'jackets' | 'trousers' | 'sweatshirts'
  targetProductId?: string; // ID of specific product to open directly
  targetPromoCode?: string; // Promo code to auto-apply on click
  active: boolean;
  badge?: string;
  // Scheduled Publishing
  scheduleEnabled?: boolean;
  startDate?: string; // ISO or "2026-08-18T00:00"
  endDate?: string; // ISO or "2026-08-31T23:59"
  /** The pictures are in `banner_images/{id}` (stage 5 of docs/catalog-scale-plan.md): a hash of them, '' fields here */
  imageKey?: string;
}

export interface ChatQuickTemplate {
  id: string;
  category: 'sizes' | 'delivery' | 'payment' | 'returns' | 'discounts' | 'general';
  categoryLabel: string;
  title: string;
  text: string;
}

export interface ProductRecommendationCard {
  productId: string;
  title: string;
  price: number;
  image: string;
  color?: string;
  size?: string;
  note?: string;
  category?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user' | 'agent' | 'admin';
  text: string;
  timestamp: string;
  /** Server time of sending, ms (Firestore `request.time`); the customer's 15-minute edit window counts from it */
  sentAt?: number;
  /** Server time of the last edit, ms */
  editedAt?: number;
  /** «Удалить у себя»: hidden in the customer's chat / on the staff side */
  hiddenForCustomer?: boolean;
  hiddenForStaff?: boolean;
  threadId?: string; // Chat identity uid of the customer this message belongs to
  threadName?: string; // Customer display name/email, shown in the admin inbox
  actionKey?: 'size_calc' | 'catalog' | 'orders';
  unreadByAdmin?: boolean;
  imageUrl?: string; // Photo attachment (e.g., return item defect, tag, size check); older messages keep it inside
  /** The photo kept apart: `chat_images/{imageId}` (= message id; stage 6, finding 20) */
  imageId?: string;
  fileName?: string;
  /** The buyer's receipt photo for this order («Доработки 5»): the admin confirms or rejects it from the chat */
  receiptOrderId?: string;
  tag?: 'return' | 'sizing' | 'delivery' | 'complaint' | 'consultation' | 'discount'; // Categorization tag
  isInternalNote?: boolean; // Staff-only internal note (hidden from customer)
  productCard?: ProductRecommendationCard; // Attached product card recommendation
  promoCard?: {
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    description: string;
    expiryDate?: string;
  };
  orderStatusUpdate?: {
    orderId: string;
    oldStatus?: string;
    newStatus: string;
    newStatusLabel: string;
    trackingNumber?: string;
  };
}

/** Admin's handling state of a customer's support dialog: `support_threads/{threadId}` (admin only) */
export interface SupportThreadMeta {
  threadId: string;
  status: 'open' | 'resolved' | 'closed';
  priority: 'normal' | 'urgent' | 'vip';
  updatedAt: number;
}

/** Customer-visible status of their dialog: `support_status/{threadId}` (admin writes, the customer reads) */
export interface SupportStatus {
  status: SupportThreadMeta['status'];
  updatedAt: number;
}

export interface AppliedPromoInfo {
  code: string;
  discountPercent?: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  applicableCategories?: string[];
  applicableProductIds?: string[];
  minOrderAmount?: number;
  isReferral?: boolean;
  partnerName?: string;
  partnerCommissionPercent?: number;
}

/** An entry of the stock journal, `stock_movements/{id}` (src/shared/stockMovements.ts) */
export interface StockMovementLog {
  id: string;
  /** When the stock changed (ISO): the journal is sorted by it */
  createdAt?: string;
  /** Display text of the date */
  date: string;
  type: 'receipt' | 'writeoff' | 'inventory' | 'order' | 'return';
  /** Order whose stock changed; a customer order writes one entry per line (`lineIndex`) */
  orderId?: string;
  lineIndex?: number;
  /** Index of the variant in `product.skus` a customer's browser took the stock from (the rules check it) */
  skuIndex?: number;
  productId: string;
  productTitle: string;
  skuCode: string;
  color: string;
  size: string;
  changeQuantity: number; // positive for receipt, negative for writeoff
  /** Stock before and after; unknown for an order entry written by the customer's browser */
  previousStock?: number;
  newStock?: number;
  reason: string;
  operator: string;
}

/** Saves storefront settings; resolves to false when the write failed (the error toast is already shown) */
export type SaveStorefrontSettings = (settings: StorefrontSettings) => Promise<boolean> | void;

/** День недели графика работы магазина (`schedule.days` в «Витрине») */
export type StoreWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Часы одного дня: время «ЧЧ:ММ» по Москве, `to` — не позже «24:00» */
export interface StoreScheduleHours {
  open: boolean;
  from: string;
  to: string;
}

/** Особый день графика: праздник или другие часы */
export interface StoreScheduleException {
  /** «ГГГГ-ММ-ДД» */
  date: string;
  closed: boolean;
  from?: string;
  to?: string;
  note?: string;
}

/** График работы магазина (docs/store-schedule-spec.md); статус для покупателя — src/utils/storeSchedule.ts */
export interface StoreSchedule {
  days: Record<StoreWeekday, StoreScheduleHours>;
  exceptions?: StoreScheduleException[];
}

export interface StorefrontSettings {
  storeName: string;
  storeSlogan?: string;
  storeBannerText?: string;
  isStoreBannerVisible?: boolean;
  bannerBadgeText?: string;
  phone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  pickupAddress: string;
  /** Комментарий к графику (раньше — весь «Режим работы» текстом); показывается под графиком */
  workingHours: string;
  /** График работы; без рабочих дней покупателю показывается только комментарий */
  schedule?: StoreSchedule;
  /** Дней на возврат; без значения покупателю срок не называется */
  returnPeriodDays?: number;
  /** Порог бесплатной доставки для способов без своего порога; без значения бесплатной доставки от суммы нет */
  freeDeliveryThreshold?: number;
  /**
   * Через сколько дней неоплаченный заказ в «Принят» отменяется с возвратом товара на склад (этап 5 без Blaze:
   * поддельный заказ не держит товар); без значения — автоотмены нет. Срабатывает в «Заказах» у администратора.
   */
  unpaidOrderCancelDays?: number;
  /** @deprecated Не используется: цена доставки — только у способа в «Доставка и ПВЗ». Поле осталось в старых документах. */
  courierDeliveryPrice?: number;
  /** @deprecated см. courierDeliveryPrice */
  pickupDeliveryPrice?: number;
  /** @deprecated см. courierDeliveryPrice */
  postDeliveryPrice?: number;
  isStoreOnline: boolean;
  isExpressEnabled: boolean;
  /** Removed from Admin → «Витрина»: never had any effect; may still be stored in Firestore */
  isAutoDiscount?: boolean;
  isPreorderMode?: boolean;
  lowStockThreshold: number;
  legalEntityName?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  bankName?: string;
  bik?: string;
  checkingAccount?: string;
  corrAccount?: string;
  legalAddress?: string;
  edo?: string;
  ceo?: string;

  // Concierge Service Settings
  conciergeDescription?: string;
  conciergeService1Title?: string;
  conciergeService1Desc?: string;
  conciergeService2Title?: string;
  conciergeService2Desc?: string;
  conciergeService3Title?: string;
  conciergeService3Desc?: string;

  // Brand Philosophy & Guarantees Settings
  brandPhilosophyTitle?: string;
  brandPhilosophyText?: string;
  brandMaterialsTitle?: string;
  brandMaterialsText?: string;
  brandCraftsmanshipTitle?: string;
  brandCraftsmanshipText?: string;
  brandGuaranteesTitle?: string;
  brandGuaranteesList?: string[];

  /** Admin → «Оплата». Checkout offers only these; none configured → ordering is disabled */
  paymentMethods?: StorePaymentMethod[];
  /** Admin → «FAQ» */
  faqItems?: StoreFaqItem[];
  /** Admin → «Склад» → label generator: label sizes of the store's printer */
  labelFormats?: LabelFormat[];
  /** Admin → «Категории»: the single list used by the storefront and the admin panel */
  categories?: StoreCategory[];
}

/** Label size for the label generator (Admin → «Склад») */
export interface LabelFormat {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export interface StorePaymentMethod {
  id: string;
  title: string;
  /** Instructions shown to the buyer when this method is selected (e.g. transfer details) */
  description?: string;
  /** Paid when the order is received: the order gets «оплата при получении» */
  onDelivery?: boolean;
  isActive?: boolean;
}

export interface StoreFaqItem {
  id: string;
  question: string;
  answer: string;
  isActive?: boolean;
}

export interface StoreCategory {
  /** Stored in product.category */
  id: string;
  name: string;
  /** Key from CATEGORY_ICONS (src/utils/categories.ts) */
  icon?: string;
}


