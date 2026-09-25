import React, { useEffect } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Info,
  X,
  Truck,
  Package,
  Store,
  Check,
  Bell,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Order } from '../types';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'error' | 'order_status' | 'push';
  text: string;
  title?: string;
  subtitle?: string;
  orderId?: string;
  oldStatus?: Order['status'];
  newStatus?: Order['status'];
  badgeText?: string;
  badgeBg?: string;
  icon?: 'truck' | 'package' | 'store' | 'check' | 'alert' | 'bell' | 'sparkles';
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2.5 w-11/12 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const duration = toast.duration || (toast.type === 'order_status' || toast.type === 'push' ? 6000 : 3500);

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, duration]);

  // Render Icon according to toast type or specified icon
  const renderIcon = () => {
    if (toast.icon === 'truck') {
      return (
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-sky-600 bg-sky-50/80 shrink-0">
          <Truck className="w-4 h-4 stroke-[2.5]" />
        </div>
      );
    }
    if (toast.icon === 'package') {
      return (
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-amber-600 bg-amber-50/80 shrink-0">
          <Package className="w-4 h-4 stroke-[2.5]" />
        </div>
      );
    }
    if (toast.icon === 'store') {
      return (
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-emerald-600 bg-emerald-50/80 shrink-0">
          <Store className="w-4 h-4 stroke-[2.5]" />
        </div>
      );
    }
    if (toast.icon === 'check' || toast.type === 'success') {
      return (
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-emerald-600 bg-emerald-50/80 shrink-0">
          <CheckCircle className="w-4 h-4 stroke-[2.5]" />
        </div>
      );
    }
    if (toast.icon === 'alert' || toast.type === 'error') {
      return (
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-rose-600 bg-rose-50/80 shrink-0">
          <AlertCircle className="w-4 h-4 stroke-[2.5]" />
        </div>
      );
    }
    if (toast.icon === 'sparkles') {
      return (
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-amber-500 bg-amber-50/80 shrink-0">
          <Sparkles className="w-4 h-4 stroke-[2.5]" />
        </div>
      );
    }

    // Default icon
    return (
      <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF] shrink-0">
        <Bell className="w-4 h-4 stroke-[2.5]" />
      </div>
    );
  };

  const isRichNotification = toast.type === 'order_status' || toast.type === 'push' || Boolean(toast.title);

  if (isRichNotification) {
    return (
      <div
        className="pointer-events-auto neu-modal rounded-2xl p-3.5 border border-white/90 shadow-xl space-y-2.5 animate-in fade-in slide-in-from-top-4 duration-300 relative bg-[#E3E8EF]"
        role="alert"
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {renderIcon()}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-[#2D3A4E] leading-tight truncate">
                  {toast.title || 'Push-уведомление'}
                </span>
                {toast.badgeText && (
                  <span
                    className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                      toast.badgeBg || 'bg-indigo-100 text-[#5F6ED0] border-indigo-200'
                    }`}
                  >
                    {toast.badgeText}
                  </span>
                )}
              </div>
              {toast.subtitle && (
                <p className="text-[10px] font-bold text-[#5F6ED0] mt-0.5 truncate">
                  {toast.subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="text-[#5C6B80] hover:text-[#2D3A4E] p-1 rounded-full neu-button transition-colors cursor-pointer shrink-0"
            aria-label="Закрыть уведомление"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Message body */}
        <p className="text-xs text-[#5C6B80] leading-snug pl-0.5">
          {toast.text}
        </p>

        {/* Action Button if provided */}
        {toast.action && (
          <div className="pt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="py-1.5 px-3 neu-button-accent rounded-xl text-[11px] font-black text-white flex items-center gap-1 cursor-pointer active:scale-95 transition-transform shadow-xs"
            >
              <span>{toast.action.label}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Standard Compact Toast Item
  return (
    <div
      className="pointer-events-auto neu-dropdown rounded-2xl p-3 px-4 flex items-center justify-between gap-3 border border-white/80 shadow-md animate-in fade-in slide-in-from-top-4 duration-300 bg-[#E3E8EF]"
      role="status"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />}
        {toast.type === 'info' && <Info className="w-5 h-5 text-[#5F6ED0] shrink-0" />}
        {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />}
        <span className="text-xs sm:text-sm font-bold text-[#2D3A4E] truncate">{toast.text}</span>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-[#5C6B80] hover:text-[#2D3A4E] p-1 rounded-full neu-button transition-colors cursor-pointer shrink-0"
        aria-label="Закрыть"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
