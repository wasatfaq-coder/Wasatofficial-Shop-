import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Gift,
  Info,
  Loader2,
  Lock,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  User,
  UserCheck,
  X,
  Bot,
} from 'lucide-react';
import type {
  ChatMessage,
  ChatQuickTemplate,
  Order,
  Product,
  ProductRecommendationCard,
  PromoCode,
  StoreCategory,
  SupportThreadMeta,
} from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { ModalPortal } from '../ModalPortal';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { copyToClipboard } from '../../utils/clipboard';
import { compressChatImageFile } from '../../utils/imageUpload';
import { ORDER_STATUS_LABELS, isTransportCompanyDelivery } from '../../utils/deliveryStages';
import { PRIORITY_LABELS, STATUS_LABELS, type SupportThreadSummary } from '../../utils/supportThreads';

/** What an admin sends into a customer's dialog */
export interface AdminChatPayload {
  text: string;
  imageUrl?: string;
  promoCard?: ChatMessage['promoCard'];
  isInternalNote?: boolean;
  productCard?: ChatMessage['productCard'];
  orderStatusUpdate?: ChatMessage['orderStatusUpdate'];
}

interface AdminSupportChatTabProps {
  thread: SupportThreadSummary;
  messages: ChatMessage[];
  meta?: SupportThreadMeta;
  onUpdateMeta: (patch: Partial<Pick<SupportThreadMeta, 'status' | 'priority'>>) => void;
  /** This customer's orders */
  orders: Order[];
  /** Every order (a status change rewrites the whole list) */
  allOrders: Order[];
  products: Product[];
  promos: PromoCode[];
  categories: StoreCategory[];
  initialOrderId?: string | null;
  onSend: (payload: AdminChatPayload) => void;
  onUpdateOrders?: (orders: Order[]) => void;
  onClear: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

// Reply templates are the admin's own, kept in this browser
const TEMPLATES_STORAGE_KEY = 'manstyle_admin_reply_templates';

const TEMPLATE_CATEGORIES: { value: ChatQuickTemplate['category']; label: string }[] = [
  { value: 'general', label: 'Общие вопросы' },
  { value: 'sizes', label: 'Размеры' },
  { value: 'delivery', label: 'Доставка' },
  { value: 'payment', label: 'Оплата' },
  { value: 'returns', label: 'Возврат и обмен' },
  { value: 'discounts', label: 'Скидки и промо' },
];

const RETURN_REASONS = [
  'Не подошел размер',
  'Не подошел фасон или цвет',
  'Брак или повреждение',
  'Пришел не тот товар',
];

const inputClass =
  'w-full min-w-0 h-10 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]';
const textareaClass =
  'w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] resize-y leading-relaxed';
const labelClass = 'text-[11px] font-bold text-[#4E5C70] block mb-1';

const newPromoCode = () => `CARE-${Math.floor(1000 + Math.random() * 9000)}`;

/** Modal shell: rendered into <body>, over the admin panel */
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => (
  <ModalPortal>
    <div
      className="fixed inset-0 z-[150] bg-[#2D3A4E]/55 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} neu-modal rounded-3xl p-4 sm:p-5 flex flex-col gap-3.5 max-h-[90dvh] animate-in zoom-in-95 fade-in duration-200`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3 shrink-0">
          <h4 className="text-sm font-black text-[#2D3A4E]">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto -mx-1 px-1 pb-1 space-y-3.5 flex-1 min-h-0">{children}</div>
      </div>
    </div>
  </ModalPortal>
);

/** Segmented control: the selected option pressed in */
function Segments<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex gap-1 p-1 neu-flat-sm rounded-xl" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-8 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
            value === o.value ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * One customer dialog in Admin → «Чат поддержки»: customer and dialog status, their order, messages
 * and the reply panel (reply or internal note, photo, product, promo code, template).
 */
export const AdminSupportChatTab: React.FC<AdminSupportChatTabProps> = ({
  thread,
  messages,
  meta,
  onUpdateMeta,
  orders,
  allOrders,
  products,
  promos,
  categories,
  initialOrderId,
  onSend,
  onUpdateOrders,
  onClear,
  onShowToast,
}) => {
  const isLegacy = thread.threadId === null;
  const status = meta?.status ?? 'open';
  const priority = meta?.priority ?? 'normal';

  // --- composer ---
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // --- dialogs ---
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // --- order context ---
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')),
    [orders]
  );
  const [orderId, setOrderId] = useState<string | null>(
    () => (initialOrderId && orders.some((o) => o.id === initialOrderId) ? initialOrderId : sortedOrders[0]?.id) ?? null
  );
  const order = orders.find((o) => o.id === orderId) ?? sortedOrders[0] ?? null;
  const [showOrderItems, setShowOrderItems] = useState(false);
  const contacts = sortedOrders.find((o) => o.customerPhone || o.customerEmail);

  // --- order status ---
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<Order['status']>('in_transit');
  const [newTracking, setNewTracking] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  // --- return ---
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnComment, setReturnComment] = useState('');

  // --- product ---
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [recommended, setRecommended] = useState<Product | null>(null);
  const [recommendColor, setRecommendColor] = useState('');
  const [recommendSize, setRecommendSize] = useState('');
  const [recommendNote, setRecommendNote] = useState('');

  // --- promo ---
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [promoType, setPromoType] = useState<'percent' | 'fixed'>('percent');
  const [promoValue, setPromoValue] = useState('');
  const [promoCode, setPromoCode] = useState(newPromoCode);
  const [promoExpiry, setPromoExpiry] = useState('');
  const [promoReason, setPromoReason] = useState('');

  // --- templates ---
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [templates, setTemplatesState] = useState<ChatQuickTemplate[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TEMPLATES_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [tplTitle, setTplTitle] = useState('');
  const [tplCategory, setTplCategory] = useState<ChatQuickTemplate['category']>('general');
  const [tplText, setTplText] = useState('');
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<ChatQuickTemplate | null>(null);
  const setTemplates = (next: ChatQuickTemplate[]) => {
    setTemplatesState(next);
    try {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: templates stay for this session
    }
  };

  const visibleMessages = showNotes ? messages : messages.filter((m) => !m.isInternalNote);
  const notesCount = messages.filter((m) => m.isInternalNote).length;

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const send = (payload: AdminChatPayload, toast?: string) => {
    if (isLegacy) return;
    onSend(payload);
    if (toast) onShowToast(toast, 'success');
  };

  const handleSendReply = () => {
    const text = replyText.trim();
    if ((!text && !photo) || isLegacy) return;
    send(
      { text, imageUrl: photo || undefined, isInternalNote },
      isInternalNote ? 'Заметка сохранена — покупатель ее не видит' : undefined
    );
    setReplyText('');
    setPhoto(null);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onShowToast('Можно прикрепить только изображение', 'error');
      return;
    }
    setIsProcessingPhoto(true);
    try {
      setPhoto(await compressChatImageFile(file));
    } catch (err) {
      console.warn('Could not compress chat image:', err);
      onShowToast('Не удалось обработать изображение', 'error');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // --- order status change ---
  const openStatusModal = () => {
    if (!order) return;
    setNewStatus(order.status);
    setNewTracking(order.trackingNumber || '');
    setNotifyCustomer(!isLegacy);
    setIsStatusModalOpen(true);
  };

  const handleSaveStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const label = ORDER_STATUS_LABELS[newStatus];
    const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
    const tracking = isTK ? newTracking.trim() || order.trackingNumber : order.trackingNumber;
    const updated: Order = {
      ...order,
      status: newStatus,
      trackingNumber: tracking,
      historySteps: [
        ...(order.historySteps || []),
        {
          title: `Статус изменен на «${label}» (служба заботы)`,
          date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          completed: true,
          description: tracking && isTK ? `Трек-номер: ${tracking}` : undefined,
        },
      ],
    };
    onUpdateOrders?.(allOrders.map((o) => (o.id === order.id ? updated : o)));
    if (notifyCustomer && !isLegacy) {
      send({
        text: `Статус вашего заказа № ${order.id}: «${label}»${tracking && isTK ? `. Трек-номер: ${tracking}` : ''}.`,
        orderStatusUpdate: {
          orderId: order.id,
          oldStatus: order.status,
          newStatus,
          newStatusLabel: label,
          trackingNumber: isTK ? tracking : undefined,
        },
      });
    }
    setIsStatusModalOpen(false);
    onShowToast(`Статус заказа № ${order.id}: «${label}»`, 'success');
  };

  // --- return request ---
  const handleCreateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const reason = [returnReason, returnComment.trim()].filter(Boolean).join('. ');
    const updated: Order = {
      ...order,
      historySteps: [
        ...(order.historySteps || []),
        {
          title: 'Заявка на возврат или обмен',
          date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          completed: true,
          description: `Оформлена в службе заботы. Причина: ${reason}`,
        },
      ],
    };
    onUpdateOrders?.(allOrders.map((o) => (o.id === order.id ? updated : o)));
    send({
      text: `Заявка на возврат или обмен по заказу № ${order.id} оформлена.\nПричина: ${reason}.\nМы напишем здесь, как и когда передать товар.`,
    });
    setIsReturnModalOpen(false);
    setReturnComment('');
    onShowToast('Заявка на возврат добавлена в историю заказа и отправлена покупателю', 'success');
  };

  // --- product recommendation ---
  const pickProduct = (p: Product) => {
    setRecommended(p);
    setRecommendColor(p.colors?.[0]?.name || '');
    setRecommendSize(p.sizes?.[0] || '');
  };

  const openProductPicker = () => {
    if (!recommended && products[0]) pickProduct(products[0]);
    setIsProductPickerOpen(true);
  };

  const filteredProducts = products.filter((p) => {
    if (productCategory !== 'all' && p.category !== productCategory) return false;
    const q = productSearch.trim().toLowerCase();
    return !q || p.title.toLowerCase().includes(q);
  });

  const handleSendProduct = () => {
    if (!recommended) return;
    const card: ProductRecommendationCard = {
      productId: recommended.id,
      title: recommended.title,
      price: recommended.price,
      image: recommended.images?.[0] || '',
      color: recommendColor || undefined,
      size: recommendSize || undefined,
      note: recommendNote.trim() || undefined,
      category: recommended.category,
    };
    const details = [recommendSize && `размер ${recommendSize}`, recommendColor].filter(Boolean).join(', ');
    send(
      {
        text: `Рекомендуем «${recommended.title}»${details ? ` (${details})` : ''}${recommendNote.trim() ? `:\n${recommendNote.trim()}` : ''}`,
        productCard: card,
      },
      `Товар «${recommended.title}» отправлен покупателю`
    );
    setIsProductPickerOpen(false);
    setRecommendNote('');
  };

  // --- promo code (registered in «Промокоды» by the app when the message is sent) ---
  const openPromoModal = () => {
    setPromoCode(newPromoCode());
    setPromoValue('');
    setPromoReason('');
    setPromoExpiry('');
    setIsPromoModalOpen(true);
  };

  const handleIssuePromo = (e: React.FormEvent) => {
    e.preventDefault();
    const code = promoCode.trim().toUpperCase();
    const value = Number(promoValue);
    if (!code) return onShowToast('Укажите код промокода', 'error');
    if (promos.some((p) => p.code.toUpperCase() === code)) {
      return onShowToast(`Промокод ${code} уже есть — укажите другой код`, 'error');
    }
    if (!(value > 0) || (promoType === 'percent' && value > 90)) {
      return onShowToast(promoType === 'percent' ? 'Скидка — от 1 до 90%' : 'Укажите сумму скидки', 'error');
    }
    const amount = promoType === 'fixed' ? `${value.toLocaleString('ru-RU')} ₽` : `${value}%`;
    send(
      {
        text: `Ваш персональный промокод: ${code} (скидка ${amount})${promoReason.trim() ? `.\n${promoReason.trim()}` : ''}`,
        promoCard: {
          code,
          discountType: promoType,
          discountValue: value,
          description: promoReason.trim() || 'Персональный промокод службы заботы',
          expiryDate: promoExpiry || undefined,
        },
      },
      `Промокод ${code} создан и отправлен покупателю`
    );
    setIsPromoModalOpen(false);
  };

  // --- templates ---
  const resetTemplateForm = () => {
    setEditingTplId(null);
    setTplTitle('');
    setTplText('');
    setTplCategory('general');
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim() || !tplText.trim()) return onShowToast('Заполните название и текст шаблона', 'error');
    const categoryLabel = TEMPLATE_CATEGORIES.find((c) => c.value === tplCategory)?.label || 'Общие вопросы';
    if (editingTplId) {
      setTemplates(
        templates.map((t) =>
          t.id === editingTplId ? { ...t, title: tplTitle.trim(), text: tplText.trim(), category: tplCategory, categoryLabel } : t
        )
      );
      onShowToast('Шаблон обновлен', 'success');
    } else {
      setTemplates([
        ...templates,
        { id: `tpl-${Date.now()}`, title: tplTitle.trim(), text: tplText.trim(), category: tplCategory, categoryLabel },
      ]);
      onShowToast('Шаблон добавлен', 'success');
    }
    resetTemplateForm();
  };

  const insertTemplate = (t: ChatQuickTemplate) => {
    setReplyText((prev) => (prev.trim() ? `${prev.trim()}\n${t.text}` : t.text));
    setIsTemplatesOpen(false);
  };

  const senderLabel = (m: ChatMessage) => {
    if (m.isInternalNote) return { text: 'Заметка для команды', icon: Lock, cls: 'text-warning' };
    if (m.sender === 'user') return { text: 'Покупатель', icon: User, cls: 'text-[#4E5C70]' };
    if (m.sender === 'bot') return { text: 'Автоответ (старый)', icon: Bot, cls: 'text-[#4E5C70]' };
    return { text: 'Сотрудник', icon: UserCheck, cls: 'text-success' };
  };

  const canSend = (replyText.trim().length > 0 || Boolean(photo)) && !isProcessingPhoto && !isLegacy;

  return (
    <div className="space-y-4">
      {/* 1. Dialog header: customer, status, priority, clear */}
      <section className="neu-flat rounded-3xl p-3.5 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-sm font-black text-[#2D3A4E] leading-tight break-words">{thread.name}</h3>
              <p className="text-[11px] text-[#4E5C70] leading-snug break-words">
                {isLegacy
                  ? 'Сообщения до разделения чата по покупателям'
                  : [contacts?.customerPhone, contacts?.customerEmail].filter(Boolean).join(' · ') ||
                    (orders.length ? 'Контакты в заказе не указаны' : 'Заказов нет, контакты неизвестны')}
              </p>
              <p className="text-[11px] text-[#4E5C70]">Сообщений: {thread.count}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsClearConfirmOpen(true)}
            className="h-9 px-3 rounded-xl neu-button-danger text-[11px] font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Очистить
          </button>
        </div>

        {isLegacy ? (
          <p className="neu-inset rounded-2xl p-3 text-[11px] text-[#2D3A4E] leading-snug flex gap-2">
            <Info className="w-4 h-4 text-accent shrink-0" />
            Ответить сюда нельзя: у этих сообщений нет покупателя, ответ никто не увидит. Историю можно очистить.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <span className={labelClass}>Статус диалога</span>
              <Segments
                label="Статус диалога"
                value={status}
                options={(Object.keys(STATUS_LABELS) as SupportThreadMeta['status'][]).map((v) => ({ value: v, label: STATUS_LABELS[v] }))}
                onChange={(v) => onUpdateMeta({ status: v })}
              />
            </div>
            <div>
              <span className={labelClass}>Приоритет</span>
              <Segments
                label="Приоритет"
                value={priority}
                options={(Object.keys(PRIORITY_LABELS) as SupportThreadMeta['priority'][]).map((v) => ({ value: v, label: PRIORITY_LABELS[v] }))}
                onChange={(v) => onUpdateMeta({ priority: v })}
              />
            </div>
          </div>
        )}
      </section>

      {/* 2. Customer's order */}
      {order && (
        <section className="neu-flat rounded-3xl p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-accent" />
              Заказ покупателя
            </span>
            {sortedOrders.length > 1 && <span className="text-[11px] text-[#4E5C70]">Всего заказов: {sortedOrders.length}</span>}
          </div>
          {sortedOrders.length > 1 && (
            <NeumorphicSelect
              value={order.id}
              onChange={setOrderId}
              variant="inset"
              triggerClassName="h-10 px-3 rounded-xl"
              options={sortedOrders.map((o) => ({ value: o.id, label: `№ ${o.id} · ${o.date} · ${ORDER_STATUS_LABELS[o.status]}` }))}
            />
          )}
          <div className="neu-inset rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-black text-[#2D3A4E]">№ {order.id}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-accent/10 text-accent">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <p className="text-[11px] text-[#4E5C70] leading-snug">
              {(order.totalPrice || 0).toLocaleString('ru-RU')} ₽ · {order.items?.length || 0} поз.
              {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
            </p>
            {order.trackingNumber && (
              <p className="text-[11px] text-[#4E5C70]">
                Трек-номер: <strong className="font-mono text-[#2D3A4E]">{order.trackingNumber}</strong>
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowOrderItems((v) => !v)}
              aria-expanded={showOrderItems}
              className="text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer"
            >
              {showOrderItems ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showOrderItems ? 'Скрыть состав' : 'Состав заказа'}
            </button>
            {showOrderItems && (
              <ul className="space-y-1.5 pt-1">
                {(order.items || []).map((item, idx) => (
                  <li key={`${item.id || idx}-${idx}`} className="flex items-center gap-2 min-w-0">
                    {item.product?.images?.[0] && (
                      <img src={item.product.images[0]} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    )}
                    <span className="text-[11px] text-[#2D3A4E] min-w-0 flex-1 leading-snug">
                      {item.product?.title || 'Товар'} · {[item.selectedColor, item.selectedSize].filter(Boolean).join(' / ')} ·{' '}
                      {item.quantity} шт.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openStatusModal}
              disabled={!onUpdateOrders}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-accent flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Truck className="w-3.5 h-3.5" />
              Изменить статус
            </button>
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(true)}
              disabled={!onUpdateOrders || isLegacy}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Возврат или обмен
            </button>
          </div>
        </section>
      )}

      {/* 3. Messages */}
      <section className="neu-flat rounded-3xl p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-[#2D3A4E]">Переписка</span>
          {notesCount > 0 && (
            <button
              type="button"
              role="switch"
              aria-checked={showNotes}
              onClick={() => setShowNotes((v) => !v)}
              className="h-8 px-2.5 neu-button rounded-xl text-[11px] font-bold text-[#4E5C70] flex items-center gap-2 cursor-pointer"
            >
              Заметки ({notesCount})
              <span className="w-8 h-5 rounded-full neu-inset p-0.5 flex items-center">
                <span
                  className={`w-4 h-4 rounded-full transition-transform ${showNotes ? 'translate-x-3 neu-fill-accent' : 'neu-button'}`}
                />
              </span>
            </button>
          )}
        </div>
        <div className="neu-inset rounded-2xl p-3 space-y-3 max-h-[55dvh] overflow-y-auto" aria-live="polite">
          {visibleMessages.length === 0 && <p className="text-center py-8 text-xs text-[#4E5C70]">Сообщений нет</p>}
          {visibleMessages.map((msg, idx) => {
            const isCustomer = msg.sender === 'user';
            const who = senderLabel(msg);
            const WhoIcon = who.icon;
            return (
              <div
                key={msg.id ? `${msg.id}-${idx}` : idx}
                className={`flex flex-col space-y-1 ${isCustomer ? 'items-start' : 'items-end'}`}
              >
                <span className={`text-[11px] font-bold flex items-center gap-1 px-1 ${who.cls}`}>
                  <WhoIcon className="w-3 h-3" />
                  {who.text}
                  <span className="text-[#4E5C70] font-medium">· {msg.timestamp}</span>
                </span>
                <div
                  className={`p-3 rounded-2xl text-xs max-w-[88%] space-y-2 leading-relaxed ${
                    msg.isInternalNote
                      ? 'neu-flat-sm border border-warning/40 text-[#2D3A4E]'
                      : isCustomer
                      ? 'neu-flat-sm text-[#2D3A4E]'
                      : msg.sender === 'bot'
                      ? 'neu-flat-sm text-[#4E5C70]'
                      : 'neu-bubble-own'
                  }`}
                >
                  {msg.text && <p className="whitespace-pre-line break-words">{msg.text}</p>}
                  {msg.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(msg.imageUrl || null)}
                      aria-label="Открыть фото"
                      className="relative group rounded-xl overflow-hidden block max-w-full bg-black/5 cursor-pointer"
                    >
                      <img src={msg.imageUrl} alt="Фото из чата" className="max-h-56 w-auto max-w-[220px] rounded-xl object-contain block" loading="lazy" />
                      <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-[11px] font-bold">
                        <Maximize2 className="w-3.5 h-3.5" />
                        Увеличить
                      </span>
                    </button>
                  )}
                  {msg.productCard && (
                    <p className="text-[11px] font-bold flex items-center gap-1 opacity-90">
                      <ShoppingBag className="w-3 h-3" />
                      Товар: {msg.productCard.title} · {msg.productCard.price.toLocaleString('ru-RU')} ₽
                    </p>
                  )}
                  {msg.promoCard && (
                    <p className="text-[11px] font-bold flex items-center gap-1 opacity-90">
                      <Gift className="w-3 h-3" />
                      Промокод {msg.promoCard.code}
                      <button
                        type="button"
                        onClick={() => {
                          copyToClipboard(msg.promoCard!.code);
                          onShowToast(`Промокод ${msg.promoCard!.code} скопирован`, 'info');
                        }}
                        className="underline cursor-pointer"
                        aria-label={`Скопировать промокод ${msg.promoCard.code}`}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </p>
                  )}
                  {msg.orderStatusUpdate && (
                    <p className="text-[11px] font-bold flex items-center gap-1 opacity-90">
                      <Truck className="w-3 h-3" />
                      Заказ № {msg.orderStatusUpdate.orderId}: {msg.orderStatusUpdate.newStatusLabel}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={chatBottomRef} />
        </div>
      </section>

      {/* 4. Reply panel */}
      {!isLegacy && (
        <section className="neu-flat rounded-3xl p-3.5 sm:p-4 space-y-3">
          <Segments
            label="Кому"
            value={isInternalNote ? 'note' : 'reply'}
            options={[
              { value: 'reply', label: 'Ответ покупателю' },
              { value: 'note', label: 'Заметка для команды' },
            ]}
            onChange={(v) => setIsInternalNote(v === 'note')}
          />

          {/* Attachments and helpers */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingPhoto}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isProcessingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 text-accent" />}
              Фото
            </button>
            <button
              type="button"
              onClick={openProductPicker}
              disabled={products.length === 0 || isInternalNote}
              title={products.length === 0 ? 'В каталоге нет товаров' : undefined}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-accent" />
              Товар
            </button>
            <button
              type="button"
              onClick={openPromoModal}
              disabled={isInternalNote}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Gift className="w-3.5 h-3.5 text-accent" />
              Промокод
            </button>
            <button
              type="button"
              onClick={() => setIsTemplatesOpen(true)}
              className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-accent" />
              Шаблоны{templates.length > 0 ? ` · ${templates.length}` : ''}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

          {photo && (
            <div className="neu-inset rounded-2xl p-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 min-w-0">
                <img src={photo} alt="Прикрепленное фото" className="w-10 h-10 rounded-xl object-cover" />
                <span className="text-[11px] font-bold text-[#2D3A4E]">Фото будет отправлено с сообщением</span>
              </span>
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-danger cursor-pointer shrink-0"
                aria-label="Убрать фото"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <label className="block">
            <span className="sr-only">{isInternalNote ? 'Текст заметки' : 'Текст ответа'}</span>
            <textarea
              rows={3}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              maxLength={5000}
              placeholder={isInternalNote ? 'Заметка видна только сотрудникам…' : 'Ответ покупателю…'}
              className={`${textareaClass} min-h-20 ${isInternalNote ? 'border border-warning/40' : ''}`}
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#4E5C70] leading-snug">Enter — отправить, Shift+Enter — новая строка</span>
            <button
              type="button"
              onClick={handleSendReply}
              disabled={!canSend}
              className="h-11 px-5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isInternalNote ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {isInternalNote ? 'Сохранить заметку' : 'Отправить'}
            </button>
          </div>
        </section>
      )}

      {/* --- Modals --- */}
      {isStatusModalOpen && order && (
        <Modal title={`Статус заказа № ${order.id}`} onClose={() => setIsStatusModalOpen(false)}>
          <form onSubmit={handleSaveStatus} className="space-y-3.5">
            <div>
              <span className={labelClass}>Новый статус</span>
              <NeumorphicSelect
                value={newStatus}
                onChange={(v) => setNewStatus(v as Order['status'])}
                variant="inset"
                triggerClassName="h-10 px-3 rounded-xl"
                options={(Object.keys(ORDER_STATUS_LABELS) as Order['status'][]).map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
              />
            </div>
            {isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany) && (
              <label className="block">
                <span className={labelClass}>Трек-номер транспортной компании</span>
                <input value={newTracking} onChange={(e) => setNewTracking(e.target.value)} className={inputClass} />
              </label>
            )}
            {!isLegacy && (
              <button
                type="button"
                role="switch"
                aria-checked={notifyCustomer}
                onClick={() => setNotifyCustomer((v) => !v)}
                className="w-full h-11 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] flex items-center justify-between cursor-pointer"
              >
                Сообщить покупателю в чат
                <span className="w-10 h-6 rounded-full neu-inset p-0.5 flex items-center">
                  <span className={`w-5 h-5 rounded-full transition-transform ${notifyCustomer ? 'translate-x-4 neu-fill-accent' : 'neu-button'}`} />
                </span>
              </button>
            )}
            <button type="submit" className="w-full h-11 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer">
              <Check className="w-4 h-4" />
              Сохранить статус
            </button>
          </form>
        </Modal>
      )}

      {isReturnModalOpen && order && (
        <Modal title={`Возврат или обмен · № ${order.id}`} onClose={() => setIsReturnModalOpen(false)}>
          <form onSubmit={handleCreateReturn} className="space-y-3.5">
            <div>
              <span className={labelClass}>Причина</span>
              <NeumorphicSelect
                value={returnReason}
                onChange={setReturnReason}
                variant="inset"
                triggerClassName="h-10 px-3 rounded-xl"
                options={RETURN_REASONS.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <label className="block">
              <span className={labelClass}>Комментарий (необязательно)</span>
              <textarea rows={3} value={returnComment} onChange={(e) => setReturnComment(e.target.value)} className={textareaClass} />
            </label>
            <p className="text-[11px] text-[#4E5C70] leading-snug">
              Заявка попадет в историю заказа, покупатель получит сообщение в чат.
            </p>
            <button type="submit" className="w-full h-11 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer">
              <RotateCcw className="w-4 h-4" />
              Оформить заявку
            </button>
          </form>
        </Modal>
      )}

      {isProductPickerOpen && (
        <Modal title="Рекомендовать товар" onClose={() => setIsProductPickerOpen(false)} wide>
          <label className="relative block">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" />
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Поиск товара"
              aria-label="Поиск товара"
              className={`${inputClass} pl-8`}
            />
          </label>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[{ id: 'all', name: 'Все' }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setProductCategory(c.id)}
                  className={`h-8 px-3 rounded-xl text-[11px] font-bold cursor-pointer ${
                    productCategory === c.id ? 'neu-pill-active' : 'neu-button text-[#4E5C70]'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 -m-1">
            {filteredProducts.length === 0 && <p className="col-span-2 text-center text-[11px] text-[#4E5C70] py-4">Товары не найдены</p>}
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickProduct(p)}
                aria-pressed={recommended?.id === p.id}
                className={`rounded-2xl p-2 flex items-center gap-2 text-left cursor-pointer ${
                  recommended?.id === p.id ? 'neu-pill-active' : 'neu-button text-[#2D3A4E]'
                }`}
              >
                {p.images?.[0] && <img src={p.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold leading-tight line-clamp-2">{p.title}</span>
                  <span className="block text-[11px] opacity-80">{p.price.toLocaleString('ru-RU')} ₽</span>
                </span>
              </button>
            ))}
          </div>
          {recommended && (
            <div className="space-y-3 pt-1 border-t border-[#BAC5D5]/50">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={labelClass}>Цвет</span>
                  <NeumorphicSelect
                    value={recommendColor}
                    onChange={setRecommendColor}
                    variant="inset"
                    triggerClassName="h-10 px-3 rounded-xl"
                    placeholder="Не указан"
                    emptyText="У товара нет цветов"
                    options={(recommended.colors ?? []).map((c) => ({ value: c.name, label: c.name }))}
                  />
                </div>
                <div>
                  <span className={labelClass}>Размер</span>
                  <NeumorphicSelect
                    value={recommendSize}
                    onChange={setRecommendSize}
                    variant="inset"
                    triggerClassName="h-10 px-3 rounded-xl"
                    placeholder="Не указан"
                    emptyText="У товара нет размеров"
                    options={(recommended.sizes ?? []).map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>
              <label className="block">
                <span className={labelClass}>Комментарий для покупателя (необязательно)</span>
                <textarea
                  rows={3}
                  value={recommendNote}
                  onChange={(e) => setRecommendNote(e.target.value)}
                  placeholder="Например: садится по размеру, к нему подойдут брюки…"
                  className={textareaClass}
                />
              </label>
              <button
                type="button"
                onClick={handleSendProduct}
                className="w-full h-11 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Отправить «{recommended.title}»
              </button>
            </div>
          )}
        </Modal>
      )}

      {isPromoModalOpen && (
        <Modal title="Персональный промокод" onClose={() => setIsPromoModalOpen(false)}>
          <form onSubmit={handleIssuePromo} className="space-y-3.5">
            <Segments
              label="Тип скидки"
              value={promoType}
              options={[
                { value: 'percent', label: 'Процент' },
                { value: 'fixed', label: 'Сумма, ₽' },
              ]}
              onChange={setPromoType}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={labelClass}>{promoType === 'percent' ? 'Скидка, %' : 'Скидка, ₽'}</span>
                <input
                  value={promoValue}
                  onChange={(e) => setPromoValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder={promoType === 'percent' ? '10' : '500'}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Действует до (необязательно)</span>
                <input type="date" value={promoExpiry} onChange={(e) => setPromoExpiry(e.target.value)} className={inputClass} />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Код</span>
              <span className="flex gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  className={`${inputClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setPromoCode(newPromoCode())}
                  className="h-10 px-3 neu-button rounded-xl text-[11px] font-bold text-accent shrink-0 cursor-pointer"
                >
                  Другой
                </button>
              </span>
            </label>
            <label className="block">
              <span className={labelClass}>Сообщение покупателю (необязательно)</span>
              <textarea
                rows={3}
                value={promoReason}
                onChange={(e) => setPromoReason(e.target.value)}
                placeholder="Например: извините за задержку доставки"
                className={textareaClass}
              />
            </label>
            <p className="text-[11px] text-[#4E5C70] leading-snug">
              Промокод появится в разделе «Промокоды»: одно использование, без минимальной суммы.
            </p>
            <button type="submit" className="w-full h-11 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer">
              <Sparkles className="w-4 h-4" />
              Создать и отправить
            </button>
          </form>
        </Modal>
      )}

      {isTemplatesOpen && (
        <Modal
          title="Шаблоны ответов"
          onClose={() => {
            setIsTemplatesOpen(false);
            resetTemplateForm();
          }}
          wide
        >
          {templates.length === 0 ? (
            <p className="neu-inset rounded-2xl p-3 text-[11px] text-[#4E5C70] text-center">
              Шаблонов пока нет. Добавьте ответы, которые пишете чаще всего.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li key={t.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => insertTemplate(t)}
                    className="flex-1 min-w-0 text-left neu-button rounded-2xl px-3 py-2 cursor-pointer"
                    title="Вставить в ответ"
                  >
                    <span className="block text-xs font-bold text-[#2D3A4E] truncate">{t.title}</span>
                    <span className="block text-[11px] text-[#4E5C70] line-clamp-2">{t.text}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTplId(t.id);
                      setTplTitle(t.title);
                      setTplText(t.text);
                      setTplCategory(t.category);
                    }}
                    className="w-10 neu-button rounded-xl flex items-center justify-center text-accent cursor-pointer shrink-0"
                    aria-label={`Изменить шаблон «${t.title}»`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateToDelete(t)}
                    className="w-10 neu-button-danger rounded-xl flex items-center justify-center cursor-pointer shrink-0"
                    aria-label={`Удалить шаблон «${t.title}»`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleSaveTemplate} className="neu-inset rounded-2xl p-3 space-y-2.5">
            <p className="text-[11px] font-black uppercase tracking-wider text-[#2D3A4E]">
              {editingTplId ? 'Изменить шаблон' : 'Новый шаблон'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} placeholder="Название" aria-label="Название шаблона" className={inputClass} />
              <NeumorphicSelect
                value={tplCategory}
                onChange={(v) => setTplCategory(v as ChatQuickTemplate['category'])}
                variant="inset"
                triggerClassName="h-10 px-3 rounded-xl"
                options={TEMPLATE_CATEGORIES}
              />
            </div>
            <textarea
              rows={3}
              value={tplText}
              onChange={(e) => setTplText(e.target.value)}
              placeholder="Текст ответа"
              aria-label="Текст шаблона"
              className={textareaClass}
            />
            <div className="flex justify-end gap-2">
              {editingTplId && (
                <button type="button" onClick={resetTemplateForm} className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-[#4E5C70] cursor-pointer">
                  Отмена
                </button>
              )}
              <button type="submit" className="h-9 px-3 neu-button rounded-xl text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer">
                {editingTplId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {editingTplId ? 'Сохранить' : 'Добавить'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {previewImage && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-in fade-in duration-200"
            onClick={() => setPreviewImage(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Просмотр фото"
          >
            <div className="relative animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute top-2.5 right-2.5 w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть просмотр"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={previewImage} alt="Фото из чата" className="max-h-[85dvh] w-auto max-w-[92vw] rounded-2xl object-contain" />
            </div>
          </div>
        </ModalPortal>
      )}

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        title="Очистить диалог?"
        message="Все сообщения этого диалога будут удалены у вас и у покупателя. Отменить нельзя."
        preview={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-[#2D3A4E] truncate">{thread.name}</p>
              <p className="text-[11px] text-[#4E5C70]">Сообщений: {thread.count}</p>
            </div>
          </div>
        }
        confirmLabel="Очистить"
        cancelLabel="Оставить"
        onConfirm={() => {
          setIsClearConfirmOpen(false);
          onClear();
        }}
        onClose={() => setIsClearConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={templateToDelete !== null}
        title="Удалить шаблон?"
        message="Шаблон исчезнет из списка."
        preview={
          templateToDelete && (
            <div className="min-w-0">
              <p className="text-xs font-black text-[#2D3A4E] truncate">{templateToDelete.title}</p>
              <p className="text-[11px] text-[#4E5C70] line-clamp-2">{templateToDelete.text}</p>
            </div>
          )
        }
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        onConfirm={() => {
          if (templateToDelete) {
            setTemplates(templates.filter((t) => t.id !== templateToDelete.id));
            if (editingTplId === templateToDelete.id) resetTemplateForm();
            onShowToast('Шаблон удален', 'info');
          }
          setTemplateToDelete(null);
        }}
        onClose={() => setTemplateToDelete(null)}
      />
    </div>
  );
};
