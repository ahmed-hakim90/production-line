import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, Badge, Button, KPIBox } from '../components/UI';
import { useShallowStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { monthlyProductionCostService } from '../services/monthlyProductionCostService';
import { reportService } from '@/modules/production/services/reportService';
import {
  getCurrentMonth,
  formatCost,
  calculateDailyIndirectCost,
  buildLineAllocatedCostSummary,
  buildSupervisorHourlyRatesMap,
  buildSupervisorIndirectShareMap,
} from '../../../utils/costCalculations';
import { productMaterialService } from '../../production/services/productMaterialService';
import type { MonthlyProductionCost, ProductionReport } from '../../../types';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { PageHeader } from '../../../components/PageHeader';
import { Card as UiCard, CardContent } from '@/components/ui/card';
import { DetailPageShell, DetailPageStickyHeader, SURFACE_CARD } from '@/src/components/erp/DetailPageChrome';
import { toast } from '../../../components/Toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDeviationAnalysis } from '../hooks/useDeviationAnalysis';

type ExtraColumnKey = 'materialsAndPackaging' | 'sellingPrice' | 'profit';
type MonthlyCostBaseColumnKey =
  | 'rowIndex'
  | 'productCode'
  | 'productName'
  | 'month'
  | 'qty'
  | 'producedCartons'
  | 'totalCost'
  | 'directIndirect'
  | 'avgUnit'
  | 'prevMonthAvgClosed'
  | 'prevDeviation'
  | 'status';

type PrevMonthProductInfo = { avg: number; closed: boolean };

const EXTRA_COLUMNS_PREF_KEY = 'monthly_costs_extra_columns_v1';
const CENTER_COLUMNS_PREF_KEY = 'monthly_costs_center_columns_v1';
const BASE_COLUMNS_PREF_KEY = 'monthly_costs_base_columns_v1';
const DEFAULT_EXTRA_COLUMNS: Record<ExtraColumnKey, boolean> = {
  materialsAndPackaging: true,
  sellingPrice: true,
  profit: true,
};
const DEFAULT_BASE_COLUMNS: Record<MonthlyCostBaseColumnKey, boolean> = {
  rowIndex: true,
  productCode: true,
  productName: true,
  month: true,
  qty: true,
  producedCartons: true,
  totalCost: true,
  directIndirect: true,
  avgUnit: true,
  prevMonthAvgClosed: true,
  prevDeviation: true,
  status: true,
};

const BASE_COLUMN_MODAL_OPTIONS: { key: MonthlyCostBaseColumnKey; label: string; icon: string }[] = [
  { key: 'rowIndex', label: 'رقم الصف (#)', icon: 'tag' },
  { key: 'productCode', label: 'كود المنتج', icon: 'qr_code' },
  { key: 'productName', label: 'اسم المنتج', icon: 'inventory_2' },
  { key: 'month', label: 'الشهر', icon: 'event' },
  { key: 'qty', label: 'الكمية المنتجة', icon: 'straighten' },
  { key: 'producedCartons', label: 'إنتاج بالكرتونات (كمية ÷ وحدات/كرتونة)', icon: 'inventory' },
  { key: 'totalCost', label: 'إجمالي التكلفة', icon: 'payments' },
  { key: 'directIndirect', label: 'مباشر / غير مباشر (والوحدة)', icon: 'account_balance_wallet' },
  { key: 'avgUnit', label: 'متوسط تكلفة الوحدة', icon: 'price_check' },
  { key: 'prevMonthAvgClosed', label: 'متوسط الشهر السابق (معتمد بعد الإغلاق)', icon: 'history' },
  { key: 'prevDeviation', label: 'الانحراف عن الشهر السابق (والنسبة)', icon: 'trending_flat' },
  { key: 'status', label: 'الحالة (مفتوح/مغلق)', icon: 'lock_open' },
];

const shortProductName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[1]}`;
};

/** كم كرتونة = إجمالي الوحدات المنتجة ÷ وحدات لكل كرتونة (من بطاقة المنتج). */
const cartonsFromProducedQty = (producedQty: number, unitsPerCarton: number): number | null => {
  const u = Number(unitsPerCarton || 0);
  if (u <= 0 || !Number.isFinite(producedQty)) return null;
  return Number((producedQty / u).toFixed(2));
};

const formatEta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'أقل من دقيقة';
  if (seconds < 60) return `حوالي ${Math.ceil(seconds)} ثانية`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.ceil(seconds % 60);
  if (minutes < 60) return remainSeconds > 0 ? `${minutes}د ${remainSeconds}ث` : `${minutes}د`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}س ${remainMinutes}د` : `${hours}س`;
};

const getPreviousMonth = (month: string): string => {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const date = new Date(year, mon - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const buildMonthDateRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const MonthlyProductionCosts: React.FC = () => {
  const navigate = useTenantNavigate();
  const {
    products,
    productionLines,
    _rawProducts,
    _rawEmployees,
    costCenters,
    costCenterValues,
    costAllocations,
    laborSettings,
    systemSettings,
    assets,
    assetDepreciations,
    fetchDepreciationReport,
  } = useShallowStore((s) => ({
    products: s.products,
    productionLines: s.productionLines,
    _rawProducts: s._rawProducts,
    _rawEmployees: s._rawEmployees,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    laborSettings: s.laborSettings,
    systemSettings: s.systemSettings,
    assets: s.assets,
    assetDepreciations: s.assetDepreciations,
    fetchDepreciationReport: s.fetchDepreciationReport,
  }));

  const supervisorHourlyRates = useMemo(
    () => buildSupervisorHourlyRatesMap(_rawEmployees),
    [_rawEmployees]
  );

  const { can } = usePermission();
  const canManage = can('costs.manage');
  const canClose = can('costs.closePeriod');
  const pageControl = useMemo(
    () => getExportImportPageControl(systemSettings.exportImport, 'monthlyProductionCosts'),
    [systemSettings.exportImport]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const [month, setMonth] = useState(getCurrentMonth());
  const [records, setRecords] = useState<MonthlyProductionCost[]>([]);
  const [breakdownMap, setBreakdownMap] = useState<Record<string, { directCost: number; indirectCost: number }>>({});
  const [centerBreakdownMap, setCenterBreakdownMap] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calculateProgress, setCalculateProgress] = useState({ done: 0, total: 0, productId: '' });
  const [calculateStartedAt, setCalculateStartedAt] = useState<number | null>(null);
  const [closingMonth, setClosingMonth] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [extraColumns, setExtraColumns] = useState<Record<ExtraColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_EXTRA_COLUMNS;
    try {
      const raw = window.localStorage.getItem(EXTRA_COLUMNS_PREF_KEY);
      if (!raw) return DEFAULT_EXTRA_COLUMNS;
      return { ...DEFAULT_EXTRA_COLUMNS, ...(JSON.parse(raw) as Partial<Record<ExtraColumnKey, boolean>>) };
    } catch {
      return DEFAULT_EXTRA_COLUMNS;
    }
  });
  const [baseColumns, setBaseColumns] = useState<Record<MonthlyCostBaseColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_BASE_COLUMNS;
    try {
      const raw = window.localStorage.getItem(BASE_COLUMNS_PREF_KEY);
      if (!raw) return DEFAULT_BASE_COLUMNS;
      return { ...DEFAULT_BASE_COLUMNS, ...(JSON.parse(raw) as Partial<Record<MonthlyCostBaseColumnKey, boolean>>) };
    } catch {
      return DEFAULT_BASE_COLUMNS;
    }
  });
  const [centerColumnsVisibility, setCenterColumnsVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(CENTER_COLUMNS_PREF_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const [materialsTotalMap, setMaterialsTotalMap] = useState<Record<string, number>>({});
  const [prevMonthInfoMap, setPrevMonthInfoMap] = useState<Record<string, PrevMonthProductInfo>>({});
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisProductId, setAnalysisProductId] = useState<string | null>(null);
  const [analysisReports, setAnalysisReports] = useState<ProductionReport[]>([]);
  const [analysisReportsLoading, setAnalysisReportsLoading] = useState(false);
  const [analysisToolbarSelect, setAnalysisToolbarSelect] = useState('');
  const mountedRef = useRef(true);
  const fetchRequestRef = useRef(0);
  const materialTotalCacheRef = useRef<Record<string, number>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRecords = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;
    setLoading(true);
    try {
      const previousMonth = getPreviousMonth(month);
      const hourlyRate = laborSettings?.hourlyRate ?? 0;
      const { startDate, endDate } = buildMonthDateRange(month);
      const [data, previousMonthData, allReports] = await Promise.all([
        monthlyProductionCostService.getByMonth(month),
        monthlyProductionCostService.getByMonth(previousMonth),
        reportService.getByDateRange(startDate, endDate),
      ]);
      if (!mountedRef.current || requestId !== fetchRequestRef.current) return;
      const monthProductQtyTotals = new Map<string, number>();
      allReports.forEach((report) => {
        if ((report.quantityProduced || 0) <= 0 || !report.productId) return;
        monthProductQtyTotals.set(
          report.productId,
          (monthProductQtyTotals.get(report.productId) || 0) + (report.quantityProduced || 0),
        );
      });
      const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
      const depreciationByCenter = new Map<string, number>();
      assetDepreciations.forEach((entry) => {
        if (entry.period !== month) return;
        const asset = assetById.get(String(entry.assetId || ''));
        const centerId = String(asset?.centerId || '');
        if (!centerId) return;
        depreciationByCenter.set(centerId, (depreciationByCenter.get(centerId) || 0) + Number(entry.depreciationAmount || 0));
      });
      const qtyRules = costCenters
        .filter((center) => center.type === 'indirect' && center.isActive && (center.allocationBasis || 'line_percentage') === 'by_qty' && center.id)
        .map((center) => {
          const centerId = String(center.id || '');
          const centerValue = costCenterValues.find((value) => value.costCenterId === centerId && value.month === month);
          const valueSource = centerValue?.valueSource || center.valueSource || 'manual';
          const hasSavedBreakdown = centerValue?.manualAmount !== undefined || centerValue?.salariesAmount !== undefined;
          const manualAmount = hasSavedBreakdown
            ? Number(centerValue?.manualAmount || 0)
            : Number(centerValue?.amount || 0);
          const salariesAmount = hasSavedBreakdown
            ? Number(centerValue?.salariesAmount || 0)
            : 0;
          const snapshotBase = valueSource === 'manual'
            ? manualAmount
            : valueSource === 'salaries'
              ? (hasSavedBreakdown ? salariesAmount : Number(centerValue?.amount || 0))
              : (hasSavedBreakdown ? (manualAmount + salariesAmount) : Number(centerValue?.amount || 0));
          const depreciation = Number(depreciationByCenter.get(centerId) || 0);
          const resolvedAmount = snapshotBase + depreciation;
          const allowedProductIds = center.productScope === 'selected'
            ? center.productIds || []
            : center.productScope === 'category'
              ? Array.from(monthProductQtyTotals.keys()).filter((pid) =>
                (center.productCategories || []).includes(String(productCategoryMap.get(pid) || 'غير مصنف'))
              )
            : Array.from(monthProductQtyTotals.keys());
          const denominator = allowedProductIds.reduce(
            (sum, pid) => sum + Number(monthProductQtyTotals.get(pid) || 0),
            0,
          );
          return {
            costCenterId: centerId,
            resolvedAmount,
            denominator,
            allowedProductIds: new Set(allowedProductIds),
          };
        })
        .filter((rule) => rule.resolvedAmount > 0 && rule.denominator > 0);

      const lineDateQtyTotals = new Map<string, number>();
      const lineDateHoursTotals = new Map<string, number>();
      const lineCenterSummaryCache = new Map<string, ReturnType<typeof buildLineAllocatedCostSummary>>();
      allReports.forEach((r) => {
        const key = `${r.lineId}_${r.date}`;
        lineDateQtyTotals.set(key, (lineDateQtyTotals.get(key) || 0) + (r.quantityProduced || 0));
        lineDateHoursTotals.set(key, (lineDateHoursTotals.get(key) || 0) + Math.max(0, r.workHours || 0));
      });

      const indirectCache = new Map<string, number>();
      const supervisorShareMap = buildSupervisorIndirectShareMap(
        allReports,
        supervisorHourlyRates,
        hourlyRate,
      );
      const nextBreakdown: Record<string, { directCost: number; indirectCost: number }> = {};
      const nextCenterBreakdown: Record<string, Record<string, number>> = {};
      const addCenterCost = (productId: string, centerId: string, amount: number) => {
        if (!centerId || amount <= 0) return;
        if (!nextCenterBreakdown[productId]) nextCenterBreakdown[productId] = {};
        nextCenterBreakdown[productId][centerId] = (nextCenterBreakdown[productId][centerId] || 0) + amount;
      };
      allReports.forEach((r) => {
        if (!r.quantityProduced || r.quantityProduced <= 0) return;
        const current = nextBreakdown[r.productId] || { directCost: 0, indirectCost: 0 };
        current.directCost += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;

        const reportMonth = r.date?.slice(0, 7) || month;
        const cacheKey = `${r.lineId}_${reportMonth}`;
        if (!indirectCache.has(cacheKey)) {
          indirectCache.set(
            cacheKey,
            calculateDailyIndirectCost(
              r.lineId,
              reportMonth,
              costCenters,
              costCenterValues,
              costAllocations,
              assets,
              assetDepreciations,
              systemSettings.costMonthlyWorkingDays,
            ),
          );
        }
        const lineIndirect = indirectCache.get(cacheKey) || 0;
        const lineDateKey = `${r.lineId}_${r.date}`;
        const lineDateTotalHours = lineDateHoursTotals.get(lineDateKey) || 0;
        const lineDateTotalQty = lineDateQtyTotals.get(lineDateKey) || 0;
        const reportHours = Math.max(0, r.workHours || 0);
        if (!lineCenterSummaryCache.has(cacheKey)) {
          lineCenterSummaryCache.set(
            cacheKey,
            buildLineAllocatedCostSummary(
              r.lineId,
              reportMonth,
              costCenters,
              costCenterValues,
              costAllocations,
              assets,
              assetDepreciations,
              systemSettings.costMonthlyWorkingDays,
            )
          );
        }
        const lineCenterSummary = lineCenterSummaryCache.get(cacheKey);
        if (lineDateTotalHours > 0 && reportHours > 0) {
          const shareRatio = reportHours / lineDateTotalHours;
          current.indirectCost += lineIndirect * shareRatio;
          lineCenterSummary?.centers.forEach((center) => {
            addCenterCost(r.productId, center.costCenterId, center.dailyAllocated * shareRatio);
          });
        } else {
          if (lineDateTotalQty > 0) {
            const shareRatio = r.quantityProduced / lineDateTotalQty;
            current.indirectCost += lineIndirect * shareRatio;
            lineCenterSummary?.centers.forEach((center) => {
              addCenterCost(r.productId, center.costCenterId, center.dailyAllocated * shareRatio);
            });
          }
        }
        if (r.id) {
          current.indirectCost += supervisorShareMap.get(r.id) || 0;
        }
        for (const rule of qtyRules) {
          if (!rule.allowedProductIds.has(r.productId)) continue;
          const share = rule.resolvedAmount * ((r.quantityProduced || 0) / rule.denominator);
          current.indirectCost += share;
          addCenterCost(r.productId, rule.costCenterId, share);
        }

        nextBreakdown[r.productId] = current;
      });

      if (mountedRef.current) {
        setRecords(data);
        setPrevMonthInfoMap(
          previousMonthData.reduce<Record<string, PrevMonthProductInfo>>((acc, row) => {
            acc[row.productId] = {
              avg: Number(row.averageUnitCost || 0),
              closed: !!row.isClosed,
            };
            return acc;
          }, {})
        );
        const persistedBreakdown: Record<string, { directCost: number; indirectCost: number }> = {};
        data.forEach((row) => {
          if (typeof row.directCost === 'number' && typeof row.indirectCost === 'number') {
            persistedBreakdown[row.productId] = { directCost: row.directCost, indirectCost: row.indirectCost };
          }
        });
        setBreakdownMap(Object.keys(persistedBreakdown).length > 0 ? persistedBreakdown : nextBreakdown);
        setCenterBreakdownMap(nextCenterBreakdown);
      }
    } catch {
      // silently fail
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [
    month,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
    supervisorHourlyRates,
    assets,
    assetDepreciations,
    systemSettings.costMonthlyWorkingDays,
  ]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => {
    void fetchDepreciationReport(month);
  }, [month, fetchDepreciationReport]);

  useEffect(() => {
    if (!analysisOpen || !analysisProductId) {
      setAnalysisReports([]);
      return;
    }
    const { startDate, endDate } = buildMonthDateRange(month);
    let cancelled = false;
    setAnalysisReportsLoading(true);
    void reportService
      .getByDateRange(startDate, endDate)
      .then((rows) => {
        if (cancelled) return;
        setAnalysisReports(rows.filter((row) => row.productId === analysisProductId));
      })
      .finally(() => {
        if (!cancelled) setAnalysisReportsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisOpen, analysisProductId, month]);

  const productNameMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products],
  );
  const productCodeMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.code || ''])),
    [products],
  );
  const productCategoryMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.category || ''])),
    [products],
  );
  const costCenterNameMap = useMemo(
    () => new Map(
      costCenters
        .filter((center) => center.id)
        .map((center) => [String(center.id), center.name]),
    ),
    [costCenters],
  );
  const lineNameMap = useMemo(
    () => new Map(productionLines.map((l) => [l.id, l.name])),
    [productionLines],
  );
  const employeeNameMap = useMemo(
    () => new Map(_rawEmployees.map((e) => [String(e.id || ''), e.name])),
    [_rawEmployees],
  );
  const rawProductMap = useMemo(() => {
    return new Map(_rawProducts.map((p) => [p.id || '', p]));
  }, [_rawProducts]);

  const toggleExtraColumn = (key: ExtraColumnKey, checked: boolean) => {
    const next = { ...extraColumns, [key]: checked };
    setExtraColumns(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(EXTRA_COLUMNS_PREF_KEY, JSON.stringify(next));
    }
  };
  const toggleBaseColumn = (key: MonthlyCostBaseColumnKey, checked: boolean) => {
    const next = { ...baseColumns, [key]: checked };
    setBaseColumns(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BASE_COLUMNS_PREF_KEY, JSON.stringify(next));
    }
  };
  const showAllBaseColumns = useCallback(() => {
    setBaseColumns(DEFAULT_BASE_COLUMNS);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BASE_COLUMNS_PREF_KEY, JSON.stringify(DEFAULT_BASE_COLUMNS));
    }
  }, []);
  const persistCenterColumnsVisibility = (next: Record<string, boolean>) => {
    setCenterColumnsVisibility(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CENTER_COLUMNS_PREF_KEY, JSON.stringify(next));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const productIds: string[] = Array.from(
      new Set(records.map((r) => String(r.productId || '')).filter((pid) => pid.length > 0))
    );
    if (productIds.length === 0) {
      setMaterialsTotalMap({});
      return;
    }
    const missingProductIds = productIds.filter((pid) => materialTotalCacheRef.current[pid] === undefined);
    const loadMaterialTotals = async () => {
      if (missingProductIds.length > 0) {
        try {
          const allMaterials = await productMaterialService.getAll();
          const aggregated: Record<string, number> = {};
          allMaterials.forEach((material) => {
            const pid = String(material.productId || '');
            if (!pid) return;
            aggregated[pid] = (aggregated[pid] || 0) + (material.quantityUsed || 0) * (material.unitCost || 0);
          });
          materialTotalCacheRef.current = aggregated;
        } catch {
          missingProductIds.forEach((pid) => {
            materialTotalCacheRef.current[pid] = materialTotalCacheRef.current[pid] ?? 0;
          });
        }
      }
      if (cancelled) return;
      const next: Record<string, number> = {};
      productIds.forEach((pid) => {
        next[pid] = materialTotalCacheRef.current[pid] ?? 0;
      });
      setMaterialsTotalMap(next);
    };
    void loadMaterialTotals();
    return () => { cancelled = true; };
  }, [records, month]);

  const handleCalculateAll = async () => {
    if (!laborSettings || allClosed) return;
    const startDate = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    const monthReports = await reportService.getByDateRange(startDate, endDate);
    const productIds = Array.from(
      new Set(
        monthReports
          .filter((r) => (r.quantityProduced || 0) > 0)
          .map((r) => String(r.productId || '').trim())
          .filter((pid) => pid.length > 0)
      )
    );
    if (productIds.length === 0) return;
    setCalculateProgress({ done: 0, total: productIds.length, productId: '' });
    setCalculateStartedAt(Date.now());
    setCalculating(true);
    try {
      await monthlyProductionCostService.calculateAll(
        productIds,
        month,
        laborSettings.hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        supervisorHourlyRates,
        assets,
        assetDepreciations,
        systemSettings.costMonthlyWorkingDays,
        (progress) => {
          if (!mountedRef.current) return;
          setCalculateProgress(progress);
        },
      );
      await fetchRecords();
    } catch {
      // error handled silently
    } finally {
      if (mountedRef.current) {
        setCalculating(false);
        setCalculateStartedAt(null);
      }
    }
  };

  const handleCloseMonth = async () => {
    setClosingMonth(true);
    try {
      const productIds = records.map((r) => r.productId);
      await monthlyProductionCostService.closeMonthForAll(productIds, month);
      await fetchRecords();
    } catch {
      // error handled silently
    } finally {
      if (mountedRef.current) {
        setClosingMonth(false);
        setConfirmClose(false);
      }
    }
  };

  const allClosed = records.length > 0 && records.every((r) => r.isClosed);
  const tableRecords = useMemo(
    () => records.filter((r) => (r.totalProducedQty || 0) > 0),
    [records]
  );
  const categoryOptions = useMemo(
    () => (Array.from(new Set(tableRecords.map((r) => String(productCategoryMap.get(r.productId) || 'غير مصنف')))) as string[])
      .sort((a, b) => a.localeCompare(b, 'ar')),
    [tableRecords, productCategoryMap]
  );
  const displayRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tableRecords.filter((r) => {
      const name = (productNameMap.get(r.productId) || r.productId || '').toLowerCase();
      const code = (productCodeMap.get(r.productId) || '').toLowerCase();
      const category = productCategoryMap.get(r.productId) || 'غير مصنف';
      const matchCategory = !categoryFilter || category === categoryFilter;
      const matchSearch = !q || name.includes(q) || code.includes(q);
      return matchCategory && matchSearch;
    });
  }, [tableRecords, searchTerm, categoryFilter, productNameMap, productCodeMap, productCategoryMap]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  }, [month]);

  const previousMonthLabel = useMemo(() => {
    const prev = getPreviousMonth(month);
    const [y, m] = prev.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  }, [month]);

  const totalQty = displayRecords.reduce((s, r) => s + r.totalProducedQty, 0);
  const totalCost = displayRecords.reduce((s, r) => s + r.totalProductionCost, 0);
  const totalCartonsEquivalent = useMemo(
    () =>
      displayRecords.reduce((s, r) => {
        const u = Number(rawProductMap.get(r.productId)?.unitsPerCarton || 0);
        if (u <= 0) return s;
        return s + r.totalProducedQty / u;
      }, 0),
    [displayRecords, rawProductMap],
  );
  const centerColumns = useMemo(() => {
    const ids = new Set<string>();
    displayRecords.forEach((record) => {
      Object.keys(centerBreakdownMap[record.productId] || {}).forEach((centerId) => ids.add(centerId));
    });
    costCenters
      .filter((center) => center.type === 'indirect' && center.isActive && center.id)
      .forEach((center) => ids.add(String(center.id || '')));
    return Array.from(ids)
      .map((centerId) => ({
        id: centerId,
        name: costCenterNameMap.get(centerId) || centerId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [displayRecords, centerBreakdownMap, costCenters, costCenterNameMap]);
  const visibleCenterColumns = useMemo(
    () => centerColumns.filter((center) => centerColumnsVisibility[center.id] !== false),
    [centerColumns, centerColumnsVisibility]
  );
  const leadingBaseColumnKeys: MonthlyCostBaseColumnKey[] = ['rowIndex', 'productCode', 'productName', 'month'];
  const leadingBaseColumnCount = useMemo(
    () => leadingBaseColumnKeys.filter((k) => baseColumns[k]).length,
    [baseColumns],
  );
  const toggleCenterColumn = useCallback((centerId: string, checked: boolean) => {
    const next = { ...centerColumnsVisibility, [centerId]: checked };
    persistCenterColumnsVisibility(next);
  }, [centerColumnsVisibility]);
  const showAllCenterColumns = useCallback(() => {
    const next = { ...centerColumnsVisibility };
    centerColumns.forEach((center) => {
      next[center.id] = true;
    });
    persistCenterColumnsVisibility(next);
  }, [centerColumns, centerColumnsVisibility]);
  const getCenterCostForRecord = useCallback(
    (productId: string, centerId: string) => centerBreakdownMap[productId]?.[centerId] || 0,
    [centerBreakdownMap]
  );
  const getNormalizedBreakdown = useCallback((record: MonthlyProductionCost) => {
    const breakdown = breakdownMap[record.productId];
    if (!breakdown) {
      return { directCost: record.totalProductionCost, indirectCost: 0 };
    }
    const computedTotal = (breakdown.directCost || 0) + (breakdown.indirectCost || 0);
    if (computedTotal <= 0) {
      return { directCost: record.totalProductionCost, indirectCost: 0 };
    }
    const scale = record.totalProductionCost / computedTotal;
    return {
      directCost: Math.max(0, (breakdown.directCost || 0) * scale),
      indirectCost: Math.max(0, (breakdown.indirectCost || 0) * scale),
    };
  }, [breakdownMap]);
  const totalDirect = displayRecords.reduce((s, r) => s + getNormalizedBreakdown(r).directCost, 0);
  const totalIndirect = displayRecords.reduce((s, r) => s + getNormalizedBreakdown(r).indirectCost, 0);
  const overallAvg = totalQty > 0 ? totalCost / totalQty : 0;
  const staleProducts = useMemo(() => {
    return records
      .filter((r) => {
        if (!r.totalProducedQty || r.totalProducedQty <= 0) return false;
        const breakdown = breakdownMap[r.productId];
        if (!breakdown) return false;
        const liveComputedTotal = (breakdown.directCost || 0) + (breakdown.indirectCost || 0);
        return Math.abs((r.totalProductionCost || 0) - liveComputedTotal) > 0.01;
      })
      .map((r) => {
        const liveComputedTotal = (breakdownMap[r.productId]?.directCost || 0) + (breakdownMap[r.productId]?.indirectCost || 0);
        return {
          productId: r.productId,
          productCode: productCodeMap.get(r.productId) || '',
          productName: productNameMap.get(r.productId) || r.productId,
          delta: liveComputedTotal - (r.totalProductionCost || 0),
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [records, breakdownMap, productCodeMap, productNameMap]);
  const staleProductsCount = staleProducts.length;
  const stalePreview = useMemo(() => {
    return staleProducts.slice(0, 8);
  }, [staleProducts]);

  const openCostAnalysis = useCallback((productId: string) => {
    setAnalysisProductId(productId);
    setAnalysisOpen(true);
  }, []);

  const closeCostAnalysis = useCallback(() => {
    setAnalysisOpen(false);
    setAnalysisProductId(null);
    setAnalysisReports([]);
  }, []);

  const analysisRecord = useMemo(() => {
    if (!analysisProductId) return null;
    return tableRecords.find((row) => row.productId === analysisProductId) ?? null;
  }, [tableRecords, analysisProductId]);

  const analysisHeuristics = useMemo(() => {
    if (!analysisRecord) return [] as string[];
    const lines: string[] = [];
    const prev = prevMonthInfoMap[analysisRecord.productId];
    if (!prev?.closed || (prev.avg || 0) <= 0) {
      lines.push(
        'الشهر السابق غير معتمد بالكامل لهذا المنتج (غير مغلق أو بلا متوسط مخزّن)؛ مقارنة الانحراف عن الشهر السابق قد تظهر «—» في الجدول.',
      );
    }
    if (staleProducts.some((s) => s.productId === analysisRecord.productId)) {
      lines.push(
        'القيم المخزّنة لهذا المنتج قد لا تطابق آخر حساب؛ يُنصح بإعادة «حساب الكل» قبل الاعتماد على التحليل.',
      );
    }
    const norm = getNormalizedBreakdown(analysisRecord);
    const tot = (norm.directCost || 0) + (norm.indirectCost || 0);
    if (tot > 0) {
      const indRatio = (norm.indirectCost || 0) / tot;
      if (indRatio > 0.35) {
        lines.push(
          'نسبة التكاليف غير المباشرة مرتفعة نسبيًا؛ تغيّر حجم الإنتاج أو قيم/توزيع المراكز قد يحرّك تكلفة الوحدة بقوة.',
        );
      }
    }
    return lines;
  }, [analysisRecord, prevMonthInfoMap, staleProducts, getNormalizedBreakdown]);

  const analysisNoteTexts = useMemo(
    () =>
      analysisReports
        .filter((r) => (r.notes || '').trim().length > 0)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map((r) => (r.notes || '').trim()),
    [analysisReports],
  );

  const analysisIsStale = useMemo(
    () =>
      !!analysisProductId && staleProducts.some((s) => s.productId === analysisProductId),
    [analysisProductId, staleProducts],
  );

  const deviationAnalysis = useDeviationAnalysis({
    enabled: analysisOpen && !!analysisProductId && !!analysisRecord,
    productId: analysisProductId,
    month,
    currentRecord: analysisRecord,
    getNormalizedBreakdown,
    prevMonthInfo: analysisProductId ? prevMonthInfoMap[analysisProductId] : undefined,
    isStale: analysisIsStale,
    noteTexts: analysisNoteTexts,
  });

  const analysisCenterTop = useMemo(() => {
    if (!analysisRecord) return [] as { name: string; total: number; perUnit: number }[];
    const byId = centerBreakdownMap[analysisRecord.productId] || {};
    const qty = Math.max(0, analysisRecord.totalProducedQty || 0);
    return Object.entries(byId)
      .map(([id, total]) => ({
        name: costCenterNameMap.get(id) || id,
        total: Number(total || 0),
        perUnit: qty > 0 ? Number(total || 0) / qty : 0,
      }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [analysisRecord, centerBreakdownMap, costCenterNameMap]);

  const handleCopyAnalysisContext = useCallback(async () => {
    if (!analysisRecord || !analysisProductId) return;
    const code = productCodeMap.get(analysisProductId) || '';
    const name = productNameMap.get(analysisProductId) || analysisProductId;
    const prev = prevMonthInfoMap[analysisProductId];
    const closedPrev =
      prev?.closed && (prev.avg || 0) > 0 ? Number(prev.avg) : null;
    const norm = getNormalizedBreakdown(analysisRecord);
    const qty = Math.max(0, analysisRecord.totalProducedQty || 0);
    const diff =
      closedPrev != null ? analysisRecord.averageUnitCost - closedPrev : null;
    const pct =
      closedPrev != null && closedPrev > 0 && diff != null
        ? (diff / closedPrev) * 100
        : null;
    const notesLines = analysisReports
      .filter((r) => (r.notes || '').trim().length > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((r) => {
        const line = lineNameMap.get(r.lineId) || r.lineId;
        const who = employeeNameMap.get(String(r.employeeId || '')) || r.employeeId;
        return `- ${r.date} | خط: ${line} | ${who}: ${(r.notes || '').trim()}`;
      });
    const staleLine = staleProducts.some((s) => s.productId === analysisProductId)
      ? 'تحذير: بيانات قديمة — يُنصح بإعادة حساب الكل.\n'
      : '';
    const text = [
      `تكلفة الإنتاج — ${monthLabel}`,
      `المنتج: ${code ? `${code} — ` : ''}${name}`,
      `الكمية: ${formatCost(qty)} | إجمالي التكلفة: ${formatCost(analysisRecord.totalProductionCost)} ج.م`,
      `متوسط تكلفة الوحدة: ${formatCost(analysisRecord.averageUnitCost)} ج.م`,
      `مباشر: ${formatCost(norm.directCost)} ج.م (${qty > 0 ? formatCost(norm.directCost / qty) : '0'} / وحدة)`,
      `غير مباشر: ${formatCost(norm.indirectCost)} ج.م (${qty > 0 ? formatCost(norm.indirectCost / qty) : '0'} / وحدة)`,
      closedPrev != null
        ? `الشهر السابق (${previousMonthLabel}) معتمد: ${formatCost(closedPrev)} ج.م/وحدة | انحراف: ${diff != null ? `${diff >= 0 ? '+' : ''}${formatCost(diff)} ج.م` : '—'}${pct != null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}`
        : `مقارنة الشهر السابق (${previousMonthLabel}): غير متاحة (الشهر غير مغلق أو بلا متوسط معتمد).`,
      `سعر الساعة (إعدادات العمالة): ${formatCost(laborSettings?.hourlyRate ?? 0)} ج.م`,
      staleLine,
      analysisHeuristics.length > 0 ? `ملاحظات آلية:\n${analysisHeuristics.map((l) => `- ${l}`).join('\n')}` : '',
      notesLines.length > 0 ? `ملاحظات تقارير الإنتاج:\n${notesLines.join('\n')}` : 'لا توجد ملاحظات نصية في تقارير هذا الشهر لهذا المنتج.',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم نسخ السياق');
    } catch {
      toast.error('تعذر النسخ من المتصفح');
    }
  }, [
    analysisRecord,
    analysisProductId,
    analysisReports,
    analysisHeuristics,
    employeeNameMap,
    lineNameMap,
    laborSettings?.hourlyRate,
    monthLabel,
    previousMonthLabel,
    prevMonthInfoMap,
    productCodeMap,
    productNameMap,
    staleProducts,
    getNormalizedBreakdown,
  ]);

  const calculateProgressPercent = calculateProgress.total > 0
    ? Math.min(100, Math.round((calculateProgress.done / calculateProgress.total) * 100))
    : 0;
  const currentCalculatingProductName = calculateProgress.productId
    ? (productNameMap.get(calculateProgress.productId) || calculateProgress.productId)
    : '';
  const calculateEtaText = useMemo(() => {
    if (!calculating || !calculateStartedAt || calculateProgress.done <= 0 || calculateProgress.total <= 0) return '';
    const elapsedSeconds = (Date.now() - calculateStartedAt) / 1000;
    if (elapsedSeconds <= 0) return '';
    const avgSecondsPerItem = elapsedSeconds / calculateProgress.done;
    const remainingItems = Math.max(0, calculateProgress.total - calculateProgress.done);
    return formatEta(avgSecondsPerItem * remainingItems);
  }, [calculating, calculateStartedAt, calculateProgress.done, calculateProgress.total]);

  const handleExport = () => {
    if (!baseColumns.productCode && !baseColumns.productName) {
      toast.warning('فعّل كود المنتج أو اسم المنتج على الأقل للتصدير.');
    }
    const rows = displayRecords.map((r, rowIdx) => {
      const normalized = getNormalizedBreakdown(r);
      const directCost = normalized.directCost;
      const indirectCost = normalized.indirectCost;
      const qty = r.totalProducedQty;
      const prevInfo = prevMonthInfoMap[r.productId];
      const closedPrevAvg =
        prevInfo?.closed && (prevInfo.avg || 0) > 0 ? prevInfo.avg : null;
      const deviationAmount =
        closedPrevAvg != null ? r.averageUnitCost - closedPrevAvg : 0;
      const deviationPercent =
        closedPrevAvg != null && closedPrevAvg > 0 ? (deviationAmount / closedPrevAvg) * 100 : 0;
      const raw = rawProductMap.get(r.productId);
      const chinese = raw?.chineseUnitCost ?? 0;
      const inner = raw?.innerBoxCost ?? 0;
      const outer = raw?.outerCartonCost ?? 0;
      const units = raw?.unitsPerCarton ?? 0;
      const cartonShare = units > 0 ? outer / units : 0;
      const materialsAndPackaging = chinese + (materialsTotalMap[r.productId] ?? 0) + inner + cartonShare;
      const sellingPrice = raw?.sellingPrice ?? 0;
      const unitProfit = sellingPrice > 0 ? sellingPrice - r.averageUnitCost : 0;
      const row: Record<string, unknown> = {};
      if (baseColumns.rowIndex) row['#'] = rowIdx + 1;
      if (baseColumns.productCode) row['كود المنتج'] = productCodeMap.get(r.productId) || '';
      if (baseColumns.productName) row['اسم المنتج'] = productNameMap.get(r.productId) || r.productId;
      if (baseColumns.month) row['الشهر'] = r.month;
      if (baseColumns.qty) row['الكمية المنتجة'] = qty;
      if (baseColumns.producedCartons) {
        const cartons = cartonsFromProducedQty(qty, raw?.unitsPerCarton ?? 0);
        row['إنتاج بالكرتونة'] = cartons != null ? cartons : '—';
      }
      if (baseColumns.totalCost) row['إجمالي التكلفة'] = r.totalProductionCost;
      if (baseColumns.directIndirect) {
        row['مباشر'] = directCost;
        row['مباشر / وحدة'] = qty > 0 ? directCost / qty : 0;
        row['غير مباشر'] = indirectCost;
        row['غير مباشر / وحدة'] = qty > 0 ? indirectCost / qty : 0;
      }
      visibleCenterColumns.forEach((center) => {
        const centerTotal = getCenterCostForRecord(r.productId, center.id);
        row[`${center.name} - إجمالي`] = centerTotal;
        row[`${center.name} - وحدة`] = qty > 0 ? centerTotal / qty : 0;
      });
      if (baseColumns.avgUnit) row['متوسط تكلفة الوحدة'] = r.averageUnitCost;
      if (baseColumns.prevMonthAvgClosed) {
        row['متوسط تكلفة الشهر السابق (معتمد)'] =
          closedPrevAvg != null ? closedPrevAvg : '—';
      }
      if (baseColumns.prevDeviation) {
        if (!baseColumns.prevMonthAvgClosed) {
          row['متوسط تكلفة الشهر السابق'] =
            closedPrevAvg != null ? closedPrevAvg : '—';
        }
        row['الانحراف عن الشهر السابق (ج.م/وحدة)'] =
          closedPrevAvg != null ? deviationAmount : '—';
        row['الانحراف عن الشهر السابق (%)'] =
          closedPrevAvg != null && closedPrevAvg > 0 ? deviationPercent : '—';
      }
      if (extraColumns.materialsAndPackaging) row['إجمالي تكلفة المواد والتغليف (ج.م/وحدة)'] = materialsAndPackaging;
      if (extraColumns.sellingPrice) row['سعر البيع (ج.م/وحدة)'] = sellingPrice;
      if (extraColumns.profit) row['ربح الوحدة (ج.م/وحدة)'] = sellingPrice > 0 ? unitProfit : '—';
      if (baseColumns.status) row['الحالة'] = r.isClosed ? 'مغلق' : 'مفتوح';
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تكلفة الإنتاج الشهرية');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buf]), `تكلفة-الإنتاج-${month}.xlsx`);
  };

  return (
    <DetailPageShell className="space-y-6">
      <DetailPageStickyHeader>
        <PageHeader
          title="تكلفة الإنتاج الشهرية"
          subtitle="حساب ومراجعة تكلفة الإنتاج لكل منتج حسب الشهر"
          icon="price_check"
          primaryAction={canManage ? {
            label: calculating
              ? `جاري الحساب... ${calculateProgress.done}/${calculateProgress.total || products.length}`
              : 'حساب الكل',
            icon: 'calculate',
            onClick: handleCalculateAll,
            disabled: calculating || allClosed,
          } : undefined}
          extra={
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
            />
          }
        />
        <UiCard className={SURFACE_CARD}>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPIBox
                label="عدد المنتجات"
                value={displayRecords.length}
                icon="inventory_2"
                colorClass="bg-primary/10 text-primary"
              />
              <KPIBox
                label="إجمالي الكمية"
                value={formatCost(totalQty)}
                icon="precision_manufacturing"
                colorClass="bg-emerald-500/10 text-emerald-600"
                unit="وحدة"
              />
              <KPIBox
                label="إجمالي التكلفة"
                value={formatCost(totalCost)}
                icon="payments"
                colorClass="bg-amber-500/10 text-amber-600"
                unit="ج.م"
              />
              <KPIBox
                label="متوسط تكلفة الوحدة"
                value={formatCost(overallAvg)}
                icon="price_check"
                colorClass="bg-violet-500/10 text-violet-600"
                unit="ج.م"
              />
            </div>
          </CardContent>
        </UiCard>
      </DetailPageStickyHeader>

      {/* Month close banner */}
      {allClosed && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-emerald-600">lock</span>
          <p className="text-sm font-semibold text-emerald-700">
            فترة {monthLabel} مُغلقة — لا يمكن إعادة الحساب
          </p>
        </div>
      )}
      {!allClosed && staleProductsCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-amber-600">warning</span>
              <p className="text-sm font-semibold text-amber-700">
              تم تعديل مدخلات التكلفة بعد آخر حساب في {staleProductsCount} منتج — برجاء إعادة حساب الكل لتحديث القيم.
              </p>
            </div>
            {canManage && (
              <Button onClick={handleCalculateAll} disabled={calculating || allClosed}>
                <span className="material-icons-round text-[18px] ml-1">refresh</span>
                {calculating
                  ? `جاري الحساب... ${calculateProgress.done}/${calculateProgress.total || products.length}`
                  : 'إعادة حساب الكل'}
              </Button>
            )}
          </div>
          <div className="rounded-[var(--border-radius-base)] border border-amber-200/80 bg-white/60 p-3">
            <div className="text-xs font-bold text-amber-700 mb-2">المنتجات المتأثرة:</div>
            <div className="flex flex-wrap gap-2">
              {stalePreview.map((item) => (
                <span
                  key={item.productId}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-semibold"
                  title={`فرق التكلفة: ${formatCost(item.delta)} ج.م`}
                >
                  {item.productCode ? `${item.productCode} - ` : ''}{shortProductName(item.productName)}
                </span>
              ))}
              {staleProductsCount > stalePreview.length && (
                <span className="inline-flex items-center rounded-full bg-amber-200 text-amber-900 px-2.5 py-1 text-xs font-bold">
                  +{staleProductsCount - stalePreview.length} منتج
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {calculating && calculateProgress.total > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-[var(--border-radius-lg)] p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-blue-700">
            <span>يتم حساب تكاليف الشهر الآن</span>
            <span>{calculateProgress.done}/{calculateProgress.total} ({calculateProgressPercent}%)</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-blue-100 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${calculateProgressPercent}%` }}
            />
          </div>
          <p className="text-xs text-blue-700/90">
            {currentCalculatingProductName
              ? `المنتج الحالي: ${shortProductName(currentCalculatingProductName)}`
              : 'جاري بد، الحساب...'}
            {calculateEtaText ? ` - الوقت المتبقي التقريبي: ${calculateEtaText}` : ''}
          </p>
        </div>
      )}

      {/* Table */}
      <Card>
        {tableRecords.length > 0 && (
          <div className="p-4 border-b border-[var(--color-border)] flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
              <span className="material-icons-round text-[var(--color-text-muted)] text-sm">search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث بالاسم أو الكود..."
                className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 w-full md:w-64"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 w-full md:w-auto rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">كل الفئات</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {displayRecords.length > 0 && (
              <>
                <Button variant="outline" onClick={() => setShowColumnsModal(true)}>
                  <span className="material-icons-round text-[18px] ml-1">view_column</span>
                  الأعمدة
                </Button>
                <select
                  aria-label="فتح تحليل انحراف التكلفة لمنتج"
                  value={analysisToolbarSelect}
                  onChange={(e) => {
                    const pid = e.target.value;
                    if (pid) openCostAnalysis(pid);
                    setAnalysisToolbarSelect('');
                  }}
                  className="h-10 min-w-[10rem] max-w-[14rem] rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">تحليل منتج…</option>
                  {displayRecords.map((row) => (
                    <option key={row.productId} value={row.productId}>
                      {(productCodeMap.get(row.productId) ? `${productCodeMap.get(row.productId)} — ` : '') +
                        shortProductName(productNameMap.get(row.productId) || row.productId)}
                    </option>
                  ))}
                </select>
                {canExportFromPage && (
                  <Button variant={pageControl.exportVariant} onClick={handleExport}>
                    <span className="material-icons-round text-[18px] ml-1">file_download</span>
                    تصدير Excel
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        <div className="overflow-x-auto erp-table-scroll">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full" />
            </div>
          ) : displayRecords.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <span className="material-icons-round text-5xl mb-3 block">price_check</span>
              <p className="font-semibold text-lg">لا توجد نتائج مطابقة للفلاتر الحالية</p>
              <p className="text-sm mt-1">جرّب تغيير البحث أو الفئة</p>
            </div>
          ) : (
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                  {baseColumns.rowIndex && <th className="erp-th">#</th>}
                  {baseColumns.productCode && <th className="erp-th">كود المنتج</th>}
                  {baseColumns.productName && <th className="erp-th">اسم المنتج</th>}
                  {baseColumns.month && <th className="erp-th">الشهر</th>}
                  {baseColumns.qty && <th className="erp-th">الكمية المنتجة</th>}
                  {baseColumns.producedCartons && (
                    <th className="erp-th min-w-[120px]">
                      إنتاج بالكرتونة
                      <span className="block text-[10px] font-normal opacity-80">كمية ÷ وحدات/كرتونة</span>
                    </th>
                  )}
                  {baseColumns.totalCost && <th className="erp-th">إجمالي التكلفة</th>}
                  {baseColumns.directIndirect && <th className="erp-th">مباشر / غير مباشر</th>}
                  {visibleCenterColumns.map((center) => (
                    <th key={center.id} className="erp-th min-w-[180px]">
                      {center.name}
                    </th>
                  ))}
                  {baseColumns.avgUnit && <th className="erp-th">متوسط تكلفة الوحدة</th>}
                  {baseColumns.prevMonthAvgClosed && (
                    <th className="erp-th min-w-[140px]">
                      متوسط الوحدة ({previousMonthLabel})
                      <span className="block text-[10px] font-normal opacity-80">بعد إغلاق الشهر</span>
                    </th>
                  )}
                  {baseColumns.prevDeviation && (
                    <th className="erp-th">الانحراف عن {previousMonthLabel}</th>
                  )}
                  {extraColumns.materialsAndPackaging && (
                    <th className="erp-th">إجمالي تكلفة المواد والتغليف</th>
                  )}
                  {extraColumns.sellingPrice && (
                    <th className="erp-th">سعر البيع</th>
                  )}
                  {extraColumns.profit && (
                    <th className="erp-th">ربح الوحدة</th>
                  )}
                  {baseColumns.status && <th className="erp-th text-center">الحالة</th>}
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--color-border)] hover:bg-[#f8f9fa]/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/products/${r.productId}`)}
                  >
                    {baseColumns.rowIndex && (
                      <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono">
                        <div className="flex items-center gap-1">
                          <span>{i + 1}</span>
                          {!baseColumns.productName && (
                            <button
                              type="button"
                              className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-primary hover:bg-primary/5"
                              title="تحليل انحراف التكلفة والملاحظات"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCostAnalysis(r.productId);
                              }}
                            >
                              <span className="material-icons-round text-[18px]">insights</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {baseColumns.productCode && (
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{productCodeMap.get(r.productId) || '—'}</td>
                    )}
                    {baseColumns.productName && (
                      <td className="py-3 px-4 font-semibold text-[var(--color-text)]">
                        <div className="flex items-center gap-2 justify-between min-w-0">
                          <span className="min-w-0 flex-1 truncate" title={productNameMap.get(r.productId) || r.productId}>
                            {shortProductName(productNameMap.get(r.productId) || r.productId)}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-primary hover:bg-primary/5"
                            title="تحليل انحراف التكلفة والملاحظات"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCostAnalysis(r.productId);
                            }}
                          >
                            <span className="material-icons-round text-[20px]">insights</span>
                          </button>
                        </div>
                      </td>
                    )}
                    {baseColumns.month && (
                      <td className="py-3 px-4 font-mono text-xs text-[var(--color-text-muted)]">{r.month}</td>
                    )}
                    {baseColumns.qty && (
                      <td className="py-3 px-4 font-mono">{formatCost(r.totalProducedQty)}</td>
                    )}
                    {baseColumns.producedCartons && (
                      <td
                        className="py-3 px-4 font-mono text-[var(--color-text)]"
                        title={(() => {
                          const u = Number(rawProductMap.get(r.productId)?.unitsPerCarton || 0);
                          return u > 0
                            ? `وحدات لكل كرتونة: ${u} — الحساب: ${formatCost(r.totalProducedQty)} ÷ ${u}`
                            : 'لم يُضبط عدد الوحدات لكل كرتونة في بطاقة المنتج';
                        })()}
                      >
                        {(() => {
                          const raw = rawProductMap.get(r.productId);
                          const cartons = cartonsFromProducedQty(r.totalProducedQty, raw?.unitsPerCarton ?? 0);
                          if (cartons == null) {
                            return <span className="text-[var(--color-text-muted)]">—</span>;
                          }
                          return (
                            <span>
                              {formatCost(cartons)}
                              <span className="text-[10px] font-normal text-[var(--color-text-muted)] mr-1"> كرتونة</span>
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {baseColumns.totalCost && (
                      <td className="py-3 px-4 font-mono font-semibold text-amber-700">
                        {formatCost(r.totalProductionCost)}
                      </td>
                    )}
                    {baseColumns.directIndirect && (
                      <td className="py-3 px-4">
                        {(() => {
                          const normalized = getNormalizedBreakdown(r);
                          const direct = normalized.directCost;
                          const indirect = normalized.indirectCost;
                          const directPerPiece = r.totalProducedQty > 0 ? direct / r.totalProducedQty : 0;
                          const indirectPerPiece = r.totalProducedQty > 0 ? indirect / r.totalProducedQty : 0;
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs tabular-nums text-blue-600 font-bold leading-5">
                                {formatCost(direct)} <span className="text-[10px] font-normal opacity-70">مباشر</span>
                                <span className="text-[10px] font-medium opacity-70"> — {formatCost(directPerPiece)} / وحدة</span>
                              </span>
                              <span className="text-xs tabular-nums text-[var(--color-text-muted)] font-bold leading-5">
                                {formatCost(indirect)} <span className="text-[10px] font-normal opacity-70">غ.مباشر</span>
                                <span className="text-[10px] font-medium opacity-70"> — {formatCost(indirectPerPiece)} / وحدة</span>
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    {visibleCenterColumns.map((center) => {
                      const centerTotal = getCenterCostForRecord(r.productId, center.id);
                      const centerPerPiece = r.totalProducedQty > 0 ? centerTotal / r.totalProducedQty : 0;
                      return (
                        <td key={`${r.id}-${center.id}`} className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs tabular-nums font-bold text-[var(--color-text)] leading-5">
                              {formatCost(centerTotal)} <span className="text-[10px] font-normal opacity-70">إجمالي</span>
                            </span>
                            <span className="text-xs tabular-nums font-medium text-[var(--color-text-muted)] leading-5">
                              {formatCost(centerPerPiece)} <span className="text-[10px] font-normal opacity-70">/ وحدة</span>
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    {baseColumns.avgUnit && (
                      <td className="py-3 px-4 font-mono font-bold text-primary">
                        {formatCost(r.averageUnitCost)}
                      </td>
                    )}
                    {baseColumns.prevMonthAvgClosed && (
                      <td
                        className="py-3 px-4 font-mono font-semibold text-[var(--color-text)]"
                        title={
                          !prevMonthInfoMap[r.productId]?.closed
                            ? 'الشهر السابق غير مُغلق لهذا المنتج — لا يوجد متوسط معتمد'
                            : undefined
                        }
                      >
                        {(() => {
                          const info = prevMonthInfoMap[r.productId];
                          if (!info?.closed || (info.avg || 0) <= 0) {
                            return <span className="text-[var(--color-text-muted)]">—</span>;
                          }
                          return formatCost(info.avg);
                        })()}
                      </td>
                    )}
                    {baseColumns.prevDeviation && (
                      <td className="py-3 px-4 font-mono font-bold">
                        {(() => {
                          const info = prevMonthInfoMap[r.productId];
                          const prevAvg =
                            info?.closed && (info.avg || 0) > 0 ? info.avg : null;
                          if (prevAvg == null) return <span className="text-[var(--color-text-muted)]">—</span>;
                          const diff = r.averageUnitCost - prevAvg;
                          return (
                            <span className={diff >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {diff >= 0 ? '+' : ''}{formatCost(diff)}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {extraColumns.materialsAndPackaging && (
                      <td className="py-3 px-4 font-mono font-bold text-[var(--color-text)]">
                        {(() => {
                          const raw = rawProductMap.get(r.productId);
                          const chinese = raw?.chineseUnitCost ?? 0;
                          const inner = raw?.innerBoxCost ?? 0;
                          const outer = raw?.outerCartonCost ?? 0;
                          const units = raw?.unitsPerCarton ?? 0;
                          const cartonShare = units > 0 ? outer / units : 0;
                          const materials = materialsTotalMap[r.productId] ?? 0;
                          return formatCost(chinese + materials + inner + cartonShare);
                        })()}
                      </td>
                    )}
                    {extraColumns.sellingPrice && (
                      <td className="py-3 px-4 font-mono font-bold text-[var(--color-text)]">
                        {formatCost(rawProductMap.get(r.productId)?.sellingPrice ?? 0)}
                      </td>
                    )}
                    {extraColumns.profit && (
                      <td className="py-3 px-4 font-mono font-black">
                        {(() => {
                          const sellingPrice = rawProductMap.get(r.productId)?.sellingPrice ?? 0;
                          if (sellingPrice <= 0) return <span className="text-[var(--color-text-muted)]">—</span>;
                          const profit = sellingPrice - r.averageUnitCost;
                          return (
                            <span className={profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {formatCost(profit)}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {baseColumns.status && (
                      <td className="py-3 px-4 text-center">
                        <Badge variant={r.isClosed ? 'success' : 'warning'}>
                          {r.isClosed ? 'مغلق' : 'مفتوح'}
                        </Badge>
                      </td>
                    )}
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-[var(--color-border)] bg-[#f8f9fa]/50 font-bold">
                  <td className="py-3 px-4" colSpan={Math.max(1, leadingBaseColumnCount)}>الإجمالي</td>
                  {baseColumns.qty && (
                    <td className="py-3 px-4 font-mono">{formatCost(totalQty)}</td>
                  )}
                  {baseColumns.producedCartons && (
                    <td
                      className="py-3 px-4 font-mono text-[var(--color-text-muted)]"
                      title="مجموع (كمية كل صنف ÷ وحداته لكل كرتونة)"
                    >
                      {totalCartonsEquivalent > 0 ? formatCost(Number(totalCartonsEquivalent.toFixed(2))) : '—'}
                    </td>
                  )}
                  {baseColumns.totalCost && (
                    <td className="py-3 px-4 font-mono text-amber-700">{formatCost(totalCost)}</td>
                  )}
                  {baseColumns.directIndirect && (
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs tabular-nums text-blue-600 font-bold leading-5">
                          {formatCost(totalDirect)} <span className="text-[10px] font-normal opacity-70">مباشر</span>
                          <span className="text-[10px] font-medium opacity-70"> — {formatCost(totalQty > 0 ? totalDirect / totalQty : 0)} / وحدة</span>
                        </span>
                        <span className="text-xs tabular-nums text-[var(--color-text-muted)] font-bold leading-5">
                          {formatCost(totalIndirect)} <span className="text-[10px] font-normal opacity-70">غ.مباشر</span>
                          <span className="text-[10px] font-medium opacity-70"> — {formatCost(totalQty > 0 ? totalIndirect / totalQty : 0)} / وحدة</span>
                        </span>
                      </div>
                    </td>
                  )}
                  {visibleCenterColumns.map((center) => {
                    const centerTotal = displayRecords.reduce(
                      (sum, record) => sum + getCenterCostForRecord(record.productId, center.id),
                      0
                    );
                    return (
                      <td key={`total-${center.id}`} className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs tabular-nums font-bold text-[var(--color-text)] leading-5">
                            {formatCost(centerTotal)} <span className="text-[10px] font-normal opacity-70">إجمالي</span>
                          </span>
                          <span className="text-xs tabular-nums font-medium text-[var(--color-text-muted)] leading-5">
                            {formatCost(totalQty > 0 ? centerTotal / totalQty : 0)} <span className="text-[10px] font-normal opacity-70">/ وحدة</span>
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  {baseColumns.avgUnit && (
                    <td className="py-3 px-4 font-mono text-primary">{formatCost(overallAvg)}</td>
                  )}
                  {baseColumns.prevMonthAvgClosed && (
                    <td className="py-3 px-4 font-mono text-[var(--color-text-muted)]">—</td>
                  )}
                  {baseColumns.prevDeviation && (
                    <td className="py-3 px-4 font-mono text-[var(--color-text-muted)]">—</td>
                  )}
                  {extraColumns.materialsAndPackaging && (
                    <td className="py-3 px-4 font-mono text-[var(--color-text)]">
                      {formatCost(displayRecords.reduce((s, r) => {
                        const raw = rawProductMap.get(r.productId);
                        const chinese = raw?.chineseUnitCost ?? 0;
                        const inner = raw?.innerBoxCost ?? 0;
                        const outer = raw?.outerCartonCost ?? 0;
                        const units = raw?.unitsPerCarton ?? 0;
                        const cartonShare = units > 0 ? outer / units : 0;
                        const materials = materialsTotalMap[r.productId] ?? 0;
                        const unit = chinese + materials + inner + cartonShare;
                        return s + unit * r.totalProducedQty;
                      }, 0) / (totalQty > 0 ? totalQty : 1))}
                    </td>
                  )}
                  {extraColumns.sellingPrice && (
                    <td className="py-3 px-4 font-mono text-[var(--color-text)]">
                      {formatCost(displayRecords.reduce((s, r) => {
                        const sp = rawProductMap.get(r.productId)?.sellingPrice ?? 0;
                        return s + (sp * r.totalProducedQty);
                      }, 0) / (totalQty > 0 ? totalQty : 1))}
                    </td>
                  )}
                  {extraColumns.profit && (
                    <td className="py-3 px-4 font-mono font-black">
                      {(() => {
                        const weightedSellingPerUnit = displayRecords.reduce((s, r) => {
                          const sp = rawProductMap.get(r.productId)?.sellingPrice ?? 0;
                          if (sp <= 0) return s;
                          return s + (sp * r.totalProducedQty);
                        }, 0) / (totalQty > 0 ? totalQty : 1);
                        const totalProfit = weightedSellingPerUnit - overallAvg;
                        return (
                          <span className={totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatCost(totalProfit)}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {baseColumns.status && <td className="py-3 px-4" />}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Close month button */}
      {canClose && records.length > 0 && !allClosed && (
        <div className="flex justify-end">
          {!confirmClose ? (
            <Button variant="outline" onClick={() => setConfirmClose(true)}>
              <span className="material-icons-round text-[18px] ml-1">lock</span>
              إغلاق فترة {monthLabel}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[var(--border-radius-lg)] p-4">
              <span className="material-icons-round text-red-500">warning</span>
              <p className="text-sm text-red-700 dark:text-red-400 font-semibold">
                سيتم إغلاق الفترة ولن يمكن إعادة الحساب. متأكد؟
              </p>
              <Button onClick={handleCloseMonth} disabled={closingMonth}>
                {closingMonth ? 'جاري الإغلاق...' : 'تأكيد الإغلاق'}
              </Button>
              <Button variant="outline" onClick={() => setConfirmClose(false)}>
                إلغاء
              </Button>
            </div>
          )}
        </div>
      )}

      {showColumnsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowColumnsModal(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="erp-page-actions">
                <span className="material-icons-round text-primary">tune</span>
                <h3 className="text-lg font-bold">إدارة الأعمدة</h3>
              </div>
              <button onClick={() => setShowColumnsModal(false)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between pb-1">
                <p className="text-sm font-bold text-[var(--color-text)]">أعمدة أساسية</p>
                <Button variant="outline" onClick={showAllBaseColumns}>
                  إظهار الكل
                </Button>
              </div>
              {BASE_COLUMN_MODAL_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] border cursor-pointer transition-all ${
                    baseColumns[opt.key]
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-[var(--color-border)] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={baseColumns[opt.key]}
                    onChange={(e) => toggleBaseColumn(opt.key, e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                  />
                  <span className={`material-icons-round text-lg ${baseColumns[opt.key] ? 'text-primary' : 'text-slate-400'}`}>{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">{opt.label}</p>
                  </div>
                </label>
              ))}
              <div className="pt-3 mt-2 border-t border-[var(--color-border)]">
                <p className="text-sm font-bold text-[var(--color-text)] mb-2">أعمدة إضافية</p>
              </div>
              {[
                { key: 'materialsAndPackaging' as const, label: 'إجمالي تكلفة المواد والتغليف', icon: 'inventory_2' },
                { key: 'sellingPrice' as const, label: 'سعر البيع', icon: 'sell' },
                { key: 'profit' as const, label: 'ربح الوحدة', icon: 'trending_up' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] border cursor-pointer transition-all ${
                    extraColumns[opt.key]
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-[var(--color-border)] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={extraColumns[opt.key]}
                    onChange={(e) => toggleExtraColumn(opt.key, e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                  />
                  <span className={`material-icons-round text-lg ${extraColumns[opt.key] ? 'text-primary' : 'text-slate-400'}`}>{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">{opt.label}</p>
                  </div>
                </label>
              ))}
              {centerColumns.length > 0 && (
                <>
                  <div className="pt-3 mt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                    <p className="text-sm font-bold text-[var(--color-text)]">أعمدة مراكز التكلفة</p>
                    <Button variant="outline" onClick={showAllCenterColumns}>
                      إظهار الكل
                    </Button>
                  </div>
                  {centerColumns.map((center) => {
                    const checked = centerColumnsVisibility[center.id] !== false;
                    return (
                      <label
                        key={center.id}
                        className={`flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] border cursor-pointer transition-all ${
                          checked
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-[var(--color-border)] hover:bg-[#f8f9fa]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleCenterColumn(center.id, e.target.checked)}
                          className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                        />
                        <span className={`material-icons-round text-lg ${checked ? 'text-primary' : 'text-slate-400'}`}>account_balance</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--color-text)] truncate">{center.name}</p>
                        </div>
                      </label>
                    );
                  })}
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end">
              <Button variant="outline" onClick={() => setShowColumnsModal(false)}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={analysisOpen} onOpenChange={(open) => { if (!open) closeCostAnalysis(); }}>
        <DialogContent className="max-w-2xl w-[min(100vw-1.5rem,42rem)] max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {analysisRecord
                ? `تحليل التكلفة — ${shortProductName(productNameMap.get(analysisRecord.productId) || analysisRecord.productId)}`
                : 'تحليل التكلفة'}
            </DialogTitle>
            <DialogDescription className="text-right text-[var(--color-text-muted)]">
              {monthLabel}
              {analysisRecord && productCodeMap.get(analysisRecord.productId)
                ? ` · ${productCodeMap.get(analysisRecord.productId)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {!analysisRecord && analysisProductId && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              لا يوجد هذا المنتج في الجدول الحالي (قد يكون مُستثنى بالفلتر أو بلا كمية لهذا الشهر).
            </p>
          )}
          {analysisRecord && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-[var(--color-border)] p-3 bg-[#f8f9fa]/40">
                <div>
                  <span className="text-[var(--color-text-muted)] text-xs block">الكمية المنتجة</span>
                  <span className="font-mono font-bold">{formatCost(analysisRecord.totalProducedQty)}</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] text-xs block">متوسط تكلفة الوحدة</span>
                  <span className="font-mono font-bold text-primary">{formatCost(analysisRecord.averageUnitCost)} ج.م</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] text-xs block">إجمالي التكلفة</span>
                  <span className="font-mono font-semibold">{formatCost(analysisRecord.totalProductionCost)} ج.م</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] text-xs block">الانحراف عن {previousMonthLabel}</span>
                  {(() => {
                    const info = prevMonthInfoMap[analysisRecord.productId];
                    const prevAvg =
                      info?.closed && (info.avg || 0) > 0 ? info.avg : null;
                    if (prevAvg == null) {
                      return <span className="text-[var(--color-text-muted)]">— (لا يوجد معيار معتمد)</span>;
                    }
                    const diff = analysisRecord.averageUnitCost - prevAvg;
                    const pct = prevAvg > 0 ? (diff / prevAvg) * 100 : 0;
                    return (
                      <span className={`font-mono font-bold ${diff >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {diff >= 0 ? '+' : ''}{formatCost(diff)} ج.م ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                        <span className="block text-[10px] font-normal text-[var(--color-text-muted)]">
                          مقابل {formatCost(prevAvg)} ج.م/وحدة معتمدة
                        </span>
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3 bg-white/60">
                <p className="text-xs font-bold text-[var(--color-text-muted)]">تحليل انحراف التكلفة (ذكاء)</p>
                {deviationAnalysis.loading && (
                  <p className="text-xs text-[var(--color-text-muted)]">جاري تحليل الانحراف والاتجاه…</p>
                )}
                {!deviationAnalysis.loading && deviationAnalysis.alert && (
                  <Alert className="border-amber-300/80 bg-amber-50/90 text-amber-950 text-right [&>svg]:right-4 [&>svg]:left-auto [&>svg+div]:pr-7 [&>svg+div]:pl-0">
                    <AlertTitle className="text-sm font-bold">تنبيه اتجاه</AlertTitle>
                    <AlertDescription>{deviationAnalysis.alert}</AlertDescription>
                  </Alert>
                )}
                {!deviationAnalysis.loading && deviationAnalysis.analysis && !deviationAnalysis.analysis.valid && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                    {deviationAnalysis.analysis.message || deviationAnalysis.analysis.summary}
                  </p>
                )}
                {!deviationAnalysis.loading &&
                  deviationAnalysis.analysis?.valid &&
                  deviationAnalysis.analysis.deviationPercent !== undefined && (
                    <div className="space-y-2 text-right">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-xs text-[var(--color-text-muted)]">انحراف عن الشهر السابق (المحرّك)</span>
                        <span
                          className={`font-mono font-bold ${
                            (deviationAnalysis.analysis.deviation ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {(deviationAnalysis.analysis.deviationPercent ?? 0) >= 0 ? '+' : ''}
                          {((deviationAnalysis.analysis.deviationPercent ?? 0) * 100).toFixed(1)}٪
                          <span className="text-[10px] font-normal text-[var(--color-text-muted)] mr-1">
                            ({(deviationAnalysis.analysis.deviation ?? 0) >= 0 ? '+' : ''}
                            {formatCost(deviationAnalysis.analysis.deviation ?? 0)} ج.م/وحدة)
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text)]">{deviationAnalysis.analysis.summary}</p>
                      {deviationAnalysis.analysis.topReason && (
                        <p className="text-xs">
                          <span className="text-[var(--color-text-muted)]">السبب الأبرز: </span>
                          <span className="font-semibold">{deviationAnalysis.analysis.topReason.title}</span>
                          {deviationAnalysis.analysis.topReason.supportedByNotes ? (
                            <span className="text-emerald-700 mr-1">(مدعوم بملاحظات)</span>
                          ) : null}
                        </p>
                      )}
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        ثقة النموذج: {deviationAnalysis.analysis.confidence}%
                      </p>
                      {deviationAnalysis.analysis.reasons.length > 0 && (
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-[var(--color-text)] max-h-32 overflow-y-auto">
                          {deviationAnalysis.analysis.reasons.slice(0, 8).map((r) => (
                            <li key={r.id}>
                              <span className="font-medium">{r.title}</span>
                              {r.evidence?.length ? (
                                <span className="text-[var(--color-text-muted)]"> — {r.evidence[0]}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                {!deviationAnalysis.loading && deviationAnalysis.history.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-2">آخر لقطات (حتى 6 أشهر)</p>
                    <div className="flex flex-wrap gap-2 justify-end">
                      {[...deviationAnalysis.history]
                        .sort((a, b) => b.month.localeCompare(a.month))
                        .map((h) => {
                          const [y, m] = h.month.split('-').map(Number);
                          const label =
                            y && m
                              ? new Date(y, m - 1).toLocaleDateString('ar-EG', {
                                  year: '2-digit',
                                  month: 'short',
                                })
                              : h.month;
                          const pct = h.deviationPercent * 100;
                          return (
                            <div
                              key={h.month}
                              className="rounded-md border border-[var(--color-border)] bg-[#f8f9fa] px-2 py-1 text-[10px] font-mono text-right min-w-[5.5rem]"
                            >
                              <div className="text-[var(--color-text-muted)]">{label}</div>
                              <div className={pct >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {pct >= 0 ? '+' : ''}
                                {pct.toFixed(1)}٪
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
              {(() => {
                const norm = getNormalizedBreakdown(analysisRecord);
                const q = Math.max(0, analysisRecord.totalProducedQty || 0);
                return (
                  <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-1">
                    <p className="text-xs font-bold text-[var(--color-text-muted)] mb-2">مباشر / غير مباشر (حسب آخر تفكيك)</p>
                    <p className="font-mono text-blue-700">
                      مباشر: {formatCost(norm.directCost)} ج.م
                      {q > 0 ? ` — ${formatCost(norm.directCost / q)} / وحدة` : ''}
                    </p>
                    <p className="font-mono text-slate-600">
                      غير مباشر: {formatCost(norm.indirectCost)} ج.م
                      {q > 0 ? ` — ${formatCost(norm.indirectCost / q)} / وحدة` : ''}
                    </p>
                  </div>
                );
              })()}
              {analysisCenterTop.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-muted)] mb-2">أعلى مراكز تكلفة (حسب الإجمالي)</p>
                  <ul className="space-y-1 border border-[var(--color-border)] rounded-lg p-3 max-h-40 overflow-y-auto">
                    {analysisCenterTop.map((c) => (
                      <li key={c.name} className="flex justify-between gap-2 text-xs font-mono">
                        <span className="truncate">{c.name}</span>
                        <span className="text-[var(--color-text-muted)] shrink-0">
                          {formatCost(c.total)} ج.م · {formatCost(c.perUnit)}/وحدة
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysisHeuristics.length > 0 && (
                <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 space-y-2">
                  <p className="text-xs font-bold text-sky-800">ملاحظات آلية</p>
                  <ul className="list-disc list-inside space-y-1 text-sky-900 text-xs">
                    {analysisHeuristics.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-[var(--color-text-muted)] mb-2">ملاحظات تقارير الإنتاج (نص حر)</p>
                {analysisReportsLoading ? (
                  <p className="text-xs text-[var(--color-text-muted)]">جاري تحميل التقارير...</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto border border-[var(--color-border)] rounded-lg p-3">
                    {analysisReports
                      .filter((rep) => (rep.notes || '').trim().length > 0)
                      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                      .map((rep) => (
                        <li key={rep.id || `${rep.date}-${rep.lineId}`} className="text-xs border-b border-[var(--color-border)]/60 pb-2 last:border-0">
                          <span className="font-mono text-[var(--color-text-muted)]">{rep.date}</span>
                          {' · '}
                          <span>{lineNameMap.get(rep.lineId) || rep.lineId}</span>
                          {rep.notes?.trim() ? (
                            <p className="mt-1 text-[var(--color-text)] whitespace-pre-wrap">{rep.notes.trim()}</p>
                          ) : null}
                        </li>
                      ))}
                    {analysisReports.filter((rep) => (rep.notes || '').trim().length > 0).length === 0 && (
                      <li className="text-[var(--color-text-muted)] text-xs">لا توجد ملاحظات في التقارير لهذا المنتج في هذا الشهر.</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:space-x-0">
            <Button type="button" variant="outline" onClick={closeCostAnalysis}>
              إغلاق
            </Button>
            {analysisRecord && (
              <Button type="button" onClick={() => void handleCopyAnalysisContext()}>
                <span className="material-icons-round text-[18px] ml-1">content_copy</span>
                نسخ السياق للتحليل
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPageShell>
  );
};




