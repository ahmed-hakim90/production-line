
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { Card, KPIBox, Button, Badge, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { reportService } from '../services/reportService';
import {
  formatNumber,
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  findBestLine,
  groupReportsByDate,
  countUniqueDays,
} from '../utils/calculations';
import {
  buildProductCosts,
  buildProductAvgCost,
  buildProductCostByLine,
  buildProductCostHistory,
  formatCost,
  getCurrentMonth,
} from '../utils/costCalculations';
import { usePermission } from '../utils/permissions';
import { ProductionReport, MonthlyProductionCost, ProductMaterial } from '../types';
import { monthlyProductionCostService } from '../services/monthlyProductionCostService';
import { productMaterialService } from '../services/productMaterialService';
import { calculateProductCostBreakdown } from '../utils/productCostBreakdown';
import { exportProductReports } from '../utils/exportExcel';
import { exportToPDF, shareToWhatsApp } from '../utils/reportExport';
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

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [currentMonthCost, setCurrentMonthCost] = useState<MonthlyProductionCost | null>(null);
  const [previousMonthCost, setPreviousMonthCost] = useState<MonthlyProductionCost | null>(null);
  const [materials, setMaterials] = useState<ProductMaterial[]>([]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ProductMaterial | null>(null);
  const [materialForm, setMaterialForm] = useState({ materialName: '', quantityUsed: 0, unitCost: 0 });
  const [savingMaterial, setSavingMaterial] = useState(false);
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

  const costBreakdown = useMemo(() => {
    if (!rawProduct) return null;
    const avgCost = currentMonthCost?.averageUnitCost ?? 0;
    return calculateProductCostBreakdown(rawProduct, materials, avgCost);
  }, [rawProduct, materials, currentMonthCost]);

  const handleSaveMaterial = useCallback(async () => {
    if (!id || !materialForm.materialName || savingMaterial) return;
    setSavingMaterial(true);
    try {
      if (editingMaterial?.id) {
        await productMaterialService.update(editingMaterial.id, {
          materialName: materialForm.materialName,
          quantityUsed: materialForm.quantityUsed,
          unitCost: materialForm.unitCost,
        });
      } else {
        await productMaterialService.create({
          productId: id,
          materialName: materialForm.materialName,
          quantityUsed: materialForm.quantityUsed,
          unitCost: materialForm.unitCost,
        });
      }
      await loadMaterials();
      setShowMaterialModal(false);
      setEditingMaterial(null);
      setMaterialForm({ materialName: '', quantityUsed: 0, unitCost: 0 });
    } catch (err) {
      console.error('Save material error:', err);
    } finally {
      setSavingMaterial(false);
    }
  }, [id, materialForm, savingMaterial, editingMaterial, loadMaterials]);

  const handleDeleteMaterial = useCallback(async (materialId: string) => {
    try {
      await productMaterialService.delete(materialId);
      await loadMaterials();
    } catch (err) {
      console.error('Delete material error:', err);
    }
  }, [loadMaterials]);

  const openEditMaterial = (m: ProductMaterial) => {
    setEditingMaterial(m);
    setMaterialForm({ materialName: m.materialName, quantityUsed: m.quantityUsed, unitCost: m.unitCost });
    setShowMaterialModal(true);
  };

  const openAddMaterial = () => {
    setEditingMaterial(null);
    setMaterialForm({ materialName: '', quantityUsed: 0, unitCost: 0 });
    setShowMaterialModal(true);
  };

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

  const totalProduced = useMemo(
    () => reports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [reports]
  );

  const totalWaste = useMemo(
    () => reports.reduce((sum, r) => sum + (r.quantityWaste || 0), 0),
    [reports]
  );

  const avgAssemblyTime = useMemo(
    () => calculateAvgAssemblyTime(reports),
    [reports]
  );

  const wasteRatio = useMemo(
    () => calculateWasteRatio(totalWaste, totalProduced + totalWaste),
    [totalWaste, totalProduced]
  );

  const bestLine = useMemo(
    () => findBestLine(reports, _rawLines),
    [reports, _rawLines]
  );

  const chartData = useMemo(() => groupReportsByDate(reports), [reports]);

  const uniqueDays = useMemo(() => countUniqueDays(reports), [reports]);

  const avgDailyProduction = useMemo(
    () => (uniqueDays > 0 ? Math.round(totalProduced / uniqueDays) : 0),
    [totalProduced, uniqueDays]
  );

  const standardTime = useMemo(() => {
    const config = lineProductConfigs.find((c) => c.productId === id);
    return config?.standardAssemblyTime ?? 0;
  }, [lineProductConfigs, id]);

  const currentBalance = useMemo(() => {
    if (!rawProduct) return 0;
    return rawProduct.openingBalance + totalProduced - totalWaste;
  }, [rawProduct, totalProduced, totalWaste]);

  const todayCost = useMemo(() => {
    if (!canViewCosts || !id) return null;
    const costs = buildProductCosts([id], todayReports, laborSettings, costCenters, costCenterValues, costAllocations);
    return costs[id] ?? null;
  }, [canViewCosts, id, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const getLineName = (lineId: string) => _rawLines.find((l) => l.id === lineId)?.name ?? '—';

  const hourlyRate = laborSettings?.hourlyRate ?? 0;

  const historicalAvgCost = useMemo(() => {
    if (!canViewCosts || !id || reports.length === 0) return null;
    return buildProductAvgCost(id, reports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, id, reports, hourlyRate, costCenters, costCenterValues, costAllocations]);

  const costByLine = useMemo(() => {
    if (!canViewCosts || !id || reports.length === 0) return [];
    return buildProductCostByLine(id, reports, hourlyRate, costCenters, costCenterValues, costAllocations, getLineName);
  }, [canViewCosts, id, reports, hourlyRate, costCenters, costCenterValues, costAllocations, _rawLines]);

  const costHistory = useMemo(() => {
    if (!canViewCosts || !id || reports.length === 0) return [];
    return buildProductCostHistory(id, reports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, id, reports, hourlyRate, costCenters, costCenterValues, costAllocations]);

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

  const lookups = useMemo(() => ({
    getLineName,
    getProductName: () => product?.name || rawProduct?.name || '—',
    getEmployeeName,
  }), [_rawLines, employees, product, rawProduct]);

  const printRows = useMemo(() => mapReportsToPrintRows(reports, lookups), [reports, lookups]);
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);
  const productDisplayName = product?.name || rawProduct?.name || '';

  const handlePrint = useReactToPrint({ contentRef: printComponentRef });

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
    try { await shareToWhatsApp(printComponentRef.current, `تقرير ${productDisplayName}`); }
    finally { setExporting(false); }
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/products')}
            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
          >
            <span className="material-icons-round">arrow_forward</span>
          </button>
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="hidden sm:flex w-14 h-14 rounded-xl bg-primary/10 items-center justify-center shrink-0">
              <span className="material-icons-round text-primary text-3xl">inventory_2</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
                {product?.name || rawProduct?.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                <span className="text-xs sm:text-sm text-slate-400 font-mono">{product?.code || rawProduct?.code}</span>
                {(product?.category || rawProduct?.model) && (
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-0.5 rounded-full font-bold">
                    {product?.category || rawProduct?.model}
                  </span>
                )}
                {product && (
                  <Badge variant={product.stockStatus === 'available' ? 'success' : product.stockStatus === 'low' ? 'warning' : 'danger'}>
                    {product.stockStatus === 'available' ? 'متوفر' : product.stockStatus === 'low' ? 'منخفض' : 'نفذ'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {reports.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => exportProductReports(productDisplayName, reports, lookups)}>
                <span className="material-icons-round text-sm">download</span>Excel
              </Button>
              <Button variant="outline" disabled={exporting} onClick={() => handlePrint()}>
                <span className="material-icons-round text-sm">print</span>طباعة
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handlePDF}>
                {exporting ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">picture_as_pdf</span>
                )}
                PDF
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handleWhatsApp}>
                <span className="material-icons-round text-sm">share</span>واتساب
              </Button>
            </>
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
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '3mm 4mm', textAlign: 'right', fontWeight: 800, fontSize: '9pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>عنصر التكلفة</th>
                    <th style={{ padding: '3mm 4mm', textAlign: 'center', fontWeight: 800, fontSize: '9pt', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>القيمة (ج.م)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>تكلفة الوحدة الصينية</td><td style={{ padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{formatCost(costBreakdown.chineseUnitCost)}</td></tr>
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
                    <thead>
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
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">warning</span>
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{fetchError}</p>
        </div>
      )}

      {/* Basic Product Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <KPIBox
          label="الرصيد الافتتاحي"
          value={formatNumber(rawProduct?.openingBalance ?? product?.openingStock ?? 0)}
          unit="وحدة"
          icon="account_balance"
          colorClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
        />
        <KPIBox
          label="إجمالي الإنتاج"
          value={formatNumber(totalProduced || product?.totalProduction || 0)}
          unit="وحدة"
          icon="inventory"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
        />
        <KPIBox
          label="إجمالي الهالك"
          value={formatNumber(totalWaste || product?.wasteUnits || 0)}
          unit="وحدة"
          icon="delete_sweep"
          colorClass="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
        />
        <KPIBox
          label="الرصيد الحالي"
          value={formatNumber(currentBalance || product?.stockLevel || 0)}
          unit="وحدة"
          icon="warehouse"
          colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
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
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-amber-600 text-2xl">schedule</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">متوسط وقت التجميع الفعلي</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
                {reports.length > 0 ? `${avgAssemblyTime} دقيقة/وحدة` : (product?.avgAssemblyTime ? `${product.avgAssemblyTime} دقيقة/وحدة` : '—')}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-primary text-2xl">timer</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">وقت التجميع القياسي</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
                {standardTime > 0 ? `${standardTime} دقيقة/وحدة` : 'غير محدد'}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-emerald-600 text-2xl">emoji_events</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">أفضل خط إنتاج أداءً</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">{bestLine}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-blue-600 text-2xl">trending_up</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">متوسط الإنتاج اليومي</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
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
            colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
          />
        </div>
      )}

      {/* ── Monthly Average Production Cost ── */}
      {canViewCosts && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center">
                <span className="material-icons-round text-indigo-600 text-xl">calculate</span>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-700 dark:text-white">متوسط تكلفة الإنتاج الشهري</h3>
                <p className="text-[10px] text-slate-400 font-medium">{currentMonth}</p>
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
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <span className="material-icons-round text-amber-500 text-sm">lock</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">هذا الشهر مغلق — لا يمكن إعادة الحساب</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Current Month */}
            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800 text-center">
              <p className="text-[10px] font-bold text-slate-400 mb-1">الشهر الحالي</p>
              {currentMonthCost && currentMonthCost.totalProducedQty > 0 ? (
                <>
                  <p className="text-xl font-black text-indigo-600">{formatCost(currentMonthCost.averageUnitCost)}</p>
                  <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formatCost(currentMonthCost.totalProductionCost)} ج.م ÷ {currentMonthCost.totalProducedQty.toLocaleString('ar-EG')} وحدة
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">لا يوجد إنتاج</p>
              )}
            </div>

            {/* Previous Month */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
              <p className="text-[10px] font-bold text-slate-400 mb-1">الشهر السابق ({previousMonth})</p>
              {previousMonthCost && previousMonthCost.totalProducedQty > 0 ? (
                <>
                  <p className="text-xl font-black text-slate-700 dark:text-white">{formatCost(previousMonthCost.averageUnitCost)}</p>
                  <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formatCost(previousMonthCost.totalProductionCost)} ج.م ÷ {previousMonthCost.totalProducedQty.toLocaleString('ar-EG')} وحدة
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">لا يوجد إنتاج</p>
              )}
            </div>

            {/* % Change */}
            <div className={`rounded-xl p-4 border text-center ${
              monthlyCostChange === null
                ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                : monthlyCostChange <= 0
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'
            }`}>
              <p className="text-[10px] font-bold text-slate-400 mb-1">التغيير</p>
              {monthlyCostChange !== null ? (
                <>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`material-icons-round text-lg ${monthlyCostChange <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {monthlyCostChange <= 0 ? 'trending_down' : 'trending_up'}
                    </span>
                    <p className={`text-xl font-black ${monthlyCostChange <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {Math.abs(monthlyCostChange)}%
                    </p>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">
                    {monthlyCostChange <= 0 ? 'تحسن (انخفاض)' : 'ارتفاع'}
                  </span>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">—</p>
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
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-lg flex items-center justify-center">
                <span className="material-icons-round text-teal-600 text-xl">receipt_long</span>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-700 dark:text-white">تفصيل تكلفة المنتج</h3>
                <p className="text-[10px] text-slate-400 font-medium">يتم الحساب تلقائياً عند تغيير أي عنصر</p>
              </div>
            </div>
          </div>

          {/* Cost Items Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">عنصر التكلفة</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-amber-500 text-base">local_shipping</span>
                      تكلفة الوحدة الصينية
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.chineseUnitCost ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-blue-500 text-base">category</span>
                      تكلفة المواد الخام
                      <span className="text-[10px] text-slate-400 font-medium">({materials.length} مادة)</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.rawMaterialCost ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-orange-500 text-base">inventory_2</span>
                      تكلفة العلبة الداخلية
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.innerBoxCost ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-purple-500 text-base">package_2</span>
                      نصيب الكرتونة
                      {(costBreakdown?.unitsPerCarton ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          ({formatCost(costBreakdown?.outerCartonCost ?? 0)} ÷ {costBreakdown?.unitsPerCarton})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.cartonShare ?? 0)} ج.م</td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-rose-500 text-base">precision_manufacturing</span>
                      نصيب المصاريف الصناعية
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm font-bold">{formatCost(costBreakdown?.productionOverheadShare ?? 0)} ج.م</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 dark:bg-primary/10 border-t-2 border-primary/20">
                  <td className="px-5 py-3 text-sm font-black text-primary">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-base">functions</span>
                      إجمالي التكلفة المحسوبة
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-black ring-1 ring-primary/20">
                      {formatCost(costBreakdown?.totalCalculatedCost ?? 0)} ج.م
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Materials Sub-section */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المواد الخام المستخدمة</h4>
              {can('costs.manage') && (
                <button
                  onClick={openAddMaterial}
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
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-2.5 text-[10px] font-black text-slate-400 uppercase">اسم المادة</th>
                    <th className="px-5 py-2.5 text-[10px] font-black text-slate-400 uppercase text-center">الكمية</th>
                    <th className="px-5 py-2.5 text-[10px] font-black text-slate-400 uppercase text-center">سعر الوحدة</th>
                    <th className="px-5 py-2.5 text-[10px] font-black text-slate-400 uppercase text-center">الإجمالي</th>
                    {can('costs.manage') && (
                      <th className="px-5 py-2.5 text-[10px] font-black text-slate-400 uppercase text-center">إجراء</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {materials.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 group">
                      <td className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">{m.materialName}</td>
                      <td className="px-5 py-2.5 text-center text-sm font-bold">{m.quantityUsed}</td>
                      <td className="px-5 py-2.5 text-center text-sm font-bold">{formatCost(m.unitCost)} ج.م</td>
                      <td className="px-5 py-2.5 text-center text-sm font-black text-primary">{formatCost(m.quantityUsed * m.unitCost)} ج.م</td>
                      {can('costs.manage') && (
                        <td className="px-5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditMaterial(m)} className="p-1 text-slate-400 hover:text-primary rounded transition-colors">
                              <span className="material-icons-round text-sm">edit</span>
                            </button>
                            <button onClick={() => m.id && handleDeleteMaterial(m.id)} className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors">
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
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 text-center">
                <p className="text-[10px] font-bold text-slate-400 mb-1">متوسط تكلفة الوحدة</p>
                <p className="text-xl font-black text-primary">{formatCost(historicalAvgCost.costPerUnit)}</p>
                <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
                <p className="text-[10px] font-bold text-slate-400 mb-1">إجمالي التكلفة التاريخية</p>
                <p className="text-xl font-black text-slate-700 dark:text-white">{formatCost(historicalAvgCost.totalCost)}</p>
                <span className="text-[10px] font-medium text-slate-400">ج.م</span>
              </div>
              {costTrend && (
                <div className={`rounded-xl p-4 border text-center ${costTrend.improving ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
                  <p className="text-[10px] font-bold text-slate-400 mb-1">اتجاه التكلفة</p>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`material-icons-round text-lg ${costTrend.improving ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {costTrend.improving ? 'trending_down' : 'trending_up'}
                    </span>
                    <p className={`text-xl font-black ${costTrend.improving ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {Math.abs(costTrend.pctChange)}%
                    </p>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">{costTrend.improving ? 'تحسن' : 'ارتفاع'}</span>
                </div>
              )}
              {bestCostLine && costByLine.length > 1 && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800 text-center">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">أفضل خط من حيث التكلفة</p>
                  <p className="text-lg font-black text-emerald-600">{bestCostLine.lineName}</p>
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
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية المنتجة</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">إجمالي التكلفة</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">تكلفة الوحدة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {costByLine.map((lc) => (
                      <tr key={lc.lineId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{lc.lineName}</td>
                        <td className="px-5 py-3 text-center text-sm font-bold">{formatNumber(lc.totalProduced)}</td>
                        <td className="px-5 py-3 text-center text-sm font-bold text-slate-600">{formatCost(lc.totalCost)} ج.م</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-sm font-black ring-1 ${bestCostLine?.lineId === lc.lineId ? 'bg-emerald-50 text-emerald-600 ring-emerald-500/20' : 'bg-primary/5 text-primary ring-primary/20'}`}>
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
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-lg"></div>
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
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50" title="">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">التقارير التفصيلية</h3>
          {reports.length > 0 && (
            <span className="text-xs font-bold text-slate-400">
              {uniqueDays} يوم عمل مسجل
            </span>
          )}
        </div>
        {loading ? (
          <div className="animate-pulse space-y-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1"></div>
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-20"></div>
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">الموظف</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">عمال</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      <span className="material-icons-round text-4xl mb-2 block opacity-30">description</span>
                      <p className="font-bold">لا توجد تقارير لهذا المنتج</p>
                      <p className="text-sm mt-1">أضف تقارير إنتاج من صفحة "التقارير"</p>
                    </td>
                  </tr>
                )}
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{r.date}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">{getLineName(r.lineId)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">{getEmployeeName(r.employeeId)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(r.quantityWaste)}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workersCount}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reports.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-500 font-bold">
              إجمالي <span className="text-primary">{reports.length}</span> تقرير
            </span>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-emerald-600">
                إنتاج: {formatNumber(totalProduced)}
              </span>
              <span className="text-rose-500">
                هالك: {formatNumber(totalWaste)}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Material Add/Edit Modal ── */}
      {showMaterialModal && can('costs.manage') && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingMaterial ? 'تعديل مادة خام' : 'إضافة مادة خام'}</h3>
              <button onClick={() => setShowMaterialModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم المادة *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={materialForm.materialName}
                  onChange={(e) => setMaterialForm({ ...materialForm, materialName: e.target.value })}
                  placeholder="مثال: مسامير ستانلس 3mm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكمية المستخدمة</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.quantityUsed}
                    onChange={(e) => setMaterialForm({ ...materialForm, quantityUsed: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">سعر الوحدة (ج.م)</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.unitCost}
                    onChange={(e) => setMaterialForm({ ...materialForm, unitCost: Number(e.target.value) })}
                  />
                </div>
              </div>
              {materialForm.quantityUsed > 0 && materialForm.unitCost > 0 && (
                <div className="bg-primary/5 rounded-xl p-3 text-center">
                  <span className="text-xs font-bold text-slate-400">الإجمالي: </span>
                  <span className="text-sm font-black text-primary">{formatCost(materialForm.quantityUsed * materialForm.unitCost)} ج.م</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowMaterialModal(false)}>إلغاء</Button>
              <Button variant="primary" onClick={handleSaveMaterial} disabled={savingMaterial || !materialForm.materialName}>
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
