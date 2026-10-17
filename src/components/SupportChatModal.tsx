import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Headphones,
  Phone,
  UserCheck,
  Camera,
  Maximize2,
  Sparkles,
  Copy,
  Check,
  ShoppingBag,
  ArrowRight,
  Truck,
  Loader2,
  RotateCw,
  Bot,
  MessageCircle,
  Pencil,
  BellRing,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { ChatMessage, Product, StoreSchedule, SupportStatus } from '../types';
import { buyerPrice } from '../utils/wholesaleOffer';
import { canCustomerChangeMessage, type ChatMessageChange } from '../utils/firebaseSync';
import { ChatMessageDeleteDialog, ChatMessageMenu } from './ChatMessageActions';
import { copyToClipboard } from '../utils/clipboard';
import { compressChatImageFile } from '../utils/imageUpload';
import { currentStoreName, telHref } from '../utils/storeContacts';
import { ModalPortal } from './ModalPortal';
import { useDialogA11y } from '../utils/useDialogA11y';
import type { Firestore } from 'firebase/firestore';
import { ChatPhoto, hasChatPhoto } from './ChatPhoto';
import { useMinuteClock } from './StoreHours';
import { chatHoursText, isScheduleConfigured, scheduleStatus } from '../utils/storeSchedule';

/** Firestore rules accept at most 5000 characters per message */
const CHAT_MESSAGE_MAX_LENGTH = 5000;

interface SupportChatModalProps {
  isOpen: boolean;
  /** Store phone from Admin → «Витрина»; the call button is hidden when empty */
  storePhone?: string;
  /** The store's hours from «Витрина»: «Сейчас работаем до 21:00» / «ответим завтра после 10:00» under the title */
  storeSchedule?: StoreSchedule;
  onClose: () => void;
  messages: ChatMessage[];
  /** The customer's thread is not read from the database yet: an empty list is not «Диалог пуст» */
  loading?: boolean;
  /** Reading the thread failed: the empty list is not «Диалог пуст» either */
  loadFailed?: boolean;
  /** Resolves false when the message could not be sent at all (the text stays in the field) */
  onSendMessage: (text: string, imageUrl?: string) => Promise<boolean>;
  /** Messages being written to the server, and the ones that failed */
  pendingIds?: ReadonlySet<string>;
  failedIds?: ReadonlySet<string>;
  onRetry?: (messageId: string) => void;
  /** Own message within 15 minutes: edit, «удалить у меня», «удалить у всех». Resolves false on failure */
  onChangeMessage?: (change: ChatMessageChange) => Promise<boolean>;
  /** Status of this dialog set by the staff; null — not set yet */
  supportStatus?: SupportStatus | null;
  /** The chat identity uid: remembers which status update the customer has already seen */
  statusSeenKey?: string | null;
  onApplyPromo?: (code: string) => boolean;
  onAddToCart?: (productId: string, color?: string, size?: string) => void;
  onSelectProductById?: (productId: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Typed into an empty field when the chat opens: «Вопрос по заказу № …» (audit 02.10, finding 26) */
  draftText?: string;
  /** The database of the chat's side (a guest — the guest's sign-in): photos kept apart are read from it */
  imageDb?: Firestore;
  /** Catalog products: shows `buyerPrice` for wholesale-only products on existing recommendation cards */
  products?: Product[];
  /** Latest order ID to pre-fill in «Где мой заказ» / «Возврат и обмен» quick questions */
  recentOrderId?: string;
  /** Saved measurements from profile to pre-fill in «Подбор размера» */
  userMeasurements?: { height?: number; weight?: number };
}

const CUSTOMER_STATUS: Record<SupportStatus['status'], { label: string; note: string; cls: string }> = {
  open: {
    label: 'В работе',
    note: 'Сотрудник занимается вашим вопросом и ответит в этом чате.',
    cls: 'text-accent neu-tone-info',
  },
  resolved: {
    label: 'Решено',
    note: 'Вопрос отмечен как решенный. Если что-то осталось — просто напишите, мы продолжим.',
    cls: 'text-success neu-tone-success',
  },
  closed: {
    label: 'Закрыто',
    note: 'Обращение закрыто. Новый вопрос можно задать здесь же — сотрудник ответит.',
    cls: 'text-text-secondary neu-inset',
  },
};

const seenStorageKey = (uid: string) => `manstyle_support_status_seen_${uid}`;

function readSeenStatus(uid: string): number {
  try {
    return Number(localStorage.getItem(seenStorageKey(uid))) || 0;
  } catch {
    return 0;
  }
}

/** Questions put into the field (the customer can edit them before sending) */
function buildQuickQuestions(
  recentOrderId?: string,
  measurements?: { height?: number; weight?: number }
) {
  const heightPart = measurements?.height ? `${measurements.height}` : '…';
  const weightPart = measurements?.weight ? `${measurements.weight}` : '…';
  const orderPart = recentOrderId?.trim() ? recentOrderId.trim() : '…';
  return [
    {
      label: 'Подбор размера',
      text: `Помогите подобрать размер. Мои параметры: рост ${heightPart} см, вес ${weightPart} кг.`,
    },
    {
      label: recentOrderId?.trim() ? `Где заказ № ${recentOrderId.trim()}` : 'Где мой заказ',
      text: `Подскажите, где мой заказ? Номер заказа: ${orderPart}`,
    },
    {
      label: 'Возврат и обмен',
      text: `Хочу вернуть или обменять товар. Номер заказа: ${orderPart}`,
    },
  ];
}

/**
 * «Служба заботы»: the customer's own thread with the store's staff. There is no bot: messages go to
 * the operators (Admin → «Чат поддержки») and their replies arrive here in real time.
 */
export const SupportChatModal: React.FC<SupportChatModalProps> = ({
  isOpen,
  storePhone = '',
  storeSchedule,
  onClose,
  messages,
  loading = false,
  loadFailed = false,
  onSendMessage,
  pendingIds,
  failedIds,
  onRetry,
  onChangeMessage,
  supportStatus = null,
  statusSeenKey = null,
  onApplyPromo,
  onAddToCart,
  onSelectProductById,
  onShowToast,
  draftText,
  imageDb,
  products,
  recentOrderId,
  userMeasurements,
}) => {
  const quickQuestions = buildQuickQuestions(recentOrderId, userMeasurements);
  const [inputText, setInputText] = useState('');
  // the order the customer asks about goes into the message itself, so the staff see its number
  useEffect(() => {
    if (isOpen && draftText) setInputText((prev) => (prev.trim() ? prev : draftText));
  }, [isOpen, draftText]);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const storeName = currentStoreName();
  // Own messages can be changed for 15 minutes: re-check the window while the chat is open
  const [now, setNow] = useState(() => Date.now());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [statusNotice, setStatusNotice] = useState<SupportStatus | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // A status the staff set since the customer last looked: tell them once, on opening the chat
  useEffect(() => {
    if (!isOpen || !supportStatus || !statusSeenKey) return;
    if (supportStatus.updatedAt > readSeenStatus(statusSeenKey)) setStatusNotice(supportStatus);
  }, [isOpen, supportStatus, statusSeenKey]);

  const dismissStatusNotice = () => {
    if (statusNotice && statusSeenKey) {
      try {
        localStorage.setItem(seenStorageKey(statusSeenKey), String(statusNotice.updatedAt));
      } catch {}
    }
    setStatusNotice(null);
  };

  // Escape leaves editing first, then closes the chat; the photo, the notice and the delete dialog are
  // windows of their own and close first
  const dialog = useDialogA11y(isOpen, () => (editing ? cancelEdit() : onClose()));
  // the store's hours: renewed every minute while the chat is open
  const scheduleSet = isScheduleConfigured(storeSchedule);
  const hoursNow = useMinuteClock(isOpen && scheduleSet);
  const hoursStatus = scheduleSet ? scheduleStatus(storeSchedule, hoursNow) : null;
  const noticeDialog = useDialogA11y(isOpen && Boolean(statusNotice), dismissStatusNotice);
  const photoDialog = useDialogA11y(isOpen && Boolean(previewImage), () => setPreviewImage(null), { label: 'Просмотр фото' });

  const visibleMessages = messages.filter((m) => !m.isInternalNote && !m.hiddenForCustomer);
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  // After the customer writes, say honestly who answers and where
  const awaitingReply = lastMessage?.sender === 'user' && !failedIds?.has(lastMessage.id);

  // To the end on opening and when a message comes or is sent — not on every render while the customer reads the
  // history above (audit 07.10, finding 25)
  const lastMessageId = lastMessage?.id;
  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessageId, isOpen]);

  const attachImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onShowToast?.('Можно прикрепить только фото', 'error');
      return;
    }
    setIsProcessingImage(true);
    try {
      setAttachedImage(await compressChatImageFile(file));
    } catch (err) {
      console.warn('Could not compress chat image:', err);
      onShowToast?.('Не удалось обработать фото. Попробуйте другое изображение', 'error');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await attachImageFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      attachImageFile(file);
    }
  };

  const startEdit = (msg: ChatMessage) => {
    setMenuId(null);
    if (!editing) setDraftBeforeEdit(inputText);
    setEditing(msg);
    setInputText(msg.text || '');
    setAttachedImage(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  function cancelEdit() {
    setEditing(null);
    setInputText(draftBeforeEdit);
    setDraftBeforeEdit('');
  }

  const changeMessage = async (change: ChatMessageChange) => {
    setMenuId(null);
    return (await onChangeMessage?.(change)) ?? false;
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (editing) {
      if (isSending) return;
      if (!text && !hasChatPhoto(editing)) return;
      if (text === (editing.text || '').trim()) {
        cancelEdit();
        return;
      }
      setIsSending(true);
      try {
        if (await changeMessage({ type: 'edit', id: editing.id, text })) cancelEdit();
      } finally {
        setIsSending(false);
      }
      return;
    }
    if ((!text && !attachedImage) || isSending || isProcessingImage) return;
    setIsSending(true);
    try {
      const accepted = await onSendMessage(text, attachedImage || undefined);
      if (accepted) {
        setInputText('');
        setAttachedImage(null);
      }
    } finally {
      setIsSending(false);
    }
  };

  const applyQuickQuestion = (text: string) => {
    setInputText(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // select the first «…» so the customer types the details straight away
      const gap = text.indexOf('…');
      if (gap >= 0) el.setSelectionRange(gap, gap + 1);
    });
  };

  const canSend = editing
    ? (inputText.trim().length > 0 || hasChatPhoto(editing)) && !isSending
    : (inputText.trim().length > 0 || Boolean(attachedImage)) && !isSending && !isProcessingImage;
  const statusInfo = supportStatus ? CUSTOMER_STATUS[supportStatus.status] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          key="support-chat-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
        >
          <div onClick={onClose} className="fixed inset-0 bg-text-primary/50 cursor-pointer" aria-hidden="true" />

          <m.div
            key="support-chat-modal"
            ref={dialog.ref}
            {...dialog.props}
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md h-[85dvh] max-h-[680px] neu-modal rounded-3xl flex flex-col overflow-hidden z-10"
          >
            {/* Header: who answers, call (when the phone is set), close */}
            <div className="px-4 py-3.5 neu-divider-b flex items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                  <Headphones className="w-5 h-5 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 id={dialog.titleId} className="text-sm font-extrabold tracking-tight text-text-primary leading-tight">
                      Служба заботы
                    </h3>
                    {statusInfo && (
                      <span
                        className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg ${statusInfo.cls}`}
                        title="Статус вашего обращения"
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary font-semibold leading-snug">
                    Отвечают сотрудники {storeName}, ответ придет сюда
                  </p>
                  {hoursStatus && (
                    <p className={`text-xs font-bold leading-snug ${hoursStatus.open ? 'text-success' : 'text-text-secondary'}`}>
                      {chatHoursText(hoursStatus)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {storePhone && (
                  <a
                    href={telHref(storePhone)}
                    title={`Позвонить: ${storePhone}`}
                    aria-label={`Позвонить в магазин: ${storePhone}`}
                    className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-accent transition-all cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  title="Закрыть чат (Esc)"
                  aria-label="Закрыть чат"
                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 px-3.5 py-4 overflow-y-auto space-y-3.5 no-scrollbar" aria-live="polite">
              {/* No greeting message: an empty dialog says so */}
              {visibleMessages.length === 0 && loadFailed && (
                <div className="h-full min-h-48 flex items-center justify-center px-6">
                  <p className="text-xs font-bold text-danger text-center" role="alert">
                    Не удалось загрузить переписку. Обновите страницу — новое сообщение можно отправить и сейчас.
                  </p>
                </div>
              )}
              {visibleMessages.length === 0 && loading && !loadFailed && (
                <div className="h-full min-h-48 flex items-center justify-center px-6">
                  <p className="text-xs font-semibold text-text-secondary">Загружаем переписку…</p>
                </div>
              )}
              {visibleMessages.length === 0 && !loading && !loadFailed && (
                <div className="h-full min-h-48 flex flex-col items-center justify-center text-center gap-3 px-6">
                  <div className="w-14 h-14 rounded-2xl neu-inset flex items-center justify-center text-accent">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-text-primary">Диалог пуст</p>
                    <p className="text-xs font-semibold text-text-secondary leading-snug">
                      Здесь пока нет сообщений. Напишите вопрос или прикрепите фото — сотрудник магазина ответит
                      в этом чате.
                    </p>
                  </div>
                </div>
              )}

              {visibleMessages.map((msg, msgIdx) => {
                const isUser = msg.sender === 'user';
                const isStaff = msg.sender === 'agent' || msg.sender === 'admin';
                const isPending = isUser && pendingIds?.has(msg.id);
                const isFailed = isUser && failedIds?.has(msg.id);
                const canChange =
                  Boolean(onChangeMessage) && !isPending && !isFailed && canCustomerChangeMessage(msg, now);
                return (
                  <div
                    key={msg.id ? `msg-${msg.id}-${msgIdx}` : `msg-${msgIdx}`}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 mt-0.5">
                        {isStaff ? <UserCheck className="w-4 h-4 text-success" /> : <Bot className="w-4 h-4 text-text-secondary" />}
                      </div>
                    )}
                    <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                      {!isUser && (
                        <span className={`text-[11px] font-extrabold px-1 ${isStaff ? 'text-success' : 'text-text-secondary'}`}>
                          {/* earlier automatic replies are still in some threads */}
                          {isStaff ? 'Сотрудник магазина' : 'Автоответ'}
                        </span>
                      )}
                      <div
                        className={`rounded-2xl text-xs font-medium leading-relaxed ${
                          hasChatPhoto(msg) && !msg.text?.trim() && !msg.productCard && !msg.promoCard && !msg.orderStatusUpdate
                            ? 'p-2'
                            : 'p-3.5 space-y-2.5'
                        } ${
                          isUser
                            ? `neu-bubble-own rounded-tr-none ${isFailed ? 'opacity-70' : ''} ${
                                editing?.id === msg.id ? 'neu-pill-active' : ''
                              }`
                            : isStaff
                            ? 'neu-tone-success rounded-tl-none text-text-primary'
                            : 'neu-flat rounded-tl-none text-text-primary'
                        }`}
                      >
                        {msg.text && <p className="whitespace-pre-line break-words">{msg.text}</p>}

                        {hasChatPhoto(msg) && (
                          <ChatPhoto message={msg} db={imageDb}>
                            {(src) => (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(src)}
                                aria-label="Открыть фото"
                                className="relative group rounded-xl overflow-hidden block max-w-full neu-inset active:scale-[0.98] transition-transform cursor-pointer"
                              >
                                <img
                                  src={src}
                                  alt="Прикрепленное фото"
                                  className="max-h-60 w-auto max-w-[240px] rounded-xl object-contain block mx-auto"
                                  loading="lazy"
                                />
                                <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity neu-photo-btn px-2.5 py-1 min-h-8 rounded-xl flex items-center justify-center gap-1.5 text-text-primary text-[11px] font-bold">
                                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                                  Увеличить
                                </span>
                              </button>
                            )}
                          </ChatPhoto>
                        )}

                        {/* Product the staff recommended */}
                        {msg.productCard && (() => {
                          const liveProduct = products?.find((p) => p.id === msg.productCard!.productId);
                          const displayPrice = liveProduct ? buyerPrice(liveProduct) : msg.productCard.price;
                          return (
                          <div className="neu-inset rounded-2xl p-3 space-y-2.5 text-text-primary">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-extrabold text-accent uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Рекомендация
                              </span>
                              <span className="text-[11px] font-extrabold">{displayPrice.toLocaleString('ru-RU')} ₽</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              {msg.productCard.image && (
                                <img
                                  src={msg.productCard.image}
                                  alt={msg.productCard.title}
                                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-extrabold text-xs leading-snug">{msg.productCard.title}</p>
                                {(msg.productCard.size || msg.productCard.color) && (
                                  <p className="text-xs text-text-secondary pt-0.5">
                                    {[msg.productCard.size && `Размер ${msg.productCard.size}`, msg.productCard.color]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                                {msg.productCard.note && (
                                  <p className="text-xs text-text-secondary italic leading-snug pt-0.5">{msg.productCard.note}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {onAddToCart && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    msg.productCard &&
                                    onAddToCart(msg.productCard.productId, msg.productCard.color, msg.productCard.size)
                                  }
                                  className="flex-1 h-9 px-2.5 neu-button rounded-xl text-accent font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                >
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  В корзину
                                </button>
                              )}
                              {onSelectProductById && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!msg.productCard) return;
                                    onClose();
                                    onSelectProductById(msg.productCard.productId);
                                  }}
                                  className="h-9 px-3 neu-button rounded-xl text-text-primary font-bold text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                                >
                                  Смотреть
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          );
                        })()}

                        {msg.orderStatusUpdate && (
                          <div className="neu-inset rounded-2xl p-3 space-y-2 text-text-primary">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-extrabold text-accent uppercase tracking-wider flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5" />
                                Статус заказа
                              </span>
                              <span className="text-[11px] font-extrabold text-accent">№ {msg.orderStatusUpdate.orderId}</span>
                            </div>
                            <p className="text-xs font-bold">
                              Новый статус: <span className="text-success">{msg.orderStatusUpdate.newStatusLabel}</span>
                            </p>
                            {msg.orderStatusUpdate.trackingNumber && (
                              <p className="text-xs text-text-secondary">
                                Трек-номер: <strong className="font-mono text-text-primary">{msg.orderStatusUpdate.trackingNumber}</strong>
                              </p>
                            )}
                          </div>
                        )}

                        {msg.promoCard && (
                          <div className="neu-inset rounded-2xl p-3 space-y-2 text-text-primary">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-extrabold text-accent uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Промокод для вас
                              </span>
                              <span className="text-[11px] font-extrabold text-success neu-tone-success px-2 py-0.5 rounded-lg">
                                {msg.promoCard.discountType === 'fixed'
                                  ? `−${msg.promoCard.discountValue.toLocaleString('ru-RU')} ₽`
                                  : `−${msg.promoCard.discountValue}%`}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-extrabold text-xs tracking-wider break-all">{msg.promoCard.code}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!msg.promoCard) return;
                                  copyToClipboard(msg.promoCard.code);
                                  if (onApplyPromo?.(msg.promoCard.code)) setAppliedPromoCode(msg.promoCard.code);
                                }}
                                className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-extrabold text-accent transition-all flex items-center gap-1 cursor-pointer shrink-0"
                                title="Скопировать и применить к корзине"
                              >
                                {appliedPromoCode === msg.promoCard.code ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-success" />
                                    Применен
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Применить
                                  </>
                                )}
                              </button>
                            </div>
                            {msg.promoCard.description && (
                              <p className="text-xs text-text-secondary leading-snug">{msg.promoCard.description}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Time and the real delivery state of the customer's own messages */}
                      <div className="flex items-center gap-1.5 text-[11px] text-text-secondary px-1">
                        <span>{msg.timestamp}</span>
                        {msg.editedAt && <span>· изменено</span>}
                        {isPending && (
                          <span className="flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Отправка…
                          </span>
                        )}
                        {isFailed && (
                          <button
                            type="button"
                            onClick={() => onRetry?.(msg.id)}
                            className="flex items-center gap-1 font-bold text-danger underline cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            Не отправлено — повторить
                          </button>
                        )}
                        {isFailed && onChangeMessage && (
                          <button
                            type="button"
                            onClick={() => changeMessage({ type: 'delete', id: msg.id })}
                            className="font-bold text-text-secondary underline cursor-pointer"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                      {canChange && (
                        <ChatMessageMenu
                          align="end"
                          isOpen={menuId === msg.id}
                          onToggle={() => setMenuId((id) => (id === msg.id ? null : msg.id))}
                          onEdit={msg.text?.trim() ? () => startEdit(msg) : undefined}
                          onDelete={() => {
                            setMenuId(null);
                            setDeleteTarget(msg);
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {awaitingReply && (
                <p className="text-center text-xs font-semibold text-text-secondary px-4 leading-snug">
                  Сообщение отправлено. Сотрудник ответит здесь — ответ сохранится в этом чате.
                </p>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Editing one of the customer's own messages */}
            {editing && (
              <div className="mx-3.5 mt-2.5 px-3 py-2 neu-inset rounded-2xl flex items-center justify-between gap-2.5 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Pencil className="w-3.5 h-3.5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-accent">Редактирование</p>
                    <p className="text-xs text-text-secondary truncate">{editing.text}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer shrink-0"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Quick questions: put a question into the field */}
            {!editing && (
            <div className="px-3.5 pt-2.5 pb-1 neu-divider-t shrink-0">
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => applyQuickQuestion(q.text)}
                    className="h-8 px-3 neu-button rounded-xl text-[11px] font-bold text-text-primary hover:text-accent transition-all cursor-pointer"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Attached photo */}
            {(attachedImage || isProcessingImage) && (
              <div className="mx-3.5 mt-2 p-2 neu-inset rounded-2xl flex items-center justify-between gap-2.5 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {attachedImage ? (
                    <img src={attachedImage} alt="Прикрепленное фото" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-accent">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-text-primary">
                    {attachedImage ? 'Фото будет отправлено с сообщением' : 'Готовим фото…'}
                  </span>
                </div>
                {attachedImage && (
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-danger transition-all cursor-pointer shrink-0"
                    title="Убрать фото"
                    aria-label="Убрать фото"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

            {/* Composer: photo, text (resizable, Enter sends), send */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="p-3 flex items-end gap-2.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingImage || Boolean(editing)}
                className="w-11 h-11 rounded-2xl neu-button flex items-center justify-center text-accent transition-all shrink-0 cursor-pointer "
                title="Прикрепить фото"
                aria-label="Прикрепить фото"
              >
                <Camera className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={inputText}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                aria-label={editing ? 'Новый текст сообщения' : 'Сообщение в службу заботы'}
                placeholder={editing ? 'Новый текст…' : 'Напишите вопрос…'}
                className="flex-1 min-w-0 min-h-11 max-h-40 px-3.5 py-2.5 neu-inset rounded-2xl text-base sm:text-xs text-text-primary placeholder:text-text-muted font-medium leading-snug resize-y"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="w-11 h-11 rounded-2xl neu-button-accent flex items-center justify-center text-white transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed"
                title={editing ? 'Сохранить (Enter)' : 'Отправить (Enter)'}
                aria-label={editing ? 'Сохранить изменения' : 'Отправить сообщение'}
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : editing ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </form>
          </m.div>

          <ChatMessageDeleteDialog
            message={deleteTarget}
            otherSide="сотрудников магазина"
            onDeleteForMe={() => deleteTarget && changeMessage({ type: 'hide', id: deleteTarget.id, side: 'customer', hidden: true })}
            onDeleteForAll={() => deleteTarget && changeMessage({ type: 'delete', id: deleteTarget.id })}
            onClose={() => setDeleteTarget(null)}
          />

          {statusNotice && (
            <ModalPortal>
              <div className="fixed inset-0 z-[215] flex items-center justify-center p-3 sm:p-4">
                <div onClick={dismissStatusNotice} className="fixed inset-0 bg-text-primary/40 cursor-pointer" aria-hidden="true" />
                <div
                  ref={noticeDialog.ref}
                  {...noticeDialog.props}
                  role="alertdialog"
                  className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                      <BellRing className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 id={noticeDialog.titleId} className="text-sm font-extrabold text-text-primary">
                        Статус обращения обновлен
                      </h3>
                      <span
                        className={`inline-block mt-1 text-[11px] font-extrabold px-2 py-0.5 rounded-lg ${
                          CUSTOMER_STATUS[statusNotice.status].cls
                        }`}
                      >
                        {CUSTOMER_STATUS[statusNotice.status].label}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">{CUSTOMER_STATUS[statusNotice.status].note}</p>
                  <button
                    type="button"
                    data-autofocus
                    onClick={dismissStatusNotice}
                    className="w-full py-2.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent cursor-pointer"
                  >
                    Понятно
                  </button>
                </div>
              </div>
            </ModalPortal>
          )}

          {previewImage && (
            <ModalPortal>
              <div
                className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-in fade-in duration-200"
                onClick={() => setPreviewImage(null)}
                ref={photoDialog.ref}
                {...photoDialog.props}
              >
                <div className="relative animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    data-autofocus
                    onClick={() => setPreviewImage(null)}
                    className="absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-primary transition-all cursor-pointer"
                    title="Закрыть просмотр (Esc)"
                    aria-label="Закрыть просмотр"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <img
                    src={previewImage}
                    alt="Увеличенное фото"
                    className="max-h-[85dvh] w-auto max-w-[92vw] rounded-2xl object-contain"
                  />
                </div>
              </div>
            </ModalPortal>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
};
