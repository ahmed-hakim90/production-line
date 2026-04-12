import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  BadgeDollarSign,
  Boxes,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CirclePlus,
  Cog,
  Download,
  Eye,
  GripVertical,
  Loader2,
  Package,
  Pencil,
  Printer,
  ReceiptText,
  RefreshCcw,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Split,
  Trash2,
  Truck,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber } from '../../../utils/calculations';
import { buildProductAvgCost, formatCost, getCurrentMonth, type ProductCostData } from '../../../utils/costCalculations';
import type { Product, FirestoreProduct, ProductionReport } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { parseProductsExcel, toProductData, toProductDataWithExisting, ProductImportResult } from '../../../utils/importProducts';
import { downloadProductsTemplate } from '../../../utils/downloadTemplates';
import { exportAllProducts } from '../../../utils/exportExcel';
import type { ProductExportOptions } from '../../../utils/exportExcel';
import { calculateProductCostBreakdown, type ProductCostBreakdown } from '../../../utils/productCostBreakdown';
import type { ProductMaterial } from '../../../types';
import { productMaterialService } from '../services/productMaterialService';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { stockService } from '../../inventory/services/stockService';
import type { StockItemBalance } from '../../inventory/types';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { warehouseService } from '../../inventory/services/warehouseService';
import type { Warehouse as InventoryWarehouse } from '../../inventory/types';
import { categoryService } from '../../catalog/services/categoryService';
import { monthlyProductionCostService } from '../../costs/services/monthlyProductionCostService';
import { reportService } from '../services/reportService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useManagedPrint } from '../../../utils/printManager';
import { shareToWhatsApp, waitForExportPaint } from '../../../utils/reportExport';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { deleteField } from 'firebase/firestore';

type ProductTableColumnKey =
  | 'openingStock'
  | 'totalProduction'
  | 'monthlyProductionQty'
  | 'wasteUnits'
  | 'stockLevel'
  | 'totalCost'
  | 'directIndirect'
  | 'costPerUnit'
  | 'sellingPrice'
  | 'chineseUnitCost'
  | 'chinesePriceCny'
  | 'innerBoxCost'
  | 'outerCartonCost'
  | 'unitsPerCarton'
  | 'rawMaterialsUnitCost'
  | 'cartonSharePerUnit'
  | 'productionOverheadPerUnit';

const COLUMN_PREFS_KEY = 'products_table_visible_columns_v1';

const PRODUCT_ICON_MAP: Record<string, LucideIcon> = {
  unfold_more: ChevronsUpDown,
  expand_less: ChevronUp,
  expand_more: ChevronDown,
  search: Search,
  close: X,
  delete: Trash2,
  done_all: BadgeCheck,
  remove_done: AlertCircle,
  inventory_2: Boxes,
  visibility: Eye,
  edit: Pencil,
  check_circle: BadgeCheck,
  error: AlertCircle,
  receipt_long: ReceiptText,
  refresh: Loader2,
  save: Save,
  add: CirclePlus,
  delete_forever: Trash2,
  drag_indicator: GripVertical,
  download: Download,
  warning: AlertTriangle,
  add_circle: CirclePlus,
  sync: RefreshCcw,
  warehouse: Warehouse,
  tune: SlidersHorizontal,
  call_split: Split,
  precision_manufacturing: Cog,
  delete_sweep: Trash2,
  sell: BadgeDollarSign,
  payments: Wallet,
  compare_arrows: ArrowLeftRight,
  price_check: BadgeCheck,
  local_shipping: Truck,
  currency_yuan: BadgeDollarSign,
  inventory: Package,
  package_2: Package,
  view_in_ar: Boxes,
};

const ProductIcon = ({
  name,
  ...iconProps
}: {
  name: string;
} & React.ComponentProps<'svg'>) => {
  const Icon = PRODUCT_ICON_MAP[name] ?? AlertCircle;
  return <Icon {...iconProps} />;
};

const DEFAULT_VISIBLE_COLUMNS: Record<ProductTableColumnKey, boolean> = {
  openingStock: true,
  totalProduction: true,
  monthlyProductionQty: true,
  wasteUnits: true,
  stockLevel: true,
  totalCost: true,
  directIndirect: true,
  costPerUnit: true,
  sellingPrice: true,
  chineseUnitCost: true,
  chinesePriceCny: true,
  innerBoxCost: true,
  outerCartonCost: false,
  unitsPerCarton: true,
  rawMaterialsUnitCost: true,
  cartonSharePerUnit: true,
  productionOverheadPerUnit: true,
};

function buildProductExportColumnOrder(
  prefs: Record<ProductTableColumnKey, boolean>,
  hasWarehouse: boolean,
  viewCosts: boolean,
  viewSellingPrice: boolean,
  extras: { rawMaterials: boolean; productionOverhead: boolean; calculatedUnit: boolean },
): string[] {
  const labels: string[] = ['الكود', 'اسم المنتج', 'الفئة', 'تارجت المتوقع تقارير (ث)'];
  if (hasWarehouse) {
    labels.push('المخزن', 'رصيد المخزن');
  }
  if (prefs.openingStock) labels.push('رصيد مفكك');
  if (prefs.totalProduction) labels.push('ما تم إنتاجه');
  if (prefs.monthlyProductionQty) labels.push('كمية الإنتاج (الشهر الحالي)');
  if (prefs.wasteUnits) labels.push('الهالك');
  if (prefs.stockLevel) labels.push('منتج تام');
  if (viewCosts) {
    if (prefs.totalCost) labels.push('إجمالي التكلفة');
    if (prefs.directIndirect) labels.push('مباشر / غير مباشر');
    if (prefs.costPerUnit) labels.push('تكلفة الوحدة');
    if (extras.rawMaterials && prefs.rawMaterialsUnitCost) {
      labels.push('تكلفة المواد الخام', 'تفاصيل المواد الخام');
    }
    if (prefs.chineseUnitCost) labels.push('تكلفة الوحدة الصينية');
    if (prefs.chinesePriceCny) labels.push('السعر باليوان');
    if (prefs.innerBoxCost) labels.push('تكلفة العلبة الداخلية');
    if (prefs.outerCartonCost) labels.push('سعر الكرتونة الخارجية (كامل)');
    if (prefs.cartonSharePerUnit) labels.push('نصيب الكرتونة الخارجية');
    if (prefs.unitsPerCarton) labels.push('وحدات/كرتونة');
    if (extras.productionOverhead && prefs.productionOverheadPerUnit) {
      labels.push('نصيب مصاريف الإنتاج (متوسط الشهر)');
    }
    if (extras.calculatedUnit) labels.push('إجمالي التكلفة المحسوبة (للوحدة)');
  }
  if (viewSellingPrice && prefs.sellingPrice) labels.push('سعر البيع');
  if (viewSellingPrice && prefs.sellingPrice && viewCosts && extras.calculatedUnit) {
    labels.push('هامش الربح (ج.م)', 'نسبة هامش الربح %');
  }
  return labels;
}

const shortProductName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[1]}`;
};

const emptyForm: Omit<FirestoreProduct, 'id'> = {
  name: '',
  model: '',
  code: '',
  openingBalance: 0,
  chineseUnitCost: 0,
  innerBoxCost: 0,
  outerCartonCost: 0,
  unitsPerCarton: 0,
  sellingPrice: 0,
  autoDeductComponentScrapFromDecomposed: false,
};

export const Products: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const location = useLocation();
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const createProduct = useAppStore((s) => s.createProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const deleteProduct = useAppStore((s) => s.deleteProduct);
  const productsLoading = useAppStore((s) => s.productsLoading);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);

  const storeTodayReports = useAppStore((s) => s.todayReports);
  const storeMonthlyReports = useAppStore((s) => s.monthlyReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);

  const { can } = usePermission();
  const canViewCosts = can('costs.view');
  const canViewSellingPrice = can('roles.manage');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'products'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const canImportFromPage = can('import') && pageControl.importEnabled;
  const navigate = useTenantNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkToggleSaving, setBulkToggleSaving] = useState(false);

  // Export customization
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'current_month'>('all');
  const [exportColumnPrefs, setExportColumnPrefs] = useState<Record<ProductTableColumnKey, boolean>>(() => ({
    ...DEFAULT_VISIBLE_COLUMNS,
  }));
  const [exportCostExtras, setExportCostExtras] = useState({
    rawMaterials: true,
    productionOverhead: true,
    calculatedUnit: true,
  });
  const [visibleColumns, setVisibleColumns] = useState<Record<ProductTableColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS;
      return { ...DEFAULT_VISIBLE_COLUMNS, ...(JSON.parse(raw) as Partial<Record<ProductTableColumnKey, boolean>>) };
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  // Import from Excel
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<StockItemBalance[]>([]);
  const [todayReportsScoped, setTodayReportsScoped] = useState<ProductionReport[]>([]);
  const [monthlyReportsScoped, setMonthlyReportsScoped] = useState<ProductionReport[]>([]);
  const [savedMonthlyCostsMap, setSavedMonthlyCostsMap] = useState<Record<string, ProductCostData>>({});
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [showWarehouseExportModal, setShowWarehouseExportModal] = useState(false);
  const [exportWarehouseId, setExportWarehouseId] = useState('');
  const [exportMonth, setExportMonth] = useState(getCurrentMonth());
  const [exportMonthReports, setExportMonthReports] = useState<ProductionReport[]>([]);
  const [exportMonthLoading, setExportMonthLoading] = useState(false);
  const [exportingProducts, setExportingProducts] = useState(false);

  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const [detailDrawerProductId, setDetailDrawerProductId] = useState<string | null>(null);
  const [drawerMaterials, setDrawerMaterials] = useState<ProductMaterial[]>([]);
  const [drawerMaterialsLoading, setDrawerMaterialsLoading] = useState(false);
  const [drawerShareBusy, setDrawerShareBusy] = useState(false);
  const productDetailPrintRef = useRef<HTMLDivElement>(null);

  const detailDrawerProduct = useMemo(
    () => (detailDrawerProductId ? products.find((p) => p.id === detailDrawerProductId) ?? null : null),
    [products, detailDrawerProductId],
  );

  const handlePrintProductDetail = useManagedPrint({
    contentRef: productDetailPrintRef,
    printSettings: printTemplate,
    documentTitle: detailDrawerProduct?.name ?? 'ملخص المنتج',
  });

  useEffect(() => {
    if (!detailDrawerProductId) {
      setDrawerMaterials([]);
      setDrawerMaterialsLoading(false);
      return;
    }
    let cancelled = false;
    setDrawerMaterialsLoading(true);
    void productMaterialService
      .getByProduct(detailDrawerProductId)
      .then((m) => {
        if (!cancelled) setDrawerMaterials(m);
      })
      .catch(() => {
        if (!cancelled) setDrawerMaterials([]);
      })
      .finally(() => {
        if (!cancelled) setDrawerMaterialsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailDrawerProductId]);

  // Sort & Pagination & Selection
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setCurrentPage(1);
  };

  /** إجمالي ما تم إنتاجه من التقارير (مثل صفحة تفاصيل المنتج)، وليس رصيد مخزن التام */
  const [lifetimeProducedByProductId, setLifetimeProducedByProductId] = useState<Record<string, number>>({});
  const [lifetimeProducedReady, setLifetimeProducedReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void reportService
      .getAll()
      .then((reports) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const r of reports) {
          const pid = String(r.productId || '').trim();
          if (!pid) continue;
          next[pid] = (next[pid] || 0) + Number(r.quantityProduced || 0);
        }
        setLifetimeProducedByProductId(next);
        setLifetimeProducedReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLifetimeProducedByProductId({});
          setLifetimeProducedReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productsForTable = useMemo((): Product[] => {
    return products.map((p) => ({
      ...p,
      totalProduction: lifetimeProducedReady ? (lifetimeProducedByProductId[p.id] ?? 0) : p.totalProduction,
    }));
  }, [products, lifetimeProducedByProductId, lifetimeProducedReady]);

  const filtered = useMemo(() => {
    return productsForTable.filter((p) => {
      const matchSearch =
        !search ||
        p.name.includes(search) ||
        p.code.toLowerCase().includes(search.toLowerCase());
      const matchCategory = !categoryFilter || p.category === categoryFilter;
      const matchStock = !stockFilter || p.stockStatus === stockFilter;
      return matchSearch && matchCategory && matchStock;
    });
  }, [productsForTable, search, categoryFilter, stockFilter]);

  const todayReports = todayReportsScoped.length > 0 ? todayReportsScoped : storeTodayReports;
  const monthlyReports = monthlyReportsScoped.length > 0 ? monthlyReportsScoped : storeMonthlyReports;
  const monthlyQtyByProductId = useMemo(() => {
    const next: Record<string, number> = {};
    for (const r of monthlyReports) {
      const pid = String(r.productId || '').trim();
      if (!pid) continue;
      next[pid] = (next[pid] || 0) + Number(r.quantityProduced || 0);
    }
    return next;
  }, [monthlyReports]);

  const exportMonthQtyByProductId = useMemo(() => {
    const next: Record<string, number> = {};
    for (const r of exportMonthReports) {
      const pid = String(r.productId || '').trim();
      if (!pid) continue;
      next[pid] = (next[pid] || 0) + Number(r.quantityProduced || 0);
    }
    return next;
  }, [exportMonthReports]);

  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [search, categoryFilter, stockFilter]);

  useEffect(() => {
    if (!showWarehouseExportModal || exportScope !== 'current_month') return;
    const monthKey = /^\d{4}-\d{2}$/.test(exportMonth) ? exportMonth : getCurrentMonth();
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const monthStart = `${monthKey}-01`;
    const monthEnd = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    let cancelled = false;
    setExportMonthLoading(true);
    void ensureProductionReportsForRange(monthStart, monthEnd, { maxAgeMs: 5 * 60 * 1000 })
      .then((rows) => {
        if (cancelled) return;
        setExportMonthReports(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setExportMonthReports([]);
      })
      .finally(() => {
        if (cancelled) return;
        setExportMonthLoading(false);
      });
    return () => { cancelled = true; };
  }, [showWarehouseExportModal, exportScope, exportMonth, ensureProductionReportsForRange]);

  const productWarehouseBalances = useMemo(() => {
    const keyOf = (warehouseId: string, productId: string) => `${warehouseId}__${productId}`;
    const map = new Map<string, number>();
    inventoryBalances
      .filter((row) => row.itemType === 'finished_good')
      .forEach((row) => {
        if (!row.warehouseId || !row.itemId) return;
        map.set(keyOf(row.warehouseId, row.itemId), Number(row.quantity || 0));
      });
    const getValue = (warehouseId?: string, productId?: string) =>
      warehouseId && productId ? Number(map.get(keyOf(warehouseId, productId)) || 0) : 0;
    return { getValue };
  }, [inventoryBalances]);

  const productCosts = useMemo(() => {
    if (!canViewCosts) return {} as Record<string, ProductCostData>;
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    const allReports = monthlyReports.length > 0 ? monthlyReports : todayReports;
    const result: Record<string, ProductCostData> = {};
    for (const p of products) {
      result[p.id] = savedMonthlyCostsMap[p.id]
        ?? buildProductAvgCost(p.id, allReports, hourlyRate, costCenters, costCenterValues, costAllocations);
    }
    return result;
  }, [canViewCosts, products, monthlyReports, todayReports, laborSettings, costCenters, costCenterValues, costAllocations, savedMonthlyCostsMap]);

  const [materialsByProductId, setMaterialsByProductId] = useState<Record<string, ProductMaterial[]>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = _rawProducts.map((p) => p.id).filter(Boolean) as string[];
    if (ids.length === 0) {
      setMaterialsByProductId({});
      return;
    }
    void Promise.all(
      ids.map(async (id) => {
        try {
          const mats = await productMaterialService.getByProduct(id);
          return { id, mats };
        } catch {
          return { id, mats: [] as ProductMaterial[] };
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, ProductMaterial[]> = {};
      for (const { id, mats } of rows) next[id] = mats;
      setMaterialsByProductId(next);
    });
    return () => {
      cancelled = true;
    };
  }, [_rawProducts]);

  const costBreakdownByProductId = useMemo(() => {
    const map = new Map<string, ProductCostBreakdown>();
    for (const raw of _rawProducts) {
      if (!raw.id) continue;
      const mats = materialsByProductId[raw.id] ?? [];
      const cpu = productCosts[raw.id]?.costPerUnit ?? 0;
      map.set(raw.id, calculateProductCostBreakdown(raw, mats, cpu));
    }
    return map;
  }, [_rawProducts, materialsByProductId, productCosts]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0;
      if (sortKey === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name, 'ar') : b.name.localeCompare(a.name, 'ar');
      }
      if (sortKey === 'code') {
        return sortDir === 'asc' ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      if (sortKey === 'monthlyProductionQty') {
        va = monthlyQtyByProductId[a.id] ?? 0;
        vb = monthlyQtyByProductId[b.id] ?? 0;
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (vb > va ? 1 : -1);
      }
      const bdA = costBreakdownByProductId.get(a.id);
      const bdB = costBreakdownByProductId.get(b.id);
      if (sortKey === 'chineseUnitCost' || sortKey === 'innerBoxCost' || sortKey === 'outerCartonCost') {
        va = bdA ? (bdA as any)[sortKey] ?? 0 : 0;
        vb = bdB ? (bdB as any)[sortKey] ?? 0 : 0;
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (vb > va ? 1 : -1);
      }
      if (sortKey === 'rawMaterialsUnitCost') {
        va = bdA?.rawMaterialCost ?? 0;
        vb = bdB?.rawMaterialCost ?? 0;
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (vb > va ? 1 : -1);
      }
      if (sortKey === 'cartonSharePerUnit') {
        va = bdA?.cartonShare ?? 0;
        vb = bdB?.cartonShare ?? 0;
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (vb > va ? 1 : -1);
      }
      if (sortKey === 'productionOverheadPerUnit') {
        va = bdA?.productionOverheadShare ?? 0;
        vb = bdB?.productionOverheadShare ?? 0;
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (vb > va ? 1 : -1);
      }
      va = (a as any)[sortKey] ?? 0;
      vb = (b as any)[sortKey] ?? 0;
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (vb > va ? 1 : -1);
    });
  }, [filtered, sortKey, sortDir, monthlyQtyByProductId, costBreakdownByProductId]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  );

  const allPageSelected = paginated.length > 0 && paginated.every((p) => selectedIds.has(p.id));
  const somePageSelected = !allPageSelected && paginated.some((p) => selectedIds.has(p.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) paginated.forEach((p) => next.delete(p.id));
      else paginated.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  useEffect(() => {
    void (async () => {
      try {
        const rows: StockItemBalance[] = [];
        let cursor: any = null;
        for (let page = 0; page < 5; page += 1) {
          const res = await stockService.getBalancesPaged({cursor });
          rows.push(...res.items);
          if (!res.hasMore || !res.nextCursor) break;
          cursor = res.nextCursor;
        }
        setInventoryBalances(rows);
      } catch {
        setInventoryBalances([]);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWarehouses = async () => {
      try {
        const rows = await warehouseService.getAll();
        if (cancelled) return;
        setWarehouses(rows.filter((w) => w.isActive !== false));
      } catch {
        if (cancelled) return;
        setWarehouses([]);
      }
    };
    void loadWarehouses();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const today = new Date().toISOString().slice(0, 10);
    const maxAgeMs = 5 * 60 * 1000;
    const kToday = getProductionReportsRangeCacheKey(today, today);
    const kMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
    const cache = useAppStore.getState().productionReportsRangeCache;
    if (cache[kToday]) setTodayReportsScoped(cache[kToday].rows);
    if (cache[kMonth]) setMonthlyReportsScoped(cache[kMonth].rows);
    void Promise.all([
      ensureProductionReportsForRange(today, today, { maxAgeMs }),
      ensureProductionReportsForRange(monthStart, monthEnd, { maxAgeMs }),
    ])
      .then(([todayRows, monthRows]) => {
        if (cancelled) return;
        setTodayReportsScoped(todayRows);
        setMonthlyReportsScoped(monthRows);
      })
      .catch(() => {
        if (cancelled) return;
        setTodayReportsScoped([]);
        setMonthlyReportsScoped([]);
      });
    return () => { cancelled = true; };
  }, [ensureProductionReportsForRange]);

  useEffect(() => {
    let cancelled = false;
    const loadSavedMonthlyCosts = async () => {
      if (!canViewCosts) {
        if (!cancelled) setSavedMonthlyCostsMap({});
        return;
      }
      try {
        const rows = await monthlyProductionCostService.getByMonth(getCurrentMonth());
        if (cancelled) return;
        const next = rows.reduce<Record<string, ProductCostData>>((acc, row) => {
          const qty = Number(row.totalProducedQty || 0);
          const labor = Number(row.directCost || 0);
          const indirect = Number(row.indirectCost || 0);
          const total = Number(row.totalProductionCost || (labor + indirect));
          acc[row.productId] = {
            laborCost: labor,
            indirectCost: indirect,
            totalCost: total,
            quantityProduced: qty,
            costPerUnit: qty > 0 ? (total / qty) : Number(row.averageUnitCost || 0),
          };
          return acc;
        }, {});
        setSavedMonthlyCostsMap(next);
      } catch {
        if (!cancelled) setSavedMonthlyCostsMap({});
      }
    };
    void loadSavedMonthlyCosts();
    return () => { cancelled = true; };
  }, [canViewCosts]);

  const monthExportProductCount = useMemo(
    () => productsForTable.filter((p) => (exportMonthQtyByProductId[p.id] ?? 0) > 0).length,
    [productsForTable, exportMonthQtyByProductId],
  );

  const openCreate = () => {
    openModal(MODAL_KEYS.PRODUCTS_CREATE, { source: 'products.page' });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;
    if (!can('products.create')) return;
    openCreate();
    navigate('/products', { replace: true });
  }, [location.search, can, navigate]);

  useEffect(() => {
    const editProductId = (location.state as { editProductId?: string } | null)?.editProductId;
    if (!editProductId) return;
    openEdit(editProductId);
    navigate('/products', { replace: true, state: null });
  }, [location.state, navigate, products, _rawProducts]);

  const openEdit = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const raw = _rawProducts.find((p) => p.id === id);
    setEditId(id);
    setForm({
      name: product.name,
      model: product.category,
      code: product.code,
      openingBalance: product.openingStock,
      chineseUnitCost: raw?.chineseUnitCost ?? 0,
      innerBoxCost: raw?.innerBoxCost ?? 0,
      outerCartonCost: raw?.outerCartonCost ?? 0,
      unitsPerCarton: raw?.unitsPerCarton ?? 0,
      sellingPrice: raw?.sellingPrice ?? 0,
      autoDeductComponentScrapFromDecomposed: raw?.autoDeductComponentScrapFromDecomposed === true,
      routingTargetUnitSeconds:
        raw?.routingTargetUnitSeconds != null && Number(raw.routingTargetUnitSeconds) > 0
          ? Math.round(Number(raw.routingTargetUnitSeconds))
          : undefined,
    });
    setSaveMsg(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    if (!form.model) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      if (editId) {
        const t = form.routingTargetUnitSeconds;
        const hasTarget = typeof t === 'number' && Number.isFinite(t) && t > 0;
        const payload: Record<string, unknown> = { ...form };
        payload.routingTargetUnitSeconds = hasTarget ? Math.round(t) : deleteField();
        await updateProduct(editId, payload as Partial<FirestoreProduct>);
        setSaveMsg({ type: 'success', text: 'تم حفظ تعديلات المنتج بنجاح' });
      } else {
        const createData: Omit<FirestoreProduct, 'id'> = { ...form };
        if (
          typeof createData.routingTargetUnitSeconds !== 'number' ||
          !Number.isFinite(createData.routingTargetUnitSeconds) ||
          createData.routingTargetUnitSeconds <= 0
        ) {
          delete (createData as { routingTargetUnitSeconds?: number }).routingTargetUnitSeconds;
        } else {
          createData.routingTargetUnitSeconds = Math.round(createData.routingTargetUnitSeconds);
        }
        await createProduct(createData);
        setSaveMsg({ type: 'success', text: 'تم إضافة المنتج بنجاح' });
        setForm(emptyForm);
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر حفظ المنتج. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    setDeleteConfirmId(null);
  };

  // â”€â”€ Import from Excel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const fallbackCategoryOptions = useMemo(() => {
    const unique = new Set<string>();
    _rawProducts.forEach((product) => {
      const name = String(product.model || '').trim();
      if (name) unique.add(name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [_rawProducts]);
  const mergedCategoryOptions = useMemo(() => {
    const unique = new Set<string>([...categoryOptions, ...fallbackCategoryOptions]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [categoryOptions, fallbackCategoryOptions]);

  useEffect(() => {
    let cancelled = false;
    const loadCategoryOptions = async () => {
      try {
        await categoryService.seedFromProductsModel();
        const rows = await categoryService.getByType('product');
        if (cancelled) return;
        const names = rows
          .filter((row) => row.isActive !== false)
          .map((row) => String(row.name || '').trim())
          .filter(Boolean);
        setCategoryOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'ar')));
      } catch {
        if (cancelled) return;
        setCategoryOptions([]);
      }
    };
    void loadCategoryOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportFileName(file.name);
    setImportParsing(true);
    setShowImportModal(true);
    setImportResult(null);
    try {
      const result = await parseProductsExcel(file, _rawProducts);
      setImportResult(result);
    } catch {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, newCount: 0, updateCount: 0 });
    } finally {
      setImportParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;
    const jobId = addJob({
      fileName: importFileName || 'products.xlsx',
      jobType: 'Products Import',
      totalRows: validRows.length,
      startedBy: userDisplayName || 'Current User',
    });

    setImportSaving(true);
    setImportProgress({ done: 0, total: validRows.length });
    startJob(jobId, 'Saving to database...');
    // Close preview immediately; import continues in background jobs panel.
    setShowImportModal(false);
    setImportResult(null);
    setImportFileName('');

    const syncImportedMaterials = async (productId: string, rowMaterials: ProductImportResult['rows'][number]['materials']) => {
      if (!rowMaterials || rowMaterials.length === 0) return;
      const existing = await productMaterialService.getByProduct(productId);
      await Promise.all(existing.map((m) => (m.id ? productMaterialService.delete(m.id) : Promise.resolve())));
      for (const mat of rowMaterials) {
        await productMaterialService.create({
          productId,
          materialName: mat.materialName,
          quantityUsed: mat.quantityUsed,
          unitCost: mat.unitCost,
        });
      }
    };

    let done = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        let productId: string | null = null;
        if (row.action === 'update' && row.matchedId) {
          const existingProduct = _rawProducts.find((p) => p.id === row.matchedId);
          if (!existingProduct) {
            throw new Error('Existing product not found for update');
          }
          await updateProduct(row.matchedId, toProductDataWithExisting(row, existingProduct));
          productId = row.matchedId;
        } else {
          productId = await createProduct(toProductData(row));
        }
        if (productId) {
          await syncImportedMaterials(productId, row.materials);
        }
      } catch { failed++; }
      done++;
      setImportProgress({ done, total: validRows.length });
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: validRows.length,
        statusText: 'Saving to database...',
        status: 'processing',
      });
    }

    const addedRows = Math.max(0, done - failed);
    if (addedRows === 0 && failed > 0) {
      failJob(jobId, 'All rows failed during save', 'Failed');
    } else {
      completeJob(jobId, {
        addedRows,
        failedRows: failed,
        statusText: 'Completed',
      });
    }
    setImportSaving(false);
  };

  const doExportProducts = async (warehouseId?: string) => {
    setExportingProducts(true);
    try {
    const prefs = exportColumnPrefs;
    const extras = exportCostExtras;
    const stock =
      prefs.openingStock ||
      prefs.totalProduction ||
      prefs.monthlyProductionQty ||
      prefs.wasteUnits ||
      prefs.stockLevel;
    const productCostsOpt =
      canViewCosts &&
      (extras.rawMaterials ||
        extras.calculatedUnit ||
        prefs.chineseUnitCost ||
        prefs.innerBoxCost ||
        prefs.outerCartonCost ||
        prefs.cartonSharePerUnit ||
        prefs.rawMaterialsUnitCost ||
        prefs.unitsPerCarton ||
        prefs.chinesePriceCny);
    const manufacturingCosts = canViewCosts && extras.productionOverhead && prefs.productionOverheadPerUnit;
    const opts: ProductExportOptions = {
      stock,
      productCosts: !!productCostsOpt,
      manufacturingCosts,
      sellingPrice: canViewSellingPrice && prefs.sellingPrice,
      profitMargin: canViewSellingPrice && prefs.sellingPrice && canViewCosts && extras.calculatedUnit,
      chinesePriceCny: prefs.chinesePriceCny,
    };

    const materialsByProduct = new Map<string, ProductMaterial[]>();
    await Promise.all(_rawProducts.map(async (rp) => {
      if (!rp.id) return;
      try {
        const mats = await productMaterialService.getByProduct(rp.id);
        materialsByProduct.set(rp.id, mats);
      } catch {
        materialsByProduct.set(rp.id, []);
      }
    }));

    const selectedWarehouse = warehouseId
      ? warehouses.find((w) => w.id === warehouseId)
      : undefined;
    const monthlyQtyMap = exportScope === 'current_month' ? exportMonthQtyByProductId : monthlyQtyByProductId;
    const sourceProducts =
      exportScope === 'current_month'
        ? productsForTable.filter((p) => (monthlyQtyMap[p.id] ?? 0) > 0)
        : productsForTable;

    const data = sourceProducts.map((p) => {
      const warehouseStock = warehouseId
        ? productWarehouseBalances.getValue(warehouseId, p.id)
        : undefined;
      const productForExport = warehouseId
        ? {
            ...p,
            stockLevel: Number(warehouseStock || 0),
            stockStatus: (Number(warehouseStock || 0) > 0 ? 'available' : 'out') as 'available' | 'out',
          }
        : p;
      const pid = productForExport.id;
      const displayBalances = {
        decomposed: productWarehouseBalances.getValue(planSettings?.decomposedSourceWarehouseId, pid),
        waste: productWarehouseBalances.getValue(planSettings?.wasteReceiveWarehouseId, pid),
        finished: productWarehouseBalances.getValue(planSettings?.finalProductWarehouseId, pid),
      };
      const monthlyCostRow = canViewCosts
        ? {
            laborCost: productCosts[pid]?.laborCost ?? 0,
            indirectCost: productCosts[pid]?.indirectCost ?? 0,
            totalCost: productCosts[pid]?.totalCost ?? 0,
            costPerUnit: productCosts[pid]?.costPerUnit ?? 0,
          }
        : null;
      const raw = _rawProducts.find((r) => r.id === p.id);
      if (!raw) {
        return {
          product: productForExport,
          raw: { name: p.name, model: p.category, code: p.code, openingBalance: p.openingStock },
          costBreakdown: null,
          rawMaterialsDetails: '—',
          warehouseName: selectedWarehouse?.name,
          warehouseStock,
          displayBalances,
          monthlyProductionQty: monthlyQtyMap[p.id] ?? 0,
          monthlyCost: monthlyCostRow,
        };
      }

      const materials = raw.id ? (materialsByProduct.get(raw.id) ?? []) : [];
      const breakdown = calculateProductCostBreakdown(raw, materials, productCosts[p.id]?.costPerUnit ?? 0);
      const rawMaterialsDetails = materials.length > 0
        ? materials
          .map((m) => `${m.materialName} (${m.quantityUsed} أ— ${formatCost(m.unitCost)} = ${formatCost((m.quantityUsed || 0) * (m.unitCost || 0))})`)
          .join(' | ')
        : '—';

      return {
        product: productForExport,
        raw,
        costBreakdown: breakdown,
        rawMaterialsDetails,
        warehouseName: selectedWarehouse?.name,
        warehouseStock,
        displayBalances,
        monthlyProductionQty: monthlyQtyMap[p.id] ?? 0,
        monthlyCost: monthlyCostRow,
      };
    });

    const columnLabels = buildProductExportColumnOrder(
      prefs,
      !!selectedWarehouse?.name,
      canViewCosts,
      canViewSellingPrice,
      extras,
    );

    const date = new Date().toISOString().slice(0, 10);
    const monthKey = exportScope === 'current_month' ? exportMonth : getCurrentMonth();
    const fileMeta =
      exportScope === 'current_month'
        ? { sheetName: `منتجات ${monthKey}`, fileBaseName: `المنتجات-شهر-${monthKey}` }
        : { sheetName: 'المنتجات', fileBaseName: `المنتجات-${date}` };

    exportAllProducts(
      data,
      canViewCosts,
      canViewSellingPrice,
      opts,
      laborSettings?.cnyToEgpRate ?? 0,
      columnLabels,
      fileMeta,
    );
    } finally {
      setExportingProducts(false);
    }
  };

  const toggleColumn = (key: ProductTableColumnKey, checked: boolean) => {
    const next = { ...visibleColumns, [key]: checked };
    setVisibleColumns(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(next));
    }
  };

  const toggleExportColumn = (key: ProductTableColumnKey, checked: boolean) => {
    setExportColumnPrefs((prev) => ({ ...prev, [key]: checked }));
  };

  const SortIcon = ({ col }: { col: string }) => (
    <ProductIcon
      name={sortKey !== col ? 'unfold_more' : sortDir === 'asc' ? 'expand_less' : 'expand_more'}
      style={{ fontSize: 13, verticalAlign: 'middle', marginInlineStart: 2, opacity: sortKey === col ? 1 : 0.35 }}
    />
  );

  const handleShareProductDetail = async () => {
    const el = productDetailPrintRef.current;
    if (!el || !detailDrawerProduct) return;
    setDrawerShareBusy(true);
    try {
      await waitForExportPaint(150);
      await shareToWhatsApp(
        el,
        `product-${detailDrawerProduct.code || detailDrawerProduct.id}`,
        { width: 440, windowWidth: 480 },
      );
    } finally {
      setDrawerShareBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />

      {/* â”€â”€ Page Header â”€â”€ */}
      <PageHeader
        title="إدارة المنتجات"
        subtitle="قائمة تفصيلية بكافة الأصناف والمخزون وحالة الإنتاج"
        icon="inventory_2"
        primaryAction={can('products.create') ? {
          label: 'منتج جديد',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.PRODUCTS_CREATE,
        } : undefined}
        moreActions={[
          {
            label: 'تصدير Excel',
            icon: 'table_chart',
            group: 'تصدير',
            hidden: !canExportFromPage || products.length === 0,
            onClick: () => {
              setExportScope('all');
              setExportColumnPrefs({ ...visibleColumns });
              setShowWarehouseExportModal(true);
            },
          },
          {
            label: 'تصدير منتجات الشهر (Excel)',
            icon: 'table_chart',
            group: 'تصدير',
            hidden: !canExportFromPage || products.length === 0,
            onClick: () => {
              setExportScope('current_month');
              setExportColumnPrefs({ ...visibleColumns });
              setShowWarehouseExportModal(true);
            },
          },
          {
            label: 'إدارة الأعمدة',
            icon: 'view_column',
            group: 'تصدير',
            hidden: !canExportFromPage,
            onClick: () => setShowColumnsModal(true),
          },
          {
            label: 'تحميل القالب',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: downloadProductsTemplate,
          },
          {
            label: 'رفع Excel',
            icon: 'upload_file',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: () => fileInputRef.current?.click(),
          },
        ]}
      />

      {/* â”€â”€ Search & Filters â”€â”€ */}
      <SmartFilterBar
        searchPlaceholder="ابحث بالاسم أو الكود..."
        searchValue={search}
        onSearchChange={setSearch}
        quickFilters={[
          {
            key: 'stock',
            placeholder: 'حالة المخزون',
            options: [
              { value: 'available', label: 'متوفر' },
              { value: 'low', label: 'منخفض' },
              { value: 'out', label: 'نفد' },
            ],
          },
        ]}
        quickFilterValues={{ stock: stockFilter || 'all' }}
        onQuickFilterChange={(_, value) => setStockFilter(value === 'all' ? '' : value)}
        advancedFilters={[
          {
            key: 'category',
            label: 'الفئة',
            placeholder: 'كل الفئات',
            options: mergedCategoryOptions.map((category) => ({ value: category, label: category })),
          },
        ]}
        advancedFilterValues={{ category: categoryFilter || 'all' }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'category') setCategoryFilter(value === 'all' ? '' : value);
        }}
        onApply={() => undefined}
        applyLabel="عرض"
      />

      {/* Table */}
      <Card className="!p-0 border-none overflow-hidden ">
        {/* Bulk bar */}
        {selectedIds.size > 0 && (
          <div className="px-5 py-3 bg-primary/5 border-b border-primary/20 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-primary">{selectedIds.size} منتج محدد</span>
            {can('products.delete') && (
              <button
                className="btn btn-danger btn-sm gap-1"
                onClick={() => {
                  if (!window.confirm(`هل تريد حذف ${selectedIds.size} منتج؟`)) return;
                  Promise.all([...selectedIds].map((id) => deleteProduct(id))).then(() => setSelectedIds(new Set()));
                }}
              >
                <ProductIcon name="delete" className="text-[15px]" />
                حذف المحدد
              </button>
            )}
            {can('products.edit') && (
              <>
                <button
                  className="btn btn-secondary btn-sm gap-1"
                  disabled={bulkToggleSaving}
                  onClick={async () => {
                    if (bulkToggleSaving) return;
                    setBulkToggleSaving(true);
                    try {
                      await Promise.all(
                        [...selectedIds].map((id) =>
                          updateProduct(id, { autoDeductComponentScrapFromDecomposed: true }),
                        ),
                      );
                      setSaveMsg({ type: 'success', text: 'تم تفعيل خصم هالك المكونات تلقائياً للمنتجات المحددة' });
                    } catch {
                      setSaveMsg({ type: 'error', text: 'تعذر تنفيذ التفعيل الجماعي حالياً' });
                    } finally {
                      setBulkToggleSaving(false);
                    }
                  }}
                >
                  <ProductIcon name="done_all" className="text-[15px]" />
                  تفعيل خصم الهالك
                </button>
                <button
                  className="btn btn-secondary btn-sm gap-1"
                  disabled={bulkToggleSaving}
                  onClick={async () => {
                    if (bulkToggleSaving) return;
                    setBulkToggleSaving(true);
                    try {
                      await Promise.all(
                        [...selectedIds].map((id) =>
                          updateProduct(id, { autoDeductComponentScrapFromDecomposed: false }),
                        ),
                      );
                      setSaveMsg({ type: 'success', text: 'تم تعطيل خصم هالك المكونات للمنتجات المحددة' });
                    } catch {
                      setSaveMsg({ type: 'error', text: 'تعذر تنفيذ التعطيل الجماعي حالياً' });
                    } finally {
                      setBulkToggleSaving(false);
                    }
                  }}
                >
                  <ProductIcon name="remove_done" className="text-[15px]" />
                  تعطيل خصم الهالك
                </button>
              </>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
              <ProductIcon name="close" className="text-[15px]" />
              إلغاء التحديد
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="erp-table w-full text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th w-10 text-center">
                  <input type="checkbox" checked={allPageSelected} ref={(el) => { if (el) el.indeterminate = somePageSelected; }} onChange={toggleSelectAll} className="cursor-pointer" />
                </th>
                <th className="erp-th cursor-pointer select-none" onClick={() => handleSort('name')}>المنتج <SortIcon col="name" /></th>
                {visibleColumns.openingStock && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('openingStock')}>رصيد مفكك <SortIcon col="openingStock" /></th>}
                {visibleColumns.totalProduction && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('totalProduction')}>ما تم إنتاجه <SortIcon col="totalProduction" /></th>}
                {visibleColumns.monthlyProductionQty && (
                  <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('monthlyProductionQty')}>
                    إنتاج الشهر <SortIcon col="monthlyProductionQty" />
                  </th>
                )}
                {visibleColumns.wasteUnits && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('wasteUnits')}>الهالك <SortIcon col="wasteUnits" /></th>}
                {visibleColumns.stockLevel && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('stockLevel')}>منتج تام <SortIcon col="stockLevel" /></th>}
                {canViewSellingPrice && visibleColumns.sellingPrice && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('sellingPrice')}>سعر البيع <SortIcon col="sellingPrice" /></th>}
                {canViewCosts && (
                  <>
                    {visibleColumns.totalCost && <th className="erp-th text-center">إجمالي التكلفة</th>}
                    {visibleColumns.directIndirect && <th className="erp-th text-center">مباشر / غير مباشر</th>}
                    {visibleColumns.costPerUnit && <th className="erp-th text-center">تكلفة الوحدة</th>}
                    {visibleColumns.chineseUnitCost && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('chineseUnitCost')}>تكلفة الوحدة الصينية <SortIcon col="chineseUnitCost" /></th>}
                    {visibleColumns.chinesePriceCny && <th className="erp-th text-center">السعر باليوان</th>}
                    {visibleColumns.innerBoxCost && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('innerBoxCost')}>العلبة الداخلية <SortIcon col="innerBoxCost" /></th>}
                    {visibleColumns.rawMaterialsUnitCost && (
                      <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('rawMaterialsUnitCost')}>
                        المواد الخام <SortIcon col="rawMaterialsUnitCost" />
                      </th>
                    )}
                    {visibleColumns.cartonSharePerUnit && (
                      <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('cartonSharePerUnit')}>
                        نصيب الكرتونة الخارجية <SortIcon col="cartonSharePerUnit" />
                      </th>
                    )}
                    {visibleColumns.productionOverheadPerUnit && (
                      <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('productionOverheadPerUnit')}>
                        نصيب مصاريف الإنتاج (متوسط الشهر) <SortIcon col="productionOverheadPerUnit" />
                      </th>
                    )}
                    {visibleColumns.outerCartonCost && (
                      <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('outerCartonCost')}>
                        سعر الكرتونة (كامل) <SortIcon col="outerCartonCost" />
                      </th>
                    )}
                    {visibleColumns.unitsPerCarton && <th className="erp-th text-center cursor-pointer select-none" onClick={() => handleSort('unitsPerCarton')}>عدد الوحدات/كرتونة <SortIcon col="unitsPerCarton" /></th>}
                  </>
                )}
                <th className="erp-th text-center w-28">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={99} className="px-6 py-16 text-center text-slate-400">
                    <ProductIcon name="inventory_2" className="text-5xl mb-3 block opacity-30" />
                    <p className="font-bold text-lg">لا توجد منتجات{search || categoryFilter || stockFilter ? ' مطابقة للبحث' : ' بعد'}</p>
                    <p className="text-sm mt-1">
                      {can("products.create")
                        ? 'اضغط "إضافة منتج جديد" لإضافة أول منتج'
                        : 'لا توجد منتجات لعرضها حالياً'}
                    </p>
                  </td>
                </tr>
              )}
              {paginated.map((product) => {
                const decomposedBalance = productWarehouseBalances.getValue(planSettings?.decomposedSourceWarehouseId, product.id);
                const wasteBalance = productWarehouseBalances.getValue(planSettings?.wasteReceiveWarehouseId, product.id);
                const finalBalance = productWarehouseBalances.getValue(planSettings?.finalProductWarehouseId, product.id);
                return (
                <tr
                  key={product.id}
                  className={`cursor-pointer hover:bg-[#f8f9fa]/50 transition-colors group${selectedIds.has(product.id) ? ' bg-primary/5' : ''}`}
                  onClick={() => setDetailDrawerProductId(product.id)}
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleRow(product.id)} className="cursor-pointer" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                        <ProductIcon name="inventory_2" className="text-primary text-lg" />
                      </div>
                      <div className="min-w-0">
                        <span
                          className="font-bold text-sm text-[var(--color-text)] hover:text-primary cursor-pointer transition-colors block truncate max-w-[280px]"
                          title={product.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/products/${product.id}`);
                          }}
                        >
                          {shortProductName(product.name)}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[11px] text-slate-400">{product.code}</span>
                          {product.category && (
                            <Badge variant="neutral">{product.category}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  {visibleColumns.openingStock && <td className="px-4 py-4 text-center font-bold text-[var(--color-text)] tabular-nums">{formatNumber(decomposedBalance)}</td>}
                  {visibleColumns.totalProduction && <td className="px-4 py-4 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-[var(--border-radius-sm)] bg-emerald-50 text-emerald-600 text-sm font-bold tabular-nums">
                      {formatNumber(product.totalProduction)}
                    </span>
                  </td>}
                  {visibleColumns.monthlyProductionQty && (
                    <td className="px-4 py-4 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-[var(--border-radius-sm)] bg-sky-50 text-sky-700 text-sm font-bold tabular-nums">
                        {formatNumber(monthlyQtyByProductId[product.id] ?? 0)}
                      </span>
                    </td>
                  )}
                  {visibleColumns.wasteUnits && <td className="px-4 py-4 text-center">
                    {wasteBalance > 0 ? (
                      <span className="text-sm font-bold text-rose-500 tabular-nums">{formatNumber(wasteBalance)}</span>
                    ) : (
                      <span className="text-sm text-[var(--color-text-muted)]">0</span>
                    )}
                  </td>}
                  {visibleColumns.stockLevel && <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-bold tabular-nums ${finalBalance > 100 ? 'text-[var(--color-text)]' : finalBalance > 0 ? 'text-amber-600' : 'text-rose-500'}`}>
                      {formatNumber(finalBalance)}
                    </span>
                  </td>}
                  {canViewSellingPrice && visibleColumns.sellingPrice && (
                    <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                      {formatCost((_rawProducts.find((r) => r.id === product.id)?.sellingPrice ?? 0))} ج.م
                    </td>
                  )}
                  {canViewCosts && (() => {
                    const c = productCosts[product.id];
                    const hasCost = c && c.totalCost > 0;
                    const raw = _rawProducts.find((r) => r.id === product.id);
                    const cnyRate = laborSettings?.cnyToEgpRate ?? 0;
                    const bd = costBreakdownByProductId.get(product.id);
                    const chineseUnitCost = bd?.chineseUnitCost ?? 0;
                    return (
                      <>
                        {visibleColumns.totalCost && <td className="px-4 py-4 text-center">
                          {hasCost ? (
                            <span className="text-sm font-bold text-amber-700 tabular-nums">{formatCost(c.totalCost)} <span className="text-[10px] font-medium opacity-70">ج.م</span></span>
                          ) : (
                            <span className="text-sm text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>}
                        {visibleColumns.directIndirect && <td className="px-4 py-4 text-center">
                          {hasCost ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs tabular-nums text-blue-600 font-bold">{formatCost(c.laborCost)} <span className="text-[10px] font-normal opacity-70">مباشر</span></span>
                              <span className="text-xs tabular-nums text-[var(--color-text-muted)] font-bold">{formatCost(c.indirectCost)} <span className="text-[10px] font-normal opacity-70">غ.مباشر</span></span>
                            </div>
                          ) : (
                            <span className="text-sm text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>}
                        {visibleColumns.costPerUnit && <td className="px-4 py-4 text-center">
                          {hasCost ? (
                            <span className="inline-block px-2.5 py-1 rounded-[var(--border-radius-sm)] bg-primary/5 text-primary text-sm font-bold tabular-nums ring-1 ring-primary/10">
                              {formatCost(c.costPerUnit)} <span className="text-[10px] font-medium opacity-70">ج.م</span>
                            </span>
                          ) : (
                            <span className="text-sm text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>}
                        {visibleColumns.chineseUnitCost && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {formatCost(chineseUnitCost)} ج.م
                          </td>
                        )}
                        {visibleColumns.chinesePriceCny && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {cnyRate > 0 ? `¥ ${formatCost(chineseUnitCost / cnyRate)}` : '—'}
                          </td>
                        )}
                        {visibleColumns.innerBoxCost && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {formatCost(bd?.innerBoxCost ?? raw?.innerBoxCost ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.rawMaterialsUnitCost && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {formatCost(bd?.rawMaterialCost ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.cartonSharePerUnit && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {formatCost(bd?.cartonShare ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.productionOverheadPerUnit && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {formatCost(bd?.productionOverheadShare ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.outerCartonCost && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {formatCost(bd?.outerCartonCost ?? raw?.outerCartonCost ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.unitsPerCarton && (
                          <td className="px-4 py-4 text-center text-sm font-bold tabular-nums">
                            {bd?.unitsPerCarton ?? raw?.unitsPerCarton ?? 0}
                          </td>
                        )}
                      </>
                    );
                  })()}
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setDetailDrawerProductId(product.id)}
                        className="p-1.5 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all"
                        title="ملخص سريع"
                      >
                        <ProductIcon name="visibility" className="text-[18px]" />
                      </button>
                      {can("products.edit") && (
                        <button type="button" onClick={() => openEdit(product.id)} className="p-1.5 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all" title="تعديل">
                          <ProductIcon name="edit" className="text-[18px]" />
                        </button>
                      )}
                      {can("products.delete") && (
                        <button type="button" onClick={() => setDeleteConfirmId(product.id)} className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] transition-all" title="حذف">
                          <ProductIcon name="delete" className="text-[18px]" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        {/* Footer: count + pagination */}
        <div className="px-5 py-3 bg-[#f8f9fa]/50 border-t border-[var(--color-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-[var(--color-text-muted)] font-bold">
            {sorted.length > 0
              ? `صفحة ${currentPage} من ${totalPages} — إجمالي ${sorted.length} منتج`
              : 'لا توجد منتجات'}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>آ«</button>
              <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                const page = start + i;
                return page <= totalPages ? (
                  <button key={page} className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCurrentPage(page)}>{page}</button>
                ) : null;
              })}
              <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>›</button>
              <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>آ»</button>
            </div>
          )}
        </div>
      </Card>

      {detailDrawerProductId && detailDrawerProduct && (() => {
        const p = detailDrawerProduct;
        const raw = _rawProducts.find((r) => r.id === p.id);
        const c = productCosts[p.id];
        const hasMonthlyCost =
          !!c && (c.totalCost > 0 || c.quantityProduced > 0 || c.costPerUnit > 0);
        const decomposedBal = productWarehouseBalances.getValue(planSettings?.decomposedSourceWarehouseId, p.id);
        const finishedWhBal = productWarehouseBalances.getValue(planSettings?.finishedReceiveWarehouseId, p.id);
        const breakdown =
          raw && canViewCosts
            ? calculateProductCostBreakdown(raw, drawerMaterials, c?.costPerUnit ?? 0)
            : null;
        const monthKey = getCurrentMonth();
        const activeThisMonth = (c?.quantityProduced ?? 0) > 0;
        const selling = raw?.sellingPrice ?? 0;
        return (
          <>
            <div
              className="fixed inset-0 bg-black/35 z-[60] mt-0"
              onClick={() => setDetailDrawerProductId(null)}
              aria-hidden
            />
            <aside
              className="fixed top-0 right-0 h-screen w-[min(460px,96vw)] bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-2xl z-[61] overflow-y-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-start justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <h3 className="font-black text-[var(--color-text)] text-sm leading-snug">{p.name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">{p.code}{p.category ? ` آ· ${p.category}` : ''}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">الشهر الحالي: {monthKey}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="طباعة الملخص"
                    onClick={() => handlePrintProductDetail()}
                    className="p-2 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:bg-primary/10 hover:text-primary"
                  >
                    <Printer className="size-[18px]" />
                  </button>
                  <button
                    type="button"
                    title="مشاركة كصورة"
                    disabled={drawerShareBusy}
                    onClick={() => void handleShareProductDetail()}
                    className="p-2 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  >
                    {drawerShareBusy ? <Loader2 className="size-[18px] animate-spin" /> : <Share2 className="size-[18px]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailDrawerProductId(null)}
                    className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-[var(--border-radius-base)]"
                    title="إغلاق"
                  >
                    <ProductIcon name="close" />
                  </button>
                </div>
              </div>

              <div className="p-4 flex-1 space-y-4">
                <div
                  ref={productDetailPrintRef}
                  className="arabic-export-root space-y-4 text-sm bg-[var(--color-card)]"
                >
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 space-y-3">
                    <p className="text-xs font-bold text-[var(--color-text-muted)]">ملخص سريع</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-[var(--color-text-muted)] block mb-0.5">رصيد مفكك</span>
                        <span className="font-black tabular-nums text-[var(--color-text)]">{formatNumber(decomposedBal)}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-[var(--color-text-muted)] block mb-0.5">كمية الإنتاج (الشهر الحالي)</span>
                        <span className="font-black tabular-nums text-emerald-600">{formatNumber(c?.quantityProduced ?? 0)}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] block mt-0.5">من التقارير/التكلفة الشهرية، وليس رصيد المخزن</span>
                      </div>
                      {canViewCosts && (
                        <div>
                          <span className="text-[11px] text-[var(--color-text-muted)] block mb-0.5">متوسط تكلفة الوحدة (الشهر)</span>
                          <span className="font-black tabular-nums text-primary">
                            {hasMonthlyCost ? `${formatCost(c!.costPerUnit)} ج.م` : '—'}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-[11px] text-[var(--color-text-muted)] block mb-0.5">نشط هذا الشهر</span>
                        <span className={`font-black ${activeThisMonth ? 'text-emerald-600' : 'text-[var(--color-text-muted)]'}`}>
                          {activeThisMonth ? 'نعم' : 'لا'}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]">
                      رصيد مخزن آ«تم الصنعآ» في الجدول:{' '}
                      <span className="font-bold text-[var(--color-text)] tabular-nums">{formatNumber(finishedWhBal)}</span>
                    </div>
                  </div>

                  {canViewCosts && (
                    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 space-y-2">
                      <p className="text-xs font-bold text-[var(--color-text-muted)]">تفاصيل التكاليف المعرفة للمنتج (للوحدة)</p>
                      {drawerMaterialsLoading ? (
                        <div className="flex items-center gap-2 text-[var(--color-text-muted)] py-2">
                          <Loader2 className="size-4 animate-spin" />
                          <span className="text-xs">جاري تحميل المواد…</span>
                        </div>
                      ) : breakdown ? (
                        <>
                          <ul className="space-y-1.5 text-xs">
                            <li className="flex justify-between gap-2">
                              <span className="text-[var(--color-text-muted)]">تكلفة الوحدة الصينية</span>
                              <span className="font-bold tabular-nums">{formatCost(breakdown.chineseUnitCost)} ج.م</span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-[var(--color-text-muted)]">المواد الخام</span>
                              <span className="font-bold tabular-nums">{formatCost(breakdown.rawMaterialCost)} ج.م</span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-[var(--color-text-muted)]">العلبة الداخلية</span>
                              <span className="font-bold tabular-nums">{formatCost(breakdown.innerBoxCost)} ج.م</span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-[var(--color-text-muted)]">نصيب الكرتونة الخارجية</span>
                              <span className="font-bold tabular-nums">{formatCost(breakdown.cartonShare)} ج.م</span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-[var(--color-text-muted)]">نصيب مصاريف الإنتاج (متوسط الشهر)</span>
                              <span className="font-bold tabular-nums">{formatCost(breakdown.productionOverheadShare)} ج.م</span>
                            </li>
                          </ul>
                          <div className="flex justify-between gap-2 pt-2 border-t border-[var(--color-border)] font-black text-amber-800">
                            <span>إجمالي تفاصيل المنتج (للوحدة)</span>
                            <span className="tabular-nums">{formatCost(breakdown.totalCalculatedCost)} ج.م</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)]">لا تتوفر بيانات خام كافية لحساب التفصيل.</p>
                      )}
                    </div>
                  )}

                  {canViewCosts && (
                    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 space-y-2">
                      <p className="text-xs font-bold text-[var(--color-text-muted)]">تكاليف الإنتاج للشهر الحالي (إجمالي)</p>
                      {hasMonthlyCost ? (
                        <ul className="space-y-1.5 text-xs">
                          <li className="flex justify-between gap-2">
                            <span className="text-blue-600 font-medium">مباشر</span>
                            <span className="font-bold tabular-nums">{formatCost(c!.laborCost)} ج.م</span>
                          </li>
                          <li className="flex justify-between gap-2">
                            <span className="text-[var(--color-text-muted)] font-medium">غير مباشر</span>
                            <span className="font-bold tabular-nums">{formatCost(c!.indirectCost)} ج.م</span>
                          </li>
                          <li className="flex justify-between gap-2 pt-2 border-t border-[var(--color-border)] font-black">
                            <span>إجمالي تكاليف الإنتاج</span>
                            <span className="tabular-nums text-amber-700">{formatCost(c!.totalCost)} ج.م</span>
                          </li>
                        </ul>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)]">لا توجد تكاليف إنتاج مسجلة لهذا المنتج في الشهر الحالي.</p>
                      )}
                    </div>
                  )}

                  {canViewSellingPrice && (
                    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 flex justify-between items-center gap-2">
                      <span className="text-xs font-bold text-[var(--color-text-muted)]">سعر البيع</span>
                      <span className="font-black tabular-nums text-[var(--color-text)]">{formatCost(selling)} ج.م</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    onClick={() => {
                      const id = p.id;
                      setDetailDrawerProductId(null);
                      navigate(`/products/${id}`);
                    }}
                  >
                    فتح صفحة التفاصيل الكاملة
                  </Button>
                </div>
              </div>
            </aside>
          </>
        );
      })()}

      {/* â”€â”€ Add / Edit Modal â”€â”€ */}
      {showModal && (can("products.create") || can("products.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-2xl border border-[var(--color-border)] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">{editId ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <ProductIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {saveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  <ProductIcon name={saveMsg.type === 'success' ? 'check_circle' : 'error'} className="text-base" />
                  <p className="flex-1">{saveMsg.text}</p>
                  <button onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                    <ProductIcon name="close" className="text-base" />
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">اسم المنتج *</label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: محرك هيدروليكي H-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكود *</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="PRD-00001"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">الفئة / الموديل</label>
                  <input
                    list="products-category-options"
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="اختر أو اكتب فئة"
                  />
                  <datalist id="products-category-options">
                    {mergedCategoryOptions.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">سعر البيع (ج.م)</label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  type="number"
                  min={0}
                  step="any"
                  value={form.sellingPrice ?? ''}
                  placeholder="0"
                  onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoDeductComponentScrapFromDecomposed === true}
                    onChange={(e) => setForm({ ...form, autoDeductComponentScrapFromDecomposed: e.target.checked })}
                  />
                  خصم هالك المكونات تلقائياً من مخزن المفكك أثناء تقرير الإنتاج
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                  تارجت المتوقع في التقارير (ثانية/وحدة)
                </label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  type="number"
                  min={1}
                  step={1}
                  value={form.routingTargetUnitSeconds ?? ''}
                  placeholder="اختياري — يُستخدم عند عدم وجود مسار نشط (أو يكمّل عند غياب أساس من المسار)"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v === '') setForm({ ...form, routingTargetUnitSeconds: undefined });
                    else setForm({ ...form, routingTargetUnitSeconds: Math.round(Number(v)) });
                  }}
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  عند وجود مسار نشط بزمن خطوات أو بتارجت مسار، يُعتمد المسار أولاً. بدون مسار، يُحسب انحراف الكمية في التقرير من هذا الحقل.
                </p>
              </div>

              {/* Cost breakdown (costs permission) */}
              {canViewCosts && (
                <>
                  <div className="border-t border-[var(--color-border)] pt-4">
                    <h4 className="text-sm font-bold text-[var(--color-text-muted)] mb-3 flex items-center gap-2">
                      <ProductIcon name="receipt_long" className="text-teal-500 text-base" />
                      تفصيل التكلفة
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">تكلفة الوحدة الصينية (ج.م)</label>
                      <input
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="any"
                        value={form.chineseUnitCost ?? ''}
                        placeholder="0"
                        onChange={(e) => setForm({ ...form, chineseUnitCost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">تكلفة العلبة الداخلية (ج.م)</label>
                      <input
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="any"
                        value={form.innerBoxCost ?? ''}
                        placeholder="0"
                        onChange={(e) => setForm({ ...form, innerBoxCost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">تكلفة الكرتونة الخارجية (ج.م)</label>
                      <input
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="any"
                        value={form.outerCartonCost ?? ''}
                        placeholder="0"
                        onChange={(e) => setForm({ ...form, outerCartonCost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">عدد الوحدات في الكرتونة</label>
                      <input
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="1"
                        value={form.unitsPerCarton ?? ''}
                        placeholder="0"
                        onChange={(e) => setForm({ ...form, unitsPerCarton: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name || !form.code}>
                {saving ? (
                  <ProductIcon name="refresh" className="animate-spin text-sm" />
                ) : (
                  <ProductIcon name={editId ? 'save' : 'add'} className="text-sm" />
                )}
                {editId ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Delete Confirmation â”€â”€ */}
      {deleteConfirmId && can("products.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ProductIcon name="delete_forever" className="text-rose-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <ProductIcon name="delete" className="text-sm" />
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Import Excel Modal â”€â”€ */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowImportModal(false); setImportResult(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-5xl border border-[var(--color-border)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4">
                  <ProductIcon name="drag_indicator" className="text-[var(--color-text-muted)] cursor-move select-none" aria-hidden="true" />
                  <h3 className="text-lg font-bold">رفع منتجات من Excel</h3>
                </div>
                <button onClick={downloadProductsTemplate} className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline">
                  <ProductIcon name="download" className="text-sm" />
                  تحميل نموذج
                </button>
              </div>
                <button onClick={() => { setShowImportModal(false); setImportResult(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <ProductIcon name="close" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {importParsing && (
                <div className="text-center py-12">
                  <ProductIcon name="refresh" className="animate-spin text-4xl text-primary mb-3 block" />
                  <p className="font-bold text-slate-600">جاري تحليل الملف...</p>
                </div>
              )}

              {!importParsing && importResult && importResult.totalRows === 0 && (
                <div className="text-center py-12">
                  <ProductIcon name="warning" className="text-5xl text-[var(--color-text-muted)] mb-3 block" />
                  <p className="font-bold text-slate-600">لم يتم العثور على بيانات في الملف</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">تأكد من وجود شيت المنتجات (اسم المنتج، الكود...) ويمكن إضافة شيت المواد الخام اختياريًا</p>
                  <button onClick={downloadProductsTemplate} className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto">
                    <ProductIcon name="download" className="text-sm" />
                    تحميل نموذج المنتجات
                  </button>
                </div>
              )}

              {!importParsing && importResult && importResult.totalRows > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold">
                      الإجمالي: <span className="text-primary">{importResult.totalRows}</span>
                    </div>
                    {importResult.newCount > 0 && (
                      <div className="bg-emerald-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-emerald-600">
                        <ProductIcon name="add_circle" className="text-xs align-middle ml-1 inline" />
                        جديد: {importResult.newCount}
                      </div>
                    )}
                    {importResult.updateCount > 0 && (
                      <div className="bg-amber-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-amber-600">
                        <ProductIcon name="sync" className="text-xs align-middle ml-1 inline" />
                        تحديث: {importResult.updateCount}
                      </div>
                    )}
                    {importResult.errorCount > 0 && (
                      <div className="bg-rose-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-rose-500">
                        يحتوي أخطاء: {importResult.errorCount}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <table className="erp-table w-full text-right text-sm border-collapse">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th">صف</th>
                          <th className="erp-th">الحالة</th>
                          <th className="erp-th">اسم المنتج</th>
                          <th className="erp-th">الكود</th>
                          <th className="erp-th">الفئة</th>
                          <th className="erp-th">الوحدة الصينية</th>
                          <th className="erp-th">العلبة الداخلية</th>
                          <th className="erp-th">الكرتونة</th>
                          <th className="erp-th">وحدات/كرتونة</th>
                          <th className="erp-th">سعر البيع</th>
                          <th className="erp-th">مواد خام</th>
                          <th className="erp-th">التفاصيل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {importResult.rows.map((row) => (
                          <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.rowIndex}</td>
                            <td className="px-3 py-2.5">
                              {row.errors.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-rose-500 text-xs font-bold">
                                  <ProductIcon name="error" className="text-sm" /> خطأ
                                </span>
                              ) : row.action === 'update' ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-bold">
                                  <ProductIcon name="sync" className="text-sm" /> تحديث
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                  <ProductIcon name="add_circle" className="text-sm" /> جديد
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{row.name || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{row.code || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500">{row.model || '—'}</td>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.chineseUnitCost || '—'}</td>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.innerBoxCost || '—'}</td>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.outerCartonCost || '—'}</td>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.unitsPerCarton || '—'}</td>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.sellingPrice || '—'}</td>
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.materials.length || '—'}</td>
                            <td className="px-3 py-2.5">
                              {row.errors.length > 0 ? (
                                <ul className="text-xs text-rose-500 space-y-0.5">
                                  {row.errors.map((err, i) => <li key={i}>• {err}</li>)}
                                </ul>
                              ) : row.changes && row.changes.length > 0 ? (
                                <p className="text-xs text-amber-600">تحديث: {row.changes.join('، ')}</p>
                              ) : row.action === 'update' ? (
                                <p className="text-xs text-slate-400">لا توجد تغييرات</p>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
              <Button variant="outline" onClick={() => { setShowImportModal(false); setImportResult(null); }}>إلغاء</Button>
              {importResult && importResult.validCount > 0 && (
                <Button variant="primary" onClick={handleImportSave} disabled={importSaving}>
                  {importSaving ? (
                    <>
                      <ProductIcon name="refresh" className="animate-spin text-sm" />
                      {importProgress.done} / {importProgress.total}
                    </>
                  ) : (
                    <>
                      <ProductIcon name="save" className="text-sm" />
                      حفظ {importResult.newCount > 0 && importResult.updateCount > 0
                        ? `${importResult.newCount} جديد + ${importResult.updateCount} تحديث`
                        : importResult.updateCount > 0
                          ? `تحديث ${importResult.updateCount} منتج`
                          : `${importResult.newCount} منتج جديد`
                      }
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Export Warehouse Selector Modal â”€â”€ */}
      {showWarehouseExportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowWarehouseExportModal(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ProductIcon name="warehouse" className="text-primary" />
                <h3 className="text-lg font-bold">
                  {exportScope === 'current_month' ? 'تصدير منتجات الشهر الحالي' : 'تصدير المنتجات'}
                </h3>
              </div>
              <button type="button" onClick={() => setShowWarehouseExportModal(false)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <ProductIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {exportScope === 'current_month' && exportMonthReports.length === 0 && !exportMonthLoading && (
                <p className="text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-[var(--border-radius-lg)] px-3 py-2">
                  لا توجد تقارير إنتاج في الشهر المحدد حالياً.
                </p>
              )}
              {exportScope === 'current_month' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">اختر الشهر</label>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 font-medium bg-transparent"
                  />
                  <p className="text-xs text-[var(--color-text-muted)]">
                    يتم تصدير المنتجات التي لها كمية إنتاج أكبر من صفر في تقارير الشهر المختار.
                  </p>
                </div>
              )}
              {exportScope === 'current_month' && monthExportProductCount === 0 && !exportMonthLoading && (
                <p className="text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-[var(--border-radius-lg)] px-3 py-2">
                  لا يوجد منتج بكمية إنتاج مسجّلة في الشهر المحدد.
                </p>
              )}
              {exportScope === 'current_month' && exportMonthLoading && (
                <p className="text-xs font-bold text-sky-700 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-[var(--border-radius-lg)] px-3 py-2">
                  جاري تحميل تقارير الشهر المحدد...
                </p>
              )}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">اختر المخزن للتصدير</label>
                <Select value={exportWarehouseId || 'all'} onValueChange={(value) => setExportWarehouseId(value === 'all' ? '' : value)}>
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 font-medium">
                    <SelectValue placeholder="كل المخازن (بدون تحديد)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المخازن (بدون تحديد)</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-[var(--color-text-muted)]">
                  عند اختيار مخزن سيتم تضمين عمود اسم المخزن ورصيد المنتج داخل هذا المخزن في ملف الإكسل.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-bold text-[var(--color-text-muted)]">أعمدة التصدير</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {[
                    { key: 'openingStock' as const, label: 'رصيد مفكك' },
                    { key: 'totalProduction' as const, label: 'ما تم إنتاجه' },
                    { key: 'monthlyProductionQty' as const, label: 'كمية الإنتاج (الشهر)' },
                    { key: 'wasteUnits' as const, label: 'الهالك' },
                    { key: 'stockLevel' as const, label: 'منتج تام' },
                    ...(canViewSellingPrice ? [{ key: 'sellingPrice' as const, label: 'سعر البيع' }] : []),
                    ...(canViewCosts
                      ? ([
                          { key: 'totalCost' as const, label: 'إجمالي التكلفة' },
                          { key: 'directIndirect' as const, label: 'مباشر / غير مباشر' },
                          { key: 'costPerUnit' as const, label: 'تكلفة الوحدة' },
                          { key: 'chineseUnitCost' as const, label: 'تكلفة الوحدة الصينية' },
                          { key: 'chinesePriceCny' as const, label: 'السعر باليوان' },
                          { key: 'innerBoxCost' as const, label: 'العلبة الداخلية' },
                          { key: 'rawMaterialsUnitCost' as const, label: 'المواد الخام (للوحدة)' },
                          { key: 'cartonSharePerUnit' as const, label: 'نصيب الكرتونة الخارجية' },
                          { key: 'productionOverheadPerUnit' as const, label: 'نصيب مصاريف الإنتاج (متوسط الشهر)' },
                          { key: 'outerCartonCost' as const, label: 'سعر الكرتونة (كامل)' },
                          { key: 'unitsPerCarton' as const, label: 'وحدات/كرتونة' },
                        ] as const)
                      : []),
                  ].map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportColumnPrefs[opt.key]}
                        onChange={(e) => toggleExportColumn(opt.key, e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-[var(--color-border)] text-primary shrink-0"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {canViewCosts && (
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">تفاصيل تكلفة المنتج (للتصدير)</p>
                  {([
                    { k: 'rawMaterials' as const, label: 'تكلفة وتفاصيل المواد الخام' },
                    { k: 'productionOverhead' as const, label: 'نصيب مصاريف الإنتاج (متوسط الشهر) — التصدير' },
                    { k: 'calculatedUnit' as const, label: 'إجمالي التكلفة المحسوبة (للوحدة)' },
                  ]).map((row) => (
                    <label key={row.k} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportCostExtras[row.k]}
                        onChange={(e) => setExportCostExtras((prev) => ({ ...prev, [row.k]: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded border-[var(--color-border)] text-primary shrink-0"
                      />
                      <span>{row.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
              <Button variant="outline" onClick={() => setShowWarehouseExportModal(false)}>إلغاء</Button>
              <Button
                variant="primary"
                disabled={exportingProducts || exportMonthLoading || (exportScope === 'current_month' && monthExportProductCount === 0)}
                onClick={() => {
                  void doExportProducts(exportWarehouseId || undefined);
                  setShowWarehouseExportModal(false);
                }}
              >
                <ProductIcon name="download" className="text-sm" />
                {exportingProducts ? 'جاري التصدير...' : 'تصدير Excel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Column Control Modal â”€â”€ */}
      {showColumnsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowColumnsModal(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ProductIcon name="tune" className="text-primary" />
                <h3 className="text-lg font-bold">إدارة الأعمدة</h3>
              </div>
              <button onClick={() => setShowColumnsModal(false)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                <ProductIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
              {[
                { key: 'openingStock' as const, label: 'رصيد مفكك', icon: 'call_split' },
                { key: 'totalProduction' as const, label: 'ما تم إنتاجه', icon: 'precision_manufacturing' },
                { key: 'monthlyProductionQty' as const, label: 'إنتاج الشهر (تقارير)', icon: 'precision_manufacturing' },
                { key: 'wasteUnits' as const, label: 'الهالك', icon: 'delete_sweep' },
                { key: 'stockLevel' as const, label: 'منتج تام', icon: 'inventory_2' },
                ...(canViewSellingPrice ? [{ key: 'sellingPrice' as const, label: 'سعر البيع', icon: 'sell' }] : []),
                { key: 'totalCost' as const, label: 'إجمالي التكلفة', icon: 'payments' },
                { key: 'directIndirect' as const, label: 'مباشر / غير مباشر', icon: 'compare_arrows' },
                { key: 'costPerUnit' as const, label: 'تكلفة الوحدة', icon: 'price_check' },
                { key: 'chineseUnitCost' as const, label: 'تكلفة الوحدة الصينية (ج.م)', icon: 'local_shipping' },
                { key: 'chinesePriceCny' as const, label: 'السعر باليوان', icon: 'currency_yuan' },
                { key: 'innerBoxCost' as const, label: 'العلبة الداخلية', icon: 'inventory' },
                { key: 'rawMaterialsUnitCost' as const, label: 'المواد الخام (للوحدة)', icon: 'receipt_long' },
                { key: 'cartonSharePerUnit' as const, label: 'نصيب الكرتونة الخارجية', icon: 'package_2' },
                { key: 'productionOverheadPerUnit' as const, label: 'نصيب مصاريف الإنتاج (متوسط الشهر)', icon: 'payments' },
                { key: 'outerCartonCost' as const, label: 'سعر الكرتونة (كامل)', icon: 'truck' },
                { key: 'unitsPerCarton' as const, label: 'عدد الوحدات/كرتونة', icon: 'view_in_ar' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] border cursor-pointer transition-all ${
                    visibleColumns[opt.key]
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-[var(--color-border)] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[opt.key]}
                    onChange={(e) => toggleColumn(opt.key, e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                  />
                  <ProductIcon name={opt.icon} className={`text-lg ${visibleColumns[opt.key] ? 'text-primary' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">{opt.label}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
              <button
                onClick={() => {
                  const empty = Object.keys(DEFAULT_VISIBLE_COLUMNS).reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<ProductTableColumnKey, boolean>);
                  setVisibleColumns(empty);
                  if (typeof window !== 'undefined') window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(empty));
                }}
                className="text-xs font-bold text-[var(--color-text-muted)] hover:text-slate-600"
              >
                إلغاء تحديد الكل
              </button>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setShowColumnsModal(false)}>إغلاق</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



