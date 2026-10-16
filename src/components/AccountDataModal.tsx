import React from 'react';
import { Download, LogOut, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import type { Order, UserProfile } from '../types';
import { useDialogA11y } from '../utils/useDialogA11y';
import { GoogleLogoIcon } from '../views/profile/ProfileAccountCard';

interface AccountDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  /** The buyer's own orders (already filtered by the app) */
  orders: Order[];
  /** Signed in with Google: the account is managed by Google (password, 2-step verification) */
  googleEmail?: string | null;
  onSwitchAccount?: () => void;
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
  onSwitchAccount,
  onSignOut,
  onShowToast,
}) => {
  const dialog = useDialogA11y(isOpen, onClose);
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
          <div onClick={onClose} className="fixed inset-0 bg-text-primary/50 backdrop-blur-xs cursor-pointer" />
          <m.div
            ref={dialog.ref}
            {...dialog.props}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-4 relative z-10 text-text-primary"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                </div>
                <h3 id={dialog.titleId} className="text-base font-extrabold">
                  Аккаунт и данные
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-text-secondary cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">Вход</p>
              {googleEmail ? (
                <>
                  <p className="text-xs font-bold">Аккаунт Google: {googleEmail}</p>
                  <p className="text-xs text-text-secondary leading-snug">
                    Пароль и двухэтапная проверка настраиваются в вашем аккаунте Google.
                  </p>
                  {onSwitchAccount && (
                    <button
                      type="button"
                      onClick={onSwitchAccount}
                      className="w-full py-2 px-3 neu-button rounded-xl text-xs font-bold text-text-primary hover:text-accent flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span>Сменить аккаунт Google</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-text-secondary">Вы не вошли. Данные хранятся только в этом браузере.</p>
                  {onSwitchAccount && (
                    <button
                      type="button"
                      onClick={onSwitchAccount}
                      className="w-full py-2 px-3 neu-button rounded-xl text-xs font-bold text-text-primary hover:text-accent flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <GoogleLogoIcon />
                      <span>Войти через Google</span>
                    </button>
                  )}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="w-full py-3 neu-button rounded-2xl text-xs font-extrabold text-accent flex items-center justify-center gap-2 cursor-pointer"
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
                className="w-full py-3 neu-button-danger rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Выйти из аккаунта
              </button>
            )}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
};
