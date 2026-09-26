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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage } from '../types';
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
  onApplyPromo?: (code: string) => boolean;
  onAddToCart?: (productId: string, color?: string, size?: string) => void;
  onSelectProductById?: (productId: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
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

  const visibleMessages = messages.filter((m) => !m.isInternalNote);
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
      if (previewImage) setPreviewImage(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, previewImage, onClose]);

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

  const handleSubmit = async () => {
    const text = inputText.trim();
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

  const canSend = (inputText.trim().length > 0 || Boolean(attachedImage)) && !isSending && !isProcessingImage;

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
                  <h3 className="text-sm font-black tracking-tight text-[#2D3A4E] leading-tight">Служба заботы</h3>
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
              {/* Greeting: on screen only, not stored */}
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0 mt-0.5">
                  <Headphones className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] space-y-1">
                  <span className="text-[11px] font-black text-[#4E5C70] px-1">{storeName}</span>
                  <div className="neu-flat rounded-2xl rounded-tl-none p-3.5 text-xs font-medium leading-relaxed text-[#2D3A4E]">
                    Здравствуйте! Это служба заботы {storeName}. Напишите вопрос или прикрепите фото — сотрудник
                    ответит здесь, в чате.
                  </div>
                </div>
              </div>

              {visibleMessages.map((msg, msgIdx) => {
                const isUser = msg.sender === 'user';
                const isStaff = msg.sender === 'agent' || msg.sender === 'admin';
                const isPending = isUser && pendingIds?.has(msg.id);
                const isFailed = isUser && failedIds?.has(msg.id);
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
                            ? `neu-bubble-own rounded-tr-none ${isFailed ? 'opacity-70' : ''}`
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
                      </div>
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

            {/* Quick questions: put a question into the field */}
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
                disabled={isProcessingImage}
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
                aria-label="Сообщение в службу заботы"
                placeholder="Напишите вопрос…"
                className="flex-1 min-w-0 min-h-11 max-h-40 px-3.5 py-2.5 neu-inset rounded-2xl text-base sm:text-xs text-[#2D3A4E] placeholder:text-[#56647A] font-medium leading-snug resize-y"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="w-11 h-11 rounded-2xl neu-button-accent flex items-center justify-center text-white active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Отправить (Enter)"
                aria-label="Отправить сообщение"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </motion.div>

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
