import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { useShallowStore } from '../../../store/useAppStore';
import {
  getCurrentMonth,
  formatCost,
  computeLiveProductCosts,
  buildSupervisorHourlyRatesMap,
  getByQtyEffectiveMonthlyAmount,
  getWorkingDaysForMonth,
  isProductionAllocationCostCenter,
} from '../../../utils/costCalculations';
import { monthlyProductionCostService } from '../services/monthlyProductionCostService';
import { reportService } from '../../production/services/reportService';
import type { MonthlyProductionCost, ProductionReport } from '../../../types';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

type HealthIssueType = 'calc' | 'query' | 'perf';
type HealthIssueSeverity = 'critical' | 'high' | 'medium';

type HealthIssue = {
  id: string;
  type: HealthIssueType;
  severity: HealthIssueSeverity;
  title: string;
  description: string;
  recommendation: string;
};

const buildMonthDateRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

const severityLabel: Record<HealthIssueSeverity, string> = {
  critical: 'حرج',
  high: 'مرتفع',
  medium: 'متوسط',
};

const typeLabel: Record<HealthIssueType, string> = {
  calc: 'حسابات',
  query: 'Firestore',
  perf: 'أداء',
};

const severityBadgeClass: Record<HealthIssueSeverity, string> = {
  critical: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] border border-[rgb(var(--color-danger)/0.25)]',
  high: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] border border-[rgb(var(--color-warning)/0.25)]',
  medium: 'bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))] border border-[rgb(var(--color-primary)/0.25)]',
};

export const CostDataHealth: React.FC = () => {
  const {
    products,
    _rawEmployees,
    costCenters,
    costCenterValues,
    costAllocations,
    laborSettings,
    assets,
    assetDepreciations,
    systemSettings,
  } = useShallowStore((s) => ({
    products: s.products,
    _rawEmployees: s._rawEmployees,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    laborSettings: s.laborSettings,
    assets: s.assets,
    assetDepreciations: s.assetDepreciations,
    systemSettings: s.systemSettings,
  }));

  const [month, setMonth] = useState(getCurrentMonth());
  const healthCacheKey = `costs:dataHealth:${month}`;
  type CostDataHealthPageData = {
    monthlyRecords: MonthlyProductionCost[];
    monthReports: ProductionReport[];
  };
  const initialHealthCache = peekPageDataCache<CostDataHealthPageData>(healthCacheKey);
  const [loading, setLoading] = useState(() => initialHealthCache == null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyProductionCost[]>(
    () => initialHealthCache?.monthlyRecords ?? [],
  );
  const [monthReports, setMonthReports] = useState<ProductionReport[]>(
    () => initialHealthCache?.monthReports ?? [],
  );
  const supervisorHourlyRates = useMemo(
    () => buildSupervisorHourlyRatesMap(_rawEmployees),
    [_rawEmployees]
  );

  const fetchMonthHealthData = useCallback(async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<CostDataHealthPageData>(healthCacheKey);
    if (cached) {
      setMonthlyRecords(cached.monthlyRecords);
      setMonthReports(cached.monthReports);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        healthCacheKey,
        async () => {
          const { startDate, endDate } = buildMonthDateRange(month);
          const [records, reports] = await Promise.all([
            monthlyProductionCostService.getByMonth(month),
            reportService.getByDateRange(startDate, endDate),
          ]);
          return { monthlyRecords: records, monthReports: reports };
        },
        { force: opts?.force === true, maxAgeMs: 60_000 },
      );
      setMonthlyRecords(data.monthlyRecords);
      setMonthReports(data.monthReports);
    } catch {
      setMonthlyRecords([]);
      setMonthReports([]);
    } finally {
      setLoading(false);
    }
  }, [healthCacheKey, month]);

  const reloadHealth = useCallback(async () => {
    invalidatePageDataCache(healthCacheKey);
    await fetchMonthHealthData({ force: true });
  }, [fetchMonthHealthData, healthCacheKey]);

  useEffect(() => {
    void fetchMonthHealthData();
  }, [fetchMonthHealthData]);

  const healthIssues = useMemo<HealthIssue[]>(() => {
    const issues: HealthIssue[] = [];
    const addIssue = (issue: HealthIssue) => issues.push(issue);

    const hourlyRate = Number(laborSettings?.hourlyRate || 0);
    if (hourlyRate <= 0) {
      addIssue({
        id: 'labor-hourly-rate-invalid',
        type: 'calc',
        severity: 'critical',
        title: 'معدل الأجر بالساعة غير مضبوط',
        description: 'معدل الأجر = 0 أو غير معرف، وده بيؤدي لتكلفة مباشرة غير صحيحة.',
        recommendation: 'اضبط hourlyRate في إعدادات التكلفة قبل أي إعادة حساب.',
      });
    }

    const monthWorkingDays = Number(systemSettings.costMonthlyWorkingDays?.[month] || 0);
    if (monthWorkingDays <= 0) {
      addIssue({
        id: 'month-working-days-missing',
        type: 'calc',
        severity: 'high',
        title: 'أيام العمل الشهرية غير معرفة',
        description: `عدد أيام العمل لشهر ${month} غير موجود أو يساوي صفر.`,
        recommendation: 'حدد أيام العمل للشهر من إعدادات التكلفة لضمان قسمة يومية صحيحة.',
      });
    }

    const reportsByProduct = new Map<string, ProductionReport[]>();
    const monthProductQty = new Map<string, number>();
    monthReports.forEach((report) => {
      const productId = String(report.productId || '').trim();
      if (!productId) return;
      const list = reportsByProduct.get(productId) || [];
      list.push(report);
      reportsByProduct.set(productId, list);
      if ((report.quantityProduced || 0) > 0) {
        monthProductQty.set(productId, (monthProductQty.get(productId) || 0) + Number(report.quantityProduced || 0));
      }
    });

    const productionReportsForCost = monthReports.filter((report) => (
      (report.reportType || 'finished_product') === 'finished_product'
      && Number(report.quantityProduced || 0) > 0
    ));
    const failedFullCostReports = productionReportsForCost.filter(
      (report) => report.manufacturingCostPostingState === 'failed',
    );
    const missingFullCostReports = productionReportsForCost.filter(
      (report) => Number(report.fullManufacturingCostSnapshot || 0) <= 0
        && report.manufacturingCostPostingState !== 'failed',
    );
    const missingSourceAmountReports = productionReportsForCost.filter(
      (report) => Number(report.manufacturingCostSourceQualitySnapshot?.missingAmountLines || 0) > 0,
    );
    if (failedFullCostReports.length > 0) {
      addIssue({
        id: 'full-cost-posting-failed',
        type: 'calc',
        severity: 'critical',
        title: 'تقارير فشل تجهيز تكلفتها الكاملة',
        description: `يوجد ${failedFullCostReports.length} تقرير إنتاج في حالة فشل تكلفة التصنيع الكاملة.`,
        recommendation: 'راجع رسالة الخطأ داخل تبويب التكلفة ثم أعد حساب التقارير بعد استكمال الإعدادات.',
      });
    }
    if (missingFullCostReports.length > 0) {
      addIssue({
        id: 'full-cost-snapshot-missing',
        type: 'calc',
        severity: 'high',
        title: 'تقارير لم تُرحّل إلى التكلفة الكاملة بعد',
        description: `يوجد ${missingFullCostReports.length} تقرير إنتاج بالمنطق القديم فقط خلال ${month}.`,
        recommendation: 'شغّل ترحيل التكلفة التجريبي للتقارير المفتوحة ولا تعدّل الفترات المقفلة.',
      });
    }
    if (missingSourceAmountReports.length > 0) {
      addIssue({
        id: 'full-cost-source-price-missing',
        type: 'calc',
        severity: 'high',
        title: 'مصادر خامات بدون تكلفة معروفة',
        description: `يوجد ${missingSourceAmountReports.length} تقرير يحتوي بند تكلفة بصفر أو خامة غير مسعرة.`,
        recommendation: 'راجع سعر شراء الخامة أو طبقة تقييم الصرف قبل اعتماد التكلفة الفعلية.',
      });
    }

    const activeIndirectCenters = costCenters.filter(isProductionAllocationCostCenter);
    activeIndirectCenters.forEach((center) => {
      const centerId = String(center.id || '');
      if (!centerId) return;
      const centerValue = costCenterValues.find((value) => value.costCenterId === centerId && value.month === month);

      if (!centerValue && (center.valueSource || 'manual') === 'manual') {
        addIssue({
          id: `missing-center-value-${centerId}`,
          type: 'calc',
          severity: 'high',
          title: `قيمة مركز التكلفة "${center.name}" غير موجودة`,
          description: `لا يوجد سجل في cost_center_values للمركز "${center.name}" خلال ${month}.`,
          recommendation: 'أضف قيمة شهرية للمركز أو فعّل مصدر القيمة المناسب.',
        });
      }

      const allocationBasis = center.allocationBasis || 'line_percentage';
      if (allocationBasis === 'line_percentage') {
        const allocation = costAllocations.find((entry) => entry.costCenterId === centerId && entry.month === month);
        if (!allocation || allocation.allocations.length === 0) {
          addIssue({
            id: `missing-allocation-${centerId}`,
            type: 'calc',
            severity: 'critical',
            title: `توزيع مرجعي مفقود لمركز "${center.name}"`,
            description: 'مركز line_percentage بدون نسب توزيع يمنع تحميل التكلفة غير المباشرة بشكل صحيح.',
            recommendation: 'أضف cost_allocations للشهر بنفس المركز وتأكد أن النسب مكتملة.',
          });
        } else {
          const totalPct = allocation.allocations.reduce((sum, item) => sum + Number(item.percentage || 0), 0);
          if (Math.abs(totalPct - 100) > 0.01) {
            addIssue({
              id: `allocation-not-100-${centerId}`,
              type: 'calc',
              severity: 'high',
              title: `إجمالي نسب توزيع "${center.name}" لا يساوي 100%`,
              description: `الإجمالي الحالي = ${formatCost(totalPct)}%.`,
              recommendation: 'عدّل نسب التوزيع لتساوي 100% لنفس الشهر.',
            });
          }
        }
      }

      if (allocationBasis === 'by_qty') {
        const allProductIds = Array.from(monthProductQty.keys());
        const scopedProductIds = (center.productScope || 'all') === 'selected'
          ? (center.productIds || [])
          : (center.productScope || 'all') === 'category'
            ? allProductIds.filter((pid) => {
              const product = products.find((p) => String(p.id || '') === pid);
              return (center.productCategories || []).includes(String(product?.category || ''));
            })
            : allProductIds;
        const scopedQty = scopedProductIds.reduce((sum, pid) => sum + Number(monthProductQty.get(pid) || 0), 0);
        if (scopedQty <= 0) {
          addIssue({
            id: `by-qty-zero-scope-${centerId}`,
            type: 'calc',
            severity: 'high',
            title: `مركز by_qty "${center.name}" بدون كمية في النطاق`,
            description: 'لا توجد كمية إنتاج ضمن نطاق المركز، وبالتالي لا يمكن توزيع التكلفة بنسب الكمية.',
            recommendation: 'راجع productScope / categories أو بيانات الإنتاج للشهر.',
          });
        }
      }
    });

    const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
    const periodDepreciations = assetDepreciations.filter((entry) => entry.period === month);
    periodDepreciations.forEach((entry, index) => {
      const asset = assetById.get(String(entry.assetId || ''));
      if (!asset) {
        addIssue({
          id: `orphan-depreciation-${index}`,
          type: 'calc',
          severity: 'critical',
          title: 'سجل إهلاك بدون أصل مرتبط',
          description: `وجدنا سجل إهلاك للأصل ${entry.assetId} غير موجود في مجموعة الأصول.`,
          recommendation: 'نظّف سجلات الإهلاك اليتيمة أو أصلح assetId.',
        });
      } else if (!asset.centerId) {
        addIssue({
          id: `asset-no-center-${asset.id}`,
          type: 'calc',
          severity: 'high',
          title: `الأصل "${asset.name}" بدون مركز تكلفة`,
          description: 'الإهلاك لن يدخل بشكل صحيح في قيمة المركز بدون centerId.',
          recommendation: 'حدد مركز تكلفة صالح للأصل.',
        });
      }
    });

    const monthlyRecordByProduct = new Map(monthlyRecords.map((row) => [String(row.productId || ''), row]));
    reportsByProduct.forEach((reports, productId) => {
      const producedQty = reports.reduce((sum, row) => {
        if ((row.quantityProduced || 0) <= 0) return sum;
        return sum + Number(row.quantityProduced || 0);
      }, 0);
      if (producedQty <= 0) return;
      const row = monthlyRecordByProduct.get(productId);
      if (!row) {
        const productName = products.find((p) => String(p.id || '') === productId)?.name || productId;
        addIssue({
          id: `missing-monthly-record-${productId}`,
          type: 'calc',
          severity: 'critical',
          title: `منتج "${productName}" بدون سجل تكلفة شهرية`,
          description: 'يوجد تقارير إنتاج بكمية > 0 لكن لا يوجد monthly_production_costs للمنتج.',
          recommendation: 'نفّذ حساب الشهر لهذا المنتج أو حساب الكل.',
        });
      }
    });

    monthlyRecords.forEach((row) => {
      const direct = Number(row.directCost || 0);
      const indirect = Number(row.indirectCost || 0);
      const total = Number(row.totalProductionCost || 0);
      const qty = Number(row.totalProducedQty || 0);
      const recomposed = direct + indirect;
      const recomposedDelta = Math.abs(total - recomposed);
      if (recomposedDelta > 0.5) {
        addIssue({
          id: `total-mismatch-${row.productId}`,
          type: 'calc',
          severity: 'critical',
          title: `فرق في إجمالي التكلفة لمنتج ${row.productId}`,
          description: `totalProductionCost لا يساوي direct + indirect (الفرق ${formatCost(recomposedDelta)}).`,
          recommendation: 'أعد الحساب وتحقق من سلامة الحقول المخزنة لنفس الشهر.',
        });
      }

      const expectedAvg = qty > 0 ? total / qty : 0;
      const avgDelta = Math.abs(Number(row.averageUnitCost || 0) - expectedAvg);
      if (avgDelta > 0.01) {
        addIssue({
          id: `avg-mismatch-${row.productId}`,
          type: 'calc',
          severity: 'critical',
          title: `متوسط الوحدة غير مرجعي لمنتج ${row.productId}`,
          description: `averageUnitCost لا يساوي totalProductionCost / totalProducedQty (الفرق ${formatCost(avgDelta)}).`,
          recommendation: 'أعد الحساب وتأكد من القسمة على الكمية المنتجة الصحيحة.',
        });
      }

      if (qty <= 0 && total > 0) {
        addIssue({
          id: `cost-with-zero-qty-${row.productId}`,
          type: 'calc',
          severity: 'high',
          title: `تكلفة موجودة مع كمية صفر لمنتج ${row.productId}`,
          description: 'يوجد تكلفة إجمالية رغم أن إجمالي الكمية المنتجة يساوي صفر.',
          recommendation: 'راجع تقارير المنتج وسجل التكلفة لهذا الشهر.',
        });
      }
    });

    const hasClosed = monthlyRecords.some((row) => row.isClosed);
    const hasOpen = monthlyRecords.some((row) => !row.isClosed);
    if (hasClosed && hasOpen) {
      addIssue({
        id: 'mixed-close-status',
        type: 'calc',
        severity: 'high',
        title: 'حالة إغلاق مرجعية داخل نفس الشهر',
        description: 'بعض سجلات الشهر مغلقة وبعضها مفتوح، وده ممكن يسبب فروقات عند إعادة الحساب.',
        recommendation: 'وحّد حالة الشهر (إغلاق كامل أو مراجعة السجلات المفتوحة).',
      });
    }

    if (monthReports.length > 0 && monthlyRecords.length > 0 && hourlyRate > 0) {
      const monthActiveDates = new Set<string>();
      monthReports.forEach((report) => {
        const date = String(report.date || '');
        if (date.startsWith(month)) monthActiveDates.add(date);
      });
      const byQtyGap = activeIndirectCenters
        .filter((center) => (center.allocationBasis || 'line_percentage') === 'by_qty' && center.id)
        .reduce((sum, center) => {
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
          const snapshotBaseAmount = valueSource === 'manual'
            ? manualAmount
            : valueSource === 'salaries'
              ? (hasSavedBreakdown ? salariesAmount : Number(centerValue?.amount || 0))
              : (hasSavedBreakdown ? (manualAmount + salariesAmount) : Number(centerValue?.amount || 0));
          const monthlyAmount = Math.max(0, snapshotBaseAmount);
          const workingDays = getWorkingDaysForMonth(
            centerValue,
            month,
            systemSettings.costMonthlyWorkingDays,
          );
          const effectiveAmount = getByQtyEffectiveMonthlyAmount(
            monthlyAmount,
            workingDays,
            monthActiveDates.size,
          );
          return sum + Math.max(0, monthlyAmount - effectiveAmount);
        }, 0);
      const productCategoryById = new Map<string, string>(
        products.map((product) => [String(product.id || ''), String(product.category || '')]),
      );
      const live = computeLiveProductCosts(
        monthReports,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        {
          assets,
          assetDepreciations,
          productCategoryById,
          supervisorHourlyRates,
          workingDaysByMonth: systemSettings.costMonthlyWorkingDays,
        },
      );
      const recordsIndirectTotal = monthlyRecords.reduce((sum, row) => sum + Number(row.indirectCost || 0), 0);
      const indirectDelta = Math.abs(recordsIndirectTotal - live.totalIndirectCost);
      if (indirectDelta > 1) {
        addIssue({
          id: 'indirect-total-live-mismatch',
          type: 'calc',
          severity: 'high',
          title: 'فرق بين غير المباشر المخزّن والحساب الحي',
          description: `إجمالي غير المباشر في السجلات = ${formatCost(recordsIndirectTotal)} مقابل الحساب الحي = ${formatCost(live.totalIndirectCost)} (فرق ${formatCost(indirectDelta)}).`,
          recommendation: 'نفّذ إعادة حساب الكل ثم راجع إعدادات التوزيع لمراكز line_percentage/by_qty.',
        });
      }
      const hasOpenRows = monthlyRecords.some((row) => !row.isClosed);
      const expectedGap = Number(byQtyGap || 0);
      if (hasOpenRows && expectedGap > 1) {
        const closeness = Math.abs(indirectDelta - expectedGap);
        const tolerance = Math.max(5, expectedGap * 0.25);
        if (closeness <= tolerance) {
          addIssue({
            id: 'by-qty-full-month-loaded-early',
            type: 'calc',
            severity: 'high',
            title: 'اشتباه تحميل by_qty بالقيمة الشهرية كاملة مبكرًا',
            description: `فرق غير المباشر (${formatCost(indirectDelta)}) قريب من فجوة التحميل التدريجي المتوقعة لمراكز by_qty (${formatCost(expectedGap)}) أثناء شهر مفتوح.`,
            recommendation: 'استخدم التحميل التدريجي لمراكز by_qty حسب الأيام المنقضية ثم أعد حساب الكل.',
          });
        }
      }
    }

    if (monthReports.length > 4000) {
      addIssue({
        id: 'large-report-scan',
        type: 'query',
        severity: 'medium',
        title: 'حجم تقارير كبير للشهر',
        description: `تم تحميل ${monthReports.length} تقرير إنتاج؛ قد تحتاج paging/aggregation لتقليل زمن التحميل.`,
        recommendation: 'استخدم pagination أو تجميع شهري مسبق لبعض شاشات المراجعة.',
      });
    }

    if (products.length > 0 && monthlyRecords.length > 0) {
      const staleCoverage = monthlyRecords.filter((row) => !products.some((product) => String(product.id || '') === row.productId));
      if (staleCoverage.length > 0) {
        addIssue({
          id: 'orphan-monthly-records',
          type: 'query',
          severity: 'medium',
          title: 'سجلات تكلفة بدون منتجات فعالة',
          description: `وجدنا ${staleCoverage.length} سجل تكلفة لمنتجات غير موجودة حاليًا في قائمة المنتجات.`,
          recommendation: 'راجع أرشفة بيانات monthly_production_costs أو أرشفة المنتجات.',
        });
      }
    }

    if (search.trim().length === 0 && issues.length === 0 && laborSettings?.cnyToEgpRate && laborSettings.cnyToEgpRate > 0) {
      // No issue; this branch keeps linter calm for cny usage in page checks.
    }

    return issues;
  }, [
    laborSettings,
    systemSettings.costMonthlyWorkingDays,
    month,
    monthReports,
    costCenters,
    costCenterValues,
    costAllocations,
    products,
    assets,
    assetDepreciations,
    monthlyRecords,
    supervisorHourlyRates,
    search,
  ]);

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return healthIssues.filter((issue) => {
      const matchesSeverity = !severityFilter || issue.severity === severityFilter;
      const matchesType = !typeFilter || issue.type === typeFilter;
      const matchesSearch = !q
        || issue.title.toLowerCase().includes(q)
        || issue.description.toLowerCase().includes(q)
        || issue.recommendation.toLowerCase().includes(q);
      return matchesSeverity && matchesType && matchesSearch;
    });
  }, [healthIssues, severityFilter, typeFilter, search]);

  const criticalCount = healthIssues.filter((issue) => issue.severity === 'critical').length;
  const highCount = healthIssues.filter((issue) => issue.severity === 'high').length;
  const mediumCount = healthIssues.filter((issue) => issue.severity === 'medium').length;
  const passChecks = healthIssues.length === 0;
  const costableReportsCount = monthReports.filter((report) => (
    (report.reportType || 'finished_product') === 'finished_product'
    && Number(report.quantityProduced || 0) > 0
  )).length;
  const fullCostReportsCount = monthReports.filter((report) => (
    (report.reportType || 'finished_product') === 'finished_product'
    && Number(report.quantityProduced || 0) > 0
    && Number(report.fullManufacturingCostSnapshot || 0) > 0
  )).length;
  const fullCostCoverage = costableReportsCount > 0
    ? Math.round((fullCostReportsCount / costableReportsCount) * 100)
    : 100;

  const activeFiltersCount = Number(Boolean(search)) + Number(Boolean(severityFilter)) + Number(Boolean(typeFilter));

  const hero = useMemo(
    () => [
      {
        key: 'status',
        label: 'حالة الشهر',
        value: passChecks ? 'سليم' : 'يحتاج مراجعة',
        accent: !passChecks,
        toneClassName: passChecks ? 'ops-dash-kpi-card--tone-emerald' : 'ops-dash-kpi-card--tone-rose',
      },
      { key: 'critical', label: 'مشاكل حرجة', value: criticalCount, toneClassName: criticalCount > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined },
      { key: 'high', label: 'مشاكل مرتفعة', value: highCount, toneClassName: highCount > 0 ? 'ops-dash-kpi-card--tone-amber' : undefined },
      { key: 'medium', label: 'مشاكل متوسطة', value: mediumCount },
      {
        key: 'fullCost',
        label: 'تغطية التكلفة الكاملة',
        value: `${fullCostCoverage}%`,
        toneClassName: fullCostCoverage === 100 ? 'ops-dash-kpi-card--tone-emerald' : undefined,
      },
    ],
    [passChecks, criticalCount, highCount, mediumCount, fullCostCoverage],
  );

  return (
    <ModuleOpsPageShell
      eyebrow="صحة بيانات التكاليف"
      rangeLabel="فحص سلامة بيانات التكلفة للشهر المختار (حسابات + Firestore + أداء)"
      hero={hero}
      onRefresh={() => void reloadHealth()}
      refreshing={loading}
      periodExtra={(
        <div className="inline-flex h-[34px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2.5">
          <span className="ml-2 text-xs text-[var(--color-text-muted)]">الشهر</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-[28px] text-xs outline-none" />
        </div>
      )}
    >
      <OpsDashPanel title="المشاكل المرجعية" accent="costs" bodyClassName="p-0">
      <SmartFilterBar
      pageId="cost-data-health"
        searchPlaceholder="ابحث داخل عنوان المشكلة أو وصفها..."
        searchValue={search}
        onSearchChange={setSearch}
        quickFilters={[
          {
            key: 'severity',
            placeholder: 'كل المستويات',
            options: [
              { label: 'حرج', value: 'critical' },
              { label: 'مرتفع', value: 'high' },
              { label: 'متوسط', value: 'medium' },
            ],
          },
        ]}
        quickFilterValues={{ severity: severityFilter || 'all' }}
        onQuickFilterChange={(_, value) => setSeverityFilter(value === 'all' ? '' : value)}
        advancedFilters={[
          {
            key: 'type',
            label: 'النوع',
            placeholder: 'كل الأنواع',
            options: [
              { label: 'حسابات', value: 'calc' },
              { label: 'Firestore', value: 'query' },
              { label: 'أداء', value: 'perf' },
            ],
          },
        ]}
        advancedFilterValues={{ type: typeFilter || 'all' }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'type') setTypeFilter(value === 'all' ? '' : value);
        }}
        extra={activeFiltersCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch('');
              setSeverityFilter('');
              setTypeFilter('');
            }}
          >
            {`مسح (${activeFiltersCount})`}
          </Button>
        ) : undefined}
        className="border-0 rounded-none"
      />

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="py-14 text-center">
            <span className="material-icons-round text-5xl text-[rgb(var(--color-success))] mb-3 block">verified</span>
            <p className="text-lg font-bold text-[rgb(var(--color-success))]">ممتاز، لا توجد مشاكل مرجعية للشهر {month}</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              كل الفحوصات الحالية (حسابات/بيانات/اتساق) مرت بدون مرجعية.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto erp-table-scroll">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">#</th>
                  <th className="erp-th">المستوى</th>
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">المشكلة</th>
                  <th className="erp-th">الوصف</th>
                  <th className="erp-th">الإجراء المقترح</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue, index) => (
                  <tr key={issue.id} className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4 font-mono text-[var(--color-text-muted)]">{index + 1}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${severityBadgeClass[issue.severity]}`}>
                        {severityLabel[issue.severity]}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold">{typeLabel[issue.type]}</td>
                    <td className="py-3 px-4 font-bold">{issue.title}</td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)]">{issue.description}</td>
                    <td className="py-3 px-4">{issue.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
