import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, SearchableSelect } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { createTransferRequest } from '../usecases/createTransferRequest';
import { unwrapOrThrow } from '@/shared/usecases';
import { rawMaterialService } from '../services/rawMaterialService';
import { warehouseService } from '../services/warehouseService';
import { stockService } from '../services/stockService';
import type { RawMaterial, Warehouse, StockItemBalance } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import {
  exportToPDF,
  exportAsImage,
  getShareResultFeedbackMessage,
  shareToWhatsApp,
  waitForExportPaint,
  type ShareResult,
} from '../../../utils/reportExport';
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
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { getOperationalDateString } from '../../../utils/calculations';
import {
  INVENTORY_OPERATION_KEYS,
  INVENTORY_TRANSFER_CREATE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material } from '../../manufacturing/types';
import {
  buildComponentCatalogOptions,
  getComponentAvailableQty,
  resolveComponentStockIdentity,
  type ComponentCatalogOption,
} from '../lib/componentCatalogOptions';
import { filterManualTransferWarehouses, isSparePartsTransferWarehouseRole } from '../lib/manualTransferWarehouses';
import {
  fetchCachedPageData,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

type ItemType = 'finished_good' | 'raw_material';
const APP_VERSION = __APP_VERSION__;
const QUICK_TRANSFER_CATALOG_CACHE_KEY = 'inventory:quick-warehouse-transfer-catalog';

type QuickTransferCatalog = {
  warehouses: Warehouse[];
  rawMaterials: RawMaterial[];
  materials: Material[];
  nextReferenceSeq: number;
};

export const QuickWarehouseTransfer: React.FC = () => {
  const [searchParams] = useSearchParams();
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    warehouseSelectLocked,
    filterWarehouses,
    resolveScopedWarehouseId,
    routingConfigured,
    settingsPath,
  } = useMaterialsWarehouseScope();
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
  const systemSettings = useAppStore((s) => s.systemSettings);
  const quickTransferEnabled = isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.transferCreate,
    INVENTORY_TRANSFER_CREATE_PATHS.quickTransfer,
  );

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);

  const [itemType, setItemType] = useState<ItemType>(
    scoped || searchParams.get('itemType') === 'raw_material' ? 'raw_material' : 'finished_good',
  );
  const [warehouseId, setWarehouseId] = useState(
    () => searchParams.get('warehouseId') || scopedWarehouseId || '',
  );
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [transferItems, setTransferItems] = useState<TransferFormLine[]>([createTransferLine()]);
  const [nextReferenceSeq, setNextReferenceSeq] = useState(1);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const setSaveError = useCallback((message: string | null) => {
    if (message) showAppToast('error', message);
  }, []);
  const [exporting, setExporting] = useState(false);
  const setShareToast = useCallback((message: string | null) => {
    if (message) showAppToast('info', message, { duration: 8000 });
  }, []);
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

  const loadCatalog = useCallback(async () => {
    const cached = peekPageDataCache<QuickTransferCatalog>(QUICK_TRANSFER_CATALOG_CACHE_KEY);
    if (cached) {
      setWarehouses(cached.warehouses);
      setRawMaterials(cached.rawMaterials);
      setMaterials(cached.materials);
      setNextReferenceSeq(cached.nextReferenceSeq);
    }
    const { data } = await fetchCachedPageData(
      QUICK_TRANSFER_CATALOG_CACHE_KEY,
      async () => {
        const [whs, rms, mats, peekRef] = await Promise.all([
          warehouseService.getActiveWarehouses(),
          rawMaterialService.getAll(),
          materialService.getAll().catch(() => [] as Material[]),
          stockService.getNextInvReferenceNo(),
        ]);
        const match = peekRef.trim().match(INV_REF_REGEX);
        return {
          warehouses: whs,
          rawMaterials: rms.filter((m) => m.isActive !== false),
          materials: mats.filter((m) => m.isActive !== false),
          nextReferenceSeq: match ? Number(match[1] || 0) : 1,
        } satisfies QuickTransferCatalog;
      },
      { maxAgeMs: 60_000 },
    );
    setWarehouses(data.warehouses);
    setRawMaterials(data.rawMaterials);
    setMaterials(data.materials);
    setNextReferenceSeq(data.nextReferenceSeq);
  }, []);

  const loadBalancesForWarehouse = useCallback(async (whId: string) => {
    if (!whId) {
      setBalances([]);
      return;
    }
    const bals = await stockService.getBalances(whId);
    setBalances(bals);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadBalancesForWarehouse(warehouseId);
  }, [warehouseId, loadBalancesForWarehouse]);

  useEffect(() => {
    const queryWarehouseId = searchParams.get('warehouseId') || '';
    setWarehouseId((prev) =>
      resolveScopedWarehouseId(prev, [queryWarehouseId, scopedWarehouseId]),
    );
    const nextItemType = searchParams.get('itemType');
    if (scoped || nextItemType === 'raw_material') {
      setItemType('raw_material');
    } else if (nextItemType === 'finished_good') {
      setItemType('finished_good');
    }
  }, [scoped, warehouseIds.join('|'), scopedWarehouseId, searchParams, resolveScopedWarehouseId]);

  const fromWarehouseOptions = useMemo(
    () => filterManualTransferWarehouses(filterWarehouses(warehouses)),
    [filterWarehouses, warehouses],
  );

  const selectedFromWarehouse = warehouses.find((w) => w.id === warehouseId);
  const sparePartsTransferContext = isSparePartsTransferWarehouseRole(selectedFromWarehouse?.warehouseRole);

  const toWarehouseOptions = useMemo(
    () =>
      filterManualTransferWarehouses(warehouses, { sparePartsOnly: sparePartsTransferContext })
        .filter((w) => w.id !== warehouseId),
    [warehouses, warehouseId, sparePartsTransferContext],
  );

  const referenceNo = useMemo(() => formatInvReference(nextReferenceSeq), [nextReferenceSeq]);

  const rawProductMetaById = useMemo(
    () => new Map(_rawProducts.map((p) => [p.id, p])),
    [_rawProducts],
  );

  const finishedGoodOptions = useMemo(
    (): TransferItemOption[] =>
      products.map((p) => {
        const raw = rawProductMetaById.get(p.id);
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          minStock: 0,
          unitsPerCarton: Number(raw?.unitsPerCarton || 0),
          stockItemType: 'finished_good',
        };
      }),
    [products, rawProductMetaById],
  );

  const componentOptions = useMemo(
    () => buildComponentCatalogOptions(materials, rawMaterials),
    [materials, rawMaterials],
  );

  const componentById = useMemo(() => {
    const map = new Map<string, ComponentCatalogOption>();
    componentOptions.forEach((opt) => map.set(opt.id, opt));
    return map;
  }, [componentOptions]);

  const rawMaterialOptions = useMemo(
    (): TransferItemOption[] =>
      componentOptions.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        minStock: m.minStock,
        stockItemType: m.stockItemType,
      })),
    [componentOptions],
  );

  const itemOptions: TransferItemOption[] =
    itemType === 'finished_good' ? finishedGoodOptions : rawMaterialOptions;

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
        let available = 0;
        if (itemType === 'finished_good') {
          const row = balances.find(
            (b) =>
              b.warehouseId === warehouseId &&
              b.itemType === 'finished_good' &&
              b.itemId === opt.id,
          );
          available = Number(row?.quantity || 0);
        } else {
          const component = componentById.get(opt.id);
          available = component ? getComponentAvailableQty(balances, warehouseId, component) : 0;
        }
        return {
          value: opt.id,
          label: `${opt.name} (${opt.code}) — المتاح: ${available}`,
        };
      }),
    [itemOptions, balances, warehouseId, itemType, componentById],
  );

  const warehouseSelectOptions = useMemo(
    () =>
      fromWarehouseOptions.map((w) => ({
        value: w.id || '',
        label: `${w.name} (${w.code})`,
      })),
    [fromWarehouseOptions],
  );

  const toWarehouseSelectOptions = useMemo(
    () =>
      toWarehouseOptions.map((w) => ({
        value: w.id || '',
        label: `${w.name} (${w.code})`,
      })),
    [toWarehouseOptions],
  );

  const getAvailableForItem = (lineItemId: string) => {
    if (!lineItemId || !warehouseId) return 0;
    if (itemType === 'finished_good') {
      const row = balances.find(
        (b) =>
          b.warehouseId === warehouseId &&
          b.itemType === 'finished_good' &&
          b.itemId === lineItemId,
      );
      return Number(row?.quantity || 0);
    }
    const component = componentById.get(lineItemId);
    if (!component) return 0;
    return getComponentAvailableQty(balances, warehouseId, component);
  };

  const resolveLineStockIdentity = (lineItemId: string) => {
    if (itemType === 'finished_good') {
      return {
        itemType: 'finished_good' as const,
        itemId: lineItemId,
        available: getAvailableForItem(lineItemId),
      };
    }
    const component = componentById.get(lineItemId);
    if (!component) {
      return { itemType: 'raw_material' as const, itemId: lineItemId, available: 0 };
    }
    return resolveComponentStockIdentity(component, balances, warehouseId, 'TRANSFER');
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
    const msg = getShareResultFeedbackMessage(result, { downloadEntityLabel: 'التحويلة' });
    if (!msg) return;
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 8000);
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

    const requestLines = buildTransferRequestLines(
      transferItems,
      itemType,
      (id) => {
        const item = getItemById(id);
        if (!item) return undefined;
        if (itemType === 'finished_good') return item;
        const identity = resolveLineStockIdentity(id);
        return { ...item, id: identity.itemId, stockItemType: identity.itemType };
      },
      qtyInPieces,
    );
    if (!requestLines.length) {
      setSaveError('تعذر تجهيز أصناف طلب التحويل.');
      return;
    }

    setSaving(true);
    try {
      const resolvedReferenceNo = referenceNo;
      const txId = unwrapOrThrow(await createTransferRequest({
        requestType: 'manual_transfer',
        sourceModule: 'manual_movement',
        fromWarehouseId: warehouseId,
        fromWarehouseName: selectedFromWarehouse?.name || '',
        toWarehouseId,
        toWarehouseName: selectedToWarehouse?.name || '',
        referenceNo: resolvedReferenceNo,
        lines: requestLines,
        note: '',
        createdBy: userDisplayName || userEmail || 'Current User',
        createdByUserId: uid || undefined,
      }, { path: INVENTORY_TRANSFER_CREATE_PATHS.quickTransfer })).requestId;

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
    void loadBalancesForWarehouse(warehouseId);
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
    'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[var(--color-bg)] text-[var(--color-text)] outline-none focus:border-[rgb(var(--color-primary))] focus:bg-[var(--color-card)] focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.12)] transition-all font-medium';
  const fieldDisabledClass =
    'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[var(--color-surface-hover)] text-[var(--color-text)] font-medium select-none cursor-default';

  const totalPieces =
    savedPrintData?.items?.reduce((sum, row) => sum + Number(row.quantityPieces || 0), 0) ?? 0;

  const canSubmit = can('inventory.transactions.create');

  if (!quickTransferEnabled) {
    return (
      <OpsDashPanel accent="inventory">
        <p className="text-sm text-muted-foreground p-4">مسار التحويل السريع متوقف من إعدادات النظام.</p>
      </OpsDashPanel>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="المخزون"
      rangeLabel="تسجيل مرجعي تحويل بين المخازن بسرعة — حفظ، مشاركة وتصدير"
    >
      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      {!saved ? (
        <OpsDashPanel title="بيانات التحويل" accent="inventory">
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
                disabled={scoped}
              >
                <SelectTrigger
                  id="transfer-item-type"
                  className="w-full px-4 py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm"
                >
                  <SelectValue placeholder="اختر نوع الصنف">
                    {itemType === 'finished_good' ? 'منتج نهائي' : 'مكونات المنتجات'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="finished_good">منتج نهائي</SelectItem>
                  <SelectItem value="raw_material">مكونات المنتجات</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <div />
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">المخزن المصدر *</label>
              <SearchableSelect
                options={warehouseSelectOptions}
                value={warehouseId}
                disabled={warehouseSelectLocked}
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
              <Button
                type="button"
                variant="secondary"
                className="hidden sm:inline-flex text-sm"
                onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
                disabled={saving}
              >
                إضافة صنف
              </Button>
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
                  background: 'var(--color-bg)',
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
                            className={`text-[11px] font-semibold mt-1 ${remaining < 0 ? 'text-[rgb(var(--color-danger))]' : 'text-[var(--color-text-muted)]'}`}
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
                          className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.1)] disabled:opacity-30 transition-all"
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
                          className="w-7 h-7 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.1)] disabled:opacity-30 transition-all"
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
                          className={`text-[11px] font-semibold ${remaining < 0 ? 'text-[rgb(var(--color-danger))]' : 'text-[var(--color-text-muted)]'}`}
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

            <Button
              type="button"
              variant="secondary"
              className="w-full sm:hidden text-sm"
              onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
              disabled={saving}
            >
              إضافة صنف
            </Button>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
            <Button onClick={() => void handleSave()} disabled={saving || !canSubmit} className="w-full sm:w-auto">
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto" type="button">
              مسح
            </Button>
          </div>
        </OpsDashPanel>
      ) : (
        <div className="space-y-4">
          <div className="bg-[rgb(var(--color-success)/0.1)] border border-[rgb(var(--color-success)/0.25)] rounded-[var(--border-radius-lg)] px-5 py-4 flex items-center gap-3">
            <span className="material-icons-round text-[rgb(var(--color-success))] text-2xl">check_circle</span>
            <div>
              <p className="font-bold text-[rgb(var(--color-success))]">تم تسجيل طلب التحويل بنجاح!</p>
              <p className="text-sm text-[rgb(var(--color-success))] dark:text-[rgb(var(--color-success))]">
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
              طباعة المرجع
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={() => void handleExportPDF()} className="w-full sm:w-auto" type="button">
              {exporting ? 'جاري التصدير...' : 'تصدير PDF'}
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={() => void handleExportImage()} className="w-full sm:w-auto" type="button">
              تصدير كصورة
            </Button>
            <Button variant="outline" disabled={exporting} onClick={() => void handleShareWhatsApp()} className="w-full sm:w-auto" type="button">
              مشاركة عبر WhatsApp
            </Button>
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto" type="button">
              تحويل جديد
            </Button>
          </div>

          {savedPrintData && (
            <OpsDashPanel title="معاينة التحويلة" accent="inventory" bodyClassName="p-0 overflow-hidden">
              <div className="px-5 py-3 bg-[var(--color-bg)]/50 border-b border-[var(--color-border)] flex items-center gap-2">
                <span className="material-icons-round text-sm text-[var(--color-text-muted)]">visibility</span>
                <span className="text-xs font-bold text-[var(--color-text-muted)]">معاينة التحويلة</span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] rounded-[var(--border-radius-lg)] p-3 text-center border border-[rgb(var(--color-primary)/0.25)] dark:border-[rgb(var(--color-primary))]/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">من مخزن</p>
                    <p className="text-sm font-bold text-[rgb(var(--color-primary))]">{savedPrintData.fromWarehouseName}</p>
                  </div>
                  <div className="bg-[rgb(var(--color-secondary)/0.1)] dark:bg-[rgb(var(--color-secondary)/0.15)] rounded-[var(--border-radius-lg)] p-3 text-center border border-[rgb(var(--color-secondary)/0.25)] dark:border-[rgb(var(--color-secondary))]/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إلى مخزن</p>
                    <p className="text-sm font-bold text-[rgb(var(--color-secondary))] dark:text-[rgb(var(--color-secondary))]">{savedPrintData.toWarehouseName}</p>
                  </div>
                  <div className="bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] rounded-[var(--border-radius-lg)] p-3 text-center border border-[rgb(var(--color-warning)/0.25)] dark:border-[rgb(var(--color-warning))]/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">رقم المرجع</p>
                    <p className="text-sm font-bold text-[rgb(var(--color-warning))]">{savedPrintData.transferNo}</p>
                  </div>
                  <div className="bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] rounded-[var(--border-radius-lg)] p-3 text-center border border-[rgb(var(--color-success)/0.25)] dark:border-[rgb(var(--color-success))]/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إجمالي القطع</p>
                    <p className="text-sm font-bold text-[rgb(var(--color-success))]">{totalPieces}</p>
                  </div>
                </div>

                {savedPrintData.items && savedPrintData.items.length > 0 && (
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden">
                    <div className="grid grid-cols-12 gap-0 bg-[var(--color-bg)] px-3 py-2 text-[10px] font-bold text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
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
            </OpsDashPanel>
          )}
        </div>
      )}

      <div style={{ position: 'fixed', right: 0, top: 0, opacity: 0, pointerEvents: 'none', zIndex: 0 }}>
        <StockTransferPrint ref={transferPrintRef} data={hiddenPrintData} printSettings={printTemplate} />
      </div>
      <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, direction: 'rtl', minWidth: 640, width: 'max-content' }}>
        <StockTransferShareCard
          ref={transferShareCardRef}
          data={hiddenPrintData}
          companyName={companyName}
          version={APP_VERSION ?? ''}
        />
      </div>
    </ModuleOpsPageShell>
  );
};
