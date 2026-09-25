import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  Check,
  Truck,
  Sparkles,
  MapPin,
  Calendar,
} from 'lucide-react';
import { Order, DeliveryStage } from '../../types';
import { getDefaultDeliveryStages, getSynchronizedDeliveryStages, formatDeliveryTimestamp, isTransportCompanyDelivery } from '../../utils/deliveryStages';

interface AdminDeliveryStagesModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onSave: (orderId: string, updatedStages: DeliveryStage[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminDeliveryStagesModal: React.FC<AdminDeliveryStagesModalProps> = ({
  isOpen,
  order,
  onClose,
  onSave,
  onShowToast,
}) => {
  const [stages, setStages] = useState<DeliveryStage[]>(() => {
    if (!order) return [];
    return getSynchronizedDeliveryStages(order);
  });

  // Re-sync stages when order changes
  React.useEffect(() => {
    if (order) {
      setStages(getSynchronizedDeliveryStages(order));
    }
  }, [order?.id, order?.status, order?.deliveryStages]);

  const [isAddingCustomStage, setIsAddingCustomStage] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStatus, setNewStatus] = useState<DeliveryStage['status']>('completed');

  const handleStatusChange = (index: number, nextStatus: DeliveryStage['status']) => {
    if (order?.status === 'accepted' && index > 0 && nextStatus === 'completed') {
      onShowToast('Заказ находится в статусе «Принят». Для завершения этого этапа обновите статус заказа.', 'info');
      return;
    }

    setStages((prev) =>
      prev.map((s, idx) => {
        if (idx !== index) return s;
        let time = s.time;
        if (nextStatus === 'completed' && (!time || time.includes('Ожидает') || time === 'В процессе')) {
          time = formatDeliveryTimestamp();
        } else if (nextStatus === 'active') {
          time = 'В процессе';
        } else if (nextStatus === 'pending') {
          time = 'Ожидает';
        }
        return {
          ...s,
          status: nextStatus,
          time,
        };
      })
    );
  };

  const handleUpdateField = (
    index: number,
    field: 'title' | 'desc' | 'time',
    value: string
  ) => {
    setStages((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, [field]: value } : s))
    );
  };

  const handleSetCurrentTime = (index: number) => {
    handleUpdateField(index, 'time', formatDeliveryTimestamp());
    onShowToast('Время этапа обновлено на текущее', 'info');
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setStages((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === stages.length - 1) return;
    setStages((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleDeleteStage = (index: number) => {
    if (stages.length <= 1) {
      onShowToast('Заказ должен содержать как минимум один этап доставки', 'error');
      return;
    }
    setStages((prev) => prev.filter((_, idx) => idx !== index));
    onShowToast('Этап удален', 'info');
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const titleTrimmed = newTitle.trim();
    if (!titleTrimmed) {
      onShowToast('Введите название этапа', 'error');
      return;
    }

    const newStage: DeliveryStage = {
      id: `stage-custom-${Date.now()}`,
      title: titleTrimmed,
      desc: newDesc.trim() || 'Служебный этап логистики',
      status: newStatus,
      time: newStatus === 'completed' ? formatDeliveryTimestamp() : newStatus === 'active' ? 'В процессе' : 'Ожидает',
    };

    setStages((prev) => [...prev, newStage]);
    setNewTitle('');
    setNewDesc('');
    setIsAddingCustomStage(false);
    onShowToast(`Этап "${titleTrimmed}" успешно добавлен`, 'success');
  };

  const handleResetToDefault = () => {
    if (!order) return;
    const defaults = getSynchronizedDeliveryStages(order);
    setStages(defaults);
    onShowToast('Этапы сброшены к стандартным значениям', 'info');
  };

  const handleMarkAllCompleted = () => {
    if (order && order.status !== 'delivered') {
      onShowToast('Для завершения всех этапов переведите основной статус заказа в «Вручен»', 'info');
      return;
    }
    const now = formatDeliveryTimestamp();
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        status: 'completed',
        time: s.status === 'completed' && s.time && !s.time.includes('Ожидает') ? s.time : now,
      }))
    );
    onShowToast('Все этапы отмечены как выполненные', 'success');
  };

  const handleSave = () => {
    if (!order) return;
    if (stages.length === 0) {
      onShowToast('Список этапов не может быть пустым', 'error');
      return;
    }
    onSave(order.id, stages);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <motion.div
          key="admin-delivery-stages-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/50 backdrop-blur-xs"
        >
          <div
            onClick={onClose}
            className="fixed inset-0 cursor-pointer"
          />

          <motion.div
            key="admin-delivery-stages-modal"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal rounded-3xl p-4 sm:p-6 max-w-2xl w-full my-auto space-y-4 max-h-[92vh] flex flex-col border border-white/80 text-[#2D3A4E] min-w-0 overflow-hidden relative z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3 shrink-0 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-accent shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-extrabold text-[#2D3A4E] truncate">
                      Управление этапами доставки
                    </h3>
                    <span className="text-[11px] font-black text-accent neu-inset px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      Заказ № {order.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#4E5C70] truncate mt-0.5">
                    Синхронизация отображения стадий в реальном времени с окном отслеживания клиента
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Order Info Pill & Presets Bar */}
            <div className="space-y-2 shrink-0">
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] flex items-center justify-between gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate text-[11px] text-[#2D3A4E]">
                    <strong>Адрес:</strong> {order.deliveryAddress || 'Не указан'}
                  </span>
                </div>
                {isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany) && order.trackingNumber && (
                  <span className="font-mono font-bold text-[11px] text-accent neu-flat px-2 py-0.5 rounded-lg shrink-0">
                    Трек (ТК): {order.trackingNumber}
                  </span>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <span className="text-[11px] font-bold text-[#4E5C70]">
                  Контрольных этапов: <strong className="text-[#2D3A4E]">{stages.length}</strong>
                </span>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleMarkAllCompleted}
                    className="neu-button px-2.5 py-1 rounded-xl text-[11px] font-bold text-success hover:text-success flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-3 h-3 text-success" />
                    <span>Все выполнены</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="neu-button px-2.5 py-1 rounded-xl text-[11px] font-bold text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                    title="Сбросить к стандартным 5 этапам"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Сбросить</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomStage(!isAddingCustomStage)}
                    className="neu-button px-2.5 py-1 rounded-xl text-[11px] font-black text-accent flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Добавить этап</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Stage Creator Form */}
            {isAddingCustomStage && (
              <form
                onSubmit={handleAddCustom}
                className="neu-inset rounded-2xl p-3.5 bg-accent/3 border border-accent/16 space-y-2.5 shrink-0 animate-in fade-in"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-accent-strong flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    Новый этап выполнения заказа
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomStage(false)}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Закрыть"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Название этапа
                    </label>
                    <input
                      type="text"
                      placeholder="Например: Передано в сортировочный центр"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl neu-flat bg-[#E3E8EF] text-xs font-bold text-[#2D3A4E]"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Статус этапа
                    </label>
                    <div className="flex gap-1.5">
                      {[
                        { id: 'completed', label: 'Выполнен', color: 'text-success bg-success-soft' },
                        { id: 'active', label: 'В процессе', color: 'text-accent bg-accent/5' },
                        { id: 'pending', label: 'Ожидает', color: 'text-slate-600 bg-slate-100' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setNewStatus(st.id as any)}
                          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                            newStatus === st.id
                              ? 'neu-pill-active'
                              : 'neu-button text-[#4E5C70]'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Описание этапа (необязательно)
                  </label>
                  <input
                    type="text"
                    placeholder="Например: Посылка прибыла на региональный склад СДЭК"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl neu-flat bg-[#E3E8EF] text-xs text-[#2D3A4E]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomStage(false)}
                    className="px-3 py-1 neu-button rounded-xl text-xs font-bold text-[#4E5C70]"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1 neu-button rounded-xl text-xs font-black text-accent cursor-pointer"
                  >
                    Добавить в список
                  </button>
                </div>
              </form>
            )}

            {/* Stages List (Scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin min-h-[220px]">
              {stages.map((stage, idx) => {
                const isCompleted = stage.status === 'completed';
                const isActive = stage.status === 'active';
                const isPending = stage.status === 'pending';

                return (
                  <div
                    key={stage.id || `stage-${idx}`}
                    className={`p-3 sm:p-3.5 rounded-2xl space-y-2.5 transition-all ${
                      isCompleted
                        ? 'neu-inset bg-[#E3E8EF] border border-success/40'
                        : isActive
                        ? 'neu-inset-deep neu-inset-deep-animated bg-[#E3E8EF] border border-accent/60 ring-1 ring-accent/20'
                        : 'neu-inset bg-[#E3E8EF]/60 opacity-80 border border-white/50'
                    }`}
                  >
                    {/* Top Row: Index Badge, Status Select Buttons, Reorder & Delete */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                            isCompleted
                              ? 'bg-success text-white'
                              : isActive
                              ? 'neu-inset-deep neu-inset-deep-animated text-accent bg-[#E3E8EF] border border-accent'
                              : 'neu-button text-[#4E5C70]'
                          }`}
                        >
                          {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                        </div>
                        <span className="text-xs font-black text-[#2D3A4E]">
                          Этап #{idx + 1}
                        </span>
                      </div>

                      {/* Status Toggle Radio Pills */}
                      <div className="flex items-center gap-1 bg-[#DDE3EC] p-0.5 rounded-xl neu-inset">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(idx, 'completed')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                            isCompleted
                              ? 'bg-success text-white shadow-xs'
                              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>Выполнен</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(idx, 'active')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                            isActive
                              ? 'neu-inset-deep neu-inset-deep-animated text-accent bg-[#E3E8EF] border border-accent/40'
                              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                          <span>В процессе</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(idx, 'pending')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                            isPending
                              ? 'bg-slate-500 text-white shadow-xs'
                              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                          }`}
                        >
                          <span>Ожидает</span>
                        </button>
                      </div>

                      {/* Controls: Up/Down/Delete */}
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveUp(idx)}
                          className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Переместить выше"
                          aria-label="Переместить выше"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === stages.length - 1}
                          onClick={() => handleMoveDown(idx)}
                          className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Переместить ниже"
                          aria-label="Переместить ниже"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStage(idx)}
                          className="w-7 h-7 rounded-lg neu-button-danger flex items-center justify-center"
                          title="Удалить этап"
                          aria-label="Удалить этап"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inputs Grid: Title, Description, Timestamp */}
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-7">
                          <label className="text-[11px] font-bold text-[#4E5C70] block mb-0.5">
                            Название этапа
                          </label>
                          <input
                            type="text"
                            value={stage.title}
                            onChange={(e) => handleUpdateField(idx, 'title', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl neu-flat bg-[#E3E8EF] text-xs font-bold text-[#2D3A4E]"
                            placeholder="Название этапа"
                          />
                        </div>

                        <div className="sm:col-span-5">
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="text-[11px] font-bold text-[#4E5C70]">
                              Отметка времени
                            </label>
                            <button
                              type="button"
                              onClick={() => handleSetCurrentTime(idx)}
                              className="text-[11px] font-extrabold text-accent hover:underline cursor-pointer"
                            >
                              Сейчас
                            </button>
                          </div>
                          <input
                            type="text"
                            value={stage.time}
                            onChange={(e) => handleUpdateField(idx, 'time', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl neu-flat bg-[#E3E8EF] text-xs font-medium text-[#2D3A4E]"
                            placeholder="Например: 21 сент., 17:30"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-[#4E5C70] block mb-0.5">
                          Детальное описание (отображается клиенту)
                        </label>
                        <input
                          type="text"
                          value={stage.desc}
                          onChange={(e) => handleUpdateField(idx, 'desc', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl neu-flat bg-[#E3E8EF] text-[11px] text-[#4E5C70]"
                          placeholder="Пояснение для покупателя"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-2 border-t border-[#BAC5D5]/50 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="neu-button py-2.5 px-4 rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="neu-button-accent py-2.5 px-6 rounded-xl text-xs font-black text-white flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Сохранить этапы</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
