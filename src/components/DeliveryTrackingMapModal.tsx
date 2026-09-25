import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Truck,
  Phone,
  MessageSquare,
  Navigation,
  Clock,
  CheckCircle,
  Copy,
  AlertCircle,
  ShieldCheck,
  Package,
  Layers,
  ZoomIn,
  ZoomOut,
  Compass,
  Sparkles,
  RefreshCw,
  Play,
  Pause,
  Mail,
  Store,
} from 'lucide-react';
import { Order, DeliveryStage } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import {
  getDefaultDeliveryStages,
  getSynchronizedDeliveryStages,
  isTransportCompanyDelivery,
  isRussianPostDelivery,
  isCourierDelivery,
  isPickupDelivery,
} from '../utils/deliveryStages';
import { motion, AnimatePresence } from 'motion/react';

interface DeliveryTrackingMapModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenSupportChat?: (orderId?: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const DeliveryTrackingMapModal: React.FC<DeliveryTrackingMapModalProps> = ({
  order,
  isOpen,
  onClose,
  onOpenSupportChat,
  onShowToast,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [courierProgress, setCourierProgress] = useState<number>(0.65); // 0 (warehouse) to 1 (customer)
  const [activeLayer, setActiveLayer] = useState<'streets' | 'satellite'>('streets');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(22);
  const [isRefreshingGps, setIsRefreshingGps] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !isSimulating || order?.status === 'delivered' || order?.isCancelled) return;

    const interval = setInterval(() => {
      setCourierProgress((prev) => {
        if (prev >= 0.95) return 0.2;
        return +(prev + 0.015).toFixed(3);
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isOpen, isSimulating, order?.status, order?.isCancelled]);

  useEffect(() => {
    // Dynamic remaining ETA based on courier progress
    const remaining = Math.max(4, Math.round((1 - courierProgress) * 45));
    setEstimatedMinutes(remaining);
  }, [courierProgress]);

  // Path coordinates for the SVG route (start: warehouse, end: client destination)
  // Route points: (80, 260) -> (170, 220) -> (240, 160) -> (320, 190) -> (420, 120) -> (500, 90)
  const startPoint = { x: 80, y: 260 };
  const endPoint = { x: 500, y: 90 };

  // Calculate courier current position along the bezier-like path
  const getCourierCoord = (t: number) => {
    // Cubic bezier interpolation approximation
    const p0 = startPoint;
    const p1 = { x: 190, y: 220 };
    const p2 = { x: 310, y: 140 };
    const p3 = endPoint;

    const cx = 3 * (p1.x - p0.x);
    const bx = 3 * (p2.x - p1.x) - cx;
    const ax = p3.x - p0.x - cx - bx;

    const cy = 3 * (p1.y - p0.y);
    const by = 3 * (p2.y - p1.y) - cy;
    const ay = p3.y - p0.y - cy - by;

    const x = ax * Math.pow(t, 3) + bx * Math.pow(t, 2) + cx * t + p0.x;
    const y = ay * Math.pow(t, 3) + by * Math.pow(t, 2) + cy * t + p0.y;

    return { x, y };
  };

  const courierPos = getCourierCoord(courierProgress);

  const handleCopyTrack = () => {
    if (order.trackingNumber) {
      copyToClipboard(order.trackingNumber);
      onShowToast(`Трек-номер ${order.trackingNumber} скопирован`, 'success');
    }
  };

  // Real delivery stages strictly synchronized with order status
  const deliveryStages: DeliveryStage[] = React.useMemo(() => {
    return order ? getSynchronizedDeliveryStages(order) : [];
  }, [order]);

  const deliveredStage = deliveryStages.find(
    (s) => s.id === 'stage-delivered' || s.title.toLowerCase().includes('вручен') || s.title.toLowerCase().includes('доставлен')
  );
  const transitStage = deliveryStages.find(
    (s) => s.id === 'stage-transit' || s.title.toLowerCase().includes('курьер') || s.title.toLowerCase().includes('пути')
  );

  const isDelivered = order?.status === 'delivered';
  const isInTransit =
    order?.status === 'in_transit' ||
    order?.status === 'ready';

  return (
    <AnimatePresence>
      {isOpen && order && (
        <motion.div
          key="delivery-tracking-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/60 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="delivery-modal"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal rounded-3xl max-w-2xl w-full text-[#2D3A4E] my-auto relative border border-white/80 max-h-[92vh] flex flex-col z-10 bg-[#E3E8EF] overflow-hidden"
          >
            {/* Top Header - Sticky */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 p-4 sm:p-5 gap-2 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                  <Navigation className="w-5 h-5 text-[#5F6ED0]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-[#2D3A4E] leading-tight whitespace-nowrap">
                      Онлайн-трекинг доставки
                    </h3>
                    <span className="text-[11px] font-mono font-black neu-inset px-2.5 py-0.5 rounded-lg text-[#5F6ED0] bg-[#E3E8EF] whitespace-nowrap shrink-0">
                      № {order.id}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-[#5C6B80] font-medium truncate">
                    Интерактивная карта и статус перемещения курьера
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer shrink-0 active:scale-95 transition-transform"
                title="Закрыть окно"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 no-scrollbar overscroll-contain transform-gpu">

        {/* Tracking Number Bar OR Clean Delivery Method Notice */}
        {(() => {
          const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
          const dm = (order.deliveryMethod || '').toLowerCase();
          const isPickup = dm.includes('самовывоз') || dm.includes('пункт выдачи') || dm.includes('бутик') || dm.includes('шоурум');
          const isExpress = dm.includes('экспресс') || dm.includes('express') || dm.includes('срочн');

          if (isTK) {
            if (order.trackingNumber) {
              return (
                <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] space-y-2 border border-white/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-[#5C6B80] uppercase tracking-wider">
                      Трек-номер отправления (ТК)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 neu-inset-deep neu-inset-deep-animated px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1 border border-emerald-400/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                      Активен
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm sm:text-base font-black font-mono text-[#2D3A4E] tracking-wider truncate">
                      {order.trackingNumber}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyTrack}
                      className="neu-button px-3 py-1.5 rounded-xl text-xs font-bold text-[#5F6ED0] flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-transform cursor-pointer whitespace-nowrap shrink-0"
                      title="Скопировать трек-номер"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Скопировать</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="neu-inset rounded-2xl p-3.5 bg-amber-50/70 border border-amber-300/80 text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <h4 className="text-xs font-extrabold text-amber-900">
                    Трек-номер формируется транспортной компанией
                  </h4>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed pl-6">
                  Продавец готовит отправление для транспортной компании. После регистрации накладной перевозчиком трек-номер будет отображен в деталях заказа.
                </p>
              </div>
            );
          }

          // Non-TK: Direct Courier / Pickup / Express
          return (
            <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] space-y-2 border border-white/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-[#5C6B80] uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#5F6ED0]" />
                  {isPickup ? 'Самовывоз из бутика' : isExpress ? 'Срочная экспресс-доставка' : 'Курьерская служба MANSTYLE'}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 neu-inset-deep neu-inset-deep-animated px-2.5 py-0.5 rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1 border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                  {isDelivered ? 'Заказ доставлен' : 'Прямая доставка без трек-номера'}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-[#2D3A4E] truncate">
                {order.deliveryMethod || 'Курьер'} &bull; {order.deliveryAddress || 'Адрес клиента'}
              </p>
            </div>
          );
        })()}

        {/* Interactive Map Visual Stage (neu-inset углубление) */}
        <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] border border-white/60 space-y-2.5 relative overflow-hidden">
          {/* Map Controls Floating Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between z-20 relative px-1 gap-2">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="text-xs font-extrabold text-[#2D3A4E] flex items-center gap-1.5 whitespace-nowrap">
                <MapPin className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0" />
                Карта маршрута курьера
              </span>
              {order.trackingNumber && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 neu-inset-deep neu-inset-deep-animated px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  Прямой эфир
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(prev + 0.15, 1.4))}
                className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-[#2D3A4E] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                title="Приблизить"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(prev - 0.15, 0.85))}
                className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-[#2D3A4E] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                title="Отдалить"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowTraffic(!showTraffic)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  showTraffic ? 'neu-button text-[#5F6ED0]' : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                }`}
                title="Пробки на дорогах"
              >
                Пробки: {showTraffic ? 'Вкл' : 'Выкл'}
              </button>
            </div>
          </div>

          {/* SVG Map Canvas Container */}
          <div className="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden neu-inset bg-[#DDE3EC] border border-white/50">
            {/* Map Canvas Background Grid & Elements */}
            <div
              className="w-full h-full relative transition-transform duration-300 origin-center"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <svg
                viewBox="0 0 600 320"
                className="w-full h-full select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* City Background Blocks */}
                <rect width="600" height="320" fill="#E2E7EF" />

                {/* City River (Москва-река) */}
                <path
                  d="M -20 180 C 140 160, 220 280, 360 260 C 460 240, 520 170, 620 150 L 620 200 C 520 220, 460 290, 360 310 C 220 330, 140 210, -20 230 Z"
                  fill="#C6D4E6"
                  opacity="0.75"
                />

                {/* Parks / Green Areas */}
                <rect x="40" y="30" width="100" height="70" rx="14" fill="#CFDFC8" opacity="0.7" />
                <text x="50" y="70" fill="#4B6346" fontSize="9" fontWeight="bold" opacity="0.6">
                  Парк Культуры
                </text>

                <rect x="380" y="210" width="130" height="60" rx="12" fill="#CFDFC8" opacity="0.7" />
                <text x="395" y="245" fill="#4B6346" fontSize="9" fontWeight="bold" opacity="0.6">
                  Набережная
                </text>

                {/* City Street Grid Lines */}
                <g stroke="#BAC7D8" strokeWidth="2.5" strokeLinecap="round" opacity="0.8">
                  {/* Horizontal Avenues */}
                  <line x1="10" y1="60" x2="590" y2="60" />
                  <line x1="10" y1="120" x2="590" y2="120" />
                  <line x1="10" y1="200" x2="590" y2="200" />
                  <line x1="10" y1="280" x2="590" y2="280" />

                  {/* Vertical Boulevards */}
                  <line x1="70" y1="10" x2="70" y2="310" />
                  <line x1="180" y1="10" x2="180" y2="310" />
                  <line x1="290" y1="10" x2="290" y2="310" />
                  <line x1="410" y1="10" x2="410" y2="310" />
                  <line x1="520" y1="10" x2="520" y2="310" />

                  {/* Diagonal Ring Road */}
                  <path
                    d="M 30 290 Q 300 240 570 50"
                    fill="none"
                    stroke="#A7B7CC"
                    strokeWidth="5"
                    strokeDasharray="8 4"
                  />
                </g>

                {/* Traffic Overlay (if enabled) */}
                {showTraffic && (
                  <g strokeLinecap="round" opacity="0.85">
                    <line x1="70" y1="100" x2="70" y2="240" stroke="#10B981" strokeWidth="3" />
                    <line x1="180" y1="40" x2="180" y2="170" stroke="#10B981" strokeWidth="3" />
                    <line x1="290" y1="90" x2="290" y2="210" stroke="#F59E0B" strokeWidth="3.5" />
                    <line x1="190" y1="120" x2="390" y2="120" stroke="#10B981" strokeWidth="3" />
                    <line x1="410" y1="120" x2="520" y2="120" stroke="#EF4444" strokeWidth="3.5" />
                  </g>
                )}

                {/* Delivery Route Path */}
                <path
                  d={`M ${startPoint.x} ${startPoint.y} C 190 220, 310 140, ${endPoint.x} ${endPoint.y}`}
                  fill="none"
                  stroke="#5F6ED0"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="6 4"
                  opacity="0.85"
                />

                {/* Covered Path (Already traversed by courier) */}
                <path
                  d={`M ${startPoint.x} ${startPoint.y} C 190 220, 310 140, ${courierPos.x} ${courierPos.y}`}
                  fill="none"
                  stroke="#3B49A8"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />

                {/* Warehouse / Hub Pin (Start Point) */}
                <g transform={`translate(${startPoint.x}, ${startPoint.y})`}>
                  <circle r="15" fill="#5F6ED0" fillOpacity="0.15" />
                  <circle r="10" fill="#3B49A8" />
                  <circle r="4" fill="#FFFFFF" />
                  <text x="-32" y="24" fill="#2D3A4E" fontSize="9" fontWeight="900">
                    Склад MANSTYLE
                  </text>
                </g>

                {/* Client Destination Pin (End Point) */}
                <g transform={`translate(${endPoint.x}, ${endPoint.y})`}>
                  <circle r="16" fill="#10B981" fillOpacity="0.18" />
                  <circle r="11" fill="#059669" />
                  <circle r="4" fill="#FFFFFF" />
                  <text x="-40" y="-16" fill="#065F46" fontSize="10" fontWeight="900">
                    Адрес доставки
                  </text>
                </g>

                {/* Live Courier Pin on Map (if order is being tracked) */}
                {order.trackingNumber && (
                  <g
                    transform={`translate(${courierPos.x}, ${courierPos.y})`}
                    className="transition-transform duration-300"
                  >
                    {/* Radar ripple rings */}
                    <circle r="18" fill="#5F6ED0" fillOpacity="0.2" />
                    <circle r="12" fill="#5F6ED0" fillOpacity="0.45" />
                    <circle r="8" fill="#1E293B" stroke="#FFFFFF" strokeWidth="2" />
                    {/* Directional pointer / car symbol */}
                    <polygon points="0,-4 3.5,3.5 -3.5,3.5" fill="#FFFFFF" />
                  </g>
                )}
              </svg>

              {/* Floating Live Courier Status Badge on Map */}
              <div className="absolute bottom-2 left-2 right-2 bg-[#E3E8EF]/95 rounded-2xl p-2.5 sm:p-3 neu-flat-sm flex items-center justify-between text-xs border border-white/90">
                <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                  <div className="w-8 h-8 rounded-xl bg-[#5F6ED0] text-white flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-[#2D3A4E] truncate text-xs sm:text-sm leading-tight">
                      {isDelivered
                        ? 'Заказ доставлен адресату'
                        : order.trackingNumber
                        ? 'Курьер в пути к вам'
                        : 'Ожидается передача курьеру'}
                    </p>
                    <p className="text-[10px] text-[#5C6B80] truncate leading-tight mt-0.5">
                      {order.deliveryAddress || 'ул. Ленина, д. 10, кв. 25, Москва'}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2.5 border-l border-[#BAC5D5]/50 whitespace-nowrap">
                  <span className="font-black text-[#5F6ED0] text-xs sm:text-sm block leading-tight">
                    {isDelivered ? '0 мин' : `~${estimatedMinutes} мин`}
                  </span>
                  <span className="text-[9px] text-[#5C6B80] font-bold block leading-tight mt-0.5">
                    {isDelivered ? 'Вручено' : 'Ожидаемое время'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Service Details & Quick Contact Card */}
        {(() => {
          const isPost = isRussianPostDelivery(order.deliveryMethod, order.trackingCompany);
          const isPickup = isPickupDelivery(order.deliveryMethod);
          const isCourier = isCourierDelivery(order.deliveryMethod, order.trackingCompany);
          const isExpress = (order.deliveryMethod || '').toLowerCase().includes('экспресс') || (order.deliveryMethod || '').toLowerCase().includes('express');

          if (isPost) {
            return (
              <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-blue-50/50 border border-blue-200/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-2xl neu-flat flex items-center justify-center bg-white text-blue-700 shrink-0 font-black text-sm border border-blue-200/90">
                    ПР
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#2D3A4E] truncate">Почта России</span>
                      <span className="text-[10px] font-bold text-blue-700 neu-flat px-1.5 py-0.5 rounded-lg bg-blue-50 whitespace-nowrap shrink-0">
                        1-й класс
                      </span>
                    </div>
                    <p className="text-[11px] text-[#5C6B80] truncate">
                      Доставка в почтовое отделение связи РФ
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#BAC5D5]/30">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenSupportChat) {
                        onClose();
                        onOpenSupportChat(order?.id);
                      } else {
                        onShowToast(`Открыт чат поддержки по заказу #${order?.id || ''}`, 'info');
                      }
                    }}
                    className="flex-1 sm:flex-initial py-2 px-4 rounded-xl neu-button text-blue-700 hover:text-blue-900 hover:scale-105 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold whitespace-nowrap"
                    title="Написать в чат поддержки"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Чат заботы</span>
                  </button>
                </div>
              </div>
            );
          }

          if (isPickup) {
            return (
              <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-white/70">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-2xl neu-flat flex items-center justify-center bg-white text-[#5F6ED0] shrink-0 font-black text-sm border border-white/90">
                    MS
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="text-xs font-black text-[#2D3A4E] truncate">Бутик MANSTYLE</span>
                    <p className="text-[11px] text-[#5C6B80] truncate">
                      Выдача заказов &bull; Персональный стилист и примерка
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#BAC5D5]/30">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenSupportChat) {
                        onClose();
                        onOpenSupportChat(order?.id);
                      } else {
                        onShowToast(`Открыт чат поддержки по заказу #${order?.id || ''}`, 'info');
                      }
                    }}
                    className="flex-1 sm:flex-initial py-2 px-4 rounded-xl neu-button text-[#2D3A4E] hover:text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold whitespace-nowrap"
                    title="Написать консультанту бутика"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0" />
                    <span>Консьерж бутика</span>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="neu-inset rounded-2xl p-3 sm:p-3.5 bg-[#E3E8EF] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-white/70">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-2xl neu-flat flex items-center justify-center bg-white text-[#5F6ED0] shrink-0 font-black text-sm border border-white/90">
                  АС
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#2D3A4E] truncate">
                      {isExpress ? 'Иван (Экспресс)' : 'Алексей Смирнов'}
                    </span>
                    <span className="text-[10px] font-bold text-amber-700 neu-flat px-1.5 py-0.5 rounded-lg bg-amber-50 whitespace-nowrap shrink-0">
                      ★ 4.96
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5C6B80] truncate">
                    {isExpress ? 'Срочный курьер ManStyle' : 'Курьер ManStyle • Lada Largus (о742ве777)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#BAC5D5]/30">
                {!order.isCancelled && order.status !== 'delivered' && (
                  <a
                    href="tel:+79165550199"
                    onClick={() => onShowToast('Вызов курьера: +7 (916) 555-01-99', 'info')}
                    className="flex-1 sm:flex-initial py-2 px-3 rounded-xl neu-button text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold whitespace-nowrap"
                    title="Позвонить курьеру (+7 916 555-01-99)"
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>Позвонить</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenSupportChat) {
                      onClose();
                      onOpenSupportChat(order?.id);
                    } else {
                      onShowToast(`Открыт чат поддержки по заказу #${order?.id || ''}`, 'info');
                    }
                  }}
                  className="flex-1 sm:flex-initial py-2 px-3 rounded-xl neu-button text-[#2D3A4E] hover:text-[#5F6ED0] hover:scale-105 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold whitespace-nowrap"
                  title="Написать в чат поддержки по заказу"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0" />
                  <span>Чат по заказу</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Delivery Stages Timeline (Этапы выполнения: neu-inset углубление & только реальные данные) */}
        <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3 border border-white/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#5F6ED0]" />
              Статусы этапов доставки
            </h4>
            <span className="text-[10px] font-bold text-[#5C6B80] whitespace-nowrap shrink-0">
              {deliveryStages.length} контрольных этапа
            </span>
          </div>

          <div className="space-y-2">
            {deliveryStages.map((step, idx) => {
              const isCompleted = step.status === 'completed';
              const isActive = step.status === 'active';
              const isPending = step.status === 'pending';

              return (
                <div
                  key={step.id || `track-step-${idx}`}
                  className={`p-3 rounded-2xl flex items-start gap-3 transition-all ${
                    isCompleted
                      ? 'neu-flat bg-[#E3E8EF] border border-emerald-400/40'
                      : isActive
                      ? 'neu-inset-deep bg-[#E3E8EF] border border-[#5F6ED0]/70 ring-1 ring-[#5F6ED0]/30'
                      : 'neu-flat bg-[#E3E8EF]/60 opacity-65 border border-white/50'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 transition-all ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isActive
                        ? 'neu-inset-deep text-[#5F6ED0] bg-[#E3E8EF] border border-[#5F6ED0]'
                        : 'neu-button text-[#5C6B80]'
                    }`}
                  >
                    {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-2 text-xs">
                      <span className={`font-extrabold leading-snug flex-1 min-w-0 ${isActive ? 'text-[#5F6ED0]' : 'text-[#2D3A4E]'}`}>
                        {step.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 ${
                          isCompleted
                            ? 'text-emerald-800 bg-emerald-100/80 border border-emerald-200'
                            : isActive
                            ? 'neu-inset-deep text-[#5F6ED0] bg-[#E3E8EF] border border-[#5F6ED0]/50'
                            : 'text-[#5C6B80] bg-[#DDE3EC] border border-[#BAC5D5]/50'
                        }`}
                      >
                        {step.time}
                      </span>
                    </div>
                    {step.desc && (
                      <p className="text-[11px] text-[#5C6B80] leading-snug">{step.desc}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        </div>

        {/* Modal Bottom Actions - Sticky Footer */}
        <div className="p-3.5 sm:px-6 border-t border-[#BAC5D5]/50 flex items-center justify-between gap-2.5 shrink-0 bg-[#E3E8EF]">
          <button
            type="button"
            disabled={isRefreshingGps}
            onClick={() => {
              setIsRefreshingGps(true);
              setTimeout(() => {
                setIsRefreshingGps(false);
                setEstimatedMinutes(Math.max(12, estimatedMinutes - 2));
                onShowToast('Геопозиция курьера обновлена со спутника ГЛОНАСС/GPS', 'success');
              }, 600);
            }}
            className="neu-button py-2.5 px-4 rounded-xl text-xs font-extrabold text-[#5F6ED0] flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 transition-transform whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingGps ? 'animate-spin' : ''}`} />
            <span>{isRefreshingGps ? 'Синхронизация...' : 'Обновить геопозицию'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="neu-button-accent py-2.5 px-6 rounded-xl text-xs font-black text-white cursor-pointer hover:scale-105 active:scale-95 transition-transform whitespace-nowrap"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
  );
};
