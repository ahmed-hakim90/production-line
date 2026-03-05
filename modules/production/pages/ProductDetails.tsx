
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, KPIBox, Button, LoadingSkeleton } from '../components/UI';
import { PageHeader } from '../../../components/PageHeader';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { reportService } from '@/modules/production/services/reportService';
import {
  formatNumber,
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  findBestLine,
  groupReportsByDate,
  countUniqueDays,
  getReportWaste,
} from '../../../utils/calculations';
import {
  buildProductCosts,
  buildProductAvgCost,
  buildProductCostByLine,
  buildProductCostHistory,
  formatCost,
  getCurrentMonth,
} from '../../../utils/costCalculations';
import { usePermission } from '../../../utils/permissions';
import { ProductionReport, MonthlyProductionCost, ProductMaterial } from '../../../types';
import { monthlyProductionCostService } from '../services/monthlyProductionCostService';
import { productMaterialService } from '../services/productMaterialService';
import { stockService } from '../../inventory/services/stockService';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { StockItemBalance } from '../../inventory/types';
import type { RawMaterial } from '../../inventory/types';
import { calculateProductCostBreakdown } from '../../../utils/productCostBreakdown';
import { exportProductReports, exportSingleProduct } from '../../../utils/exportExcel';
import type { SingleProductExportData } from '../../../utils/exportExcel';
import { exportToPDF, shareToWhatsApp, type ShareResult } from '../../../utils/reportExport';
import {
  ProductionReportPrint,
  mapReportsToPrintRows,
  computePrintTotals,
} from '../components/ProductionReportPrint';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useRegisterModalOpener } from '../../../components/modal-manager/useRegisterModalOpener';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';

const normalizeMaterialText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

const toDateInputValue = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s.employees);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const todayReports = useAppStore((s) => s.todayReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings);

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [currentMonthCost, setCurrentMonthCost] = useState<MonthlyProductionCost | null>(null);
  const [previousMonthCost, setPreviousMonthCost] = useState<MonthlyProductionCost | null>(null);
  const [materials, setMaterials] = useState<ProductMaterial[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<StockItemBalance[]>([]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ProductMaterial | null>(null);
  const [materialForm, setMaterialForm] = useState({ materialId: '', materialName: '', quantityUsed: 0, unitCost: 0 });
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialSaveMsg, setMaterialSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reportViewMode, setReportViewMode] = useState<'all' | 'range'>('all');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportFilterLineId, setReportFilterLineId] = useState('');
  const [reportFilterEmployeeId, setReportFilterEmployeeId] = useState('');
  const printComponentRef = useRef<HTMLDivElement>(null);

  const product = products.find((p) => p.id === id);
  const rawProduct = _rawProducts.find((p) => p.id === id);
  const updateProduct = useAppStore((s) => s.updateProduct);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    reportService
      .getByProduct(id)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch((err) => {
        console.error('Failed to fetch product reports:', err);
        if (!cancelled) setFetchError(err?.message || 'فشل تحميل التقارير');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadMaterials = useCallback(async () => {
    if (!id) return;
    try {
      const data = await productMaterialService.getByProduct(id);
      setMaterials(data);
    } catch (err) {
      console.error('Failed to load product materials:', err);
    }
  }, [id]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await rawMaterialService.getAll();
        setRawMaterials(rows.filter((row) => row.isActive !== false));
      } catch {
        setRawMaterials([]);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await stockService.getBalances();
        setInventoryBalances(rows);
      } catch {
        setInventoryBalances([]);
      }
    })();
  }, []);

  const costBreakdown = useMemo(() => {
    if (!rawProduct) return null;
    const avgCost = currentMonthCost?.averageUnitCost ?? 0;
    return calculateProductCostBreakdown(rawProduct, materials, avgCost);
  }, [rawProduct, materials, currentMonthCost]);

  const chineseRate = laborSettings?.cnyToEgpRate ?? 0;
  const chineseUnitCostInCny = useMemo(() => {
    if (!costBreakdown || chineseRate <= 0) return null;
    return costBreakdown.chineseUnitCost / chineseRate;
  }, [costBreakdown, chineseRate]);

  const handleSaveMaterial = useCallback(async () => {
    if (!id || savingMaterial) return;
    const selectedRawMaterial = rawMaterials.find((row) => row.id === materialForm.materialId);
    const cleanName = (selectedRawMaterial?.name || materialForm.materialName || '').trim();
    if (!cleanName) {
      setMaterialSaveMsg({ type: 'error', text: 'اختر مادة خام من تعريف المواد الخام أولاً.' });
      return;
    }

    setSavingMaterial(true);
    setMaterialSaveMsg(null);
    try {
      const resolvedMaterialId = selectedRawMaterial?.id ?? materialForm.materialId ?? undefined;
      if (editingMaterial?.id) {
        await productMaterialService.update(editingMaterial.id, {
          materialId: resolvedMaterialId,
          materialName: cleanName,
          quantityUsed: materialForm.quantityUsed,
          unitCost: materialForm.unitCost,
        });
      } else {
        await productMaterialService.create({
          productId: id,
          materialId: resolvedMaterialId,
          materialName: cleanName,
          quantityUsed: materialForm.quantityUsed,
          unitCost: materialForm.unitCost,
        });
      }
      await loadMaterials();
      setMaterialSaveMsg({ type: 'success', text: editingMaterial ? 'تم حفظ تعديلات المادة بنجاح' : 'تمت إضافة المادة بنجاح' });
      if (!editingMaterial) {
        setMaterialForm({ materialId: '', materialName: '', quantityUsed: 0, unitCost: 0 });
      }
    } catch (err) {
      console.error('Save material error:', err);
      setMaterialSaveMsg({ type: 'error', text: 'تعذر حفظ المادة الخام. حاول مرة أخرى.' });
    } finally {
      setSavingMaterial(false);
    }
  }, [id, materialForm, savingMaterial, editingMaterial, loadMaterials, rawMaterials]);

  const handleDeleteMaterial = useCallback(async (materialId: string) => {
    try {
      await productMaterialService.delete(materialId);
      await loadMaterials();
    } catch (err) {
      console.error('Delete material error:', err);
    }
  }, [loadMaterials]);

  const openEditMaterial = (m: ProductMaterial) => {
    const matchedRawMaterial = m.materialId
      ? rawMaterials.find((row) => row.id === m.materialId)
      : rawMaterials.find((row) => normalizeMaterialText(row.name) === normalizeMaterialText(m.materialName || ''));

    setEditingMaterial(m);
    setMaterialForm({
      materialId: matchedRawMaterial?.id || m.materialId || '',
      materialName: matchedRawMaterial?.name || m.materialName,
      quantityUsed: m.quantityUsed,
      unitCost: m.unitCost,
    });
    setMaterialSaveMsg(null);
    setShowMaterialModal(true);
  };

  const openAddMaterial = () => {
    setEditingMaterial(null);
    setMaterialForm({ materialId: '', materialName: '', quantityUsed: 0, unitCost: 0 });
    setMaterialSaveMsg(null);
    setShowMaterialModal(true);
  };
  useRegisterModalOpener(MODAL_KEYS.PRODUCT_MATERIALS_CREATE, () => openAddMaterial());

  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const previousMonth = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const prev = m === 1 ? new Date(y - 1, 11, 1) : new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }, [currentMonth]);

  const loadMonthlyCosts = useCallback(async () => {
    if (!id || !canViewCosts) return;
    try {
      const [cur, prev] = await Promise.all([
        monthlyProductionCostService.getByProductAndMonth(id, currentMonth),
        monthlyProductionCostService.getByProductAndMonth(id, previousMonth),
      ]);
      setCurrentMonthCost(cur);
      setPreviousMonthCost(prev);
    } catch (err) {
      console.error('Failed to load monthly production costs:', err);
    }
  }, [id, canViewCosts, currentMonth, previousMonth]);

  useEffect(() => { loadMonthlyCosts(); }, [loadMonthlyCosts]);

  const handleRecalculate = useCallback(async () => {
    if (!id || recalculating) return;
    setRecalculating(true);
    try {
      const hourly = laborSettings?.hourlyRate ?? 0;
      await monthlyProductionCostService.calculate(
        id, currentMonth, hourly, costCenters, costCenterValues, costAllocations
      );
      await loadMonthlyCosts();
    } catch (err) {
      console.error('Recalculate monthly average failed:', err);
    } finally {
      setRecalculating(false);
    }
  }, [id, recalculating, laborSettings, costCenters, costCenterValues, costAllocations, currentMonth, loadMonthlyCosts]);

  const monthlyCostChange = useMemo(() => {
    if (!currentMonthCost || !previousMonthCost) return null;
    if (currentMonthCost.averageUnitCost <= 0 || previousMonthCost.averageUnitCost <= 0) return null;
    const pct = ((currentMonthCost.averageUnitCost - previousMonthCost.averageUnitCost) / previousMonthCost.averageUnitCost) * 100;
    return Math.round(pct * 10) / 10;
  }, [currentMonthCost, previousMonthCost]);

  const scopedReports = useMemo(() => {
    let list = reports;
    if (reportFilterLineId) list = list.filter((r) => r.lineId === reportFilterLineId);
    if (reportFilterEmployeeId) list = list.filter((r) => r.employeeId === reportFilterEmployeeId);
    if (reportViewMode === 'range' && reportStartDate && reportEndDate) {
      list = list.filter((r) => r.date >= reportStartDate && r.date <= reportEndDate);
    }
    return list;
  }, [reports, reportFilterLineId, reportFilterEmployeeId, reportViewMode, reportStartDate, reportEndDate]);

  const totalProduced = useMemo(
    () => scopedReports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [scopedReports]
  );

  const totalWaste = useMemo(
    () => scopedReports.reduce((sum, r) => sum + getReportWaste(r), 0),
    [scopedReports]
  );

  const avgAssemblyTime = useMemo(
    () => calculateAvgAssemblyTime(scopedReports),
    [scopedReports]
  );

  const wasteRatio = useMemo(
    () => calculateWasteRatio(totalWaste, totalProduced + totalWaste),
    [totalWaste, totalProduced]
  );

  const bestLine = useMemo(
    () => findBestLine(scopedReports, _rawLines),
    [scopedReports, _rawLines]
  );

  const chartData = useMemo(() => groupReportsByDate(scopedReports), [scopedReports]);

  const uniqueDays = useMemo(() => countUniqueDays(scopedReports), [scopedReports]);

  const avgDailyProduction = useMemo(
    () => (uniqueDays > 0 ? Math.round(totalProduced / uniqueDays) : 0),
    [totalProduced, uniqueDays]
  );

  const standardTime = useMemo(() => {
    const config = lineProductConfigs.find((c) => c.productId === id);
    return config?.standardAssemblyTime ?? 0;
  }, [lineProductConfigs, id]);

  const getWarehouseBalance = useCallback(
    (warehouseId?: string, productId?: string) => {
      if (!warehouseId || !productId) return 0;
      const row = inventoryBalances.find(
        (x) => x.warehouseId === warehouseId && x.itemType === 'finished_good' && x.itemId === productId,
      );
      return Number(row?.quantity || 0);
    },
    [inventoryBalances],
  );

  const decomposedBalance = useMemo(
    () => getWarehouseBalance(planSettings?.decomposedSourceWarehouseId, id),
    [getWarehouseBalance, planSettings?.decomposedSourceWarehouseId, id],
  );
  const finishedBalance = useMemo(
    () => getWarehouseBalance(planSettings?.finishedReceiveWarehouseId, id),
    [getWarehouseBalance, planSettings?.finishedReceiveWarehouseId, id],
  );
  const wasteBalance = useMemo(
    () => getWarehouseBalance(planSettings?.wasteReceiveWarehouseId, id),
    [getWarehouseBalance, planSettings?.wasteReceiveWarehouseId, id],
  );
  const finalBalance = useMemo(
    () => getWarehouseBalance(planSettings?.finalProductWarehouseId, id),
    [getWarehouseBalance, planSettings?.finalProductWarehouseId, id],
  );
  const decomposedBalanceAfterProduction = useMemo(
    () => Math.max(0, decomposedBalance - finishedBalance - wasteBalance),
    [decomposedBalance, finishedBalance, wasteBalance],
  );

  const todayCost = useMemo(() => {
    if (!canViewCosts || !id) return null;
    const costs = buildProductCosts([id], todayReports, laborSettings, costCenters, costCenterValues, costAllocations);
    return costs[id] ?? null;
  }, [canViewCosts, id, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const getLineName = (lineId: string) => _rawLines.find((l) => l.id === lineId)?.name ?? '—';

  const hourlyRate = laborSettings?.hourlyRate ?? 0;

  const historicalAvgCost = useMemo(() => {
    if (!canViewCosts || !id || scopedReports.length === 0) return null;
    return buildProductAvgCost(id, scopedReports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, id, scopedReports, hourlyRate, costCenters, costCenterValues, costAllocations]);

  const costByLine = useMemo(() => {
    if (!canViewCosts || !id || scopedReports.length === 0) return [];
    return buildProductCostByLine(id, scopedReports, hourlyRate, costCenters, costCenterValues, costAllocations, getLineName);
  }, [canViewCosts, id, scopedReports, hourlyRate, costCenters, costCenterValues, costAllocations, _rawLines]);

  const costHistory = useMemo(() => {
    if (!canViewCosts || !id || scopedReports.length === 0) return [];
    return buildProductCostHistory(id, scopedReports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, id, scopedReports, hourlyRate, costCenters, costCenterValues, costAllocations]);

  const costTrend = useMemo(() => {
    if (costHistory.length < 2) return null;
    const half = Math.floor(costHistory.length / 2);
    const firstHalf = costHistory.slice(0, half);
    const secondHalf = costHistory.slice(half);
    const avgFirst = firstHalf.reduce((s, d) => s + d.costPerUnit, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, d) => s + d.costPerUnit, 0) / secondHalf.length;
    const pctChange = avgFirst > 0 ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100) : 0;
    return { avgFirst, avgSecond, pctChange, improving: pctChange <= 0 };
  }, [costHistory]);

  const bestCostLine = useMemo(() => {
    if (costByLine.length === 0) return null;
    return costByLine.reduce((best, cur) => cur.costPerUnit < best.costPerUnit ? cur : best);
  }, [costByLine]);
  const getEmployeeName = (empId: string) => employees.find((s) => s.id === empId)?.name ?? '—';

  const filteredReports = scopedReports;
  const filteredTotalProduced = totalProduced;
  const filteredTotalWaste = totalWaste;
  const filteredUniqueDays = uniqueDays;
  const activeReportFilterCount =
    (reportViewMode === 'range' && reportStartDate && reportEndDate ? 1 : 0) +
    (reportFilterLineId ? 1 : 0) +
    (reportFilterEmployeeId ? 1 : 0);

  const handleShowAllReports = useCallback(() => {
    setReportViewMode('all');
    setReportStartDate('');
    setReportEndDate('');
  }, []);

  const handleShowTodayReports = useCallback(() => {
    const today = toDateInputValue(new Date());
    setReportViewMode('range');
    setReportStartDate(today);
    setReportEndDate(today);
  }, []);

  const handleShowYesterdayReports = useCallback(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = toDateInputValue(d);
    setReportViewMode('range');
    setReportStartDate(yesterday);
    setReportEndDate(yesterday);
  }, []);

  const handleShowWeeklyReports = useCallback(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setReportViewMode('range');
    setReportStartDate(toDateInputValue(start));
    setReportEndDate(toDateInputValue(end));
  }, []);

  const handleShowMonthlyReports = useCallback(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    setReportViewMode('range');
    setReportStartDate(toDateInputValue(start));
    setReportEndDate(toDateInputValue(end));
  }, []);

  const lookups = useMemo(() => ({
    getLineName,
    getProductName: () => product?.name || rawProduct?.name || '—',
    getEmployeeName,
  }), [_rawLines, employees, product, rawProduct]);

  const printRows = useMemo(() => mapReportsToPrintRows(scopedReports, lookups), [scopedReports, lookups]);
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);
  const productDisplayName = product?.name || rawProduct?.name || '';
  const productHeaderSubtitle = useMemo(() => {
    const pieces: string[] = [];
    if (product?.code || rawProduct?.code) {
      pieces.push(`الكود: ${product?.code || rawProduct?.code}`);
    }
    if (product?.category || rawProduct?.model) {
      pieces.push(`الفئة: ${product?.category || rawProduct?.model}`);
    }
    if (product) {
      const stockLabel = product.stockStatus === 'available'
        ? 'متوفر'
        : product.stockStatus === 'low'
          ? 'منخفض'
          : 'نفذ';
      pieces.push(`المخزون: ${stockLabel}`);
    }
    return pieces.join(' • ');
  }, [product, rawProduct]);

  const handlePrint = useManagedPrint({ contentRef: printComponentRef, printSettings: printTemplate });

  const handlePDF = async () => {
    if (!printComponentRef.current) return;
    setExporting(true);
    try {
      await exportToPDF(printComponentRef.current, `تقرير-${productDisplayName}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: printTemplate?.copies,
      });
    } finally { setExporting(false); }
  };

  const handleWhatsApp = async () => {
    if (!printComponentRef.current) return;
    setExporting(true);
    setShareToast(null);
    try {
      const result = await shareToWhatsApp(printComponentRef.current, `تقرير ${productDisplayName}`);
      showShareFeedback(result);
    }
    finally { setExporting(false); }
  };

  const showShareFeedback = useCallback((result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  }, []);

  const handleExportProduct = () => {
    if (!rawProduct) return;
    const exportData: SingleProductExportData = {
      raw: rawProduct,
      stockLevel: finalBalance,
      totalProduction: finishedBalance,
      totalWaste: wasteBalance,
      wasteRatio: `${wasteRatio}%`,
      avgDailyProduction,
      costBreakdown: costBreakdown ?? null,
      monthlyAvgCost: currentMonthCost?.averageUnitCost ?? null,
      previousMonthAvgCost: previousMonthCost?.averageUnitCost ?? null,
      materials: materials.map((m) => ({
        name: m.materialName,
        qty: m.quantityUsed,
        unitCost: m.unitCost,
        total: m.quantityUsed * m.unitCost,
      })),
      historicalAvgCost: historicalAvgCost?.costPerUnit ?? null,
      costByLine: costByLine.map((l) => ({
        lineName: l.lineName,
        costPerUnit: l.costPerUnit,
        totalCost: l.totalCost,
        qty: l.totalProduced,
      })),
    };
    exportSingleProduct(exportData, canViewCosts);
  };

  if (!product && !rawProduct && !loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-slate-400">
          <span className="material-icons-round text-6xl mb-4 block opacity-30">
            inventory_2
          </span>
          <p className="font-bold text-lg">المنتج غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/products')}>
            <span className="material-icons-round text-sm">arrow_forward</span>
            العودة للمنتجات
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !product) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={productDisplayName || 'تفاصيل المنتج'}
        subtitle={productHeaderSubtitle}
        icon="inventory_2"
        primaryAction={rawProduct ? {
          label: 'تصدير المنتج',
          icon: 'download',
          onClick: handleExportProduct,
        } : undefined}
        secondaryAction={filteredReports.length > 0 ? {
          label: 'تقارير Excel',
          icon: 'table_chart',
          onClick: () => exportProductReports(productDisplayName, filteredReports, lookups),
          disabled: exporting,
        } : undefined}
        moreActions={[
          {
            label: 'طباعة',
            icon: 'print',
            group: 'تصدير',
            hidden: filteredReports.length === 0,
            disabled: exporting,
            onClick: () => handlePrint(),
          },
          {
            label: 'تصدير PDF',
            icon: exporting ? 'refresh' : 'picture_as_pdf',
            group: 'تصدير',
            hidden: filteredReports.length === 0,
            disabled: exporting,
            onClick: handlePDF,
          },
          {
            label: 'مشاركة واتساب',
            icon: 'share',
            group: 'تصدير',
            hidden: filteredReports.length === 0,
            disabled: exporting,
            onClick: handleWhatsApp,
          },
          {
            label: 'العودة للمنتجات',
            icon: 'arrow_forward',
            group: 'تنقل',
            onClick: () => navigate('/products'),
          },
        ]}
      />

      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 sm:px-6 py-3">
        <div className="erp-filter-bar">
          <div className="erp-date-seg">
            <button className={`erp-date-seg-btn${reportViewMode === 'all' ? ' active' : ''}`} onClick={handleShowAllReports}>
              الكل
            </button>
            <button
              className={`erp-date-seg-btn${reportViewMode === 'range' && reportStartDate === reportEndDate && reportStartDate === toDateInputValue(new Date()) ? ' active' : ''}`}
              onClick={handleShowTodayReports}
            >
              اليوم
            </button>
            <button
              className={`erp-date-seg-btn${reportViewMode === 'range' && reportStartDate === reportEndDate && reportStartDate === toDateInputValue(new Date(new Date().setDate(new Date().getDate() - 1))) ? ' active' : ''}`}
              onClick={handleShowYesterdayReports}
            >
              أمس
            </button>
            <button className="erp-date-seg-btn" onClick={handleShowWeeklyReports}>
              أسبوعي
            </button>
            <button className="erp-date-seg-btn" onClick={handleShowMonthlyReports}>
              شهري
            </button>
          </div>

          <div className="erp-filter-date">
            <span className="erp-filter-label">من</span>
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => {
                setReportViewMode('range');
                setReportStartDate(e.target.value);
              }}
            />
          </div>
          <div className="erp-filter-date">
            <span className="erp-filter-label">إلى</span>
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => {
                setReportViewMode('range');
                setReportEndDate(e.target.value);
              }}
            />
          </div>

          <div className="erp-filter-sep" />

          <select
            className={`erp-filter-select${reportFilterLineId ? ' active' : ''}`}
            value={reportFilterLineId}
            onChange={(e) => setReportFilterLineId(e.target.value)}
            style={{ minWidth: 130 }}
          >
            <option value="">كل الخطوط</option>
            {_rawLines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <select
            className={`erp-filter-select${reportFilterEmployeeId ? ' active' : ''}`}
            value={reportFilterEmployeeId}
            onChange={(e) => setReportFilterEmployeeId(e.target.value)}
            style={{ minWidth: 145 }}
          >
            <option value="">كل المشرفين</option>
            {employees.filter((e) => e.level === 2).map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>

          {activeReportFilterCount > 0 && (
            <button
              className="erp-filter-clear"
              onClick={() => {
                handleShowAllReports();
                setReportFilterLineId('');
                setReportFilterEmployeeId('');
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 13 }}>close</span>
              مسح ({activeReportFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* ── Hidden Printable Report ── */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={printComponentRef}>
          <ProductionReportPrint
            title={`تقرير إنتاج المنتج: ${productDisplayName}`}
            subtitle={`${product?.code || rawProduct?.code || ''} — ${uniqueDays} يوم عمل`}
            rows={printRows}
            totals={printTotals}
            printSettings={printTemplate}
          />
          {/* Cost Breakdown Print Section */}
          {canViewCosts && costBreakdown && (
            <div dir="rtl" style={{ fontFamily: 'Calibri, Segoe UI, Tahoma, sans-serif', width: '210mm', padding: '12mm 15mm', background: '#fff', color: '#1e293b', fontSize: '11pt', lineHeight: 1.5, boxSizing: 'border-box', pageBreakBefore: 'always' }}>
              <h2 style={{ margin: '0 0 6mm', fontSize: '16pt', fontWeight: 800, color: '#0f172a', borderBottom: '3px solid #0d9488', paddingBottom: '4mm' }}>
                تفصيل تكلفة المنتج: {productDisplayName}
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt', marginBottom: '8mm' }}>
                <thead className="erp-thead">
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '3mm 4mm', textAlign: 'right', fontWeight: 800, fontSize: '9pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>عنصر التكلفة</th>
                    <th style={{ padding: '3mm 4mm', textAlign: 'center', fontWeight: 800, fontSize: '9pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>القيمة (ج.م)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>تكلفة الوحدة الصينية</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{formatCost(costBreakdown.chineseUnitCost)}</td></tr>
                  <tr style={{ background: '#f8fafc' }}><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>السعر باليوان الصيني</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{chineseUnitCostInCny != null ? `¥ ${formatCost(chineseUnitCostInCny)}` : '—'}</td></tr>
                  <tr style={{ background: '#f8fafc' }}><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>تكلفة المواد الخام ({materials.length} مادة)</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{formatCost(costBreakdown.rawMaterialCost)}</td></tr>
                  <tr><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>تكلفة العلبة الداخلية</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{formatCost(costBreakdown.innerBoxCost)}</td></tr>
                  <tr style={{ background: '#f8fafc' }}><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>نصيب الكرتونة ({costBreakdown.unitsPerCarton > 0 ? `${formatCost(costBreakdown.outerCartonCost)} ÷ ${costBreakdown.unitsPerCarton}` : '—'})</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{formatCost(costBreakdown.cartonShare)}</td></tr>
                  <tr><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>نصيب المصاريف الصناعية (متوسط شهري)</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{formatCost(costBreakdown.productionOverheadShare)}</td></tr>
                </tbody>
                <tfoot>
                  <tr style={{ background: '#e0f2fe' }}>
                    <td style={{ padding: '3mm 4mm', fontWeight: 900, fontSize: '12pt', color: '#0369a1' }}>إجمالي التكلفة المحسوبة</td>
                    <td style={{ padding: '3mm 4mm', textAlign: 'center', fontWeight: 900, fontSize: '14pt', color: '#0369a1' }}>{formatCost(costBreakdown.totalCalculatedCost)} ج.م</td>
                  </tr>
                </tfoot>
              </table>
              {/* Materials detail */}
              {materials.length > 0 && (
                <>
                  <h3 style={{ margin: '0 0 4mm', fontSize: '13pt', fontWeight: 800, color: '#334155' }}>المواد الخام المستخدمة</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
                    <thead className="erp-thead">
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '2.5mm 4mm', textAlign: 'right', fontWeight: 800, fontSize: '8.5pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>اسم المادة</th>
                        <th style={{ padding: '2.5mm 4mm', textAlign: 'center', fontWeight: 800, fontSize: '8.5pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>الكمية</th>
                        <th style={{ padding: '2.5mm 4mm', textAlign: 'center', fontWeight: 800, fontSize: '8.5pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>سعر الوحدة</th>
                        <th style={{ padding: '2.5mm 4mm', textAlign: 'center', fontWeight: 800, fontSize: '8.5pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, i) => (
                        <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ padding: '2mm 4mm', borderBottom: '1px solid #e2e8f0' }}>{m.materialName}</td>
                          <td style={{ padding: '2mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>{m.quantityUsed}</td>
                          <td style={{ padding: '2mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>{formatCost(m.unitCost)}</td>
                          <td style={{ padding: '2mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{formatCost(m.quantityUsed * m.unitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {/* Monthly Average */}
              {currentMonthCost && currentMonthCost.totalProducedQty > 0 && (
                <div style={{ marginTop: '6mm', padding: '4mm', border: '1px solid #c7d2fe', borderRadius: '3mm', background: '#eef2ff' }}>
                  <p style={{ margin: 0, fontSize: '10pt', fontWeight: 700, color: '#4338ca' }}>
                    متوسط تكلفة الإنتاج الشهري ({currentMonth}): <span style={{ fontSize: '13pt', fontWeight: 900 }}>{formatCost(currentMonthCost.averageUnitCost)} ج.م/وحدة</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">warning</span>
          <p className="text-sm font-medium text-rose-700">{fetchError}</p>
        </div>
      )}

      {shareToast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-emerald-700">{shareToast}</p>
        </div>
      )}

      {/* Basic Product Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5">
        <KPIBox
          label="رصيد مفكك"
          value={formatNumber(decomposedBalance)}
          unit="وحدة"
          icon="call_split"
          colorClass="bg-[#f0f2f5] text-[var(--color-text-muted)]"
        />
        <KPIBox
          label="رصيد مفكك بعد الإنتاج"
          value={formatNumber(decomposedBalanceAfterProduction)}
          unit="وحدة"
          icon="inventory_2"
          colorClass="bg-amber-50 text-amber-600"
        />
        <KPIBox
          label="تم الصنع"
          value={formatNumber(finishedBalance)}
          unit="وحدة"
          icon="inventory"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20"
        />
        <KPIBox
          label="الهالك"
          value={formatNumber(wasteBalance)}
          unit="وحدة"
          icon="delete_sweep"
          colorClass="bg-rose-50 text-rose-600"
        />
        <KPIBox
          label="منتج تام"
          value={formatNumber(finalBalance)}
          unit="وحدة"
          icon="warehouse"
          colorClass="bg-emerald-50 text-emerald-600"
        />
        <KPIBox
          label="نسبة الهالك"
          value={`${wasteRatio}%`}
          icon="pie_chart"
          colorClass="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <span className="material-icons-round text-amber-600 text-2xl">schedule</span>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-0.5">متوسط وقت التجميع الفعلي</p>
              <p className="text-lg font-bold text-[var(--color-text)]">
                {filteredReports.length > 0 ? `${avgAssemblyTime} دقيقة/وحدة` : (product?.avgAssemblyTime ? `${product.avgAssemblyTime} دقيقة/وحدة` : '—')}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <span className="material-icons-round text-primary text-2xl">timer</span>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-0.5">وقت التجميع القياسي</p>
              <p className="text-lg font-bold text-[var(--color-text)]">
                {standardTime > 0 ? `${standardTime} دقيقة/وحدة` : 'غير محدد'}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <span className="material-icons-round text-emerald-600 text-2xl">emoji_events</span>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-0.5">أفضل خط إنتاج أداءً</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{bestLine}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <span className="material-icons-round text-blue-600 text-2xl">trending_up</span>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-0.5">متوسط الإنتاج اليومي</p>
              <p className="text-lg font-bold text-[var(--color-text)]">
                {avgDailyProduction > 0 ? `${formatNumber(avgDailyProduction)} وحدة` : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Cost Data */}
      {canViewCosts && todayCost && (todayCost.laborCost > 0 || todayCost.indirectCost > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <KPIBox
            label="تكلفة العمالة اليوم"
            value={formatCost(todayCost.laborCost)}
            unit="ج.م"
            icon="groups"
            colorClass="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400"
          />
          <KPIBox
            label="تكلفة غير مباشرة"
            value={formatCost(todayCost.indirectCost)}
            unit="ج.م"
            icon="account_tree"
            colorClass="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400"
          />
          <KPIBox
            label="إجمالي التكلفة"
            value={formatCost(todayCost.totalCost)}
            unit="ج.م"
            icon="payments"
            colorClass="bg-primary/10 text-primary dark:bg-primary/20"
          />
          <KPIBox
            label="تكلفة الوحدة"
            value={todayCost.costPerUnit > 0 ? formatCost(todayCost.costPerUnit) : '—'}
            unit={todayCost.costPerUnit > 0 ? 'ج.م' : ''}
            icon="price_check"
            colorClass="bg-emerald-50 text-emerald-600"
          />
        </div>
      )}

      {/* ── Monthly Average Production Cost ── */}
      {canViewCosts && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center">
                <span className="material-icons-round text-indigo-600 text-xl">calculate</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)]">متوسط تكلفة الإنتاج الشهري</h3>
                <p className="text-[10px] text-[var(--color-text-muted)] font-medium">{currentMonth}</p>
              </div>
            </div>
            <Button
              variant="outline"
              disabled={recalculating || (currentMonthCost?.isClosed ?? false)}
              onClick={handleRecalculate}
            >
              {recalculating ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-round text-sm">sync</span>
              )}
              {recalculating ? 'جاري الحساب...' : 'إعادة حساب المتوسط'}
            </Button>
          </div>

          {currentMonthCost?.isClosed && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 rounded-[var(--border-radius-base)]">
              <span className="material-icons-round text-amber-500 text-sm">lock</span>
              <span className="text-xs font-bold text-amber-700">هذا الشهر مغلق — لا يمكن إعادة الحساب</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Current Month */}
            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[var(--border-radius-lg)] p-4 border border-indigo-100 dark:border-indigo-800 text-center">
              <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">الشهر الحالي</p>
              {currentMonthCost && currentMonthCost.totalProducedQty > 0 ? (
                <>
                  <p className="text-xl font-bold text-indigo-600">{formatCost(currentMonthCost.averageUnitCost)}</p>
                  <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    {formatCost(currentMonthCost.totalProductionCost)} ج.م ÷ {currentMonthCost.totalProducedQty.toLocaleString('en-US')} وحدة
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] mt-2">لا يوجد إنتاج</p>
              )}
            </div>

            {/* Previous Month */}
            <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-4 border border-[var(--color-border)] text-center">
              <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">الشهر السابق ({previousMonth})</p>
              {previousMonthCost && previousMonthCost.totalProducedQty > 0 ? (
                <>
                  <p className="text-xl font-bold text-[var(--color-text)]">{formatCost(previousMonthCost.averageUnitCost)}</p>
                  <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    {formatCost(previousMonthCost.totalProductionCost)} ج.م ÷ {previousMonthCost.totalProducedQty.toLocaleString('en-US')} وحدة
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] mt-2">لا يوجد إنتاج</p>
              )}
            </div>

            {/* % Change */}
            <div className={`rounded-[var(--border-radius-lg)] p-4 border text-center ${
              monthlyCostChange === null
                ? 'bg-[#f8f9fa] border-[var(--color-border)]'
                : monthlyCostChange <= 0
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200'
            }`}>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">التغيير</p>
              {monthlyCostChange !== null ? (
                <>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`material-icons-round text-lg ${monthlyCostChange <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {monthlyCostChange <= 0 ? 'trending_down' : 'trending_up'}
                    </span>
                    <p className={`text-xl font-bold ${monthlyCostChange <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {Math.abs(monthlyCostChange)}%
                    </p>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">
                    {monthlyCostChange <= 0 ? 'تحسن (انخفاض)' : 'ارتفاع'}
                  </span>
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] mt-2">—</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Structured Cost Breakdown ── */}
      {canViewCosts && rawProduct && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center">
                <span className="material-icons-round text-teal-600 text-xl">receipt_long</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)]">تفصيل تكلفة المنتج</h3>
                <p className="text-[10px] text-[var(--color-text-muted)] font-medium">يتم الحساب تلقائياً عند تغيير أي عنصر</p>
              </div>
            </div>
          </div>

          {/* Cost Items Table */}
          <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)] mb-4">
            <table className="w-full text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">عنصر التكلفة</th>
                  <th className="erp-th text-center">القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {/* ── تكاليف المنتج (مواد + تغليف) ── */}
                <tr className="bg-teal-50/50 dark:bg-teal-900/10">
                  <td colSpan={2} className="px-5 py-2 text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <span className="material-icons-round text-sm">receipt_long</span>
                      تكاليف المنتج (مواد + تغليف)
                    </div>
                  </td>
                </tr>
                <tr className="hover:bg-[#f8f9fa]/50">
                  <td className="px-5 py-3 pr-10 text-sm font-bold text-[var(--color-text)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-amber-500 text-base">local_shipping</span>
                      تكلفة الوحدة الصينية
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.chineseUnitCost ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-[#f8f9fa]/50">
                  <td className="px-5 py-3 pr-10 text-sm font-bold text-[var(--color-text)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-amber-500 text-base">currency_yuan</span>
                      السعر باليوان الصيني
                      {chineseRate > 0 && (
                        <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                          ({formatCost(costBreakdown?.chineseUnitCost ?? 0)} ÷ {chineseRate})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">
                    {chineseUnitCostInCny != null ? `¥ ${formatCost(chineseUnitCostInCny)}` : '—'}
                  </td>
                </tr>
                <tr className="hover:bg-[#f8f9fa]/50">
                  <td className="px-5 py-3 pr-10 text-sm font-bold text-[var(--color-text)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-blue-500 text-base">category</span>
                      تكلفة المواد الخام
                      <span className="text-[10px] text-[var(--color-text-muted)] font-medium">({materials.length} مادة)</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.rawMaterialCost ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-[#f8f9fa]/50">
                  <td className="px-5 py-3 pr-10 text-sm font-bold text-[var(--color-text)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-orange-500 text-base">inventory_2</span>
                      تكلفة العلبة الداخلية
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.innerBoxCost ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-[#f8f9fa]/50">
                  <td className="px-5 py-3 pr-10 text-sm font-bold text-[var(--color-text)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-purple-500 text-base">package_2</span>
                      نصيب الكرتونة
                      {(costBreakdown?.unitsPerCarton ?? 0) > 0 && (
                        <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                          ({formatCost(costBreakdown?.outerCartonCost ?? 0)} ÷ {costBreakdown?.unitsPerCarton})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.cartonShare ?? 0)} ج.م</td>
                </tr>

                {/* ── تكاليف صناعية (م. وغ.م) ── */}
                <tr className="bg-rose-50/50 dark:bg-rose-900/10">
                  <td colSpan={2} className="px-5 py-2 text-xs font-bold text-rose-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <span className="material-icons-round text-sm">precision_manufacturing</span>
                      تكاليف صناعية (مباشرة وغير مباشرة)
                    </div>
                  </td>
                </tr>
                <tr className="hover:bg-[#f8f9fa]/50">
                  <td className="px-5 py-3 pr-10 text-sm font-bold text-[var(--color-text)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-rose-500 text-base">precision_manufacturing</span>
                      نصيب المصاريف الصناعية
                      <span className="text-[10px] text-[var(--color-text-muted)] font-medium">(متوسط شهري)</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.productionOverheadShare ?? 0)} ج.م</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20">
                  <td className="px-5 py-3 text-sm font-bold text-primary">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-base">functions</span>
                      إجمالي التكلفة المحسوبة
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-3 py-1.5 rounded-[var(--border-radius-base)] bg-primary/10 text-primary text-sm font-bold ring-1 ring-primary/20">
                      {formatCost(costBreakdown?.totalCalculatedCost ?? 0)} ج.م
                    </span>
                  </td>
                </tr>
                {(rawProduct?.sellingPrice ?? 0) > 0 && (
                  <>
                    <tr className="border-t border-[var(--color-border)]">
                      <td className="px-5 py-3 text-sm font-bold text-[var(--color-text)]">
                        <div className="flex items-center gap-2">
                          <span className="material-icons-round text-green-500 text-base">sell</span>
                          سعر البيع
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(rawProduct!.sellingPrice!)} ج.م</td>
                    </tr>
                    <tr className={`${(rawProduct!.sellingPrice! - (costBreakdown?.totalCalculatedCost ?? 0)) >= 0 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-rose-50/50 dark:bg-rose-900/10'}`}>
                      <td className="px-5 py-3 text-sm font-black">
                        <div className="flex items-center gap-2">
                          <span className={`material-icons-round text-base ${(rawProduct!.sellingPrice! - (costBreakdown?.totalCalculatedCost ?? 0)) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {(rawProduct!.sellingPrice! - (costBreakdown?.totalCalculatedCost ?? 0)) >= 0 ? 'trending_up' : 'trending_down'}
                          </span>
                          هامش الربح
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {(() => {
                          const sp = rawProduct!.sellingPrice!;
                          const tc = costBreakdown?.totalCalculatedCost ?? 0;
                          const profit = sp - tc;
                          const margin = sp > 0 ? (profit / sp) * 100 : 0;
                          return (
                            <span className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCost(Math.abs(profit))} ج.م ({margin.toFixed(1)}%)
                              {profit < 0 && ' خسارة'}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>

          {/* Materials Sub-section */}
          <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] overflow-hidden">
            <div className="px-5 py-3 bg-[#f8f9fa]/50 border-b border-[var(--color-border)] flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">المواد الخام المستخدمة</h4>
              {can('costs.manage') && (
                <button
                  onClick={openAddMaterial}
                  data-modal-key={MODAL_KEYS.PRODUCT_MATERIALS_CREATE}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  <span className="material-icons-round text-sm">add_circle</span>
                  إضافة مادة
                </button>
              )}
            </div>
            {materials.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <span className="material-icons-round text-3xl mb-2 block opacity-30">science</span>
                <p className="text-sm font-bold">لا توجد مواد خام مسجلة</p>
              </div>
            ) : (
              <table className="w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">اسم المادة</th>
                    <th className="erp-th text-center">الكمية</th>
                    <th className="erp-th text-center">سعر الوحدة</th>
                    <th className="erp-th text-center">الإجمالي</th>
                    {can('costs.manage') && (
                      <th className="erp-th text-center">إجراء</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {materials.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f8f9fa]/50 group">
                      <td className="px-5 py-2.5 text-sm font-medium text-[var(--color-text)]">{m.materialName}</td>
                      <td className="px-5 py-2.5 text-center text-sm font-bold">{m.quantityUsed}</td>
                      <td className="px-5 py-2.5 text-center text-sm font-bold">{formatCost(m.unitCost)} ج.م</td>
                      <td className="px-5 py-2.5 text-center text-sm font-bold text-primary">{formatCost(m.quantityUsed * m.unitCost)} ج.م</td>
                      {can('costs.manage') && (
                        <td className="px-5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditMaterial(m)} className="p-1 text-[var(--color-text-muted)] hover:text-primary rounded transition-colors">
                              <span className="material-icons-round text-sm">edit</span>
                            </button>
                            <button onClick={() => m.id && handleDeleteMaterial(m.id)} className="p-1 text-[var(--color-text-muted)] hover:text-rose-500 rounded transition-colors">
                              <span className="material-icons-round text-sm">delete</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* Cost Analysis Section */}
      {canViewCosts && historicalAvgCost && historicalAvgCost.costPerUnit > 0 && (
        <>
          {/* Forecast Summary */}
          <Card title="ملخص التكلفة والتوقعات">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-primary/5 rounded-[var(--border-radius-lg)] p-4 border border-primary/10 text-center">
                <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">متوسط تكلفة الوحدة</p>
                <p className="text-xl font-bold text-primary">{formatCost(historicalAvgCost.costPerUnit)}</p>
                <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
              </div>
              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-4 border border-[var(--color-border)] text-center">
                <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إجمالي التكلفة التاريخية</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{formatCost(historicalAvgCost.totalCost)}</p>
                <span className="text-[10px] font-medium text-slate-400">ج.م</span>
              </div>
              {costTrend && (
                <div className={`rounded-[var(--border-radius-lg)] p-4 border text-center ${costTrend.improving ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200'}`}>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">اتجاه التكلفة</p>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`material-icons-round text-lg ${costTrend.improving ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {costTrend.improving ? 'trending_down' : 'trending_up'}
                    </span>
                    <p className={`text-xl font-bold ${costTrend.improving ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {Math.abs(costTrend.pctChange)}%
                    </p>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">{costTrend.improving ? 'تحسن' : 'ارتفاع'}</span>
                </div>
              )}
              {bestCostLine && costByLine.length > 1 && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-lg)] p-4 border border-emerald-200 text-center">
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">أفضل خط من حيث التكلفة</p>
                  <p className="text-lg font-bold text-emerald-600">{bestCostLine.lineName}</p>
                  <span className="text-[10px] font-medium text-slate-400">{formatCost(bestCostLine.costPerUnit)} ج.م/وحدة</span>
                </div>
              )}
            </div>
          </Card>

          {/* Cost by Line */}
          {costByLine.length > 0 && (
            <Card title="تكلفة الإنتاج حسب خط الإنتاج">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">خط الإنتاج</th>
                      <th className="erp-th text-center">الكمية المنتجة</th>
                      <th className="erp-th text-center">إجمالي التكلفة</th>
                      <th className="erp-th text-center">تكلفة الوحدة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {costByLine.map((lc) => (
                      <tr key={lc.lineId} className="hover:bg-[#f8f9fa]/50 transition-colors cursor-pointer" onClick={() => navigate(`/lines/${lc.lineId}`)}>
                        <td className="px-5 py-3 text-sm font-bold text-[var(--color-text)]">{lc.lineName}</td>
                        <td className="px-5 py-3 text-center text-sm font-bold">{formatNumber(lc.totalProduced)}</td>
                        <td className="px-5 py-3 text-center text-sm font-bold text-slate-600">{formatCost(lc.totalCost)} ج.م</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-[var(--border-radius-base)] text-sm font-bold ring-1 ${bestCostLine?.lineId === lc.lineId ? 'bg-emerald-50 text-emerald-600 ring-emerald-500/20' : 'bg-primary/5 text-primary ring-primary/20'}`}>
                            {formatCost(lc.costPerUnit)} ج.م
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Cost Trend Chart */}
          {costHistory.length > 1 && (
            <Card title="اتجاه تكلفة الوحدة">
              <div style={{ width: '100%', height: 280 }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={costHistory} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontFamily: 'inherit' }}
                      formatter={(value: number) => [`${formatCost(value)} ج.م`, 'تكلفة الوحدة']}
                    />
                    <Bar dataKey="costPerUnit" name="تكلفة الوحدة" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Production History Chart */}
      <Card title="سجل الإنتاج">
        {loading ? (
          <div className="animate-pulse h-64 bg-[#f8f9fa] rounded-[var(--border-radius-base)]"></div>
        ) : chartData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-4xl mb-2 block opacity-30">bar_chart</span>
            <p className="font-bold">لا توجد بيانات إنتاج بعد</p>
            <p className="text-sm mt-1">ستظهر البيانات هنا عند إضافة تقارير إنتاج لهذا المنتج</p>
          </div>
        ) : (
          <div style={{ width: '100%', height: 320 }} dir="ltr">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontFamily: 'inherit',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="produced"
                  name="الإنتاج"
                  fill="#1392ec"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="waste"
                  name="الهالك"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Reports Table */}
      <Card className="!p-0 border-none overflow-hidden " title="">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">التقارير التفصيلية</h3>
          {filteredReports.length > 0 && (
            <span className="text-xs font-bold text-slate-400">
              {filteredUniqueDays} يوم عمل مسجل
            </span>
          )}
        </div>
        {loading ? (
          <div className="animate-pulse space-y-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 bg-slate-200 rounded flex-1"></div>
                <div className="h-4 bg-[#f0f2f5] rounded w-20"></div>
                <div className="h-4 bg-[#f0f2f5] rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">التاريخ</th>
                  <th className="erp-th">خط الإنتاج</th>
                  <th className="erp-th">الموظف</th>
                  <th className="erp-th text-center">الكمية</th>
                  <th className="erp-th text-center">الهالك</th>
                  <th className="erp-th text-center">عمال</th>
                  <th className="erp-th text-center">ساعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      <span className="material-icons-round text-4xl mb-2 block opacity-30">description</span>
                      <p className="font-bold">لا توجد تقارير مطابقة للفلاتر</p>
                      <p className="text-sm mt-1">أضف تقارير إنتاج من صفحة "التقارير"</p>
                    </td>
                  </tr>
                )}
                {filteredReports.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-sm font-bold text-[var(--color-text)]">{r.date}</td>
                    <td className="px-5 py-3 text-sm font-medium text-[var(--color-text-muted)]">{getLineName(r.lineId)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-[var(--color-text-muted)]">{getEmployeeName(r.employeeId)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-[var(--border-radius-base)] bg-emerald-50 text-emerald-600 text-sm font-bold ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(getReportWaste(r))}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workersCount}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredReports.length > 0 && (
          <div className="px-6 py-4 bg-[#f8f9fa]/50 border-t border-[var(--color-border)] flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-muted)] font-bold">
              إجمالي <span className="text-primary">{filteredReports.length}</span> تقرير
            </span>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-emerald-600">
                إنتاج: {formatNumber(filteredTotalProduced)}
              </span>
              <span className="text-rose-500">
                هالك: {formatNumber(filteredTotalWaste)}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Material Add/Edit Modal ── */}
      {showMaterialModal && can('costs.manage') && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowMaterialModal(false); setMaterialSaveMsg(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingMaterial ? 'تعديل مادة خام' : 'إضافة مادة خام'}</h3>
              <button onClick={() => { setShowMaterialModal(false); setMaterialSaveMsg(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {materialSaveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${materialSaveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  <span className="material-icons-round text-base">{materialSaveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                  <p className="flex-1">{materialSaveMsg.text}</p>
                  <button onClick={() => setMaterialSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">المادة الخام (من المخزن) *</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={materialForm.materialId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const selected = rawMaterials.find((row) => row.id === nextId);
                    setMaterialForm({
                      ...materialForm,
                      materialId: nextId,
                      materialName: selected?.name || '',
                    });
                  }}
                >
                  <option value="">اختر مادة خام</option>
                  {rawMaterials.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} {row.code ? `(${row.code})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  المواد هنا من تعريف "المواد الخام" فقط، ولن تظهر في بحث المنتجات.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المستخدمة</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.quantityUsed || ''}
                    placeholder="0"
                    onChange={(e) => setMaterialForm({ ...materialForm, quantityUsed: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">سعر الوحدة (ج.م)</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.unitCost}
                    onChange={(e) => setMaterialForm({ ...materialForm, unitCost: Number(e.target.value) })}
                  />
                </div>
              </div>
              {materialForm.quantityUsed > 0 && materialForm.unitCost > 0 && (
                <div className="bg-primary/5 rounded-[var(--border-radius-lg)] p-3 text-center">
                  <span className="text-xs font-bold text-slate-400">الإجمالي: </span>
                  <span className="text-sm font-bold text-primary">{formatCost(materialForm.quantityUsed * materialForm.unitCost)} ج.م</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowMaterialModal(false); setMaterialSaveMsg(null); }}>إلغاء</Button>
              <Button variant="primary" onClick={handleSaveMaterial} disabled={savingMaterial || !materialForm.materialId}>
                {savingMaterial ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">{editingMaterial ? 'save' : 'add'}</span>
                )}
                {editingMaterial ? 'حفظ التعديلات' : 'إضافة المادة'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
