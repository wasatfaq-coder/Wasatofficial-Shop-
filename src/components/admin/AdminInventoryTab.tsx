import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  Search,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Barcode,
  Layers,
  Sparkles,
  ArrowUpDown,
  Filter,
  History,
  FileText,
  SlidersHorizontal,
  X,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  ClipboardCheck,
  ChevronDown,
  Scale,
  CheckCheck,
  FileSpreadsheet,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { Product, ProductSKU, StockMovementLog } from '../../types';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { copyToClipboard } from '../../utils/clipboard';
import {
  generateDefaultSKUs,
  updateProductSkuStock,
  getProductTotalStock,
  generateSkuCode,
  generateBarcode,
  getStockMovementLogs,
  saveStockMovementLogs,
} from '../../utils/inventory';

interface AdminInventoryTabProps {
  products: Product[];
  onUpdateProducts: (updated: Product[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const INITIAL_LOGS: StockMovementLog[] = [
  {
    id: 'log-1',
    date: 'Сегодня, 11:30',
    type: 'receipt',
    productId: '1',
    productTitle: 'Льняная рубашка Classic Beige',
    skuCode: 'MS-LI01-BEI-L',
    color: 'Бежевый',
    size: 'L',
    changeQuantity: 10,
    previousStock: 2,
    newStock: 12,
    reason: 'Поступление новой партии с фабрики',
    operator: 'Менеджер склада',
  },
  {
    id: 'log-2',
    date: 'Вчера, 16:45',
    type: 'writeoff',
    productId: '2',
    productTitle: 'Брюки чинос Slim Fit',
    skuCode: 'MS-TR02-NAV-M',
    color: 'Темно-синий',
    size: 'M',
    changeQuantity: -1,
    previousStock: 4,
    newStock: 3,
    reason: 'Списание фабричного брака строчки',
    operator: 'Контролер ОТК',
  },
  {
    id: 'log-3',
    date: '2 дня назад',
    type: 'order',
    productId: '3',
    productTitle: 'Куртка ветрозащитная Urban',
    skuCode: 'MS-JA03-BLK-XL',
    color: 'Черный',
    size: 'XL',
    changeQuantity: -1,
    previousStock: 5,
    newStock: 4,
    reason: 'Списание по клиентскому заказу #MS-98214',
    operator: 'Система',
  },
];

export const AdminInventoryTab: React.FC<AdminInventoryTabProps> = ({
  products,
  onUpdateProducts,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'audit' | 'movements'>('matrix');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Critical Low Stock Threshold
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('manstyle_low_stock_threshold');
    return saved ? parseInt(saved, 10) : 3;
  });

  // Stock Movement Logs State
  const [movementLogs, setMovementLogs] = useState<StockMovementLog[]>(() => {
    const saved = getStockMovementLogs();
    return saved && saved.length > 0 ? saved : INITIAL_LOGS;
  });

  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'order' | 'receipt' | 'writeoff' | 'return'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Warehouse Audit Mode State
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [auditOperator, setAuditOperator] = useState('Инспектор склада');
  const [auditFilterDiscrepanciesOnly, setAuditFilterDiscrepanciesOnly] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditSessionDate] = useState(() => new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }));

  // Listen to external stock movement updates (e.g. from Order placed or status changed)
  useEffect(() => {
    const handleLogsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<StockMovementLog[]>;
      if (customEvent.detail) {
        setMovementLogs(customEvent.detail);
      } else {
        setMovementLogs(getStockMovementLogs());
      }
    };
    window.addEventListener('manstyle_stock_logs_updated', handleLogsUpdate);
    return () => window.removeEventListener('manstyle_stock_logs_updated', handleLogsUpdate);
  }, []);

  useEffect(() => {
    saveStockMovementLogs(movementLogs);
  }, [movementLogs]);

  useEffect(() => {
    localStorage.setItem('manstyle_low_stock_threshold', String(lowStockThreshold));
  }, [lowStockThreshold]);

  // Flatten and normalize all SKUs across all products
  const allProductSKUs = useMemo(() => {
    const list: {
      product: Product;
      sku: ProductSKU;
      key: string;
    }[] = [];

    products.forEach((prod) => {
      const skus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);
      skus.forEach((sku) => {
        list.push({
          product: prod,
          sku,
          key: `${prod.id}__${sku.skuCode || sku.id || `${sku.color}_${sku.size}`}`,
        });
      });
    });

    return list;
  }, [products]);

  // Initialize or reset audit counts with current system stock
  const handleInitAuditWithSystemStock = () => {
    const initialCounts: Record<string, number> = {};
    allProductSKUs.forEach(({ key, sku }) => {
      initialCounts[key] = sku.stock;
    });
    setAuditCounts(initialCounts);
    onShowToast('Фактические остатки заполнены учетными значениями', 'info');
  };

  const handleResetAuditCounts = () => {
    setAuditCounts({});
    onShowToast('Введенные данные инвентаризации сброшены', 'info');
  };

  const handleSetAuditCount = (key: string, val: number) => {
    const valid = Math.max(0, isNaN(val) ? 0 : val);
    setAuditCounts((prev) => ({
      ...prev,
      [key]: valid,
    }));
  };

  // Warehouse Audit Statistics & Discrepancies
  const auditStats = useMemo(() => {
    let totalItems = allProductSKUs.length;
    let checkedCount = 0;
    let discrepancyCount = 0;
    let totalSurplusUnits = 0;
    let totalShortageUnits = 0;
    let totalSurplusSum = 0;
    let totalShortageSum = 0;

    allProductSKUs.forEach(({ product, sku, key }) => {
      const actual = auditCounts[key] !== undefined ? auditCounts[key] : sku.stock;
      if (auditCounts[key] !== undefined) {
        checkedCount++;
      }
      const diff = actual - sku.stock;
      const cost = product.costPrice || Math.round(product.price * 0.45);

      if (diff > 0) {
        discrepancyCount++;
        totalSurplusUnits += diff;
        totalSurplusSum += diff * cost;
      } else if (diff < 0) {
        discrepancyCount++;
        const absDiff = Math.abs(diff);
        totalShortageUnits += absDiff;
        totalShortageSum += absDiff * cost;
      }
    });

    return {
      totalItems,
      checkedCount,
      discrepancyCount,
      totalSurplusUnits,
      totalShortageUnits,
      totalSurplusSum,
      totalShortageSum,
      balanceSum: totalSurplusSum - totalShortageSum,
    };
  }, [allProductSKUs, auditCounts]);

  // Filtered SKUs for Audit Table
  const filteredAuditSkus = useMemo(() => {
    return allProductSKUs.filter(({ product, sku, key }) => {
      const actual = auditCounts[key] !== undefined ? auditCounts[key] : sku.stock;
      const diff = actual - sku.stock;

      if (auditFilterDiscrepanciesOnly && diff === 0) {
        return false;
      }

      if (auditSearchQuery.trim()) {
        const q = auditSearchQuery.toLowerCase().trim();
        const matches =
          product.title.toLowerCase().includes(q) ||
          (sku.skuCode && sku.skuCode.toLowerCase().includes(q)) ||
          (sku.barcode && sku.barcode.toLowerCase().includes(q)) ||
          sku.color.toLowerCase().includes(q) ||
          sku.size.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [allProductSKUs, auditCounts, auditFilterDiscrepanciesOnly, auditSearchQuery]);

  // Apply Audit Results: Batch Update products stock & log movements
  const handleApplyAuditResults = () => {
    const discrepantItems: {
      product: Product;
      sku: ProductSKU;
      oldStock: number;
      newStock: number;
      diff: number;
    }[] = [];

    allProductSKUs.forEach(({ product, sku, key }) => {
      if (auditCounts[key] !== undefined && auditCounts[key] !== sku.stock) {
        discrepantItems.push({
          product,
          sku,
          oldStock: sku.stock,
          newStock: auditCounts[key],
          diff: auditCounts[key] - sku.stock,
        });
      }
    });

    if (discrepantItems.length === 0) {
      onShowToast('Расхождений не обнаружено. Все остатки соответствуют учетным.', 'info');
      return;
    }

    // Update products stock in state
    let updatedProducts = [...products];
    const newLogs: StockMovementLog[] = [];
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    discrepantItems.forEach((item) => {
      updatedProducts = updatedProducts.map((p) =>
        p.id === item.product.id
          ? updateProductSkuStock(p, item.sku.color, item.sku.size, item.newStock)
          : p
      );

      newLogs.push({
        id: `audit-${Date.now()}-${item.sku.skuCode || item.sku.id}`,
        date: `${auditSessionDate}, ${timestamp}`,
        type: item.diff > 0 ? 'receipt' : 'writeoff',
        productId: item.product.id,
        productTitle: item.product.title,
        skuCode: item.sku.skuCode || `SKU-${item.product.id}`,
        color: item.sku.color,
        size: item.sku.size,
        changeQuantity: item.diff,
        previousStock: item.oldStock,
        newStock: item.newStock,
        reason: `Инвентаризация склада (${item.diff > 0 ? 'Оприходование излишка' : 'Списание недостачи'})`,
        operator: auditOperator || 'Инспектор склада',
      });
    });

    onUpdateProducts(updatedProducts);
    setMovementLogs((prev) => [...newLogs, ...prev]);
    setAuditCounts({});
    onShowToast(`Инвентаризация утверждена: скорректировано ${discrepantItems.length} позиций SKU`, 'success');
  };

  // Export Audit Sheet to CSV
  const handleExportAuditCSV = () => {
    const header = 'Артикул;Штрихкод;Наименование;Цвет;Размер;Учетный остаток;Фактический остаток;Разница;Статус;Себестоимость ед.;Сумма расхождения\n';
    const rows = allProductSKUs
      .map(({ product, sku, key }) => {
        const actual = auditCounts[key] !== undefined ? auditCounts[key] : sku.stock;
        const diff = actual - sku.stock;
        const status = diff === 0 ? 'Совпадает' : diff > 0 ? 'Излишек' : 'Недостача';
        const cost = product.costPrice || Math.round(product.price * 0.45);
        const diffSum = diff * cost;
        return `"${sku.skuCode || ''}";"${sku.barcode || ''}";"${product.title.replace(/"/g, '""')}";"${sku.color}";"${sku.size}";${sku.stock};${actual};${diff};"${status}";${cost};${diffSum}`;
      })
      .join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventarizatsiya_sklad_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('Инвентаризационная ведомость экспортирована в CSV', 'success');
  };

  // Export movement logs to CSV / Text report
  const handleExportLogs = () => {
    if (movementLogs.length === 0) {
      onShowToast('Журнал пуст', 'info');
      return;
    }
    const header = 'Дата;Тип;Товар;SKU;Цвет;Размер;Изменение;До;После;Причина;Оператор\n';
    const rows = movementLogs
      .map(
        (l) =>
          `"${l.date}";"${l.type}";"${l.productTitle.replace(/"/g, '""')}";"${l.skuCode}";"${l.color}";"${l.size}";${l.changeQuantity};${l.previousStock};${l.newStock};"${l.reason.replace(/"/g, '""')}";"${l.operator}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sklad_dvizheniya_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('Журнал складских движений экспортирован в CSV', 'success');
  };

  const filteredLogs = useMemo(() => {
    return movementLogs.filter((log) => {
      if (logTypeFilter !== 'all' && log.type !== logTypeFilter) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase().trim();
        const match =
          log.productTitle.toLowerCase().includes(q) ||
          log.skuCode.toLowerCase().includes(q) ||
          log.reason.toLowerCase().includes(q) ||
          log.operator.toLowerCase().includes(q) ||
          log.color.toLowerCase().includes(q) ||
          log.size.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [movementLogs, logTypeFilter, logSearchQuery]);

  // Movement Operation Modal State
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [opType, setOpType] = useState<StockMovementLog['type']>('receipt');
  const [opSelectedProductId, setOpSelectedProductId] = useState<string>(products?.[0]?.id || '');
  const [opSelectedSkuIndex, setOpSelectedSkuIndex] = useState<number>(0);
  const [opQuantity, setOpQuantity] = useState<number>(5);
  const [opReason, setOpReason] = useState<string>('Плановое пополнение остатков');
  const [opOperator, setOpOperator] = useState<string>('Администратор');

  // Barcode Label Generation & Printing Modal State
  const [selectedSkuForLabels, setSelectedSkuForLabels] = useState<{ product: Product; sku: ProductSKU } | null>(null);
  const [labelQuantity, setLabelQuantity] = useState<number>(2);
  const [labelFormat, setLabelFormat] = useState<'58x40' | '70x50' | 'hangtag'>('58x40');
  const [labelIncludePrice, setLabelIncludePrice] = useState<boolean>(true);
  const [labelIncludeBarcode, setLabelIncludeBarcode] = useState<boolean>(true);

  // Warehouse high-level statistics
  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalSkus = allProductSKUs.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    allProductSKUs.forEach(({ sku }) => {
      totalUnits += sku.stock;
      if (sku.stock === 0) {
        outOfStockCount++;
      } else if (sku.stock <= lowStockThreshold) {
        lowStockCount++;
      }
    });

    return {
      totalUnits,
      totalSkus,
      lowStockCount,
      outOfStockCount,
    };
  }, [allProductSKUs, lowStockThreshold]);

  // Stock filter options with live counts and color indicators for Neumorphic dropdown
  const stockFilterOptions = useMemo(() => {
    const inStockNormalCount = Math.max(0, stats.totalSkus - stats.lowStockCount - stats.outOfStockCount);
    return [
      {
        value: 'all',
        label: 'Все позиции',
        badge: `${allProductSKUs.length}`,
        sublabel: 'Все артикулы каталога',
        icon: <Layers className="w-3.5 h-3.5 text-[#5F6ED0]" />,
      },
      {
        value: 'in_stock',
        label: 'В норме',
        badge: `${inStockNormalCount}`,
        sublabel: `Остаток больше ${lowStockThreshold} шт.`,
        icon: <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />,
      },
      {
        value: 'low_stock',
        label: 'Дефицит',
        badge: `${stats.lowStockCount}`,
        sublabel: `Остаток ≤ ${lowStockThreshold} шт. (мало на складе)`,
        icon: <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />,
      },
      {
        value: 'out_of_stock',
        label: 'Закончились',
        badge: `${stats.outOfStockCount}`,
        sublabel: 'Нулевой остаток (нет в наличии)',
        icon: <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />,
      },
    ];
  }, [allProductSKUs.length, stats, lowStockThreshold]);

  // Filtered SKUs
  const filteredSkus = useMemo(() => {
    return allProductSKUs.filter(({ product, sku }) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        product.title.toLowerCase().includes(q) ||
        sku.skuCode.toLowerCase().includes(q) ||
        sku.barcode.toLowerCase().includes(q) ||
        sku.color.toLowerCase().includes(q) ||
        sku.size.toLowerCase().includes(q);

      const matchesCat = categoryFilter === 'all' || product.category === categoryFilter;

      let matchesStock = true;
      if (stockFilter === 'in_stock') {
        matchesStock = sku.stock > lowStockThreshold;
      } else if (stockFilter === 'low_stock') {
        matchesStock = sku.stock > 0 && sku.stock <= lowStockThreshold;
      } else if (stockFilter === 'out_of_stock') {
        matchesStock = sku.stock === 0;
      }

      return matchesSearch && matchesCat && matchesStock;
    });
  }, [allProductSKUs, searchQuery, categoryFilter, stockFilter, lowStockThreshold]);

  // Update Stock for a SKU with automatic log recording
  const handleUpdateStock = (
    productId: string,
    color: string,
    size: string,
    newStock: number,
    reasonText = 'Ручная корректировка в матрице'
  ) => {
    const validStock = Math.max(0, newStock);
    const prod = products.find((p) => p.id === productId);
    const currentSku = (prod?.skus || []).find((s) => s.color === color && s.size === size);
    const oldStock = currentSku ? currentSku.stock : 0;
    const diff = validStock - oldStock;

    const updated = products.map((p) =>
      p.id === productId ? updateProductSkuStock(p, color, size, validStock) : p
    );
    onUpdateProducts(updated);

    if (diff !== 0 && prod) {
      const newLog: StockMovementLog = {
        id: `log-${Date.now()}`,
        date: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        type: diff > 0 ? 'receipt' : 'writeoff',
        productId,
        productTitle: prod.title,
        skuCode: currentSku?.skuCode || `SKU-${productId}`,
        color,
        size,
        changeQuantity: diff,
        previousStock: oldStock,
        newStock: validStock,
        reason: reasonText,
        operator: 'Оператор склада',
      };
      setMovementLogs((prev) => [newLog, ...prev]);
    }
  };

  // Bulk restock all low-stock SKUs
  const handleBulkRestockDeficit = () => {
    let restockedCount = 0;
    const newLogs: StockMovementLog[] = [];
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const updated = products.map((prod) => {
      const skus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);
      let changed = false;
      const updatedSkus = skus.map((s) => {
        if (s.stock <= lowStockThreshold) {
          restockedCount++;
          changed = true;
          const oldStock = s.stock;
          const newStock = s.stock + 6;

          newLogs.push({
            id: `restock-${Date.now()}-${s.skuCode || s.id}-${Math.random().toString(36).substring(2, 6)}`,
            date: `Сегодня, ${timestamp}`,
            type: 'receipt',
            productId: prod.id,
            productTitle: prod.title,
            skuCode: s.skuCode || `SKU-${prod.id}`,
            color: s.color,
            size: s.size,
            changeQuantity: 6,
            previousStock: oldStock,
            newStock: newStock,
            reason: 'Пакетное пополнение дефицитных остатков (+6 шт.)',
            operator: 'Администратор склада',
          });

          return { ...s, stock: newStock };
        }
        return s;
      });
      return changed ? { ...prod, skus: updatedSkus, inStock: true } : prod;
    });

    onUpdateProducts(updated);
    if (newLogs.length > 0) {
      setMovementLogs((prev) => [...newLogs, ...prev]);
    }
    onShowToast(`Автоматически пополнено ${restockedCount} дефицитных SKU (+6 шт)`, 'success');
  };

  const handleCopySku = (skuCode: string) => {
    copyToClipboard(skuCode);
    setCopiedSku(skuCode);
    setTimeout(() => setCopiedSku(null), 2000);
    onShowToast(`Артикул ${skuCode} скопирован`, 'info');
  };

  // Execute warehouse operation modal
  const handleExecuteOperation = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === opSelectedProductId);
    if (!prod) return;

    const skus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);
    const sku = skus?.[opSelectedSkuIndex] || skus?.[0];
    if (!sku) return;

    const qtyChange =
      opType === 'receipt' || opType === 'return' ? Math.abs(opQuantity) : -Math.abs(opQuantity);

    const oldStock = sku.stock;
    const newStock = Math.max(0, oldStock + qtyChange);

    handleUpdateStock(prod.id, sku.color, sku.size, newStock, `${opReason} (${opOperator})`);
    onShowToast(
      `Складская операция проведена: ${sku.skuCode} ${qtyChange > 0 ? `+${qtyChange}` : qtyChange} шт.`,
      'success'
    );
    setIsOperationModalOpen(false);
  };

  const selectedProductForModal = products?.find((p) => p.id === opSelectedProductId) || products?.[0];
  const selectedProductSkus = selectedProductForModal
    ? selectedProductForModal.skus && selectedProductForModal.skus.length > 0
      ? selectedProductForModal.skus
      : generateDefaultSKUs(selectedProductForModal)
    : [];

  return (
    <div className="space-y-4">
      {/* Top Header & Sub-tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF] w-full sm:w-auto overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'matrix'
                ? 'neu-pill-active'
                : 'text-[#5C6B80] hover:text-[#2D3A4E]'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            Матрица остатков
          </button>
          <button
            onClick={() => setActiveSubTab('audit')}
            className={`py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'audit'
                ? 'neu-pill-active'
                : 'text-[#5C6B80] hover:text-[#2D3A4E]'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Инвентаризация {auditStats.discrepancyCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('movements')}
            className={`py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'movements'
                ? 'neu-pill-active'
                : 'text-[#5C6B80] hover:text-[#2D3A4E]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Журнал движений ({movementLogs.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsOperationModalOpen(true)}
            className="h-9 px-4 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Оформить операцию
          </button>
        </div>
      </div>

      {/* Warehouse Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-[#5C6B80] block">Всего единиц</span>
          <span className="text-base font-black text-[#2D3A4E]">{stats.totalUnits} шт.</span>
          <span className="text-[10px] text-[#5C6B80] block font-semibold">
            по {stats.totalSkus} артикулам SKU
          </span>
        </div>

        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-[#5C6B80] block">Порог дефицита</span>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-black text-[#5F6ED0]">≤ {lowStockThreshold} шт.</span>
            <div className="flex gap-1">
              {[2, 3, 5].map((th) => (
                <button
                  key={th}
                  onClick={() => setLowStockThreshold(th)}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                    lowStockThreshold === th ? 'neu-pill-active' : 'neu-button text-[#2D3A4E]'
                  }`}
                >
                  {th}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-[#5C6B80] block font-semibold">порог предупреждения</span>
        </div>

        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-amber-700 block">Мало на складе</span>
          <span className="text-base font-black text-amber-600">{stats.lowStockCount} SKU</span>
          {stats.lowStockCount > 0 && (
            <button
              onClick={handleBulkRestockDeficit}
              className="text-[9px] font-black text-[#5F6ED0] hover:underline cursor-pointer block"
            >
              Пополнить все (+6 шт)
            </button>
          )}
        </div>

        <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-rose-700 block">Нет в наличии</span>
          <span className="text-base font-black text-rose-600">{stats.outOfStockCount} SKU</span>
          <span className="text-[10px] text-[#5C6B80] block font-semibold">нулевой остаток</span>
        </div>
      </div>

      {/* MATRIX VIEW */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-3">
          {/* Quick Barcode Scanner, Search Bar & Neumorphic Stock Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6B80]" />
              <input
                type="text"
                placeholder="Поиск по названию, артикулу MS-..., штрихкоду или цвету..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#5C6B80] focus:outline-none bg-[#E3E8EF]"
              />
            </div>

            {/* Neumorphic Stock Status Filter Dropdown */}
            <div className="relative">
              <NeumorphicSelect
                value={stockFilter}
                onChange={(val) => setStockFilter(val as any)}
                variant="inset"
                triggerClassName="rounded-2xl"
                prefix="Статус остатка:"
                options={stockFilterOptions}
                placeholder="Фильтр остатка..."
              />
            </div>
          </div>

          {/* SKUs Matrix Cards List */}
          <div className="space-y-2">
            {filteredSkus.length === 0 ? (
              <div className="neu-inset rounded-2xl p-8 text-center space-y-1 text-[#5C6B80] bg-[#E3E8EF]">
                <Boxes className="w-8 h-8 mx-auto text-[#5C6B80]/50" />
                <p className="text-xs font-bold text-[#2D3A4E]">Позиции не найдены</p>
                <p className="text-[10px]">Попробуйте изменить параметры поиска или фильтров</p>
              </div>
            ) : (
              filteredSkus.map(({ product, sku }) => {
                const isOutOfStock = sku.stock === 0;
                const isLowStock = sku.stock > 0 && sku.stock <= lowStockThreshold;
                const isCopied = copiedSku === sku.skuCode;

                return (
                  <div
                    key={`${product.id}-${sku.skuCode}`}
                    className="neu-inset rounded-2xl p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#E3E8EF] border border-transparent transition-all overflow-hidden"
                  >
                    {/* Left: Product Thumbnail & SKU Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-13 rounded-xl overflow-hidden neu-inset shrink-0 bg-slate-200">
                        <img
                          src={
                            product.images?.[0] ||
                            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'
                          }
                          alt={product.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <h4 className="text-xs font-black text-[#2D3A4E] truncate">{product.title}</h4>

                        <div className="flex items-center gap-2 text-[11px] font-bold">
                          <span className="neu-button px-2 py-0.5 rounded-lg text-[#2D3A4E] bg-[#E3E8EF] inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-[#5F6ED0]" />
                            {sku.color}
                          </span>
                          <span className="neu-button px-2 py-0.5 rounded-lg text-[#5F6ED0] bg-[#E3E8EF]">
                            {sku.size}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-0.5 text-[10px] text-[#5C6B80] font-mono flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleCopySku(sku.skuCode)}
                            className="inline-flex items-center gap-1 hover:text-[#5F6ED0] transition-colors cursor-pointer"
                            title="Скопировать артикул"
                          >
                            <span>{sku.skuCode}</span>
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-60" />
                            )}
                          </button>
                          <span>|</span>
                          <span className="flex items-center gap-1">
                            <Barcode className="w-3 h-3" />
                            {sku.barcode}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Stock Badge & Quick Stepper Controls */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#BAC5D5]/40 min-w-0">
                      {/* Status Pill */}
                      <div className="shrink-0">
                        {isOutOfStock ? (
                          <span className="neu-button px-2 sm:px-2.5 py-1 rounded-xl text-[10px] font-black text-rose-600 bg-[#E3E8EF] inline-flex items-center gap-1 whitespace-nowrap">
                            <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                            <span className="sm:hidden">0 шт. (Нет)</span>
                            <span className="hidden sm:inline">0 шт. (Закончился)</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="neu-button px-2 sm:px-2.5 py-1 rounded-xl text-[10px] font-black text-amber-600 bg-[#E3E8EF] inline-flex items-center gap-1 whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{sku.stock} шт. (Мало)</span>
                          </span>
                        ) : (
                          <span className="neu-button px-2 sm:px-2.5 py-1 rounded-xl text-[10px] font-black text-emerald-700 bg-[#E3E8EF] inline-flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>{sku.stock} шт.</span>
                          </span>
                        )}
                      </div>

                      {/* Stepper Buttons */}
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        <div className="neu-inset rounded-full p-0.5 flex items-center gap-0.5 sm:gap-1 bg-[#E3E8EF]">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateStock(product.id, sku.color, sku.size, sku.stock - 1)
                            }
                            disabled={sku.stock <= 0}
                            className="w-6 h-6 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                            title="Уменьшить остаток на 1"
                          >
                            <Minus className="w-3 h-3 stroke-[2.5]" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            max="999"
                            value={sku.stock}
                            onChange={(e) =>
                              handleUpdateStock(
                                product.id,
                                sku.color,
                                sku.size,
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                            className="w-8 sm:w-10 text-center text-xs font-black text-[#2D3A4E] bg-transparent focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateStock(product.id, sku.color, sku.size, sku.stock + 1)
                            }
                            className="w-6 h-6 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] cursor-pointer shrink-0"
                            title="Увеличить остаток на 1"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateStock(product.id, sku.color, sku.size, sku.stock + 5)
                          }
                          className="h-7 px-2 sm:px-2.5 neu-button rounded-xl text-[10px] font-black text-[#5F6ED0] hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                          title="Пополнить на +5 шт."
                        >
                          +5
                        </button>

                        {/* Print Thermal Label Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedSkuForLabels({ product, sku })}
                          className="h-7 px-2 sm:px-2.5 neu-button rounded-xl text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0] flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0"
                          title="Сформировать и распечатать термоэтикетку со штрихкодом"
                        >
                          <Printer className="w-3 h-3 text-[#5F6ED0] shrink-0" />
                          <span>Этикетка</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* WAREHOUSE AUDIT & PHYSICAL COUNT VIEW */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          {/* Header & Session Bar */}
          <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E]">
                    Инвентаризационная ведомость склада
                  </h3>
                  <p className="text-[10px] text-[#5C6B80] font-semibold">
                    Сессия: {auditSessionDate} • Сверка фактического наличия с учетной системой
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-bold text-[#5C6B80]">Инспектор:</span>
                  <input
                    type="text"
                    value={auditOperator}
                    onChange={(e) => setAuditOperator(e.target.value)}
                    className="w-36 py-1 px-2.5 neu-inset rounded-lg text-xs font-black text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none"
                    placeholder="ФИО / Должность"
                  />
                </div>
              </div>
            </div>

            {/* Audit KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="neu-button rounded-xl p-2.5 bg-[#E3E8EF]">
                <span className="text-[10px] uppercase font-bold text-[#5C6B80] block">Всего позиций SKU</span>
                <span className="text-sm font-black text-[#2D3A4E]">{auditStats.totalItems} шт.</span>
                <span className="text-[9px] text-[#5C6B80] block">в каталоге</span>
              </div>

              <div className="neu-button rounded-xl p-2.5 bg-[#E3E8EF]">
                <span className="text-[10px] uppercase font-bold text-amber-700 block">Расхождений</span>
                <span className={`text-sm font-black ${auditStats.discrepancyCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {auditStats.discrepancyCount} SKU
                </span>
                <span className="text-[9px] text-[#5C6B80] block">
                  {auditStats.discrepancyCount === 0 ? 'Полное совпадение' : 'Требуют списания/оприходования'}
                </span>
              </div>

              <div className="neu-button rounded-xl p-2.5 bg-[#E3E8EF]">
                <span className="text-[10px] uppercase font-bold text-rose-700 block">Недостача</span>
                <span className="text-sm font-black text-rose-600">
                  -{auditStats.totalShortageUnits} шт.
                </span>
                <span className="text-[9px] text-rose-700/80 block font-bold">
                  -{auditStats.totalShortageSum.toLocaleString('ru-RU')} ₽
                </span>
              </div>

              <div className="neu-button rounded-xl p-2.5 bg-[#E3E8EF]">
                <span className="text-[10px] uppercase font-bold text-sky-700 block">Излишек</span>
                <span className="text-sm font-black text-sky-600">
                  +{auditStats.totalSurplusUnits} шт.
                </span>
                <span className="text-[9px] text-sky-700/80 block font-bold">
                  +{auditStats.totalSurplusSum.toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>

            {/* Quick Action Tools */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleInitAuditWithSystemStock}
                  className="py-1.5 px-3 neu-button rounded-xl text-xs font-bold text-[#5F6ED0] hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Быстрое заполнение фактических остатков значениями из системы"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Заполнить учетными</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAuditCounts}
                  className="py-1.5 px-2.5 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Очистить введенные фактические данные"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить ввод</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAuditFilterDiscrepanciesOnly(!auditFilterDiscrepanciesOnly)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    auditFilterDiscrepanciesOnly
                      ? 'neu-button text-rose-600'
                      : 'neu-button text-[#5C6B80] hover:text-[#2D3A4E]'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Только расхождения ({auditStats.discrepancyCount})</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAuditCSV}
                  className="py-1.5 px-3 neu-button rounded-xl text-xs font-bold text-[#5F6ED0] hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Ведомость (CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyAuditResults}
                  disabled={auditStats.discrepancyCount === 0}
                  className="py-1.5 px-4 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Утвердить инвентаризацию</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search bar for audit */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6B80]" />
            <input
              type="text"
              placeholder="Поиск по артикулу SKU, названию товара, цвету или штрихкоду..."
              value={auditSearchQuery}
              onChange={(e) => setAuditSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#5C6B80] focus:outline-none bg-[#E3E8EF]"
            />
            {auditSearchQuery && (
              <button
                type="button"
                onClick={() => setAuditSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5C6B80] hover:text-[#2D3A4E]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Audit Items List */}
          <div className="space-y-2">
            {filteredAuditSkus.length === 0 ? (
              <div className="neu-inset rounded-2xl p-8 text-center space-y-1 text-[#5C6B80] bg-[#E3E8EF]">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600/70" />
                <p className="text-xs font-bold text-[#2D3A4E]">
                  {auditFilterDiscrepanciesOnly
                    ? 'Расхождений не найдено! Все позиции соответствуют учетным данным.'
                    : 'Позиции не найдены'}
                </p>
                <p className="text-[10px]">Все физические остатки совпадают с базой</p>
              </div>
            ) : (
              filteredAuditSkus.map(({ product, sku, key }) => {
                const actual = auditCounts[key] !== undefined ? auditCounts[key] : sku.stock;
                const diff = actual - sku.stock;
                const cost = product.costPrice || Math.round(product.price * 0.45);
                const isShortage = diff < 0;
                const isSurplus = diff > 0;
                const isMatch = diff === 0;

                return (
                  <div
                    key={key}
                    className={`neu-inset rounded-2xl p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#E3E8EF] border transition-all overflow-hidden ${
                      isShortage
                        ? 'border-rose-300 ring-1 ring-rose-300/30'
                        : isSurplus
                        ? 'border-sky-300 ring-1 ring-sky-300/30'
                        : 'border-transparent'
                    }`}
                  >
                    {/* Left: Product & SKU details */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-13 rounded-xl overflow-hidden neu-inset shrink-0 bg-slate-200">
                        <img
                          src={
                            product.images?.[0] ||
                            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'
                          }
                          alt={product.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <h4 className="text-xs font-black text-[#2D3A4E] truncate">{product.title}</h4>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
                          <span className="neu-button px-2 py-0.5 rounded-lg text-[#2D3A4E] bg-[#E3E8EF]">
                            {sku.color}
                          </span>
                          <span className="neu-button px-2 py-0.5 rounded-lg text-[#5F6ED0] bg-[#E3E8EF]">
                            {sku.size}
                          </span>
                          <span className="text-[10px] font-mono text-[#5C6B80]">
                            {sku.skuCode}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#5C6B80] font-semibold">
                          Себестоимость: <strong className="text-[#2D3A4E]">{cost.toLocaleString('ru-RU')} ₽</strong> • Штрихкод: {sku.barcode}
                        </p>
                      </div>
                    </div>

                    {/* Right: System Stock vs Physical Count Inputs & Diff */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#BAC5D5]/40 min-w-0">
                      {/* System Stock */}
                      <div className="text-center neu-button px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#E3E8EF] min-w-[64px] sm:min-w-[70px] shrink-0">
                        <span className="text-[9px] uppercase font-bold text-[#5C6B80] block">Учет</span>
                        <span className="text-xs font-black text-[#2D3A4E] whitespace-nowrap">{sku.stock} шт.</span>
                      </div>

                      {/* Physical Count Stepper Input */}
                      <div className="space-y-0.5 text-center shrink-0">
                        <span className="text-[9px] uppercase font-bold text-[#5F6ED0] block">Факт (пересчет)</span>
                        <div className="neu-inset rounded-full p-0.5 flex items-center gap-0.5 sm:gap-1 bg-[#E3E8EF]">
                          <button
                            type="button"
                            onClick={() => handleSetAuditCount(key, actual - 1)}
                            disabled={actual <= 0}
                            className="w-6 h-6 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                          >
                            <Minus className="w-3 h-3 stroke-[2.5]" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            max="999"
                            value={actual}
                            onChange={(e) => handleSetAuditCount(key, parseInt(e.target.value, 10) || 0)}
                            className="w-8 sm:w-10 text-center text-xs font-black text-[#5F6ED0] bg-transparent focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => handleSetAuditCount(key, actual + 1)}
                            className="w-6 h-6 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] cursor-pointer shrink-0"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>

                      {/* Difference Badge */}
                      <div className="text-right min-w-[80px] sm:min-w-[90px] shrink-0">
                        {isMatch ? (
                          <span className="neu-button px-2 py-1 rounded-xl text-[10px] font-black text-emerald-700 bg-[#E3E8EF] inline-flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> Совпадает
                          </span>
                        ) : isShortage ? (
                          <div className="space-y-0.5">
                            <span className="neu-button px-2 py-0.5 rounded-xl text-[10px] font-black text-rose-600 bg-rose-50/50 inline-flex items-center gap-1">
                              Недостача {diff} шт.
                            </span>
                            <span className="text-[9px] font-bold text-rose-600 block">
                              -{(Math.abs(diff) * cost).toLocaleString('ru-RU')} ₽
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="neu-button px-2 py-0.5 rounded-xl text-[10px] font-black text-sky-700 bg-sky-50/50 inline-flex items-center gap-1">
                              Излишек +{diff} шт.
                            </span>
                            <span className="text-[9px] font-bold text-sky-700 block">
                              +{(diff * cost).toLocaleString('ru-RU')} ₽
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {activeSubTab === 'movements' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-[#5F6ED0]" />
              Журнал складских операций и списаний
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportLogs}
                className="py-1 px-3 neu-button rounded-xl text-[11px] font-bold text-[#5F6ED0] hover:scale-105 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                title="Скачать журнал в CSV"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Экспорт CSV</span>
              </button>
              <button
                onClick={() => {
                  setMovementLogs(INITIAL_LOGS);
                  onShowToast('Журнал движений сброшен к демо', 'info');
                }}
                className="text-[11px] font-bold text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                Сброс
              </button>
            </div>
          </div>

          {/* Type Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6B80]" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Поиск по заказу, SKU, товару или причине..."
                className="w-full pl-8 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none"
              />
              {logSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLogSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5C6B80] hover:text-[#2D3A4E]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Type selector */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {[
                { id: 'all', label: 'Все' },
                { id: 'order', label: 'Заказы' },
                { id: 'receipt', label: 'Поступления' },
                { id: 'writeoff', label: 'Списания' },
                { id: 'return', label: 'Возвраты' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLogTypeFilter(t.id as any)}
                  className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all ${
                    logTypeFilter === t.id
                      ? 'neu-pill-active font-black'
                      : 'neu-button text-[#5C6B80]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredLogs.length === 0 ? (
              <div className="neu-inset rounded-2xl p-6 text-center text-[#5C6B80] bg-[#E3E8EF] text-xs">
                Записей в журнале по выбранному фильтру не найдено
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isPositive = log.changeQuantity > 0;
                const isOrder = log.type === 'order';
                const isReturn = log.type === 'return';

                return (
                  <div
                    key={log.id}
                    className="neu-flat rounded-2xl p-3 bg-[#E3E8EF] flex items-start justify-between gap-3 text-xs border border-white/70"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isOrder
                            ? 'neu-inset text-[#5F6ED0]'
                            : isReturn
                            ? 'neu-inset text-amber-600'
                            : isPositive
                            ? 'neu-inset text-emerald-600'
                            : 'neu-inset text-rose-600'
                        }`}
                      >
                        {isOrder ? (
                          <Truck className="w-4 h-4" />
                        ) : isReturn ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : isPositive ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#2D3A4E] truncate">{log.productTitle}</span>
                          <span className="text-[10px] font-mono text-[#5F6ED0] font-bold shrink-0">
                            {log.skuCode}
                          </span>
                          {isOrder && (
                            <span className="neu-inset px-1.5 py-0.5 rounded text-[9px] font-bold text-[#5F6ED0]">
                              Списание заказа
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#5C6B80] truncate">
                          Цвет: {log.color} • Размер: {log.size} • {log.reason}
                        </p>
                        <span className="text-[10px] text-[#5C6B80] block font-medium">
                          Оператор: {log.operator} • {log.date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-black block ${
                          isOrder
                            ? 'text-[#5F6ED0]'
                            : isPositive
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }`}
                      >
                        {isPositive ? `+${log.changeQuantity}` : log.changeQuantity} шт.
                      </span>
                      <span className="text-[10px] text-[#5C6B80] font-mono block">
                        {log.previousStock} ➔ <strong>{log.newStock} шт.</strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: EXECUTE WAREHOUSE OPERATION ================= */}
      {isOperationModalOpen && (
        <div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 text-[#2D3A4E] border border-white/80 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0]">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-[#2D3A4E]">
                    Складская операция
                  </h3>
                  <p className="text-[10px] font-bold text-[#5C6B80]">
                    Поступление, списание брака или инвентаризация
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOperationModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteOperation} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1">
                  Тип операции
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'receipt', label: 'Поступление товара (+)' },
                    { id: 'writeoff', label: 'Списание брака (-)' },
                    { id: 'inventory', label: 'Корректировка' },
                    { id: 'return', label: 'Возврат на склад (+)' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOpType(t.id as any)}
                      className={`py-2 px-2 rounded-xl text-center font-bold text-[11px] transition-all cursor-pointer ${
                        opType === t.id
                          ? 'neu-pill-active font-black'
                          : 'neu-button text-[#5C6B80]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1 truncate">
                  Выберите товар
                </label>
                <NeumorphicSelect
                  value={opSelectedProductId}
                  onChange={(val) => {
                    setOpSelectedProductId(val);
                    setOpSelectedSkuIndex(0);
                  }}
                  options={products.map((p) => ({
                    value: p.id,
                    label: p.title,
                  }))}
                  variant="inset"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1 truncate">
                  Вариация (Цвет / Размер / SKU)
                </label>
                <NeumorphicSelect
                  value={opSelectedSkuIndex.toString()}
                  onChange={(val) => setOpSelectedSkuIndex(Number(val))}
                  options={selectedProductSkus.map((s, idx) => ({
                    value: idx.toString(),
                    label: `${s.color} / ${s.size} (${s.skuCode}) — Остаток: ${s.stock} шт.`,
                  }))}
                  variant="inset"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold text-[#5C6B80] mb-1 truncate">
                    Количество (шт.)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={opQuantity}
                    onChange={(e) => setOpQuantity(Number(e.target.value))}
                    className="w-full py-2 px-3 neu-inset rounded-xl font-black text-xs text-[#5F6ED0] bg-[#E3E8EF] focus:outline-none"
                    required
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold text-[#5C6B80] mb-1 truncate">
                    Оператор
                  </label>
                  <input
                    type="text"
                    value={opOperator}
                    onChange={(e) => setOpOperator(e.target.value)}
                    className="w-full py-2 px-3 neu-inset rounded-xl font-bold text-xs text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none truncate"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1">
                  Основание / Причина
                </label>
                <input
                  type="text"
                  value={opReason}
                  onChange={(e) => setOpReason(e.target.value)}
                  placeholder="номер накладной или описание брака"
                  className="w-full py-2 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#BAC5D5]/50">
                <button
                  type="button"
                  onClick={() => setIsOperationModalOpen(false)}
                  className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#5C6B80]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95"
                >
                  Провести операцию
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BARCODE & THERMAL LABEL GENERATOR MODAL */}
      {selectedSkuForLabels && (
        <div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-lg neu-modal rounded-3xl p-5 bg-[#E3E8EF] border border-white/80 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0]">
                  <Barcode className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E]">
                    Генератор термоэтикеток & Штрихкодов
                  </h4>
                  <p className="text-[10px] text-[#5C6B80] font-semibold">
                    Стандарты Wildberries / Ozon / Склад / Розничный ценник
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSkuForLabels(null)}
                className="p-1.5 neu-button rounded-xl text-[#5C6B80] hover:text-rose-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Label Parameters Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1">
                  Формат этикетки
                </label>
                <div className="neu-flat-sm rounded-xl p-1 bg-[#E3E8EF] flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setLabelFormat('58x40')}
                    className={`py-1 px-2 rounded-lg text-left text-[11px] font-bold transition-all ${
                      labelFormat === '58x40'
                        ? 'neu-pill-active'
                        : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Термоэтикетка 58×40 мм
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabelFormat('70x50')}
                    className={`py-1 px-2 rounded-lg text-left text-[11px] font-bold transition-all ${
                      labelFormat === '70x50'
                        ? 'neu-pill-active'
                        : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Ценник на полку 70×50 мм
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabelFormat('hangtag')}
                    className={`py-1 px-2 rounded-lg text-left text-[11px] font-bold transition-all ${
                      labelFormat === 'hangtag'
                        ? 'neu-pill-active'
                        : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Навесной ярлык на одежду
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#5C6B80] mb-1">
                    Количество копий
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={labelQuantity}
                    onChange={(e) => setLabelQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full py-2 px-3 neu-inset rounded-xl font-black text-xs text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-[#2D3A4E]">
                    <input
                      type="checkbox"
                      checked={labelIncludePrice}
                      onChange={(e) => setLabelIncludePrice(e.target.checked)}
                      className="rounded accent-[#5F6ED0]"
                    />
                    Печатать розничную цену
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-[#2D3A4E]">
                    <input
                      type="checkbox"
                      checked={labelIncludeBarcode}
                      onChange={(e) => setLabelIncludeBarcode(e.target.checked)}
                      className="rounded accent-[#5F6ED0]"
                    />
                    Печатать графический штрихкод
                  </label>
                </div>
              </div>
            </div>

            {/* Live Visual Label Preview */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase text-[#5C6B80] tracking-wider block">
                Предпросмотр термоэтикетки:
              </span>

              <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-[#BAC5D5] flex flex-col items-center justify-center text-black font-sans">
                <div
                  className={`w-full max-w-[280px] bg-white p-3 border border-black/80 rounded-md flex flex-col justify-between ${
                    labelFormat === '58x40'
                      ? 'min-h-[160px]'
                      : labelFormat === '70x50'
                      ? 'min-h-[190px]'
                      : 'min-h-[220px]'
                  }`}
                >
                  <div className="border-b border-black/30 pb-1 mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-widest uppercase">MANSTYLE</span>
                    <span className="text-[9px] font-bold text-black/70">RU / EAC</span>
                  </div>

                  <div>
                    <h5 className="text-[11px] font-black leading-tight truncate">
                      {selectedSkuForLabels.product.title}
                    </h5>
                    <div className="flex items-center justify-between text-[10px] font-semibold mt-0.5">
                      <span>Цвет: <strong>{selectedSkuForLabels.sku.color}</strong></span>
                      <span>Размер: <strong className="text-xs">{selectedSkuForLabels.sku.size}</strong></span>
                    </div>
                    <div className="text-[9px] font-mono text-black/80 mt-0.5 truncate">
                      Арт: {selectedSkuForLabels.sku.skuCode}
                    </div>
                  </div>

                  {labelIncludeBarcode && (
                    <div className="my-1 text-center">
                      {/* Code128 Real-looking Vector Barcode */}
                      <svg className="w-full h-10 mx-auto" viewBox="0 0 200 40">
                        <rect x="10" y="0" width="3" height="30" fill="black" />
                        <rect x="15" y="0" width="1.5" height="30" fill="black" />
                        <rect x="18" y="0" width="4" height="30" fill="black" />
                        <rect x="25" y="0" width="2" height="30" fill="black" />
                        <rect x="30" y="0" width="5" height="30" fill="black" />
                        <rect x="38" y="0" width="2" height="30" fill="black" />
                        <rect x="42" y="0" width="3" height="30" fill="black" />
                        <rect x="48" y="0" width="1.5" height="30" fill="black" />
                        <rect x="52" y="0" width="4" height="30" fill="black" />
                        <rect x="58" y="0" width="2" height="30" fill="black" />
                        <rect x="63" y="0" width="3.5" height="30" fill="black" />
                        <rect x="69" y="0" width="2" height="30" fill="black" />
                        <rect x="74" y="0" width="5" height="30" fill="black" />
                        <rect x="82" y="0" width="1.5" height="30" fill="black" />
                        <rect x="86" y="0" width="3" height="30" fill="black" />
                        <rect x="92" y="0" width="4" height="30" fill="black" />
                        <rect x="99" y="0" width="2" height="30" fill="black" />
                        <rect x="104" y="0" width="3" height="30" fill="black" />
                        <rect x="110" y="0" width="5" height="30" fill="black" />
                        <rect x="118" y="0" width="2" height="30" fill="black" />
                        <rect x="123" y="0" width="3.5" height="30" fill="black" />
                        <rect x="129" y="0" width="1.5" height="30" fill="black" />
                        <rect x="133" y="0" width="4" height="30" fill="black" />
                        <rect x="140" y="0" width="2" height="30" fill="black" />
                        <rect x="145" y="0" width="3" height="30" fill="black" />
                        <rect x="151" y="0" width="5" height="30" fill="black" />
                        <rect x="159" y="0" width="2" height="30" fill="black" />
                        <rect x="164" y="0" width="4" height="30" fill="black" />
                        <rect x="171" y="0" width="2" height="30" fill="black" />
                        <rect x="176" y="0" width="3" height="30" fill="black" />
                        <rect x="182" y="0" width="4" height="30" fill="black" />
                      </svg>
                      <span className="text-[10px] font-mono font-bold tracking-widest block">
                        {selectedSkuForLabels.sku.barcode}
                      </span>
                    </div>
                  )}

                  {labelIncludePrice && (
                    <div className="border-t border-black/30 pt-1 flex items-center justify-between">
                      <span className="text-[9px] uppercase font-bold text-black/70">Розничная цена:</span>
                      <span className="text-sm font-black tracking-tight">
                        {selectedSkuForLabels.product.price.toLocaleString()} ₽
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setSelectedSkuForLabels(null)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#5C6B80] cursor-pointer"
              >
                Закрыть
              </button>

              <button
                type="button"
                onClick={() => {
                  onShowToast(`Отправлено на печать: ${labelQuantity} шт. (${selectedSkuForLabels.sku.skuCode})`, 'success');
                  window.print();
                }}
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Печать ({labelQuantity} шт.)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
