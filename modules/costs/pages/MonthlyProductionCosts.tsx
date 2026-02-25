import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button, KPIBox } from '../components/UI';
import { useShallowStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { monthlyProductionCostService } from '../../../services/monthlyProductionCostService';
import { reportService } from '../../../services/reportService';
import { getCurrentMonth, formatCost, calculateDailyIndirectCost, buildSupervisorHourlyRatesMap } from '../../../utils/costCalculations';
import { productMaterialService } from '../../../services/productMaterialService';
import type { MonthlyProductionCost } from '../../../types';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type ExtraColumnKey = 'materialsAndPackaging' | 'sellingPrice' | 'profit';
const EXTRA_COLUMNS_PREF_KEY = 'monthly_costs_extra_columns_v1';
const DEFAULT_EXTRA_COLUMNS: Record<ExtraColumnKey, boolean> = {
  materialsAndPackaging: true,
  sellingPrice: true,
  profit: true,
};

const shortProductName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[1]}`;
};

export const MonthlyProductionCosts: React.FC = () => {
  const navigate = useNavigate();
  const {
    products,
    _rawProducts,
    _rawEmployees,
    costCenters,
    costCenterValues,
    costAllocations,
    laborSettings,
  } = useShallowStore((s) => ({
    products: s.products,
    _rawProducts: s._rawProducts,
    _rawEmployees: s._rawEmployees,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    laborSettings: s.laborSettings,
  }));

  const supervisorHourlyRates = useMemo(
    () => buildSupervisorHourlyRatesMap(_rawEmployees),
    [_rawEmployees]
  );

  const { can } = usePermission();
  const canManage = can('costs.manage');
  const canClose = can('costs.closePeriod');

  const [month, setMonth] = useState(getCurrentMonth());
  const [records, setRecords] = useState<MonthlyProductionCost[]>([]);
  const [breakdownMap, setBreakdownMap] = useState<Record<string, { directCost: number; indirectCost: number }>>({});
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
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
  const [materialsTotalMap, setMaterialsTotalMap] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await monthlyProductionCostService.getByMonth(month);
      const hourlyRate = laborSettings?.hourlyRate ?? 0;
      const startDate = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const allReports = await reportService.getByDateRange(startDate, endDate);

      const lineDateTotals = new Map<string, number>();
      allReports.forEach((r) => {
        const key = `${r.lineId}_${r.date}`;
        lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
      });

      const indirectCache = new Map<string, number>();
      const nextBreakdown: Record<string, { directCost: number; indirectCost: number }> = {};
      allReports.forEach((r) => {
        if (!r.quantityProduced || r.quantityProduced <= 0) return;
        const current = nextBreakdown[r.productId] || { directCost: 0, indirectCost: 0 };
        current.directCost += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;

        const reportMonth = r.date?.slice(0, 7) || month;
        const cacheKey = `${r.lineId}_${reportMonth}`;
        if (!indirectCache.has(cacheKey)) {
          indirectCache.set(
            cacheKey,
            calculateDailyIndirectCost(r.lineId, reportMonth, costCenters, costCenterValues, costAllocations)
          );
        }
        const lineIndirect = indirectCache.get(cacheKey) || 0;
        const lineDateKey = `${r.lineId}_${r.date}`;
        const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
        if (lineDateTotal > 0) {
          current.indirectCost += lineIndirect * (r.quantityProduced / lineDateTotal);
        }
        current.indirectCost += (supervisorHourlyRates.get(r.employeeId) || 0) * (r.workHours || 0);

        nextBreakdown[r.productId] = current;
      });

      if (mountedRef.current) {
        setRecords(data);
        setBreakdownMap(nextBreakdown);
      }
    } catch {
      // silently fail
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [month, laborSettings, costCenters, costCenterValues, costAllocations, supervisorHourlyRates]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const productNameMap = new Map(products.map((p) => [p.id, p.name]));
  const productCodeMap = new Map(products.map((p) => [p.id, p.code || '']));
  const productCategoryMap = new Map(products.map((p) => [p.id, p.category || '']));
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

  useEffect(() => {
    let cancelled = false;
    const productIds: string[] = Array.from(
      new Set(records.map((r) => String(r.productId || '')).filter((pid) => pid.length > 0))
    );
    if (productIds.length === 0) {
      setMaterialsTotalMap({});
      return;
    }
    Promise.all(
      productIds.map(async (pid) => {
        try {
          const materials = await productMaterialService.getByProduct(pid);
          const total = materials.reduce((s, m) => s + (m.quantityUsed || 0) * (m.unitCost || 0), 0);
          return [pid, total] as const;
        } catch {
          return [pid, 0] as const;
        }
      })
    ).then((entries: ReadonlyArray<readonly [string, number]>) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      entries.forEach(([pid, total]) => { next[String(pid)] = total; });
      setMaterialsTotalMap(next);
    });
    return () => { cancelled = true; };
  }, [records, month]);

  const handleCalculateAll = async () => {
    if (!laborSettings) return;
    setCalculating(true);
    try {
      const productIds = products.map((p) => p.id).filter(Boolean) as string[];
      await monthlyProductionCostService.calculateAll(
        productIds,
        month,
        laborSettings.hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        supervisorHourlyRates
      );
      await fetchRecords();
    } catch {
      // error handled silently
    } finally {
      if (mountedRef.current) setCalculating(false);
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
    () => records.filter((r) => (r.averageUnitCost || 0) > 0),
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

  const totalQty = displayRecords.reduce((s, r) => s + r.totalProducedQty, 0);
  const totalCost = displayRecords.reduce((s, r) => s + r.totalProductionCost, 0);
  const totalDirect = displayRecords.reduce(
    (s, r) => s + (breakdownMap[r.productId]?.directCost ?? r.totalProductionCost),
    0
  );
  const totalIndirect = displayRecords.reduce(
    (s, r) => s + (breakdownMap[r.productId]?.indirectCost ?? 0),
    0
  );
  const overallAvg = totalQty > 0 ? totalCost / totalQty : 0;

  const handleExport = () => {
    const rows = displayRecords.map((r) => {
      const directCost = breakdownMap[r.productId]?.directCost ?? r.totalProductionCost;
      const indirectCost = breakdownMap[r.productId]?.indirectCost ?? 0;
      const qty = r.totalProducedQty;
      const raw = rawProductMap.get(r.productId);
      const chinese = raw?.chineseUnitCost ?? 0;
      const inner = raw?.innerBoxCost ?? 0;
      const outer = raw?.outerCartonCost ?? 0;
      const units = raw?.unitsPerCarton ?? 0;
      const cartonShare = units > 0 ? outer / units : 0;
      const materialsAndPackaging = chinese + (materialsTotalMap[r.productId] ?? 0) + inner + cartonShare;
      const sellingPrice = raw?.sellingPrice ?? 0;
      const unitProfit = sellingPrice > 0 ? sellingPrice - r.averageUnitCost : 0;
      const row: Record<string, any> = {
      'كود المنتج': productCodeMap.get(r.productId) || '',
      'اسم المنتج': productNameMap.get(r.productId) || r.productId,
      'الشهر': r.month,
      'الكمية المنتجة': qty,
      'إجمالي التكلفة': r.totalProductionCost,
      'مباشر': directCost,
      'مباشر / قطعة': qty > 0 ? directCost / qty : 0,
      'غير مباشر': indirectCost,
      'غير مباشر / قطعة': qty > 0 ? indirectCost / qty : 0,
      'متوسط تكلفة الوحدة': r.averageUnitCost,
      'الحالة': r.isClosed ? 'مغلق' : 'مفتوح',
      };
      if (extraColumns.materialsAndPackaging) row['إجمالي تكلفة المواد والتغليف (ج.م/وحدة)'] = materialsAndPackaging;
      if (extraColumns.sellingPrice) row['سعر البيع (ج.م/وحدة)'] = sellingPrice;
      if (extraColumns.profit) row['ربح القطعة (ج.م/وحدة)'] = sellingPrice > 0 ? unitProfit : '—';
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تكلفة الإنتاج الشهرية');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buf]), `تكلفة-الإنتاج-${month}.xlsx`);
  };

  const monthLabel = (() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="material-icons-round text-white text-2xl">price_check</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">تكلفة الإنتاج الشهرية</h2>
            <p className="text-sm text-slate-500 font-medium">حساب ومراجعة تكلفة الإنتاج لكل منتج حسب الشهر</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
          />
          {canManage && (
            <Button onClick={handleCalculateAll} disabled={calculating}>
              <span className="material-icons-round text-[18px] ml-1">calculate</span>
              {calculating ? 'جاري الحساب...' : 'حساب الكل'}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
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

      {/* Month close banner */}
      {allClosed && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-emerald-600">lock</span>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            فترة {monthLabel} مُغلقة — لا يمكن إعادة الحساب
          </p>
        </div>
      )}

      {/* Table */}
      <Card>
        {tableRecords.length > 0 && (
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2 md:ml-auto">
              <span className="material-icons-round text-slate-400 text-sm">search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث بالاسم أو الكود..."
                className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 w-full md:w-64"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
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
                {can('export') && (
                  <Button variant="outline" onClick={handleExport}>
                    <span className="material-icons-round text-[18px] ml-1">file_download</span>
                    تصدير Excel
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4 text-right font-bold">#</th>
                  <th className="py-3 px-4 text-right font-bold">كود المنتج</th>
                  <th className="py-3 px-4 text-right font-bold">اسم المنتج</th>
                  <th className="py-3 px-4 text-right font-bold">الكمية المنتجة</th>
                  <th className="py-3 px-4 text-right font-bold">إجمالي التكلفة</th>
                  <th className="py-3 px-4 text-right font-bold">مباشر / غير مباشر</th>
                  <th className="py-3 px-4 text-right font-bold">متوسط تكلفة الوحدة</th>
                  {extraColumns.materialsAndPackaging && (
                    <th className="py-3 px-4 text-right font-bold">إجمالي تكلفة المواد والتغليف</th>
                  )}
                  {extraColumns.sellingPrice && (
                    <th className="py-3 px-4 text-right font-bold">سعر البيع</th>
                  )}
                  {extraColumns.profit && (
                    <th className="py-3 px-4 text-right font-bold">ربح القطعة</th>
                  )}
                  <th className="py-3 px-4 text-center font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/products/${r.productId}`)}
                  >
                    <td className="py-3 px-4 text-slate-400 font-mono">{i + 1}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">{productCodeMap.get(r.productId) || '—'}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-white">
                      <span title={productNameMap.get(r.productId) || r.productId}>
                        {shortProductName(productNameMap.get(r.productId) || r.productId)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">{formatCost(r.totalProducedQty)}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-amber-700 dark:text-amber-400">
                      {formatCost(r.totalProductionCost)}
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const direct = breakdownMap[r.productId]?.directCost ?? r.totalProductionCost;
                        const indirect = breakdownMap[r.productId]?.indirectCost ?? 0;
                        const directPerPiece = r.totalProducedQty > 0 ? direct / r.totalProducedQty : 0;
                        const indirectPerPiece = r.totalProducedQty > 0 ? indirect / r.totalProducedQty : 0;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400 font-bold leading-5">
                              {formatCost(direct)} <span className="text-[10px] font-normal opacity-70">مباشر</span>
                              <span className="text-[10px] font-medium opacity-70"> — {formatCost(directPerPiece)} / قطعة</span>
                            </span>
                            <span className="text-xs tabular-nums text-slate-500 font-bold leading-5">
                              {formatCost(indirect)} <span className="text-[10px] font-normal opacity-70">غ.مباشر</span>
                              <span className="text-[10px] font-medium opacity-70"> — {formatCost(indirectPerPiece)} / قطعة</span>
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-primary">
                      {formatCost(r.averageUnitCost)}
                    </td>
                    {extraColumns.materialsAndPackaging && (
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
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
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                        {formatCost(rawProductMap.get(r.productId)?.sellingPrice ?? 0)}
                      </td>
                    )}
                    {extraColumns.profit && (
                      <td className="py-3 px-4 font-mono font-black">
                        {(() => {
                          const sellingPrice = rawProductMap.get(r.productId)?.sellingPrice ?? 0;
                          if (sellingPrice <= 0) return <span className="text-slate-400">—</span>;
                          const profit = sellingPrice - r.averageUnitCost;
                          return (
                            <span className={profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {formatCost(profit)}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                      <Badge variant={r.isClosed ? 'success' : 'warning'}>
                        {r.isClosed ? 'مغلق' : 'مفتوح'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 font-bold">
                  <td className="py-3 px-4" colSpan={3}>الإجمالي</td>
                  <td className="py-3 px-4 font-mono">{formatCost(totalQty)}</td>
                  <td className="py-3 px-4 font-mono text-amber-700 dark:text-amber-400">{formatCost(totalCost)}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400 font-bold leading-5">
                        {formatCost(totalDirect)} <span className="text-[10px] font-normal opacity-70">مباشر</span>
                        <span className="text-[10px] font-medium opacity-70"> — {formatCost(totalQty > 0 ? totalDirect / totalQty : 0)} / قطعة</span>
                      </span>
                      <span className="text-xs tabular-nums text-slate-500 font-bold leading-5">
                        {formatCost(totalIndirect)} <span className="text-[10px] font-normal opacity-70">غ.مباشر</span>
                        <span className="text-[10px] font-medium opacity-70"> — {formatCost(totalQty > 0 ? totalIndirect / totalQty : 0)} / قطعة</span>
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-primary">{formatCost(overallAvg)}</td>
                  {extraColumns.materialsAndPackaging && (
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-200">
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
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-200">
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
                          <span className={totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {formatCost(totalProfit)}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  <td className="py-3 px-4" />
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
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">tune</span>
                <h3 className="text-lg font-bold">إدارة الأعمدة</h3>
              </div>
              <button onClick={() => setShowColumnsModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
              {[
                { key: 'materialsAndPackaging' as const, label: 'إجمالي تكلفة المواد والتغليف', icon: 'inventory_2' },
                { key: 'sellingPrice' as const, label: 'سعر البيع', icon: 'sell' },
                { key: 'profit' as const, label: 'ربح القطعة', icon: 'trending_up' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    extraColumns[opt.key]
                      ? 'border-primary/30 bg-primary/5 dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={extraColumns[opt.key]}
                    onChange={(e) => toggleExtraColumn(opt.key, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                  />
                  <span className={`material-icons-round text-lg ${extraColumns[opt.key] ? 'text-primary' : 'text-slate-400'}`}>{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 dark:text-white">{opt.label}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <Button variant="outline" onClick={() => setShowColumnsModal(false)}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
