import React from 'react';
import { CheckCircle2, Package, Home } from 'lucide-react';
import { ActiveTab } from '../types';
import { currentStoreName } from '../utils/storeContacts';

interface OrderSuccessScreenProps {
  orderId: string;
  totalPrice: number;
  deliveryMethod: string;
  deliveryAddress: string;
  setActiveTab: (tab: ActiveTab) => void;
}

export const OrderSuccessScreen: React.FC<OrderSuccessScreenProps> = ({
  orderId,
  totalPrice,
  deliveryMethod,
  deliveryAddress,
  setActiveTab,
}) => {
  return (
    <div className="py-8 space-y-6 text-center animate-in zoom-in-95 duration-300 max-w-sm mx-auto pb-28">
      {/* Celebration Icon */}
      <div className="relative w-28 h-28 rounded-full neu-flat p-2 flex items-center justify-center mx-auto border border-white/80">
        <div className="w-20 h-20 rounded-full neu-inset flex items-center justify-center text-success">
          <CheckCircle2 className="w-12 h-12 stroke-[2]" />
        </div>
      </div>

      <div className="space-y-2">
        <span className="neu-inset-deep neu-inset-deep-animated text-success text-xs font-extrabold px-3.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5 border border-success/40">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
          Заказ оформлен • Активен
        </span>
        <h2 className="text-2xl font-black text-[#2D3A4E] tracking-tight">
          Заказ № {orderId}
        </h2>
        <p className="text-xs text-[#4E5C70] max-w-xs mx-auto leading-relaxed font-medium">
          Спасибо за выбор {currentStoreName()}! Мы уже начали сборку и передачу вашего заказа в доставку.
        </p>
      </div>

      {/* Order Info Card with active status tracking box */}
      <div className="neu-flat rounded-3xl p-5 text-left space-y-3 border border-white/80">
        <div className="flex items-center gap-3 p-3 rounded-2xl neu-inset-deep neu-inset-deep-animated border border-accent/40 bg-[#E3E8EF]">
          <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
            <Package className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-[#4E5C70] font-medium">Текущий статус</p>
            <p className="text-xs font-black text-accent flex items-center gap-1.5">
              <span>Принят в обработку</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs pt-1">
          <div className="flex justify-between">
            <span className="text-[#4E5C70]">Сумма заказа:</span>
            <span className="font-bold text-[#2D3A4E]">{totalPrice.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4E5C70]">Доставка:</span>
            <span className="font-bold text-[#2D3A4E]">{deliveryMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4E5C70]">Адрес:</span>
            <span className="font-bold text-[#2D3A4E] truncate max-w-[180px]">{deliveryAddress}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => setActiveTab('profile')}
          className="w-full neu-button-accent text-white rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer btn-confirm-order active:neu-inset-deep active:scale-[0.98] transition-all"
        >
          <span>Отследить заказ в профиле</span>
        </button>

        <button
          onClick={() => setActiveTab('home')}
          className="w-full neu-button rounded-2xl py-3 font-bold text-xs text-[#4E5C70] hover:text-[#2D3A4E] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
        >
          <Home className="w-4 h-4" />
          <span>Вернуться на главную</span>
        </button>
      </div>
    </div>
  );
};

