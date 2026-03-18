import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  CalendarDays,
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

const queryClient = new QueryClient();

const TOKENS = {
  pageBg: "#F5F5F5",
  cardBg: "#FFFFFF",
  border: "0.5px solid rgba(0,0,0,0.12)",
  teal: { base: "rgb(var(--color-primary))", bg: "rgb(var(--color-primary) / 0.12)", text: "rgb(var(--color-primary))" },
  blue: { base: "#185FA5", bg: "#E6F1FB", text: "#0C447C" },
  coral: { base: "#D85A30", bg: "#FAECE7", text: "#712B13" },
  amber: { base: "#BA7517", bg: "#FAEEDA", text: "#633806" },
  red: { base: "#A32D2D", bg: "#FCEBEB", text: "#791F1F" },
  gray: { base: "#888780", bg: "#F1EFE8", text: "#444441" },
};

const CARD_STYLE: React.CSSProperties = {
  border: TOKENS.border,
  borderRadius: 12,
  background: TOKENS.cardBg,
  boxShadow: "none",
};

const ELEMENT_STYLE: React.CSSProperties = { borderRadius: 8, border: TOKENS.border, boxShadow: "none" };

const arNumber = (value: number) => value.toLocaleString("ar-EG");
const arDecimal = (value: number, fractionDigits = 2) =>
  value.toLocaleString("ar-EG", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
const parseMoneyValue = (value?: string) => {
  if (!value) return 0;
  const westernizedDigits = value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const normalizedSeparators = westernizedDigits
    .replace(/٬/g, "") // Arabic thousands separator
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/،/g, ",");
  const cleaned = normalizedSeparators.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  const parsed = Number(match?.[0] ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const SKELETON_CARD = "animate-pulse bg-[#ECECEC]";

const ICON_MAP: Record<string, LucideIcon> = {
  upload: Upload,
  event: CalendarDays,
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

function SectionSkeleton({ rows = 4, height = 16 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-3 px-[18px] py-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className={SKELETON_CARD} style={{ ...ELEMENT_STYLE, height }} />
      ))}
    </div>
  );
}

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

const getTone = (tone: "teal" | "blue" | "coral" | "amber" | "red" | "gray") => {
  return TOKENS[tone];
};

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
  const navigate = useNavigate();
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
    const ok = window.confirm(`هل تريد حذف المادة الخام "${row.materialName}"؟`);
    if (!ok) return;
    try {
      await productMaterialService.delete(row.id);
      await loadProductMaterials();
    } catch {
      setMaterialError("تعذر حذف المادة الخام. حاول مرة أخرى.");
    }
  }, [canManageMaterials, loadProductMaterials]);

  const headerBadge = data?.header.status === "out_of_stock"
    ? { label: "نفد المخزون", bg: TOKENS.red.bg, text: TOKENS.red.text }
    : { label: "متوفر", bg: TOKENS.teal.bg, text: TOKENS.teal.text };

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
                  <th>التاريخ</th><th>خط الإنتاج</th><th>الموظف</th><th>الكمية</th><th>الهالك</th><th>عمال</th><th>ساعات</th>
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
        ["التاريخ", "خط الإنتاج", "الموظف", "الكمية", "الهالك", "عمال", "ساعات"],
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
      <div dir="rtl" className="p-4 md:p-6" style={{ background: TOKENS.pageBg, minHeight: "100vh" }}>
        <div style={CARD_STYLE} className="px-[18px] py-4 text-sm font-normal text-[#791F1F]">
          تعذر تحميل بيانات المنتج. حاول مرة أخرى.
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4 p-4 md:p-6" style={{ background: TOKENS.pageBg, minHeight: "100vh" }}>
      <section className="sticky top-0 z-10">
        <div style={CARD_STYLE}>
          {isLoading || !sectionReady.header || !data ? (
            <SectionSkeleton rows={3} height={18} />
          ) : (
            <div className="px-[18px] py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-normal text-[#7A7A74]">{data.header.breadcrumb}</p>
                  <h1 className="text-[18px] font-medium text-[#252521]">{data.header.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-normal text-[#7A7A74]">
                    <span>الكود: {data.header.code}</span>
                    <span>·</span>
                    <span>الفئة: {data.header.category}</span>
                    <span
                      className="inline-flex items-center px-2 py-1 text-xs font-medium"
                      style={{ ...ELEMENT_STYLE, background: headerBadge.bg, color: headerBadge.text, border: "none" }}
                    >
                      {headerBadge.label}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onExport}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-normal text-[#444441]"
                    style={ELEMENT_STYLE}
                  >
                    <Upload size={16} />
                    تصدير
                  </button>
                  <button
                    type="button"
                    onClick={onExcel}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-normal text-[#444441]"
                    style={ELEMENT_STYLE}
                  >
                    <CalendarDays size={16} />
                    تقارير Excel
                  </button>
                  <button
                    type="button"
                    onClick={onEditProduct}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white"
                    style={{ ...ELEMENT_STYLE, border: "none", background: TOKENS.teal.base }}
                  >
                    <Pencil size={16} />
                    تعديل المنتج
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.filters || !data ? (
          <SectionSkeleton rows={2} height={38} />
        ) : (
          <div className="flex flex-wrap items-center gap-3 px-[18px] py-4">
            <div className="flex flex-wrap gap-1 p-1" style={ELEMENT_STYLE}>
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => applyPeriod(option.key)}
                  className="px-3 py-1.5 text-xs font-medium"
                  style={
                    activePeriod === option.key
                      ? { borderRadius: 8, background: TOKENS.teal.base, color: "#FFFFFF" }
                      : { borderRadius: 8, color: "#444441" }
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>

            <select
              value={lineFilter}
              onChange={(event) => setLineFilter(event.target.value)}
              className="h-9 min-w-[140px] px-3 text-sm font-normal text-[#444441]"
              style={ELEMENT_STYLE}
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
              className="h-9 min-w-[160px] px-3 text-sm font-normal text-[#444441]"
              style={ELEMENT_STYLE}
            >
              {data.supervisorOptions.map((supervisor) => (
                <option key={supervisor} value={supervisor}>
                  {supervisor}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center gap-2 lg:mr-auto">
              <span className="text-xs font-normal text-[#7A7A74]">من</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-9 px-3 text-sm font-normal text-[#444441]"
                style={ELEMENT_STYLE}
              />
              <span className="text-xs font-normal text-[#7A7A74]">إلى</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-9 px-3 text-sm font-normal text-[#444441]"
                style={ELEMENT_STYLE}
              />
            </div>
          </div>
        )}
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.kpis || !data ? (
          <SectionSkeleton rows={3} height={68} />
        ) : (
          <div className="grid grid-cols-2 gap-3 px-[18px] py-4 md:grid-cols-3 lg:grid-cols-6">
            {data.kpis.map((kpi) => {
              const tone = getTone(kpi.tone);
              const value = typeof kpi.value === "number" ? arNumber(kpi.value) : kpi.value;
              return (
                <div key={kpi.id} className="space-y-2 p-3" style={ELEMENT_STYLE}>
                  <div className="flex items-start justify-between">
                    <p className="text-[11px] font-normal text-[#7A7A74]">{kpi.label}</p>
                    <div
                      className="flex h-[30px] w-[30px] items-center justify-center"
                      style={{ borderRadius: 8, background: tone.bg, color: tone.text }}
                    >
                      {renderIcon(kpi.icon, 16)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[22px] font-medium leading-none text-[#252521]">{value}</p>
                    <p className="text-[11px] font-normal text-[#7A7A74]">{kpi.unit}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2" style={CARD_STYLE}>
          {isLoading || !sectionReady.performance || !data ? (
            <SectionSkeleton rows={4} height={62} />
          ) : (
            <div className="grid grid-cols-1 gap-3 px-[18px] py-4 md:grid-cols-2">
              {data.performanceCards.map((item) => {
                const tone = getTone(item.tone);
                return (
                  <div key={item.id} className="space-y-2 p-3" style={ELEMENT_STYLE}>
                    <p className="text-xs font-normal text-[#7A7A74]">{item.label}</p>
                    <p className="text-lg font-medium" style={{ color: tone.text }}>
                      {item.value}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={CARD_STYLE}>
          {isLoading || !sectionReady.performance || !data ? (
            <SectionSkeleton rows={4} height={52} />
          ) : (
            <div className="h-full px-[18px] py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-[#252521]">متوسط تكلفة الإنتاج الشهري</h2>
                <span className="text-xs font-normal text-[#7A7A74]">{data.monthlyCostDate}</span>
              </div>
              <div className="grid h-[calc(100%-24px)] grid-cols-1 gap-2">
                {data.monthlyCostColumns.map((column) => (
                  <div key={column.id} className="space-y-1 p-3" style={{ borderRadius: 8, background: column.bgColor }}>
                    <p className="text-xs font-medium text-[#252521]">{column.title}</p>
                    <p className="text-sm font-medium text-[#252521]">
                      {typeof column.unitCost === "number" ? `${arDecimal(column.unitCost)} ج.م/وحدة` : column.unitCost}
                    </p>
                    <p className="text-xs font-normal text-[#444441]">
                      {typeof column.total === "number" ? `إجمالي ${arNumber(column.total)} ج.م` : column.total}
                    </p>
                    {column.units !== "" && (
                      <p className="text-xs font-normal text-[#444441]">
                        {typeof column.units === "number" ? `${arNumber(column.units)} وحدة` : column.units}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.costBreakdown || !data ? (
          <SectionSkeleton rows={10} height={24} />
        ) : (
          <div className="px-[18px] py-4">
            <h2 className="text-sm font-medium text-[#252521]">تفصيل تكلفة المنتج</h2>
            <p className="mb-3 text-xs font-normal text-[#7A7A74]">يتم الحساب تلقائياً عند تغيير أي عنصر</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-right">
                <thead>
                  <tr>
                    <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                      عنصر التكلفة
                    </th>
                    <th className="border-b px-3 py-2 text-left text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                      القيمة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayCostBreakdownRows.map((row) => {
                    if (row.type === "section") {
                      return (
                        <tr key={row.id}>
                          <td className="px-3 py-2 text-xs font-medium text-[#444441]" style={{ background: TOKENS.gray.bg }}>
                            {row.label}
                          </td>
                          <td className="px-3 py-2" style={{ background: TOKENS.gray.bg }} />
                        </tr>
                      );
                    }
                    if (row.type === "total") {
                      return (
                        <tr key={row.id}>
                          <td colSpan={2} className="px-3 py-3">
                            <div className="space-y-1 p-3" style={{ borderRadius: 8, background: TOKENS.teal.bg }}>
                              <p className="text-sm font-medium" style={{ color: TOKENS.teal.text }}>{row.label}</p>
                              <p className="text-xs font-normal" style={{ color: TOKENS.teal.text }}>{row.subLabel}</p>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.id}>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          {row.label}
                        </td>
                        <td className="border-b px-3 py-2 text-left text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          {row.value}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <IndirectCostCards items={indirectCostItems} className="mt-3" />

            <div className="mt-3 p-3" style={{ borderRadius: 8, background: TOKENS.teal.bg }}>
              <p className="text-sm font-medium" style={{ color: TOKENS.teal.text }}>إجمالي التكلفة المحسوبة (/قطعة)</p>
              <p className="text-xl font-medium" style={{ color: TOKENS.teal.text }}>{displayGrandTotal} ج.م</p>
              <p className="mt-1 text-xs font-normal" style={{ color: TOKENS.teal.text }}>
                المعادلة: تكلفة الوحدة الصينية + المواد الخام + العلبة الداخلية + نصيب الكرتونة + التكاليف الصناعية المباشرة + التكاليف الصناعية غير المباشرة (بدون سطر اليوان).
              </p>
            </div>
          </div>
        )}
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.rawMaterials || !data ? (
          <SectionSkeleton rows={3} height={38} />
        ) : (
          <div className="px-[18px] py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-[#252521]">المواد الخام المستخدمة</h2>
              {canManageMaterials && (
                <button
                  type="button"
                  onClick={openAddMaterialModal}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-normal"
                  style={{ ...ELEMENT_STYLE, color: TOKENS.teal.text, background: TOKENS.teal.bg }}
                >
                  <Plus size={16} />
                  إضافة مادة
                </button>
              )}
            </div>
            {materialsLoading ? (
              <SectionSkeleton rows={3} height={32} />
            ) : productMaterials.length === 0 ? (
              <div className="py-8 text-center">
                <Boxes size={32} className="mx-auto text-[#B4B2A9]" />
                <p className="mt-2 text-sm font-normal text-[#7A7A74]">{data.rawMaterialsEmptyMessage}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] text-right">
                  <thead>
                    <tr>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                        المادة الخام
                      </th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                        الكمية
                      </th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                        سعر الوحدة
                      </th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                        الإجمالي
                      </th>
                      {canManageMaterials && (
                        <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                          إجراء
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {productMaterials.map((row) => (
                      <tr key={row.id || `${row.materialId}-${row.materialName}`}>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          {row.materialName}
                        </td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          {arDecimal(Number(row.quantityUsed || 0), 2)}
                        </td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          {arDecimal(Number(row.unitCost || 0), 2)} ج.م
                        </td>
                        <td className="border-b px-3 py-2 text-sm font-medium text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          {arDecimal(Number(row.quantityUsed || 0) * Number(row.unitCost || 0), 2)} ج.م
                        </td>
                        {canManageMaterials && (
                          <td className="border-b px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditMaterialModal(row)}
                                className="inline-flex items-center justify-center rounded-md p-1 text-[#666] hover:bg-[#F1EFE8] hover:text-[#0C447C]"
                                title="تعديل"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMaterial(row)}
                                className="inline-flex items-center justify-center rounded-md p-1 text-[#666] hover:bg-[#FCEBEB] hover:text-[#A32D2D]"
                                title="حذف"
                              >
                                <Trash2 size={15} />
                              </button>
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
        )}
      </section>

      {showMaterialModal && canManageMaterials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={closeMaterialModal}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" style={ELEMENT_STYLE} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
              <h3 className="text-sm font-medium text-[#252521]">{editingMaterial ? "تعديل مادة خام" : "إضافة مادة خام"}</h3>
              <button
                type="button"
                onClick={closeMaterialModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#7A7A74] hover:bg-[#F1EFE8]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {materialError && (
                <div className="rounded-md bg-[#FCEBEB] px-3 py-2 text-xs font-medium text-[#791F1F]">{materialError}</div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#444441]">المادة الخام</label>
                <select
                  value={materialForm.materialId}
                  onChange={(event) => setMaterialForm((prev) => ({ ...prev, materialId: event.target.value }))}
                  className="h-10 w-full rounded-md px-3 text-sm font-normal text-[#252521]"
                  style={ELEMENT_STYLE}
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
                  <label className="text-xs font-medium text-[#444441]">الكمية المستخدمة</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.quantityUsed || ""}
                    onChange={(event) =>
                      setMaterialForm((prev) => ({ ...prev, quantityUsed: Number(event.target.value || 0) }))
                    }
                    className="h-10 w-full rounded-md px-3 text-sm font-normal text-[#252521]"
                    style={ELEMENT_STYLE}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#444441]">سعر الوحدة (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={materialForm.unitCost || ""}
                    onChange={(event) =>
                      setMaterialForm((prev) => ({ ...prev, unitCost: Number(event.target.value || 0) }))
                    }
                    className="h-10 w-full rounded-md px-3 text-sm font-normal text-[#252521]"
                    style={ELEMENT_STYLE}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
              <button
                type="button"
                onClick={closeMaterialModal}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-normal text-[#444441]"
                style={ELEMENT_STYLE}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleSaveMaterial()}
                disabled={savingMaterial}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                style={{ border: "none", borderRadius: 8, background: TOKENS.teal.base }}
              >
                {savingMaterial ? <Loader2 size={15} className="animate-spin" /> : editingMaterial ? <Pencil size={15} /> : <Plus size={15} />}
                {editingMaterial ? "حفظ التعديل" : "حفظ المادة"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.summary || !data ? (
          <SectionSkeleton rows={4} height={50} />
        ) : (
          <div className="px-[18px] py-4">
            <h2 className="mb-3 text-sm font-medium text-[#252521]">ملخص التكلفة والتوقعات</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {data.costSummaryItems.map((item) => (
                <div key={item.id} className="p-3" style={{ ...ELEMENT_STYLE, background: item.bgColor }}>
                  <p className="text-xs font-normal text-[#7A7A74]">{item.title}</p>
                  <p className="text-lg font-medium text-[#252521]">{item.value}</p>
                  {item.subtitle && <p className="text-xs font-normal text-[#7A7A74]">{item.subtitle}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.lineTable || !data ? (
          <SectionSkeleton rows={6} height={26} />
        ) : (
          <div className="px-[18px] py-4">
            <h2 className="mb-3 text-sm font-medium text-[#252521]">تكلفة الإنتاج حسب خط الإنتاج</h2>
            {filteredProductionByLine.length === 0 ? (
              <div className="py-10 text-center">
                <Table2 size={32} className="mx-auto text-[#B4B2A9]" />
                <p className="mt-2 text-sm font-normal text-[#7A7A74]">لا توجد بيانات متاحة</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-right">
                  <thead>
                    <tr>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>خط الإنتاج</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>الكمية المنتجة</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>إجمالي التكلفة</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>تكلفة الوحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductionByLine.map((row) => (
                      <tr key={row.id}>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{row.lineName}</td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{arNumber(row.producedQty)}</td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{arDecimal(row.totalCost)} ج.م</td>
                        <td className="border-b px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          <span
                            className="inline-flex px-2 py-1 text-xs font-medium"
                            style={{
                              borderRadius: 8,
                              background: TOKENS.teal.bg,
                              color: TOKENS.teal.text,
                              border: row.isBest ? `1px solid ${TOKENS.teal.base}` : "none",
                            }}
                          >
                            {arDecimal(row.unitCost)} ج.م
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.costTrend || !data ? (
          <SectionSkeleton rows={1} height={290} />
        ) : (
          <div className="px-[18px] py-4">
            <h2 className="mb-3 text-sm font-medium text-[#252521]">اتجاه تكلفة الوحدة</h2>
            {filteredUnitCostTrend.length === 0 ? (
              <div className="py-10 text-center">
                <LineChart size={32} className="mx-auto text-[#B4B2A9]" />
                <p className="mt-2 text-sm font-normal text-[#7A7A74]">لا توجد بيانات تكلفة ضمن الفلاتر الحالية</p>
              </div>
            ) : (
              <div style={{ width: "100%", height: 300 }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={filteredUnitCostTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E5" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#777" }}
                      tickFormatter={(value) => String(value).slice(5)}
                    />
                    <YAxis domain={[0, 32]} tick={{ fontSize: 11, fill: "#777" }} />
                    <Tooltip
                      formatter={(value: number) => [`${arDecimal(value)} ج.م`, "تكلفة الوحدة"]}
                      labelFormatter={(label: string) => `التاريخ: ${label}`}
                      contentStyle={{ borderRadius: 8, border: TOKENS.border, boxShadow: "none" }}
                    />
                    <Bar dataKey="value" fill="#7F77DD" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.prodLog || !data ? (
          <SectionSkeleton rows={1} height={320} />
        ) : (
          <div className="px-[18px] py-4">
            <h2 className="mb-3 text-sm font-medium text-[#252521]">سجل الإنتاج</h2>
            {filteredProductionLog.length === 0 ? (
              <div className="py-10 text-center">
                <BarChart3 size={32} className="mx-auto text-[#B4B2A9]" />
                <p className="mt-2 text-sm font-normal text-[#7A7A74]">لا توجد بيانات إنتاج ضمن الفلاتر الحالية</p>
              </div>
            ) : (
              <div style={{ width: "100%", height: 320 }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={filteredProductionLog} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E5" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#777" }} tickFormatter={(value) => String(value).slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: "#777" }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [`${arNumber(value)}`, name]}
                      labelFormatter={(label: string) => `التاريخ: ${label}`}
                      contentStyle={{ borderRadius: 8, border: TOKENS.border, boxShadow: "none" }}
                    />
                    <Legend verticalAlign="bottom" formatter={(value) => <span style={{ color: "#444441", fontSize: 12 }}>{value}</span>} />
                    <Bar dataKey="production" name="الإنتاج" radius={[4, 4, 0, 0]}>
                      {filteredProductionLog.map((entry) => (
                        <Cell key={`production-${entry.date}`} fill={entry.specialBarColor ?? "#378ADD"} />
                      ))}
                    </Bar>
                    <Bar dataKey="waste" name="الهالك" fill="#E24B4A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={CARD_STYLE}>
        {isLoading || !sectionReady.reports || !data ? (
          <SectionSkeleton rows={9} height={24} />
        ) : (
          <div className="px-[18px] py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-[#252521]">التقارير التفصيلية</h2>
              <span className="inline-flex px-2 py-1 text-xs font-normal text-[#7A7A74]" style={{ ...ELEMENT_STYLE, background: TOKENS.gray.bg }}>
                {arNumber(filteredUniqueDays)} يوم عمل مسجل
              </span>
            </div>

            {paginatedReports.length === 0 ? (
              <div className="py-10 text-center">
                <FileText size={32} className="mx-auto text-[#B4B2A9]" />
                <p className="mt-2 text-sm font-normal text-[#7A7A74]">لا توجد بيانات تقارير</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-right">
                  <thead>
                    <tr>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>التاريخ</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>خط الإنتاج</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>الموظف</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>الكمية</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>الهالك</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>عمال</th>
                      <th className="border-b px-3 py-2 text-xs font-medium text-[#444441]" style={{ borderColor: "rgba(0,0,0,0.12)" }}>ساعات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReports.map((row) => (
                      <tr key={row.id}>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{row.date}</td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{row.line}</td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{row.employee}</td>
                        <td className="border-b px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                          <span className="inline-flex px-2 py-1 text-xs font-medium" style={{ borderRadius: 8, background: TOKENS.teal.bg, color: TOKENS.teal.text }}>
                            {arNumber(row.quantity)}
                          </span>
                        </td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{arNumber(row.waste)}</td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{arNumber(row.workers)}</td>
                        <td className="border-b px-3 py-2 text-sm font-normal text-[#252521]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>{arNumber(row.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-normal text-[#7A7A74]">
                صفحة {arNumber(page)} من {arNumber(totalPages)}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs font-normal disabled:opacity-40"
                  style={ELEMENT_STYLE}
                >
                  السابق
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs font-normal disabled:opacity-40"
                  style={ELEMENT_STYLE}
                >
                  التالي
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
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
