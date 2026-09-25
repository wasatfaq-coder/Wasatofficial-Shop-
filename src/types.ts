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
}

export interface Product {
  id: string;
  title: string;
  category: string; // 'shirts' | 'tshirts' | 'jackets' | 'trousers' | 'sweatshirts' | 'suits' | 'linen' | 'accessories';
  categoryLabel: string;
  price: number;
  costPrice?: number; // Себестоимость для расчета маржинальности
  originalPrice?: number;
  badge?: string;
  description: string;
  material: string;
  fabricComposition?: FabricCompositionItem[];
  fabricDensity?: string; // e.g. "185 г/м²"
  careInstructions?: CareInstructionItem[];
  images: string[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  inStock: boolean;
  skus?: ProductSKU[]; // Breakdown per size and color
  isPopular?: boolean;
  isNew?: boolean;
  rating: number;
  reviewsCount: number;
  fit?: 'slim' | 'regular' | 'oversize';
  reviews?: ProductReview[];
}

export interface CartItem {
  id: string; // unique item cart id
  product: Product;
  selectedColor: string;
  selectedSize: string;
  quantity: number;
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
  isDefault?: boolean;
}

export interface SavedCard {
  id: string;
  bankName: string; // e.g. "Т-Банк", "Сбербанк", "Альфа-Банк"
  cardNumber: string; // e.g. "•••• 4821"
  cardHolder: string;
  expiryDate: string; // e.g. "08/28"
  cardType: 'mir' | 'visa' | 'mastercard';
  isDefault?: boolean;
}

export interface UserProfile {
  name: string;
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
  savedCards: SavedCard[];
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
  totalSpent: number;
  ordersCount: number;
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
  paymentStatus?: 'pending' | 'paid' | 'paid_on_delivery' | 'refunded';
  trackingCompany?: 'cdek' | 'pochta' | 'boxberry' | 'yandex' | 'dhl' | 'other';
  trackingNumber?: string;
  estimatedDelivery?: string;
  historySteps?: OrderStatusHistoryStep[];
  deliveryStages?: DeliveryStage[];
  managerNote?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerUid?: string; // Firebase Auth uid of the customer (absent for guest orders)
}

export type ActiveTab = 'home' | 'catalog' | 'cart' | 'favorites' | 'profile' | 'product-detail' | 'checkout' | 'order-success';

export interface FilterState {
  category: string;
  minPrice: number;
  maxPrice: number;
  sortBy: 'popular' | 'price-asc' | 'price-desc' | 'newest';
  searchQuery: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountPercent: number; // For backward compatibility
  discountType?: 'percent' | 'fixed'; // 'percent' (-15%) or 'fixed' (-500 ₽)
  discountValue?: number; // Numeric value: 15 for 15% or 500 for 500 ₽
  title: string;
  description: string;
  minOrderAmount?: number;
  expiresAt?: string; // e.g. "31 августа 2026 г." or "2026-08-31"
  usageLimit?: number;
  usedCount: number;
  applicableCategories?: string[]; // category IDs or empty for all
  applicableProductIds?: string[]; // product IDs or empty for all
  active: boolean;
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
  actionKey?: 'size_calc' | 'catalog' | 'orders';
  unreadByAdmin?: boolean;
  imageUrl?: string; // Photo attachment (e.g., return item defect, tag, size check)
  fileName?: string;
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

export interface CustomerThread {
  id: string;
  customerName: string;
  customerAvatar?: string;
  customerPhone?: string;
  customerEmail?: string;
  orderNumber?: string;
  status: 'waiting' | 'in_progress' | 'resolved' | 'closed';
  priority: 'standard' | 'urgent' | 'vip';
  lastActivity: string;
  unreadCount: number;
  followUpReminder?: {
    dueDate: string;
    note: string;
    completed?: boolean;
  };
  csatRating?: number; // 1-5 stars
  activeOrderId?: string;
  tags?: string[];
  messages: ChatMessage[];
}

export interface AppliedPromoInfo {
  code: string;
  discountPercent?: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  isReferral?: boolean;
  partnerName?: string;
  partnerCommissionPercent?: number;
}

export interface StockMovementLog {
  id: string;
  date: string;
  type: 'receipt' | 'writeoff' | 'inventory' | 'order' | 'return';
  productId: string;
  productTitle: string;
  skuCode: string;
  color: string;
  size: string;
  changeQuantity: number; // positive for receipt, negative for writeoff
  previousStock: number;
  newStock: number;
  reason: string;
  operator: string;
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
  workingHours: string;
  returnPeriodDays: number;
  freeDeliveryThreshold?: number;
  courierDeliveryPrice?: number; // Cost for courier delivery when subtotal < freeDeliveryThreshold (default: 350)
  pickupDeliveryPrice?: number;  // Cost for pickup point delivery (default: 0 or custom)
  postDeliveryPrice?: number;    // Cost for Russian Post delivery (default: 350)
  isStoreOnline: boolean;
  isExpressEnabled: boolean;
  isAutoDiscount: boolean;
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
}

export interface AdminCredentials {
  username: string;
  password: string;
  updatedAt?: string;
  lastChangedBy?: string;
}

