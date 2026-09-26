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
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, SupportStatus } from '../types';
import { canCustomerChangeMessage, type ChatMessageChange } from '../utils/firebaseSync';
import { ChatMessageDeleteDialog, ChatMessageMenu } from './ChatMessageActions';
import { copyToClipboard } from '../utils/clipboard';
import { compressChatImageFile } from '../utils/imageUpload';
import { currentStoreName, telHref } from '../utils/storeContacts';
import { ModalPortal } from './ModalPortal';

/** Firestore rules accept at most 5000 characters per message */
export const CHAT_MESSAGE_MAX_LENGTH = 5000;

interface SupportChatModalProps {
  isOpen: boolean;
  /** Store phone from Admin → «Витрина»; the call button is hidden when empty */
  storePhone?: string;
  onClose: () => void;
  messages: ChatMessage[];
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
}

const CUSTOMER_STATUS: Record<SupportStatus['status'], { label: string; note: string; cls: string }> = {
  open: {
    label: 'В работе',
    note: 'Сотрудник занимается вашим вопросом и ответит в этом чате.',
    cls: 'text-accent bg-accent/10',
  },
  resolved: {
    label: 'Решено',
    note: 'Вопрос отмечен как решенный. Если что-то осталось — просто напишите, мы продолжим.',
    cls: 'text-success bg-success-soft',
  },
  closed: {
    label: 'Закрыто',
    note: 'Обращение закрыто. Новый вопрос можно задать здесь же — сотрудник ответит.',
    cls: 'text-[#4E5C70] bg-[#4E5C70]/10',
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
const QUICK_QUESTIONS = [
  { label: 'Подбор размера', text: 'Помогите подобрать размер. Мои параметры: рост … см, вес … кг.' },
  { label: 'Где мой заказ', text: 'Подскажите, где мой заказ? Номер заказа: …' },
  { label: 'Возврат и обмен', text: 'Хочу вернуть или обменять товар. Номер заказа: …' },
];

/**
 * «Служба заботы»: the customer's own thread with the store's staff. There is no bot: messages go to
 * the operators (Admin → «Чат поддержки») and their replies arrive here in real time.
 */
export const SupportChatModal: React.FC<SupportChatModalProps> = ({
  isOpen,
  storePhone = '',
  onClose,
  messages,
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
}) => {
  const [inputText, setInputText] = useState('');
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

  const visibleMessages = messages.filter((m) => !m.isInternalNote && !m.hiddenForCustomer);
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  // After the customer writes, say honestly who answers and where
  const awaitingReply = lastMessage?.sender === 'user' && !failedIds?.has(lastMessage.id);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // the delete dialog and the status notice close themselves first
      if (deleteTarget || statusNotice) return;
      if (previewImage) setPreviewImage(null);
      else if (editing) cancelEdit();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      if (!text && !editing.imageUrl) return;
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
    ? (inputText.trim().length > 0 || Boolean(editing.imageUrl)) && !isSending
    : (inputText.trim().length > 0 || Boolean(attachedImage)) && !isSending && !isProcessingImage;
  const statusInfo = supportStatus ? CUSTOMER_STATUS[supportStatus.status] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="support-chat-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
        >
          <div onClick={onClose} className="fixed inset-0 bg-[#2D3A4E]/50 cursor-pointer" aria-hidden="true" />

          <motion.div
            key="support-chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Служба заботы"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md h-[85dvh] max-h-[680px] neu-modal rounded-3xl flex flex-col overflow-hidden z-10"
          >
            {/* Header: who answers, call (when the phone is set), close */}
            <div className="px-4 py-3.5 border-b border-[#BAC5D5]/50 flex items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black tracking-tight text-[#2D3A4E] leading-tight">Служба заботы</h3>
                    {statusInfo && (
                      <span
                        className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg ${statusInfo.cls}`}
                        title="Статус вашего обращения"
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#4E5C70] font-semibold leading-snug">
                    Отвечают сотрудники {storeName}, ответ придет сюда
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {storePhone && (
                  <a
                    href={telHref(storePhone)}
                    title={`Позвонить: ${storePhone}`}
                    aria-label={`Позвонить в магазин: ${storePhone}`}
                    className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-accent active:scale-95 transition-all cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  title="Закрыть чат (Esc)"
                  aria-label="Закрыть чат"
                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 px-3.5 py-4 overflow-y-auto space-y-3.5 no-scrollbar" aria-live="polite">
              {/* No greeting message: an empty dialog says so */}
              {visibleMessages.length === 0 && (
                <div className="h-full min-h-48 flex flex-col items-center justify-center text-center gap-3 px-6">
                  <div className="w-14 h-14 rounded-2xl neu-inset flex items-center justify-center text-accent">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black text-[#2D3A4E]">Диалог пуст</p>
                    <p className="text-[11px] font-semibold text-[#4E5C70] leading-snug">
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
                        {isStaff ? <UserCheck className="w-4 h-4 text-success" /> : <Bot className="w-4 h-4 text-[#4E5C70]" />}
                      </div>
                    )}
                    <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                      {!isUser && (
                        <span className={`text-[11px] font-black px-1 ${isStaff ? 'text-success' : 'text-[#4E5C70]'}`}>
                          {/* earlier automatic replies are still in some threads */}
                          {isStaff ? 'Сотрудник магазина' : 'Автоответ'}
                        </span>
                      )}
                      <div
                        className={`rounded-2xl text-xs font-medium leading-relaxed ${
                          msg.imageUrl && !msg.text?.trim() && !msg.productCard && !msg.promoCard && !msg.orderStatusUpdate
                            ? 'p-2'
                            : 'p-3.5 space-y-2.5'
                        } ${
                          isUser
                            ? `neu-bubble-own rounded-tr-none ${isFailed ? 'opacity-70' : ''} ${
                                editing?.id === msg.id ? 'ring-2 ring-accent/50' : ''
                              }`
                            : isStaff
                            ? 'neu-flat rounded-tl-none text-[#2D3A4E] border border-success/40'
                            : 'neu-flat rounded-tl-none text-[#2D3A4E]'
                        }`}
                      >
                        {msg.text && <p className="whitespace-pre-line break-words">{msg.text}</p>}

                        {msg.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(msg.imageUrl || null)}
                            aria-label="Открыть фото"
                            className="relative group rounded-xl overflow-hidden block max-w-full bg-black/5 active:scale-[0.98] transition-transform cursor-pointer"
                          >
                            <img
                              src={msg.imageUrl}
                              alt="Прикрепленное фото"
                              className="max-h-60 w-auto max-w-[240px] rounded-xl object-contain block mx-auto"
                              loading="lazy"
                            />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-[11px] font-bold">
                              <Maximize2 className="w-3.5 h-3.5" />
                              Увеличить
                            </span>
                          </button>
                        )}

                        {/* Product the staff recommended */}
                        {msg.productCard && (
                          <div className="neu-inset rounded-2xl p-3 space-y-2.5 text-[#2D3A4E]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Рекомендация
                              </span>
                              <span className="text-[11px] font-black">{msg.productCard.price.toLocaleString('ru-RU')} ₽</span>
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
                                  <p className="text-[11px] text-[#4E5C70] pt-0.5">
                                    {[msg.productCard.size && `Размер ${msg.productCard.size}`, msg.productCard.color]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                                {msg.productCard.note && (
                                  <p className="text-[11px] text-[#4E5C70] italic leading-snug pt-0.5">{msg.productCard.note}</p>
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
                                  className="flex-1 h-9 px-2.5 neu-button rounded-xl text-accent font-black text-[11px] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
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
                                  className="h-9 px-3 neu-button rounded-xl text-[#2D3A4E] font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                                >
                                  Смотреть
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {msg.orderStatusUpdate && (
                          <div className="neu-inset rounded-2xl p-3 space-y-2 text-[#2D3A4E]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5" />
                                Статус заказа
                              </span>
                              <span className="text-[11px] font-black text-accent">№ {msg.orderStatusUpdate.orderId}</span>
                            </div>
                            <p className="text-[11px] font-bold">
                              Новый статус: <span className="text-success">{msg.orderStatusUpdate.newStatusLabel}</span>
                            </p>
                            {msg.orderStatusUpdate.trackingNumber && (
                              <p className="text-[11px] text-[#4E5C70]">
                                Трек-номер: <strong className="font-mono text-[#2D3A4E]">{msg.orderStatusUpdate.trackingNumber}</strong>
                              </p>
                            )}
                          </div>
                        )}

                        {msg.promoCard && (
                          <div className="neu-inset rounded-2xl p-3 space-y-2 text-[#2D3A4E]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Промокод для вас
                              </span>
                              <span className="text-[11px] font-extrabold text-success bg-success-soft px-2 py-0.5 rounded-lg">
                                {msg.promoCard.discountType === 'fixed'
                                  ? `−${msg.promoCard.discountValue.toLocaleString('ru-RU')} ₽`
                                  : `−${msg.promoCard.discountValue}%`}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-black text-xs tracking-wider break-all">{msg.promoCard.code}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!msg.promoCard) return;
                                  copyToClipboard(msg.promoCard.code);
                                  if (onApplyPromo?.(msg.promoCard.code)) setAppliedPromoCode(msg.promoCard.code);
                                }}
                                className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-black text-accent active:scale-95 transition-all flex items-center gap-1 cursor-pointer shrink-0"
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
                              <p className="text-[11px] text-[#4E5C70] leading-snug">{msg.promoCard.description}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Time and the real delivery state of the customer's own messages */}
                      <div className="flex items-center gap-1.5 text-[11px] text-[#4E5C70] px-1">
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
                            className="font-bold text-[#4E5C70] underline cursor-pointer"
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
                <p className="text-center text-[11px] font-semibold text-[#4E5C70] px-4 leading-snug">
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
                    <p className="text-[11px] font-black text-accent">Редактирование</p>
                    <p className="text-[11px] text-[#4E5C70] truncate">{editing.text}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer shrink-0"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Quick questions: put a question into the field */}
            {!editing && (
            <div className="px-3.5 pt-2.5 pb-1 border-t border-[#BAC5D5]/40 shrink-0">
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => applyQuickQuestion(q.text)}
                    className="h-8 px-3 neu-button rounded-xl text-[11px] font-bold text-[#2D3A4E] hover:text-accent active:scale-95 transition-all cursor-pointer"
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
                  <span className="text-[11px] font-bold text-[#2D3A4E]">
                    {attachedImage ? 'Фото будет отправлено с сообщением' : 'Готовим фото…'}
                  </span>
                </div>
                {attachedImage && (
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-danger active:scale-90 transition-all cursor-pointer shrink-0"
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
                className="w-11 h-11 rounded-2xl neu-button flex items-center justify-center text-accent active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-50"
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
                className="flex-1 min-w-0 min-h-11 max-h-40 px-3.5 py-2.5 neu-inset rounded-2xl text-base sm:text-xs text-[#2D3A4E] placeholder:text-[#56647A] font-medium leading-snug resize-y"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="w-11 h-11 rounded-2xl neu-button-accent flex items-center justify-center text-white active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
          </motion.div>

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
                <div onClick={dismissStatusNotice} className="fixed inset-0 bg-[#2D3A4E]/40 cursor-pointer" aria-hidden="true" />
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="support-status-title"
                  className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                      <BellRing className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 id="support-status-title" className="text-sm font-extrabold text-[#2D3A4E]">
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
                  <p className="text-xs text-[#4E5C70] leading-relaxed">{CUSTOMER_STATUS[statusNotice.status].note}</p>
                  <button
                    type="button"
                    autoFocus
                    onClick={dismissStatusNotice}
                    className="w-full py-2.5 px-3 neu-button rounded-xl text-xs font-black text-accent cursor-pointer"
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
                role="dialog"
                aria-modal="true"
                aria-label="Просмотр фото"
              >
                <div className="relative animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setPreviewImage(null)}
                    className="absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] active:scale-90 transition-all cursor-pointer"
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
