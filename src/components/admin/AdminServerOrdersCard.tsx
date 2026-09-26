import React, { useEffect, useState } from 'react';
import { ServerCog, ShieldCheck } from 'lucide-react';
import { isPlaceOrderAvailable } from '../../firebase';
import { saveServerConfigToFirestore, subscribeToServerConfig } from '../../utils/firebaseSync';
import { ConfirmDialog } from '../ConfirmDialog';

interface AdminServerOrdersCardProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * settings/server.serverOrdersEnabled: orders are placed by the placeOrder Cloud Function, which
 * recalculates prices, checks stock and promo codes; firestore.rules then stop accepting orders,
 * stock and promo-counter writes from browsers. It is switched on only after the function answers,
 * otherwise checkout would stop working.
 */
export const AdminServerOrdersCard: React.FC<AdminServerOrdersCardProps> = ({ onShowToast }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDisableConfirmOpen, setIsDisableConfirmOpen] = useState(false);

  useEffect(() => subscribeToServerConfig((config) => setEnabled(config.serverOrdersEnabled === true)), []);

  const handleEnable = async () => {
    setIsChecking(true);
    try {
      if (!(await isPlaceOrderAvailable())) {
        onShowToast(
          'Функция оформления заказов не отвечает: она еще не развернута. Режим не включен, заказы работают как раньше.',
          'error'
        );
        return;
      }
      await saveServerConfigToFirestore({ serverOrdersEnabled: true });
      onShowToast('Заказы теперь оформляет сервер: цены, остатки и промокоды проверяются там', 'success');
    } catch (err) {
      console.error('Enabling server orders failed:', err);
      onShowToast('Не удалось включить режим. Попробуйте еще раз', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleDisable = async () => {
    setIsDisableConfirmOpen(false);
    try {
      await saveServerConfigToFirestore({ serverOrdersEnabled: false });
      onShowToast('Заказы снова оформляет браузер покупателя', 'info');
    } catch (err) {
      console.error('Disabling server orders failed:', err);
      onShowToast('Не удалось выключить режим', 'error');
    }
  };

  return (
    <div className="neu-flat p-4 sm:p-5 rounded-3xl space-y-3 border border-white/60">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
            <ServerCog className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-black text-[#2D3A4E]">Проверка заказов на сервере</h4>
            <p className="text-[11px] text-[#4E5C70] leading-snug">
              Сервер пересчитывает цену, проверяет остатки и промокоды. Покупатель не сможет изменить
              сумму заказа или остатки на складе из своего браузера.
            </p>
          </div>
        </div>
        {enabled === null ? null : enabled ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black text-success bg-success-soft border border-success/25">
            <ShieldCheck className="w-3.5 h-3.5" />
            Включено
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black text-warning bg-warning-soft border border-warning/25">
            Выключено
          </span>
        )}
      </div>

      {enabled === false && (
        <p className="text-[11px] text-[#4E5C70] leading-snug neu-inset rounded-2xl p-3">
          Нужна развернутая функция placeOrder (тариф Firebase Blaze и переменная репозитория
          DEPLOY_FUNCTIONS = true). Перед включением функция проверяется: если она не отвечает,
          режим не включится и заказы продолжат работать.
        </p>
      )}

      <div className="flex justify-end">
        {enabled ? (
          <button
            type="button"
            onClick={() => setIsDisableConfirmOpen(true)}
            className="py-2 px-3.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] cursor-pointer"
          >
            Выключить
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={enabled === null || isChecking}
            className="py-2 px-3.5 neu-button rounded-xl text-xs font-black text-accent cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {isChecking ? 'Проверяем функцию…' : 'Проверить и включить'}
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={isDisableConfirmOpen}
        title="Выключить проверку на сервере?"
        message="Заказы снова будет оформлять браузер покупателя, а правила базы разрешат ему списывать остатки."
        confirmLabel="Выключить"
        tone="neutral"
        onConfirm={handleDisable}
        onClose={() => setIsDisableConfirmOpen(false)}
      />
    </div>
  );
};
