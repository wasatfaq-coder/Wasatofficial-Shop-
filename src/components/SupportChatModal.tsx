import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Headphones,
  Phone,
  CheckCheck,
  Ruler,
  PackageCheck,
  UserCheck,
  Paperclip,
  Image as ImageIcon,
  Camera,
  Maximize2,
  Sparkles,
  Tag,
  Copy,
  Check,
  ShoppingBag,
  ArrowRight,
  Truck,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, Product } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import { compressChatImageFile } from '../utils/imageUpload';
import { telHref } from '../utils/storeContacts';

interface SupportChatModalProps {
  isOpen: boolean;
  /** Store phone from Admin → «Витрина»; call button and hotline banner are hidden when empty */
  storePhone?: string;
  onClose: () => void;
  onOpenMySizes?: () => void;
  onNavigateTab?: (tab: 'catalog' | 'profile' | 'cart') => void;
  messages: ChatMessage[];
  onSendMessage: (text: string, imageUrl?: string) => void;
  isTyping?: boolean;
  onApplyPromo?: (code: string) => boolean;
  onAddToCart?: (productId: string, color?: string, size?: string) => void;
  onSelectProductById?: (productId: string) => void;
}

export const SupportChatModal: React.FC<SupportChatModalProps> = ({
  isOpen,
  storePhone = '',
  onClose,
  onOpenMySizes,
  onNavigateTab,
  messages,
  onSendMessage,
  isTyping = false,
  onApplyPromo,
  onAddToCart,
  onSelectProductById,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  const quickQuestions = [
    { label: 'Помощь с выбором размера', text: 'Как точно подобрать размер одежды под мои параметры?' },
    { label: 'Статус и доставка заказа', text: 'Как узнать где находится мой заказ?' },
    { label: 'Возврат и обмен', text: 'Каковы условия возврата или обмена товара?' },
    { label: 'Чат с оператором', text: 'Здравствуйте! Переведите диалог на живого консультанта' },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    try {
      const compressedDataUrl = await compressChatImageFile(file);
      setAttachedImage(compressedDataUrl);
    } catch (err) {
      console.warn('Could not compress attached chat image:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          try {
            const compressed = await compressChatImageFile(file);
            setAttachedImage(compressed);
          } catch (err) {
            console.warn('Could not compress pasted chat image:', err);
          }
          break;
        }
      }
    }
  };

  const handleSubmit = (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() && !attachedImage) return;

    onSendMessage(textToSend.trim(), attachedImage || undefined);
    if (!customText) setInputText('');
    setAttachedImage(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="support-chat-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-sm cursor-pointer"
          />

          <motion.div
            key="support-chat-modal"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md h-[85vh] max-h-[660px] neu-modal rounded-3xl flex flex-col border border-white/80 overflow-hidden bg-[#E3E8EF] z-10"
          >
          {/* Neumorphic Header */}
          <div className="p-3.5 sm:p-4 bg-[#E3E8EF] border-b border-[#BAC5D5]/50 flex items-center justify-between gap-2.5 shrink-0 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent border border-white/80">
                  <Headphones className="w-5 h-5 text-accent stroke-[2.2]" />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-success border-2 border-[#E3E8EF] rounded-full shadow-sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-extrabold tracking-tight text-[#2D3A4E] truncate">
                    Служба заботы
                  </h3>
                  <span className="text-[11px] sm:text-[11px] neu-inset bg-[#E3E8EF] text-accent px-2.5 py-0.5 rounded-full font-black border border-white/70 shrink-0">
                    24/7
                  </span>
                </div>
                <p className="text-[11px] sm:text-[11px] text-[#4E5C70] font-medium flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
                  <span className="truncate">Онлайн • Подбор и помощь</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {storePhone && (
              <a
                href={telHref(storePhone)}
                title={`Позвонить: ${storePhone}`}
                className="w-9 h-9 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-[#2D3A4E] hover:text-accent transition-all border border-white/70 active:scale-95 cursor-pointer"
              >
                <Phone className="w-4 h-4 text-[#2D3A4E]" />
              </a>
              )}
              <button
                type="button"
                onClick={onClose}
                title="Закрыть чат"
                className="w-9 h-9 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-[#2D3A4E] hover:text-danger transition-all border border-white/70 active:scale-95 cursor-pointer"
                aria-label="Закрыть чат"
              >
                <X className="w-4 h-4 text-[#2D3A4E]" />
              </button>
            </div>
          </div>

          {/* Store phone banner (only when the phone is set in Admin → «Витрина») */}
          {storePhone && (
          <div className="mx-3 mt-3 p-3 rounded-2xl neu-inset flex items-center justify-between text-xs font-semibold text-[#2D3A4E] shrink-0 border border-white/60">
            <span className="text-[#2D3A4E] font-bold">Телефон магазина: {storePhone}</span>
            <a
              href={telHref(storePhone)}
              className="text-[11px] text-accent neu-button px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wider"
            >
              Позвонить
            </a>
          </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-[#E3E8EF] no-scrollbar">
            {messages
              .filter((m) => !m.isInternalNote)
              .map((msg, msgIdx) => {
                const isUser = msg.sender === 'user';
                const isAgent = msg.sender === 'agent' || msg.sender === 'admin';
                return (
                  <div
                    key={msg.id ? `msg-${msg.id}-${msgIdx}` : `msg-${msgIdx}`}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0 mt-0.5 border border-white/60">
                        {isAgent ? (
                          <UserCheck className="w-4 h-4 text-success" />
                        ) : (
                          <Headphones className="w-4 h-4 text-accent" />
                        )}
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      {!isUser && (
                        <div className="flex items-center gap-1.5 px-1">
                          <span className="text-[11px] font-black text-[#4E5C70]">
                            {isAgent ? (
                              <span className="text-success font-black flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                Оператор поддержки
                              </span>
                            ) : (
                              'Бот-помощник'
                            )}
                          </span>
                        </div>
                      )}
                      <div
                        className={`rounded-2xl text-xs font-medium leading-relaxed ${
                          msg.imageUrl && !msg.text?.trim() && !msg.productCard && !msg.promoCard && !msg.orderStatusUpdate
                            ? 'p-2'
                            : 'p-3.5 space-y-2.5'
                        } ${
                          isUser
                            ? 'neu-bubble-own rounded-tr-none'
                            : isAgent
                            ? 'neu-flat rounded-tl-none text-[#2D3A4E] border border-success/60 bg-success-soft'
                            : 'neu-flat rounded-tl-none text-[#2D3A4E] border border-white/80'
                        }`}
                      >
                        {msg.text && <p className="whitespace-pre-line">{msg.text}</p>}

                        {/* Photo preview in message bubble */}
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
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-[11px] font-bold">
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>Увеличить фото</span>
                            </div>
                          </button>
                        )}

                        {/* Product Recommendation Card Attached */}
                        {msg.productCard && (
                          <div className="pt-1.5">
                            <div className="neu-flat rounded-2xl p-3 bg-[#E3E8EF] border border-accent/30 text-[#2D3A4E] space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-accent" />
                                  Рекомендация стилиста
                                </span>
                                <span className="text-[11px] font-black text-[#2D3A4E]">
                                  {msg.productCard.price.toLocaleString('ru-RU')} ₽
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 neu-inset p-1 bg-[#E3E8EF]">
                                  <img
                                    src={msg.productCard.image}
                                    alt={msg.productCard.title}
                                    className="w-full h-full rounded-lg object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-extrabold text-xs text-[#2D3A4E] truncate">
                                    {msg.productCard.title}
                                  </p>
                                  <p className="text-[11px] text-[#4E5C70] pt-0.5">
                                    Размер: <strong className="text-accent">{msg.productCard.size || 'M'}</strong> • {msg.productCard.color || 'Базовый'}
                                  </p>
                                  {msg.productCard.note && (
                                    <p className="text-[11px] text-[#4E5C70] italic truncate">
                                      {msg.productCard.note}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                {onAddToCart && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (msg.productCard) {
                                        onAddToCart(
                                          msg.productCard.productId,
                                          msg.productCard.color,
                                          msg.productCard.size
                                        );
                                      }
                                    }}
                                    className="flex-1 py-2 px-2.5 neu-button rounded-xl text-accent font-black text-[11px] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                                  >
                                    <ShoppingBag className="w-3 h-3" />
                                    <span>В корзину</span>
                                  </button>
                                )}
                                {onSelectProductById && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (msg.productCard) {
                                        onClose();
                                        onSelectProductById(msg.productCard.productId);
                                      }
                                    }}
                                    className="py-2 px-3 neu-button rounded-xl text-accent font-extrabold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                                  >
                                    <span>Смотреть</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Order Status Update Card Attached */}
                        {msg.orderStatusUpdate && (
                          <div className="pt-1.5">
                            <div className="neu-flat rounded-2xl p-3 bg-accent/2 border border-accent/40 text-[#2D3A4E] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1">
                                  <Truck className="w-3.5 h-3.5 text-accent" />
                                  Обновление статуса заказа
                                </span>
                                <span className="text-[11px] font-black text-accent">
                                  № {msg.orderStatusUpdate.orderId}
                                </span>
                              </div>
                              <div className="neu-inset rounded-xl p-2.5 bg-[#E3E8EF] flex items-center justify-between">
                                <span className="text-[11px] font-bold text-[#2D3A4E]">
                                  Новый статус:
                                </span>
                                <span className="text-[11px] font-black text-success">
                                  {msg.orderStatusUpdate.newStatusLabel}
                                </span>
                              </div>
                              {msg.orderStatusUpdate.trackingNumber && (
                                <p className="text-[11px] text-[#4E5C70] font-mono">
                                  Трек-номер: <strong className="text-[#2D3A4E]">{msg.orderStatusUpdate.trackingNumber}</strong>
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Promo Code Card Attached */}
                        {msg.promoCard && (
                          <div className="pt-2">
                            <div className="neu-flat rounded-2xl p-3 bg-gradient-to-br from-accent/4 to-purple-50/60 border border-accent/40 text-[#2D3A4E] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-accent" />
                                  Персональный промокод
                                </span>
                                <span className="text-[11px] font-extrabold text-success neu-inset px-2 py-0.5 rounded-lg bg-success-soft">
                                  {msg.promoCard.discountType === 'fixed'
                                    ? `-${msg.promoCard.discountValue.toLocaleString('ru-RU')} ₽`
                                    : `-${msg.promoCard.discountValue}%`}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2 p-2 neu-inset rounded-xl bg-[#E3E8EF] border border-[#BAC5D5]/40">
                                <span className="font-mono font-black text-xs text-[#2D3A4E] tracking-wider">
                                  {msg.promoCard.code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (msg.promoCard) {
                                      copyToClipboard(msg.promoCard.code);
                                      if (onApplyPromo) {
                                        onApplyPromo(msg.promoCard.code);
                                      }
                                    }
                                  }}
                                  className="px-2 py-1 neu-button rounded-lg text-[11px] font-black text-accent hover:text-accent-strong active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                  title="Скопировать и применить промокод"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Применить</span>
                                </button>
                              </div>

                              <p className="text-[11px] text-[#4E5C70]">
                                {msg.promoCard.description}
                              </p>
                            </div>
                          </div>
                        )}

                      {/* Interactive Actions */}
                      {msg.actionKey === 'size_calc' && (
                        <div className="pt-2.5">
                          <button
                            onClick={() => {
                              onClose();
                              if (onOpenMySizes) onOpenMySizes();
                            }}
                            className="w-full py-2.5 px-3.5 rounded-xl neu-button-accent font-extrabold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.01] cursor-pointer"
                          >
                            <Ruler className="w-4 h-4 text-white" />
                            <span>Открыть «Мои размеры»</span>
                          </button>
                        </div>
                      )}

                      {msg.actionKey === 'orders' && (
                        <div className="pt-2.5">
                          <button
                            onClick={() => {
                              onClose();
                              if (onNavigateTab) onNavigateTab('profile');
                            }}
                            className="w-full py-2.5 px-3.5 rounded-xl neu-button text-[#2D3A4E] font-extrabold text-xs flex items-center justify-center gap-2 border border-white/60 transition-all hover:scale-[1.01] cursor-pointer"
                          >
                            <PackageCheck className="w-4 h-4 text-[#2D3A4E]" />
                            <span>Перейти в Заказы</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      className={`flex items-center gap-1 text-[11px] text-[#4E5C70] px-1 ${
                        isUser ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{msg.timestamp}</span>
                      {isUser && <CheckCheck className="w-3 h-3 text-accent" />}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex items-center gap-2.5">
                <div className="neu-flat rounded-2xl rounded-tl-none px-4 py-3 text-xs text-[#4E5C70] flex items-center gap-1.5 border border-white/80">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Question Chips with deep neomorphic inset styling */}
          <div className="px-3.5 py-2.5 bg-[#E3E8EF] overflow-x-auto no-scrollbar shrink-0 border-t border-[#BAC5D5]/40 shadow-[inset_0_1px_3px_rgba(163,177,198,0.3)]">
            <div className="flex items-center gap-2 py-0.5">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSubmit(q.text)}
                  className="neu-inset bg-[#E3E8EF] rounded-xl py-2 px-3.5 text-[#2D3A4E] text-[11px] font-bold shrink-0 flex items-center gap-1.5 hover:text-accent border border-white/70 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Attached image preview bar */}
          {attachedImage && (
            <div className="px-3.5 py-2 bg-[#E3E8EF] flex items-center justify-between border-t border-[#BAC5D5]/40 neu-inset">
              <div className="flex items-center gap-2.5">
                <img
                  src={attachedImage}
                  alt="Прикрепление"
                  className="w-10 h-10 rounded-xl object-cover border border-white shadow-sm"
                />
                <div>
                  <span className="text-xs font-bold text-[#2D3A4E] block">
                    Фото прикреплено к вопросу
                  </span>
                  <span className="text-[11px] text-[#4E5C70]">
                    Готово к отправке консультанту
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="w-7 h-7 rounded-xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-danger hover:text-danger active:scale-90 transition-all border border-white/70 cursor-pointer"
                title="Удалить прикрепленное фото"
                aria-label="Удалить прикрепленное фото"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Footer Input Form with uniform neu-inset depth */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="p-3 sm:p-3.5 bg-[#E3E8EF] border-t border-[#BAC5D5]/50 flex items-center gap-2.5 shrink-0 shadow-[0_-2px_6px_rgba(163,177,198,0.2)]"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-11 h-11 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-accent hover:text-accent-strong border border-white/70 active:scale-95 transition-all shrink-0 cursor-pointer"
              title="Прикрепить фото для возврата или консультации"
              aria-label="Прикрепить фото для возврата или консультации"
            >
              <Camera className="w-5 h-5 text-accent stroke-[2.2]" />
            </button>

            <div className="flex-1 neu-inset rounded-2xl px-3.5 py-2.5 flex items-center gap-2 border border-white/70 bg-[#E3E8EF]">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                placeholder="Задайте вопрос или вставьте фото (Ctrl+V)..."
                className="w-full bg-transparent text-xs text-[#2D3A4E] placeholder:text-[#56647A] font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() && !attachedImage}
              className="w-11 h-11 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-accent hover:text-accent-strong border border-white/70 active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Отправить сообщение"
              aria-label="Отправить сообщение"
            >
              <Send className="w-5 h-5 text-accent stroke-[2.2]" />
            </button>
          </form>
        </motion.div>

        {/* Fullscreen Image Lightbox Modal */}
        {previewImageModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
            onClick={() => setPreviewImageModal(null)}
          >
            <div
              className="relative max-w-2xl max-h-[88vh] bg-[#E3E8EF] p-2.5 sm:p-3 rounded-3xl neu-flat overflow-hidden flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewImageModal(null)}
                className="absolute top-3.5 right-3.5 z-10 w-9 h-9 rounded-2xl bg-[#2D3A4E]/85 hover:bg-[#2D3A4E] text-white flex items-center justify-center transition-all cursor-pointer shadow-[var(--neu-on-photo)] active:scale-90"
                title="Закрыть просмотр"
                aria-label="Закрыть просмотр"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={previewImageModal}
                alt="Увеличенный просмотр"
                className="max-h-[82vh] w-auto max-w-[88vw] rounded-2xl object-contain shadow-inner"
              />
            </div>
          </div>
        )}
      </motion.div>
    )}
  </AnimatePresence>
  );
};
