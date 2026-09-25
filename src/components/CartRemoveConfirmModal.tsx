import React from 'react';
import { Trash2, Heart, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem } from '../types';

interface CartRemoveConfirmModalProps {
  isOpen: boolean;
  item: CartItem | null;
  onClose: () => void;
  onConfirmRemove: (cartItemId: string) => void;
  onMoveToFavorites: (item: CartItem) => void;
}

export const CartRemoveConfirmModal: React.FC<CartRemoveConfirmModalProps> = ({
  isOpen,
  item,
  onClose,
  onConfirmRemove,
  onMoveToFavorites,
}) => {
  return (
    <AnimatePresence>
      {isOpen && item && (
        <motion.div
          key="cart-remove-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />
          <motion.div
            key="cart-remove-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 z-10"
          >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
            <div className="flex items-center gap-2 text-[#7E525E]">
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-[#7E525E]" />
              </div>
              <h3 className="text-sm font-extrabold text-[#2D3A4E]">Удаление товара</h3>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Item details */}
          <div className="neu-inset rounded-2xl p-2.5 bg-[#E3E8EF] flex items-center gap-3">
            <img
              src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
              alt={item.product?.title || ''}
              className="w-12 h-12 rounded-xl object-cover neu-flat shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-black text-xs text-[#2D3A4E] truncate">{item.product.title}</p>
              <p className="text-[11px] text-[#5C6B80]">
                {item.selectedColor} • {item.selectedSize} ({item.quantity} шт.)
              </p>
              <p className="text-xs font-black text-[#5F6ED0] pt-0.5">
                {(item.product.price * item.quantity).toLocaleString('ru-RU')} ₽
              </p>
            </div>
          </div>

          <p className="text-xs text-[#5C6B80] leading-relaxed text-center">
            Вы можете удалить товар из корзины или сохранить его в <strong>Избранное</strong>, чтобы вернуться к покупке позже.
          </p>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => {
                onMoveToFavorites(item);
                onClose();
              }}
              className="w-full py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#5F6ED0] hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4 stroke-[2.2] fill-[#5F6ED0]/20 text-[#5F6ED0]" />
              <span>Переместить в Избранное</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                Оставить
              </button>
              <button
                onClick={() => {
                  onConfirmRemove(item.id);
                  onClose();
                }}
                className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-black text-[#7E525E] hover:text-[#2D3A4E] hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
};
