import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, SearchableSelect } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { transferApprovalService } from '../services/transferApprovalService';
import { rawMaterialService } from '../services/rawMaterialService';
import { warehouseService } from '../services/warehouseService';
import { stockService } from '../services/stockService';
import type { RawMaterial, Warehouse, StockItemBalance } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import { exportToPDF, exportAsImage, shareToWhatsApp, waitForExportPaint, type ShareResult } from '../../../utils/reportExport';
import { StockTransferPrint, StockTransferShareCard, type StockTransferPrintData } from '../components/StockTransferPrint';
import {
  INV_REF_REGEX,
  createTransferLine,
  formatInvReference,
  lineQuantityInPieces,
  validateTransferLines,
  buildTransferRequestLines,
  buildTransferPrintDataPayload,
  type TransferFormLine,
  type TransferItemOption,
} from '../utils/transferFormShared';
import type { TransferDisplayUnitMode } from '../utils/transferUnits';
import { PageHeader } from '../../../components/PageHeader';
import { getOperationalDateString } from '../../../utils/calculations';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';

type ItemType = 'finished_good' | 'raw_material';
const APP_VERSION = __APP_VERSION__;

export const QuickWarehouseTransfer: React.FC = () => {
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const { can } = usePermission();
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const uid = useAppStore((s) => s.uid);
  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const transferDisplayUnit = useAppStore(
    (s) => (s.systemSettings.planSettings?.transferDisplayUnit || 'piece') as TransferDisplayUnitMode,
  );
  const companyName = useAppStore((s) => s.systemSettings.branding?.factoryName ?? 'الشركة');

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);

  const [itemType, setItemType] = useState<ItemType>('finished_good');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [transferItems, setTransferItems] = useState<TransferFormLine[]>([createTransferLine()]);
  const [nextReferenceSeq, setNextReferenceSeq] = useState(1);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [savedPrintData, setSavedPrintData] = useState<StockTransferPrintData | null>(null);
  /** يغذي مكوّن المخفي و المشاركة في واتساب */
  const [hiddenPrintData, setHiddenPrintData] = useState<StockTransferPrintData | null>(null);

  const transferPrintRef = useRef<HTMLDivElement>(null);
  const transferShareCardRef = useRef<HTMLDivElement>(null);

  const [today] = useState(() => getOperationalDateString(8));

  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer',
  });

  const loadData = useCallback(async () => {
    const [whs, rms, txs, bals] = await Promise.all([
      warehouseService.getAll(),
      rawMaterialService.getAll(),
      stockService.getTransactions(),
      stockService.getBalances(),
    ]);
    setWarehouses(whs.filter((w) => w.isActive !== false));
    setRawMaterials(rms.filter((m) => m.isActive !== false));
    setBalances(bals);
    const maxExisting = txs.reduce((max, tx) => {
      const ref = (tx.referenceNo || '').trim();
      const match = ref.match(INV_REF_REGEX);
      if (!match) return max;
      return Math.max(max, Number(match[1] || 0));
    }, 0);
    setNextReferenceSeq(maxExisting + 1);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const referenceNo = useMemo(() => formatInvReference(nextReferenceSeq), [nextReferenceSeq]);

  const rawProductMetaById = useMemo(
    () => new Map(_rawProducts.map((p) => [p.id, p])),
    [_rawProducts],
  );

  const finishedGoodOptions = useMemo(
    () =>
      products.map((p) => {
        const raw = rawProductMetaById.get(p.id);
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          minStock: 0,
          unitsPerCarton: Number(raw?.unitsPerCarton || 0),
        };
      }),
    [products, rawProductMetaById],
  );

  const rawMaterialOptions = useMemo(
    () =>
      rawMaterials.map((m) => ({
        id: m.id || '',
        name: m.name,
        code: m.code,
        minStock: Number(m.minStock || 0),
      })),
    [rawMaterials],
  );

  const itemOptions: TransferItemOption[] =
    itemType === 'finished_good' ? finishedGoodOptions : rawMaterialOptions;

  const selectedFromWarehouse = warehouses.find((w) => w.id === warehouseId);
  const selectedToWarehouse = warehouses.find((w) => w.id === toWarehouseId);

  const getItemById = useCallback(
    (id: string) => itemOptions.find((item) => item.id === id),
    [itemOptions],
  );

  const qtyInPieces = useCallback(
    (line: TransferFormLine) => lineQuantityInPieces(line, getItemById(line.itemId), itemType),
    [getItemById, itemType],
  );

  const itemSelectOptions = useMemo(
    () =>
      itemOptions.map((opt) => {
        const row = balances.find(
          (b) =>
            b.warehouseId === warehouseId &&
            b.itemType === itemType &&
            b.itemId === opt.id,
        );
        const available = Number(row?.quantity || 0);
        return {
          value: opt.id,
          label: `${opt.name} (${opt.code}) — المتاح: ${available}`,
        };
      }),
    [itemOptions, balances, warehouseId, itemType],
  );

  const warehouseSelectOptions = useMemo(
    () =>
      warehouses.map((w) => ({
        value: w.id || '',
        label: `${w.name} (${w.code})`,
      })),
    [warehouses],
  );

  const toWarehouseSelectOptions = useMemo(
    () =>
      warehouses
        .filter((w) => w.id !== warehouseId)
        .map((w) => ({
          value: w.id || '',
          label: `${w.name} (${w.code})`,
        })),
    [warehouses, warehouseId],
  );

  const getAvailableForItem = (lineItemId: string) => {
    if (!lineItemId || !warehouseId) return 0;
    const row = balances.find(
      (b) =>
        b.warehouseId === warehouseId &&
        b.itemType === itemType &&
        b.itemId === lineItemId,
    );
    return Number(row?.quantity || 0);
  };

  const buildPrintPayload = (resolvedReferenceNo: string, txId: string | null) =>
    buildTransferPrintDataPayload({
      resolvedReferenceNo,
      txId,
      transferItems,
      itemType,
      getItemById,
      qtyInPieces,
      fromWarehouseName: selectedFromWarehouse?.name || '',
      effectiveWarehouseId: warehouseId,
      toWarehouseName: selectedToWarehouse?.name || '',
      toWarehouseId,
      transferDisplayUnit,
      createdBy: userDisplayName || 'Current User',
    });

  const showShareFeedback = (result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل صورة التحويلة ونسخها — افتح واتساب والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التحويلة — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  };

  const printTransfer = async (fileName: string) => {
    await new Promise((r) => setTimeout(r, 200));
    if (!transferPrintRef.current) return;
    if (isMobilePrint) {
      await exportToPDF(transferPrintRef.current, fileName, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: 1,
      });
      return;
    }
    handleTransferPrint();
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!warehouseId) {
      setSaveError('اختر المخزن المصدر أولاً.');
      return;
    }
    if (!toWarehouseId) {
      setSaveError('اختر مخزن الوجهة للتحويل.');
      return;
    }

    const validationError = validateTransferLines(transferItems, itemType, getItemById);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    const requestLines = buildTransferRequestLines(transferItems, itemType, getItemById, qtyInPieces);
    if (!requestLines.length) {
      setSaveError('تعذر تجهيز أصناف طلب التحويل.');
      return;
    }

    setSaving(true);
    try {
      const resolvedReferenceNo = referenceNo;
      const txId = await transferApprovalService.createRequest({
        fromWarehouseId: warehouseId,
        fromWarehouseName: selectedFromWarehouse?.name || '',
        toWarehouseId,
        toWarehouseName: selectedToWarehouse?.name || '',
        referenceNo: resolvedReferenceNo,
        lines: requestLines,
        note: '',
        createdBy: userDisplayName || userEmail || 'Current User',
        createdByUserId: uid || undefined,
      });

      if (!txId) {
        setSaveError('تعذر حفظ الطلب — تحقق من إعدادات الاتصال.');
        return;
      }

      const payload = buildPrintPayload(resolvedReferenceNo, txId);
      setSavedPrintData(payload);
      setHiddenPrintData(payload);
      setSaved(true);

      setNextReferenceSeq((prev) => {
        const match = resolvedReferenceNo.match(INV_REF_REGEX);
        const fromUsedRef = match ? Number(match[1] || 0) + 1 : prev + 1;
        return Math.max(prev + 1, fromUsedRef);
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ طلب التحويل.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSaved(false);
    setSavedPrintData(null);
    setHiddenPrintData(null);
    setSaveError(null);
    setShareToast(null);
    setWarehouseId('');
    setToWarehouseId('');
    setItemType('finished_good');
    setTransferItems([createTransferLine()]);
    void loadData();
  };

  const handleExportPDF = async () => {
    if (!transferPrintRef.current || !savedPrintData) return;
    setExporting(true);
    try {
      await exportToPDF(transferPrintRef.current, `تحويل-سريع-${savedPrintData.transferNo}-${today}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: printTemplate?.copies,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportImage = async () => {
    if (!transferPrintRef.current || !savedPrintData) return;
    setExporting(true);
    try {
      await exportAsImage(transferPrintRef.current, `تحويل-سريع-${savedPrintData.transferNo}-${today}`);
    } finally {
      setExporting(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!transferShareCardRef.current || !savedPrintData) return;
    setExporting(true);
    try {
      await waitForExportPaint(150);
      const result = await shareToWhatsApp(
        transferShareCardRef.current,
        `تحويل مخزن ${savedPrintData.transferNo}`,
      );
      showShareFeedback(result);
    } finally {
      setExporting(false);
    }
  };

  const fieldClass =
    'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[#f8f9fa] text-[var(--color-text)] outline-none focus:border-[rgb(var(--color-primary))] focus:bg-white focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.12)] transition-all font-medium';
  const fieldDisabledClass =
    'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[#f0f2f5] text-[var(--color-text)] font-medium select-none cursor-default';

  const totalPieces =
    savedPrintData?.items?.reduce((sum, row) => sum + Number(row.quantityPieces || 0), 0) ?? 0;

  const canSubmit = can('inventory.transactions.create');

  return (
    <div className="erp-ds-clean space-y-6">
      <PageHeader
        title="تحويل مخزن سريع"
        subtitle="تسجيل مرجعي تحويل بين المخازن بسرعة — حفظ، مشاركة وتصدير."
        icon="swap_horiz"
      />

      {shareToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3 animate-in fade-in duration-300">
          <span className="material-icons-round text-emerald-500">image</span>
          <p className="text-sm font-medium text-emerald-700 flex-1">{shareToast}</p>
          <button
            type="button"
            onClick={() => setShareToast(null)}
            className="p-1 text-emerald-400 hover:text-emerald-600 transition-colors shrink-0"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">error</span>
          <p className="text-sm font-bold text-rose-700 flex-1">{saveError}</p>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="p-1 text-rose-400 hover:text-rose-600 transition-colors shrink-0"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      {!saved ? (
        <Card title="بيانات التحويل">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">رقم المرجع</span>
            <span
              className="text-[12.5px] font-bold px-2.5 py-0.5 rounded-full"
              style={{
                background: 'rgb(var(--color-primary)/0.1)',
                color: 'rgb(var(--color-primary))',
                border: '1px solid rgb(var(--color-primary)/0.2)',
              }}
            >
              {referenceNo}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField id="transfer-item-type" label="نوع الصنف">
              <Select
                value={itemType}
                onValueChange={(value) => {
                  const nextType = value as ItemType;
                  setItemType(nextType);
                  setTransferItems((prev) =>
                    prev.map((line) => ({
                      ...line,
                      itemId: '',
                      unit: nextType === 'finished_good' ? line.unit : 'piece',
                    })),
                  );
                }}
              >
                <SelectTrigger
                  id="transfer-item-type"
                  className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="finished_good">منتج نهائي</SelectItem>
                  <SelectItem value="raw_material">مادة خام</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <div />
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">المخزن المصدر *</label>
              <SearchableSelect
                options={warehouseSelectOptions}
                value={warehouseId}
                onChange={setWarehouseId}
                placeholder="ابحث واختر المخزن"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">مخزن الوجهة *</label>
              <SearchableSelect
                options={toWarehouseSelectOptions}
                value={toWarehouseId}
                onChange={setToWarehouseId}
                placeholder="ابحث واختر مخزن الوجهة"
              />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[var(--color-text-muted)]">أصناف التحويلة</label>
              <button
                type="button"
                className="btn btn-secondary hidden sm:inline-flex text-sm"
                onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
                disabled={saving}
              >
                <span className="material-icons-round text-base">add</span>
                إضافة صنف
              </button>
            </div>

            <div
              className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] overflow-hidden"
              style={{ background: 'var(--color-card)' }}
            >
              <div
                className="hidden sm:grid gap-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] px-3 py-2"
                style={{
                  gridTemplateColumns: '1fr 160px 140px 40px',
                  borderBottom: '1px solid var(--color-border)',
                  background: '#f8f9fa',
                }}
              >
                <span>الصنف</span>
                <span className="text-center">الوحدة</span>
                <span className="text-center">الكمية</span>
                <span />
              </div>

              {transferItems.map((line, idx) => {
                const lineItem = getItemById(line.itemId);
                const available = getAvailableForItem(line.itemId);
                const requestedForItem = transferItems
                  .filter((x) => x.itemId === line.itemId)
                  .reduce((sum, x) => sum + qtyInPieces(x), 0);
                const remaining = available - requestedForItem;
                return (
                  <div
                    key={line.id}
                    className="px-3 py-2.5"
                    style={{
                      borderBottom: idx < transferItems.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                  >
                    <div
                      className="hidden sm:grid gap-0 items-start"
                      style={{ gridTemplateColumns: '1fr 160px 140px 40px' }}
                    >
                      <div className="pl-3">
                        <SearchableSelect
                          options={itemSelectOptions}
                          value={line.itemId}
                          onChange={(value) =>
                            setTransferItems((prev) =>
                              prev.map((x) => (x.id === line.id ? { ...x, itemId: value } : x)),
                            )
                          }
                          placeholder="ابحث واختر الصنف"
                        />
                        {line.itemId && (
                          <p
                            className={`text-[11px] font-semibold mt-1 ${remaining < 0 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}
                          >
                            متاح: {available} · متبقي: {remaining}
                          </p>
                        )}
                      </div>
                      <div className="px-2">
                        {itemType === 'finished_good' ? (
                          <div className="erp-date-seg flex w-full">
                            <button
                              type="button"
                              className={`erp-date-seg-btn flex-1${line.unit === 'piece' ? ' active' : ''}`}
                              onClick={() =>
                                setTransferItems((prev) =>
                                  prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)),
                                )
                              }
                            >
                              قطعة
                            </button>
                            <button
                              type="button"
                              className={`erp-date-seg-btn flex-1${line.unit === 'carton' ? ' active' : ''}`}
                              onClick={() =>
                                setTransferItems((prev) =>
                                  prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)),
                                )
                              }
                            >
                              كرتونة
                            </button>
                          </div>
                        ) : (
                          <div className={fieldDisabledClass} style={{ textAlign: 'center' }}>
                            وحدة
                          </div>
                        )}
                        {itemType === 'finished_good' && line.unit === 'carton' && (
                          <p className="text-[10.5px] text-[var(--color-text-muted)] mt-1 text-center">
                            {Number(lineItem?.unitsPerCarton || 0) > 0
                              ? `${lineItem?.unitsPerCarton} وحدة/كرتونة`
                              : 'لا توجد قيمة'}
                          </p>
                        )}
                      </div>
                      <div className="px-2">
                        <input
                          type="number"
                          step="any"
                          className={fieldClass}
                          placeholder="0"
                          value={line.quantity || ''}
                          onChange={(e) =>
                            setTransferItems((prev) =>
                              prev.map((x) =>
                                x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="flex items-center justify-center pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setTransferItems((prev) =>
                              prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev,
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-all"
                          disabled={transferItems.length <= 1}
                          title="حذف الصف"
                        >
                          <span className="material-icons-round text-base">delete_outline</span>
                        </button>
                      </div>
                    </div>

                    <div className="sm:hidden space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[var(--color-text-muted)]">الصنف #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setTransferItems((prev) =>
                              prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev,
                            )
                          }
                          className="w-7 h-7 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-all"
                          disabled={transferItems.length <= 1}
                          title="حذف الصف"
                        >
                          <span className="material-icons-round text-sm">delete_outline</span>
                        </button>
                      </div>
                      <SearchableSelect
                        options={itemSelectOptions}
                        value={line.itemId}
                        onChange={(value) =>
                          setTransferItems((prev) =>
                            prev.map((x) => (x.id === line.id ? { ...x, itemId: value } : x)),
                          )
                        }
                        placeholder="ابحث واختر الصنف"
                      />
                      {line.itemId && (
                        <p
                          className={`text-[11px] font-semibold ${remaining < 0 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}
                        >
                          متاح: {available} · متبقي: {remaining}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">
                            الوحدة
                          </span>
                          {itemType === 'finished_good' ? (
                            <div className="erp-date-seg flex w-full">
                              <button
                                type="button"
                                className={`erp-date-seg-btn flex-1${line.unit === 'piece' ? ' active' : ''}`}
                                onClick={() =>
                                  setTransferItems((prev) =>
                                    prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)),
                                  )
                                }
                              >
                                قطعة
                              </button>
                              <button
                                type="button"
                                className={`erp-date-seg-btn flex-1${line.unit === 'carton' ? ' active' : ''}`}
                                onClick={() =>
                                  setTransferItems((prev) =>
                                    prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)),
                                  )
                                }
                              >
                                كرتونة
                              </button>
                            </div>
                          ) : (
                            <div className={fieldDisabledClass} style={{ textAlign: 'center' }}>
                              وحدة
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">
                            الكمية
                          </span>
                          <input
                            type="number"
                            step="any"
                            className={fieldClass}
                            placeholder="0"
                            value={line.quantity || ''}
                            onChange={(e) =>
                              setTransferItems((prev) =>
                                prev.map((x) =>
                                  x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary w-full sm:hidden text-sm"
              onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
              disabled={saving}
            >
              <span className="material-icons-round text-base">add</span>
              إضافة صنف
            </button>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
            <Button onClick={() => void handleSave()} disabled={saving || !canSubmit} className="w-full sm:w-auto">
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <span className="material-icons-round text-lg">save</span>
                  حفظ
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto" type="button">
              <span className="material-icons-round text-lg">refresh</span>
              مسح
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] px-5 py-4 flex items-center gap-3">
            <span className="material-icons-round text-emerald-500 text-2xl">check_circle</span>
            <div>
              <p className="font-bold text-emerald-700">تم تسجيل طلب التحويل بنجاح!</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500">
                سيتم ترحيل المخزون بعد الاعتماد. يمكنك الطباعة أو التصدير أو المشاركة.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <Button
              className="w-full sm:w-auto"
              type="button"
              onClick={() => void printTransfer(`اذن-تحويل-${savedPrintData?.transferNo ?? 'transfer'}`)}
            >
              <span className="material-icons-round text-lg">print</span>
              طباعة المرجع
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={() => void handleExportPDF()} className="w-full sm:w-auto" type="button">
              {exporting ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-round text-lg">picture_as_pdf</span>
              )}
              تصدير PDF
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={() => void handleExportImage()} className="w-full sm:w-auto" type="button">
              <span className="material-icons-round text-lg">image</span>
              تصدير كصورة
            </Button>
            <Button variant="outline" disabled={exporting} onClick={() => void handleShareWhatsApp()} className="w-full sm:w-auto" type="button">
              <span className="material-icons-round text-lg">share</span>
              مشاركة عبر WhatsApp
            </Button>
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto" type="button">
              <span className="material-icons-round text-lg">add</span>
              تحويل جديد
            </Button>
          </div>

          {savedPrintData && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-[#f8f9fa]/50 border-b border-[var(--color-border)] flex items-center gap-2">
                <span className="material-icons-round text-sm text-slate-400">visibility</span>
                <span className="text-xs font-bold text-slate-500">معاينة التحويلة</span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-blue-100 dark:border-blue-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">من مخزن</p>
                    <p className="text-sm font-bold text-blue-600">{savedPrintData.fromWarehouseName}</p>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-violet-100 dark:border-violet-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إلى مخزن</p>
                    <p className="text-sm font-bold text-violet-600 dark:text-violet-400">{savedPrintData.toWarehouseName}</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-amber-100 dark:border-amber-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">رقم المرجع</p>
                    <p className="text-sm font-bold text-amber-700">{savedPrintData.transferNo}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-emerald-100 dark:border-emerald-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إجمالي القطع</p>
                    <p className="text-sm font-bold text-emerald-600">{totalPieces}</p>
                  </div>
                </div>

                {savedPrintData.items && savedPrintData.items.length > 0 && (
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden">
                    <div className="grid grid-cols-12 gap-0 bg-[#f8f9fa] px-3 py-2 text-[10px] font-bold text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <span className="col-span-5">الصنف</span>
                      <span className="col-span-2 text-center">الوحدة</span>
                      <span className="col-span-2 text-center">الكمية</span>
                      <span className="col-span-3 text-center">بالقطعة</span>
                    </div>
                    {savedPrintData.items.map((row, i) => (
                      <div
                        key={`${row.itemCode}-${i}`}
                        className="grid grid-cols-12 gap-0 px-3 py-2 text-sm border-b border-[var(--color-border)] last:border-b-0"
                      >
                        <span className="col-span-5 font-medium truncate" title={row.itemName}>
                          {row.itemName}
                        </span>
                        <span className="col-span-2 text-center text-[var(--color-text-muted)]">{row.unitLabel}</span>
                        <span className="col-span-2 text-center font-bold">{row.quantity}</span>
                        <span className="col-span-3 text-center text-[var(--color-text-muted)]">{row.quantityPieces}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      <div style={{ position: 'fixed', right: 0, top: 0, opacity: 0, pointerEvents: 'none', zIndex: 0 }}>
        <StockTransferPrint ref={transferPrintRef} data={hiddenPrintData} printSettings={printTemplate} />
      </div>
      <div style={{ position: 'fixed', left: '-9999px', top: '0', zIndex: -1, direction: 'rtl' }}>
        <StockTransferShareCard
          ref={transferShareCardRef}
          data={hiddenPrintData}
          companyName={companyName}
          version={APP_VERSION ?? ''}
        />
      </div>
    </div>
  );
};
