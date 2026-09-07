import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Button, SearchableSelect } from "../components/UI";
import { toast } from "../../../components/Toast";
import { warehouseService } from "../services/warehouseService";
import { stockService } from "../services/stockService";
import { workOrderService } from "../../production/services/workOrderService";
import { bomService } from "../../manufacturing/services/bomService";
import type { BomItem } from "../../manufacturing/types";
import { routingPlanService } from "../../production/routing/services/routingPlanService";
import { routingStepService } from "../../production/routing/services/routingStepService";
import type { ProductionRoutingStep } from "../../production/routing/types";
import { organizationService } from "../../hr/services/organizationService";
import { useInventoryWarehouseScope } from "../hooks/useInventoryWarehouseScope";
import { useAppStore } from "../../../store/useAppStore";
import { useEnsureStoreData } from "@/hooks/useEnsureStoreData";
import { usePrintEngine } from "@/utils/printManager";
import { usePermission } from "../../../utils/permissions";
import { StockTransferPrint, type StockTransferPrintData } from "../components/StockTransferPrint";
import type {
  StockItemBalance,
  StockLocationBalance,
  Warehouse,
} from "../types";
import type { WorkOrder } from "../../../types";
import type { FirestoreDepartment } from "../../hr/types";
import {
  generalStockIssueService,
  GENERAL_ISSUE_PURPOSE_LABELS,
  type GeneralIssuePurpose,
  type GeneralStockIssue,
} from "../services/generalStockIssueService";

type DraftLine = {
  key: string;
  itemKey: string;
  locationId: string;
  quantity: string;
};
const newLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  itemKey: "",
  locationId: "",
  quantity: "",
});
const needsWorkOrder = (purpose: GeneralIssuePurpose) =>
  purpose === "production" || purpose === "packaging";
const needsDestination = (purpose: GeneralIssuePurpose) =>
  ["maintenance", "lubricants", "department", "other"].includes(purpose);
const formatDate = (value: string) =>
  new Date(value).toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  });

const EmbeddedPackagingControl = lazy(() => import("../../production/pages/PackagingControl").then((module) => ({ default: module.PackagingControl })));
const EmbeddedSparePartsReplenishment = lazy(() => import("./SparePartsReplenishment").then((module) => ({ default: module.SparePartsReplenishment })));

export const GeneralStockIssues: React.FC = () => {
  const { printDocument } = usePrintEngine();
  const { can } = usePermission();
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  useEnsureStoreData(["products", "lines"]);
  const products = useAppStore((state) => state.products);
  const productionLines = useAppStore((state) => state.productionLines);
  const {
    scoped,
    filterWarehouses,
    warehouseSelectLocked,
    warehouseId: scopedWarehouseId,
    warehouseIds: scopedWarehouseIds,
  } = useInventoryWarehouseScope();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [locationBalances, setLocationBalances] = useState<
    StockLocationBalance[]
  >([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [history, setHistory] = useState<GeneralStockIssue[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [purpose, setPurpose] = useState<GeneralIssuePurpose>("production");
  const [workOrderId, setWorkOrderId] = useState("");
  const [productionQty, setProductionQty] = useState("");
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  const [routingSteps, setRoutingSteps] = useState<ProductionRoutingStep[]>([]);
  const [productionStageId, setProductionStageId] = useState("");
  const [includeCommonComponents, setIncludeCommonComponents] = useState(true);
  const [issuedByItem, setIssuedByItem] = useState<Record<string, number>>({});
  const [destinationId, setDestinationId] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [embeddedWorkflow, setEmbeddedWorkflow] = useState<GeneralIssuePurpose | null>(null);
  const [draftId, setDraftId] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [warehouseRows, workOrders, departmentRows, issueRows] =
        await Promise.all([
          scopedWarehouseIds.length > 1
            ? Promise.all(scopedWarehouseIds.map((id) => warehouseService.getById(id))).then((rows) => rows.filter((row): row is Warehouse => Boolean(row && row.isActive !== false)))
            : warehouseService.getActiveWarehouses(),
          workOrderService.getAll(),
          organizationService.listActiveDepartments().catch(() => []),
          generalStockIssueService.listRecent(),
        ]);
      const filtered = filterWarehouses(warehouseRows);
      const allowed = scoped ? filtered : warehouseRows;
      setWarehouses(allowed);
      setOrders(workOrders);
      setDepartments(departmentRows);
      setHistory(issueRows);
      setWarehouseId(
        (current) => current || scopedWarehouseId || allowed[0]?.id || "",
      );
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل صفحة الصرف.");
    } finally {
      setLoading(false);
    }
  }, [filterWarehouses, scoped, scopedWarehouseId, scopedWarehouseIds]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);
  useEffect(() => {
    if (!warehouseId) {
      setBalances([]);
      setLocationBalances([]);
      return;
    }
    void Promise.all([
      stockService.getBalances(warehouseId),
      stockService.getLocationBalances({ warehouseId }),
    ])
      .then(([rows, locations]) => {
        setBalances(rows);
        setLocationBalances(locations);
      })
      .catch(() => {
        setBalances([]);
        setLocationBalances([]);
      });
  }, [warehouseId, history.length]);

  const itemOptions = useMemo(
    () =>
      balances
        .filter((row) => Number(row.quantity || 0) > 0)
        .sort((a, b) => a.itemName.localeCompare(b.itemName, "ar")),
    [balances],
  );
  const byKey = useMemo(
    () =>
      new Map(itemOptions.map((row) => [`${row.itemType}:${row.itemId}`, row])),
    [itemOptions],
  );
  const locationsByItemKey = useMemo(() => {
    const map = new Map<string, StockLocationBalance[]>();
    locationBalances
      .filter((row) => Number(row.quantity || 0) > 0)
      .forEach((row) => {
        const key = `${row.itemType}:${row.itemId}`;
        map.set(key, [...(map.get(key) || []), row]);
      });
    return map;
  }, [locationBalances]);
  const selectedOrder = orders.find((row) => row.id === workOrderId);
  const destinationOptions = purpose === "department" ? departments : [];
  const workOrderOptions = useMemo(
    () =>
      orders
        .filter((order) => order.id && order.status !== "cancelled")
        .map((order) => {
          const productName =
            products.find((product) => product.id === order.productId)?.name ||
            "منتج غير معروف";
          const lineName =
            productionLines.find((line) => line.id === order.lineId)?.name ||
            "خط غير محدد";
          return {
            value: order.id!,
            label: `${order.workOrderNumber} — ${productName} — ${lineName} · ${order.status}`,
            keywords: `${order.workOrderNumber} ${productName} ${lineName} ${order.productId} ${order.lineId}`,
          };
        }),
    [orders, productionLines, products],
  );

  useEffect(() => {
    if (purpose !== "production" || !selectedOrder?.productId) {
      setBomItems([]);
      return;
    }
    const remaining = Math.max(
      0,
      Number(selectedOrder.quantity || 0) -
        Number(selectedOrder.producedQuantity || 0),
    );
    setProductionQty(String(remaining || selectedOrder.quantity || ""));
    setBomLoading(true);
    setProductionStageId("");
    void Promise.all([
      bomService.getActiveBomWithLegacyFallback("product", selectedOrder.productId),
      routingPlanService.getActivePlanForProduct(selectedOrder.productId),
      generalStockIssueService.listForWorkOrder(selectedOrder.id || ""),
    ])
      .then(async ([{ items }, plan, posted]) => {
        setBomItems(items.filter((item) => item.itemType === "material" && Number(item.qtyPerUnit || 0) > 0));
        setRoutingSteps(plan?.id ? await routingStepService.getByPlanId(plan.id) : []);
        const totals: Record<string, number> = {};
        posted.forEach((voucher) => voucher.lines.forEach((line) => {
          const key = `${voucher.productionStageId || ""}:${line.itemType}:${line.itemId}`;
          totals[key] = (totals[key] || 0) + Number(line.quantity || 0);
        }));
        setIssuedByItem(totals);
      })
      .catch(() => setBomItems([]))
      .finally(() => setBomLoading(false));
  }, [purpose, selectedOrder?.id, selectedOrder?.productId]);

  const visibleBomItems = useMemo(() => bomItems.filter((item) => {
    if (!productionStageId) return true;
    return item.consumptionStageId === productionStageId || (includeCommonComponents && !item.consumptionStageId);
  }), [bomItems, includeCommonComponents, productionStageId]);
  const issuedForItem = useCallback((item: BomItem) => {
    const suffix = `:${item.itemType}:${item.itemId}`;
    if (productionStageId && item.consumptionStageId) return issuedByItem[`${productionStageId}:${item.itemType}:${item.itemId}`] || 0;
    return Object.entries(issuedByItem).reduce((sum, [key, value]) => key.endsWith(suffix) ? sum + value : sum, 0);
  }, [issuedByItem, productionStageId]);
  const hasProductionOverage = useMemo(() => purpose === "production" && visibleBomItems.some((item) => {
    const current = lines.find((line) => line.itemKey === `${item.itemType}:${item.itemId}`);
    const required = Number(item.qtyPerUnit || 0) * Number(productionQty || 0) * (1 + Number(item.wastePercent || 0) / 100);
    return Number(current?.quantity || 0) > Math.max(0, required - issuedForItem(item)) + 0.0001;
  }), [issuedForItem, lines, productionQty, purpose, visibleBomItems]);

  useEffect(() => {
    if (purpose !== "production" || !selectedOrder) return;
    setLines(visibleBomItems.map((item) => {
      const required = Number(item.qtyPerUnit || 0) * Number(productionQty || 0) * (1 + Number(item.wastePercent || 0) / 100);
      const issued = issuedForItem(item);
      return { key: crypto.randomUUID(), itemKey: `${item.itemType}:${item.itemId}`, locationId: "", quantity: String(Math.max(0, required - issued)) };
    }).filter((line) => Number(line.quantity) > 0));
  }, [issuedForItem, productionQty, purpose, selectedOrder?.id, visibleBomItems]);

  const reset = () => {
    setWorkOrderId("");
    setProductionQty("");
    setBomItems([]);
    setRoutingSteps([]);
    setProductionStageId("");
    setDestinationId("");
    setDestinationName("");
    setNote("");
    setLines([newLine()]);
    setEmbeddedWorkflow(null);
    setDraftId("");
  };
  const normalizeDirectLines = () => lines.map((line) => ({
    line,
    item: byKey.get(line.itemKey),
    quantity: Number(line.quantity),
  }));

  const validateDirectLines = () => {
    const normalized = normalizeDirectLines();
    if (!warehouseId) throw new Error("اختر المخزن.");
    if (needsDestination(purpose) && !destinationName.trim()) throw new Error("حدد الجهة المستلمة.");
    if (!normalized.length || normalized.some((row) => !row.item || !(row.quantity > 0))) throw new Error("أكمل الصنف والكمية في كل بند.");
    return normalized;
  };

  const saveDraft = async () => {
    if (["packaging", "center_replenishment"].includes(purpose)) return toast.error("المسار المتخصص يدير حالاته داخل محركه الحالي.");
    try {
      const normalized = validateDirectLines();
      setPosting(true);
      const result = await generalStockIssueService.saveDraft({
        draftId: draftId || undefined, warehouseId, purpose, destinationId,
        destinationName: destinationName.trim(), workOrderId: selectedOrder?.id, workOrderNumber: selectedOrder?.workOrderNumber,
        productionStageId: productionStageId || undefined, productionStageName: routingSteps.find((step) => step.id === productionStageId)?.name,
        note: note.trim(),
        lines: normalized.map(({ item, line, quantity }) => ({ itemType: item!.itemType, itemId: item!.itemId, locationId: line.locationId || undefined, quantity })),
      });
      setDraftId(result.id);
      toast.success(`تم حفظ المسودة ${result.referenceNo} بدون التأثير على الرصيد.`);
      await loadBase();
    } catch (error: any) { toast.error(error?.message || "تعذر حفظ المسودة."); }
    finally { setPosting(false); }
  };

  const printVoucher = (row: GeneralStockIssue) => {
    const data: StockTransferPrintData = {
      transferNo: row.referenceNo, createdAt: row.postedAt || row.createdAt,
      fromWarehouseName: row.warehouseName, toWarehouseName: row.destinationName || GENERAL_ISSUE_PURPOSE_LABELS[row.purpose],
      statusLabel: row.status === "draft" ? "مسودة" : row.status === "voided" ? "ملغي" : "مرحّل",
      documentType: "إذن منصرف عام", note: [row.workOrderNumber && `أمر الشغل: ${row.workOrderNumber}`, row.productName && `المنتج: ${row.productName}`, row.productionLineName && `الخط: ${row.productionLineName}`, row.productionStageName && `المرحلة: ${row.productionStageName}`, row.note].filter(Boolean).join(" · ") || undefined, createdBy: row.createdByName,
      items: row.lines.map((line) => ({ itemName: line.itemName, itemCode: line.itemCode, unitLabel: line.unit, quantity: line.quantity, quantityPieces: line.quantity, locationCode: line.locationCode || locationBalances.find((location) => location.locationId === line.locationId)?.locationCode || line.locationId || undefined })),
    };
    printDocument({ documentTitle: row.referenceNo, printSettings: printTemplate, render: (ref) => <StockTransferPrint ref={ref} data={data} printSettings={printTemplate} /> });
  };

  const voidVoucher = async (row: GeneralStockIssue) => {
    const reason = window.prompt(`اكتب سبب إلغاء ${row.referenceNo}:`)?.trim();
    if (!reason || !row.id) return;
    try { setPosting(true); await generalStockIssueService.void(row.id, reason); toast.success("تم إلغاء السند وتسجيل الحركة العكسية."); await loadBase(); }
    catch (error: any) { toast.error(error?.message || "تعذر إلغاء السند."); }
    finally { setPosting(false); }
  };
  const openDraft = (row: GeneralStockIssue) => {
    if (!row.id || row.status !== 'draft') return;
    setDraftId(row.id); setWarehouseId(row.warehouseId); setPurpose(row.purpose);
    setWorkOrderId(row.workOrderId || ''); setProductionStageId(row.productionStageId || '');
    setDestinationId(row.destinationId || ''); setDestinationName(row.destinationName || ''); setNote(row.note || '');
    setLines(row.lines.map((line) => ({ key: crypto.randomUUID(), itemKey: `${line.itemType}:${line.itemId}`, locationId: line.locationId || '', quantity: String(line.quantity) })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const post = async () => {
    if (purpose === "center_replenishment") {
      setEmbeddedWorkflow(purpose);
      return;
    }
    if (purpose === "packaging") {
      setEmbeddedWorkflow(purpose);
      return;
    }
    if (purpose === "production") {
      if (!selectedOrder?.id) return toast.error("اختر أمر الشغل.");
      if (!(Number(productionQty) > 0))
        return toast.error("أدخل كمية الإنتاج المطلوب صرف مكوناتها.");
    }
    const normalized = lines.map((line) => ({ line, item: byKey.get(line.itemKey), quantity: Number(line.quantity) }));
    if (!warehouseId) return toast.error("اختر المخزن.");
    if (needsWorkOrder(purpose) && !selectedOrder?.id)
      return toast.error("اختر أمر الشغل.");
    if (needsDestination(purpose) && !destinationName.trim())
      return toast.error("حدد الجهة المستلمة.");
    if (
      !normalized.length ||
      normalized.some((row) => !row.item || !(row.quantity > 0))
    )
      return toast.error("أكمل الصنف والكمية في كل بند.");
    if (
      normalized.some(
        (row) =>
          (locationsByItemKey.get(row.line.itemKey)?.length || 0) > 0 &&
          !row.line.locationId,
      )
    )
      return toast.error("اختر اللوكيشن لكل صنف موزع على أرفف.");
    if (
      new Set(
        normalized.map((row) => `${row.line.itemKey}:${row.line.locationId}`),
      ).size !== normalized.length
    )
      return toast.error("يوجد صنف ولوكيشن مكرر في الإذن.");
    const insufficient = normalized.find((row) => {
      if (!row.item) return false;
      const location = (locationsByItemKey.get(row.line.itemKey) || []).find(
        (loc) => loc.locationId === row.line.locationId,
      );
      return (
        row.quantity > Number(location?.quantity ?? row.item.quantity ?? 0)
      );
    });
    if (insufficient?.item)
      return toast.error(
        `الرصيد غير كافٍ للصنف ${insufficient.item.itemName}.`,
      );
    if (hasProductionOverage) toast.warning("كمية الصرف الحالية تتجاوز المتبقي حسب الـBOM؛ سيستمر الترحيل حسب الإعداد المعتمد.");
    setPosting(true);
    try {
      const result = await generalStockIssueService.post({
        draftId: draftId || undefined,
        warehouseId,
        purpose,
        destinationId,
        destinationName: destinationName.trim(),
        workOrderId: selectedOrder?.id,
        workOrderNumber: selectedOrder?.workOrderNumber,
        productionStageId: productionStageId || undefined,
        productionStageName: routingSteps.find((step) => step.id === productionStageId)?.name,
        note: note.trim(),
        lines: normalized.map(({ item, line, quantity }) => ({
          itemType: item!.itemType,
          itemId: item!.itemId,
          locationId: line.locationId || undefined,
          quantity,
        })),
      });
      toast.success(`تم ترحيل إذن الصرف ${result.referenceNo}.`);
      reset();
      await loadBase();
    } catch (error: any) {
      toast.error(error?.message || "تعذر ترحيل الإذن.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="إذن صرف عام"
      rangeLabel="صرف موحّد لأي بند مع تحديد الغرض والجهة، دون تغيير مسارات الإنتاج والصيانة الحالية"
      onRefresh={loadBase}
      refreshing={loading}
    >
      <div className="grid w-full min-w-0 max-w-full gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <OpsDashPanel
          title="بيانات إذن الصرف"
          accent="inventory"
          loading={loading}
          className="min-w-0"
          bodyClassName="min-w-0"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              المخزن
              <SearchableSelect
                value={warehouseId}
                disabled={warehouseSelectLocked}
                onChange={setWarehouseId}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                placeholder="اختر المخزن"
                searchPlaceholder="ابحث باسم المخزن"
                openOnFocus
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              غرض الصرف
              <SearchableSelect
                value={purpose}
                onChange={(value) => {
                  setPurpose(value as GeneralIssuePurpose);
                  setWorkOrderId("");
                  setDestinationId("");
                  setDestinationName("");
                  setEmbeddedWorkflow(null);
                }}
                options={Object.entries(GENERAL_ISSUE_PURPOSE_LABELS).map(([value, label]) => ({ value, label }))}
                placeholder="اختر غرض الصرف"
                searchPlaceholder="ابحث في أنواع الصرف"
                openOnFocus
              />
            </label>
            {needsWorkOrder(purpose) && (
              <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                أمر الشغل{" "}
                <span className="text-[rgb(var(--color-danger))]">مطلوب</span>
                <SearchableSelect
                  value={workOrderId}
                  onChange={setWorkOrderId}
                  options={workOrderOptions}
                  placeholder="اختر أمر الشغل"
                  searchPlaceholder="ابحث برقم أمر الشغل أو المنتج"
                  openOnFocus
                />
              </label>
            )}
            {purpose === "production" && selectedOrder && (
              <>
                <label className="grid gap-1 text-sm font-medium">
                  كمية المنتج المطلوب صرف مكوناتها
                  <input className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3" type="number" min="0.0001" step="any" value={productionQty} onChange={(e) => setProductionQty(e.target.value)} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  نطاق المكونات
                  <SearchableSelect value={productionStageId} onChange={setProductionStageId} options={[{ value: "", label: "كل المكونات" }, ...routingSteps.map((step) => ({ value: step.id!, label: step.name }))]} placeholder="كل المكونات" searchPlaceholder="ابحث باسم المرحلة" openOnFocus />
                </label>
                {productionStageId && <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={includeCommonComponents} onChange={(e) => setIncludeCommonComponents(e.target.checked)} />
                  تضمين المكونات العامة غير المرتبطة بمرحلة
                </label>}
              </>
            )}
            {needsDestination(purpose) &&
              (purpose === "department" ? (
                <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                  القسم المستلم{" "}
                  <span className="text-[rgb(var(--color-danger))]">مطلوب</span>
                  <SearchableSelect
                    value={destinationId}
                    onChange={(id) => {
                      setDestinationId(id);
                      setDestinationName(
                        destinationOptions.find((d) => d.id === id)?.name || "",
                      );
                    }}
                    options={destinationOptions.map((d) => ({ value: d.id, label: d.name }))}
                    placeholder="اختر القسم"
                    searchPlaceholder="ابحث باسم القسم"
                    openOnFocus
                  />
                </label>
              ) : (
                <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                  الجهة / الماكينة المستلمة{" "}
                  <span className="text-[rgb(var(--color-danger))]">مطلوب</span>
                  <input
                    className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                    value={destinationName}
                    maxLength={160}
                    onChange={(e) => setDestinationName(e.target.value)}
                    placeholder="مثال: ماكينة الحقن 2 أو ورشة الصيانة"
                  />
                </label>
              ))}
          </div>

          {purpose === "production" && (
            <div className="mt-5 rounded-lg border border-[var(--color-border)] p-3">
              <h4 className="text-sm font-bold">مكونات الـBOM المتوقعة</h4>
            {!selectedOrder ? (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">اختر أمر الشغل لعرض مكونات المنتج وكميات الصرف.</p>
            ) : bomLoading ? (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  جاري تحميل المكونات…
                </p>
              ) : bomItems.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  لا توجد مكونات BOM نشطة لهذا المنتج.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {visibleBomItems.map((item) => (
                    <div
                      key={`${item.itemType}:${item.itemId}`}
                      className="flex justify-between gap-3 rounded-md bg-[var(--color-surface-muted)] p-2 text-sm"
                    >
                      <span>{item.itemName || item.itemId}</span>
                      <span className="text-end tabular-nums"><strong>
                        {(
                          Number(item.qtyPerUnit || 0) *
                          Number(productionQty || 0) *
                          (1 + Number(item.wastePercent || 0) / 100)
                        ).toLocaleString("ar-EG", {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {item.unit}
                      </strong><small className="block text-[var(--color-text-muted)]">مصروف سابقًا {issuedForItem(item).toLocaleString("ar-EG")} · متبقي {Math.max(0, Number(item.qtyPerUnit || 0) * Number(productionQty || 0) * (1 + Number(item.wastePercent || 0) / 100) - issuedForItem(item)).toLocaleString("ar-EG")}</small></span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                عدّل كمية الصرف الآن واختر اللوكيشن لكل بند. تجاوز المتبقي تحذير فقط.
              </p>
              {hasProductionOverage && <p className="mt-2 rounded-md bg-[rgb(var(--color-warning)/0.12)] px-3 py-2 text-sm text-[rgb(var(--color-warning))]">تنبيه: يوجد بند يتجاوز المتبقي حسب الـBOM. الترحيل مسموح في هذه النسخة.</p>}
            </div>
          )}

          {!["packaging", "center_replenishment"].includes(
            purpose,
          ) && (
            <div className="mt-5 w-full min-w-0 max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-start text-[var(--color-text-muted)]">
                    <th className="p-2 text-start">الصنف</th>
                    <th className="p-2 text-start">اللوكيشن</th>
                    <th className="p-2 text-start">الرصيد</th>
                    <th className="p-2 text-start">الكمية</th>
                    <th className="p-2">
                      <span className="sr-only">حذف</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const item = byKey.get(line.itemKey);
                    const itemLocations =
                      locationsByItemKey.get(line.itemKey) || [];
                    const location = itemLocations.find(
                      (loc) => loc.locationId === line.locationId,
                    );
                    return (
                      <tr
                        key={line.key}
                        className="border-b border-[var(--color-border)]"
                      >
                        <td className="p-2">
                          <SearchableSelect
                            value={line.itemKey}
                            onChange={(value) =>
                              setLines((rows) =>
                                rows.map((r) =>
                                  r.key === line.key
                                    ? {
                                        ...r,
                                        itemKey: value,
                                        locationId: "",
                                      }
                                    : r,
                                ),
                              )
                            }
                            options={itemOptions.map((row) => ({
                              value: `${row.itemType}:${row.itemId}`,
                              label: `${row.itemName} · ${row.itemCode}`,
                              keywords: `${row.itemCode} ${row.itemType}`,
                              hint: Number(row.quantity || 0).toLocaleString("ar-EG"),
                            }))}
                            placeholder="اختر الصنف"
                            searchPlaceholder="ابحث باسم الصنف أو الكود"
                            openOnFocus
                          />
                        </td>
                        <td className="p-2">
                          {itemLocations.length ? (
                            <SearchableSelect
                              value={line.locationId}
                              onChange={(value) =>
                                setLines((rows) =>
                                  rows.map((r) =>
                                    r.key === line.key
                                      ? { ...r, locationId: value }
                                      : r,
                                  ),
                                )
                              }
                              options={itemLocations.map((loc) => ({
                                value: loc.locationId,
                                label: `${loc.locationCode} · ${loc.quantity.toLocaleString("ar-EG")}`,
                              }))}
                              placeholder="اختر اللوكيشن"
                              searchPlaceholder="ابحث بكود اللوكيشن"
                              openOnFocus
                            />
                          ) : (
                            <span className="text-[var(--color-text-muted)]">
                              غير موزع
                            </span>
                          )}
                        </td>
                        <td className="p-2 tabular-nums">
                          {item
                            ? `${Number(location?.quantity ?? item.quantity).toLocaleString("ar-EG")} ${item.unit || ""}`
                            : "—"}
                        </td>
                        <td className="p-2">
                          <input
                            aria-label="الكمية"
                            className="min-h-11 w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 tabular-nums"
                            type="number"
                            min="0.0001"
                            step="any"
                            value={line.quantity}
                            onChange={(e) =>
                              setLines((rows) =>
                                rows.map((r) =>
                                  r.key === line.key
                                    ? { ...r, quantity: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-danger))]"
                            aria-label="حذف البند"
                            disabled={lines.length === 1}
                            onClick={() =>
                              setLines((rows) =>
                                rows.filter((r) => r.key !== line.key),
                              )
                            }
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            {!["packaging", "center_replenishment"].includes(
              purpose,
            ) && (
              <Button
                variant="secondary"
                onClick={() => setLines((rows) => [...rows, newLine()])}
              >
                إضافة بند
              </Button>
            )}
            <div className="flex min-w-[240px] flex-1 flex-col gap-1 sm:max-w-md">
              <label
                className="text-sm font-medium"
                htmlFor="general-issue-note"
              >
                ملاحظات
              </label>
              <input
                id="general-issue-note"
                className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button disabled={posting || loading} onClick={post}>
              {posting
                ? "جاري الترحيل…"
                : purpose === "production"
                  ? "ترحيل صرف الإنتاج نهائيًا"
                  : purpose === "packaging"
                    ? "بدء تنفيذ التغليف هنا"
                    : purpose === "center_replenishment"
                      ? "بدء تموين المراكز هنا"
                      : "ترحيل نهائي"}
            </Button>
            {!['packaging', 'center_replenishment'].includes(purpose) && (
              <Button variant="secondary" disabled={posting || loading} onClick={saveDraft}>
                {posting ? "جاري الحفظ…" : draftId ? "تحديث المسودة" : "حفظ مسودة"}
              </Button>
            )}
          </div>
          {embeddedWorkflow && (
            <div className="mt-6 border-t border-[var(--color-border)] pt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-base font-bold">تنفيذ العملية داخل إذن الصرف العام</h4>
                <button type="button" className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm" onClick={() => setEmbeddedWorkflow(null)}>
                  إغلاق التنفيذ
                </button>
              </div>
              <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--color-text-muted)]">جاري تحميل محرك التنفيذ…</p>}>
                {embeddedWorkflow === "packaging" && <EmbeddedPackagingControl />}
                {embeddedWorkflow === "center_replenishment" && <EmbeddedSparePartsReplenishment />}
              </Suspense>
            </div>
          )}
        </OpsDashPanel>

        <OpsDashPanel
          title="آخر أذونات الصرف"
          accent="inventory"
          className="min-w-0"
          bodyClassName="min-w-0"
        >
          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              لا توجد أذونات صرف من المسار الجديد حتى الآن.
            </div>
          ) : (
            <div className="grid gap-2">
              {history.map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border border-[var(--color-border)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong dir="ltr">{row.referenceNo}</strong>
                    <span className="rounded-full bg-[rgb(var(--color-success)/.12)] px-2 py-1 text-xs text-[rgb(var(--color-success))]">
                      {row.status === 'draft' ? 'مسودة' : row.status === 'voided' ? 'ملغي' : 'مرحّل'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    {GENERAL_ISSUE_PURPOSE_LABELS[row.purpose]} ·{" "}
                    {row.warehouseName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {row.lines.length} بند · {formatDate(row.createdAt)} ·{" "}
                    {row.createdByName}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.status === 'draft' && <Button variant="outline" onClick={() => openDraft(row)}>فتح المسودة</Button>}
                    <Button variant="secondary" onClick={() => printVoucher(row)}>طباعة</Button>
                    {row.status === "posted" && can('inventory.transactions.delete') && (
                      <Button variant="danger" disabled={posting} onClick={() => void voidVoucher(row)}>إلغاء بقيد عكسي</Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </OpsDashPanel>
      </div>
    </ModuleOpsPageShell>
  );
};
