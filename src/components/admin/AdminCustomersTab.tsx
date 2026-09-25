import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  Download,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Sparkles,
  ChevronRight,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
  Calendar,
  MessageSquare,
  Edit3,
  Save,
  ShieldCheck,
  UserCheck,
  CreditCard,
  Ruler,
  ExternalLink,
  Copy,
  Check,
  DollarSign,
  Layers,
  ArrowUpDown,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { UserProfile, Order, CustomerRecord, BodyMeasurements } from '../../types';
import { updateCustomerNotesInFirestore, deleteUserFromFirestore, purgeFakeDataFromFirestore } from '../../utils/firebaseSync';
import { copyToClipboard } from '../../utils/clipboard';
import { isTransportCompanyDelivery } from '../../utils/deliveryStages';
import { NeumorphicSelect, NeumorphicSelectOption } from '../NeumorphicSelect';
import { ORDER_STATUS_LABELS } from '../../utils/deliveryStages';
import { formatAddress } from '../../utils/addressFormat';
import { currentStoreName } from '../../utils/storeContacts';

interface AdminCustomersTabProps {
  users: UserProfile[];
  orders: Order[];
  onOpenSupportChat?: (orderId?: string, customerName?: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const CUSTOMER_CATEGORY_OPTIONS: NeumorphicSelectOption[] = [
  {
    value: 'all',
    label: 'Все клиенты',
    icon: <Users className="w-3.5 h-3.5 text-[#4B59BB]" />,
  },
  {
    value: 'with_orders',
    label: 'С покупками',
    icon: <ShoppingBag className="w-3.5 h-3.5 text-warning" />,
  },
  {
    value: 'repeat',
    label: 'Постоянные (2+)',
    icon: <UserCheck className="w-3.5 h-3.5 text-success" />,
  },
  {
    value: 'registered',
    label: 'Аккаунт Google',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-[#4B59BB]" />,
  },
  {
    value: 'guest',
    label: 'Гостевые профили',
    icon: <Filter className="w-3.5 h-3.5 text-[#4E5C70]" />,
  },
];

const CUSTOMER_SORT_OPTIONS: NeumorphicSelectOption[] = [
  {
    value: 'ltv_desc',
    label: 'LTV (по убыванию)',
    icon: <DollarSign className="w-3.5 h-3.5 text-[#4B59BB]" />,
  },
  {
    value: 'orders_desc',
    label: 'По числу заказов',
    icon: <ShoppingBag className="w-3.5 h-3.5 text-success" />,
  },
  {
    value: 'name_asc',
    label: 'По имени (А–Я)',
    icon: <ArrowUpDown className="w-3.5 h-3.5 text-[#4E5C70]" />,
  },
];

export const AdminCustomersTab: React.FC<AdminCustomersTabProps> = ({
  users = [],
  orders = [],
  onOpenSupportChat,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with_orders' | 'repeat' | 'registered' | 'guest'>('all');
  const [sortBy, setSortBy] = useState<'ltv_desc' | 'orders_desc' | 'recent_desc' | 'name_asc'>('ltv_desc');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Manager Notes editing inside detail modal
  const [editingNotes, setEditingNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Database Purge & Deletion state
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerRecord | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  // Trigger full purge of mock & fake records
  const handlePurgeFakeData = async () => {
    setIsPurging(true);
    try {
      const result = await purgeFakeDataFromFirestore('gunh83975@gmail.com');
      setShowPurgeModal(false);
      onShowToast(
        `База данных успешно очищена! Удалено фиктивных пользователей: ${result.deletedUsers}, фиктивных заказов: ${result.deletedOrders}`,
        'success'
      );
    } catch (err) {
      console.error('Purge error:', err);
      onShowToast('Ошибка при очистке базы данных', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  // Delete individual customer from Firestore
  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    try {
      const docId = customerToDelete.uid || customerToDelete.id;
      await deleteUserFromFirestore(docId);
      onShowToast(`Клиент «${customerToDelete.name}» удален из базы данных`, 'info');
      if (selectedCustomer?.id === customerToDelete.id) {
        setSelectedCustomer(null);
      }
      setCustomerToDelete(null);
    } catch (err) {
      console.error('Delete customer error:', err);
      onShowToast('Не удалось удалить клиента из базы', 'error');
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // 1. Build unified CRM Customer Records by merging Firestore Users and Orders
  const customerRecords: CustomerRecord[] = useMemo(() => {
    const map = new Map<string, CustomerRecord>();

    // A. Incorporate Registered Users from Firestore
    users.forEach((u) => {
      const key = (u.email || u.uid || u.phone || u.name).toLowerCase().trim();
      if (!key) return;

      const userOrders = orders.filter((o) => {
        const oEmail = (o.customerEmail || '').toLowerCase().trim();
        const oPhone = (o.customerPhone || '').replace(/\D/g, '');
        const uPhone = (u.phone || '').replace(/\D/g, '');
        return (oEmail && oEmail === (u.email || '').toLowerCase().trim()) ||
               (uPhone && oPhone && uPhone.length >= 7 && oPhone.includes(uPhone.slice(-7)));
      });

      const totalSpent = userOrders.reduce((sum, o) => (o.status !== 'cancelled' ? sum + (o.totalPrice || 0) : sum), 0);
      const completedOrders = userOrders.filter((o) => o.status === 'delivered').length;
      const avgCheck = userOrders.length > 0 ? Math.round(totalSpent / userOrders.length) : 0;

      map.set(key, {
        id: u.uid || `user-${key}`,
        uid: u.uid,
        name: u.name || 'Пользователь',
        email: u.email || '',
        phone: u.phone || '',
        avatar: u.avatar,
        isRegisteredUser: true,
        registeredAt: u.createdAt || 'Январь 2026',
        lastActiveAt: u.lastActive || 'Недавно',
        bonusPoints: u.bonusPoints ?? Math.round(totalSpent * 0.05),
        totalSpent,
        ordersCount: userOrders.length,
        completedOrdersCount: completedOrders,
        averageOrderValue: avgCheck,
        orders: userOrders,
        savedAddresses: u.savedAddresses || [],
        primaryAddress: u.address
          ? formatAddress(u.address)
          : u.savedAddresses?.[0]
          ? formatAddress(u.savedAddresses[0])
          : undefined,
        bodyMeasurements: u.bodyMeasurements,
        managerNotes: u.managerNotes,
        tags: u.tags || (u.uid?.includes('admin') ? ['Администратор'] : ['Покупатель']),
      });
    });

    // B. Group Orders for Customers who may have placed guest orders without an explicit /users profile
    orders.forEach((ord) => {
      const email = (ord.customerEmail || '').toLowerCase().trim();
      const phone = (ord.customerPhone || '').replace(/\D/g, '');
      const key = email || (phone ? `phone-${phone}` : `order-cust-${ord.id}`);

      if (map.has(key)) {
        // Already mapped via registered user
        return;
      }

      // Check if any existing customer record matches phone
      let existingMatchKey: string | null = null;
      for (const [k, c] of map.entries()) {
        const cPhone = c.phone.replace(/\D/g, '');
        if (phone && cPhone && (phone.includes(cPhone.slice(-7)) || cPhone.includes(phone.slice(-7)))) {
          existingMatchKey = k;
          break;
        }
      }

      if (existingMatchKey) {
        const rec = map.get(existingMatchKey)!;
        if (!rec.orders.some((o) => o.id === ord.id)) {
          rec.orders.push(ord);
          if (ord.status !== 'cancelled') {
            rec.totalSpent += ord.totalPrice || 0;
          }
          rec.ordersCount = rec.orders.length;
          rec.averageOrderValue = Math.round(rec.totalSpent / rec.ordersCount);
        }
        return;
      }

      // Create new customer record from order data
      const matchedOrders = orders.filter((o) => {
        const oEmail = (o.customerEmail || '').toLowerCase().trim();
        const oPhone = (o.customerPhone || '').replace(/\D/g, '');
        return (email && oEmail === email) || (phone && oPhone && oPhone === phone);
      });

      const totalSpent = matchedOrders.reduce((sum, o) => (o.status !== 'cancelled' ? sum + (o.totalPrice || 0) : sum), 0);
      const completedOrders = matchedOrders.filter((o) => o.status === 'delivered').length;
      const avgCheck = matchedOrders.length > 0 ? Math.round(totalSpent / matchedOrders.length) : 0;

      map.set(key, {
        id: `guest-${key}`,
        name: ord.customerName || 'Покупатель',
        email: ord.customerEmail || '',
        phone: ord.customerPhone || '',
        isRegisteredUser: false,
        registeredAt: ord.date || 'Недавно',
        lastActiveAt: ord.date || 'Недавно',
        bonusPoints: Math.round(totalSpent * 0.03),
        totalSpent,
        ordersCount: matchedOrders.length,
        completedOrdersCount: completedOrders,
        averageOrderValue: avgCheck,
        orders: matchedOrders,
        savedAddresses: ord.deliveryAddress
          ? [{ id: `addr-${ord.id}`, title: 'Адрес из заказа', city: ord.deliveryAddress.split(',')[0] || 'Москва', street: ord.deliveryAddress, isDefault: true }]
          : [],
        primaryAddress: ord.deliveryAddress,
        tags: totalSpent > 30000 ? ['Гость', 'Крупный чек'] : ['Гость'],
      });
    });

    return Array.from(map.values());
  }, [users, orders]);

  // 2. Filter & Search
  const filteredCustomers = useMemo(() => {
    return customerRecords.filter((c) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesEmail = c.email.toLowerCase().includes(q);
        const matchesPhone = c.phone.includes(q);
        const matchesAddress = c.primaryAddress?.toLowerCase().includes(q);
        const matchesOrder = c.orders.some((o) => o.id.toLowerCase().includes(q));
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesAddress && !matchesOrder) {
          return false;
        }
      }

      // Filter type
      if (filterType === 'with_orders' && c.ordersCount === 0) {
        return false;
      }
      if (filterType === 'repeat' && c.ordersCount < 2) {
        return false;
      }
      if (filterType === 'registered' && !c.isRegisteredUser) {
        return false;
      }
      if (filterType === 'guest' && c.isRegisteredUser) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'ltv_desc') return b.totalSpent - a.totalSpent;
      if (sortBy === 'orders_desc') return b.ordersCount - a.ordersCount;
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      return b.ordersCount - a.ordersCount;
    });
  }, [customerRecords, searchQuery, filterType, sortBy]);

  // 3. Overall CRM KPIs
  const stats = useMemo(() => {
    const totalClients = customerRecords.length;
    const registeredCount = customerRecords.filter((c) => c.isRegisteredUser).length;
    const totalLTV = customerRecords.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalOrders = customerRecords.reduce((sum, c) => sum + c.ordersCount, 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalLTV / totalOrders) : 0;
    const repeatClients = customerRecords.filter((c) => c.ordersCount >= 2).length;

    return {
      totalClients,
      registeredCount,
      totalLTV,
      avgOrderValue,
      repeatClients,
    };
  }, [customerRecords]);

  // Copy to clipboard helper
  const handleCopy = (text: string, fieldKey: string) => {
    if (!text) return;
    copyToClipboard(text);
    setCopiedField(fieldKey);
    onShowToast(`Скопировано: ${text}`, 'info');
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Open Detail modal
  const handleOpenDetail = (customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setEditingNotes(customer.managerNotes || '');
    setNewTagInput('');
  };

  // Save CRM notes
  const handleSaveNotes = async () => {
    if (!selectedCustomer) return;
    setIsSavingNotes(true);
    try {
      const docId = selectedCustomer.uid || selectedCustomer.id;
      await updateCustomerNotesInFirestore(docId, editingNotes, selectedCustomer.tags);
      setSelectedCustomer((prev) => (prev ? { ...prev, managerNotes: editingNotes } : null));
      onShowToast('Заметка менеджера сохранена', 'success');
    } catch (err) {
      console.error('Error saving customer notes:', err);
      onShowToast('Не удалось сохранить заметку', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Add custom tag
  const handleAddTag = async () => {
    if (!selectedCustomer || !newTagInput.trim()) return;
    const updatedTags = Array.from(new Set([...selectedCustomer.tags, newTagInput.trim()]));
    try {
      const docId = selectedCustomer.uid || selectedCustomer.id;
      await updateCustomerNotesInFirestore(docId, selectedCustomer.managerNotes || '', updatedTags);
      setSelectedCustomer((prev) => (prev ? { ...prev, tags: updatedTags } : null));
      setNewTagInput('');
      onShowToast(`Тег «${newTagInput.trim()}» добавлен`, 'info');
    } catch {
      onShowToast('Ошибка при добавлении тега', 'error');
    }
  };

  // Remove custom tag
  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedCustomer) return;
    const updatedTags = selectedCustomer.tags.filter((t) => t !== tagToRemove);
    try {
      const docId = selectedCustomer.uid || selectedCustomer.id;
      await updateCustomerNotesInFirestore(docId, selectedCustomer.managerNotes || '', updatedTags);
      setSelectedCustomer((prev) => (prev ? { ...prev, tags: updatedTags } : null));
      onShowToast(`Тег «${tagToRemove}» удален`, 'info');
    } catch {
      onShowToast('Ошибка при удалении тега', 'error');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) {
      onShowToast('Список клиентов пуст для экспорта', 'error');
      return;
    }
    const headers = ['Имя', 'Email', 'Телефон', 'Тип', 'LTV (₽)', 'Заказов', 'Средний чек (₽)', 'Бонусы', 'Адрес'];
    const rows = filteredCustomers.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.phone}"`,
      c.isRegisteredUser ? '"Аккаунт Google"' : '"Гость"',
      c.totalSpent,
      c.ordersCount,
      c.averageOrderValue,
      c.bonusPoints,
      `"${(c.primaryAddress || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentStoreName().replace(/\s+/g, '_')}_Клиенты_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast(`Экспортировано ${filteredCustomers.length} клиентов в CSV`, 'success');
  };

  const customerDropdownOptions: NeumorphicSelectOption[] = [
    {
      value: '',
      label: 'Все клиенты (без фильтра)',
      icon: <Users className="w-3.5 h-3.5 text-[#4B59BB]" />,
    },
    ...filteredCustomers.map((c) => ({
      value: c.id,
      label: c.name,
      sublabel: `${c.phone || c.email || 'Без контактов'} • Заказов: ${c.ordersCount} (${c.totalSpent.toLocaleString('ru-RU')} ₽)`,
      badge: c.isRegisteredUser ? 'Auth' : 'Гость',
      icon: (
        <div className="w-5 h-5 rounded-full neu-inset flex items-center justify-center text-[11px] font-black text-[#4B59BB] shrink-0">
          {c.name.charAt(0)}
        </div>
      ),
    })),
  ];

  const getOrderStatusBadge = (status: Order['status'] | string) => {
    switch (status) {
      case 'delivered':
        return { label: ORDER_STATUS_LABELS.delivered, bg: 'bg-success-soft text-success border-success/25' };
      case 'in_transit':
        return { label: ORDER_STATUS_LABELS.in_transit, bg: 'bg-blue-100 text-blue-700 border-blue-200' };
      case 'ready':
        return { label: ORDER_STATUS_LABELS.ready, bg: 'bg-purple-100 text-purple-700 border-purple-200' };
      case 'assembling':
        return { label: ORDER_STATUS_LABELS.assembling, bg: 'bg-warning-soft text-warning border-warning/25' };
      case 'accepted':
        return { label: ORDER_STATUS_LABELS.accepted, bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
      default:
        return { label: String(status), bg: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  return (
    <div className="space-y-4 text-[#2D3A4E] pb-8 animate-in fade-in duration-200">
      {/* 1. Header & Summary Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-[#2D3A4E]">Клиенты и CRM</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#5F6ED0]/15 text-[#4B59BB]">
              {customerRecords.length} чел.
            </span>
          </div>
          <p className="text-xs text-[#4E5C70] mt-0.5">
            Покупатели с аккаунтом Google и гости, оформившие заказ
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setShowPurgeModal(true)}
            className="neu-button-danger px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
            title="Очистить базу данных от нереальных клиентов и фиктивных заказов"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить базу от демо-данных</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="neu-inset px-3.5 py-2 rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#4B59BB] flex items-center justify-center gap-2 active:scale-95 transition-all bg-[#E3E8EF] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#4B59BB]" />
            <span>Экспорт в CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Neumorphic KPI Cards (Inset) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="neu-inset rounded-2xl p-3.5 flex items-center gap-3 bg-[#E3E8EF]">
          <div className="w-11 h-11 rounded-xl neu-flat-sm flex items-center justify-center text-[#4B59BB] shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-[#4E5C70] block truncate">Всего клиентов</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-[#2D3A4E]">{stats.totalClients}</span>
              <span className="text-[11px] text-[#4B59BB] font-bold">({stats.registeredCount} Auth)</span>
            </div>
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3.5 flex items-center gap-3 bg-[#E3E8EF]">
          <div className="w-11 h-11 rounded-xl neu-flat-sm flex items-center justify-center text-success shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-[#4E5C70] block truncate">Суммарный LTV</span>
            <span className="text-lg font-black text-[#2D3A4E] block truncate">
              {stats.totalLTV.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3.5 flex items-center gap-3 bg-[#E3E8EF]">
          <div className="w-11 h-11 rounded-xl neu-flat-sm flex items-center justify-center text-warning shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-[#4E5C70] block truncate">Средний чек (AOV)</span>
            <span className="text-lg font-black text-[#2D3A4E] block truncate">
              {stats.avgOrderValue.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        <div className="neu-inset rounded-2xl p-3.5 flex items-center gap-3 bg-[#E3E8EF]">
          <div className="w-11 h-11 rounded-xl neu-flat-sm flex items-center justify-center text-[#4B59BB] shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-[#4E5C70] block truncate">Постоянные клиенты</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-[#2D3A4E]">{stats.repeatClients}</span>
              <span className="text-[11px] text-success font-bold">2+ заказа</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Filters Bar (Neumorphic Inset) */}
      <div className="neu-inset rounded-2xl p-3 space-y-2.5 relative z-20 bg-[#E3E8EF]">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#4E5C70] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, email, телефону, городу или № заказа..."
            className="w-full pl-9.5 pr-8 py-2.5 text-xs rounded-xl neu-inset text-[#2D3A4E] placeholder:text-[#56647A] font-medium bg-[#E3E8EF]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4E5C70] hover:text-[#2D3A4E]"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdowns Row: Customer Quick Select, Category & Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="w-full">
            <NeumorphicSelect
              value={selectedCustomer ? selectedCustomer.id : ''}
              onChange={(val) => {
                if (!val) {
                  setSelectedCustomer(null);
                } else {
                  const target = filteredCustomers.find((c) => c.id === val);
                  if (target) setSelectedCustomer(target);
                }
              }}
              variant="inset"
              prefix="Клиент:"
              placeholder="Выбрать клиента..."
              triggerClassName="rounded-xl py-2 px-3 text-xs bg-[#E3E8EF]"
              options={customerDropdownOptions}
            />
          </div>

          <div className="w-full">
            <NeumorphicSelect
              value={filterType}
              onChange={(val) => setFilterType(val as any)}
              variant="inset"
              prefix="Категория:"
              triggerClassName="rounded-xl py-2 px-3 text-xs bg-[#E3E8EF]"
              options={CUSTOMER_CATEGORY_OPTIONS}
            />
          </div>

          <div className="w-full">
            <NeumorphicSelect
              value={sortBy}
              onChange={(val) => setSortBy(val as any)}
              variant="inset"
              prefix="Сортировка:"
              triggerClassName="rounded-xl py-2 px-3 text-xs bg-[#E3E8EF]"
              options={CUSTOMER_SORT_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* 4. Customer Cards Grid */}
      {filteredCustomers.length === 0 ? (
        <div className="neu-inset rounded-3xl p-8 text-center space-y-3 bg-[#E3E8EF]">
          <div className="w-14 h-14 rounded-2xl neu-inset flex items-center justify-center mx-auto text-[#4E5C70]">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#2D3A4E]">Клиенты не найдены</h3>
          <p className="text-xs text-[#4E5C70] max-w-sm mx-auto">
            Попробуйте изменить параметры поиска или сбросить фильтры по категории.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterType('all');
            }}
            className="neu-button px-4 py-2 rounded-xl text-xs font-bold text-[#4B59BB]"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredCustomers.map((customer, cIdx) => {
            return (
              <div
                key={`admin-cust-${customer.id}-${cIdx}`}
                className="neu-inset rounded-2xl p-4 flex flex-col justify-between space-y-3.5 bg-[#E3E8EF] transition-all"
              >
                {/* Top: Customer Identity */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {customer.avatar ? (
                      <img
                        src={customer.avatar}
                        alt={customer.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-2xl object-cover neu-flat-sm shrink-0 border border-white/80"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl neu-flat-sm flex items-center justify-center font-black text-sm text-[#4B59BB] shrink-0">
                        {customer.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-black text-[#2D3A4E] truncate">{customer.name}</h4>
                        {customer.isRegisteredUser ? (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200"
                            title="Вошел через аккаунт Google"
                          >
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            <span>Google</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600"
                            title="Заказ оформлен без регистрации учетной записи"
                          >
                            <span>Гость</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] mt-0.5 truncate">
                        {customer.email && (
                          <span className="truncate" title={customer.email}>
                            {customer.email}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="shrink-0">{customer.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {customer.ordersCount > 1 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-success-soft text-success border border-success/25 shrink-0">
                      Постоянный ({customer.ordersCount})
                    </span>
                  ) : customer.ordersCount === 1 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                      1 заказ
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-gray-100 text-gray-500 shrink-0">
                      Без заказов
                    </span>
                  )}
                </div>

                {/* Primary Address & City */}
                {customer.primaryAddress && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#4E5C70] neu-inset px-2.5 py-1.5 rounded-xl truncate">
                    <MapPin className="w-3.5 h-3.5 text-[#4B59BB] shrink-0" />
                    <span className="truncate">{customer.primaryAddress}</span>
                  </div>
                )}

                {/* KPI Matrix Strip */}
                <div className="grid grid-cols-4 gap-1.5 py-1 text-center border-y border-[#BAC5D5]/30">
                  <div className="px-1">
                    <span className="text-[11px] text-[#4E5C70] block">LTV</span>
                    <span className="text-xs font-black text-[#2D3A4E]">
                      {customer.totalSpent > 0 ? `${(customer.totalSpent / 1000).toFixed(1)}k ₽` : '0 ₽'}
                    </span>
                  </div>
                  <div className="px-1 border-l border-[#BAC5D5]/30">
                    <span className="text-[11px] text-[#4E5C70] block">Заказов</span>
                    <span className="text-xs font-black text-[#2D3A4E]">{customer.ordersCount}</span>
                  </div>
                  <div className="px-1 border-l border-[#BAC5D5]/30">
                    <span className="text-[11px] text-[#4E5C70] block">Ср. чек</span>
                    <span className="text-xs font-black text-[#2D3A4E]">
                      {customer.averageOrderValue > 0 ? `${Math.round(customer.averageOrderValue / 1000)}k ₽` : '—'}
                    </span>
                  </div>
                  <div className="px-1 border-l border-[#BAC5D5]/30">
                    <span className="text-[11px] text-[#4E5C70] block">Бонусы</span>
                    <span className="text-xs font-black text-[#4B59BB]">{customer.bonusPoints}</span>
                  </div>
                </div>

                {/* Order History Micro-Chips */}
                {customer.orders.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                      История заказов ({customer.orders.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto pr-1">
                      {customer.orders.slice(0, 4).map((ord, oIdx) => {
                        const statusBadge = getOrderStatusBadge(ord.status);
                        return (
                          <div
                            key={`cust-${customer.id}-ord-${ord.id}-${oIdx}`}
                            className="text-[11px] px-2 py-0.5 rounded-lg neu-flat-sm flex items-center gap-1.5 font-medium text-[#2D3A4E]"
                          >
                            <span className="font-bold text-[#4B59BB]">#{ord.id}</span>
                            <span>{ord.totalPrice} ₽</span>
                            <span className={`px-1 py-0.2 rounded text-[11px] font-bold border ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                          </div>
                        );
                      })}
                      {customer.orders.length > 4 && (
                        <span className="text-[11px] text-[#4E5C70] self-center">
                          +{customer.orders.length - 4} еще...
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Tags Preview */}
                {customer.tags && customer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {customer.tags.map((tag, tIdx) => (
                      <span
                        key={`cust-${customer.id}-tag-${tag}-${tIdx}`}
                        className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#BAC5D5]/20 text-[#4E5C70]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(customer)}
                    className="flex-1 py-2 px-3 rounded-xl neu-button text-xs font-black text-[#2D3A4E] hover:text-[#4B59BB] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Подробнее и заказы</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => onOpenSupportChat(customer.orders[0]?.id, customer.name)}
                      className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#4B59BB] shrink-0 cursor-pointer"
                      title="Открыть чат с клиентом"
                      aria-label="Открыть чат с клиентом"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  )}

                  {customer.email !== 'gunh83975@gmail.com' && (
                    <button
                      type="button"
                      onClick={() => setCustomerToDelete(customer)}
                      className="w-9 h-9 rounded-xl neu-button-danger flex items-center justify-center shrink-0 cursor-pointer"
                      title="Удалить запись клиента"
                      aria-label="Удалить запись клиента"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= 5. CUSTOMER DETAIL & ORDER HISTORY MODAL ================= */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 max-w-2xl w-full max-h-[90vh] flex flex-col space-y-4 text-[#2D3A4E] border border-white/80 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/40 pb-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {selectedCustomer.avatar ? (
                  <img
                    src={selectedCustomer.avatar}
                    alt={selectedCustomer.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-2xl object-cover neu-flat-sm border border-white shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl neu-flat-sm flex items-center justify-center font-black text-base text-[#4B59BB] shrink-0">
                    {selectedCustomer.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-[#2D3A4E] truncate">
                      {selectedCustomer.name}
                    </h3>
                    {selectedCustomer.ordersCount > 1 ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-success-soft text-success border border-success/25">
                        Постоянный покупатель
                      </span>
                    ) : selectedCustomer.ordersCount === 1 ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        1 покупка
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
                        Новый профиль
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4E5C70] mt-0.5">
                    {selectedCustomer.isRegisteredUser ? 'Аккаунт Google' : 'Гостевой покупатель'} • В базе с {selectedCustomer.registeredAt}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedCustomer.email !== 'gunh83975@gmail.com' && (
                  <button
                    type="button"
                    onClick={() => setCustomerToDelete(selectedCustomer)}
                    className="w-9 h-9 rounded-xl neu-button-danger flex items-center justify-center"
                    title="Удалить клиента из базы данных"
                    aria-label="Удалить клиента из базы данных"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E]"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              {/* Contact & Identifiers Card */}
              <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                  Контакты и реквизиты
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {selectedCustomer.email && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#E3E8EF]/80 neu-flat-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-[#4B59BB] shrink-0" />
                        <span className="truncate font-medium">{selectedCustomer.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedCustomer.email, 'email')}
                        className="text-[#4E5C70] hover:text-[#2D3A4E] shrink-0"
                        title="Скопировать email"
                        aria-label="Скопировать email"
                      >
                        {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {selectedCustomer.phone && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#E3E8EF]/80 neu-flat-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="w-3.5 h-3.5 text-success shrink-0" />
                        <span className="truncate font-medium">{selectedCustomer.phone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedCustomer.phone, 'phone')}
                        className="text-[#4E5C70] hover:text-[#2D3A4E] shrink-0"
                        title="Скопировать телефон"
                        aria-label="Скопировать телефон"
                      >
                        {copiedField === 'phone' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {selectedCustomer.uid && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#E3E8EF]/80 neu-flat-sm sm:col-span-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="text-[#4E5C70] shrink-0">UID:</span>
                        <code className="text-[11px] truncate font-mono text-[#2D3A4E]">{selectedCustomer.uid}</code>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedCustomer.uid!, 'uid')}
                        className="text-[#4E5C70] hover:text-[#2D3A4E] shrink-0"
                        title="Скопировать UID"
                        aria-label="Скопировать UID"
                      >
                        {copiedField === 'uid' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Addresses Card */}
              {(selectedCustomer.primaryAddress || (selectedCustomer.savedAddresses && selectedCustomer.savedAddresses.length > 0)) && (
                <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#4B59BB]" />
                    <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider">
                      Адрес доставки и реквизиты
                    </span>
                  </div>

                  {selectedCustomer.primaryAddress && (
                    <div className="p-2.5 rounded-xl bg-[#E3E8EF]/80 neu-flat-sm space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#4E5C70]">
                        <span>Адрес для курьера:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedCustomer.primaryAddress!, 'address')}
                          className="hover:text-[#2D3A4E]"
                          title="Скопировать адрес"
                          aria-label="Скопировать адрес"
                        >
                          {copiedField === 'address' ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-[#2D3A4E] leading-relaxed">
                        {selectedCustomer.primaryAddress}
                      </p>
                    </div>
                  )}

                  {selectedCustomer.savedAddresses && selectedCustomer.savedAddresses.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-[#4E5C70] uppercase">
                        Сохраненные адреса ({selectedCustomer.savedAddresses.length}):
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {selectedCustomer.savedAddresses.map((sa) => (
                          <div key={sa.id} className="p-2.5 rounded-xl bg-white/40 neu-flat-sm text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#2D3A4E]">{sa.title}</span>
                              {sa.isDefault && (
                                <span className="text-[11px] font-bold text-success bg-success-soft px-1.5 py-0.5 rounded-md">
                                  Основной
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#4E5C70]">{formatAddress(sa)}</p>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {sa.house && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-white/80">
                                  д. {sa.house}
                                </span>
                              )}
                              {sa.entrance && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-white/80">
                                  подъезд {sa.entrance}
                                </span>
                              )}
                              {sa.floor && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-white/80">
                                  эт. {sa.floor}
                                </span>
                              )}
                              {sa.apartment && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-white/80">
                                  {sa.apartment.toLowerCase().includes('кв') || sa.apartment.toLowerCase().includes('оф')
                                    ? sa.apartment
                                    : `кв. ${sa.apartment}`}
                                </span>
                              )}
                              {sa.intercom && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-[#4B59BB] bg-[#5F6ED0]/15">
                                  домофон: {sa.intercom}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Financial Metrics & Loyalty Card */}
              <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider block">
                  Финансовые показатели и лояльность
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="neu-flat-sm p-2.5 rounded-xl bg-[#E3E8EF]/80">
                    <span className="text-[11px] text-[#4E5C70] block">Общий LTV</span>
                    <span className="text-sm font-black text-success">
                      {selectedCustomer.totalSpent.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                  <div className="neu-flat-sm p-2.5 rounded-xl bg-[#E3E8EF]/80">
                    <span className="text-[11px] text-[#4E5C70] block">Всего заказов</span>
                    <span className="text-sm font-black text-[#2D3A4E]">
                      {selectedCustomer.ordersCount} шт.
                    </span>
                  </div>
                  <div className="neu-flat-sm p-2.5 rounded-xl bg-[#E3E8EF]/80">
                    <span className="text-[11px] text-[#4E5C70] block">Средний чек</span>
                    <span className="text-sm font-black text-[#2D3A4E]">
                      {selectedCustomer.averageOrderValue.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                  <div className="neu-flat-sm p-2.5 rounded-xl bg-[#E3E8EF]/80">
                    <span className="text-[11px] text-[#4E5C70] block">Бонусные баллы</span>
                    <span className="text-sm font-black text-[#4B59BB]">
                      {selectedCustomer.bonusPoints} Б
                    </span>
                  </div>
                </div>
              </div>

              {/* Sizing & Body Measurements Card (if available) */}
              {selectedCustomer.bodyMeasurements && (
                <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-[#4B59BB]" />
                      <span className="text-xs font-black text-[#2D3A4E]">Параметры фигуры (Размеры)</span>
                    </div>
                    {selectedCustomer.bodyMeasurements.preferredSize && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-[#5F6ED0]/15 text-[#4B59BB] neu-flat-sm">
                        Размер: {selectedCustomer.bodyMeasurements.preferredSize}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-xs">
                    <div className="neu-flat-sm p-2 rounded-xl bg-[#E3E8EF]/80">
                      <span className="text-[11px] text-[#4E5C70] block">Рост</span>
                      <span className="font-bold">{selectedCustomer.bodyMeasurements.height || '—'} см</span>
                    </div>
                    <div className="neu-flat-sm p-2 rounded-xl bg-[#E3E8EF]/80">
                      <span className="text-[11px] text-[#4E5C70] block">Вес</span>
                      <span className="font-bold">{selectedCustomer.bodyMeasurements.weight || '—'} кг</span>
                    </div>
                    <div className="neu-flat-sm p-2 rounded-xl bg-[#E3E8EF]/80">
                      <span className="text-[11px] text-[#4E5C70] block">Грудь</span>
                      <span className="font-bold">{selectedCustomer.bodyMeasurements.chest || '—'} см</span>
                    </div>
                    <div className="neu-flat-sm p-2 rounded-xl bg-[#E3E8EF]/80">
                      <span className="text-[11px] text-[#4E5C70] block">Талия</span>
                      <span className="font-bold">{selectedCustomer.bodyMeasurements.waist || '—'} см</span>
                    </div>
                    <div className="neu-flat-sm p-2 rounded-xl bg-[#E3E8EF]/80">
                      <span className="text-[11px] text-[#4E5C70] block">Бедра</span>
                      <span className="font-bold">{selectedCustomer.bodyMeasurements.hips || '—'} см</span>
                    </div>
                  </div>
                </div>
              )}

              {/* CRM Manager Notes & Tags */}
              <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-[#4B59BB]" />
                    <span className="text-xs font-black text-[#2D3A4E]">CRM Заметки и теги менеджера</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes}
                    className="neu-button px-3 py-1.5 rounded-xl text-xs font-black text-[#4B59BB] flex items-center gap-1.5 hover:text-[#3F4BA6]"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingNotes ? 'Сохранение...' : 'Сохранить'}</span>
                  </button>
                </div>

                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  placeholder="Внутренняя заметка о клиенте (предпочтения, особенности доставки, договоренности)..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A] resize-none font-medium bg-[#E3E8EF]"
                />

                {/* Tags management */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCustomer.tags.map((tag, tIdx) => (
                      <span
                        key={`cust-edit-tag-${tag}-${tIdx}`}
                        className="group px-2.5 py-1 rounded-xl text-xs font-bold neu-flat-sm text-[#2D3A4E] bg-[#E3E8EF]/90 flex items-center gap-1.5 border border-white/50"
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[#4E5C70] hover:text-danger hover:bg-danger-soft active:scale-90 transition-all cursor-pointer"
                          title={`Удалить тег #${tag}`}
                          aria-label="Закрыть"
                        >
                          <X className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                      </span>
                    ))}
                    {selectedCustomer.tags.length === 0 && (
                      <span className="text-[11px] text-[#4E5C70] italic">
                        Теги еще не добавлены
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="Новый тег (напр. Стилист, Оптовик)..."
                      className="flex-1 py-1.5 px-3 rounded-lg neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="neu-button px-3 py-1.5 rounded-lg text-xs font-bold text-[#2D3A4E]"
                    >
                      Добавить тег
                    </button>
                  </div>
                </div>
              </div>

              {/* Complete Interactive Orders History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg neu-flat-sm flex items-center justify-center text-[#4B59BB] shrink-0 bg-[#E3E8EF]">
                      <Package className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] truncate">
                      История заказов ({selectedCustomer.orders.length})
                    </h4>
                  </div>
                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSupportChat(selectedCustomer.orders[0]?.id, selectedCustomer.name);
                        setSelectedCustomer(null);
                      }}
                      className="neu-button px-3 py-1.5 rounded-xl text-xs font-bold text-[#4B59BB] hover:text-[#3F4BA6] flex items-center gap-1.5 shrink-0 whitespace-nowrap active:scale-95 transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#4B59BB]" />
                      <span>Открыть диалог</span>
                    </button>
                  )}
                </div>

                {selectedCustomer.orders.length === 0 ? (
                  <div className="neu-inset p-4 rounded-2xl text-center text-xs text-[#4E5C70] bg-[#E3E8EF]">
                    У данного пользователя пока нет зарегистрированных заказов.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedCustomer.orders.map((ord, oIdx) => {
                      const statusBadge = getOrderStatusBadge(ord.status);
                      return (
                        <div key={`cust-detail-ord-${ord.id}-${oIdx}`} className="neu-inset rounded-2xl p-3.5 space-y-2.5 bg-[#E3E8EF]">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-[#2D3A4E]">№ {ord.id}</span>
                              <span className="text-xs text-[#4E5C70]">• {ord.date}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${statusBadge.bg}`}>
                                {statusBadge.label}
                              </span>
                              <span className="text-sm font-black text-[#2D3A4E]">
                                {ord.totalPrice.toLocaleString('ru-RU')} ₽
                              </span>
                            </div>
                          </div>

                          {/* Line Items Preview */}
                          <div className="space-y-1.5 border-t border-[#BAC5D5]/30 pt-2">
                            {ord.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs text-[#4E5C70]">
                                <div className="flex items-center gap-2 min-w-0">
                                  {it.product.images?.[0] && (
                                    <img
                                      src={it.product.images[0]}
                                      alt={it.product.title}
                                      referrerPolicy="no-referrer"
                                      className="w-7 h-7 rounded-lg object-cover neu-flat-sm shrink-0"
                                    />
                                  )}
                                  <span className="text-[#2D3A4E] font-medium truncate">{it.product.title}</span>
                                  <span className="text-[11px] shrink-0">
                                    ({it.selectedColor}, {it.selectedSize})
                                  </span>
                                </div>
                                <span className="font-bold shrink-0">
                                  {it.quantity} × {it.product.price} ₽
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Order Logistics & Details Bar */}
                          <div className="flex items-center justify-between gap-2 text-[11px] text-[#4E5C70] bg-[#BAC5D5]/15 px-2.5 py-1.5 rounded-xl flex-wrap">
                            <div className="flex items-center gap-2">
                              <Truck className="w-3.5 h-3.5 text-[#4B59BB]" />
                              <span>{ord.deliveryMethod || 'Доставка'}</span>
                              {isTransportCompanyDelivery(ord.deliveryMethod, ord.trackingCompany) && ord.trackingNumber && (
                                <span className="font-bold text-[#2D3A4E]">Трек (ТК): {ord.trackingNumber}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5 text-success" />
                              <span>{ord.paymentMethod || 'Оплачен'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#BAC5D5]/40 pt-3 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="neu-inset px-6 py-2.5 rounded-xl text-xs font-black text-[#2D3A4E] hover:text-[#4B59BB] bg-[#E3E8EF] active:scale-95 transition-all"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 6. PURGE DATABASE CONFIRMATION MODAL ================= */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/50 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 text-[#2D3A4E] border border-white/80">
            <div className="flex items-center gap-3 border-b border-[#BAC5D5]/40 pb-3">
              <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-danger shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#2D3A4E]">Очистка базы данных</h3>
                <p className="text-xs text-[#4E5C70]">Удаление тестовых и неактуальных записей</p>
              </div>
            </div>

            <div className="neu-inset rounded-2xl p-3.5 space-y-2 text-xs text-[#2D3A4E] bg-[#E3E8EF]">
              <p className="font-semibold text-danger">Внимание! Будут безвозвратно удалены:</p>
              <ul className="list-disc list-inside space-y-1 text-[#4E5C70]">
                <li>Все фиктивные профили клиентов (Иван Петров, Алексей Морозов и т.д.)</li>
                <li>Все демо-заказы (MS-8420, MS-7912, MS-9824...)</li>
                <li>Неактуальные тестовые записи в базе</li>
              </ul>
              <p className="text-[11px] text-success font-bold pt-1 border-t border-[#BAC5D5]/40">
                ✓ Ваш профиль администратора (gunh83975@gmail.com) и реальный каталог товаров останутся без изменений.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                className="neu-inset px-4 py-2.5 rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] bg-[#E3E8EF] active:scale-95 transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handlePurgeFakeData}
                disabled={isPurging}
                className="neu-button-danger px-5 py-2.5 rounded-xl text-xs font-black active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isPurging ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Очистка...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Подтвердить очистку</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 7. DELETE SINGLE CUSTOMER CONFIRMATION MODAL ================= */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/50 backdrop-blur-sm animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 max-w-sm w-full space-y-4 text-[#2D3A4E] border border-white/80">
            <div className="flex items-center gap-3 border-b border-[#BAC5D5]/40 pb-3">
              <div className="w-9 h-9 rounded-xl neu-flat-sm flex items-center justify-center text-danger shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-[#2D3A4E] truncate">Удалить клиента?</h3>
                <p className="text-xs text-[#4E5C70] truncate">{customerToDelete.name}</p>
              </div>
            </div>

            <p className="text-xs text-[#4E5C70]">
              Вы действительно хотите удалить профиль <strong className="text-[#2D3A4E]">{customerToDelete.name}</strong> ({customerToDelete.email || customerToDelete.phone || 'Гость'}) из базы данных Firestore?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                disabled={isDeletingCustomer}
                className="neu-inset px-4 py-2 rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] bg-[#E3E8EF] active:scale-95 transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                disabled={isDeletingCustomer}
                className="neu-button-danger px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingCustomer ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
