import React, { useState, useRef, useEffect } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  MessageSquare,
  Send,
  UserCheck,
  User,
  Bot,
  Clock,
  Sparkles,
  Phone,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  Pencil,
  X,
  Maximize2,
  Filter,
  ShoppingBag,
  Package,
  MapPin,
  Truck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Tag,
  Gift,
  Ruler,
  AlertTriangle,
  RotateCcw,
  HelpCircle,
  Copy,
  Check,
  CreditCard,
  Lock,
  Unlock,
  Bell,
  Crown,
  Zap,
  Search,
  Activity,
  CheckCircle2,
  BarChart3,
  FileText,
  ArrowRight,
  ExternalLink,
  Headphones,
} from 'lucide-react';
import { ChatMessage, ChatQuickTemplate, Order, Product, PromoCode, CustomerThread, ProductRecommendationCard } from '../../types';
import { INITIAL_QUICK_TEMPLATES } from '../../data/marketingAndSupport';
import { NeumorphicSelect, NeumorphicSelectOption } from '../NeumorphicSelect';
import { copyToClipboard } from '../../utils/clipboard';
import { compressChatImageFile } from '../../utils/imageUpload';
import { ORDER_STATUS_LABELS, isTransportCompanyDelivery } from '../../utils/deliveryStages';
import { currentStoreName } from '../../utils/storeContacts';

interface AdminSupportChatTabProps {
  messages: ChatMessage[];
  orders?: Order[];
  products?: Product[];
  promos?: PromoCode[];
  initialOrderId?: string | null;
  onSendMessageAsAdmin: (
    text: string,
    imageUrl?: string,
    promoCard?: ChatMessage['promoCard'],
    tag?: ChatMessage['tag'],
    isInternalNote?: boolean,
    productCard?: ChatMessage['productCard'],
    orderStatusUpdate?: ChatMessage['orderStatusUpdate']
  ) => void;
  onUpdateOrders?: (orders: Order[]) => void;
  onUpdatePromos?: (promos: PromoCode[]) => void;
  onClearChat?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminSupportChatTab: React.FC<AdminSupportChatTabProps> = ({
  messages,
  orders = [],
  products = [],
  promos = [],
  initialOrderId,
  onSendMessageAsAdmin,
  onUpdateOrders,
  onUpdatePromos,
  onClearChat,
  onShowToast,
}) => {
  // --- 1. DIALOG STATE ---
  // ProfileScreen passes the messages of one real customer dialog (grouped by threadId).
  // Name, contacts and order context come from that customer's own orders, never from another buyer's.
  const buildMainThread = (prev?: CustomerThread): CustomerThread => {
    const customerUid = messages.find((m) => m.threadId)?.threadId;
    const threadName = [...messages].reverse().find((m) => m.threadName)?.threadName;
    const lastOrder = customerUid ? orders.find((o) => o.customerUid === customerUid) : undefined;
    return {
      status: 'in_progress',
      priority: 'standard',
      unreadCount: 0,
      tags: ['consultation'],
      ...prev,
      id: 'thread-main',
      customerName: threadName || lastOrder?.customerName || 'Покупатель',
      customerPhone: lastOrder?.customerPhone || '',
      customerEmail: lastOrder?.customerEmail || '',
      orderNumber: lastOrder?.id,
      activeOrderId: lastOrder?.id,
      lastActivity: messages[messages.length - 1]?.timestamp || '',
      messages,
    };
  };
  const [threads, setThreads] = useState<CustomerThread[]>(() => [buildMainThread()]);

  const [activeThreadId, setActiveThreadId] = useState<string>('thread-main');
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [isClearChatConfirmOpen, setIsClearChatConfirmOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState<string>('');
  const [threadFilterTab, setThreadFilterTab] = useState<'all' | 'waiting' | 'in_progress' | 'vip' | 'resolved'>('all');
  const [isInboxDrawerOpen, setIsInboxDrawerOpen] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'dropdown' | 'cards'>('dropdown');

  // Keep the dialog in sync with live messages and orders
  useEffect(() => {
    setThreads((prev) => prev.map((t) => (t.id === 'thread-main' ? buildMainThread(t) : t)));
  }, [messages, orders]);

  // Show the given order in the order widget when navigated from the Orders tab
  useEffect(() => {
    if (!initialOrderId) return;
    const targetOrder = orders.find((o) => o.id === initialOrderId);
    if (targetOrder) {
      setSelectedOrderContext(targetOrder);
      setNewOrderStatus(targetOrder.status);
      setNewTrackingNumber(targetOrder.trackingNumber || '');
    }
  }, [initialOrderId, orders]);

  const currentThread = threads.find((t) => t.id === activeThreadId) || threads[0];

  // Active messages to display
  const currentMessages = currentThread ? currentThread.messages : messages;

  // --- 2. INTERNAL NOTE TOGGLE STATE ---
  const [isInternalNote, setIsInternalNote] = useState<boolean>(false);

  // --- 3. PRODUCT PICKER MODAL STATE ---
  const [isProductPickerOpen, setIsProductPickerOpen] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [selectedProductToRecommend, setSelectedProductToRecommend] = useState<Product | null>(null);
  const [recommendColor, setRecommendColor] = useState<string>('');
  const [recommendSize, setRecommendSize] = useState<string>('M');
  const [recommendNote, setRecommendNote] = useState<string>('Идеально подойдет к вашему гардеробу. Модель идет строго в размер.');

  // --- 4. ORDER STATUS CHANGE & ACTIONS MODAL STATE ---
  const [isOrderStatusModalOpen, setIsOrderStatusModalOpen] = useState<boolean>(false);
  const [newOrderStatus, setNewOrderStatus] = useState<Order['status']>('in_transit');
  const [newTrackingNumber, setNewTrackingNumber] = useState<string>('');
  const [notifyCustomerOnStatusChange, setNotifyCustomerOnStatusChange] = useState<boolean>(true);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [returnReason, setReturnReason] = useState<string>('Не подошел размер (нужен меньше/больше)');

  // --- 6. REMINDER & PRIORITY STATE ---
  const [isReminderModalOpen, setIsReminderModalOpen] = useState<boolean>(false);
  const [reminderDatePreset, setReminderDatePreset] = useState<string>('30min');
  const [reminderNoteText, setReminderNoteText] = useState<string>('');

  // General Chat UI State
  const [threadsViewMode, setThreadsViewMode] = useState<'cards' | 'dropdown'>('cards');
  const [replyText, setReplyText] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'agent' | 'notes'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<ChatMessage['tag']>('consultation');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isManagingTemplates, setIsManagingTemplates] = useState(false);
  const [templates, setTemplates] = useState<ChatQuickTemplate[]>(INITIAL_QUICK_TEMPLATES);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const [selectedOrderContext, setSelectedOrderContext] = useState<Order | null>(null);
  const [showOrderWidget, setShowOrderWidget] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Promo Generator Modal State
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [promoType, setPromoType] = useState<'percent' | 'fixed'>('fixed');
  const [promoValue, setPromoValue] = useState<number>(500);
  const [promoCodeName, setPromoCodeName] = useState<string>(`CARE-${Math.floor(100 + Math.random() * 900)}`);
  const [promoReason, setPromoReason] = useState<string>('Компенсация за задержку доставки');
  const [promoCustomMessage, setPromoCustomMessage] = useState<string>(
    'Дарим вам персональный промокод в качестве извинений за доставленные неудобства.'
  );

  // Template Form State
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplCategory, setNewTplCategory] = useState<ChatQuickTemplate['category']>('general');
  const [newTplText, setNewTplText] = useState('');
  const [editingTplId, setEditingTplId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on message updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, activeThreadId]);

  // Set default active order context based on active thread
  useEffect(() => {
    if (currentThread) {
      const foundOrder = orders.find((o) => o.id === currentThread.orderNumber || o.id === currentThread.activeOrderId);
      if (foundOrder) {
        setSelectedOrderContext(foundOrder);
        setNewOrderStatus(foundOrder.status);
        setNewTrackingNumber(foundOrder.trackingNumber || '');
      } else {
        // No orders from this customer: do not offer actions on another buyer's order
        setSelectedOrderContext(null);
      }
    }
  }, [currentThread, orders]);

  // Send message handler
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() && !selectedPhoto) return;

    if (activeThreadId === 'thread-main') {
      onSendMessageAsAdmin(
        replyText.trim(),
        selectedPhoto || undefined,
        undefined,
        selectedTag,
        isInternalNote,
        undefined,
        undefined
      );
    } else {
      // Local thread dispatch
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'admin',
        text: replyText.trim(),
        imageUrl: selectedPhoto || undefined,
        tag: selectedTag,
        isInternalNote: isInternalNote,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                status: 'in_progress',
                lastActivity: 'Только что',
                messages: [...t.messages, newMsg],
              }
            : t
        )
      );
    }

    setReplyText('');
    setSelectedPhoto(null);
    if (isInternalNote) {
      onShowToast('Внутренняя заметка добавлена (клиент ее не видит)', 'info');
    } else {
      onShowToast('Ответ отправлен покупателю', 'success');
    }
  };

  // Switch Thread
  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
    );
  };

  // Change Thread Status
  const handleUpdateThreadStatus = (status: CustomerThread['status']) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThreadId ? { ...t, status } : t))
    );
    const statusLabels: Record<string, string> = {
      waiting: 'Ожидает ответа',
      in_progress: 'В работе',
      resolved: 'Решен',
      closed: 'Закрыт',
    };
    onShowToast(`Статус диалога изменен на «${statusLabels[status]}»`, 'info');
  };

  // Change Thread Priority
  const handleUpdateThreadPriority = (priority: CustomerThread['priority']) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThreadId ? { ...t, priority } : t))
    );
    const pLabels: Record<string, string> = {
      standard: 'Стандартный',
      urgent: 'Срочный ⚡',
      vip: 'VIP 👑',
    };
    onShowToast(`Приоритет клиента изменен на «${pLabels[priority]}»`, 'success');
  };

  // Open Product Picker
  const handleOpenProductPicker = () => {
    if (products.length > 0) {
      const defaultProd = products[0];
      setSelectedProductToRecommend(defaultProd);
      setRecommendColor(defaultProd.colors?.[0]?.name || 'Бежевый');
      setRecommendSize(defaultProd.sizes?.[0] || 'M');
    }
    setIsProductPickerOpen(true);
  };

  // Send Product Card
  const handleSendProductCard = () => {
    if (!selectedProductToRecommend) return;

    const prodCard: ProductRecommendationCard = {
      productId: selectedProductToRecommend.id,
      title: selectedProductToRecommend.title,
      price: selectedProductToRecommend.price,
      image: selectedProductToRecommend.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
      color: recommendColor,
      size: recommendSize,
      note: recommendNote.trim() || undefined,
      category: selectedProductToRecommend.category,
    };

    const introText = `Рекомендуем обратить внимание на модель «${selectedProductToRecommend.title}» в размере ${recommendSize}${
      recommendNote ? `:\n${recommendNote}` : ''
    }`;

    if (activeThreadId === 'thread-main') {
      onSendMessageAsAdmin(
        introText,
        undefined,
        undefined,
        'consultation',
        false,
        prodCard,
        undefined
      );
    } else {
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'admin',
        text: introText,
        productCard: prodCard,
        tag: 'consultation',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, lastActivity: 'Только что', messages: [...t.messages, newMsg] }
            : t
        )
      );
    }

    setIsProductPickerOpen(false);
    onShowToast(`Карточка товара «${selectedProductToRecommend.title}» отправлена в чат`, 'success');
  };

  // Update Order Status & Dispatch Notification
  const handleConfirmOrderStatusUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderContext) return;

    const statusLabels: Record<string, string> = {
      accepted: 'Принят в обработку',
      assembling: 'Собирается на складе',
      in_transit: 'В пути / Передан курьеру',
      ready: 'Готов к получению',
      delivered: 'Доставлен покупателю',
    };

    const dateNow = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isTK = isTransportCompanyDelivery(selectedOrderContext.deliveryMethod, selectedOrderContext.trackingCompany);
    const effectiveTrackingNumber = isTK ? (newTrackingNumber.trim() || selectedOrderContext.trackingNumber) : undefined;

    const updatedOrder: Order = {
      ...selectedOrderContext,
      status: newOrderStatus,
      trackingNumber: effectiveTrackingNumber,
      historySteps: [
        ...(selectedOrderContext.historySteps || []),
        {
          title: `Статус изменен на «${statusLabels[newOrderStatus]}» (Служба заботы)`,
          date: dateNow,
          completed: true,
          description: effectiveTrackingNumber ? `Трек-номер (ТК): ${effectiveTrackingNumber}` : undefined,
        },
      ],
    };

    // Update orders in parent if callback available
    if (onUpdateOrders && orders.length > 0) {
      const updatedList = orders.map((o) => (o.id === selectedOrderContext.id ? updatedOrder : o));
      onUpdateOrders(updatedList);
    }

    setSelectedOrderContext(updatedOrder);

    if (notifyCustomerOnStatusChange) {
      const statusText = `Статус вашего заказа № ${selectedOrderContext.id} обновлен на «${statusLabels[newOrderStatus]}»${
        effectiveTrackingNumber ? `. Трек-номер: ${effectiveTrackingNumber}` : ''
      }.`;

      const statusUpdateCard = {
        orderId: selectedOrderContext.id,
        oldStatus: selectedOrderContext.status,
        newStatus: newOrderStatus,
        newStatusLabel: statusLabels[newOrderStatus],
        trackingNumber: effectiveTrackingNumber,
      };

      if (activeThreadId === 'thread-main') {
        onSendMessageAsAdmin(
          statusText,
          undefined,
          undefined,
          'delivery',
          false,
          undefined,
          statusUpdateCard
        );
      } else {
        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          sender: 'admin',
          text: statusText,
          orderStatusUpdate: statusUpdateCard,
          tag: 'delivery',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setThreads((prev) =>
          prev.map((t) =>
            t.id === activeThreadId
              ? { ...t, lastActivity: 'Только что', messages: [...t.messages, newMsg] }
              : t
          )
        );
      }
    }

    setIsOrderStatusModalOpen(false);
    onShowToast(`Статус заказа № ${selectedOrderContext.id} успешно обновлен`, 'success');
  };

  // Return/Exchange Request from Chat
  const handleCreateReturnRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderContext) return;

    const returnMsgText = `Оформлена заявка на возврат/обмен по заказу № ${selectedOrderContext.id}.\nПричина: ${returnReason}.\nКурьер службы забора свяжется для согласования времени.`;

    if (activeThreadId === 'thread-main') {
      onSendMessageAsAdmin(returnMsgText, undefined, undefined, 'return', false);
    } else {
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'admin',
        text: returnMsgText,
        tag: 'return',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, lastActivity: 'Только что', messages: [...t.messages, newMsg] }
            : t
        )
      );
    }

    // Persist return request in order history and propagate to parent orders state
    const dateNow = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const returnStep = {
      title: 'Заявка на возврат/обмен зарегистрирована',
      date: dateNow,
      completed: true,
      description: `Заявка зарегистрирована в службе заботы. Причина: ${returnReason}`,
    };

    const updatedOrder: Order = {
      ...selectedOrderContext,
      historySteps: [...(selectedOrderContext.historySteps || []), returnStep],
    };

    setSelectedOrderContext(updatedOrder);

    if (onUpdateOrders && orders.length > 0) {
      const updatedList = orders.map((o) => (o.id === selectedOrderContext.id ? updatedOrder : o));
      onUpdateOrders(updatedList);
    }

    setIsReturnModalOpen(false);
    onShowToast('Заявка на возврат зарегистрирована и отправлена клиенту', 'success');
  };

  // Follow-up Reminder Handler
  const handleSaveReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderNoteText.trim()) {
      onShowToast('Введите текст напоминания', 'error');
      return;
    }

    const presetLabels: Record<string, string> = {
      '30min': 'Через 30 мин',
      '2h': 'Через 2 часа',
      tomorrow: 'Завтра в 10:00',
      '2days': 'Через 2 дня',
    };

    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? {
              ...t,
              followUpReminder: {
                dueDate: presetLabels[reminderDatePreset] || 'Сегодня',
                note: reminderNoteText.trim(),
                completed: false,
              },
            }
          : t
      )
    );

    setIsReminderModalOpen(false);
    setReminderNoteText('');
    onShowToast('Напоминание установлено', 'success');
  };

  const handleDismissReminder = () => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThreadId ? { ...t, followUpReminder: undefined } : t))
    );
    onShowToast('Напоминание выполнено и снято', 'info');
  };

  // Promo Code Modal Handlers
  const handleOpenPromoModal = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setPromoCodeName(`CARE-${randomSuffix}`);
    setIsPromoModalOpen(true);
  };

  const handleIssuePromoCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = promoCodeName.trim().toUpperCase();
    if (!cleanCode) {
      onShowToast('Укажите код промокода', 'error');
      return;
    }

    const promoCardData = {
      code: cleanCode,
      discountType: promoType,
      discountValue: promoValue,
      description: promoReason,
    };

    const fullMessage = `${promoCustomMessage}\n\nВаш персональный промокод: ${cleanCode} (${
      promoType === 'fixed' ? `${promoValue.toLocaleString('ru-RU')} ₽` : `${promoValue}%`
    })`;

    if (activeThreadId === 'thread-main') {
      onSendMessageAsAdmin(fullMessage, undefined, promoCardData, 'discount');
    } else {
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'admin',
        text: fullMessage,
        promoCard: promoCardData,
        tag: 'discount',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, lastActivity: 'Только что', messages: [...t.messages, newMsg] }
            : t
        )
      );
    }

    setIsPromoModalOpen(false);

    // Register promo code in system so customer can apply it at checkout and it syncs across admin tabs
    const calculatedPercent = promoType === 'percent' ? promoValue : Math.max(5, Math.round((promoValue / 5000) * 100));

    const newPromo: PromoCode = {
      id: `promo-${Date.now()}`,
      code: cleanCode,
      discountPercent: calculatedPercent,
      discountType: promoType,
      discountValue: promoValue,
      title: `Персональный промокод службы заботы (${cleanCode})`,
      description: promoReason || `Индивидуальная скидка от ${currentStoreName()}`,
      expiresAt: '31 декабря 2026 г.',
      usageLimit: 1,
      usedCount: 0,
      active: true,
      badgeText: 'Служба заботы',
      isPopular: false,
    };

    if (onUpdatePromos) {
      onUpdatePromos([newPromo, ...promos]);
    }

    onShowToast(`Персональный промокод ${cleanCode} выписан, активирован в системе и отправлен в чат!`, 'success');
  };

  const handleCopyCode = (code: string) => {
    copyToClipboard(code);
    setCopiedCode(code);
    onShowToast(`Промокод ${code} скопирован`, 'info');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast('Пожалуйста, выберите изображение', 'error');
      return;
    }

    try {
      const result = await compressChatImageFile(file);
      setSelectedPhoto(result);
      onShowToast(`Фото "${file.name}" прикреплено и оптимизировано`, 'info');
    } catch (err) {
      console.warn('Could not compress chat image:', err);
      onShowToast('Не удалось обработать изображение', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Template Management
  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplTitle.trim() || !newTplText.trim()) {
      onShowToast('Заполните заголовок и текст шаблона', 'error');
      return;
    }

    const categoryLabels: Record<string, string> = {
      sizes: 'Размеры',
      delivery: 'Доставка',
      payment: 'Оплата',
      returns: 'Возврат и обмен',
      discounts: 'Скидки и промо',
      general: 'Общие вопросы',
    };

    if (editingTplId) {
      const updated = templates.map((t) =>
        t.id === editingTplId
          ? {
              ...t,
              title: newTplTitle.trim(),
              category: newTplCategory,
              categoryLabel: categoryLabels[newTplCategory] || 'Общие',
              text: newTplText.trim(),
            }
          : t
      );
      setTemplates(updated);
      onShowToast('Шаблон ответа обновлен', 'success');
    } else {
      const newTpl: ChatQuickTemplate = {
        id: `tpl-${Date.now()}`,
        category: newTplCategory,
        categoryLabel: categoryLabels[newTplCategory] || 'Общие',
        title: newTplTitle.trim(),
        text: newTplText.trim(),
      };
      setTemplates([...templates, newTpl]);
      onShowToast('Новый быстрый шаблон добавлен', 'success');
    }

    setNewTplTitle('');
    setNewTplText('');
    setEditingTplId(null);
  };

  const handleEditTemplate = (t: ChatQuickTemplate) => {
    setEditingTplId(t.id);
    setNewTplTitle(t.title);
    setNewTplCategory(t.category);
    setNewTplText(t.text);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id));
    onShowToast('Шаблон удален', 'info');
  };

  // Filtered Inbox Threads
  const filteredThreads = threads.filter((th) => {
    if (threadFilterTab === 'waiting' && th.status !== 'waiting') return false;
    if (threadFilterTab === 'in_progress' && th.status !== 'in_progress') return false;
    if (threadFilterTab === 'vip' && th.priority !== 'vip' && th.priority !== 'urgent') return false;
    if (threadFilterTab === 'resolved' && th.status !== 'resolved' && th.status !== 'closed') return false;

    if (threadSearch.trim()) {
      const query = threadSearch.toLowerCase();
      const matchName = th.customerName.toLowerCase().includes(query);
      const matchPhone = th.customerPhone?.toLowerCase().includes(query);
      const matchOrder = th.orderNumber?.toLowerCase().includes(query);
      const matchTag = th.tags?.some((t) => t.toLowerCase().includes(query));
      const matchMessage = th.messages?.some((m) => m.text?.toLowerCase().includes(query));
      if (!matchName && !matchPhone && !matchOrder && !matchTag && !matchMessage) return false;
    }
    return true;
  });

  // Filtered Messages in current thread
  const filteredMessages = currentMessages.filter((m) => {
    if (filter === 'user' && m.sender !== 'user') return false;
    if (filter === 'agent' && !(m.sender === 'agent' || m.sender === 'admin')) return false;
    if (filter === 'notes' && !m.isInternalNote) return false;
    if (tagFilter !== 'all' && m.tag !== tagFilter) return false;
    return true;
  });

  const TAG_OPTIONS: { id: ChatMessage['tag'] | 'all'; label: string; icon: React.FC<any>; color: string }[] = [
    { id: 'all', label: 'Все темы', icon: Filter, color: 'text-[#4E5C70]' },
    { id: 'sizing', label: 'Размеры', icon: Ruler, color: 'text-[#4E5C70]' },
    { id: 'delivery', label: 'Доставка', icon: Truck, color: 'text-[#4E5C70]' },
    { id: 'return', label: 'Возврат', icon: RotateCcw, color: 'text-[#4E5C70]' },
    { id: 'complaint', label: 'Претензия', icon: AlertTriangle, color: 'text-danger' },
    { id: 'discount', label: 'Промокод', icon: Gift, color: 'text-[#4B59BB]' },
    { id: 'consultation', label: 'Консультация', icon: HelpCircle, color: 'text-[#4B59BB]' },
  ];

  const senderFilterOptions: NeumorphicSelectOption[] = [
    {
      value: 'all',
      label: 'Все сообщения',
      badge: 'Все',
      icon: <MessageSquare className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    {
      value: 'user',
      label: 'Сообщения клиента',
      badge: 'Клиент',
      icon: <User className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    {
      value: 'agent',
      label: 'Ответы оператора',
      badge: 'Оператор',
      icon: <Headphones className="w-3.5 h-3.5 text-success" />,
    },
    {
      value: 'notes',
      label: 'Внутренние заметки',
      badge: 'Заметки',
      icon: <Lock className="w-3.5 h-3.5 text-warning" />,
    },
  ];

  const topicFilterOptions: NeumorphicSelectOption[] = TAG_OPTIONS.map((tg) => {
    const TagIcon = tg.icon;
    return {
      value: tg.id,
      label: tg.label,
      icon: <TagIcon className={`w-3.5 h-3.5 ${tg.color}`} />,
    };
  });

  const composerModeOptions: NeumorphicSelectOption[] = [
    {
      value: 'client',
      label: 'Ответ покупателю',
      sublabel: 'Сообщение будет отправлено покупателю в чат',
      badge: 'Клиенту',
      icon: <MessageSquare className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    {
      value: 'note',
      label: 'Внутренняя заметка',
      sublabel: 'Служебная заметка для коллег (клиент не видит)',
      badge: 'Заметка 🔒',
      icon: <Lock className="w-3.5 h-3.5 text-warning" />,
    },
  ];

  const attachmentActionOptions: NeumorphicSelectOption[] = [
    {
      value: 'none',
      label: 'Прикрепить к ответу...',
      icon: <Paperclip className="w-3.5 h-3.5 text-[#4E5C70]" />,
    },
    {
      value: 'product',
      label: 'Товар из каталога',
      sublabel: 'Интерактивная карточка товара с кнопкой покупки',
      badge: 'Каталог',
      icon: <ShoppingBag className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    {
      value: 'photo',
      label: 'Загрузить фото',
      sublabel: 'Прикрепить изображение или скриншот',
      badge: 'Файл',
      icon: <ImageIcon className="w-3.5 h-3.5 text-success" />,
    },
  ];

  const quickTemplateDropdownOptions: NeumorphicSelectOption[] = [
    {
      value: '',
      label: 'Вставить быстрый ответ (шаблон)...',
      icon: <Zap className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    ...templates.map((tpl) => ({
      value: tpl.id,
      label: tpl.title,
      sublabel: tpl.text,
      badge: tpl.category || 'Шаблон',
      icon: <FileText className="w-3.5 h-3.5 text-[#4B59BB]" />,
    })),
  ];

  const threadStatusFilterOptions: NeumorphicSelectOption[] = [
    {
      value: 'all',
      label: `Все диалоги (${threads.length})`,
      badge: `${threads.length}`,
      icon: <MessageSquare className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    {
      value: 'waiting',
      label: `Ожидают ответа (${threads.filter((t) => t.status === 'waiting').length})`,
      badge: `${threads.filter((t) => t.status === 'waiting').length}`,
      icon: <Clock className="w-3.5 h-3.5 text-warning" />,
    },
    {
      value: 'in_progress',
      label: `В работе (${threads.filter((t) => t.status === 'in_progress').length})`,
      badge: `${threads.filter((t) => t.status === 'in_progress').length}`,
      icon: <Activity className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    {
      value: 'vip',
      label: 'VIP и срочные',
      badge: 'VIP',
      icon: <Crown className="w-3.5 h-3.5 text-warning" />,
    },
    {
      value: 'resolved',
      label: 'Решенные вопросы',
      badge: 'Архив',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
    },
  ];

  const customerThreadDropdownOptions: NeumorphicSelectOption[] = filteredThreads.map((th) => {
    const unread = th.unreadCount || 0;
    const orderInfo = th.orderNumber ? `Заказ № ${th.orderNumber}` : th.customerPhone || 'Покупатель';
    const lastMsg = th.messages[th.messages.length - 1];
    const lastMsgText = lastMsg
      ? (lastMsg.isInternalNote ? `🔒 Заметка: ${lastMsg.text}` : lastMsg.text || 'Вложение')
      : 'Новый диалог';

    let badgeText: string | undefined = undefined;
    if (unread > 0) {
      badgeText = `${unread} новых`;
    } else if (th.priority === 'vip') {
      badgeText = '👑 VIP';
    } else if (th.priority === 'urgent') {
      badgeText = '⚡ Срочно';
    } else if (th.status === 'waiting') {
      badgeText = '⏳ Ожидает';
    } else if (th.status === 'resolved') {
      badgeText = '✓ Решен';
    }

    return {
      value: th.id,
      label: th.customerName,
      sublabel: `${orderInfo} • ${lastMsgText}`,
      badge: badgeText,
      icon: th.customerAvatar ? (
        <img
          src={th.customerAvatar}
          alt={th.customerName}
          className="w-5 h-5 rounded-full object-cover shrink-0 border border-white"
        />
      ) : (
        <div className="w-5 h-5 rounded-full neu-inset flex items-center justify-center text-[11px] font-black text-[#4B59BB] shrink-0">
          {th.customerName.charAt(0)}
        </div>
      ),
      description: th.followUpReminder && !th.followUpReminder.completed
        ? `⏰ ${th.followUpReminder.dueDate}: ${th.followUpReminder.note}`
        : undefined,
    };
  });

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'accepted':
        return { label: ORDER_STATUS_LABELS.accepted, class: 'neu-inset text-[#4B59BB] bg-[#E3E8EF]' };
      case 'assembling':
        return { label: ORDER_STATUS_LABELS.assembling, class: 'neu-inset text-warning bg-[#E3E8EF]' };
      case 'in_transit':
        return { label: ORDER_STATUS_LABELS.in_transit, class: 'neu-inset text-[#4A6984] bg-[#E3E8EF]' };
      case 'ready':
        return { label: ORDER_STATUS_LABELS.ready, class: 'neu-inset text-[#635B87] bg-[#E3E8EF]' };
      case 'delivered':
        return { label: ORDER_STATUS_LABELS.delivered, class: 'neu-inset text-success bg-[#E3E8EF]' };
      default:
        return { label: 'Обработка', class: 'neu-inset text-[#4E5C70] bg-[#E3E8EF]' };
    }
  };

  // Filtered products for Product Picker Modal
  const filteredProducts = products.filter((p) => {
    if (productCategoryFilter !== 'all' && p.category !== productCategoryFilter) return false;
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4 text-[#2D3A4E] w-full min-w-0 max-w-full">
      {/* 1. TOP HEADER & KPI METRICS BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#BAC5D5]/50">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
              <MessageSquare className="w-3.5 h-3.5" />
            </span>
            <span className="truncate">Центр поддержки и консультант клиентов</span>
          </h3>
          <p className="text-[11px] text-[#4E5C70] font-medium truncate mt-0.5">
            Мульти-диалоги, персональные рекомендации товаров, управление заказами и служебные заметки
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start lg:self-auto flex-wrap">
          {/* Issue Compensation Promo Button */}
          <button
            type="button"
            onClick={handleOpenPromoModal}
            className="h-9 px-3.5 rounded-xl text-xs font-bold neu-inset text-[#4B59BB] hover:text-[#2D3A4E] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 bg-[#E3E8EF] border border-transparent"
            title="Сгенерировать и отправить промокод компенсации прямо в чат"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Выдать промокод</span>
          </button>

          {/* Template Manager Toggle Button */}
          <button
            type="button"
            onClick={() => setIsManagingTemplates(!isManagingTemplates)}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 bg-[#E3E8EF] ${
              isManagingTemplates
                ? 'neu-inset text-[#4B59BB] font-black border border-[#5F6ED0]/40'
                : 'neu-inset text-[#4E5C70] hover:text-[#2D3A4E] border border-transparent'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isManagingTemplates ? 'Скрыть шаблоны' : 'Шаблоны ответов'}</span>
          </button>

          {/* Clear Chat Button */}
          {onClearChat && (
            <button
              type="button"
              onClick={() => setIsClearChatConfirmOpen(true)}
              className="w-9 h-9 rounded-xl neu-button-danger flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0 border border-transparent"
              title="Очистить историю диалога"
              aria-label="Очистить историю диалога"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Template Manager Panel (Expandable) */}
      {isManagingTemplates && (
        <div className="neu-flat rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-4 bg-[#E3E8EF] border border-white/80 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5">
            <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center text-[#4B59BB]">
                <FileText className="w-3.5 h-3.5" />
              </span>
              <span>{editingTplId ? 'Редактировать шаблон' : 'Добавить быстрый шаблон ответа'}</span>
            </span>
            <span className="text-[11px] text-[#4E5C70] font-bold">Всего шаблонов: {templates.length}</span>
          </div>

          {/* Form to Add / Edit Template */}
          <form onSubmit={handleSaveTemplate} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Краткое название шаблона *
              </label>
              <input
                type="text"
                required
                value={newTplTitle}
                onChange={(e) => setNewTplTitle(e.target.value)}
                placeholder="Подбор размера по росту и весу"
                className="w-full px-3.5 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Категория *
              </label>
              <NeumorphicSelect
                value={newTplCategory}
                onChange={(val) => setNewTplCategory(val as any)}
                options={[
                  { value: 'general', label: 'Общие вопросы' },
                  { value: 'sizes', label: 'Размеры и примерка' },
                  { value: 'delivery', label: 'Доставка и СДЭК' },
                  { value: 'returns', label: 'Возврат и обмен' },
                  { value: 'discounts', label: 'Скидки и промо' },
                  { value: 'payment', label: 'Оплата и чеки' },
                ]}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Текст шаблонного ответа *
              </label>
              <textarea
                rows={2}
                required
                value={newTplText}
                onChange={(e) => setNewTplText(e.target.value)}
                placeholder="Введите готовый текст, который оператор сможет в один клик вставить в диалог..."
                className="w-full p-3 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none"
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
              {editingTplId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTplId(null);
                    setNewTplTitle('');
                    setNewTplText('');
                  }}
                  className="px-4 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 transition-transform cursor-pointer"
              >
                {editingTplId ? 'Сохранить изменения' : 'Добавить в базу быстрых ответов'}
              </button>
            </div>
          </form>

          {/* List of existing templates with edit/delete */}
          <div className="space-y-2 pt-2.5 border-t border-[#BAC5D5]/50">
            <span className="text-[11px] font-black uppercase text-[#4E5C70] tracking-wider block">
              Текущие шаблоны ({templates.length}):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto no-scrollbar">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="neu-flat p-3 rounded-2xl flex items-start justify-between gap-2.5 bg-[#E3E8EF] border border-white/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-black uppercase text-[#4B59BB] neu-inset px-1.5 py-0.5 rounded-md">
                        {tpl.categoryLabel}
                      </span>
                      <span className="text-xs font-bold text-[#2D3A4E] truncate">{tpl.title}</span>
                    </div>
                    <p className="text-[11px] text-[#4E5C70] line-clamp-2 leading-relaxed">{tpl.text}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(tpl)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#4B59BB] active:scale-95 transition-all cursor-pointer"
                      title="Редактировать"
                      aria-label="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateToDelete(tpl.id)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                      title="Удалить"
                      aria-label="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN SPLIT WORKSPACE: INBOX THREADS LIST (LEFT) + ACTIVE CHAT & TOOLS (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full min-w-0 max-w-full">
        {/* LEFT COLUMN: MULTI-DIALOG INBOX LIST */}
        <div className="lg:col-span-4 space-y-3 w-full min-w-0">
          <div className="neu-flat rounded-2xl sm:rounded-3xl p-3.5 space-y-3 bg-[#E3E8EF] border border-white/80">
            {/* Inbox Header & Quick Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center gap-1.5 truncate">
                    <MessageSquare className="w-3.5 h-3.5 text-[#4B59BB] shrink-0" />
                    <span>Диалоги ({filteredThreads.length})</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* View Mode Toggle: Dropdown vs Cards */}
                  <div className="neu-flat-sm rounded-xl p-0.5 flex gap-0.5 bg-[#E3E8EF] text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setViewMode('dropdown')}
                      className={`px-2 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        viewMode === 'dropdown'
                          ? 'neu-pill-active font-black'
                          : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                      }`}
                      title="Выбор клиента в виде выпадающего списка"
                    >
                      Список
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      className={`px-2 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        viewMode === 'cards'
                          ? 'neu-pill-active font-black'
                          : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                      }`}
                      title="Отобразить все карточки диалогов"
                    >
                      Карточки
                    </button>
                  </div>

                </div>
              </div>

              {/* 1. Neumorphic Dropdown: Customer / Thread Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <label className="text-[11px] font-black text-[#4E5C70] uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#4B59BB]" />
                    <span>Выбор клиента:</span>
                  </label>
                  <span className="text-[11px] font-bold text-[#4B59BB]">
                    {filteredThreads.length} диалогов
                  </span>
                </div>
                <NeumorphicSelect
                  value={activeThreadId}
                  onChange={(val) => handleSelectThread(val)}
                  options={customerThreadDropdownOptions}
                  variant="inset"
                  prefix="Клиент:"
                  placeholder="Выберите клиента..."
                  triggerClassName="rounded-2xl py-2.5 px-3 text-xs bg-[#E3E8EF] border border-white/60 font-bold"
                />
              </div>

              {/* 2. Neumorphic Dropdown: Status / Category Filter */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-[#4E5C70] uppercase tracking-wider flex items-center gap-1.5 px-0.5">
                  <Filter className="w-3.5 h-3.5 text-[#4B59BB]" />
                  <span>Фильтр диалогов:</span>
                </label>
                <NeumorphicSelect
                  value={threadFilterTab}
                  onChange={(val) => setThreadFilterTab(val as any)}
                  options={threadStatusFilterOptions}
                  variant="inset"
                  prefix="Категория:"
                  triggerClassName="rounded-2xl py-2 px-3 text-xs bg-[#E3E8EF] border border-white/60 font-bold"
                />
              </div>

              {/* Thread Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#4E5C70] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Поиск по имени, телефону, номеру заказа..."
                  className="w-full pl-9 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] placeholder:text-[#56647A] font-medium"
                />
              </div>
            </div>

            {/* View Mode: Dropdown Focused Mode (Active Client Card Summary) */}
            {viewMode === 'dropdown' ? (
              <div className="pt-1 space-y-3">
                {/* Active Customer Profile & Summary Inset Card */}
                <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] border border-transparent space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar with Badges */}
                      <div className="relative shrink-0">
                        {currentThread.customerAvatar ? (
                          <img
                            src={currentThread.customerAvatar}
                            alt={currentThread.customerName}
                            className="w-12 h-12 rounded-2xl object-cover border-2 border-white"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl neu-inset flex items-center justify-center font-black text-sm text-[#4B59BB] border border-white/60">
                            {currentThread.customerName.charAt(0)}
                          </div>
                        )}

                        {currentThread.priority === 'vip' && (
                          <span
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full neu-button text-warning flex items-center justify-center text-[11px] font-black border border-white"
                            title="VIP клиент"
                          >
                            <Crown className="w-3 h-3" />
                          </span>
                        )}

                        {currentThread.priority === 'urgent' && (
                          <span
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full neu-button text-danger flex items-center justify-center text-[11px] font-black border border-white"
                            title="Срочное обращение"
                          >
                            <Zap className="w-3 h-3" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-black text-[#2D3A4E] truncate">
                            {currentThread.customerName}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#4E5C70] font-mono font-medium truncate">
                          {currentThread.orderNumber ? `Заказ № ${currentThread.orderNumber}` : currentThread.customerPhone || 'Покупатель'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] text-[#4E5C70] font-bold">
                        {currentThread.lastActivity}
                      </span>
                      {currentThread.csatRating && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-lg neu-inset bg-[#E3E8EF] text-warning flex items-center gap-0.5">
                          ★ {currentThread.csatRating}.0
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer Contact Badges */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    {currentThread.customerPhone && (
                      <a
                        href={`tel:${currentThread.customerPhone.replace(/[^\d+]/g, '')}`}
                        className="p-2 neu-flat-sm rounded-xl flex items-center gap-2 text-[#2D3A4E] hover:text-[#4B59BB] transition-colors truncate"
                      >
                        <Phone className="w-3.5 h-3.5 text-success shrink-0" />
                        <span className="truncate font-bold">{currentThread.customerPhone}</span>
                      </a>
                    )}
                    {currentThread.customerEmail && (
                      <div className="p-2 neu-flat-sm rounded-xl flex items-center gap-2 text-[#2D3A4E] truncate">
                        <UserCheck className="w-3.5 h-3.5 text-[#4B59BB] shrink-0" />
                        <span className="truncate font-medium">{currentThread.customerEmail}</span>
                      </div>
                    )}
                  </div>

                  {/* Last Message Excerpt */}
                  {currentThread.messages.length > 0 && (
                    <div className="pt-2 border-t border-[#BAC5D5]/40 text-xs text-[#4E5C70] space-y-1">
                      <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                        Последнее сообщение:
                      </span>
                      <p className="line-clamp-2 text-[#2D3A4E] font-medium leading-relaxed neu-inset p-2.5 rounded-xl bg-[#E3E8EF]">
                        {currentThread.messages[currentThread.messages.length - 1].isInternalNote ? (
                          <span className="text-warning font-bold flex items-center gap-1">
                            <Lock className="w-3 h-3 shrink-0" />
                            <span>Заметка: {currentThread.messages[currentThread.messages.length - 1].text}</span>
                          </span>
                        ) : (
                          currentThread.messages[currentThread.messages.length - 1].text || 'Вложение к сообщению'
                        )}
                      </p>
                    </div>
                  )}

                  {/* Follow-up reminder if set */}
                  {currentThread.followUpReminder && !currentThread.followUpReminder.completed && (
                    <div className="flex items-center gap-2 text-[11px] font-bold text-warning neu-inset p-2.5 rounded-xl bg-[#E3E8EF] border border-warning/20">
                      <Clock className="w-4 h-4 text-warning shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="block font-black">{currentThread.followUpReminder.dueDate}</span>
                        <span className="text-[11px] font-normal text-[#4E5C70] truncate block">
                          {currentThread.followUpReminder.note}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {currentThread.tags && currentThread.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {currentThread.tags.map((tag, idx) => {
                        const tagLabels: Record<string, { label: string; color: string }> = {
                          sizing: { label: 'Размеры', color: 'text-[#4B59BB]' },
                          delivery: { label: 'Доставка', color: 'text-warning' },
                          return: { label: 'Возврат', color: 'text-danger' },
                          consultation: { label: 'Консультация', color: 'text-success' },
                          complaint: { label: 'Претензия', color: 'text-danger' },
                        };
                        const info = tagLabels[tag] || { label: tag, color: 'text-[#4E5C70]' };
                        return (
                          <span
                            key={`tag-${tag}-${idx}`}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-lg neu-inset bg-[#E3E8EF] ${info.color}`}
                          >
                            #{info.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsProductPickerOpen(true)}
                      className="py-2 px-2.5 neu-button rounded-xl text-[11px] font-bold text-[#4B59BB] flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Товар из каталога</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReminderModalOpen(true)}
                      className="py-2 px-2.5 neu-button rounded-xl text-[11px] font-bold text-warning flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>{currentThread.followUpReminder ? 'Напоминание' : 'Напомнить'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Threads List Items (Expanded Cards View Mode) */
              <div className="space-y-3 max-h-[620px] overflow-y-auto no-scrollbar pr-0.5 pt-1">
                {filteredThreads.length === 0 ? (
                  <div className="text-center py-10 px-4 neu-inset rounded-2xl bg-[#E3E8EF] text-xs text-[#4E5C70] font-medium space-y-1">
                    <p className="font-bold text-[#2D3A4E]">Диалогов не найдено</p>
                    <p className="text-[11px]">Попробуйте изменить поисковый запрос или фильтр</p>
                  </div>
                ) : (
                  filteredThreads.map((thread, threadIdx) => {
                    const isSelected = thread.id === activeThreadId;
                    const lastMsg = thread.messages[thread.messages.length - 1];
                    const unread = thread.unreadCount || 0;

                    return (
                      <div
                        key={`thread-${thread.id}-${threadIdx}`}
                        onClick={() => handleSelectThread(thread.id)}
                        className={`p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl transition-all cursor-pointer border relative overflow-hidden bg-[#E3E8EF] ${
                          isSelected
                            ? 'neu-pill-active border-transparent'
                            : 'neu-flat border-transparent hover:border-[#5F6ED0]/30 active:scale-[0.99]'
                        }`}
                      >
                        {/* Top Header: Avatar + Customer Details + Time/Badges */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar with Status Emblems */}
                            <div className="relative shrink-0">
                              {thread.customerAvatar ? (
                                <img
                                  src={thread.customerAvatar}
                                  alt={thread.customerName}
                                  className="w-11 h-11 rounded-2xl object-cover border-2 border-white"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-2xl neu-inset flex items-center justify-center font-black text-sm text-[#4B59BB] border border-white/60">
                                  {thread.customerName.charAt(0)}
                                </div>
                              )}

                              {/* VIP Badge */}
                              {thread.priority === 'vip' && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full neu-button text-warning flex items-center justify-center text-[11px] font-black border border-white"
                                  title="VIP клиент"
                                >
                                  <Crown className="w-3 h-3" />
                                </span>
                              )}

                              {/* Urgent Badge */}
                              {thread.priority === 'urgent' && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full neu-button text-danger flex items-center justify-center text-[11px] font-black border border-white"
                                  title="Срочное обращение"
                                >
                                  <Zap className="w-3 h-3" />
                                </span>
                              )}
                            </div>

                            {/* Customer Name & Order / Phone Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-black text-[#2D3A4E] truncate tracking-tight">
                                  {thread.customerName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11px] text-[#4E5C70] font-mono font-medium truncate">
                                  {thread.orderNumber ? `Заказ № ${thread.orderNumber}` : thread.customerPhone || 'Покупатель'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Top-Right: Time & Badges */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className="text-[11px] text-[#4E5C70] font-bold">
                              {thread.lastActivity}
                            </span>

                            {/* Unread Counter Badge */}
                            {unread > 0 && (
                              <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#5F6ED0] text-white text-[11px] font-black flex items-center justify-center">
                                {unread}
                              </span>
                            )}

                            {/* Resolved Status Checkmark Badge */}
                            {thread.status === 'resolved' && unread === 0 && (
                              <span className="w-5 h-5 rounded-full neu-inset flex items-center justify-center text-success" title="Вопрос решен">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            )}

                            {/* Waiting status indicator */}
                            {thread.status === 'waiting' && unread === 0 && (
                              <span className="w-2.5 h-2.5 rounded-full bg-warning animate-pulse" title="Ожидает ответа" />
                            )}
                          </div>
                        </div>

                        {/* Middle: Last Message Preview */}
                        {lastMsg && (
                          <div className="mt-2.5 pt-2 border-t border-[#BAC5D5]/40 text-[11px] sm:text-xs text-[#4E5C70] leading-relaxed">
                            {lastMsg.isInternalNote ? (
                              <span className="text-warning font-bold flex items-center gap-1">
                                <Lock className="w-3 h-3 shrink-0" />
                                <span className="truncate">Заметка: {lastMsg.text}</span>
                              </span>
                            ) : (
                              <p className="line-clamp-2 text-[#2D3A4E]/90 font-normal">
                                {lastMsg.text || (lastMsg.productCard ? '🛍️ Рекомендация товара из каталога' : '📷 Прикреплено фото')}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Reminder / Follow-up Alert Box */}
                        {thread.followUpReminder && !thread.followUpReminder.completed && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-warning neu-inset px-2.5 py-1.5 rounded-xl bg-[#E3E8EF] border border-white/40">
                            <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
                            <span className="truncate">
                              <span className="font-black text-warning">{thread.followUpReminder.dueDate}:</span>{' '}
                              {thread.followUpReminder.note}
                            </span>
                          </div>
                        )}

                        {/* Tags / Topics Row */}
                        {thread.tags && thread.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1 items-center">
                            {thread.tags.map((tag, tagIdx) => {
                              const tagLabels: Record<string, { label: string; color: string }> = {
                                sizing: { label: 'Размеры', color: 'text-[#4B59BB]' },
                                delivery: { label: 'Доставка', color: 'text-warning' },
                                return: { label: 'Возврат', color: 'text-danger' },
                                consultation: { label: 'Консультация', color: 'text-success' },
                                complaint: { label: 'Претензия', color: 'text-danger' },
                              };
                              const info = tagLabels[tag] || { label: tag, color: 'text-[#4E5C70]' };
                              return (
                                <span
                                  key={`thread-tag-${tag}-${tagIdx}`}
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md neu-inset bg-[#E3E8EF] ${info.color}`}
                                >
                                  {info.label}
                                </span>
                              );
                            })}
                            {thread.csatRating && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md neu-inset bg-[#E3E8EF] text-warning ml-auto flex items-center gap-0.5">
                                ★ {thread.csatRating}.0
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE CHAT CONTEXT & MESSAGING WORKSPACE */}
        <div className="lg:col-span-8 space-y-4 w-full min-w-0 max-w-full">
          <div className="neu-flat rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 space-y-4 w-full min-w-0 max-w-full overflow-hidden bg-[#E3E8EF] border border-white/80">
            {/* THREAD HEADER: CUSTOMER DETAILS, PRIORITY, REMINDER, AND TICKET STATUS */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-transparent space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl neu-inset text-[#4B59BB] flex items-center justify-center font-black shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs sm:text-sm font-black text-[#2D3A4E] truncate">
                        {currentThread.customerName}
                      </h4>
                      {currentThread.customerPhone && (
                        <span className="text-[11px] text-[#4E5C70] font-mono">
                          {currentThread.customerPhone}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] pt-0.5 flex-wrap">
                      <span>Диалог: <strong>{currentMessages.length} сообщ.</strong></span>
                      <span>•</span>
                      <span>Email: {currentThread.customerEmail || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Priority Controls */}
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  {/* Priority Selector */}
                  <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF] text-[11px] font-bold">
                    {[
                      { id: 'standard', label: 'Стандарт' },
                      { id: 'urgent', label: 'Срочно' },
                      { id: 'vip', label: 'VIP' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleUpdateThreadPriority(p.id as any)}
                        className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          currentThread.priority === p.id
                            ? 'neu-pill-active font-black'
                            : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Reminder Button */}
                  <button
                    type="button"
                    onClick={() => setIsReminderModalOpen(true)}
                    className={`h-7 px-2.5 neu-inset rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 bg-[#E3E8EF] border border-transparent ${
                      currentThread.followUpReminder
                        ? 'text-warning font-black'
                        : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                    title="Установить напоминание для оператора"
                  >
                    <Bell className="w-3 h-3 text-[#4E5C70]" />
                    <span>{currentThread.followUpReminder ? 'Напоминание' : '+ Напомнить'}</span>
                  </button>

                  {/* Status Dropdown / Buttons */}
                  <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF] text-[11px] font-bold">
                    {[
                      { id: 'in_progress', label: 'В работе', color: 'text-warning' },
                      { id: 'resolved', label: 'Решен', color: 'text-success' },
                      { id: 'closed', label: 'Закрыт', color: 'text-[#4E5C70]' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleUpdateThreadStatus(st.id as any)}
                        className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          currentThread.status === st.id
                            ? 'neu-pill-active font-black'
                            : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Scheduled Reminder Banner */}
              {currentThread.followUpReminder && (
                <div className="neu-inset rounded-xl p-2.5 bg-[#E3E8EF] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-[#2D3A4E] min-w-0">
                    <span className="w-6 h-6 rounded-lg neu-inset flex items-center justify-center text-warning shrink-0 bg-[#E3E8EF]">
                      <Clock className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[11px] font-bold truncate">
                      <strong>Напоминание ({currentThread.followUpReminder.dueDate}):</strong> {currentThread.followUpReminder.note}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDismissReminder}
                    className="px-2 py-1 neu-inset rounded-lg text-[11px] font-black text-success flex items-center gap-1 cursor-pointer shrink-0 bg-[#E3E8EF] border border-transparent"
                  >
                    <Check className="w-3 h-3 text-success" />
                    <span>Выполнено</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. ACTIVE ORDER CONTEXT WIDGET & DIRECT ACTIONS */}
            {selectedOrderContext && (
              <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-transparent space-y-3 w-full min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-[#2D3A4E] uppercase tracking-wider block truncate">
                          Заказ № {selectedOrderContext.id}
                        </span>
                        {(() => {
                          const badge = getStatusBadge(selectedOrderContext.status);
                          return (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.class}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </div>
                      <span className="text-[11px] text-[#4E5C70] block truncate">
                        Сумма: {(selectedOrderContext.totalPrice || 0).toLocaleString('ru-RU')} ₽ • {selectedOrderContext.deliveryAddress || 'Москва'}
                      </span>
                    </div>
                  </div>

                  {/* Order Actions Toolbar */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsOrderStatusModalOpen(true)}
                      className="h-8 px-2.5 neu-inset rounded-xl text-[11px] font-bold text-[#4B59BB] flex items-center gap-1 active:scale-95 cursor-pointer bg-[#E3E8EF] border border-transparent"
                      title="Изменить статус заказа и отправить уведомление"
                    >
                      <Truck className="w-3 h-3 text-[#4B59BB]" />
                      <span>Изменить статус</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsReturnModalOpen(true)}
                      className="h-8 px-2.5 neu-inset rounded-xl text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1 active:scale-95 cursor-pointer bg-[#E3E8EF] border border-transparent"
                      title="Оформить возврат или обмен"
                    >
                      <RotateCcw className="w-3 h-3 text-[#4E5C70]" />
                      <span>Возврат/Обмен</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsInvoiceModalOpen(true)}
                      className="h-8 px-2.5 neu-inset rounded-xl text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1 cursor-pointer bg-[#E3E8EF] border border-transparent"
                      title="Просмотреть детали накладной заказа"
                    >
                      <FileText className="w-3 h-3 text-[#4E5C70]" />
                      <span>Накладная</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowOrderWidget(!showOrderWidget)}
                      className="h-8 px-2 neu-inset rounded-xl text-[11px] text-[#4E5C70] cursor-pointer bg-[#E3E8EF] border border-transparent"
                      title={showOrderWidget ? 'Свернуть состав заказа' : 'Развернуть состав заказа'}
                      aria-label={showOrderWidget ? 'Свернуть состав заказа' : 'Развернуть состав заказа'}
                    >
                      {showOrderWidget ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Order Items */}
                {showOrderWidget && (
                  <div className="pt-2 border-t border-[#BAC5D5]/50 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(selectedOrderContext.items || []).map((item, idx) => {
                        const itemImg =
                          item.product?.images?.[0] ||
                          'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80';
                        return (
                          <div
                            key={`order-ctx-item-${item.id || idx}-${idx}`}
                            className="neu-inset p-2 rounded-xl flex items-center gap-2 bg-[#E3E8EF]"
                          >
                            <img
                              src={itemImg}
                              alt={item.product?.title || 'Товар'}
                              className="w-8 h-8 rounded-lg object-cover border border-white shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-[#2D3A4E] truncate">
                                {item.product?.title || 'Товар'}
                              </p>
                              <p className="text-[11px] text-[#4E5C70] truncate">
                                {item.selectedColor} • {item.selectedSize} • {item.quantity} шт.
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MESSAGE & TOPIC FILTER DROPDOWNS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-1">
              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1 px-0.5 flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-[#4B59BB]" />
                  <span>Фильтр по автору:</span>
                </label>
                <NeumorphicSelect
                  value={filter}
                  onChange={(val) => setFilter(val as any)}
                  options={senderFilterOptions}
                  variant="inset"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1 px-0.5 flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-[#4B59BB]" />
                  <span>Тематика диалога:</span>
                </label>
                <NeumorphicSelect
                  value={tagFilter}
                  onChange={(val) => setTagFilter(val)}
                  options={topicFilterOptions}
                  variant="inset"
                  className="w-full"
                />
              </div>
            </div>

            {/* 4. CHAT MESSAGES STREAM */}
            <div className="neu-inset rounded-2xl p-3.5 space-y-3 max-h-[380px] overflow-y-auto no-scrollbar bg-[#E3E8EF] border border-[#BAC5D5]/40">
              {filteredMessages.length === 0 ? (
                <div className="text-center py-10 text-xs text-[#4E5C70]">
                  Нет сообщений в этой категории
                </div>
              ) : (
                filteredMessages.map((msg, msgIdx) => {
                  const isUser = msg.sender === 'user';
                  const isInternal = !!msg.isInternalNote;

                  return (
                    <div
                      key={msg.id ? `msg-${msg.id}-${msgIdx}` : `msg-${msgIdx}`}
                      className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} space-y-1`}
                    >
                      {/* Sender label badge */}
                      <div className="flex items-center gap-1.5 px-1">
                        {isInternal ? (
                          <span className="text-[11px] font-black text-warning flex items-center gap-1 neu-inset px-2 py-0.5 rounded-md bg-[#E3E8EF] border border-warning/20">
                            <Lock className="w-3 h-3 text-warning" />
                            Внутренняя заметка для коллег (клиент не видит)
                          </span>
                        ) : isUser ? (
                          <span className="text-[11px] font-bold text-[#4E5C70] flex items-center gap-1">
                            <User className="w-3 h-3 text-[#4B59BB]" />
                            Покупатель
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-success flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-success" />
                            Оператор поддержки
                          </span>
                        )}
                        <span className="text-[11px] text-[#4E5C70]">{msg.timestamp}</span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`p-3.5 rounded-2xl text-xs max-w-[88%] space-y-2.5 leading-relaxed ${
                          isInternal
                            ? 'neu-inset bg-[#E3E8EF] border border-warning/40 text-[#2D3A4E] font-medium'
                            : isUser
                            ? 'neu-inset bg-[#E3E8EF] text-[#2D3A4E] border border-transparent'
                            : 'neu-bubble-own font-medium'
                        }`}
                      >
                        {msg.text && <p className="whitespace-pre-line">{msg.text}</p>}

                        {/* Photo Attachment preview */}
                        {msg.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewImageModal(msg.imageUrl || null)}
                            className="relative group rounded-xl overflow-hidden block border border-white/40 max-w-full bg-black/10 transition-transform active:scale-[0.98] cursor-pointer text-left shadow-sm"
                          >
                            <img
                              src={msg.imageUrl}
                              alt="Прикрепленное фото"
                              className="max-h-60 sm:max-h-72 w-auto max-w-[240px] sm:max-w-[280px] rounded-xl object-contain block mx-auto"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-[11px] font-bold">
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>Увеличить фото</span>
                            </div>
                          </button>
                        )}

                        {/* Interactive Product Card Attachment */}
                        {msg.productCard && (
                          <div className="pt-1">
                            <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] border border-transparent text-[#2D3A4E] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-[#4B59BB] uppercase tracking-wider flex items-center gap-1">
                                  <ShoppingBag className="w-3 h-3 text-[#4B59BB]" />
                                  Рекомендация товара
                                </span>
                                <span className="text-[11px] font-black text-[#2D3A4E]">
                                  {msg.productCard.price.toLocaleString('ru-RU')} ₽
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <img
                                  src={msg.productCard.image}
                                  alt={msg.productCard.title}
                                  className="w-12 h-12 rounded-xl object-cover border border-white shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-extrabold text-xs text-[#2D3A4E] truncate">
                                    {msg.productCard.title}
                                  </p>
                                  <p className="text-[11px] text-[#4E5C70] pt-0.5">
                                    Размер: <strong className="text-[#4B59BB]">{msg.productCard.size || 'M'}</strong> • {msg.productCard.color || 'Базовый'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Interactive Order Status Update Card */}
                        {msg.orderStatusUpdate && (
                          <div className="pt-1">
                            <div className="neu-inset rounded-2xl p-2.5 bg-[#E3E8EF] border border-transparent text-[#2D3A4E] space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-[#4B59BB] uppercase tracking-wider flex items-center gap-1">
                                  <Truck className="w-3 h-3 text-[#4B59BB]" />
                                  Обновление заказа № {msg.orderStatusUpdate.orderId}
                                </span>
                              </div>
                              <div className="text-[11px] font-bold text-success">
                                Новый статус: {msg.orderStatusUpdate.newStatusLabel}
                              </div>
                              {msg.orderStatusUpdate.trackingNumber && (
                                <p className="text-[11px] font-mono text-[#4E5C70]">
                                  Трек-номер: {msg.orderStatusUpdate.trackingNumber}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Interactive Promo Code Card */}
                        {msg.promoCard && (
                          <div className="pt-1">
                            <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] border border-transparent text-[#2D3A4E] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-[#4B59BB] uppercase tracking-wider flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-[#4B59BB]" />
                                  Персональный промокод
                                </span>
                                <span className="text-[11px] font-extrabold text-success neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF]">
                                  {msg.promoCard.discountType === 'fixed'
                                    ? `-${msg.promoCard.discountValue.toLocaleString('ru-RU')} ₽`
                                    : `-${msg.promoCard.discountValue}%`}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 p-2 neu-inset rounded-xl bg-[#E3E8EF]">
                                <span className="font-mono font-black text-xs text-[#2D3A4E]">
                                  {msg.promoCard.code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(msg.promoCard!.code)}
                                  className="px-2 py-1 neu-inset rounded-lg text-[11px] font-bold text-[#4B59BB] flex items-center gap-1 bg-[#E3E8EF]"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>{copiedCode === msg.promoCard.code ? 'Скопировано' : 'Копировать'}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* 5. REPLY & ATTACHMENT COMPOSER */}
            <form onSubmit={handleSend} className="space-y-3 pt-1">
              {/* TOP COMPOSER DROPDOWNS: Mode and Attachments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1 px-0.5 flex items-center gap-1.5">
                    {isInternalNote ? (
                      <Lock className="w-3 h-3 text-warning" />
                    ) : (
                      <MessageSquare className="w-3 h-3 text-[#4B59BB]" />
                    )}
                    <span>Тип сообщения:</span>
                  </label>
                  <NeumorphicSelect
                    value={isInternalNote ? 'note' : 'client'}
                    onChange={(val) => setIsInternalNote(val === 'note')}
                    options={composerModeOptions}
                    variant="inset"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1 px-0.5 flex items-center gap-1.5">
                    <Paperclip className="w-3 h-3 text-[#4B59BB]" />
                    <span>Прикрепить вложение:</span>
                  </label>
                  <NeumorphicSelect
                    value="none"
                    onChange={(val) => {
                      if (val === 'product') {
                        handleOpenProductPicker();
                      } else if (val === 'photo') {
                        fileInputRef.current?.click();
                      }
                    }}
                    options={attachmentActionOptions}
                    placeholder="Прикрепить к ответу..."
                    variant="inset"
                    className="w-full"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Photo preview pill if attached */}
              {selectedPhoto && (
                <div className="neu-inset p-2 rounded-xl flex items-center justify-between gap-2 bg-[#E3E8EF]">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={selectedPhoto} alt="Вложение" className="w-8 h-8 rounded-lg object-cover border border-white" />
                    <span className="text-[11px] font-bold text-[#2D3A4E] truncate">Фото прикреплено к сообщению</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    className="p-1 rounded-lg neu-inset text-danger cursor-pointer bg-[#E3E8EF] border border-transparent"
                    aria-label="Закрыть"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Text Input Area */}
              <div className="relative">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    isInternalNote
                      ? 'Напишите служебную заметку для коллег и администраторов (клиент ее не увидит)...'
                      : 'Напишите ответ покупателю (Shift+Enter для переноса строки)...'
                  }
                  className={`w-full p-3.5 neu-inset rounded-2xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none transition-all ${
                    isInternalNote ? 'border border-warning/40' : ''
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                />
              </div>

              {/* Bottom Quick Templates Dropdown & Send Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <NeumorphicSelect
                    value=""
                    onChange={(tplId) => {
                      if (!tplId) return;
                      const tpl = templates.find((t) => t.id === tplId);
                      if (tpl) {
                        setReplyText(tpl.text);
                        onShowToast(`Шаблон «${tpl.title}» вставлен в поле ввода`, 'info');
                      }
                    }}
                    options={quickTemplateDropdownOptions}
                    placeholder="⚡ Вставить быстрый ответ (шаблон)..."
                    variant="inset"
                    placement="top"
                    className="w-full"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!replyText.trim() && !selectedPhoto}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
                    isInternalNote
                      ? 'neu-button bg-warning-soft text-warning font-black border border-warning/40'
                      : 'neu-button-accent text-white border border-white/40'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isInternalNote ? 'Сохранить заметку' : 'Отправить ответ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* --- MODAL 1: PRODUCT PICKER & RECOMMENDATION BUILDER --- */}
      {isProductPickerOpen && (
        <div className="fixed inset-0 z-[80] bg-[#2D3A4E]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 w-full max-w-xl bg-[#E3E8EF] border border-white/80 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Подбор и рекомендация товара
                  </h4>
                  <p className="text-[11px] text-[#4E5C70]">
                    Отправьте клиенту интерактивную карточку товара с возможностью быстрой покупки
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Search & Category Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#4E5C70] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Поиск товара по каталогу..."
                  className="w-full pl-8 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
              </div>

              <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF] text-[11px] font-bold overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'Все товары' },
                  { id: 'shirts', label: 'Рубашки' },
                  { id: 'jackets', label: 'Пиджаки' },
                  { id: 'trousers', label: 'Брюки' },
                  { id: 'sweatshirts', label: 'Свитшоты' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setProductCategoryFilter(cat.id)}
                    className={`py-1 px-2.5 rounded-lg whitespace-nowrap cursor-pointer ${
                      productCategoryFilter === cat.id ? 'neu-pill-active font-black' : 'text-[#4E5C70]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Selection Grid */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold text-[#4E5C70] uppercase tracking-wider block">
                Выберите товар из каталога:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto no-scrollbar">
                {filteredProducts.map((p) => {
                  const isSelected = selectedProductToRecommend?.id === p.id;
                  const img = p.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80';
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProductToRecommend(p);
                        setRecommendColor(p.colors?.[0]?.name || 'Базовый');
                        setRecommendSize(p.sizes?.[0] || 'M');
                      }}
                      className={`p-2 rounded-xl flex items-center gap-2 cursor-pointer transition-all border ${
                        isSelected
                          ? 'neu-pill-active border-transparent'
                          : 'neu-flat border-transparent bg-[#E3E8EF] hover:border-white/60'
                      }`}
                    >
                      <img src={img} alt={p.title} className="w-10 h-10 rounded-lg object-cover border border-white shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-[#2D3A4E] truncate">{p.title}</p>
                        <p className="text-[11px] font-black text-[#4B59BB]">
                          {p.price.toLocaleString('ru-RU')} ₽
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Configuration: Size, Color & Stylist Note */}
            {selectedProductToRecommend && (
              <div className="space-y-3 pt-2 border-t border-[#BAC5D5]/50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Рекомендуемый размер:
                    </label>
                    <NeumorphicSelect
                      value={recommendSize}
                      onChange={(val) => setRecommendSize(val)}
                      options={(selectedProductToRecommend.sizes || ['S', 'M', 'L', 'XL', 'XXL']).map((s) => ({
                        value: s,
                        label: `Размер ${s}`,
                      }))}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Цвет модели:
                    </label>
                    <input
                      type="text"
                      value={recommendColor}
                      onChange={(e) => setRecommendColor(e.target.value)}
                      placeholder="Бежевый, Графит..."
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Комментарий стилиста / рекомендация по посадке:
                  </label>
                  <textarea
                    rows={2}
                    value={recommendNote}
                    onChange={(e) => setRecommendNote(e.target.value)}
                    placeholder="Например: Идеально сочетается с вещами из вашего заказа..."
                    className="w-full p-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                className="px-4 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSendProductCard}
                disabled={!selectedProductToRecommend}
                className="px-5 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Отправить карточку в чат</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CHANGE ORDER STATUS & NOTIFY CLIENT --- */}
      {isOrderStatusModalOpen && selectedOrderContext && (
        <div className="fixed inset-0 z-[80] bg-[#2D3A4E]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 w-full max-w-md bg-[#E3E8EF] border border-white/80 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Статус заказа № {selectedOrderContext.id}
                  </h4>
                  <p className="text-[11px] text-[#4E5C70]">
                    Смена этапа доставки и уведомление клиента
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderStatusModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmOrderStatusUpdate} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Новый статус заказа *
                </label>
                <NeumorphicSelect
                  value={newOrderStatus}
                  onChange={(val) => setNewOrderStatus(val as any)}
                  options={[
                    { value: 'accepted', label: 'Принят в обработку' },
                    { value: 'assembling', label: 'Собирается на складе' },
                    { value: 'in_transit', label: 'В пути / Передан в СДЭК' },
                    { value: 'ready', label: 'Готов к выдаче в бутике' },
                    { value: 'delivered', label: 'Успешно доставлен' },
                  ]}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Трек-номер отправления (СДЭК / Почта РФ)
                </label>
                <input
                  type="text"
                  value={newTrackingNumber}
                  onChange={(e) => setNewTrackingNumber(e.target.value)}
                  placeholder="Например: CDEK-9928174"
                  className="w-full px-3 py-2 neu-inset rounded-xl text-xs font-mono text-[#2D3A4E] font-bold bg-[#E3E8EF]"
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 neu-inset rounded-xl bg-[#E3E8EF] cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyCustomerOnStatusChange}
                  onChange={(e) => setNotifyCustomerOnStatusChange(e.target.checked)}
                  className="w-4 h-4 rounded text-[#4B59BB] accent-[#5F6ED0]"
                />
                <span className="text-xs font-bold text-[#2D3A4E]">
                  Автоматически отправить уведомление в чат покупателя
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOrderStatusModalOpen(false)}
                  className="px-4 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 cursor-pointer"
                >
                  Обновить статус
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: RETURN / EXCHANGE FORM --- */}
      {isReturnModalOpen && selectedOrderContext && (
        <div className="fixed inset-0 z-[80] bg-[#2D3A4E]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 w-full max-w-md bg-[#E3E8EF] border border-white/80 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Возврат / Обмен по заказу № {selectedOrderContext.id}
                  </h4>
                  <p className="text-[11px] text-[#4E5C70]">Регистрация заявки и забор товара</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReturnRequest} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Причина возврата или обмена *
                </label>
                <NeumorphicSelect
                  value={returnReason}
                  onChange={(val) => setReturnReason(val)}
                  options={[
                    { value: 'Не подошел размер (нужен меньше/больше)', label: 'Не подошел размер' },
                    { value: 'Фасон или оттенок не соответствуют ожиданиям', label: 'Не подошел фасон/цвет' },
                    { value: 'Обнаружен производственный дефект', label: 'Производственный дефект' },
                    { value: 'Передумал / Возврат средств', label: 'Отказ от покупки' },
                  ]}
                />
              </div>

              <div className="p-3 neu-inset rounded-xl bg-[#E3E8EF] text-xs text-[#4E5C70] space-y-1">
                <p className="font-bold text-[#2D3A4E]">Политика обмена:</p>
                <p>Бесплатный выезд курьера в течение 14 дней с момента получения заказа.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 cursor-pointer"
                >
                  Оформить заявку
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: INVOICE & ORDER SUMMARY --- */}
      {isInvoiceModalOpen && selectedOrderContext && (
        <div className="fixed inset-0 z-[80] bg-[#2D3A4E]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 w-full max-w-lg bg-[#E3E8EF] border border-white/80 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Накладная заказа № {selectedOrderContext.id}
                  </h4>
                  <p className="text-[11px] text-[#4E5C70]">от {selectedOrderContext.date}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="neu-inset p-3 rounded-2xl bg-[#E3E8EF] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#4E5C70]">Получатель:</span>
                  <span className="font-bold text-[#2D3A4E]">{currentThread.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#4E5C70]">Телефон:</span>
                  <span className="font-mono font-bold text-[#2D3A4E]">{currentThread.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#4E5C70]">Адрес доставки:</span>
                  <span className="font-bold text-[#2D3A4E] text-right">{selectedOrderContext.deliveryAddress || 'Москва'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#4E5C70]">Способ оплаты:</span>
                  <span className="font-bold text-[#4B59BB]">Онлайн картой (Оплачено)</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-black uppercase text-[#4E5C70] tracking-wider block">
                  Товарные позиции:
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                  {(selectedOrderContext.items || []).map((it, idx) => (
                    <div key={idx} className="neu-flat p-2.5 rounded-xl flex items-center justify-between gap-2 bg-[#E3E8EF]">
                      <div className="min-w-0">
                        <p className="font-bold text-[#2D3A4E] truncate">{it.product?.title}</p>
                        <p className="text-[11px] text-[#4E5C70]">{it.selectedColor} • {it.selectedSize} • {it.quantity} шт.</p>
                      </div>
                      <span className="font-black text-[#2D3A4E] shrink-0">
                        {((it.product?.price || 0) * (it.quantity || 1)).toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="neu-flat p-3 rounded-xl flex items-center justify-between bg-[#E3E8EF] border border-white/80">
                <span className="font-black text-sm text-[#2D3A4E]">Итоговая сумма:</span>
                <span className="font-black text-base text-[#4B59BB]">
                  {(selectedOrderContext.totalPrice || 0).toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="px-5 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 5: FOLLOW-UP REMINDER SCHEDULER --- */}
      {isReminderModalOpen && (
        <div className="fixed inset-0 z-[80] bg-[#2D3A4E]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 w-full max-w-md bg-[#E3E8EF] border border-white/80 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-warning shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Напоминание по диалогу
                  </h4>
                  <p className="text-[11px] text-[#4E5C70]">Контроль повторного контакта с клиентом</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReminder} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Срок напоминания:
                </label>
                <NeumorphicSelect
                  value={reminderDatePreset}
                  onChange={(val) => setReminderDatePreset(val)}
                  options={[
                    { value: '30min', label: 'Через 30 минут' },
                    { value: '2h', label: 'Через 2 часа' },
                    { value: 'tomorrow', label: 'Завтра в 10:00' },
                    { value: '2days', label: 'Через 2 дня' },
                  ]}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Текст задачи оператору *
                </label>
                <textarea
                  rows={2}
                  required
                  value={reminderNoteText}
                  onChange={(e) => setReminderNoteText(e.target.value)}
                  placeholder="Например: Уточнить у логиста СДЭК статус доставки посылки..."
                  className="w-full p-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReminderModalOpen(false)}
                  className="px-4 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 cursor-pointer"
                >
                  Установить напоминание
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 6: PROMO COMPENSATION GENERATOR --- */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-[80] bg-[#2D3A4E]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 w-full max-w-md bg-[#E3E8EF] border border-white/80 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                    Выписать промокод компенсации
                  </h4>
                  <p className="text-[11px] text-[#4E5C70]">Отправка персонального дисконта в чат</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIssuePromoCode} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Тип скидки *
                  </label>
                  <NeumorphicSelect
                    value={promoType}
                    onChange={(val) => setPromoType(val as any)}
                    options={[
                      { value: 'fixed', label: 'Фикс. сумма (₽)' },
                      { value: 'percent', label: 'Процент (%)' },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Номинал *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={promoValue}
                    onChange={(e) => setPromoValue(Number(e.target.value))}
                    className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Код промокода *
                </label>
                <input
                  type="text"
                  required
                  value={promoCodeName}
                  onChange={(e) => setPromoCodeName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs font-mono font-black text-[#4B59BB] tracking-wider bg-[#E3E8EF]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Причина / Описание *
                </label>
                <input
                  type="text"
                  required
                  value={promoReason}
                  onChange={(e) => setPromoReason(e.target.value)}
                  className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPromoModalOpen(false)}
                  className="px-4 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 cursor-pointer"
                >
                  Выписать и отправить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHOTO PREVIEW MODAL */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImageModal(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80 transition-all z-10"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImageModal}
              alt="Увеличенное изображение"
              className="max-h-[80vh] w-auto rounded-2xl object-contain border border-white/20 neu-modal"
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={templateToDelete !== null}
        title="Удалить шаблон?"
        message="Шаблон быстрого ответа будет удален из списка."
        onConfirm={() => templateToDelete && handleDeleteTemplate(templateToDelete)}
        onClose={() => setTemplateToDelete(null)}
      />
      <ConfirmDialog
        isOpen={isClearChatConfirmOpen}
        title="Очистить историю диалога?"
        message="Все сообщения этого диалога будут удалены и у покупателя, и в панели администратора. Это действие нельзя отменить."
        confirmLabel="Очистить"
        onConfirm={() => onClearChat?.()}
        onClose={() => setIsClearChatConfirmOpen(false)}
      />
    </div>
  );
};
