import React from 'react';
import { Download, LogOut, ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Order, UserProfile } from '../types';

interface AccountDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  /** The buyer's own orders (already filtered by the app) */
  orders: Order[];
  /** Signed in with Google: the account is managed by Google (password, 2-step verification) */
  googleEmail?: string | null;
  onSignOut?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * «Аккаунт и данные»: only what the app really does. Sign-in is through Google, so password
 * and two-step verification live in the Google account; here the buyer can download their data
 * and sign out. (Earlier versions imitated 2FA, session revocation and password change.)
 */
export const AccountDataModal: React.FC<AccountDataModalProps> = ({
  isOpen,
  onClose,
  profile,
  orders,
  googleEmail,
  onSignOut,
  onShowToast,
}) => {
  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        savedAddresses: profile.savedAddresses,
        bodyMeasurements: profile.bodyMeasurements,
      },
      orders: orders.map((o) => ({
        id: o.id,
        date: o.date,
        status: o.status,
        totalPrice: o.totalPrice,
        deliveryMethod: o.deliveryMethod,
        deliveryAddress: o.deliveryAddress,
        paymentMethod: o.paymentMethod,
        items: (o.items ?? []).map((i) => ({
          title: i.product?.title,
          color: i.selectedColor,
          size: i.selectedSize,
          quantity: i.quantity,
        })),
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Файл с вашими данными скачан', 'success');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div onClick={onClose} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-data-title"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 relative z-10 text-[#2D3A4E]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-accent">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 id="account-data-title" className="text-base font-extrabold">
                  Аккаунт и данные
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="neu-inset rounded-2xl p-3.5 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#4E5C70]">Вход</p>
              {googleEmail ? (
                <>
                  <p className="text-xs font-bold">Аккаунт Google: {googleEmail}</p>
                  <p className="text-[11px] text-[#4E5C70] leading-snug">
                    Пароль и двухэтапная проверка настраиваются в вашем аккаунте Google.
                  </p>
                </>
              ) : (
                <p className="text-xs text-[#4E5C70]">Вы не вошли. Данные хранятся только в этом браузере.</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="w-full py-3 neu-button rounded-2xl text-xs font-black text-accent flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Скачать мои данные (профиль и заказы)
            </button>

            {googleEmail && onSignOut && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="w-full py-3 neu-button-danger rounded-2xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Выйти из аккаунта
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
