import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
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
import * as XLSX from "xlsx";
import { useProductDetail } from "./hooks/useProductDetail";
import { IndirectCostCards } from "@/src/components/erp/IndirectCostCards";
import { productMaterialService } from "../../production/services/productMaterialService";
import { rawMaterialService } from "../../inventory/services/rawMaterialService";
import type { RawMaterial } from "../../inventory/types";
import type { ProductMaterial } from "../../../types";
import { useGlobalModalManager } from "../../../components/modal-manager/GlobalModalManager";
import { MODAL_KEYS } from "../../../components/modal-manager/modalKeys";
import type { IndirectCostItem } from "@/src/components/erp/IndirectCostCards";
import { usePermission } from "../../../utils/permissions";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DetailCollapsibleSection,
  FIELD_ON_PANEL,
  NESTED_TILE,
  PAGE_BG,
  SectionSkeleton,
  SURFACE_CARD,
} from "@/src/components/erp/DetailPageChrome";

const queryClient = new QueryClient();

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
const parseMoneyValue = (value?: string) => {
  if (!value) return 0;
  const westernizedDigits = value.replace(/[٠-٩]/g, (digit) => String("ظ ١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const normalizedSeparators = westernizedDigits
    .replace(/ظ¬/g, "") // Arabic thousands separator
    .replace(/ظ«/g, ".") // Arabic decimal separator
    .replace(/طŒ/g, ",");
  const cleaned = normalizedSeparators.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
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
};

const renderIcon = (name: string, size = 16, className = "") => {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
};

type ToneKey = "teal" | "blue" | "coral" | "amber" | "red" | "gray";

const TONE_ICON_WRAP: Record<ToneKey, string> = {
  teal: "bg-primary/15 text-primary",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  coral: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  red: "bg-destructive/15 text-destructive",
  gray: "bg-muted text-muted-foreground",
};

const TONE_VALUE_TEXT: Record<ToneKey, string> = {
  teal: "text-primary",
  blue: "text-blue-700 dark:text-blue-400",
  coral: "text-orange-700 dark:text-orange-400",
  amber: "text-amber-800 dark:text-amber-400",
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

const downloadExcel = (rows: Array<Array<string | number>>, sheetName: string, fileName: string) => {
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

const ProductDetailsContent: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const canManageMaterials = can("costs.manage") || can("products.edit");
  const { data, isLoading, isError } = useProductDetail(id);
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

  const [activePeriod, setActivePeriod] = useState("all");
  const [lineFilter, setLineFilter] = useState("كل الخطوط");
  const [supervisorFilter, setSupervisorFilter] = useState("كل المشرفين");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<RawMaterial[]>([]);
  const [productMaterials, setProductMaterials] = useState<ProductMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<ProductMaterial | null>(null);
  const [materialForm, setMaterialForm] = useState({
    materialId: "",
    quantityUsed: 0,
    unitCost: 0,
  });

  const loadRawMaterials = useCallback(async () => {
    try {
      const rows = await rawMaterialService.getAll();
      setRawMaterialOptions(rows.filter((row) => row.isActive !== false));
    } catch {
      setRawMaterialOptions([]);
    }
  }, []);

  const loadProductMaterials = useCallback(async () => {
    if (!id) {
      setProductMaterials([]);
      return;
    }
    setMaterialsLoading(true);
    try {
      const rows = await productMaterialService.getByProduct(id);
      setProductMaterials(rows);
    } catch {
      setProductMaterials([]);
    } finally {
      setMaterialsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadRawMaterials();
  }, [loadRawMaterials]);

  useEffect(() => {
    void loadProductMaterials();
  }, [loadProductMaterials]);

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

  const filteredProductionByLine = useMemo(() => {
    const lines = data?.productionByLine ?? [];
    if (lineFilter === "كل الخطوط") {
      return lines;
    }
    return lines.filter((line) => line.lineName === lineFilter);
  }, [data?.productionByLine, lineFilter]);

  const pageSize = 10;
  const filteredUniqueDays = useMemo(() => new Set(filteredReports.map((row) => row.date)).size, [filteredReports]);
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const rawMaterialCost = useMemo(
    () => productMaterials.reduce((sum, row) => sum + Number(row.quantityUsed || 0) * Number(row.unitCost || 0), 0),
    [productMaterials],
  );
  const displayCostBreakdownRows = useMemo(() => {
    if (!data) return [];
    return data.costBreakdownRows.map((row) => {
      if (row.id !== "r3") return row;
      return {
        ...row,
        label: `تكلفة المواد الخام (${productMaterials.length} مادة)`,
        value: `${arDecimal(rawMaterialCost)} ج.م`,
      };
    });
  }, [data, productMaterials.length, rawMaterialCost]);
  const displayGrandTotal = useMemo(() => {
    if (!data) return "0.00";
    const rowValueById = new Map(
      displayCostBreakdownRows.map((row) => [row.id, parseMoneyValue(row.value)]),
    );
    const nextTotal =
      Number(rowValueById.get("r1") || 0)
      + Number(rowValueById.get("r3") || 0)
      + Number(rowValueById.get("r4") || 0)
      + Number(rowValueById.get("r5") || 0)
      + Number(rowValueById.get("r6") || 0)
      + Number(rowValueById.get("r7") || 0);
    return arDecimal(Number.isFinite(nextTotal) ? Math.max(0, nextTotal) : 0);
  }, [data, displayCostBreakdownRows]);
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

  const openAddMaterialModal = useCallback(() => {
    if (!canManageMaterials) return;
    setMaterialError(null);
    setEditingMaterial(null);
    if (rawMaterialOptions.length === 0) {
      const opened = openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, {
        mode: "create",
        onSaved: async () => {
          await loadRawMaterials();
          setMaterialForm({ materialId: "", quantityUsed: 0, unitCost: 0 });
          setEditingMaterial(null);
          setShowMaterialModal(true);
        },
      });
      if (opened) return;
    }
    setMaterialForm({ materialId: "", quantityUsed: 0, unitCost: 0 });
    setShowMaterialModal(true);
  }, [rawMaterialOptions.length, openModal, loadRawMaterials, canManageMaterials]);

  const openEditMaterialModal = useCallback((row: ProductMaterial) => {
    if (!canManageMaterials) return;
    setMaterialError(null);
    setEditingMaterial(row);
    setMaterialForm({
      materialId: row.materialId || "",
      quantityUsed: Number(row.quantityUsed || 0),
      unitCost: Number(row.unitCost || 0),
    });
    setShowMaterialModal(true);
  }, [canManageMaterials]);

  const closeMaterialModal = useCallback(() => {
    if (savingMaterial) return;
    setShowMaterialModal(false);
    setMaterialError(null);
  }, [savingMaterial]);

  const handleSaveMaterial = useCallback(async () => {
    if (!id || savingMaterial) return;
    const selected = rawMaterialOptions.find((row) => row.id === materialForm.materialId);
    if (!selected) {
      setMaterialError("اختر مادة خام صحيحة من القائمة.");
      return;
    }
    if (materialForm.quantityUsed <= 0) {
      setMaterialError("أدخل كمية أكبر من صفر.");
      return;
    }
    if (materialForm.unitCost < 0) {
      setMaterialError("سعر الوحدة لا يمكن أن يكون أقل من صفر.");
      return;
    }
    setSavingMaterial(true);
    setMaterialError(null);
    try {
      const payload = {
        materialId: selected.id,
        materialName: selected.name,
        quantityUsed: Number(materialForm.quantityUsed || 0),
        unitCost: Number(materialForm.unitCost || 0),
      };
      if (editingMaterial?.id) {
        await productMaterialService.update(editingMaterial.id, payload);
      } else {
        await productMaterialService.create({
          productId: id,
          ...payload,
        });
      }
      await loadProductMaterials();
      setShowMaterialModal(false);
      setEditingMaterial(null);
      setMaterialForm({ materialId: "", quantityUsed: 0, unitCost: 0 });
    } catch {
      setMaterialError("تعذر حفظ المادة الخام. حاول مرة أخرى.");
    } finally {
      setSavingMaterial(false);
    }
  }, [id, savingMaterial, rawMaterialOptions, materialForm, loadProductMaterials, editingMaterial]);

  const handleDeleteMaterial = useCallback(async (row: ProductMaterial) => {
    if (!canManageMaterials || !row.id) return;
    const ok = window.confirm(`هل تريد حذف المادة الخام "${row.materialName}"طں`);
    if (!ok) return;
    try {
      await productMaterialService.delete(row.id);
      await loadProductMaterials();
    } catch {
      setMaterialError("تعذر حذف المادة الخام. حاول مرة أخرى.");
    }
  }, [canManageMaterials, loadProductMaterials]);

  const onExport = () => {
    if (!data) return;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return;
    const rowsHtml = filteredReports
      .map(
        (row) => `
          <tr>
            <td>${row.date}</td>
            <td>${row.line}</td>
            <td>${row.employee}</td>
            <td>${arNumber(row.quantity)}</td>
            <td>${arNumber(row.waste)}</td>
            <td>${arNumber(row.workers)}</td>
            <td>${arNumber(row.hours)}</td>
          </tr>
        `,
      )
      .join("");

    printWindow.document.write(`
      <!doctype html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8"/>
          <title>تقرير المنتج ${data.id}</title>
          <style>
            body { font-family: Cairo, sans-serif; background:#fff; color:#252521; padding:20px; }
            .card { border:0.5px solid rgba(0,0,0,0.12); border-radius:12px; padding:16px 18px; margin-bottom:12px; }
            .row { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
            table { width:100%; border-collapse:collapse; margin-top:8px; }
            th, td { border:0.5px solid rgba(0,0,0,0.12); padding:8px; text-align:right; font-weight:400; font-size:12px; }
            th { background:#F1EFE8; font-weight:500; }
            .muted { color:#666; font-size:12px; }
            .title { font-size:18px; font-weight:500; margin:0; }
          </style>
        </head>
        <body>
          <div class="card">
            <p class="muted">الكتالوج › المنتجات › ${data.id}</p>
            <h1 class="title">${data.header.name}</h1>
            <div class="row muted">
              <span>الكود: ${data.header.code}</span>
              <span>الفئة: ${data.header.category}</span>
              <span>الفترة: ${fromDate || "-"} إلى ${toDate || "-"}</span>
            </div>
          </div>
          <div class="card">
            <div class="row">
              ${data.kpis
                .map(
                  (kpi) =>
                    `<div><div class="muted">${kpi.label}</div><div style="font-weight:500">${typeof kpi.value === "number" ? arNumber(kpi.value) : kpi.value} ${kpi.unit}</div></div>`,
                )
                .join("")}
            </div>
          </div>
          <div class="card">
            <h2 style="font-size:14px;font-weight:500;margin:0 0 8px 0;">التقارير التفصيلية</h2>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th><th>خط الإنتاج</th><th>المشرف</th><th>الكمية</th><th>الهالك</th><th>عمال</th><th>ساعات</th>
                </tr>
              </thead>
              <tbody>${rowsHtml || `<tr><td colspan="7">لا توجد بيانات بعد الفلترة</td></tr>`}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const onExcel = () => {
    if (!data) return;
    downloadExcel(
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
    navigate("/products", { state: { editProductId: data.id } });
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
      <div dir="rtl" className={cn("min-h-screen space-y-4 p-4 md:p-6", PAGE_BG)}>
        <PageHeader title="تفاصيل المنتج" backAction={{ to: "/products", label: "رجوع" }} />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">تعذر تحميل بيانات المنتج. حاول مرة أخرى.</CardContent>
        </Card>
      </div>
    );
  }

  const pageHeaderExtra =
    data && !isLoading && sectionReady.header ? (
      <Badge variant={data.header.status === "out_of_stock" ? "destructive" : "default"} className="shrink-0">
        {data.header.status === "out_of_stock" ? "نفد المخزون" : "متوفر"}
      </Badge>
    ) : null;

  return (
    <div dir="rtl" className={cn("min-h-screen space-y-4 p-4 md:p-6", PAGE_BG)}>
      <div className={cn("sticky top-0 z-10 space-y-3 pb-2 pt-0 backdrop-blur-sm", PAGE_BG)}>
        {isLoading || !sectionReady.header || !data ? (
          <>
            <PageHeader title="تفاصيل المنتج" backAction={{ to: "/products", label: "رجوع" }} loading={isLoading} />
            <Card className={SURFACE_CARD}>
              <SectionSkeleton rows={2} height={20} />
            </Card>
          </>
        ) : (
          <PageHeader
            title={data.header.name}
            subtitle={`${data.header.breadcrumb} آ· الكود: ${data.header.code} آ· الفئة: ${data.header.category}`}
            icon="package"
            backAction={{ to: "/products", label: "رجوع" }}
            primaryAction={{ label: "تعديل المنتج", icon: "edit", onClick: onEditProduct }}
            moreActions={[
              { label: "تصدير", icon: "print", onClick: onExport, group: "تصدير" },
              { label: "تقارير Excel", icon: "file_download", onClick: onExcel, group: "تصدير" },
            ]}
            extra={pageHeaderExtra}
          />
        )}

        <Card className={SURFACE_CARD}>
          {isLoading || !sectionReady.filters || !data ? (
            <SectionSkeleton rows={2} height={38} />
          ) : (
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200/90 bg-slate-100/80 p-1 dark:border-border dark:bg-muted/40">
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
                <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">من</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className={cn("h-9 rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                />
                <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">إلى</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className={cn("h-9 rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                />
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <DetailCollapsibleSection title="مؤشرات الأداء" defaultOpen>
        {isLoading || !sectionReady.kpis || !data ? (
          <SectionSkeleton rows={3} height={68} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {data.kpis.map((kpi) => {
              const wrap = TONE_ICON_WRAP[kpi.tone];
              const value = typeof kpi.value === "number" ? arNumber(kpi.value) : kpi.value;
              return (
                <div key={kpi.id} className={cn("space-y-2 p-3", NESTED_TILE)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-muted-foreground">{kpi.label}</p>
                    <div className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg", wrap)}>
                      {renderIcon(kpi.icon, 16)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[22px] font-semibold leading-none text-slate-900 dark:text-foreground">{value}</p>
                    <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{kpi.unit}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DetailCollapsibleSection>

      <DetailCollapsibleSection title="الأداء والتكلفة الشهرية" defaultOpen>
        {isLoading || !sectionReady.performance || !data ? (
          <SectionSkeleton rows={4} height={62} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:col-span-2">
              {data.performanceCards.map((item) => {
                const valueCls = TONE_VALUE_TEXT[item.tone];
                return (
                  <div key={item.id} className={cn("space-y-2 p-3", NESTED_TILE)}>
                    <p className="text-xs font-medium text-slate-600 dark:text-muted-foreground">{item.label}</p>
                    <p className={cn("text-lg font-medium", valueCls)}>{item.value}</p>
                  </div>
                );
              })}
            </div>
            <Card className={cn("overflow-hidden p-0 shadow-none", NESTED_TILE)}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">متوسط تكلفة الإنتاج الشهري</h3>
                  <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">{data.monthlyCostDate}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
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
              </CardContent>
            </Card>
          </div>
        )}
      </DetailCollapsibleSection>

      <DetailCollapsibleSection title="التكاليف والمواد" defaultOpen>
        {isLoading || !sectionReady.costBreakdown || !sectionReady.rawMaterials || !sectionReady.summary || !data ? (
          <SectionSkeleton rows={10} height={24} />
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">تفصيل تكلفة المنتج</h3>
              <p className="mb-3 text-xs font-medium text-slate-600 dark:text-muted-foreground">يتم الحساب تلقائياً عند تغيير أي عنصر</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-right">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-xs font-medium text-muted-foreground">عنصر التكلفة</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayCostBreakdownRows.map((row) => {
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
                <p className="text-xl font-medium text-primary">{displayGrandTotal} ج.م</p>
                <p className="mt-1 text-xs text-primary/90">
                  المعادلة: تكلفة الوحدة الصينية + المواد الخام + العلبة الداخلية + نصيب الكرتونة + التكاليف الصناعية المباشرة + التكاليف الصناعية غير المباشرة (بدون تحويل سعر اليوان).
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">المواد الخام المستخدمة</h3>
                {canManageMaterials && (
                  <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={openAddMaterialModal}>
                    <Plus size={16} />
                    إضافة مادة
                  </Button>
                )}
              </div>
              {materialsLoading ? (
                <SectionSkeleton rows={3} height={32} />
              ) : productMaterials.length === 0 ? (
                <div className="py-8 text-center">
                  <Boxes size={32} className="mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">{data.rawMaterialsEmptyMessage}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[660px] text-right">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">المادة الخام</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الكمية</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">سعر الوحدة</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الإجمالي</th>
                        {canManageMaterials && (
                          <th className="px-3 py-2 text-xs font-medium text-muted-foreground">إجراء</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {productMaterials.map((row) => (
                        <tr key={row.id || `${row.materialId}-${row.materialName}`} className="border-b border-border/80">
                          <td className="px-3 py-2 text-sm text-foreground">{row.materialName}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{arDecimal(Number(row.quantityUsed || 0), 2)}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{arDecimal(Number(row.unitCost || 0), 2)} ج.م</td>
                          <td className="px-3 py-2 text-sm font-medium text-foreground">
                            {arDecimal(Number(row.quantityUsed || 0) * Number(row.unitCost || 0), 2)} ج.م
                          </td>
                          {canManageMaterials && (
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => openEditMaterialModal(row)}
                                  title="تعديل"
                                >
                                  <Pencil size={15} />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => void handleDeleteMaterial(row)}
                                  title="حذف"
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-foreground">ملخص التكلفة والتوقعات</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                {data.costSummaryItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3" style={{ background: item.bgColor }}>
                    <p className="text-xs text-muted-foreground">{item.title}</p>
                    <p className="text-lg font-medium text-foreground">{item.value}</p>
                    {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DetailCollapsibleSection>

      {showMaterialModal && canManageMaterials && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeMaterialModal}
        >
          <Card
            className={cn(SURFACE_CARD, "w-full max-w-md shadow-2xl")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-border">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
                {editingMaterial ? "تعديل مادة خام" : "إضافة مادة خام"}
              </h3>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={closeMaterialModal}>
                <X size={16} />
              </Button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {materialError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{materialError}</div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">المادة الخام</label>
                <select
                  value={materialForm.materialId}
                  onChange={(event) => setMaterialForm((prev) => ({ ...prev, materialId: event.target.value }))}
                  className={cn("h-10 w-full rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                >
                  <option value="">اختر مادة خام</option>
                  {rawMaterialOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} {row.code ? `(${row.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الكمية المستخدمة</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.quantityUsed || ""}
                    onChange={(event) =>
                      setMaterialForm((prev) => ({ ...prev, quantityUsed: Number(event.target.value || 0) }))
                    }
                    className={cn("h-10 w-full rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">سعر الوحدة (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.unitCost || ""}
                    onChange={(event) =>
                      setMaterialForm((prev) => ({ ...prev, unitCost: Number(event.target.value || 0) }))
                    }
                    className={cn("h-10 w-full rounded-md border px-3 text-sm text-foreground", FIELD_ON_PANEL)}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-border">
              <Button type="button" variant="outline" onClick={closeMaterialModal}>
                إلغاء
              </Button>
              <Button type="button" onClick={() => void handleSaveMaterial()} disabled={savingMaterial}>
                {savingMaterial ? <Loader2 size={15} className="animate-spin" /> : editingMaterial ? <Pencil size={15} /> : <Plus size={15} />}
                {editingMaterial ? "حفظ التعديل" : "حفظ المادة"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <DetailCollapsibleSection title="الإنتاج والرسوم البيانية" defaultOpen={false}>
        {isLoading || !sectionReady.lineTable || !sectionReady.costTrend || !sectionReady.prodLog || !data ? (
          <SectionSkeleton rows={6} height={26} />
        ) : (
          <div className="space-y-8">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-foreground">تكلفة الإنتاج حسب خط الإنتاج</h3>
              {filteredProductionByLine.length === 0 ? (
                <div className="py-10 text-center">
                  <Table2 size={32} className="mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">لا توجد بيانات متاحة</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-right">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">خط الإنتاج</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الكمية المنتجة</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">إجمالي التكلفة</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">تكلفة الوحدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProductionByLine.map((row) => (
                        <tr key={row.id} className="border-b border-border/80">
                          <td className="px-3 py-2 text-sm text-foreground">{row.lineName}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{arNumber(row.producedQty)}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-foreground">اتجاه تكلفة الوحدة</h3>
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

            <div className="border-t border-border pt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-foreground">سجل الإنتاج</h3>
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
      </DetailCollapsibleSection>

      <DetailCollapsibleSection title="التقارير التفصيلية" defaultOpen={false}>
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
                <table className="w-full min-w-[860px] text-right">
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
      </DetailCollapsibleSection>
    </div>
  );
};

export const ProductDetails: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ProductDetailsContent />
    </QueryClientProvider>
  );
};



