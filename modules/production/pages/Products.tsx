import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
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
  ClipboardList,
  Cog,
  Download,
  Eye,
  GripVertical,
  LayoutGrid,
  List,
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
import { toast } from 'sonner';
import { useAppStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import { Button, Badge } from '../components/UI';
import { type ProductBomCountCard } from '../components/ProductBomCountCardPrint';
import { ProductBomCountCardPreviewModal } from '../components/ProductBomCountCardPreviewModal';
import { buildProductBomCountCards } from '../lib/buildProductBomCountCards';
import { formatNumber } from '../../../utils/calculations';
import { buildProductAvgCost, formatCost, getCurrentMonth, type ProductCostData } from '../../../utils/costCalculations';
import type { Product, ProductionReport } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { useResourcePermission } from '@/utils/useResourcePermission';
import {
  BOM_UPSERT_PATHS,
  INVENTORY_OPERATION_KEYS,
  INVENTORY_STOCK_MOVE_PATHS,
  MANUFACTURING_OPERATION_KEYS,
  MATERIAL_CREATE_PATHS,
  PRODUCT_CREATE_PATHS,
  PRODUCT_OPERATION_KEYS,
  PRODUCT_UPDATE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';
import {
  parseProductsExcel,
  toProductData,
  toProductDataWithExisting,
  type ProductImportResult,
  type ProductImportMaterialCatalogItem,
} from '../../../utils/importProducts';
import { decideProductImportSave } from '../../../utils/importSaveDecision';
import { downloadProductsTemplate, downloadProductComponentsTemplate } from '../../../utils/downloadTemplates';
import {
  applySkipExistingProductComponents,
  bomExistKey,
  parseProductComponentsExcel,
  stockExistKeyForLocation,
  stockExistKeyForWarehouse,
  type ProductComponentsImportResult,
} from '../../../utils/importProductComponents';
import {
  exportAllProducts,
  exportProductBomExcel,
  exportProductsBasicMaster,
} from '../../../utils/exportExcel';
import type { ProductExportOptions, ProductBomExportRow } from '../../../utils/exportExcel';
import { calculateProductCostBreakdown, type ProductCostBreakdown } from '../../../utils/productCostBreakdown';
import type { ProductMaterial } from '../../../types';
import { loadProductMaterials, loadProductMaterialsByProductIds } from '../../catalog/lib/productComponents';
import { bomService } from '../../manufacturing/services/bomService';
import { materialService } from '../../manufacturing/services/materialService';
import {
  MATERIAL_TYPE_LABELS,
  MATERIAL_UNIT_LABELS,
  type BomItem,
  type MaterialType,
  type MaterialUnit,
} from '../../manufacturing/types';
import { useJobsStore, isBackgroundJobCancelled } from '../../../components/background-jobs/useJobsStore';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { stockService } from '../../inventory/services/stockService';
import { warehouseLocationService } from '../../inventory/services/warehouseLocationService';
import { defaultItemLocationService } from '../../inventory/services/defaultItemLocationService';
import type { StockItemBalance } from '../../inventory/types';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { PageHeader } from '../../../components/PageHeader';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { TableIconAction, ToneActionButton } from '@/src/components/erp/TableIconAction';
import { warehouseService } from '../../inventory/services/warehouseService';
import type { Warehouse as InventoryWarehouse } from '../../inventory/types';
import { useRawMaterialWarehouse } from '../../inventory/hooks/useRawMaterialWarehouse';
import { CategoryTreeSelect } from '../../catalog/components/CategoryTreeSelect';
import { categoryService, isProductCategoryRow } from '../../catalog/services/categoryService';
import { flattenCategoryTree, formatCategoryBreadcrumb } from '../../catalog/lib/categoryTree';
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
import { countsTowardProductManufacturingVolume } from '../utils/reportTypes';

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
const LAYOUT_PREFS_KEY = 'products_list_layout_v1';
type ProductsLayoutMode = 'table' | 'grid';

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
  const labels: string[] = ['الكود', 'اسم المنتج', 'الفئة', 'منتج تصنيعي', 'تارجت المتوقع تقارير (ث)'];
  if (hasWarehouse) {
    labels.push('المخزن', 'رصيد المخزن');
  }
  if (prefs.openingStock) labels.push('رصيد مفكك');
  if (prefs.totalProduction) labels.push('ما تم إنتاجه');
  if (prefs.monthlyProductionQty) labels.push('كمية الإنتاج (شهر التصدير)');
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
  const systemSettings = useAppStore((s) => s.systemSettings);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings);
  const stockItemTypeForMaterials = Boolean(planSettings?.manufacturingMigratedAt?.trim())
    ? 'material'
    : 'raw_material';
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);

  const { can } = usePermission();
  const productPerms = useResourcePermission('products');
  const canViewCosts = can('costs.view');
  const canViewSellingPrice = can('roles.manage');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'products'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const canImportFromPage = can('import') && pageControl.importEnabled;
  const canCreateProductModal = productPerms.canCreate && isOperationPathEnabled(
    systemSettings,
    PRODUCT_OPERATION_KEYS.create,
    PRODUCT_CREATE_PATHS.globalModal,
  );
  const canUpdateProductModal = productPerms.canEdit && isOperationPathEnabled(
    systemSettings,
    PRODUCT_OPERATION_KEYS.update,
    PRODUCT_UPDATE_PATHS.globalModal,
  );
  const canImportProducts = canImportFromPage
    && isOperationPathEnabled(
      systemSettings,
      PRODUCT_OPERATION_KEYS.create,
      PRODUCT_CREATE_PATHS.productsImport,
    )
    && isOperationPathEnabled(
      systemSettings,
      PRODUCT_OPERATION_KEYS.update,
      PRODUCT_UPDATE_PATHS.productsImport,
    );
  const canBulkUpdateProducts = productPerms.canEdit && isOperationPathEnabled(
    systemSettings,
    PRODUCT_OPERATION_KEYS.update,
    PRODUCT_UPDATE_PATHS.productsPageBulk,
  );
  const canToggleProductSettings = productPerms.canEdit && isOperationPathEnabled(
    systemSettings,
    PRODUCT_OPERATION_KEYS.update,
    PRODUCT_UPDATE_PATHS.productsPageToggle,
  );
  const canDeleteProduct = productPerms.canDelete;
  const componentStockImportEnabled = isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.stockMove,
    INVENTORY_STOCK_MOVE_PATHS.productsComponentImport,
  );
  const productsImportBomEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.bomUpsert,
    BOM_UPSERT_PATHS.productsImportBom,
  );
  const componentMaterialImportEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialCreate,
    MATERIAL_CREATE_PATHS.productsComponentsImport,
  );
  const componentBomImportEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.bomUpsert,
    BOM_UPSERT_PATHS.productsComponentsImport,
  );
  const navigate = useTenantNavigate();

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
  const [layoutMode, setLayoutMode] = useState<ProductsLayoutMode>(() => {
    if (typeof window === 'undefined') return 'table';
    try {
      const raw = window.localStorage.getItem(LAYOUT_PREFS_KEY);
      return raw === 'grid' || raw === 'table' ? raw : 'table';
    } catch {
      return 'table';
    }
  });

  const setLayoutModePersist = (mode: ProductsLayoutMode) => {
    setLayoutMode(mode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAYOUT_PREFS_KEY, mode);
    }
  };

  // Import from Excel
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combined product components import (BOM + optional location/balance)
  const [showComponentsImportModal, setShowComponentsImportModal] = useState(false);
  const [componentsImportResult, setComponentsImportResult] = useState<ProductComponentsImportResult | null>(null);
  const [componentsImportParsing, setComponentsImportParsing] = useState(false);
  const [componentsImportSaving, setComponentsImportSaving] = useState(false);
  const [componentsImportProgress, setComponentsImportProgress] = useState({ done: 0, total: 0 });
  const [componentsImportFileName, setComponentsImportFileName] = useState('');
  const [componentsFallbackWarehouseId, setComponentsFallbackWarehouseId] = useState('');
  const componentsFileInputRef = useRef<HTMLInputElement>(null);


  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [manufacturedFilter, setManufacturedFilter] = useState('');
  const [categoryFilterOptions, setCategoryFilterOptions] = useState<
    Array<{ value: string; label: string; leafName: string }>
  >([]);
  const [inventoryBalances, setInventoryBalances] = useState<StockItemBalance[]>([]);
  const [todayReportsScoped, setTodayReportsScoped] = useState<ProductionReport[]>([]);
  const [monthlyReportsScoped, setMonthlyReportsScoped] = useState<ProductionReport[]>([]);
  const [savedMonthlyCostsMap, setSavedMonthlyCostsMap] = useState<Record<string, ProductCostData>>({});
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [showWarehouseExportModal, setShowWarehouseExportModal] = useState(false);
  const [exportWarehouseId, setExportWarehouseId] = useState('');
  const [exportMonth, setExportMonth] = useState(getCurrentMonth());
  const [exportMonthReports, setExportMonthReports] = useState<ProductionReport[]>([]);
  /** منتجات لها سجل تكلفة شهرية محفوظ بكمية > 0 (نفس مصدر صفحة التكلفة الشهرية) */
  const [exportMonthSavedActiveProductIds, setExportMonthSavedActiveProductIds] = useState<string[]>([]);
  const [exportMonthLoading, setExportMonthLoading] = useState(false);
  const [exportingProducts, setExportingProducts] = useState(false);
  const [exportingBom, setExportingBom] = useState(false);
  const [showBomExportModal, setShowBomExportModal] = useState(false);
  const [bomExportCategoryFilter, setBomExportCategoryFilter] = useState('');
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string | null>(null);
  const [bulkCategoryLabel, setBulkCategoryLabel] = useState('');

  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const {
    warehouseId: suppliesWarehouseId,
    warehouseName: suppliesWarehouseName,
  } = useRawMaterialWarehouse();
  const [detailDrawerProductId, setDetailDrawerProductId] = useState<string | null>(null);
  const [drawerMaterials, setDrawerMaterials] = useState<ProductMaterial[]>([]);
  const [drawerMaterialsLoading, setDrawerMaterialsLoading] = useState(false);
  const [drawerShareBusy, setDrawerShareBusy] = useState(false);
  const productDetailPrintRef = useRef<HTMLDivElement>(null);
  const [countCardPreviewOpen, setCountCardPreviewOpen] = useState(false);
  const [countCardPreviewData, setCountCardPreviewData] = useState<ProductBomCountCard[]>([]);
  const [countCardPreviewBusy, setCountCardPreviewBusy] = useState(false);
  const [countCardPreviewWarning, setCountCardPreviewWarning] = useState<string | null>(null);

  const detailDrawerProduct = useMemo(
    () => (detailDrawerProductId ? products.find((p) => p.id === detailDrawerProductId) ?? null : null),
    [products, detailDrawerProductId],
  );

  const handlePrintProductDetail = useManagedPrint({
    contentRef: productDetailPrintRef,
    printSettings: printTemplate,
    documentTitle: detailDrawerProduct?.name ?? 'ملخص المنتج',
  });

  const openProductBomCountCardPreview = async (productIds: string[]) => {
    if (countCardPreviewBusy) return;
    setCountCardPreviewBusy(true);
    setCountCardPreviewWarning(null);
    setCountCardPreviewOpen(true);
    setCountCardPreviewData([]);
    try {
      const { cards, skippedWithoutBom } = await buildProductBomCountCards({
        productIds,
        products,
        warehouseId: suppliesWarehouseId,
        warehouseName: suppliesWarehouseName,
      });
      if (cards.length === 0) {
        setCountCardPreviewOpen(false);
        setSaveMsg({
          type: 'error',
          text:
            skippedWithoutBom.length > 0
              ? `لا يمكن العرض: لا يوجد BOM للمحدد (${skippedWithoutBom.slice(0, 5).join('، ')}${skippedWithoutBom.length > 5 ? '…' : ''}).`
              : 'لا توجد منتجات صالحة لكارت الجرد.',
        });
        return;
      }
      if (skippedWithoutBom.length > 0) {
        setCountCardPreviewWarning(
          `تم تخطي ${skippedWithoutBom.length} بدون BOM: ${skippedWithoutBom.slice(0, 5).join('، ')}${skippedWithoutBom.length > 5 ? '…' : ''}`,
        );
      }
      setCountCardPreviewData(cards);
    } catch {
      setCountCardPreviewOpen(false);
      setSaveMsg({ type: 'error', text: 'تعذر تجهيز كارت الجرد للمعاينة.' });
    } finally {
      setCountCardPreviewBusy(false);
    }
  };

  useEffect(() => {
    if (!detailDrawerProductId) {
      setDrawerMaterials([]);
      setDrawerMaterialsLoading(false);
      return;
    }
    let cancelled = false;
    setDrawerMaterialsLoading(true);
    void loadProductMaterials(detailDrawerProductId)
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
          if (!countsTowardProductManufacturingVolume(r)) continue;
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
      const matchCategory = (() => {
        if (!categoryFilter) return true;
        if (categoryFilter.startsWith('name:')) {
          return p.category === categoryFilter.slice(5);
        }
        if (p.categoryId === categoryFilter) return true;
        const opt = categoryFilterOptions.find((o) => o.value === categoryFilter);
        if (opt) return p.category === opt.leafName || p.category === opt.label;
        return p.category === categoryFilter;
      })();
      const matchStock = !stockFilter || p.stockStatus === stockFilter;
      const matchManufactured =
        !manufacturedFilter
        || (manufacturedFilter === 'yes' && p.isManufactured !== false)
        || (manufacturedFilter === 'no' && p.isManufactured === false);
      return matchSearch && matchCategory && matchStock && matchManufactured;
    });
  }, [productsForTable, search, categoryFilter, stockFilter, manufacturedFilter, categoryFilterOptions]);

  const todayReports = todayReportsScoped.length > 0 ? todayReportsScoped : storeTodayReports;
  const monthlyReports = monthlyReportsScoped.length > 0 ? monthlyReportsScoped : storeMonthlyReports;
  const monthlyQtyByProductId = useMemo(() => {
    const next: Record<string, number> = {};
    for (const r of monthlyReports) {
      if (!countsTowardProductManufacturingVolume(r)) continue;
      const pid = String(r.productId || '').trim();
      if (!pid) continue;
      next[pid] = (next[pid] || 0) + Number(r.quantityProduced || 0);
    }
    return next;
  }, [monthlyReports]);

  const exportMonthQtyByProductId = useMemo(() => {
    const next: Record<string, number> = {};
    for (const r of exportMonthReports) {
      if (!countsTowardProductManufacturingVolume(r)) continue;
      const pid = String(r.productId || '').trim();
      if (!pid) continue;
      next[pid] = (next[pid] || 0) + Number(r.quantityProduced || 0);
    }
    return next;
  }, [exportMonthReports]);

  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [search, categoryFilter, stockFilter, manufacturedFilter]);

  useEffect(() => {
    if (!showWarehouseExportModal) return;
    const monthKey = /^\d{4}-\d{2}$/.test(exportMonth) ? exportMonth : getCurrentMonth();
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const monthStart = `${monthKey}-01`;
    const monthEnd = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    let cancelled = false;
    setExportMonthLoading(true);
    setExportMonthSavedActiveProductIds([]);

    const savedRowsPromise =
      exportScope === 'current_month'
        ? monthlyProductionCostService.getByMonth(monthKey).then((rows) => {
            if (cancelled) return;
            const ids = Array.from(
              new Set(
                rows
                  .filter((r) => Number(r.totalProducedQty || 0) > 0)
                  .map((r) => String(r.productId || '').trim())
                  .filter(Boolean),
              ),
            );
            setExportMonthSavedActiveProductIds(ids);
          }).catch(() => {
            if (!cancelled) setExportMonthSavedActiveProductIds([]);
          })
        : Promise.resolve();

    const reportsPromise = ensureProductionReportsForRange(monthStart, monthEnd, {
      maxAgeMs: 5 * 60 * 1000,
      force: true,
    })
      .then((rows) => {
        if (cancelled) return;
        setExportMonthReports(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setExportMonthReports([]);
      });

    void Promise.all([savedRowsPromise, reportsPromise]).finally(() => {
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
    void loadProductMaterialsByProductIds(ids)
      .then((next) => {
        if (!cancelled) setMaterialsByProductId(next);
      })
      .catch(() => {
        if (!cancelled) setMaterialsByProductId({});
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
  const page = Math.min(currentPage, totalPages);
  const paginated = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
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

  const handleBulkAssemblyModeChange = async (assemblyMode: 'individual' | 'team') => {
    if (!canBulkUpdateProducts || bulkToggleSaving || selectedIds.size === 0) return;
    setBulkToggleSaving(true);
    try {
      await Promise.all([...selectedIds].map((id) => updateProduct(
        id,
        { assemblyMode },
        { path: PRODUCT_UPDATE_PATHS.productsPageBulk },
      )));
      setSaveMsg({
        type: 'success',
        text:
          assemblyMode === 'team'
            ? 'تم تحويل المنتجات المحددة إلى تجميع جماعي'
            : 'تم تحويل المنتجات المحددة إلى تجميع فردي',
      });
      setSelectedIds(new Set());
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر تغيير نمط التجميع للمنتجات المحددة حالياً' });
    } finally {
      setBulkToggleSaving(false);
    }
  };

  const handleBulkCategoryAssign = async () => {
    if (!canBulkUpdateProducts || bulkToggleSaving || selectedIds.size === 0 || !bulkCategoryId) return;
    setBulkToggleSaving(true);
    try {
      const count = selectedIds.size;
      const label = bulkCategoryLabel || bulkCategoryId;
      await Promise.all(
        [...selectedIds].map((id) => updateProduct(
          id,
          { categoryId: bulkCategoryId },
          { path: PRODUCT_UPDATE_PATHS.productsPageBulk },
        )),
      );
      setShowBulkCategoryModal(false);
      setBulkCategoryId(null);
      setBulkCategoryLabel('');
      setSelectedIds(new Set());
      setSaveMsg({
        type: 'success',
        text: `تم تحويل ${count} منتج إلى فئة «${label}»`,
      });
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر تحويل المنتجات المحددة إلى الفئة حالياً' });
    } finally {
      setBulkToggleSaving(false);
    }
  };

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
        const rows = await warehouseService.getActiveWarehouses();
        if (cancelled) return;
        setWarehouses(rows);
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

  const monthExportProductCount = useMemo(() => {
    const idSet = new Set<string>();
    for (const p of productsForTable) {
      if ((exportMonthQtyByProductId[p.id] ?? 0) > 0) idSet.add(p.id);
    }
    const productIdSet = new Set(productsForTable.map((p) => p.id));
    for (const id of exportMonthSavedActiveProductIds) {
      if (productIdSet.has(id)) idSet.add(id);
    }
    return idSet.size;
  }, [productsForTable, exportMonthQtyByProductId, exportMonthSavedActiveProductIds]);

  const openCreate = () => {
    if (!canCreateProductModal) return;
    openModal(MODAL_KEYS.PRODUCTS_CREATE, { source: 'products.page' });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;
    if (!canCreateProductModal) return;
    openCreate();
    navigate('/products', { replace: true });
  }, [location.search, canCreateProductModal, navigate]);

  useEffect(() => {
    const editProductId = (location.state as { editProductId?: string } | null)?.editProductId;
    if (!editProductId) return;
    if (!canUpdateProductModal) return;
    openModal(MODAL_KEYS.PRODUCTS_CREATE, { mode: 'edit', productId: editProductId });
    navigate('/products', { replace: true, state: null });
  }, [location.state, navigate, canUpdateProductModal, openModal]);

  const openEdit = (id: string) => {
    if (!canUpdateProductModal) return;
    openModal(MODAL_KEYS.PRODUCTS_CREATE, { mode: 'edit', productId: id });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      setDeleteConfirmId(null);
      toast.success('تم حذف المنتج.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حذف المنتج.');
    }
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
  const mergedCategoryFilterOptions = useMemo(() => {
    const byId = new Map(categoryFilterOptions.map((o) => [o.value, o]));
    for (const name of fallbackCategoryOptions) {
      if (![...byId.values()].some((o) => o.leafName === name)) {
        byId.set(`name:${name}`, { value: `name:${name}`, label: name, leafName: name });
      }
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [categoryFilterOptions, fallbackCategoryOptions]);

  const productMatchesCategoryFilter = useCallback(
    (
      product: {
        categoryId?: string | null;
        category?: string;
        categoryName?: string;
        model?: string;
      },
      filter: string,
    ) => {
      if (!filter) return true;
      const categoryLabel = String(
        product.category || product.categoryName || product.model || '',
      ).trim();
      if (filter.startsWith('name:')) {
        return categoryLabel === filter.slice(5);
      }
      if (product.categoryId && product.categoryId === filter) return true;
      const opt = mergedCategoryFilterOptions.find((o) => o.value === filter);
      if (opt) {
        return categoryLabel === opt.leafName || categoryLabel === opt.label;
      }
      return categoryLabel === filter;
    },
    [mergedCategoryFilterOptions],
  );

  useEffect(() => {
    let cancelled = false;
    const loadCategoryOptions = async () => {
      try {
        const tree = await categoryService.getCategoryTree(true);
        const flat = await categoryService.getAll();
        const productCats = flat.filter(isProductCategoryRow);
        if (cancelled) return;
        const opts = flattenCategoryTree(tree)
          .filter(({ category }) => category.id)
          .map(({ category }) => ({
            value: category.id!,
            label: formatCategoryBreadcrumb(productCats, category.id),
            leafName: String(category.name || '').trim(),
          }));
        setCategoryFilterOptions(opts);
      } catch {
        if (cancelled) return;
        setCategoryFilterOptions([]);
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
      let manufacturingMaterials: ProductImportMaterialCatalogItem[] = [];
      let materialCatalogError = false;
      try {
        manufacturingMaterials = await materialService.getAll();
      } catch {
        materialCatalogError = true;
      }
      const result = await parseProductsExcel(file, _rawProducts, {
        manufacturingMaterials,
        validateManufacturingMaterials: true,
      });
      if (materialCatalogError) {
        result.fileErrors = [
          ...(result.fileErrors ?? []),
          'تعذر تحميل كتالوج مواد التصنيع؛ سيتم رفض صفوف المواد حتى يتم تحميل الكتالوج بنجاح.',
        ];
      }
      setImportResult(result);
    } catch {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, newCount: 0, updateCount: 0 });
    } finally {
      setImportParsing(false);
    }
  };

  const saveImportedBomItems = async (productId: string, row: ProductImportResult['rows'][number]) => {
    if (row.materials.length === 0) return { added: 0, updated: 0 };

    const operationContext = { path: BOM_UPSERT_PATHS.productsImportBom } as const;
    const bomId = await bomService.ensureActiveBom('product', productId, operationContext);
    const existingItems = await bomService.getItemsByBomId(bomId);
    let nextSortOrder = existingItems.reduce((max, item) => Math.max(max, Number(item.sortOrder ?? -1)), -1) + 1;
    let added = 0;
    let updated = 0;

    for (const material of row.materials) {
      if (!material.matchedMaterialId) {
        throw new Error(`لم يتم العثور على مادة تصنيع مطابقة للمنتج ${row.code}`);
      }

      const payload: Omit<BomItem, 'id' | 'tenantId' | 'bomId'> = {
        itemId: material.matchedMaterialId,
        itemType: 'material',
        itemName: material.matchedMaterialName || material.materialName,
        qtyPerUnit: Number(material.quantityUsed || 0),
        unit: material.matchedMaterialUnit || 'piece',
        wastePercent: 0,
        costBehavior: 'direct',
        directCostPerUnit: Number(material.unitCost || 0),
        indirectCostPerUnit: 0,
      };

      const existing = existingItems.find(
        (item) => item.itemType === 'material' && item.itemId === material.matchedMaterialId,
      );

      if (existing?.id) {
        await bomService.updateItem(existing.id, payload, operationContext);
        updated++;
      } else {
        const sortOrder = nextSortOrder++;
        const addedItemId = await bomService.addItem(bomId, { ...payload, sortOrder }, operationContext);
        if (addedItemId) {
          existingItems.push({ ...payload, id: addedItemId, bomId, sortOrder });
        }
        added++;
      }
    }

    return { added, updated };
  };

  const handleImportSave = async () => {
    if (!importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;
    if (validRows.some((row) => row.materials.length > 0) && !productsImportBomEnabled) {
      toast.error('مسار تحديث BOM باستيراد المنتجات متوقف من إعدادات النظام.');
      return;
    }
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

    let done = 0;
    let failed = 0;
    let skipped = 0;
    let written = 0;
    for (const row of validRows) {
      try {
        const decision = decideProductImportSave({
          action: row.action,
          changes: row.changes,
          materialsLength: row.materials.length,
        });

        if (decision === 'skip') {
          skipped += 1;
        } else if (decision === 'bomOnly' && row.matchedId) {
          await saveImportedBomItems(row.matchedId, row);
          written += 1;
        } else if (row.action === 'update' && row.matchedId) {
          const existingProduct = _rawProducts.find((p) => p.id === row.matchedId);
          if (!existingProduct) {
            throw new Error('Existing product not found for update');
          }
          await updateProduct(
            row.matchedId,
            toProductDataWithExisting(row, existingProduct),
            { path: PRODUCT_UPDATE_PATHS.productsImport },
          );
          await saveImportedBomItems(row.matchedId, row);
          written += 1;
        } else {
          const productId = await createProduct(
            toProductData(row),
            { path: PRODUCT_CREATE_PATHS.productsImport },
          );
          if (productId) {
            await saveImportedBomItems(productId, row);
          }
          written += 1;
        }
      } catch (error) {
        failed++;
        console.error('[products-import] Failed to save row', {
          productCode: row.code,
          rowIndex: row.rowIndex,
          error,
        });
      }
      done++;
      setImportProgress({ done, total: validRows.length });
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: validRows.length,
        statusText: 'Saving to database...',
        status: 'processing',
      });
    }

    if (written === 0 && failed > 0 && skipped === 0) {
      failJob(jobId, 'All rows failed during save', 'Failed');
    } else {
      completeJob(jobId, {
        addedRows: written,
        failedRows: failed,
        skippedRows: skipped,
        statusText:
          skipped > 0
            ? `Completed (${skipped} skipped)`
            : 'Completed',
      });
    }
    setImportSaving(false);
  };

  const handleComponentsFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setComponentsImportFileName(file.name);
    setComponentsImportParsing(true);
    setShowComponentsImportModal(true);
    setComponentsImportResult(null);
    setComponentsFallbackWarehouseId('');
    try {
      let manufacturingMaterials: ProductImportMaterialCatalogItem[] = [];
      let materialCatalogError = false;
      let locations: Array<{ id: string; code: string; warehouseId: string; warehouseName?: string; isActive?: boolean }> = [];
      let locationsError = false;
      try {
        manufacturingMaterials = await materialService.getAll();
      } catch {
        materialCatalogError = true;
      }
      try {
        const warehouseRows = warehouses.length > 0 ? warehouses : await warehouseService.getActiveWarehouses();
        if (warehouses.length === 0 && warehouseRows.length > 0) setWarehouses(warehouseRows);
        const warehouseNameById = new Map(warehouseRows.map((w) => [w.id || '', w.name]));
        const locationRows = await warehouseLocationService.getAll();
        locations = locationRows
          .filter((loc) => loc.id && loc.code)
          .map((loc) => ({
            id: loc.id!,
            code: loc.code,
            warehouseId: loc.warehouseId,
            warehouseName: warehouseNameById.get(loc.warehouseId),
            isActive: loc.isActive,
          }));
      } catch {
        locationsError = true;
      }
      const result = await parseProductComponentsExcel(file, _rawProducts, {
        manufacturingMaterials,
        locations,
      });
      if (materialCatalogError) {
        result.fileErrors = [
          ...result.fileErrors,
          'تعذر تحميل كتالوج مواد التصنيع؛ سيتم رفض صفوف المواد حتى يتم تحميل الكتالوج بنجاح.',
        ];
      }
      if (locationsError) {
        result.fileErrors = [
          ...result.fileErrors,
          'تعذر تحميل اللوكيشنات؛ أي كود لوكيشن في الملف سيُرفض حتى يتم التحميل بنجاح.',
        ];
      }

      // Annotate existing BOM (upsert) and plan absolute stock adjustments (جرد).
      const bomKeys = new Set<string>();
      const stockQtyByKey = new Map<string, number>();
      try {
        const productIds = [
          ...new Set(
            result.rows
              .filter((r) => r.errors.length === 0 && r.productId)
              .map((r) => r.productId),
          ),
        ];
        await Promise.all(
          productIds.map(async (productId) => {
            const { items } = await bomService.getActiveBomWithLegacyFallback('product', productId);
            for (const item of items) {
              if (item.itemType === 'material' && item.itemId) {
                bomKeys.add(bomExistKey(productId, item.itemId));
              }
            }
          }),
        );
      } catch {
        result.fileErrors = [
          ...result.fileErrors,
          'تعذر التحقق من BOM الحالي؛ قد تُعاد كتابة مكونات موجودة.',
        ];
      }
      try {
        const [locationBalances, warehouseBalances] = await Promise.all([
          stockService.getLocationBalances(),
          stockService.getBalances(),
        ]);
        for (const bal of locationBalances) {
          if (!bal.itemId || !bal.locationId) continue;
          stockQtyByKey.set(
            stockExistKeyForLocation(bal.itemId, bal.locationId),
            Number(bal.quantity || 0),
          );
        }
        for (const bal of warehouseBalances) {
          if (!bal.itemId || !bal.warehouseId) continue;
          stockQtyByKey.set(
            stockExistKeyForWarehouse(bal.itemId, bal.warehouseId),
            Number(bal.quantity || 0),
          );
        }
      } catch {
        result.fileErrors = [
          ...result.fileErrors,
          'تعذر تحميل الأرصدة الحالية؛ تسويات الرصيد قد تُحسب من صفر.',
        ];
      }

      const annotated = applySkipExistingProductComponents(result, { bomKeys, stockQtyByKey });
      setComponentsImportResult(annotated);
      if (annotated.missingQuantityCount > 0) {
        toast.warning(
          `تم قبول ${annotated.missingQuantityCount} مكون بدون كمية استخدام — كتالوج قطع للصيانة فقط (لن تُستهلك في الإنتاج).`,
        );
      }
    } catch {
      setComponentsImportResult({
        rows: [],
        totalRows: 0,
        validCount: 0,
        errorCount: 0,
        missingQuantityCount: 0,
        bomGroupCount: 0,
        stockMovementCount: 0,
        newMaterialCount: 0,
        skippedBomCount: 0,
        skippedStockCount: 0,
        needsFallbackWarehouse: false,
        bomGroups: [],
        stockMovements: [],
        materialsToCreate: [],
        fileErrors: ['فشل تحليل الملف.'],
      });
    } finally {
      setComponentsImportParsing(false);
    }
  };

  const saveBomItemsForProduct = async (
    productId: string,
    items: Array<{
      materialId: string;
      materialName: string;
      materialUnit?: string;
      quantityUsed: number;
      unitCost: number;
    }>,
  ) => {
    if (items.length === 0) return;
    const operationContext = { path: BOM_UPSERT_PATHS.productsComponentsImport } as const;
    const bomId = await bomService.ensureActiveBom('product', productId, operationContext);
    const existingItems = await bomService.getItemsByBomId(bomId);
    let nextSortOrder = existingItems.reduce((max, item) => Math.max(max, Number(item.sortOrder ?? -1)), -1) + 1;

    for (const material of items) {
      const payload: Omit<BomItem, 'id' | 'tenantId' | 'bomId'> = {
        itemId: material.materialId,
        itemType: 'material',
        itemName: material.materialName,
        qtyPerUnit: Number(material.quantityUsed || 0),
        unit: material.materialUnit || 'piece',
        wastePercent: 0,
        costBehavior: 'direct',
        directCostPerUnit: Number(material.unitCost || 0),
        indirectCostPerUnit: 0,
      };
      const existing = existingItems.find(
        (item) => item.itemType === 'material' && item.itemId === material.materialId,
      );
      if (existing?.id) {
        await bomService.updateItem(existing.id, payload, operationContext);
      } else {
        const sortOrder = nextSortOrder++;
        const addedItemId = await bomService.addItem(bomId, { ...payload, sortOrder }, operationContext);
        if (addedItemId) {
          existingItems.push({ ...payload, id: addedItemId, bomId, sortOrder });
        }
      }
    }
  };

  const handleComponentsImportSave = async () => {
    if (!componentsImportResult) return;
    const validRows = componentsImportResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;

    if (
      componentsImportResult.bomGroupCount === 0 &&
      componentsImportResult.stockMovementCount === 0 &&
      componentsImportResult.newMaterialCount === 0
    ) {
      setSaveMsg({
        type: 'error',
        text: 'لا يوجد ما يُحفظ — لا تحديثات BOM ولا تسويات رصيد (رصيد فاضي أو مطابق للحالي).',
      });
      return;
    }

    if (componentsImportResult.needsFallbackWarehouse && !componentsFallbackWarehouseId) {
      setSaveMsg({ type: 'error', text: 'اختر المخزن للصفوف التي فيها رصيد بدون كود لوكيشن.' });
      return;
    }

    const materialsToCreate = componentsImportResult.materialsToCreate;
    const bomGroups = componentsImportResult.bomGroups.map((g) => ({
      ...g,
      items: g.items.map((item) => ({ ...item })),
    }));
    const stockMovements = componentsImportResult.stockMovements.map((m) => ({ ...m }));
    if (materialsToCreate.length > 0 && !componentMaterialImportEnabled) {
      toast.error('مسار إنشاء المواد من استيراد المكونات متوقف من إعدادات النظام.');
      return;
    }
    if (bomGroups.length > 0 && !componentBomImportEnabled) {
      toast.error('مسار تحديث BOM من استيراد المكونات متوقف من إعدادات النظام.');
      return;
    }
    if (stockMovements.length > 0 && !componentStockImportEnabled) {
      toast.error('مسار تسوية أرصدة المكونات بالاستيراد متوقف من إعدادات النظام.');
      return;
    }
    const bomGroupCount = componentsImportResult.bomGroupCount;
    const stockMovementCount = componentsImportResult.stockMovementCount;
    const newMaterialCount = materialsToCreate.length;
    const fallbackWarehouseId = componentsFallbackWarehouseId;
    const fallbackWarehouse = warehouses.find((w) => w.id === fallbackWarehouseId);
    const totalSteps = materialsToCreate.length + bomGroups.length + stockMovements.length;
    const jobId = addJob({
      fileName: componentsImportFileName || 'product_components.xlsx',
      jobType: 'Product Components Import',
      totalRows: totalSteps,
      startedBy: userDisplayName || 'Current User',
    });

    setComponentsImportSaving(true);
    setComponentsImportProgress({ done: 0, total: totalSteps });
    startJob(jobId, 'Creating materials and saving BOM...');
    setShowComponentsImportModal(false);
    setComponentsImportResult(null);
    setComponentsImportFileName('');
    setComponentsFallbackWarehouseId('');

    let done = 0;
    let failed = 0;
    let stockFailed = 0;
    let stockSaved = 0;
    const stockErrorSamples: string[] = [];
    const createdMaterialIds = new Map<string, string>();

    for (const material of materialsToCreate) {
      if (isBackgroundJobCancelled(jobId)) {
        failJob(jobId, 'Cancelled by user', 'Cancelled');
        setComponentsImportSaving(false);
        setSaveMsg({ type: 'error', text: 'تم إلغاء استيراد المكونات.' });
        return;
      }
      try {
        const { id } = await materialService.createOrGetByCode({
          code: material.code,
          name: material.name,
          type: 'raw_material',
          baseUnit: 'piece',
          purchaseCost: material.purchaseCost,
          wastePercent: 0,
          conversionRate: 1,
          isActive: true,
          linkedCostCenterIds: [],
        }, { path: MATERIAL_CREATE_PATHS.productsComponentsImport });
        createdMaterialIds.set(material.code.toUpperCase(), id);
      } catch (error) {
        failed++;
        console.error('[components-import] Failed creating material', material.code, error);
      }
      done++;
      setComponentsImportProgress({ done, total: totalSteps });
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: totalSteps,
        statusText: 'Creating materials...',
        status: 'processing',
      });
    }

    const resolveMaterialId = (materialId: string, materialCode: string, willCreate?: boolean) => {
      if (!willCreate && materialId && !materialId.startsWith('pending:')) return materialId;
      const code = materialCode.trim().toUpperCase();
      return createdMaterialIds.get(code) || '';
    };

    for (const group of bomGroups) {
      if (isBackgroundJobCancelled(jobId)) {
        failJob(jobId, 'Cancelled by user', 'Cancelled');
        setComponentsImportSaving(false);
        setSaveMsg({ type: 'error', text: 'تم إلغاء استيراد المكونات.' });
        return;
      }
      try {
        const items = group.items
          .map((item) => {
            const materialId = resolveMaterialId(item.materialId, item.materialCode, item.willCreateMaterial);
            if (!materialId) return null;
            return {
              materialId,
              materialName: item.materialName,
              materialUnit: item.materialUnit || 'piece',
              quantityUsed: item.quantityUsed,
              unitCost: item.unitCost,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (items.length === 0) throw new Error('لا توجد مواد صالحة لحفظ BOM');
        await saveBomItemsForProduct(group.productId, items);
      } catch (error) {
        failed++;
        console.error('[components-import] Failed BOM for product', group.productCode, error);
      }
      done++;
      setComponentsImportProgress({ done, total: totalSteps });
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: totalSteps,
        statusText: 'Saving BOM...',
        status: 'processing',
      });
    }

    const defaultsSet = new Set<string>();
    const importBatchId = `PCI-${Date.now()}`;
    const STOCK_STEP_TIMEOUT_MS = 45_000;

    const withTimeout = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`انتهت المهلة (45ث): ${label}`)),
              STOCK_STEP_TIMEOUT_MS,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    for (let movementIndex = 0; movementIndex < stockMovements.length; movementIndex++) {
      if (isBackgroundJobCancelled(jobId)) {
        failJob(jobId, 'Cancelled by user', 'Cancelled');
        setComponentsImportSaving(false);
        setSaveMsg({ type: 'error', text: 'تم إلغاء استيراد المكونات.' });
        return;
      }

      const movement = stockMovements[movementIndex];
      try {
        const materialId = resolveMaterialId(
          movement.materialId,
          movement.materialCode,
          movement.willCreateMaterial,
        );
        if (!materialId) throw new Error(`تعذر تحديد المادة ${movement.materialCode}`);
        const warehouseId = movement.warehouseId || fallbackWarehouseId;
        if (!warehouseId) {
          throw new Error('المخزن مطلوب لحركة الرصيد.');
        }
        const warehouseName =
          movement.warehouseName ||
          fallbackWarehouse?.name ||
          warehouses.find((w) => w.id === warehouseId)?.name;

        // Live current qty so fallback-warehouse rows adjust correctly.
        let currentQty = Number(movement.currentQuantity || 0);
        try {
          if (movement.locationId) {
            const locBals = await withTimeout(
              stockService.getLocationBalances({
                warehouseId,
                locationId: movement.locationId,
                itemType: stockItemTypeForMaterials,
                itemId: materialId,
              }),
              `bal-loc ${movement.materialCode}`,
            );
            currentQty = Number(locBals[0]?.quantity || 0);
          } else {
            currentQty = await withTimeout(
              stockService.getBalance(warehouseId, stockItemTypeForMaterials, materialId),
              `bal-wh ${movement.materialCode}`,
            );
          }
        } catch {
          // Keep planned currentQuantity
        }

        const targetQty = Number(movement.quantity);
        const delta = targetQty - currentQty;
        if (delta === 0) {
          stockSaved++;
          done++;
          setComponentsImportProgress({ done, total: totalSteps });
          continue;
        }

        const movementId = await withTimeout(
          stockService.createMovement({
            warehouseId,
            locationId: movement.locationId,
            locationCode: movement.locationCode,
            itemType: stockItemTypeForMaterials,
            itemId: materialId,
            itemName: movement.materialName,
            itemCode: movement.materialCode,
            movementType: 'ADJUSTMENT',
            quantity: delta,
            unit: movement.materialUnit || 'piece',
            referenceNo: `${importBatchId}-${movementIndex + 1}`,
            note: `جرد مكونات المنتجات → ${targetQty}`,
            adjustmentReason: 'count_correction',
            sourceModule: 'manual_movement',
            createdBy: userDisplayName || 'Current User',
          }, { path: INVENTORY_STOCK_MOVE_PATHS.productsComponentImport }),
          movement.materialCode || `row ${movementIndex + 1}`,
        );
        if (!movementId) {
          throw new Error(`تعذر حفظ رصيد ${movement.materialCode}`);
        }
        stockSaved++;

        if (movement.locationId && movement.locationCode) {
          const defaultKey = `${warehouseId}__${stockItemTypeForMaterials}__${materialId}`;
          if (!defaultsSet.has(defaultKey)) {
            defaultsSet.add(defaultKey);
            try {
              await withTimeout(
                defaultItemLocationService.set({
                  warehouseId,
                  warehouseName,
                  itemType: stockItemTypeForMaterials,
                  itemId: materialId,
                  itemName: movement.materialName,
                  itemCode: movement.materialCode,
                  locationId: movement.locationId,
                  locationCode: movement.locationCode,
                }),
                `default-loc ${movement.materialCode}`,
              );
            } catch (defaultErr) {
              console.warn('[components-import] default location skipped', defaultErr);
            }
          }
        }
      } catch (error) {
        failed++;
        stockFailed++;
        const msg = error instanceof Error ? error.message : String(error || 'unknown');
        if (stockErrorSamples.length < 3) {
          stockErrorSamples.push(`${movement.materialCode || `#${movementIndex + 1}`}: ${msg}`);
        }
        console.error('[components-import] Failed stock movement', movement.materialCode, error);
      }
      done++;
      setComponentsImportProgress({ done, total: totalSteps });
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: totalSteps,
        statusText: `Saving stock... ${movement.materialCode || ''}`.trim(),
        status: 'processing',
      });
    }

    if (isBackgroundJobCancelled(jobId)) {
      failJob(jobId, 'Cancelled by user', 'Cancelled');
      setComponentsImportSaving(false);
      setSaveMsg({ type: 'error', text: 'تم إلغاء استيراد المكونات.' });
      return;
    }

    const addedRows = Math.max(0, done - failed);
    const stockErrorHint =
      stockErrorSamples.length > 0 ? ` السبب: ${stockErrorSamples.join(' | ')}` : '';
    if (stockMovements.length > 0 && stockSaved === 0) {
      failJob(
        jobId,
        `BOM قد يُحفظ لكن الرصيد فشل بالكامل (${stockFailed} حركة). أعد الرفع.${stockErrorHint}`,
        'Stock failed',
      );
    } else if (addedRows === 0 && failed > 0) {
      failJob(jobId, `All rows failed during save.${stockErrorHint}`, 'Failed');
    } else {
      completeJob(jobId, {
        addedRows,
        failedRows: failed,
        statusText: stockFailed > 0 ? `Completed with ${stockFailed} stock errors` : 'Completed',
      });
    }
    setComponentsImportSaving(false);
    setSaveMsg({
      type: stockSaved === 0 && stockMovements.length > 0 ? 'error' : failed > 0 ? 'error' : 'success',
      text:
        stockMovements.length > 0 && stockSaved === 0
          ? `فشل حفظ الرصيد بالكامل (${stockFailed}). المكونات/BOM قد تكون اتحفظت — أعد رفع الشيت للرصيد.${stockErrorHint}`
          : failed > 0
            ? `تم الحفظ مع ${failed} فشل (رصيد نجح: ${stockSaved}/${stockMovements.length}).${stockErrorHint}`
            : `تم حفظ/تحديث ${bomGroupCount} منتج` +
              (newMaterialCount > 0 ? ` و${newMaterialCount} مادة جديدة` : '') +
              (stockMovementCount > 0 ? ` و${stockMovementCount} تسوية رصيد` : '') +
              '.',
    });
  };

  const openBomExportModal = () => {
    if (!canExportFromPage || _rawProducts.length === 0 || exportingBom) return;
    setBomExportCategoryFilter(categoryFilter || '');
    setShowBomExportModal(true);
  };

  const handleExportProductBom = async (categoryFilterValue = bomExportCategoryFilter) => {
    if (!canExportFromPage || _rawProducts.length === 0) return;
    setExportingBom(true);
    setSaveMsg(null);
    try {
      const [materials, locationRows, locationBalances, warehouseBalances] = await Promise.all([
        materialService.getAll(),
        warehouseLocationService.getAll(),
        stockService.getLocationBalances(),
        stockService.getBalances(),
      ]);
      const materialById = new Map(materials.map((m) => [m.id || '', m]));
      const locationById = new Map(
        locationRows.filter((l) => l.id).map((l) => [l.id!, l]),
      );

      const locBalancesByItem = new Map<
        string,
        Array<{ locationId: string; locationCode: string; quantity: number }>
      >();
      for (const bal of locationBalances) {
        if (!bal.itemId) continue;
        const qty = Number(bal.quantity || 0);
        if (!bal.locationId) continue;
        const code =
          bal.locationCode ||
          locationById.get(bal.locationId)?.code ||
          '';
        if (!code) continue;
        const list = locBalancesByItem.get(bal.itemId) ?? [];
        list.push({ locationId: bal.locationId, locationCode: code, quantity: qty });
        locBalancesByItem.set(bal.itemId, list);
      }

      const warehouseQtyByItem = new Map<string, number>();
      for (const bal of warehouseBalances) {
        if (!bal.itemId) continue;
        const qty = Number(bal.quantity || 0);
        warehouseQtyByItem.set(
          bal.itemId,
          (warehouseQtyByItem.get(bal.itemId) || 0) + qty,
        );
      }

      const productsSorted = _rawProducts
        .filter((product) => productMatchesCategoryFilter({
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          model: product.model,
        }, categoryFilterValue))
        .sort((a, b) =>
          String(a.code || '').localeCompare(String(b.code || ''), 'ar'),
        );

      if (productsSorted.length === 0) {
        setSaveMsg({
          type: 'error',
          text: categoryFilterValue
            ? 'لا توجد منتجات في الفئة المختارة للتصدير.'
            : 'لا توجد منتجات للتصدير.',
        });
        return;
      }

      const exportRows: ProductBomExportRow[] = [];
      await Promise.all(
        productsSorted.map(async (product) => {
          if (!product.id) return;
          const { items } = await bomService.getActiveBomWithLegacyFallback('product', product.id);
          if (items.length === 0) return;
          const sortedItems = [...items].sort(
            (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
          );
          for (const item of sortedItems) {
            if (item.itemType !== 'material' || !item.itemId) continue;
            const mat = materialById.get(item.itemId);
            const materialCode = mat?.code || '';
            const materialName = mat?.name || item.itemName || '';
            if (!materialCode && !materialName) continue;
            const unitKey = String(item.unit || mat?.baseUnit || '').trim() as MaterialUnit;
            const typeKey = (mat?.type || '') as MaterialType;
            const waste = item.wastePercent != null
              ? Number(item.wastePercent)
              : mat?.wastePercent != null
                ? Number(mat.wastePercent)
                : undefined;
            const base = {
              productCode: product.code || '',
              productName: product.name || '',
              materialCode: materialCode || materialName,
              materialName: materialName || materialCode,
              materialType: typeKey && MATERIAL_TYPE_LABELS[typeKey]
                ? MATERIAL_TYPE_LABELS[typeKey]
                : '',
              materialCategory: mat?.categoryName || '',
              unit: MATERIAL_UNIT_LABELS[unitKey] || unitKey || '',
              qtyPerUnit: Number(item.qtyPerUnit || 0),
              wastePercent: waste != null && Number.isFinite(waste) ? waste : undefined,
              unitCost:
                item.directCostPerUnit != null && Number(item.directCostPerUnit) > 0
                  ? Number(item.directCostPerUnit)
                  : mat?.purchaseCost != null
                    ? Number(mat.purchaseCost)
                    : undefined,
            };
            const locBals = locBalancesByItem.get(item.itemId) ?? [];
            if (locBals.length > 0) {
              for (const lb of locBals) {
                exportRows.push({
                  ...base,
                  locationCode: lb.locationCode,
                  previousLocationCode: lb.locationCode,
                  balanceQty: lb.quantity,
                });
              }
            } else if (warehouseQtyByItem.has(item.itemId)) {
              exportRows.push({
                ...base,
                locationCode: '',
                balanceQty: warehouseQtyByItem.get(item.itemId) ?? 0,
              });
            } else {
              exportRows.push({
                ...base,
                locationCode: '',
                balanceQty: '',
              });
            }
          }
        }),
      );

      exportRows.sort((a, b) => {
        const c = a.productCode.localeCompare(b.productCode, 'ar');
        if (c !== 0) return c;
        return a.materialCode.localeCompare(b.materialCode, 'ar');
      });

      if (exportRows.length === 0) {
        setSaveMsg({
          type: 'error',
          text: categoryFilterValue
            ? 'لا توجد مكونات BOM لمنتجات الفئة المختارة.'
            : 'لا توجد مكونات BOM للتصدير.',
        });
        return;
      }
      exportProductBomExcel(exportRows);
      const categoryLabel = categoryFilterValue
        ? (mergedCategoryFilterOptions.find((o) => o.value === categoryFilterValue)?.label
          || categoryFilterValue.replace(/^name:/, ''))
        : '';
      setShowBomExportModal(false);
      setSaveMsg({
        type: 'success',
        text: `تم تصدير ${exportRows.length} صف مكونات`
          + (categoryLabel ? ` (فئة: ${categoryLabel})` : '')
          + '. عدّل الشيت ثم ارفعه من قائمة «مكونات» → رفع/تحديث مكونات المنتجات.',
      });
    } catch (error) {
      console.error('[products] BOM export failed', error);
      setSaveMsg({ type: 'error', text: 'فشل تصدير مكونات المنتجات.' });
    } finally {
      setExportingBom(false);
    }
  };

  const doExportProducts = async (warehouseId?: string) => {
    setExportingProducts(true);
    try {
    let monthExportSavedMap: Record<string, ProductCostData> = {};
    /** كميات مسجّلة في monthly_production_costs (نفس الجدول في صفحة التكلفة الشهرية) */
    const monthlyRecordQtyByProductId: Record<string, number> = {};
    const exportMonthProductIdSet = new Set<string>();

    if (exportScope === 'current_month') {
      const monthKeyNorm = /^\d{4}-\d{2}$/.test(exportMonth) ? exportMonth : getCurrentMonth();
      try {
        const rows = await monthlyProductionCostService.getByMonth(monthKeyNorm);
        for (const row of rows) {
          const pid = String(row.productId || '').trim();
          if (!pid) continue;
          const qty = Number(row.totalProducedQty || 0);
          monthlyRecordQtyByProductId[pid] = qty;
          if (qty > 0) exportMonthProductIdSet.add(pid);
          if (canViewCosts) {
            const labor = Number(row.directCost || 0);
            const indirect = Number(row.indirectCost || 0);
            const total = Number(row.totalProductionCost || (labor + indirect));
            monthExportSavedMap[pid] = {
              laborCost: labor,
              indirectCost: indirect,
              totalCost: total,
              quantityProduced: qty,
              costPerUnit: qty > 0 ? total / qty : Number(row.averageUnitCost || 0),
            };
          }
        }
      } catch {
        monthExportSavedMap = {};
      }
      for (const [pid, qty] of Object.entries(exportMonthQtyByProductId)) {
        if (Number(qty) > 0) exportMonthProductIdSet.add(pid);
      }
    }

    const monthExportDisplayQty = (productId: string): number => {
      if (exportScope === 'current_month') {
        if (Object.prototype.hasOwnProperty.call(monthlyRecordQtyByProductId, productId)) {
          return monthlyRecordQtyByProductId[productId] ?? 0;
        }
        return exportMonthQtyByProductId[productId] ?? 0;
      }
      /** تصدير كل المنتجات: عمود الكمية من تقارير الشهر المختار في النافذة */
      return exportMonthQtyByProductId[productId] ?? 0;
    };

    const hourlyRateExport = Number(laborSettings?.hourlyRate ?? 0);
    const resolveExportCostData = (productId: string): ProductCostData => {
      if (exportScope !== 'current_month') {
        return (
          productCosts[productId] ?? {
            laborCost: 0,
            indirectCost: 0,
            totalCost: 0,
            quantityProduced: 0,
            costPerUnit: 0,
          }
        );
      }
      const saved = monthExportSavedMap[productId];
      if (saved) return saved;
      return buildProductAvgCost(
        productId,
        exportMonthReports,
        hourlyRateExport,
        costCenters,
        costCenterValues,
        costAllocations,
      );
    };

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
    try {
      const loaded = await loadProductMaterialsByProductIds(
        _rawProducts.map((rp) => rp.id).filter(Boolean) as string[],
      );
      Object.entries(loaded).forEach(([id, mats]) => materialsByProduct.set(id, mats));
    } catch {
      _rawProducts.forEach((rp) => {
        if (rp.id) materialsByProduct.set(rp.id, []);
      });
    }

    const selectedWarehouse = warehouseId
      ? warehouses.find((w) => w.id === warehouseId)
      : undefined;
    const sourceProducts =
      exportScope === 'current_month'
        ? productsForTable.filter((p) =>
            exportMonthProductIdSet.size > 0
              ? exportMonthProductIdSet.has(p.id)
              : (exportMonthQtyByProductId[p.id] ?? 0) > 0,
          )
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
      const costData = resolveExportCostData(pid);
      const monthlyCostRow = canViewCosts
        ? {
            laborCost: costData.laborCost,
            indirectCost: costData.indirectCost,
            totalCost: costData.totalCost,
            costPerUnit: costData.costPerUnit,
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
          monthlyProductionQty: monthExportDisplayQty(p.id),
          monthlyCost: monthlyCostRow,
        };
      }

      const materials = raw.id ? (materialsByProduct.get(raw.id) ?? []) : [];
      const breakdown = calculateProductCostBreakdown(raw, materials, costData.costPerUnit ?? 0);
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
        monthlyProductionQty: monthExportDisplayQty(p.id),
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
    const monthKeyNorm = /^\d{4}-\d{2}$/.test(exportMonth) ? exportMonth : getCurrentMonth();
    const fileMeta =
      exportScope === 'current_month'
        ? { sheetName: `منتجات ${monthKeyNorm}`, fileBaseName: `المنتجات-شهر-${monthKeyNorm}` }
        : {
            sheetName: `المنتجات ${monthKeyNorm}`,
            fileBaseName: `المنتجات-${date}-انتاج-${monthKeyNorm}`,
          };

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

  const layoutToggle = (
    <div
      className="inline-flex items-center gap-0.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] p-0.5"
      role="group"
      aria-label="طريقة العرض"
    >
      <button
        type="button"
        onClick={() => setLayoutModePersist('table')}
        className={`inline-flex items-center gap-1.5 rounded-[calc(var(--border-radius-base)-2px)] px-3 py-1.5 text-xs font-bold transition-colors ${
          layoutMode === 'table'
            ? 'bg-primary text-white'
            : 'text-[var(--color-text-muted)] hover:bg-[#f8f9fa] hover:text-[var(--color-text)]'
        }`}
        title="عرض جدول"
        aria-pressed={layoutMode === 'table'}
      >
        <List className="size-3.5" aria-hidden />
        جدول
      </button>
      <button
        type="button"
        onClick={() => setLayoutModePersist('grid')}
        className={`inline-flex items-center gap-1.5 rounded-[calc(var(--border-radius-base)-2px)] px-3 py-1.5 text-xs font-bold transition-colors ${
          layoutMode === 'grid'
            ? 'bg-primary text-white'
            : 'text-[var(--color-text-muted)] hover:bg-[#f8f9fa] hover:text-[var(--color-text)]'
        }`}
        title="عرض بطاقات"
        aria-pressed={layoutMode === 'grid'}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        بطاقات
      </button>
    </div>
  );

  return (
    <ModuleOpsPageShell
      eyebrow="إدارة المنتجات"
      rangeLabel="ترتيب الاستيراد: مواد تصنيعية ← بيانات المنتجات ← مكونات (BOM/قطع صيانة)"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {canCreateProductModal ? (
            <Button onClick={openCreate} data-modal-key={MODAL_KEYS.PRODUCTS_CREATE}>
              <span className="material-icons-round text-sm">add</span>
              منتج جديد
            </Button>
          ) : null}
          <PageHeader
            title=""
            backAction={false}
            moreActions={[
              {
                label: 'تصدير بيانات المنتجات (للاستيراد)',
                icon: 'table_chart',
                group: 'بيانات أساسية',
                hidden: !canExportFromPage || _rawProducts.length === 0,
                onClick: () => {
                  const rows = _rawProducts
                    .filter((p) => p.id && p.code)
                    .map((p) => ({
                      code: p.code,
                      name: p.name,
                      barcode: p.barcode || '',
                      model: p.model || p.categoryName || '',
                      isManufactured: p.isManufactured !== false,
                      chineseUnitCost: canViewCosts ? Number(p.chineseUnitCost || 0) : undefined,
                      innerBoxCost: canViewCosts ? Number(p.innerBoxCost || 0) : undefined,
                      outerCartonCost: canViewCosts ? Number(p.outerCartonCost || 0) : undefined,
                      unitsPerCarton: canViewCosts ? Number(p.unitsPerCarton || 0) : undefined,
                      sellingPrice: canViewSellingPrice ? Number(p.sellingPrice || 0) : undefined,
                      routingTargetUnitSeconds:
                        p.routingTargetUnitSeconds != null && Number(p.routingTargetUnitSeconds) > 0
                          ? Math.round(Number(p.routingTargetUnitSeconds))
                          : undefined,
                    }));
                  if (rows.length === 0) {
                    toast.error('لا توجد منتجات للتصدير.');
                    return;
                  }
                  exportProductsBasicMaster(rows, {
                    includeCosts: canViewCosts,
                    includeSellingPrice: canViewSellingPrice,
                  });
                  toast.success(`تم تصدير ${rows.length} منتج (بيانات أساسية للاستيراد).`);
                },
              },
              {
                label: 'تحميل قالب بيانات المنتجات',
                icon: 'file_download',
                group: 'بيانات أساسية',
                hidden: !canImportFromPage,
                onClick: downloadProductsTemplate,
              },
              {
                label: 'رفع/تحديث بيانات المنتجات',
                icon: 'upload_file',
                group: 'بيانات أساسية',
                hidden: !canImportProducts,
                onClick: () => fileInputRef.current?.click(),
              },
              {
                label: exportingBom ? 'جاري تصدير المكونات...' : 'تصدير مكونات المنتجات (للاستيراد)',
                icon: 'table_chart',
                group: 'مكونات',
                hidden: !canExportFromPage || _rawProducts.length === 0,
                onClick: openBomExportModal,
              },
              {
                label: 'تحميل قالب المكونات',
                icon: 'file_download',
                group: 'مكونات',
                hidden: !canImportFromPage,
                onClick: downloadProductComponentsTemplate,
              },
              {
                label: 'رفع/تحديث مكونات المنتجات',
                icon: 'upload_file',
                group: 'مكونات',
                hidden: !canImportFromPage,
                onClick: () => componentsFileInputRef.current?.click(),
              },
              {
                label: 'تصدير تقرير المنتجات (Excel)',
                icon: 'table_chart',
                group: 'تقارير',
                hidden: !canExportFromPage || products.length === 0,
                onClick: () => {
                  setExportScope('all');
                  setExportMonth(getCurrentMonth());
                  setExportColumnPrefs({ ...visibleColumns });
                  setShowWarehouseExportModal(true);
                },
              },
              {
                label: 'تصدير تقرير المنتجات بإنتاج الشهر',
                icon: 'table_chart',
                group: 'تقارير',
                hidden: !canExportFromPage || products.length === 0,
                onClick: () => {
                  setExportScope('current_month');
                  setExportMonth(getCurrentMonth());
                  setExportColumnPrefs({ ...visibleColumns });
                  setShowWarehouseExportModal(true);
                },
              },
              {
                label: 'إدارة الأعمدة الظاهرة',
                icon: 'view_column',
                group: 'عرض',
                hidden: !canExportFromPage || layoutMode !== 'table',
                onClick: () => setShowColumnsModal(true),
              },
            ]}
          />
        </div>
      )}
    >
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
      <input
        ref={componentsFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleComponentsFileSelect}
      />

      {saveMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold border ${
            saveMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          <ProductIcon name={saveMsg.type === 'success' ? 'check_circle' : 'error'} className="text-base shrink-0" />
          <p className="flex-1">{saveMsg.text}</p>
          <button type="button" onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors shrink-0">
            <ProductIcon name="close" className="text-base" />
          </button>
        </div>
      )}

      <OpsDashPanel
        title={sorted.length > 0 ? `قائمة المنتجات (${sorted.length})` : 'قائمة المنتجات'}
        accent="production"
        bodyClassName="p-0 overflow-hidden"
        action={layoutToggle}
      >
        <SmartFilterBar
          pageId="production-products"
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
            {
              key: 'manufactured',
              placeholder: 'تاج المصنع',
              options: [
                { value: 'yes', label: 'تصنيعي' },
                { value: 'no', label: 'غير تصنيعي' },
              ],
            },
          ]}
          quickFilterValues={{ stock: stockFilter || 'all', manufactured: manufacturedFilter || 'all' }}
          onQuickFilterChange={(key, value) => {
            const next = value === 'all' ? '' : value;
            if (key === 'stock') setStockFilter(next);
            if (key === 'manufactured') setManufacturedFilter(next);
          }}
          advancedFilters={[
            {
              key: 'category',
              label: 'الفئة',
              placeholder: 'كل الفئات',
              options: mergedCategoryFilterOptions.map((o) => ({ value: o.value, label: o.label })),
            },
          ]}
          advancedFilterValues={{ category: categoryFilter || 'all' }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'category') setCategoryFilter(value === 'all' ? '' : value);
          }}
          className="mb-0 border-0 rounded-none"
        />
        {/* Bulk bar */}
        {selectedIds.size > 0 && (
          <div className="px-5 py-3 bg-primary/5 border-b border-primary/20 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-primary">{selectedIds.size} منتج محدد</span>
            {canDeleteProduct && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (!window.confirm(`هل تريد حذف ${selectedIds.size} منتج؟`)) return;
                  Promise.all([...selectedIds].map((id) => deleteProduct(id)))
                    .then(() => {
                      setSelectedIds(new Set());
                      toast.success('تم حذف المنتجات المحددة.');
                    })
                    .catch((error) => {
                      toast.error(error instanceof Error ? error.message : 'تعذر حذف المنتجات المحددة.');
                    });
                }}
              >
                حذف المحدد
              </Button>
            )}
            {canBulkUpdateProducts && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkToggleSaving}
                  onClick={() => void handleBulkAssemblyModeChange('individual')}
                >
                  تحويل لفردي
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkToggleSaving}
                  onClick={() => void handleBulkAssemblyModeChange('team')}
                >
                  تحويل لجماعي
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkToggleSaving}
                  onClick={() => {
                    setBulkCategoryId(null);
                    setBulkCategoryLabel('');
                    setShowBulkCategoryModal(true);
                  }}
                >
                  تحويل لفئة
                </Button>
              </>
            )}
            {canToggleProductSettings && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkToggleSaving}
                  onClick={async () => {
                    if (bulkToggleSaving) return;
                    setBulkToggleSaving(true);
                    try {
                      await Promise.all(
                        [...selectedIds].map((id) =>
                          updateProduct(
                            id,
                            { autoDeductComponentScrapFromDecomposed: true },
                            { path: PRODUCT_UPDATE_PATHS.productsPageToggle },
                          ),
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
                  تفعيل خصم الهالك
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkToggleSaving}
                  onClick={async () => {
                    if (bulkToggleSaving) return;
                    setBulkToggleSaving(true);
                    try {
                      await Promise.all(
                        [...selectedIds].map((id) =>
                          updateProduct(
                            id,
                            { autoDeductComponentScrapFromDecomposed: false },
                            { path: PRODUCT_UPDATE_PATHS.productsPageToggle },
                          ),
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
                  تعطيل خصم الهالك
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={countCardPreviewBusy}
              onClick={() => void openProductBomCountCardPreview([...selectedIds])}
              title="معاينة وطباعة كروت جرد بالمكونات والأرصدة للمنتجات المحددة"
            >
              {countCardPreviewBusy ? 'جاري...' : 'كروت الجرد'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              إلغاء التحديد
            </Button>
          </div>
        )}

        {productsLoading ? (
          <div className="p-4 space-y-3" aria-busy="true" aria-label="جاري تحميل المنتجات">
            {layoutMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-44 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] animate-pulse"
                />
              ))
            )}
          </div>
        ) : layoutMode === 'table' ? (
        <>
        <div className="erp-mobile-card-list p-2">
          {sorted.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400">
              <ProductIcon name="inventory_2" className="text-5xl mb-3 block opacity-30 mx-auto" />
              <p className="font-bold">لا توجد منتجات{search || categoryFilter || stockFilter || manufacturedFilter ? ' مطابقة للبحث' : ' بعد'}</p>
            </div>
          ) : (
            paginated.map((product) => {
              const finalBalance = productWarehouseBalances.getValue(planSettings?.finalProductWarehouseId, product.id);
              return (
                <div
                  key={`m-${product.id}`}
                  className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm ${selectedIds.has(product.id) ? 'ring-1 ring-primary/40' : ''}`}
                  onClick={() => setDetailDrawerProductId(product.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDetailDrawerProductId(product.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 cursor-pointer"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleRow(product.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{shortProductName(product.name)}</p>
                      <p className="font-mono text-[11px] text-slate-400">{product.code}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          product.isManufactured === false ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'
                        }`}>
                          {product.isManufactured === false ? 'غير تصنيعي' : 'تصنيعي'}
                        </span>
                        {product.category ? <Badge variant="neutral">{product.category}</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    {visibleColumns.stockLevel ? (
                      <div>
                        <dt className="text-[10px] text-muted-foreground">منتج تام</dt>
                        <dd className="font-bold tabular-nums">{formatNumber(finalBalance)}</dd>
                      </div>
                    ) : null}
                    {canViewSellingPrice && visibleColumns.sellingPrice ? (
                      <div>
                        <dt className="text-[10px] text-muted-foreground">سعر البيع</dt>
                        <dd className="tabular-nums">
                          {formatCost((_rawProducts.find((r) => r.id === product.id)?.sellingPrice ?? 0))} ج.م
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    <TableIconAction action="view" onClick={() => setDetailDrawerProductId(product.id)} />
                    {canUpdateProductModal && (
                      <TableIconAction action="edit" onClick={() => openEdit(product.id)} />
                    )}
                    {canDeleteProduct && (
                      <TableIconAction action="delete" onClick={() => setDeleteConfirmId(product.id)} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="erp-desktop-table overflow-x-auto">
          <table className="erp-table w-full min-w-[960px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th w-10 text-center">
                  <input type="checkbox" checked={allPageSelected} ref={(el) => { if (el) el.indeterminate = somePageSelected; }} onChange={toggleSelectAll} className="cursor-pointer" />
                </th>
                <th className="erp-th cursor-pointer select-none" onClick={() => handleSort('name')}>المنتج <SortIcon col="name" /></th>
                <th className="erp-th text-center">تاج المصنع</th>
                <th className="erp-th text-center">نمط التجميع</th>
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
                    <p className="font-bold text-lg">لا توجد منتجات{search || categoryFilter || stockFilter || manufacturedFilter ? ' مطابقة للبحث' : ' بعد'}</p>
                    <p className="text-sm mt-1">
                      {canCreateProductModal
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
                  title="عرض ملخص المنتج"
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
                            setDetailDrawerProductId(product.id);
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
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                        product.isManufactured === false
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      {product.isManufactured === false ? 'غير تصنيعي' : 'تصنيعي'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                        product.assemblyMode === 'team'
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {product.assemblyMode === 'team' ? 'جماعي' : 'فردي'}
                    </span>
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
                    <div className="flex items-center gap-1 justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <TableIconAction
                        action="view"
                        onClick={() => setDetailDrawerProductId(product.id)}
                      />
                      {canUpdateProductModal && (
                        <TableIconAction
                          action="edit"
                          onClick={() => openEdit(product.id)}
                        />
                      )}
                      {canDeleteProduct && (
                        <TableIconAction
                          action="delete"
                          onClick={() => setDeleteConfirmId(product.id)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        </>
        ) : (
        <div className="p-4">
          {sorted.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400">
              <ProductIcon name="inventory_2" className="text-5xl mb-3 block opacity-30 mx-auto" />
              <p className="font-bold text-lg">لا توجد منتجات{search || categoryFilter || stockFilter ? ' مطابقة للبحث' : ' بعد'}</p>
              <p className="text-sm mt-1">
                {canCreateProductModal
                  ? 'اضغط "إضافة منتج جديد" لإضافة أول منتج'
                  : 'لا توجد منتجات لعرضها حالياً'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 px-1">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                  id="products-grid-select-all"
                />
                <label htmlFor="products-grid-select-all" className="text-xs font-bold text-[var(--color-text-muted)] cursor-pointer">
                  تحديد صفوف الصفحة ({paginated.length})
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {paginated.map((product) => {
                  const finalBalance = productWarehouseBalances.getValue(
                    planSettings?.finalProductWarehouseId,
                    product.id,
                  );
                  const selling = _rawProducts.find((r) => r.id === product.id)?.sellingPrice ?? 0;
                  const selected = selectedIds.has(product.id);
                  return (
                    <div
                      key={product.id}
                      className={`rounded-[var(--border-radius-lg)] border bg-[var(--color-card)] p-4 transition-colors cursor-pointer hover:border-primary/40 ${
                        selected ? 'border-primary/40 bg-primary/5' : 'border-[var(--color-border)]'
                      }`}
                      onClick={() => setDetailDrawerProductId(product.id)}
                      title="عرض ملخص المنتج"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleRow(product.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 cursor-pointer shrink-0"
                          aria-label={`تحديد ${product.name}`}
                        />
                        <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 border border-primary/10">
                          <ProductIcon name="inventory_2" className="text-primary text-lg" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-[var(--color-text)] truncate" title={product.name}>
                            {shortProductName(product.name)}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400 mt-0.5">{product.code}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {product.category ? <Badge variant="neutral">{product.category}</Badge> : null}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                product.isManufactured === false
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-sky-50 text-sky-700'
                              }`}
                            >
                              {product.isManufactured === false ? 'غير تصنيعي' : 'تصنيعي'}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                product.assemblyMode === 'team'
                                  ? 'bg-indigo-50 text-indigo-600'
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {product.assemblyMode === 'team' ? 'جماعي' : 'فردي'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2">
                          <span className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">منتج تام</span>
                          <span
                            className={`font-black tabular-nums ${
                              finalBalance > 100
                                ? 'text-[var(--color-text)]'
                                : finalBalance > 0
                                  ? 'text-amber-600'
                                  : 'text-rose-500'
                            }`}
                          >
                            {formatNumber(finalBalance)}
                          </span>
                        </div>
                        <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2">
                          <span className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">إنتاج الشهر</span>
                          <span className="font-black tabular-nums text-sky-700">
                            {formatNumber(monthlyQtyByProductId[product.id] ?? 0)}
                          </span>
                        </div>
                        {canViewSellingPrice && (
                          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 col-span-2">
                            <span className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">سعر البيع</span>
                            <span className="font-black tabular-nums text-[var(--color-text)]">
                              {formatCost(selling)} ج.م
                            </span>
                          </div>
                        )}
                      </div>

                      <div
                        className="mt-3 flex items-center justify-end gap-1.5 border-t border-[var(--color-border)] pt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ToneActionButton
                          action="view"
                          onClick={() => setDetailDrawerProductId(product.id)}
                        >
                          عرض
                        </ToneActionButton>
                        {canUpdateProductModal && (
                          <ToneActionButton
                            action="edit"
                            onClick={() => openEdit(product.id)}
                          >
                            تعديل
                          </ToneActionButton>
                        )}
                        {canDeleteProduct && (
                          <TableIconAction
                            action="delete"
                            onClick={() => setDeleteConfirmId(product.id)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        )}
        {!productsLoading && (
          <DataPaginationFooter
            page={page}
            totalPages={totalPages}
            totalItems={sorted.length}
            onPageChange={setCurrentPage}
            itemLabel="منتج"
          />
        )}
      </OpsDashPanel>

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
                    title="معاينة كارت جرد"
                    disabled={countCardPreviewBusy}
                    onClick={() => void openProductBomCountCardPreview([p.id])}
                    className="p-2 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  >
                    {countCardPreviewBusy ? (
                      <Loader2 className="size-[18px] animate-spin" />
                    ) : (
                      <ClipboardList className="size-[18px]" />
                    )}
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

                <div className="flex flex-col gap-2 pt-1 sticky bottom-0 bg-[var(--color-card)] pb-1">
                  <ToneActionButton
                    action="open"
                    solid
                    className="w-full"
                    onClick={() => {
                      const id = p.id;
                      setDetailDrawerProductId(null);
                      navigate(`/products/${id}`);
                    }}
                  >
                    عرض كامل
                  </ToneActionButton>
                  {canUpdateProductModal && (
                    <ToneActionButton
                      action="edit"
                      className="w-full"
                      onClick={() => {
                        const id = p.id;
                        setDetailDrawerProductId(null);
                        openEdit(id);
                      }}
                    >
                      تعديل
                    </ToneActionButton>
                  )}
                </div>
              </div>
            </aside>
          </>
        );
      })()}


      {/* â”€â”€ Delete Confirmation â”€â”€ */}
      {deleteConfirmId && canDeleteProduct && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ProductIcon name="delete_forever" className="text-rose-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                نعم، احذف
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowImportModal(false); setImportResult(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-5xl border border-[var(--color-border)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4">
                  <ProductIcon name="drag_indicator" className="text-[var(--color-text-muted)] cursor-move select-none" aria-hidden="true" />
                  <h3 className="text-lg font-bold">رفع/تحديث بيانات المنتجات</h3>
                </div>
                <Button variant="ghost" onClick={downloadProductsTemplate} className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline h-auto p-0">
                  تحميل قالب بيانات المنتجات
                </Button>
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
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    هذا الملف لبيانات المنتج فقط (اسم، كود، باركود، منتج تصنيعي…). الربط بالمواد يكون من «رفع/تحديث مكونات المنتجات» بعد رفع المواد من شاشة المواد التصنيعية.
                  </p>
                  <Button variant="ghost" onClick={downloadProductsTemplate} className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto h-auto p-0">
                    تحميل قالب بيانات المنتجات
                  </Button>
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

                  {importResult.fileErrors && importResult.fileErrors.length > 0 && (
                    <div className="rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                      <p className="mb-1">ملاحظات على الملف:</p>
                      <ul className="space-y-0.5">
                        {importResult.fileErrors.map((err, i) => <li key={i}>• {err}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-[var(--border-radius-lg)] border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-900 space-y-1">
                    <p>الترتيب الصحيح: مواد تصنيعية ← بيانات المنتجات ← مكونات.</p>
                    <p>بعد حفظ المنتجات ارفع المكونات من «رفع/تحديث مكونات المنتجات» (كود المنتج + كود المادة).</p>
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

      {/* Product Components Import Modal */}
      {showComponentsImportModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowComponentsImportModal(false);
            setComponentsImportResult(null);
            setComponentsFallbackWarehouseId('');
          }}
        >
          <div
            className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-6xl border border-[var(--color-border)] max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold">رفع/تحديث مكونات المنتجات</h3>
                <Button
                  variant="ghost"
                  onClick={downloadProductComponentsTemplate}
                  className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline h-auto p-0"
                >
                  تحميل قالب المكونات
                </Button>
              </div>
              <button
                onClick={() => {
                  setShowComponentsImportModal(false);
                  setComponentsImportResult(null);
                  setComponentsFallbackWarehouseId('');
                }}
                className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors"
              >
                <ProductIcon name="close" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {componentsImportParsing && (
                <div className="text-center py-12">
                  <ProductIcon name="refresh" className="animate-spin text-4xl text-primary mb-3 block" />
                  <p className="font-bold text-slate-600">جاري تحليل الملف...</p>
                </div>
              )}

              {!componentsImportParsing && componentsImportResult && componentsImportResult.totalRows === 0 && (
                <div className="text-center py-12">
                  <ProductIcon name="warning" className="text-5xl text-[var(--color-text-muted)] mb-3 block" />
                  <p className="font-bold text-slate-600">لم يتم العثور على بيانات في الملف</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    يُفضّل أن تكون المواد والمنتجات موجودة مسبقاً. كل صف = كود منتج + كود/اسم مادة.
                    الكمية المستخدمة اختيارية (فاضي/صفر = قطعة صيانة بدون استهلاك تصنيع). الرصيد واللوكيشن اختياريان للجرد.
                  </p>
                  <Button
                    variant="ghost"
                    onClick={downloadProductComponentsTemplate}
                    className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto h-auto p-0"
                  >
                    تحميل قالب المكونات
                  </Button>
                </div>
              )}

              {!componentsImportParsing && componentsImportResult && componentsImportResult.totalRows > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold">
                      الإجمالي: <span className="text-primary">{componentsImportResult.totalRows}</span>
                    </div>
                    <div className="bg-emerald-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-emerald-600">
                      صالح: {componentsImportResult.validCount}
                    </div>
                    <div className="bg-blue-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-blue-600">
                      منتجات BOM: {componentsImportResult.bomGroupCount}
                    </div>
                    {componentsImportResult.newMaterialCount > 0 && (
                      <div className="bg-indigo-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-indigo-600">
                        مواد جديدة: {componentsImportResult.newMaterialCount}
                      </div>
                    )}
                    <div className="bg-violet-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-violet-600">
                      تسويات رصيد: {componentsImportResult.stockMovementCount}
                    </div>
                    {componentsImportResult.skippedStockCount > 0 && (
                      <div className="bg-amber-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-amber-700">
                        رصيد مطابق (بدون حركة): {componentsImportResult.skippedStockCount}
                      </div>
                    )}
                    {componentsImportResult.errorCount > 0 && (
                      <div className="bg-rose-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-rose-500">
                        أخطاء: {componentsImportResult.errorCount}
                      </div>
                    )}
                    {componentsImportResult.missingQuantityCount > 0 && (
                      <div className="bg-amber-50 rounded-[var(--border-radius-lg)] px-4 py-2 text-sm font-bold text-amber-700">
                        بدون كمية استخدام: {componentsImportResult.missingQuantityCount}
                      </div>
                    )}
                  </div>

                  {componentsImportResult.stockMovementCount > 0 ||
                  componentsImportResult.skippedStockCount > 0 ||
                  componentsImportResult.rows.some(
                    (r) => r.previousLocationId && r.previousLocationId !== r.locationId,
                  ) ? (
                    <div className="rounded-[var(--border-radius-lg)] border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-900 space-y-1">
                      <p>تحديث BOM للموجود + إضافة الجديد. الرصيد المكتوب = الكمية الفعلية (تسوية).</p>
                      <p>نقل لوكيشن: غيّر «كود اللوكيشن» واترك «كود اللوكيشن السابق» — يُصفَّر القديم ويُضبط الجديد.</p>
                      <p>رصيد فاضي = تحديث المكونات فقط بدون لمس المخزون (إلا تصفير السابق عند تغيير اللوكيشن).</p>
                    </div>
                  ) : (
                    <div className="rounded-[var(--border-radius-lg)] border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-900">
                      سيتم تحديث/إضافة مكونات BOM. اترك رصيد المكون فاضي إن لم ترد تعديل المخزون.
                    </div>
                  )}

                  {componentsImportResult.fileErrors.length > 0 && (
                    <div className="rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                      <ul className="space-y-0.5">
                        {componentsImportResult.fileErrors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {componentsImportResult.needsFallbackWarehouse && (
                    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
                      <label className="block text-sm font-bold mb-2">
                        مخزن الرصيد (للصفوف بدون كود لوكيشن)
                      </label>
                      <select
                        className="w-full max-w-md rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
                        value={componentsFallbackWarehouseId}
                        onChange={(e) => setComponentsFallbackWarehouseId(e.target.value)}
                      >
                        <option value="">اختر المخزن...</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <table className="erp-table w-full text-right text-sm border-collapse">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th">صف</th>
                          <th className="erp-th">الحالة</th>
                          <th className="erp-th">المنتج</th>
                          <th className="erp-th">المادة</th>
                          <th className="erp-th">كمية BOM</th>
                          <th className="erp-th">تكلفة</th>
                          <th className="erp-th">اللوكيشن</th>
                          <th className="erp-th">سابق</th>
                          <th className="erp-th">رصيد</th>
                          <th className="erp-th">التفاصيل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {componentsImportResult.rows.map((row) => (
                          <tr
                            key={row.rowIndex}
                            className={
                              row.errors.length > 0
                                ? 'bg-rose-50/50 dark:bg-rose-900/10'
                                : row.skipStock
                                  ? 'bg-amber-50/40 dark:bg-amber-900/10'
                                  : row.skipNotes && row.skipNotes.length > 0
                                    ? 'bg-blue-50/30 dark:bg-blue-900/10'
                                    : ''
                            }
                          >
                            <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono">{row.rowIndex}</td>
                            <td className="px-3 py-2.5">
                              {row.errors.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-rose-500 text-xs font-bold">
                                  <ProductIcon name="error" className="text-sm" /> خطأ
                                </span>
                              ) : row.skipStock ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-bold">
                                  <ProductIcon name="remove_done" className="text-sm" /> رصيد مطابق
                                </span>
                              ) : row.skipNotes && row.skipNotes.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-bold">
                                  <ProductIcon name="sync" className="text-sm" /> تحديث
                                </span>
                              ) : row.willCreateMaterial ? (
                                <span className="inline-flex items-center gap-1 text-indigo-600 text-xs font-bold">
                                  <ProductIcon name="add_circle" className="text-sm" /> مادة جديدة
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                  <ProductIcon name="check_circle" className="text-sm" /> جاهز
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium">{row.productName || '—'}</div>
                              <div className="font-mono text-xs text-slate-500">{row.productCode || '—'}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium">{row.matchedMaterialName || row.materialName || '—'}</div>
                              <div className="font-mono text-xs text-slate-500">
                                {row.matchedMaterialCode || row.materialCode || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{row.quantityUsed || '—'}</td>
                            <td className="px-3 py-2.5 font-mono">{row.unitCost || '—'}</td>
                            <td className="px-3 py-2.5 font-mono">{row.locationCode || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-[var(--color-text-muted)]">
                              {row.previousLocationCode &&
                              row.previousLocationId !== row.locationId
                                ? row.previousLocationCode
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 font-mono">
                              {row.balanceProvided ? row.balanceQty : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.errors.length > 0 ? (
                                <ul className="text-xs text-rose-500 space-y-0.5">
                                  {row.errors.map((err, i) => (
                                    <li key={i}>• {err}</li>
                                  ))}
                                </ul>
                              ) : row.skipNotes && row.skipNotes.length > 0 ? (
                                <ul className="text-xs text-amber-700 space-y-0.5">
                                  {row.skipNotes.map((note, i) => (
                                    <li key={i}>• {note}</li>
                                  ))}
                                </ul>
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
              <Button
                variant="outline"
                onClick={() => {
                  setShowComponentsImportModal(false);
                  setComponentsImportResult(null);
                  setComponentsFallbackWarehouseId('');
                }}
              >
                إلغاء
              </Button>
              {componentsImportResult &&
                componentsImportResult.validCount > 0 &&
                (componentsImportResult.bomGroupCount > 0 ||
                  componentsImportResult.stockMovementCount > 0 ||
                  componentsImportResult.newMaterialCount > 0) && (
                <Button
                  variant="primary"
                  onClick={handleComponentsImportSave}
                  disabled={
                    componentsImportSaving ||
                    (componentsImportResult.needsFallbackWarehouse && !componentsFallbackWarehouseId)
                  }
                >
                  {componentsImportSaving ? (
                    <>
                      <ProductIcon name="refresh" className="animate-spin text-sm" />
                      {componentsImportProgress.done} / {componentsImportProgress.total}
                    </>
                  ) : (
                    <>
                      <ProductIcon name="save" className="text-sm" />
                      حفظ/تحديث {componentsImportResult.bomGroupCount} BOM
                      {componentsImportResult.stockMovementCount > 0
                        ? ` + ${componentsImportResult.stockMovementCount} تسوية`
                        : ''}
                    </>
                  )}
                </Button>
              )}
              {componentsImportResult &&
                componentsImportResult.validCount > 0 &&
                componentsImportResult.bomGroupCount === 0 &&
                componentsImportResult.stockMovementCount === 0 &&
                componentsImportResult.newMaterialCount === 0 && (
                <p className="text-sm font-bold text-amber-700">
                  لا تحديثات BOM ولا تسويات رصيد للحفظ (رصيد فاضي أو مطابق).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showBulkCategoryModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !bulkToggleSaving && setShowBulkCategoryModal(false)}
        >
          <div
            className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تحويل لفئة</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {selectedIds.size} منتج محدد
                </p>
              </div>
              <button
                type="button"
                disabled={bulkToggleSaving}
                onClick={() => setShowBulkCategoryModal(false)}
                className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors"
              >
                <ProductIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                الفئة الجديدة
              </label>
              <CategoryTreeSelect
                value={bulkCategoryId}
                onChange={(id, breadcrumb) => {
                  setBulkCategoryId(id);
                  setBulkCategoryLabel(breadcrumb);
                }}
                disabled={bulkToggleSaving}
                required
                placeholder="اختر الفئة"
              />
              <p className="text-xs text-[var(--color-text-muted)]">
                سيتم نقل كل المنتجات المحددة إلى هذه الفئة.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={bulkToggleSaving}
                onClick={() => setShowBulkCategoryModal(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                disabled={bulkToggleSaving || !bulkCategoryId}
                onClick={() => void handleBulkCategoryAssign()}
              >
                {bulkToggleSaving ? 'جاري التحويل...' : 'تحويل المحدد'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBomExportModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !exportingBom && setShowBomExportModal(false)}
        >
          <div
            className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ProductIcon name="call_split" className="text-primary" />
                <h3 className="text-lg font-bold">تصدير مكونات المنتجات (للاستيراد)</h3>
              </div>
              <button
                type="button"
                disabled={exportingBom}
                onClick={() => setShowBomExportModal(false)}
                className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors"
              >
                <ProductIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">فئة المنتجات</label>
                <Select
                  value={bomExportCategoryFilter || 'all'}
                  onValueChange={(value) => setBomExportCategoryFilter(value === 'all' ? '' : value)}
                >
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 font-medium">
                    <SelectValue placeholder="كل الفئات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفئات</SelectItem>
                    {mergedCategoryFilterOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-[var(--color-text-muted)]">
                  للتعديل ثم الرفع من «رفع/تحديث مكونات المنتجات». اختر فئة معيّنة أو اترك «كل الفئات».
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={exportingBom}
                onClick={() => setShowBomExportModal(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                disabled={exportingBom}
                onClick={() => void handleExportProductBom(bomExportCategoryFilter)}
              >
                {exportingBom ? 'جاري التصدير...' : 'تصدير Excel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export Warehouse Selector Modal */}
      {showWarehouseExportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowWarehouseExportModal(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ProductIcon name="warehouse" className="text-primary" />
                <h3 className="text-lg font-bold">
                  {exportScope === 'current_month'
                    ? 'تصدير تقرير المنتجات بإنتاج الشهر'
                    : 'تصدير تقرير المنتجات (Excel)'}
                </h3>
              </div>
              <button type="button" onClick={() => setShowWarehouseExportModal(false)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <ProductIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">شهر التصدير</label>
                <input
                  type="month"
                  value={exportMonth}
                  onChange={(e) => setExportMonth(e.target.value)}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 font-medium bg-transparent"
                />
                {exportScope === 'all' ? (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    يُصدَّر <strong>كل المنتجات</strong>؛ عمود <strong>كمية الإنتاج (شهر التصدير)</strong> يعرض مجموع تقارير التصنيع للشهر المختار (بدون تعبئة/هدر مكوّنات فقط). أعمدة التكلفة ما زالت من منطق الشهر الحالي في الصفحة كالسابق.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    يُجمَع المنتج من: (١) سجلات <strong>التكلفة الإنتاجية الشهرية</strong> المحفوظة لذلك الشهر بكمية إنتاج أكبر من صفر — كما في صفحة التكلفة الشهرية، و(٢) أي منتج له تقارير تصنيع حيّة بنفس المنطق. عمود الكمية يعرض السجل الشهري إن وُجد، وإلا التقارير.
                  </p>
                )}
              </div>
              {exportScope === 'current_month'
                && exportMonthReports.length === 0
                && exportMonthSavedActiveProductIds.length === 0
                && !exportMonthLoading && (
                <p className="text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-[var(--border-radius-lg)] px-3 py-2">
                  لا توجد تقارير إنتاج في الشهر المحدد ولا سجلات تكلفة شهرية بكمية إنتاج — قد لا يظهر أي منتج في التصدير حتى يُحسب الشهر من صفحة التكلفة الشهرية.
                </p>
              )}
              {exportScope === 'current_month' && monthExportProductCount === 0 && !exportMonthLoading && (
                <p className="text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-[var(--border-radius-lg)] px-3 py-2">
                  لا يوجد منتج بكمية إنتاج مسجّلة في الشهر المحدد.
                </p>
              )}
              {exportMonthLoading && (
                <p className="text-xs font-bold text-sky-700 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-[var(--border-radius-lg)] px-3 py-2">
                  {exportScope === 'current_month'
                    ? 'جاري تحميل تقارير الشهر وسجلات التكلفة الشهرية...'
                    : 'جاري تحميل تقارير الشهر المختار...'}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[min(50vh,320px)] overflow-y-auto pr-1">
                  {[
                    { key: 'openingStock' as const, label: 'رصيد مفكك' },
                    { key: 'totalProduction' as const, label: 'ما تم إنتاجه' },
                    { key: 'monthlyProductionQty' as const, label: 'كمية الإنتاج (شهر التصدير)' },
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
                {exportingProducts ? 'جاري التصدير...' : 'تصدير المنتجات'}
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
                <h3 className="text-lg font-bold">إدارة الأعمدة الظاهرة</h3>
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
              <Button
                variant="ghost"
                onClick={() => {
                  const empty = Object.keys(DEFAULT_VISIBLE_COLUMNS).reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<ProductTableColumnKey, boolean>);
                  setVisibleColumns(empty);
                  if (typeof window !== 'undefined') window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(empty));
                }}
                className="text-xs font-bold text-[var(--color-text-muted)] hover:text-slate-600 h-auto p-0"
              >
                إلغاء تحديد الكل
              </Button>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setShowColumnsModal(false)}>إغلاق</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProductBomCountCardPreviewModal
        open={countCardPreviewOpen}
        cards={countCardPreviewData}
        printSettings={printTemplate}
        loading={countCardPreviewBusy}
        warningText={countCardPreviewWarning}
        onClose={() => {
          setCountCardPreviewOpen(false);
          setCountCardPreviewData([]);
          setCountCardPreviewWarning(null);
        }}
      />
    </ModuleOpsPageShell>
  );
};



