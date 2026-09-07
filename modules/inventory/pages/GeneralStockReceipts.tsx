import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Button, SearchableSelect } from "../components/UI";
import { toast } from "../../../components/Toast";
import { useAppStore } from "../../../store/useAppStore";
import { useEnsureStoreData } from "@/hooks/useEnsureStoreData";
import { usePrintEngine } from "@/utils/printManager";
import { usePermission } from "../../../utils/permissions";
import { StockTransferPrint, type StockTransferPrintData } from "../components/StockTransferPrint";
import { warehouseService } from "../services/warehouseService";
import { warehouseLocationService } from "../services/warehouseLocationService";
import { materialService } from "../../manufacturing/services/materialService";
import { rawMaterialService } from "../services/rawMaterialService";
import { workOrderService } from "../../production/services/workOrderService";
import {
  generalStockIssueService,
  type GeneralStockIssue,
} from "../services/generalStockIssueService";
import { useInventoryWarehouseScope } from "../hooks/useInventoryWarehouseScope";
import type { InventoryItemType, Warehouse, WarehouseLocation } from "../types";
import type { WorkOrder } from "../../../types";
import {
  GENERAL_RECEIPT_REASON_LABELS,
  generalStockReceiptService,
  type GeneralReceiptReason,
  type GeneralStockReceipt,
} from "../services/generalStockReceiptService";

type CatalogItem = {
  key: string;
  itemType: InventoryItemType;
  itemId: string;
  name: string;
  code: string;
  unit: string;
};
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
const needsSource = (reason: GeneralReceiptReason) =>
  ["purchase", "department_return", "maintenance_return", "other"].includes(
    reason,
  );
const formatDate = (value: string) =>
  new Date(value).toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  });

const EmbeddedQuickAction = lazy(() => import("../../production/pages/QuickAction").then((module) => ({ default: module.QuickAction })));
const EmbeddedSparePartsReplenishment = lazy(() => import("./SparePartsReplenishment").then((module) => ({ default: module.SparePartsReplenishment })));

export const GeneralStockReceipts: React.FC = () => {
  const { printDocument } = usePrintEngine();
  const { can } = usePermission();
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  useEnsureStoreData(["products", "lines"]);
  const products = useAppStore((s) => s.products);
  const productionLines = useAppStore((s) => s.productionLines);
  const {
    scoped,
    filterWarehouses,
    warehouseSelectLocked,
    warehouseId: scopedWarehouseId,
    warehouseIds: scopedWarehouseIds,
  } = useInventoryWarehouseScope();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [issues, setIssues] = useState<GeneralStockIssue[]>([]);
  const [history, setHistory] = useState<GeneralStockReceipt[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState<GeneralReceiptReason>("purchase");
  const [workOrderId, setWorkOrderId] = useState("");
  const [sourceIssueId, setSourceIssueId] = useState("");
  const [sourceParty, setSourceParty] = useState("");
  const [sourceDocumentNo, setSourceDocumentNo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [embeddedWorkflow, setEmbeddedWorkflow] = useState<GeneralReceiptReason | null>(null);
  const [draftId, setDraftId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        warehouseRows,
        locationRows,
        materials,
        raws,
        workOrders,
        issueRows,
        receiptRows,
      ] = await Promise.all([
        scopedWarehouseIds.length > 1
          ? Promise.all(scopedWarehouseIds.map((id) => warehouseService.getById(id))).then((rows) => rows.filter((row): row is Warehouse => Boolean(row && row.isActive !== false)))
          : warehouseService.getActiveWarehouses(),
        scopedWarehouseIds.length > 1
          ? Promise.all(scopedWarehouseIds.map((id) => warehouseLocationService.getAll(id))).then((groups) => groups.flat())
          : warehouseLocationService.getAll(),
        materialService.getAll().catch(() => []),
        rawMaterialService.getAll().catch(() => []),
        workOrderService.getAll(),
        generalStockIssueService.listRecent(100),
        generalStockReceiptService.listRecent(),
      ]);
      const filtered = filterWarehouses(warehouseRows);
      const allowed = scoped ? filtered : warehouseRows;
      setWarehouses(allowed);
      setLocations(locationRows);
      setOrders(workOrders);
      setIssues(issueRows);
      setHistory(receiptRows);
      setWarehouseId(
        (value) => value || scopedWarehouseId || allowed[0]?.id || "",
      );
      const productRows: CatalogItem[] = products
        .filter((p) => p.id)
        .map((p) => ({
          key: `finished_good:${p.id}`,
          itemType: "finished_good",
          itemId: p.id!,
          name: p.name,
          code: p.code || "",
          unit: "piece",
        }));
      const materialRows: CatalogItem[] = materials
        .filter((m) => m.id && m.isActive !== false)
        .map((m) => ({
          key: `material:${m.id}`,
          itemType: "material",
          itemId: m.id!,
          name: m.name,
          code: m.code,
          unit: m.baseUnit || "unit",
        }));
      const knownCodes = new Set(
        materialRows
          .map((row) => row.code.trim().toLowerCase())
          .filter(Boolean),
      );
      const rawRows: CatalogItem[] = raws
        .filter(
          (r) =>
            r.id &&
            r.isActive !== false &&
            !knownCodes.has(r.code.trim().toLowerCase()),
        )
        .map((r) => ({
          key: `raw_material:${r.id}`,
          itemType: "raw_material",
          itemId: r.id!,
          name: r.name,
          code: r.code,
          unit: r.unit || "unit",
        }));
      setCatalog(
        [...materialRows, ...rawRows, ...productRows].sort((a, b) =>
          a.name.localeCompare(b.name, "ar"),
        ),
      );
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل صفحة الإضافة.");
    } finally {
      setLoading(false);
    }
  }, [filterWarehouses, products, scoped, scopedWarehouseId, scopedWarehouseIds]);
  useEffect(() => {
    void load();
  }, [load]);

  const byKey = useMemo(
    () => new Map(catalog.map((item) => [item.key, item])),
    [catalog],
  );
  const warehouseLocations = useMemo(
    () =>
      locations.filter(
        (loc) => loc.warehouseId === warehouseId && loc.isActive !== false,
      ),
    [locations, warehouseId],
  );
  const selectedOrder = orders.find((order) => order.id === workOrderId);
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
  const reset = () => {
    setWorkOrderId("");
    setSourceIssueId("");
    setSourceParty("");
    setSourceDocumentNo("");
    setNote("");
    setLines([newLine()]);
    setEmbeddedWorkflow(null);
    setDraftId("");
  };
  const normalizeDirectLines = () => lines.map((line) => ({ line, item: byKey.get(line.itemKey), quantity: Number(line.quantity) }));
  const validateDirectLines = () => {
    const normalized = normalizeDirectLines();
    if (!warehouseId) throw new Error("اختر المخزن.");
    if (reason === "issue_return" && !sourceIssueId) throw new Error("اختر إذن الصرف الأصلي.");
    if (needsSource(reason) && !sourceParty.trim()) throw new Error("أدخل مصدر الإضافة.");
    if (normalized.some((row) => !row.item || !(row.quantity > 0))) throw new Error("أكمل الصنف والكمية في كل بند.");
    return normalized;
  };
  const saveDraft = async () => {
    if (["production_output", "center_replenishment_receipt"].includes(reason)) return toast.error("المسار المتخصص يدير حالاته داخل محركه الحالي.");
    try {
      const normalized = validateDirectLines(); setPosting(true);
      const result = await generalStockReceiptService.saveDraft({
        draftId: draftId || undefined, warehouseId, reason, sourceIssueId: sourceIssueId || undefined,
        sourceParty: sourceParty.trim(), sourceDocumentNo: sourceDocumentNo.trim(), note: note.trim(),
        lines: normalized.map(({ line, item, quantity }) => ({ itemType: item!.itemType, itemId: item!.itemId, locationId: line.locationId || undefined, quantity })),
      });
      setDraftId(result.id); toast.success(`تم حفظ المسودة ${result.referenceNo} بدون التأثير على الرصيد.`); await load();
    } catch (error: any) { toast.error(error?.message || "تعذر حفظ المسودة."); }
    finally { setPosting(false); }
  };
  const printVoucher = (row: GeneralStockReceipt) => {
    const data: StockTransferPrintData = {
      transferNo: row.referenceNo, createdAt: row.postedAt || row.createdAt,
      fromWarehouseName: row.sourceParty || GENERAL_RECEIPT_REASON_LABELS[row.reason], toWarehouseName: row.warehouseName,
      statusLabel: row.status === "draft" ? "مسودة" : row.status === "voided" ? "ملغي" : "مرحّل",
      documentType: "إذن إضافة عام", note: row.note || undefined, createdBy: row.createdByName,
      items: row.lines.map((line) => ({ itemName: line.itemName, itemCode: line.itemCode, unitLabel: line.unit, quantity: line.quantity, quantityPieces: line.quantity, locationCode: line.locationCode || locations.find((location) => location.id === line.locationId)?.code || line.locationId || undefined })),
    };
    printDocument({ documentTitle: row.referenceNo, printSettings: printTemplate, render: (ref) => <StockTransferPrint ref={ref} data={data} printSettings={printTemplate} /> });
  };
  const voidVoucher = async (row: GeneralStockReceipt) => {
    const reasonText = window.prompt(`اكتب سبب إلغاء ${row.referenceNo}:`)?.trim();
    if (!reasonText || !row.id) return;
    try { setPosting(true); await generalStockReceiptService.void(row.id, reasonText); toast.success("تم إلغاء السند وتسجيل الحركة العكسية."); await load(); }
    catch (error: any) { toast.error(error?.message || "تعذر إلغاء السند."); }
    finally { setPosting(false); }
  };
  const openDraft = (row: GeneralStockReceipt) => {
    if (!row.id || row.status !== 'draft') return;
    setDraftId(row.id); setWarehouseId(row.warehouseId); setReason(row.reason);
    setSourceIssueId(row.sourceIssueId || ''); setSourceParty(row.sourceParty || ''); setSourceDocumentNo(row.sourceDocumentNo || ''); setNote(row.note || '');
    setLines(row.lines.map((line) => ({ key: crypto.randomUUID(), itemKey: `${line.itemType}:${line.itemId}`, locationId: line.locationId || '', quantity: String(line.quantity) })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const post = async () => {
    if (reason === "center_replenishment_receipt") {
      setEmbeddedWorkflow(reason);
      return;
    }
    if (reason === "production_output") {
      if (!selectedOrder?.id) return toast.error("اختر أمر الشغل.");
      setEmbeddedWorkflow(reason);
      return;
    }
    const normalized = lines.map((line) => ({
      line,
      item: byKey.get(line.itemKey),
      quantity: Number(line.quantity),
    }));
    if (!warehouseId) return toast.error("اختر المخزن.");
    if (reason === "issue_return" && !sourceIssueId)
      return toast.error("اختر إذن الصرف الأصلي.");
    if (needsSource(reason) && !sourceParty.trim())
      return toast.error("أدخل مصدر الإضافة.");
    if (normalized.some((row) => !row.item || !(row.quantity > 0)))
      return toast.error("أكمل الصنف والكمية في كل بند.");
    if (
      new Set(
        normalized.map((row) => `${row.line.itemKey}:${row.line.locationId}`),
      ).size !== normalized.length
    )
      return toast.error("يوجد صنف ولوكيشن مكرر.");
    setPosting(true);
    try {
      const result = await generalStockReceiptService.post({
        draftId: draftId || undefined,
        warehouseId,
        reason,
        workOrderId: selectedOrder?.id,
        workOrderNumber: selectedOrder?.workOrderNumber,
        sourceIssueId: sourceIssueId || undefined,
        sourceParty: sourceParty.trim(),
        sourceDocumentNo: sourceDocumentNo.trim(),
        note: note.trim(),
        lines: normalized.map(({ line, item, quantity }) => ({
          itemType: item!.itemType,
          itemId: item!.itemId,
          locationId: line.locationId || undefined,
          quantity,
        })),
      });
      toast.success(`تم ترحيل إذن الإضافة ${result.referenceNo}.`);
      reset();
      await load();
    } catch (error: any) {
      toast.error(error?.message || "تعذر ترحيل الإذن.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="إذن إضافة عام"
      rangeLabel="إضافة خامة أو مكوّن أو تغليف أو مستهلك أو منتج تام، دون تغيير مسارات الإضافة الحالية"
      onRefresh={load}
      refreshing={loading}
    >
      <div className="grid w-full min-w-0 max-w-full gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <OpsDashPanel
          title="بيانات إذن الإضافة"
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
              سبب الإضافة
              <SearchableSelect
                value={reason}
                onChange={(value) => {
                  setReason(value as GeneralReceiptReason);
                  reset();
                }}
                options={Object.entries(GENERAL_RECEIPT_REASON_LABELS).map(([value, label]) => ({ value, label }))}
                placeholder="اختر سبب الإضافة"
                searchPlaceholder="ابحث في أنواع الإضافة"
                openOnFocus
              />
            </label>
            {reason === "production_output" && (
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
            {reason === "production_output" && selectedOrder && (
              <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm sm:col-span-2">
                <strong>{selectedOrder.workOrderType === "component_injection" ? "ناتج مكوّن حقن" : "ناتج منتج تام"}</strong>
                <p className="mt-1 text-[var(--color-text-muted)]">سيتم فتح تسجيل الإنتاج الحالي لتطبيق التقرير والجودة والهالك وترحيل المخزون كما هو.</p>
              </div>
            )}
            {reason === "center_replenishment_receipt" && (
              <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm sm:col-span-2">
                <strong>استلام تموين مركز</strong>
                <p className="mt-1 text-[var(--color-text-muted)]">سيتم فتح دورة تموين المراكز الحالية لاختيار الطلب وتسجيل المستلم والفروقات.</p>
              </div>
            )}
            {reason === "issue_return" && (
              <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                إذن الصرف الأصلي{" "}
                <span className="text-[rgb(var(--color-danger))]">مطلوب</span>
                <SearchableSelect
                  value={sourceIssueId}
                  onChange={setSourceIssueId}
                  options={issues.map((issue) => ({
                    value: issue.id,
                    label: `${issue.referenceNo} · ${issue.warehouseName}`,
                    keywords: `${issue.referenceNo} ${issue.destinationName || ""}`,
                  }))}
                  placeholder="اختر إذن الصرف"
                  searchPlaceholder="ابحث برقم إذن الصرف أو الجهة"
                  openOnFocus
                />
              </label>
            )}
            {needsSource(reason) && (
              <label className="grid gap-1 text-sm font-medium">
                مصدر الإضافة{" "}
                <span className="text-[rgb(var(--color-danger))]">مطلوب</span>
                <input
                  className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                  value={sourceParty}
                  maxLength={160}
                  onChange={(e) => setSourceParty(e.target.value)}
                  placeholder={
                    reason === "purchase" ? "اسم المورد" : "القسم أو الجهة"
                  }
                />
              </label>
            )}
            <label className="grid gap-1 text-sm font-medium">
              رقم مستند المصدر
              <input
                className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={sourceDocumentNo}
                maxLength={160}
                onChange={(e) => setSourceDocumentNo(e.target.value)}
                placeholder="اختياري"
              />
            </label>
          </div>
          {!['production_output', 'center_replenishment_receipt'].includes(reason) && <div className="mt-5 grid gap-3 md:hidden">
            {lines.map((line, index) => {
              const item = byKey.get(line.itemKey);
              return (
                <fieldset
                  key={line.key}
                  className="grid min-w-0 gap-3 rounded-lg border border-[var(--color-border)] p-3"
                >
                  <legend className="px-1 text-sm font-bold">
                    البند {index + 1}
                  </legend>
                  <label className="grid min-w-0 gap-1 text-sm">
                    الصنف
                    <SearchableSelect
                      value={line.itemKey}
                      onChange={(value) =>
                        setLines((rows) =>
                          rows.map((r) =>
                            r.key === line.key
                              ? { ...r, itemKey: value }
                              : r,
                          ),
                        )
                      }
                      options={catalog.map((row) => ({
                        value: row.key,
                        label: `${row.name} · ${row.code}`,
                        keywords: `${row.code} ${row.itemType}`,
                      }))}
                      placeholder="اختر الصنف"
                      searchPlaceholder="ابحث باسم الصنف أو الكود"
                      openOnFocus
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-sm">
                    اللوكيشن
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
                      options={warehouseLocations.map((loc) => ({ value: loc.id, label: loc.code }))}
                      placeholder="بدون لوكيشن"
                      searchPlaceholder="ابحث بكود اللوكيشن"
                      openOnFocus
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="grid gap-1 text-sm">
                      الكمية ({item?.unit || "الوحدة"})
                      <input
                        className="min-h-11 min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
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
                    </label>
                    <button
                      type="button"
                      aria-label="حذف البند"
                      className="min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-danger))]"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((rows) =>
                          rows.filter((r) => r.key !== line.key),
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>
                </fieldset>
              );
            })}
          </div>}
          {!['production_output', 'center_replenishment_receipt'].includes(reason) && <div className="mt-5 hidden w-full min-w-0 max-w-full overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-[var(--color-text-muted)]">
                  <th className="p-2 text-start">الصنف</th>
                  <th className="p-2 text-start">اللوكيشن</th>
                  <th className="p-2 text-start">الوحدة</th>
                  <th className="p-2 text-start">الكمية</th>
                  <th className="p-2">
                    <span className="sr-only">حذف</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = byKey.get(line.itemKey);
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
                                  ? { ...r, itemKey: value }
                                  : r,
                              ),
                            )
                          }
                          options={catalog.map((row) => ({
                            value: row.key,
                            label: `${row.name} · ${row.code}`,
                            keywords: `${row.code} ${row.itemType}`,
                          }))}
                          placeholder="اختر الصنف"
                          searchPlaceholder="ابحث باسم الصنف أو الكود"
                          openOnFocus
                        />
                      </td>
                      <td className="p-2">
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
                          options={warehouseLocations.map((loc) => ({ value: loc.id, label: loc.code }))}
                          placeholder="بدون لوكيشن"
                          searchPlaceholder="ابحث بكود اللوكيشن"
                          openOnFocus
                        />
                      </td>
                      <td className="p-2">{item?.unit || "—"}</td>
                      <td className="p-2">
                        <input
                          aria-label="الكمية"
                          className="min-h-11 w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
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
                          aria-label="حذف البند"
                          className="min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-danger))]"
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
          </div>}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            {!['production_output', 'center_replenishment_receipt'].includes(reason) && <Button
              variant="secondary"
              onClick={() => setLines((rows) => [...rows, newLine()])}
            >
              إضافة بند
            </Button>}
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm font-medium sm:max-w-md">
              ملاحظات
              <input
                className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <Button disabled={posting || loading} onClick={post}>
              {posting ? "جاري الترحيل…" : reason === "production_output" ? "بدء تسجيل الإنتاج هنا" : reason === "center_replenishment_receipt" ? "بدء استلام التموين هنا" : "ترحيل نهائي"}
            </Button>
            {!['production_output', 'center_replenishment_receipt'].includes(reason) && (
              <Button variant="secondary" disabled={posting || loading} onClick={saveDraft}>
                {posting ? "جاري الحفظ…" : draftId ? "تحديث المسودة" : "حفظ مسودة"}
              </Button>
            )}
          </div>
          {embeddedWorkflow && (
            <div className="mt-6 border-t border-[var(--color-border)] pt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-base font-bold">تنفيذ العملية داخل إذن الإضافة العام</h4>
                <button type="button" className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm" onClick={() => setEmbeddedWorkflow(null)}>
                  إغلاق التنفيذ
                </button>
              </div>
              <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--color-text-muted)]">جاري تحميل محرك التنفيذ…</p>}>
                {embeddedWorkflow === "production_output" && (
                  <EmbeddedQuickAction initialWorkOrderId={selectedOrder?.id} />
                )}
                {embeddedWorkflow === "center_replenishment_receipt" && <EmbeddedSparePartsReplenishment />}
              </Suspense>
            </div>
          )}
        </OpsDashPanel>
        <OpsDashPanel
          title="آخر أذونات الإضافة"
          accent="inventory"
          className="min-w-0"
          bodyClassName="min-w-0"
        >
          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              لا توجد أذونات إضافة من المسار الجديد حتى الآن.
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
                    {GENERAL_RECEIPT_REASON_LABELS[row.reason]} ·{" "}
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
