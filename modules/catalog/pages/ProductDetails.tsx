import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTenantNavigate } from "@/lib/useTenantNavigate";
import {
  BarChart3,
  Boxes,
  Factory,
  FileText,
  LineChart,
  Loader2,
  Pencil,
  Plus,
  Table2,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProductDetail } from "./hooks/useProductDetail";
import { ProductBomSection } from "@/modules/manufacturing/components/ProductBomSection";
import { useAppStore, useShallowStore } from "@/store/useAppStore";
import type { ProductionReport } from "@/types";
import {
  buildProductCostByLine,
  computeLiveProductCosts,
  formatCost,
} from "@/utils/costCalculations";
import { IndirectCostCards } from "@/src/components/erp/IndirectCostCards";
import { useGlobalModalManager } from "../../../components/modal-manager/GlobalModalManager";
import { MODAL_KEYS } from "../../../components/modal-manager/modalKeys";
import type { IndirectCostItem } from "@/src/components/erp/IndirectCostCards";
import { calculateWasteRatio } from "@/utils/calculations";
import { usePermission } from "../../../utils/permissions";
import { usePrintEngine } from "@/utils/printManager";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DetailPageStickyHeader,
  FIELD_ON_PANEL,
  NESTED_TILE,
  SectionSkeleton,
  SURFACE_CARD,
} from "@/src/components/erp/DetailPageChrome";
import { CatalogProductDetailPrint } from "../components/CatalogProductDetailPrint";

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  boxShadow: "0 1px 2px rgb(0 0 0 / 0.06)",
};

const CHART_TICK_PROPS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;

const arNumber = (value: number) => value.toLocaleString("ar-EG");
const arDecimal = (value: number, fractionDigits = 2) =>
  value.toLocaleString("ar-EG", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
/** Arabic-Indic digits (U+0660–U+0669) → western 0–9; normalize ٫/٬ separators */
const parseMoneyValue = (value?: string) => {
  if (!value) return 0;
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  let s = value.replace(/[٠-٩]/g, (ch) => String(arabicIndic.indexOf(ch)));
  s = s.replace(/\u066C/g, "").replace(/,/g, ""); // thousands
  s = s.replace(/\u066B/g, ".").replace(/٫/g, "."); // decimal
  s = s.replace(/\s/g, "");
  const match = s.match(/-?\d+(?:\.\d+)?/);
  const parsed = Number(match?.[0] ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const ICON_MAP: Record<string, LucideIcon> = {
  upload: Upload,
  edit: Pencil,
  add: Plus,
  inventory_2: Boxes,
  table_chart: Table2,
  insights: LineChart,
  bar_chart: BarChart3,
  description: FileText,
  /** إنتاج / ما تم إنتاجه */
  factory: Factory,
};

const renderIcon = (name: string, size = 16, className = "") => {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
};

type ToneKey = "teal" | "blue" | "coral" | "amber" | "red" | "gray";

const TONE_ICON_WRAP: Record<ToneKey, string> = {
  teal: "bg-primary/15 text-primary",
  blue: "bg-[rgb(var(--color-primary)/0.1)]0/15 text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]",
  coral: "bg-[rgb(var(--color-warning)/0.1)]0/15 text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]",
  amber: "bg-[rgb(var(--color-warning)/0.1)]0/15 text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]",
  red: "bg-destructive/15 text-destructive",
  gray: "bg-muted text-muted-foreground",
};

const TONE_VALUE_TEXT: Record<ToneKey, string> = {
  teal: "text-primary",
  blue: "text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]",
  coral: "text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]",
  amber: "text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]",
  red: "text-destructive",
  gray: "text-muted-foreground",
};

const PERIOD_OPTIONS = [
  { key: "all", label: "الكل" },
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "weekly", label: "أسبوعي" },
  { key: "monthly", label: "شهري" },
] as const;

const SECTION_KEYS = [
  "header",
  "filters",
  "kpis",
  "performance",
  "costBreakdown",
  "rawMaterials",
  "summary",
  "lineTable",
  "costTrend",
  "prodLog",
  "reports",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

const downloadExcel = async (rows: Array<Array<string | number>>, sheetName: string, fileName: string) => {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const resolveIndirectIconType = (label: string): IndirectCostItem["iconType"] => {
  const name = label.toLowerCase();
  if (name.includes("تغليف") || name.includes("جودة")) return "packaging";
  if (name.includes("تخزين") || name.includes("مخزن")) return "storage";
  if (name.includes("مرتب") || name.includes("اجور") || name.includes("أجور") || name.includes("رواتب")) return "salaries";
  if (name.includes("عدد") || name.includes("مهمات") || name.includes("ادوات") || name.includes("أدوات")) return "tools";
  if (name.includes("ايجار") || name.includes("إيجار")) return "rent";
  if (name.includes("اهلاك") || name.includes("إهلاك")) return "depreciation";
  if (name.includes("كهرباء") || name.includes("طاقة")) return "electricity";
  if (name.includes("هواء") || name.includes("كمبروسر")) return "compressed-air";
  return "custom";
};

export const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const shellBackAction = (
    <Button type="button" variant="ghost" onClick={() => navigate("/products")}>
      رجوع
    </Button>
  );
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const canViewCosts = can("costs.view");
  const canViewBom = can("bom.view") || can("bom.manage");
  const canManageBom = can("bom.manage") || can("products.edit");
  const { data, isLoading, isError } = useProductDetail(id);
  const {
    costCenters,
    costCenterValues,
    costAllocations,
    laborSettings,
    assets,
    assetDepreciations,
    systemSettings,
    _rawProducts,
    _rawEmployees,
  } = useShallowStore((s) => ({
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    laborSettings: s.laborSettings,
    assets: s.assets,
    assetDepreciations: s.assetDepreciations,
    systemSettings: s.systemSettings,
    _rawProducts: s._rawProducts,
    _rawEmployees: s._rawEmployees,
  }));
  const [sectionReady, setSectionReady] = useState<Record<SectionKey, boolean>>({
    header: false,
    filters: false,
    kpis: false,
    performance: false,
    costBreakdown: false,
    rawMaterials: false,
    summary: false,
    lineTable: false,
    costTrend: false,
    prodLog: false,
    reports: false,
  });

  const [detailTab, setDetailTab] = useState<"overview" | "bom">("overview");
  const uid = useAppStore((s) => s.uid) || "";
  const printTemplate = useAppStore((s) => s.systemSettings?.printTemplate);
  const { printDocument } = usePrintEngine();

  useEffect(() => {
    if (!canViewBom && detailTab === "bom") setDetailTab("overview");
  }, [canViewBom, detailTab]);
  const [activePeriod, setActivePeriod] = useState("all");
  const [lineFilter, setLineFilter] = useState("كل الخطوط");
  const [supervisorFilter, setSupervisorFilter] = useState("كل المشرفين");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!data) return;
    setActivePeriod(data.activePeriod);
    setLineFilter(data.selectedLine);
    setSupervisorFilter(data.selectedSupervisor);
    setFromDate(data.periodFrom);
    setToDate(data.periodTo);
  }, [data]);

  useEffect(() => {
    if (!data || isLoading) return;
    const timers = SECTION_KEYS.map((key, idx) =>
      window.setTimeout(() => {
        setSectionReady((prev) => ({ ...prev, [key]: true }));
      }, 60 + idx * 90),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [data, isLoading]);

  const reports = data?.detailedReports ?? [];
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesLine = lineFilter === "كل الخطوط" || report.line === lineFilter;
      const matchesSupervisor = supervisorFilter === "كل المشرفين" || report.employee === supervisorFilter;
      const matchesFrom = !fromDate || report.date >= fromDate;
      const matchesTo = !toDate || report.date <= toDate;
      return matchesLine && matchesSupervisor && matchesFrom && matchesTo;
    });
  }, [reports, lineFilter, supervisorFilter, fromDate, toDate]);

  const allowedDatesByFilters = useMemo(() => {
    if (lineFilter === "كل الخطوط" && supervisorFilter === "كل المشرفين") {
      return null;
    }
    return new Set(filteredReports.map((report) => report.date));
  }, [filteredReports, lineFilter, supervisorFilter]);

  const filteredUnitCostTrend = useMemo(() => {
    const trend = data?.unitCostTrend ?? [];
    return trend.filter((point) => {
      const matchesFrom = !fromDate || point.date >= fromDate;
      const matchesTo = !toDate || point.date <= toDate;
      const matchesLineAndSupervisor = !allowedDatesByFilters || allowedDatesByFilters.has(point.date);
      return matchesFrom && matchesTo && matchesLineAndSupervisor;
    });
  }, [data?.unitCostTrend, fromDate, toDate, allowedDatesByFilters]);

  const filteredProductionLog = useMemo(() => {
    const log = data?.productionLog ?? [];
    return log.filter((point) => {
      const matchesFrom = !fromDate || point.date >= fromDate;
      const matchesTo = !toDate || point.date <= toDate;
      const matchesLineAndSupervisor = !allowedDatesByFilters || allowedDatesByFilters.has(point.date);
      return matchesFrom && matchesTo && matchesLineAndSupervisor;
    });
  }, [data?.productionLog, fromDate, toDate, allowedDatesByFilters]);

  const filteredManufacturingReports = useMemo((): ProductionReport[] => {
    if (!id || !data?.manufacturingCostReports) return [];
    return data.manufacturingCostReports
      .filter((row) => {
        const matchesLine = lineFilter === "كل الخطوط" || row.lineName === lineFilter;
        const matchesSupervisor =
          supervisorFilter === "كل المشرفين" || row.employeeName === supervisorFilter;
        const matchesFrom = !fromDate || row.date >= fromDate;
        const matchesTo = !toDate || row.date <= toDate;
        return matchesLine && matchesSupervisor && matchesFrom && matchesTo;
      })
      .map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        productId: id,
        lineId: row.lineId,
        date: row.date,
        quantityProduced: row.quantityProduced,
        workersCount: row.workersCount,
        workHours: row.workHours,
        reportType: row.reportType as ProductionReport["reportType"],
      }));
  }, [data?.manufacturingCostReports, id, lineFilter, supervisorFilter, fromDate, toDate]);

  const periodCostStats = useMemo(() => {
    if (!id || filteredManufacturingReports.length === 0) {
      return { quantity: 0, totalCost: 0, unitCost: 0, directCost: 0, indirectCost: 0 };
    }
    const productCategoryById = new Map(
      _rawProducts.map((row) => [
        String(row.id || ""),
        String(row.model || row.categoryName || ""),
      ]),
    );
    const supervisorHourlyRates = new Map<string, number>();
    _rawEmployees.forEach((employee) => {
      if (!employee.id) return;
      supervisorHourlyRates.set(String(employee.id), Number(employee.hourlyRate || 0));
    });
    const live = computeLiveProductCosts(
      filteredManufacturingReports,
      laborSettings?.hourlyRate ?? 0,
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
    const productCost = live.byProduct[id] || {
      laborCost: 0,
      indirectCost: 0,
      totalCost: 0,
      quantityProduced: 0,
      costPerUnit: 0,
    };
    const qty = Number(productCost.quantityProduced || 0);
    return {
      quantity: qty,
      totalCost: Number(productCost.totalCost || 0),
      unitCost: qty > 0 ? Number(productCost.totalCost || 0) / qty : 0,
      directCost: Number(productCost.laborCost || 0),
      indirectCost: Number(productCost.indirectCost || 0),
    };
  }, [
    id,
    filteredManufacturingReports,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
    assets,
    assetDepreciations,
    systemSettings.costMonthlyWorkingDays,
    _rawProducts,
    _rawEmployees,
  ]);

  const periodCostLabel = useMemo(() => {
    if (fromDate && toDate) return `${fromDate} → ${toDate}`;
    if (fromDate) return `من ${fromDate}`;
    if (toDate) return `حتى ${toDate}`;
    return data?.monthlyCostDate || "الفترة المحددة";
  }, [fromDate, toDate, data?.monthlyCostDate]);

  const filteredProductionByLine = useMemo(() => {
    if (!id || filteredManufacturingReports.length === 0) return [];
    const rows = buildProductCostByLine(
      id,
      filteredManufacturingReports,
      laborSettings?.hourlyRate ?? 0,
      costCenters,
      costCenterValues,
      costAllocations,
      (lineId) =>
        data?.manufacturingCostReports.find((r) => r.lineId === lineId)?.lineName || lineId,
    );
    let bestLineId: string | null = null;
    let bestUnit = Number.POSITIVE_INFINITY;
    rows.forEach((row) => {
      if (row.totalProduced > 0 && row.costPerUnit < bestUnit) {
        bestUnit = row.costPerUnit;
        bestLineId = row.lineId;
      }
    });
    return rows
      .filter((row) => lineFilter === "كل الخطوط" || row.lineName === lineFilter)
      .sort((a, b) => b.totalProduced - a.totalProduced)
      .map((row) => ({
        id: row.lineId,
        lineName: row.lineName,
        producedQty: Number(row.totalProduced || 0),
        totalCost: Number(row.totalCost || 0),
        unitCost: Number(row.costPerUnit || 0),
        isBest: bestLineId != null && row.lineId === bestLineId,
      }));
  }, [
    id,
    filteredManufacturingReports,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
    data?.manufacturingCostReports,
    lineFilter,
  ]);

  const pageSize = 10;
  const filteredUniqueDays = useMemo(() => new Set(filteredReports.map((row) => row.date)).size, [filteredReports]);

  /** مؤشرات وأداء تتبع فلاتر الفترة/الخط/المشرف (نفس منطق الجداول والرسوم) */
  const displayKpis = useMemo(() => {
    if (!data?.kpis) return [];
    const producedFiltered = filteredReports.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const wasteFiltered = filteredReports.reduce((sum, row) => sum + Number(row.waste || 0), 0);
    const wasteRatioPct = calculateWasteRatio(wasteFiltered, producedFiltered + wasteFiltered);
    return data.kpis.map((kpi) => {
      if (kpi.id === "k2") return { ...kpi, value: producedFiltered };
      if (kpi.id === "k6") return { ...kpi, value: `${wasteRatioPct}%` };
      return kpi;
    });
  }, [data?.kpis, filteredReports]);

  const displayPerformanceCards = useMemo(() => {
    if (!data?.performanceCards) return [];
    const totalQty = filteredReports.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const avgDaily =
      filteredUniqueDays > 0 ? Math.round(totalQty / filteredUniqueDays) : 0;

    const lineTotals = new Map<string, number>();
    filteredReports.forEach((row) => {
      const name = String(row.line || "").trim();
      if (!name || name === "—") return;
      lineTotals.set(name, (lineTotals.get(name) || 0) + Number(row.quantity || 0));
    });
    let bestLineName = "—";
    let bestQty = 0;
    lineTotals.forEach((qty, name) => {
      if (qty > bestQty) {
        bestQty = qty;
        bestLineName = name;
      }
    });

    const totalWorkerHours = filteredReports.reduce(
      (sum, row) => sum + Number(row.workers || 0) * Number(row.hours || 0),
      0,
    );
    const avgAssembly =
      totalQty > 0 ? Number(((totalWorkerHours * 60) / totalQty).toFixed(2)) : 0;

    return data.performanceCards.map((card) => {
      if (card.id === "p1") return { ...card, value: `${avgDaily} وحدة/يوم` };
      if (card.id === "p2") return { ...card, value: bestLineName };
      if (card.id === "p3") {
        return {
          ...card,
          value: avgAssembly > 0 ? `${avgAssembly} دقيقة/وحدة` : "—",
        };
      }
      return card;
    });
  }, [data?.performanceCards, filteredReports, filteredUniqueDays]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const paginatedReports = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [page, filteredReports]);
  const indirectCostItems = useMemo<IndirectCostItem[]>(
    () =>
      (data?.indirectCostRows || []).map((row) => ({
        id: row.id,
        name: row.label,
        subLabel: row.subLabel,
        costPerUnit: Number(row.perUnit || 0),
        monthlyTotal: Number(row.monthlyTotal || 0),
        iconType: resolveIndirectIconType(row.label),
      })),
    [data?.indirectCostRows],
  );

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [lineFilter, supervisorFilter, fromDate, toDate, activePeriod]);

  const onExport = () => {
    if (!data) return;
    printDocument({
      documentTitle: data.header?.name ? `تفاصيل-منتج-${data.header.name}` : "تفاصيل-منتج",
      printSettings: printTemplate,
      render: (ref) => (
        <CatalogProductDetailPrint
          ref={ref}
          productId={data.id}
          productName={data.header.name}
          productCode={data.header.code}
          category={data.header.category}
          periodLabel={`${fromDate || "—"} إلى ${toDate || "—"}`}
          kpis={displayKpis}
          rows={filteredReports}
          printSettings={printTemplate}
        />
      ),
    });
  };

  const onExcel = () => {
    if (!data) return;
    void downloadExcel(
      [
        ["التاريخ", "خط الإنتاج", "المشرف", "الكمية", "الهالك", "عمال", "ساعات"],
        ...filteredReports.map((row) => [
          row.date,
          row.line,
          row.employee,
          row.quantity,
          row.waste,
          row.workers,
          row.hours,
        ]),
      ],
      "تقارير_المنتج",
      `product-detail-${data.id}`,
    );
  };

  const onEditProduct = () => {
    if (!data?.id) return;
    if (!can("products.edit")) return;
    openModal(MODAL_KEYS.PRODUCTS_CREATE, { mode: "edit", productId: data.id });
  };

  const applyPeriod = (period: string) => {
    if (!data) return;
    setActivePeriod(period);
    const maxDate = data.periodTo || data.unitCostTrend.at(-1)?.date || formatDateInput(new Date());
    const max = new Date(maxDate);
    if (Number.isNaN(max.getTime())) return;
    let from = "";
    let to = maxDate;
    if (period === "today") {
      from = maxDate;
    } else if (period === "yesterday") {
      const previous = new Date(max);
      previous.setDate(previous.getDate() - 1);
      from = formatDateInput(previous);
      to = from;
    } else if (period === "weekly") {
      const previous = new Date(max);
      previous.setDate(previous.getDate() - 6);
      from = formatDateInput(previous);
    } else if (period === "monthly") {
      const previous = new Date(max);
      previous.setDate(previous.getDate() - 29);
      from = formatDateInput(previous);
    } else {
      from = data.periodFrom;
      to = data.periodTo;
    }
    setFromDate(from);
    setToDate(to);
  };

  if (isError) {
    return (
      <ModuleOpsPageShell eyebrow="تفاصيل المنتج" actions={shellBackAction}>
        <OpsDashPanel title="تعذر تحميل بيانات المنتج" accent="production">
          <p className="text-sm text-destructive">تعذر تحميل بيانات المنتج. حاول مرة أخرى.</p>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  const pageHeaderExtra =
    data && !isLoading && sectionReady.header ? (
      <Badge variant={data.header.status === "out_of_stock" ? "destructive" : "default"} className="shrink-0">
        {data.header.status === "out_of_stock" ? "نفد المخزون" : "متوفر"}
      </Badge>
    ) : null;

  const productShellActions = (
    <div className="flex flex-wrap items-center gap-2">
      {shellBackAction}
      {data && !isLoading && sectionReady.header ? (
        <>
          {can("products.edit") ? (
            <Button type="button" onClick={onEditProduct}>
              تعديل المنتج
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onExport}>
            تصدير
          </Button>
          <Button type="button" variant="outline" onClick={onExcel}>
            تقارير Excel
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <ModuleOpsPageShell eyebrow="تفاصيل المنتج" actions={productShellActions}>
      <DetailPageStickyHeader>
        {isLoading || !sectionReady.header || !data ? (
          <OpsDashPanel title="جاري التحميل" accent="production">
            <SectionSkeleton rows={2} height={20} />
          </OpsDashPanel>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{data.header.name}</h2>
              {pageHeaderExtra}
            </div>
            <p className="text-sm text-muted-foreground">
              {`${data.header.breadcrumb} · الكود: ${data.header.code} · الفئة: ${data.header.category}`}
            </p>
          </div>
        )}

        {data && !isLoading && sectionReady.header && (
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <Button
              type="button"
              variant={detailTab === "overview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDetailTab("overview")}
            >
              نظرة عامة
            </Button>
            {canViewBom ? (
              <Button
                type="button"
                variant={detailTab === "bom" ? "default" : "ghost"}
                size="sm"
                onClick={() => setDetailTab("bom")}
              >
                BOM والمواد
              </Button>
            ) : null}
          </div>
        )}

        <OpsDashPanel title="الفلاتر والفترة" accent="production">
          {detailTab === "bom" ? null : isLoading || !sectionReady.filters || !data ? (
            <SectionSkeleton rows={2} height={38} />
          ) : (
            <div className="flex flex-wrap items-center gap-3 p-1">
              <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)]/90 bg-[var(--color-surface-hover)] p-1 dark:border-border dark:bg-muted/40">
                {PERIOD_OPTIONS.map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    variant={activePeriod === option.key ? "default" : "ghost"}
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => applyPeriod(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <select
                value={lineFilter}
                onChange={(event) => setLineFilter(event.target.value)}
                className={cn("h-9 min-w-[140px] rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
              >
                {data.lineOptions.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
              </select>

              <select
                value={supervisorFilter}
                onChange={(event) => setSupervisorFilter(event.target.value)}
                className={cn("h-9 min-w-[160px] rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
              >
                {data.supervisorOptions.map((supervisor) => (
                  <option key={supervisor} value={supervisor}>
                    {supervisor}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-2 lg:mr-auto">
                <span className="text-xs font-medium text-[var(--color-text-muted)] dark:text-muted-foreground">من</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className={cn("h-9 rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                />
                <span className="text-xs font-medium text-[var(--color-text-muted)] dark:text-muted-foreground">إلى</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className={cn("h-9 rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                />
              </div>
            </div>
          )}
        </OpsDashPanel>
      </DetailPageStickyHeader>

      {detailTab === "bom" && id && canViewBom ? (
        <OpsDashPanel title="BOM والمواد" accent="production">
          <ProductBomSection
            productId={id}
            canManage={canManageBom}
            canViewCosts={canViewCosts}
            userId={uid}
          />
        </OpsDashPanel>
      ) : null}

      {detailTab === "overview" && (
      <>
      <OpsDashPanel title="مؤشرات الأداء" accent="production">
        {isLoading || !sectionReady.kpis || !data ? (
          <SectionSkeleton rows={3} height={68} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {displayKpis.map((kpi) => {
              const wrap = TONE_ICON_WRAP[kpi.tone];
              const value = typeof kpi.value === "number" ? arNumber(kpi.value) : kpi.value;
              return (
                <div key={kpi.id} className={cn("space-y-2 p-3", NESTED_TILE)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-medium text-[var(--color-text-muted)] dark:text-muted-foreground">{kpi.label}</p>
                    <div className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg", wrap)}>
                      {renderIcon(kpi.icon, 16)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[22px] font-semibold leading-none text-[var(--color-text)] dark:text-foreground">{value}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] dark:text-muted-foreground">{kpi.unit}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title={canViewCosts ? "الأداء والتكلفة الشهرية" : "الأداء"} accent="production">
        {isLoading || !sectionReady.performance || !data ? (
          <SectionSkeleton rows={4} height={62} />
        ) : (
          <div className={cn("grid grid-cols-1 gap-4", canViewCosts ? "lg:grid-cols-3" : "")}>
            <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", canViewCosts ? "lg:col-span-2" : "")}>
              {displayPerformanceCards.map((item) => {
                const valueCls = TONE_VALUE_TEXT[item.tone];
                return (
                  <div key={item.id} className={cn("space-y-2 p-3", NESTED_TILE)}>
                    <p className="text-xs font-medium text-[var(--color-text-muted)] dark:text-muted-foreground">{item.label}</p>
                    <p className={cn("text-lg font-medium", valueCls)}>{item.value}</p>
                  </div>
                );
              })}
            </div>
            {canViewCosts ? (
            <OpsDashPanel
              title="متوسط تكلفة الإنتاج للفترة"
              accent="production"
              className={cn("overflow-hidden shadow-none", NESTED_TILE)}
              action={
                <span className="text-xs font-medium text-[var(--color-text-muted)] dark:text-muted-foreground">{periodCostLabel}</span>
              }
            >
                <div className="grid grid-cols-1 gap-2">
                  <div className="space-y-1 rounded-lg p-3" style={{ background: "rgb(var(--color-primary) / 0.12)" }}>
                    <p className="text-xs font-medium text-foreground">الفترة المحددة (من الفلاتر)</p>
                    {periodCostStats.quantity > 0 ? (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          {arDecimal(periodCostStats.unitCost)} ج.م/وحدة
                        </p>
                        <p className="text-xs text-muted-foreground">
                          إجمالي {arNumber(periodCostStats.totalCost)} ج.م
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {arNumber(periodCostStats.quantity)} وحدة منتجة
                        </p>
                        <p className="text-xs text-muted-foreground">
                          مباشر {formatCost(periodCostStats.quantity > 0 ? periodCostStats.directCost / periodCostStats.quantity : 0)} / غ.مباشر{" "}
                          {formatCost(periodCostStats.quantity > 0 ? periodCostStats.indirectCost / periodCostStats.quantity : 0)} ج.م للوحدة
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">لا يوجد إنتاج في الفترة المحددة</p>
                    )}
                  </div>
                  {data.monthlyCostColumns.map((column) => (
                    <div key={column.id} className="space-y-1 rounded-lg p-3" style={{ background: column.bgColor }}>
                      <p className="text-xs font-medium text-foreground">{column.title}</p>
                      <p className="text-sm font-medium text-foreground">
                        {typeof column.unitCost === "number" ? `${arDecimal(column.unitCost)} ج.م/وحدة` : column.unitCost}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {typeof column.total === "number" ? `إجمالي ${arNumber(column.total)} ج.م` : column.total}
                      </p>
                      {column.units !== "" && (
                        <p className="text-xs text-muted-foreground">
                          {typeof column.units === "number" ? `${arNumber(column.units)} وحدة` : column.units}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
            </OpsDashPanel>
            ) : null}
          </div>
        )}
      </OpsDashPanel>

      {canViewCosts ? (
      <OpsDashPanel title="التكاليف والمواد" accent="production">
        {isLoading || !sectionReady.costBreakdown || !sectionReady.rawMaterials || !sectionReady.summary || !data ? (
          <SectionSkeleton rows={10} height={24} />
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text)] dark:text-foreground">تفصيل تكلفة المنتج</h3>
              <p className="mb-3 text-xs font-medium text-[var(--color-text-muted)] dark:text-muted-foreground">يتم الحساب تلقائياً عند تغيير أي عنصر</p>
              <div className="erp-table-wrap overflow-x-auto">
                <table className="erp-table w-full min-w-[700px] text-right">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">عنصر التكلفة</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costBreakdownRows.map((row) => {
                      if (row.type === "section") {
                        return (
                          <tr key={row.id}>
                            <td colSpan={2} className="bg-muted/60 px-3 py-2 text-xs font-medium text-foreground">
                              {row.label}
                            </td>
                          </tr>
                        );
                      }
                      if (row.type === "total") {
                        return (
                          <tr key={row.id}>
                            <td colSpan={2} className="px-3 py-3">
                              <div className="space-y-1 rounded-lg bg-primary/10 p-3">
                                <p className="text-sm font-medium text-primary">{row.label}</p>
                                <p className="text-xs text-primary/90">{row.subLabel}</p>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={row.id} className="border-b border-border/80">
                          <td className="px-3 py-2 text-sm text-foreground">{row.label}</td>
                          <td className="border-border/80 px-3 py-2 text-left text-sm text-foreground">{row.value}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <IndirectCostCards items={indirectCostItems} className="mt-3" />

              <div className="mt-3 rounded-lg bg-primary/10 p-3">
                <p className="text-sm font-medium text-primary">إجمالي التكلفة المحسوبة (/قطعة)</p>
                <p className="text-xl font-medium text-primary">{data.grandTotal}</p>
                <p className="mt-1 text-xs text-primary/90">
                  المعادلة: تكلفة الوحدة الصينية + المواد الخام + العلبة الداخلية + نصيب الكرتونة + التكاليف الصناعية المباشرة + التكاليف الصناعية غير المباشرة (بدون تحويل سعر اليوان).
                </p>
              </div>
            </div>

            {canViewBom ? (
              <p className="mt-4 text-xs text-muted-foreground">
                لإدارة مواد المنتج استخدم تبويب قائمة المواد (BOM) أعلاه.
              </p>
            ) : null}

            <div className="mt-6 border-t border-border pt-6">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)] dark:text-foreground">ملخص التكلفة والتوقعات</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                {data.costSummaryItems.map((item) => {
                  const value =
                    item.id === "cs1" && periodCostStats.quantity > 0
                      ? `${formatCost(periodCostStats.unitCost)} ج.م/وحدة`
                      : item.id === "cs2" && periodCostStats.quantity > 0
                        ? `${formatCost(periodCostStats.totalCost)} ج.م`
                        : item.value;
                  const subtitle =
                    item.id === "cs1" && periodCostStats.quantity > 0
                      ? `للفترة ${periodCostLabel}`
                      : item.subtitle;
                  return (
                  <div key={item.id} className="rounded-lg border border-border p-3" style={{ background: item.bgColor }}>
                    <p className="text-xs text-muted-foreground">{item.title}</p>
                    <p className="text-lg font-medium text-foreground">{value}</p>
                    {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                  </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </OpsDashPanel>
      ) : null}

      <OpsDashPanel title="الإنتاج والرسوم البيانية" accent="production">
        {isLoading || !sectionReady.lineTable || !sectionReady.costTrend || !sectionReady.prodLog || !data ? (
          <SectionSkeleton rows={6} height={26} />
        ) : (
          <div className="space-y-8">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)] dark:text-foreground">
                {canViewCosts ? "تكلفة الإنتاج حسب خط الإنتاج" : "الإنتاج حسب خط الإنتاج"}
              </h3>
              {filteredProductionByLine.length === 0 ? (
                <div className="py-10 text-center">
                  <Table2 size={32} className="mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">لا توجد بيانات متاحة</p>
                </div>
              ) : (
                <div className="erp-table-wrap overflow-x-auto">
                  <table className="erp-table w-full min-w-[720px] text-right">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">خط الإنتاج</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الكمية المنتجة</th>
                        {canViewCosts ? (
                          <>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">إجمالي التكلفة</th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">تكلفة الوحدة</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProductionByLine.map((row) => (
                        <tr key={row.id} className="border-b border-border/80">
                          <td className="px-3 py-2 text-sm text-foreground">{row.lineName}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{arNumber(row.producedQty)}</td>
                          {canViewCosts ? (
                            <>
                              <td className="px-3 py-2 text-sm text-foreground">{arDecimal(row.totalCost)} ج.م</td>
                              <td className="px-3 py-2">
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "font-medium",
                                    row.isBest && "border border-primary bg-primary/10 text-primary",
                                  )}
                                >
                                  {arDecimal(row.unitCost)} ج.م
                                </Badge>
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canViewCosts ? (
            <div className="border-t border-border pt-6">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)] dark:text-foreground">اتجاه تكلفة الوحدة</h3>
              {filteredUnitCostTrend.length === 0 ? (
                <div className="py-10 text-center">
                  <LineChart size={32} className="mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">لا توجد بيانات تكلفة ضمن الفلاتر الحالية</p>
                </div>
              ) : (
                <div className="h-[300px] w-full" dir="ltr">
                  <ResponsiveContainer>
                    <BarChart data={filteredUnitCostTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={CHART_TICK_PROPS}
                        tickFormatter={(value) => String(value).slice(5)}
                      />
                      <YAxis domain={[0, 32]} tick={CHART_TICK_PROPS} />
                      <Tooltip
                        formatter={(value: number) => [`${arDecimal(value)} ج.م`, "تكلفة الوحدة"]}
                        labelFormatter={(label: string) => `التاريخ: ${label}`}
                        contentStyle={CHART_TOOLTIP_STYLE}
                      />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            ) : null}

            <div className="border-t border-border pt-6">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)] dark:text-foreground">سجل الإنتاج</h3>
              {filteredProductionLog.length === 0 ? (
                <div className="py-10 text-center">
                  <BarChart3 size={32} className="mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">لا توجد بيانات إنتاج ضمن الفلاتر الحالية</p>
                </div>
              ) : (
                <div className="h-[320px] w-full" dir="ltr">
                  <ResponsiveContainer>
                    <BarChart data={filteredProductionLog} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={CHART_TICK_PROPS} tickFormatter={(value) => String(value).slice(5)} />
                      <YAxis tick={CHART_TICK_PROPS} />
                      <Tooltip
                        formatter={(value: number, name: string) => [`${arNumber(value)}`, name]}
                        labelFormatter={(label: string) => `التاريخ: ${label}`}
                        contentStyle={CHART_TOOLTIP_STYLE}
                      />
                      <Legend
                        verticalAlign="bottom"
                        formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                      />
                      <Bar dataKey="production" name="الإنتاج" radius={[4, 4, 0, 0]}>
                        {filteredProductionLog.map((entry) => (
                          <Cell
                            key={`production-${entry.date}`}
                            fill={entry.specialBarColor ?? "hsl(var(--primary))"}
                          />
                        ))}
                      </Bar>
                      <Bar dataKey="waste" name="الهالك" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="التقارير التفصيلية" accent="production">
        {isLoading || !sectionReady.reports || !data ? (
          <SectionSkeleton rows={9} height={24} />
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                {arNumber(filteredUniqueDays)} يوم عمل مسجل
              </span>
            </div>

            {paginatedReports.length === 0 ? (
              <div className="py-10 text-center">
                <FileText size={32} className="mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">لا توجد بيانات تقارير</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table w-full min-w-[860px] text-right">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">التاريخ</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">خط الإنتاج</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">المشرف</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الكمية</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الهالك</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">عمال</th>
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">ساعات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReports.map((row) => (
                      <tr key={row.id} className="border-b border-border/80">
                        <td className="px-3 py-2 text-sm text-foreground">{row.date}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{row.line}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{row.employee}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="font-medium">
                            {arNumber(row.quantity)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-foreground">{arNumber(row.waste)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{arNumber(row.workers)}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{arNumber(row.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                صفحة {arNumber(page)} من {arNumber(totalPages)}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                >
                  السابق
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                >
                  التالي
                </Button>
              </div>
            </div>
          </div>
        )}
      </OpsDashPanel>
      </>
      )}
    </ModuleOpsPageShell>
  );
};
