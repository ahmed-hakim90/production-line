import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import type { ProductDetailData } from "../product-details/types";
import { reportService } from "@/modules/production/services/reportService";
import { monthlyProductionCostService } from "@/modules/production/services/monthlyProductionCostService";
import { stockService } from "@/modules/inventory/services/stockService";
import { productMaterialService } from "@/modules/production/services/productMaterialService";
import {
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  countUniqueDays,
  findBestLine,
  getReportWaste,
  groupReportsByDate,
} from "@/utils/calculations";
import {
  buildLineAllocatedCostSummary,
  buildProductCostByLine,
  buildProductCostHistory,
  buildSupervisorHourlyRatesMap,
  computeLiveProductCosts,
  formatCost,
  getCurrentMonth,
} from "@/utils/costCalculations";
import { calculateProductCostBreakdown } from "@/utils/productCostBreakdown";
import type { ProductionReport } from "@/types";

const toMonthLabel = (month: string) => month;

const toDateInputValue = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getPreviousMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? new Date(y - 1, 11, 1) : new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
};

const parseLineName = (lineId: string, lineNameMap: Map<string, string>) =>
  lineNameMap.get(lineId) || "—";

const parseEmployeeName = (employeeId: string, employeeNameMap: Map<string, string>) =>
  employeeNameMap.get(employeeId) || "—";

export const useProductDetail = (id?: string) => {
  const rawProducts = useAppStore((s) => s._rawProducts);
  const rawLines = useAppStore((s) => s._rawLines);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const productsLoading = useAppStore((s) => s.productsLoading);

  return useQuery<ProductDetailData>({
    queryKey: [
      "catalog",
      "product-detail",
      id ?? "",
      rawProducts.length,
      rawLines.length,
      rawEmployees.length,
      lineProductConfigs.length,
      costCenters.length,
      costCenterValues.length,
      costAllocations.length,
      assets.length,
      assetDepreciations.length,
      laborSettings?.hourlyRate ?? 0,
    ],
    enabled: Boolean(id) && !productsLoading,
    queryFn: async () => {
      if (!id) throw new Error("missing product id");
      const product = rawProducts.find((row) => row.id === id);
      if (!product) {
        throw new Error("المنتج غير موجود");
      }

      const currentMonth = getCurrentMonth();
      const previousMonth = getPreviousMonth(currentMonth);
      const [
        reportsDesc,
        monthReportsAll,
        stockBalances,
        productMaterials,
      ] = await Promise.all([
        reportService.getByProduct(id),
        reportService.getByDateRange(`${currentMonth}-01`, `${currentMonth}-31`),
        stockService.getBalances(),
        productMaterialService.getByProduct(id),
      ]);

      const reports = [...reportsDesc].sort((a, b) => a.date.localeCompare(b.date));
      const [currentMonthCost, previousMonthCost] = await Promise.all([
        monthlyProductionCostService.getByProductAndMonth(id, currentMonth),
        monthlyProductionCostService.getByProductAndMonth(id, previousMonth),
      ]);

      const lineNameMap = new Map(rawLines.map((line) => [String(line.id || ""), line.name]));
      const employeeNameMap = new Map(rawEmployees.map((employee) => [String(employee.id || ""), employee.name]));
      const productCategoryById = new Map(rawProducts.map((row) => [String(row.id || ""), String(row.model || "")]));
      const supervisorHourlyRates = buildSupervisorHourlyRatesMap(rawEmployees);
      const payrollNetByEmployee = new Map<string, number>();
      const payrollNetByDepartment = new Map<string, number>();
      rawEmployees.forEach((employee) => {
        if (!employee.id || employee.isActive === false) return;
        payrollNetByEmployee.set(String(employee.id), Number(employee.baseSalary || 0));
        const departmentId = String(employee.departmentId || "");
        if (departmentId) {
          payrollNetByDepartment.set(
            departmentId,
            (payrollNetByDepartment.get(departmentId) || 0) + Number(employee.baseSalary || 0),
          );
        }
      });

      const hourlyRate = laborSettings?.hourlyRate ?? 0;
      const liveCostsAll = computeLiveProductCosts(
        reports,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        {
          assets,
          assetDepreciations,
          productCategoryById,
          supervisorHourlyRates,
          payrollNetByEmployee,
          payrollNetByDepartment,
          workingDaysByMonth: systemSettings.costMonthlyWorkingDays,
        },
      );
      const historicalCost = liveCostsAll.byProduct[id] || null;

      const currentMonthReports = reports.filter((row) => row.date.slice(0, 7) === currentMonth);
      const currentMonthLiveCosts = computeLiveProductCosts(
        currentMonthReports,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        {
          assets,
          assetDepreciations,
          productCategoryById,
          supervisorHourlyRates,
          payrollNetByEmployee,
          payrollNetByDepartment,
          workingDaysByMonth: systemSettings.costMonthlyWorkingDays,
        },
      );
      const currentMonthLiveCost = currentMonthLiveCosts.byProduct[id] || null;

      const getWarehouseBalance = (warehouseId?: string, productId?: string) => {
        if (!warehouseId || !productId) return 0;
        const row = stockBalances.find(
          (x) => x.warehouseId === warehouseId && x.itemType === "finished_good" && x.itemId === productId,
        );
        return Number(row?.quantity || 0);
      };

      const decomposedBalance = getWarehouseBalance(systemSettings.planSettings?.decomposedSourceWarehouseId, id);
      const finishedBalance = getWarehouseBalance(systemSettings.planSettings?.finishedReceiveWarehouseId, id);
      const wasteBalance = getWarehouseBalance(systemSettings.planSettings?.wasteReceiveWarehouseId, id);
      const finalBalance = getWarehouseBalance(systemSettings.planSettings?.finalProductWarehouseId, id);
      const decomposedBalanceAfterProduction = Math.max(0, decomposedBalance - finishedBalance - wasteBalance);

      const totalProduced = reports.reduce((sum, row) => sum + Number(row.quantityProduced || 0), 0);
      const totalWaste = reports.reduce((sum, row) => sum + getReportWaste(row), 0);
      const uniqueDays = countUniqueDays(reports);
      const avgDailyProduction = uniqueDays > 0 ? Math.round(totalProduced / uniqueDays) : 0;
      const avgAssemblyTime = calculateAvgAssemblyTime(reports);
      const bestLine = findBestLine(reports, rawLines);
      const config = lineProductConfigs.find((row) => row.productId === id);
      const standardAssembly = Number(config?.standardAssemblyTime || 0);
      const wasteRatio = calculateWasteRatio(totalWaste, totalProduced + totalWaste);

      const effectiveCurrentUnitCost =
        currentMonthCost && Number(currentMonthCost.totalProducedQty || 0) > 0
          ? Number(currentMonthCost.averageUnitCost || 0)
          : Number(currentMonthLiveCost?.costPerUnit || 0);
      const breakdown = calculateProductCostBreakdown(product, productMaterials, effectiveCurrentUnitCost);
      const cnyRate = Number(laborSettings?.cnyToEgpRate || 0);
      const cnyUnit = cnyRate > 0 ? breakdown.chineseUnitCost / cnyRate : null;
      const monthlyUnitDirect =
        currentMonthCost && Number(currentMonthCost.totalProducedQty || 0) > 0
          ? Number(currentMonthCost.directCost || 0) / Number(currentMonthCost.totalProducedQty || 0)
          : currentMonthLiveCost && Number(currentMonthLiveCost.quantityProduced || 0) > 0
            ? Number(currentMonthLiveCost.laborCost || 0) / Number(currentMonthLiveCost.quantityProduced || 0)
            : 0;
      const monthlyUnitIndirect =
        currentMonthCost && Number(currentMonthCost.totalProducedQty || 0) > 0
          ? Number(currentMonthCost.indirectCost || 0) / Number(currentMonthCost.totalProducedQty || 0)
          : currentMonthLiveCost && Number(currentMonthLiveCost.quantityProduced || 0) > 0
            ? Number(currentMonthLiveCost.indirectCost || 0) / Number(currentMonthLiveCost.quantityProduced || 0)
            : Number(breakdown.productionOverheadShare || 0);
      const displayGrandTotalRaw =
        Number(breakdown.chineseUnitCost || 0)
        + Number(breakdown.rawMaterialCost || 0)
        + Number(breakdown.innerBoxCost || 0)
        + Number(breakdown.cartonShare || 0)
        + Number(monthlyUnitDirect || 0)
        + Number(monthlyUnitIndirect || 0);
      const displayGrandTotal = Number.isFinite(displayGrandTotalRaw)
        ? Math.max(0, displayGrandTotalRaw)
        : 0;

      const costByLine = buildProductCostByLine(
        id,
        reports,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        (lineId) => parseLineName(lineId, lineNameMap),
      );
      const bestCostLine = costByLine.length > 0
        ? costByLine.reduce((best, row) => (row.costPerUnit < best.costPerUnit ? row : best))
        : null;
      const costHistory = buildProductCostHistory(
        id,
        reports,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
      );
      const costTrend =
        costHistory.length > 1
          ? (() => {
              const half = Math.floor(costHistory.length / 2);
              const firstHalf = costHistory.slice(0, half);
              const secondHalf = costHistory.slice(half);
              const avgFirst = firstHalf.reduce((sum, row) => sum + row.costPerUnit, 0) / Math.max(1, firstHalf.length);
              const avgSecond = secondHalf.reduce((sum, row) => sum + row.costPerUnit, 0) / Math.max(1, secondHalf.length);
              const pctChange = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
              return { pctChange, improving: pctChange <= 0 };
            })()
          : null;

      const periodFrom = reports[0]?.date || toDateInputValue(new Date());
      const periodTo = reports[reports.length - 1]?.date || periodFrom;
      const lineOptions = [
        "كل الخطوط",
        ...Array.from(new Set(reports.map((row) => parseLineName(row.lineId, lineNameMap)).filter(Boolean))),
      ];
      const supervisorOptions = [
        "كل المشرفين",
        ...Array.from(
          new Set(
            reports
              .map((row) => parseEmployeeName(row.employeeId, employeeNameMap))
              .filter((name) => name && name !== "—"),
          ),
        ),
      ];

      const currentUnitCost =
        currentMonthCost && Number(currentMonthCost.totalProducedQty || 0) > 0
          ? Number(currentMonthCost.averageUnitCost || 0)
          : Number(currentMonthLiveCost?.costPerUnit || 0);
      const currentTotalCost =
        currentMonthCost && Number(currentMonthCost.totalProducedQty || 0) > 0
          ? Number(currentMonthCost.totalProductionCost || 0)
          : Number(currentMonthLiveCost?.totalCost || 0);
      const currentUnits =
        currentMonthCost && Number(currentMonthCost.totalProducedQty || 0) > 0
          ? Number(currentMonthCost.totalProducedQty || 0)
          : Number(currentMonthLiveCost?.quantityProduced || 0);
      const previousUnitCost = Number(previousMonthCost?.averageUnitCost || 0);
      const previousTotalCost = Number(previousMonthCost?.totalProductionCost || 0);
      const previousUnits = Number(previousMonthCost?.totalProducedQty || 0);
      const monthlyChange = previousUnitCost > 0 ? ((currentUnitCost - previousUnitCost) / previousUnitCost) * 100 : null;

      // Same distribution logic used in MonthlyProductionCosts (single product view):
      const monthReports = monthReportsAll.filter((row) => row.date.slice(0, 7) === currentMonth);
      const monthProductQtyTotals = new Map<string, number>();
      monthReports.forEach((report) => {
        if ((report.quantityProduced || 0) <= 0 || !report.productId) return;
        monthProductQtyTotals.set(
          report.productId,
          (monthProductQtyTotals.get(report.productId) || 0) + Number(report.quantityProduced || 0),
        );
      });

      const assetById = new Map(assets.map((asset) => [String(asset.id || ""), asset]));
      const depreciationByCenter = new Map<string, number>();
      assetDepreciations.forEach((entry) => {
        if (entry.period !== currentMonth) return;
        const asset = assetById.get(String(entry.assetId || ""));
        const centerId = String(asset?.centerId || "");
        if (!centerId) return;
        depreciationByCenter.set(centerId, (depreciationByCenter.get(centerId) || 0) + Number(entry.depreciationAmount || 0));
      });

      const qtyRules = costCenters
        .filter((center) => center.type === "indirect" && center.isActive && (center.allocationBasis || "line_percentage") === "by_qty" && center.id)
        .map((center) => {
          const centerId = String(center.id || "");
          const centerValue = costCenterValues.find((value) => value.costCenterId === centerId && value.month === currentMonth);
          const valueSource = centerValue?.valueSource || center.valueSource || "manual";
          const hasSavedBreakdown = centerValue?.manualAmount !== undefined || centerValue?.salariesAmount !== undefined;
          const manualAmount = hasSavedBreakdown ? Number(centerValue?.manualAmount || 0) : Number(centerValue?.amount || 0);
          const salariesAmount = hasSavedBreakdown ? Number(centerValue?.salariesAmount || 0) : 0;
          const snapshotBase = valueSource === "manual"
            ? manualAmount
            : valueSource === "salaries"
              ? (hasSavedBreakdown ? salariesAmount : Number(centerValue?.amount || 0))
              : (hasSavedBreakdown ? (manualAmount + salariesAmount) : Number(centerValue?.amount || 0));
          const depreciation = Number(depreciationByCenter.get(centerId) || 0);
          const resolvedAmount = snapshotBase + depreciation;
          const allowedProductIds = center.productScope === "selected"
            ? center.productIds || []
            : center.productScope === "category"
              ? Array.from(monthProductQtyTotals.keys()).filter((pid) =>
                  (center.productCategories || []).includes(String(productCategoryById.get(pid) || "غير مصنف")),
                )
              : Array.from(monthProductQtyTotals.keys());
          const denominator = allowedProductIds.reduce((sum, pid) => sum + Number(monthProductQtyTotals.get(pid) || 0), 0);
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
      monthReports.forEach((report) => {
        const key = `${report.lineId}_${report.date}`;
        lineDateQtyTotals.set(key, (lineDateQtyTotals.get(key) || 0) + Number(report.quantityProduced || 0));
        lineDateHoursTotals.set(key, (lineDateHoursTotals.get(key) || 0) + Math.max(0, Number(report.workHours || 0)));
      });

      const productCenterBreakdown: Record<string, number> = {};
      const addCenterCost = (centerId: string, amount: number) => {
        if (!centerId || amount <= 0) return;
        productCenterBreakdown[centerId] = (productCenterBreakdown[centerId] || 0) + amount;
      };
      monthReports.forEach((report) => {
        if (!report.quantityProduced || report.quantityProduced <= 0 || report.productId !== id) return;
        const reportMonth = report.date?.slice(0, 7) || currentMonth;
        const cacheKey = `${report.lineId}_${reportMonth}`;
        if (!lineCenterSummaryCache.has(cacheKey)) {
          lineCenterSummaryCache.set(
            cacheKey,
            buildLineAllocatedCostSummary(
              report.lineId,
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
        const lineCenterSummary = lineCenterSummaryCache.get(cacheKey);
        const lineDateKey = `${report.lineId}_${report.date}`;
        const lineDateTotalHours = lineDateHoursTotals.get(lineDateKey) || 0;
        const lineDateTotalQty = lineDateQtyTotals.get(lineDateKey) || 0;
        const reportHours = Math.max(0, Number(report.workHours || 0));
        const shareRatio = lineDateTotalHours > 0 && reportHours > 0
          ? reportHours / lineDateTotalHours
          : lineDateTotalQty > 0
            ? Number(report.quantityProduced || 0) / lineDateTotalQty
            : 0;

        lineCenterSummary?.centers.forEach((center) => {
          addCenterCost(center.costCenterId, center.dailyAllocated * shareRatio);
        });
        for (const rule of qtyRules) {
          if (!rule.allowedProductIds.has(report.productId)) continue;
          const share = rule.resolvedAmount * ((report.quantityProduced || 0) / rule.denominator);
          addCenterCost(rule.costCenterId, share);
        }
      });

      const monthProducedDenominator = Number(
        currentMonthCost?.totalProducedQty
        || currentMonthLiveCost?.quantityProduced
        || monthProductQtyTotals.get(id)
        || 0,
      );
      const indirectCostRows = Object.entries(productCenterBreakdown)
        .filter(([, value]) => Number(value) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([centerId, monthlyTotal]) => ({
          id: centerId,
          icon: "center",
          label: costCenters.find((center) => String(center.id || "") === centerId)?.name || centerId,
          subLabel: "تكلفة تشغيل غير مباشرة",
          perUnit: monthProducedDenominator > 0 ? Number(monthlyTotal) / monthProducedDenominator : 0,
          monthlyTotal: Number(monthlyTotal),
        }));

      const detailedReports = reports
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((row: ProductionReport, idx) => ({
          id: String(row.id || `${row.date}-${row.lineId}-${row.employeeId}-${idx}`),
          date: row.date,
          line: parseLineName(row.lineId, lineNameMap),
          employee: parseEmployeeName(row.employeeId, employeeNameMap),
          quantity: Number(row.quantityProduced || 0),
          waste: getReportWaste(row),
          workers: Number(row.workersCount || 0),
          hours: Number(row.workHours || 0),
        }));

      return {
        id,
        header: {
          breadcrumb: `الكتالوج › المنتجات › ${product.code || id}`,
          name: product.name,
          code: product.code || id,
          category: product.model || "غير مصنف",
          status: finalBalance <= 0 ? "out_of_stock" : "available",
        },
        activePeriod: "all",
        selectedLine: "كل الخطوط",
        selectedSupervisor: "كل المشرفين",
        periodFrom,
        periodTo,
        lineOptions,
        supervisorOptions,
        kpis: [
          { id: "k1", label: "رصيد مفكك", value: decomposedBalance, unit: "وحدة", icon: "inventory_2", tone: "gray" },
          { id: "k2", label: "رصيد بعد الإنتاج", value: decomposedBalanceAfterProduction, unit: "وحدة", icon: "bar_chart", tone: "amber" },
          { id: "k3", label: "تم الصنع", value: finishedBalance, unit: "وحدة", icon: "inventory_2", tone: "blue" },
          { id: "k4", label: "الهالك", value: wasteBalance, unit: "وحدة", icon: "bar_chart", tone: "coral" },
          { id: "k5", label: "منتج تام", value: finalBalance, unit: "وحدة", icon: "inventory_2", tone: "teal" },
          { id: "k6", label: "نسبة الهالك", value: `${wasteRatio}%`, unit: "من الكلي", icon: "insights", tone: "gray" },
        ],
        performanceCards: [
          { id: "p1", label: "متوسط الإنتاج اليومي", value: `${avgDailyProduction} وحدة/يوم`, tone: "teal" },
          { id: "p2", label: "أفضل خط إنتاج", value: bestLine, tone: "blue" },
          { id: "p3", label: "وقت التجميع الفعلي", value: avgAssemblyTime > 0 ? `${avgAssemblyTime} دقيقة/وحدة` : "—", tone: "gray" },
          { id: "p4", label: "وقت التجميع القياسي", value: standardAssembly > 0 ? `${standardAssembly} دقيقة/وحدة` : "غير محدد", tone: "gray" },
        ],
        monthlyCostDate: toMonthLabel(currentMonth),
        monthlyCostColumns: [
          {
            id: "current",
            title: "الشهر الحالي",
            bgColor: "rgb(var(--color-primary) / 0.12)",
            unitCost: currentUnitCost,
            total: currentTotalCost,
            units: currentUnits,
          },
          {
            id: "previous",
            title: "الشهر السابق",
            bgColor: "#F1EFE8",
            unitCost: previousUnitCost > 0 ? previousUnitCost : "لا يوجد إنتاج",
            total: previousTotalCost > 0 ? previousTotalCost : "—",
            units: previousUnits > 0 ? previousUnits : "",
          },
          {
            id: "change",
            title: "التغيير",
            bgColor: monthlyChange == null ? "#F1EFE8" : monthlyChange <= 0 ? "rgb(var(--color-primary) / 0.12)" : "#FCEBEB",
            unitCost: monthlyChange == null ? "—" : `${Math.abs(monthlyChange).toFixed(1)}% ${monthlyChange <= 0 ? "↓" : "↑"}`,
            total: monthlyChange == null ? "غير متاح" : monthlyChange <= 0 ? "تحسن في تكلفة الوحدة" : "ارتفاع في تكلفة الوحدة",
            units: "",
          },
        ],
        costBreakdownRows: [
          { id: "s1", type: "section", label: "تكاليف المنتج (مواد + تغليف)" },
          { id: "r1", type: "row", label: "تكلفة الوحدة الصينية", value: `${formatCost(breakdown.chineseUnitCost)} ج.م` },
          { id: "r2", type: "row", label: `السعر باليوان الصيني (${formatCost(breakdown.chineseUnitCost)} ÷ ${Number(cnyRate || 0)})`, value: cnyUnit == null ? "—" : `${formatCost(cnyUnit)} ¥` },
          { id: "r3", type: "row", label: `تكلفة المواد الخام (${productMaterials.length} مادة)`, value: `${formatCost(breakdown.rawMaterialCost)} ج.م` },
          { id: "r4", type: "row", label: "تكلفة العلبة الداخلية", value: `${formatCost(breakdown.innerBoxCost)} ج.م` },
          { id: "r5", type: "row", label: `نصيب الكرتونة (${formatCost(breakdown.outerCartonCost)} ÷ ${breakdown.unitsPerCarton || 0})`, value: `${formatCost(breakdown.cartonShare)} ج.م` },
          { id: "s2", type: "section", label: "تكاليف صناعية (مباشرة وغير مباشرة)" },
          { id: "r6", type: "row", label: "التكاليف الصناعية المباشرة (متوسط شهري/????)", value: `${formatCost(monthlyUnitDirect)} ج.م` },
          { id: "r7", type: "row", label: "التكاليف الصناعية غير المباشرة (متوسط شهري/????)", value: `${formatCost(monthlyUnitIndirect)} ج.م` },
          {
            id: "t1",
            type: "total",
            label: `إجمالي تكاليف صناعية للمنتج | ${formatCost(monthlyUnitDirect + monthlyUnitIndirect)} ج.م/????`,
            subLabel: `إجمالي شهري مرجعي: ${formatCost(Number(currentTotalCost || 0))} ج.م`,
          },
        ],
        indirectCostRows,
        grandTotal: `${formatCost(displayGrandTotal)} ج.م`,
        rawMaterialsEmptyMessage: "لا توجد مواد خام مسجلة",
        costSummaryItems: [
          {
            id: "cs1",
            title: "متوسط تكلفة الوحدة",
            value: `${formatCost(Number(historicalCost?.costPerUnit || 0))} ج.م/وحدة`,
            bgColor: "#FFFFFF",
          },
          {
            id: "cs2",
            title: "إجمالي التكلفة التاريخية",
            value: `${formatCost(Number(historicalCost?.totalCost || 0))} ج.م`,
            bgColor: "#FFFFFF",
          },
          {
            id: "cs3",
            title: "اتجاه التكلفة",
            value: costTrend ? `${Math.abs(costTrend.pctChange).toFixed(1)}% ${costTrend.improving ? "↓" : "↑"}` : "—",
            subtitle: costTrend ? (costTrend.improving ? "تحسن" : "ارتفاع") : "غير متاح",
            bgColor: costTrend ? (costTrend.improving ? "rgb(var(--color-primary) / 0.12)" : "#FCEBEB") : "#F1EFE8",
          },
          {
            id: "cs4",
            title: "أفضل خط من حيث التكلفة",
            value: bestCostLine?.lineName || "—",
            subtitle: bestCostLine ? `${formatCost(bestCostLine.costPerUnit)} ج.م/وحدة` : undefined,
            bgColor: "rgb(var(--color-primary) / 0.12)",
          },
        ],
        productionByLine: costByLine
          .sort((a, b) => b.totalProduced - a.totalProduced)
          .map((row) => ({
            id: row.lineId,
            lineName: row.lineName,
            producedQty: Number(row.totalProduced || 0),
            totalCost: Number(row.totalCost || 0),
            unitCost: Number(row.costPerUnit || 0),
            isBest: bestCostLine?.lineId === row.lineId,
          })),
        unitCostTrend: costHistory.map((row) => ({ date: row.date, value: Number(row.costPerUnit || 0) })),
        productionLog: groupReportsByDate(reports).map((row) => ({
          date: row.date,
          production: Number(row.produced || 0),
          waste: Number(row.waste || 0),
        })),
        detailedReports,
      };
    },
    staleTime: 1000 * 30,
  });
};
