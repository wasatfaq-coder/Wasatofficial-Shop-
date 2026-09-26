import React from 'react';
import { EyeOff, Image as ImageIcon, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ChatMessage } from '../types';
import { ModalPortal } from './ModalPortal';

/** Short text of a message for previews: its text, or what is attached */
export function chatMessagePreview(msg: ChatMessage): string {
  const text = msg.text?.trim();
  if (text) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  if (msg.promoCard) return `Промокод ${msg.promoCard.code}`;
  if (msg.productCard) return `Товар: ${msg.productCard.title}`;
  if (msg.orderStatusUpdate) return `Статус заказа № ${msg.orderStatusUpdate.orderId}`;
  return msg.imageUrl ? 'Фото' : 'Сообщение';
}

interface ChatMessageMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Hidden when the message cannot be edited (someone else's, or attachments only) */
  onEdit?: () => void;
  onDelete: () => void;
  align: 'start' | 'end';
}

/** «⋯» next to a message; opens a row of actions under it (no popover to be clipped by the scroll area) */
export const ChatMessageMenu: React.FC<ChatMessageMenuProps> = ({ isOpen, onToggle, onEdit, onDelete, align }) => (
  <div className={`flex items-center gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
    {isOpen && (
      <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            Изменить
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-bold text-danger flex items-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Удалить
        </button>
      </div>
    )}
    <button
      type="button"
      onClick={onToggle}
      aria-label={isOpen ? 'Скрыть действия с сообщением' : 'Действия с сообщением'}
      aria-expanded={isOpen}
      title="Изменить или удалить"
      className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
        isOpen ? 'neu-pill-active text-accent' : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
      }`}
    >
      {isOpen ? <X className="w-3.5 h-3.5" /> : <MoreHorizontal className="w-4 h-4" />}
    </button>
  </div>
);

interface ChatMessageDeleteDialogProps {
  message: ChatMessage | null;
  /** Who else sees the message: «покупателя» / «сотрудников» */
  otherSide: string;
  /** Nobody else sees it (a staff note): only «Удалить» */
  forAllOnly?: boolean;
  onDeleteForMe: () => void;
  onDeleteForAll: () => void;
  onClose: () => void;
}

/**
 * «Удалить у меня» hides the message on this side only; «Удалить у всех» removes it from the dialog.
 * Same look as ConfirmDialog, with a preview of the message.
 */
export const ChatMessageDeleteDialog: React.FC<ChatMessageDeleteDialogProps> = ({
  message,
  otherSide,
  forAllOnly = false,
  onDeleteForMe,
  onDeleteForAll,
  onClose,
}) => (
  <ModalPortal>
    <AnimatePresence>
      {message && (
        <motion.div
          key="chat-delete-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4"
        >
          <div onClick={onClose} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label="Удалить сообщение"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 z-10"
          >
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 text-danger">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-[#2D3A4E]">Удалить сообщение?</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <div className="neu-inset rounded-2xl p-2.5 bg-[#E3E8EF] flex items-center gap-3 min-w-0">
              {message.imageUrl ? (
                <img src={message.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
              ) : null}
              <p className="text-xs text-[#2D3A4E] leading-snug break-words min-w-0 whitespace-pre-line">
                {message.imageUrl && !message.text?.trim() ? (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> Фото
                  </span>
                ) : (
                  chatMessagePreview(message)
                )}
              </p>
            </div>

            <p className="text-xs text-[#4E5C70] leading-relaxed">
              {forAllOnly
                ? 'Заметку видят только сотрудники — она будет удалена из диалога.'
                : `«Удалить у меня» — сообщение останется у ${otherSide}. «Удалить у всех» — оно исчезнет из диалога.`}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {!forAllOnly && (
              <button
                type="button"
                onClick={() => {
                  onDeleteForMe();
                  onClose();
                }}
                className="py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Удалить у меня
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onDeleteForAll();
                  onClose();
                }}
                className={`py-2.5 px-3 neu-button-danger rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer ${
                  forAllOnly ? 'col-span-2' : ''
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {forAllOnly ? 'Удалить' : 'Удалить у всех'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="col-span-2 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </ModalPortal>
);
