import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { Button, SearchableSelect } from '../components/UI';
import { VoucherItemCombobox } from '../components/VoucherItemCombobox';
import { buildCodeVoucherPicker } from '../lib/materialVoucherPicker';
import { SuppliesReceiptPrint } from '../components/SuppliesReceiptPrint';
import { suppliesReceiptService } from '../services/suppliesReceiptService';
import { warehouseService } from '../services/warehouseService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';
import { materialService } from '../../manufacturing/services/materialService';
import { rawMaterialService } from '../services/rawMaterialService';
import { useRawMaterialWarehouse } from '../hooks/useRawMaterialWarehouse';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import type {
  InventoryItemType,
  SuppliesReceiptLine,
  SuppliesReceiptOrder,
  SuppliesReceiptProductGroup,
  Warehouse,
  WarehouseLocation,
  WarehouseRack,
} from '../types';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '../../../utils/printManager';
import { INVENTORY_DOCUMENT_PATHS } from '../../system/lib/operationPathSettings';
import { exportToPDF, waitForExportPaint } from '../../../utils/reportExport';
import { toast } from '../../../components/Toast';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

const PAGE_SIZE = 20;
const SUPPLIES_RECEIPT_CACHE_KEY = 'inventory:supplies-receipt';
const CONSUMABLE_RECEIPT_CACHE_KEY = 'inventory:consumable-receipt';

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  executed: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

const formatReceiptDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type ComponentOption = {
  id: string;
  itemType: InventoryItemType;
  name: string;
  code: string;
  barcode?: string;
  unit: string;
};

type SuppliesReceiptListData = {
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  racks: WarehouseRack[];
  componentOptions: ComponentOption[];
  orders: SuppliesReceiptOrder[];
};

type DraftGroup = SuppliesReceiptProductGroup & { key: string };

const emptyLine = (): SuppliesReceiptLine => ({
  itemType: 'material',
  itemId: '',
  itemName: '',
  itemCode: '',
  unit: 'unit',
  quantity: 0,
  locationId: '',
  locationCode: '',
});

export const SuppliesReceipt: React.FC = () => {
  const { can } = usePermission();
  const [searchParams] = useSearchParams();
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canPrint = can('inventory.transactions.print');
  const consumableMode = searchParams.get('materialType') === 'consumable';
  const {
    scoped,
    warehouseIds,
    warehouseSelectLocked,
    filterWarehouses,
    routingConfigured,
    settingsPath,
  } = useMaterialsWarehouseScope();
  // Consumable receive may target any active warehouse (not only supplies scope).
  const effectiveScoped = consumableMode ? false : scoped;
  const allowedWarehouseIds = useMemo(
    () => (consumableMode ? new Set<string>() : new Set(warehouseIds)),
    [consumableMode, warehouseIds],
  );
  const { warehouseId: suppliesWarehouseId, warehouseName: suppliesWarehouseName } = useRawMaterialWarehouse();

  const products = useAppStore((s) => s.products);
  const rawProducts = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const uid = useAppStore((s) => s.uid);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const actor = userDisplayName || userEmail || 'Current User';
  const queryWarehouseId = searchParams.get('warehouseId') || '';

  const cacheKey = consumableMode ? CONSUMABLE_RECEIPT_CACHE_KEY : SUPPLIES_RECEIPT_CACHE_KEY;
  const effectiveWarehouseSelectLocked = consumableMode ? false : warehouseSelectLocked;

  const initialListCache = peekPageDataCache<SuppliesReceiptListData>(cacheKey);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() =>
    initialListCache
      ? (consumableMode ? initialListCache.warehouses : filterWarehouses(initialListCache.warehouses))
      : [],
  );
  const [locations, setLocations] = useState<WarehouseLocation[]>(() => initialListCache?.locations ?? []);
  const [racks, setRacks] = useState<WarehouseRack[]>(() => initialListCache?.racks ?? []);
  const [componentOptions, setComponentOptions] = useState<ComponentOption[]>(
    () => initialListCache?.componentOptions ?? [],
  );
  const [orders, setOrders] = useState<SuppliesReceiptOrder[]>(() => {
    if (!initialListCache) return [];
    if (!effectiveScoped) return initialListCache.orders;
    if (allowedWarehouseIds.size === 0) return [];
    return initialListCache.orders.filter((row) => allowedWarehouseIds.has(row.warehouseId));
  });
  const [warehouseId, setWarehouseId] = useState('');
  const [containerRef, setContainerRef] = useState('');
  const [note, setNote] = useState('');
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [standaloneLines, setStandaloneLines] = useState<SuppliesReceiptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [fillingKey, setFillingKey] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [printOrder, setPrintOrder] = useState<SuppliesReceiptOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'اذن-استلام-مستلزمات',
  });

  const applyListData = useCallback((data: SuppliesReceiptListData) => {
    const scopedWhs = consumableMode ? data.warehouses : filterWarehouses(data.warehouses);
    setWarehouses(scopedWhs);
    setLocations(data.locations);
    setRacks(data.racks);
    setComponentOptions(data.componentOptions);
    const scopedOrders = !effectiveScoped
      ? data.orders
      : allowedWarehouseIds.size === 0
        ? []
        : data.orders.filter((row) => allowedWarehouseIds.has(row.warehouseId));
    setOrders(scopedOrders);
    setWarehouseId((prev) => {
      if (queryWarehouseId && scopedWhs.some((w) => w.id === queryWarehouseId)) return queryWarehouseId;
      if (suppliesWarehouseId && scopedWhs.some((w) => w.id === suppliesWarehouseId)) return suppliesWarehouseId;
      if (prev && scopedWhs.some((w) => w.id === prev)) return prev;
      return scopedWhs[0]?.id || '';
    });
  }, [
    allowedWarehouseIds,
    consumableMode,
    effectiveScoped,
    filterWarehouses,
    queryWarehouseId,
    suppliesWarehouseId,
  ]);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<SuppliesReceiptListData>(cacheKey);
    if (cached) applyListData(cached);
    const { data } = await fetchCachedPageData(
      cacheKey,
      async () => {
        const [whs, locs, rackRows, materials, raws, receiptRows] = await Promise.all([
          warehouseService.getActiveWarehouses(),
          warehouseLocationService.getAll(),
          warehouseRackService.getAll(),
          materialService.getAll().catch(() => []),
          rawMaterialService.getAll().catch(() => []),
          suppliesReceiptService.getAll(),
        ]);

        const materialOpts: ComponentOption[] = materials
          .filter((m) => m.id && m.isActive !== false)
          .filter((m) => (consumableMode ? m.type === 'consumable' : true))
          .map((m) => ({
            id: m.id!,
            itemType: 'material' as const,
            name: m.name,
            code: m.code,
            barcode: String(m.barcode || '').trim() || undefined,
            unit: m.baseUnit || 'unit',
          }));
        const rawOpts: ComponentOption[] = consumableMode
          ? []
          : raws
            .filter((m) => m.id && m.isActive !== false)
            .map((m) => ({
              id: m.id!,
              itemType: 'raw_material' as const,
              name: m.name,
              code: m.code,
              unit: m.unit || 'unit',
            }));
        // Prefer manufacturing materials; append raws not already covered by code.
        const codes = new Set(materialOpts.map((o) => o.code.trim().toLowerCase()).filter(Boolean));
        const merged = [
          ...materialOpts,
          ...rawOpts.filter((o) => !codes.has(o.code.trim().toLowerCase())),
        ];

        return {
          warehouses: whs,
          locations: locs,
          racks: rackRows,
          componentOptions: merged,
          orders: receiptRows,
        };
      },
      { force: opts?.force === true, maxAgeMs: 45_000 },
    );
    applyListData(data);
  }, [applyListData, cacheKey, consumableMode]);

  const reloadList = useCallback(async () => {
    invalidatePageDataCache(cacheKey);
    await load({ force: true });
  }, [cacheKey, load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setListPage(1);
  }, [orders.length]);

  const inactiveRackIds = useMemo(
    () => new Set(racks.filter((rack) => rack.isActive === false).map((rack) => rack.id).filter(Boolean)),
    [racks],
  );

  const warehouseLocations = useMemo(
    () =>
      locations.filter(
        (loc) =>
          loc.warehouseId === warehouseId
          && loc.isActive !== false
          && (!loc.rackId || !inactiveRackIds.has(loc.rackId)),
      ),
    [locations, warehouseId, inactiveRackIds],
  );

  const warehouse = warehouses.find((w) => w.id === warehouseId);
  const locationsRequired = warehouseLocations.length > 0;

  const productPicker = useMemo(() => {
    const barcodeById = new Map(
      rawProducts
        .filter((p) => p.id)
        .map((p) => [String(p.id), String(p.barcode || '').trim()] as const),
    );
    return buildCodeVoucherPicker(
      products.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.code})`,
        name: p.name,
        code: p.code,
        barcode: barcodeById.get(p.id) || undefined,
        stockItemType: 'finished_good' as const,
      })),
    );
  }, [products, rawProducts]);

  const componentPicker = useMemo(
    () =>
      buildCodeVoucherPicker(
        componentOptions.map((c) => ({
          value: `${c.itemType}::${c.id}`,
          label: `${c.name} (${c.code})`,
          name: c.name,
          code: c.code,
          barcode: c.barcode,
          stockItemType: c.itemType,
        })),
      ),
    [componentOptions],
  );

  const locationOptions = useMemo(
    () =>
      warehouseLocations.map((loc) => ({
        value: loc.id || '',
        label: loc.code,
      })),
    [warehouseLocations],
  );

  const firstLocation = warehouseLocations[0];

  const applyLocationDefaults = (line: Omit<SuppliesReceiptLine, 'locationId' | 'locationCode'> | SuppliesReceiptLine): SuppliesReceiptLine => ({
    ...line,
    locationId: ('locationId' in line && line.locationId)
      || line.defaultLocationId
      || firstLocation?.id
      || '',
    locationCode: ('locationCode' in line && line.locationCode)
      || line.defaultLocationCode
      || firstLocation?.code
      || '',
  });

  const addProductGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        key: `g-${Date.now()}-${prev.length}`,
        productId: '',
        productName: '',
        productCode: '',
        quantity: 0,
        lines: [],
      },
    ]);
  };

  const removeGroup = (key: string) => {
    setGroups((prev) => prev.filter((g) => g.key !== key));
  };

  const updateGroup = (key: string, patch: Partial<DraftGroup>) => {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  };

  const fillGroupBom = async (
    key: string,
    override?: { productId?: string; quantity?: number },
  ) => {
    const group = groups.find((g) => g.key === key);
    if (!group && !override) return;
    const productId = override?.productId ?? group?.productId ?? '';
    const quantity = override?.quantity ?? Number(group?.quantity || 0);
    setFillingKey(key);
    try {
      if (!productId) throw new Error('اختر المنتج أولاً.');
      if (!(quantity > 0)) throw new Error('أدخل كمية المنتج.');
      const product = products.find((p) => p.id === productId);
      const rows = await suppliesReceiptService.previewGroupLines(
        productId,
        quantity,
        warehouseId,
      );
      updateGroup(key, {
        productId,
        productName: product?.name || group?.productName || '',
        productCode: product?.code || group?.productCode || '',
        quantity,
        lines: rows.map((row) => applyLocationDefaults(row)),
      });
      toast.success(`تم تعبئة مكونات ${product?.name || 'المنتج'} من الـ BOM.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تعبئة مكونات المنتج.');
    } finally {
      setFillingKey(null);
    }
  };

  const updateGroupLine = (key: string, index: number, patch: Partial<SuppliesReceiptLine>) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== key) return g;
        const lines = [...g.lines];
        lines[index] = { ...lines[index], ...patch };
        return { ...g, lines };
      }),
    );
  };

  const removeGroupLine = (key: string, index: number) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== key) return g;
        return { ...g, lines: g.lines.filter((_, i) => i !== index) };
      }),
    );
  };

  const addGroupLine = (key: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== key) return g;
        return { ...g, lines: [...g.lines, applyLocationDefaults(emptyLine())] };
      }),
    );
  };

  const setLineComponent = (
    line: SuppliesReceiptLine,
    value: string,
  ): SuppliesReceiptLine => {
    const [itemType, itemId] = value.split('::') as [InventoryItemType, string];
    const opt = componentOptions.find((c) => c.itemType === itemType && c.id === itemId);
    if (!opt) return { ...line, itemId: '', itemName: '', itemCode: '' };
    return {
      ...line,
      itemType: opt.itemType,
      itemId: opt.id,
      itemName: opt.name,
      itemCode: opt.code,
      unit: opt.unit,
    };
  };

  const addStandalone = () => {
    setStandaloneLines((prev) => [...prev, applyLocationDefaults(emptyLine())]);
  };

  const updateStandalone = (index: number, patch: Partial<SuppliesReceiptLine>) => {
    setStandaloneLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeStandalone = (index: number) => {
    setStandaloneLines((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setGroups([]);
    setStandaloneLines([]);
    setContainerRef('');
    setNote('');
  };

  const print = async (order: SuppliesReceiptOrder) => {
    setPrintOrder(order);
    await waitForExportPaint(80);
    if (isMobilePrint && printRef.current) {
      await exportToPDF(printRef.current, `اذن-استلام-${order.referenceNo}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: 1,
      });
      return;
    }
    handlePrint();
  };

  const createDraft = async () => {
    setBusy(true);
    try {
      const payloadGroups: SuppliesReceiptProductGroup[] = groups.map(({ key: _key, ...rest }) => rest);
      const id = await suppliesReceiptService.create({
        warehouseId,
        warehouseName: warehouse?.name || suppliesWarehouseName,
        containerRef,
        groups: payloadGroups,
        standaloneLines,
        createdBy: actor,
        createdByUserId: uid || undefined,
        note: note || undefined,
      });
      const created = id ? await suppliesReceiptService.getById(id) : null;
      if (!id) {
        toast.error('تعذر الحفظ.');
      } else {
        toast.success(canPrint ? 'تم حفظ إذن الاستلام كمسودة وطباعته.' : 'تم حفظ إذن الاستلام كمسودة.');
      }
      resetForm();
      await reloadList();
      if (canPrint && created) {
        await print(created);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء إذن الاستلام.');
    } finally {
      setBusy(false);
    }
  };

  const actionOrder = async (
    order: SuppliesReceiptOrder,
    action: 'submit' | 'approve' | 'execute' | 'reject' | 'delete',
  ) => {
    if (!order.id) return;
    setBusy(true);
    try {
      if (action === 'submit') await suppliesReceiptService.submit(order.id);
      if (action === 'approve') await suppliesReceiptService.approve(
        order.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.operationPage },
        uid || undefined,
      );
      if (action === 'execute') await suppliesReceiptService.execute(
        order.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.operationPage },
        uid || undefined,
      );
      if (action === 'reject') {
        const reason = window.prompt('سبب الرفض:', '') || '';
        await suppliesReceiptService.reject(
          order.id,
          actor,
          { path: INVENTORY_DOCUMENT_PATHS.operationPage },
          reason,
          uid || undefined,
        );
      }
      if (action === 'delete') {
        const ok = window.confirm(`حذف إذن الاستلام ${order.referenceNo}؟ لا يمكن التراجع.`);
        if (!ok) {
          setBusy(false);
          return;
        }
        await suppliesReceiptService.remove(order.id);
        toast.success('تم حذف إذن الاستلام.');
      } else {
        toast.success('تم تحديث إذن الاستلام.');
      }
      await reloadList();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث إذن الاستلام.');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(listPage, totalPages);
  const pagedOrders = useMemo(
    () => orders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [orders, safePage],
  );
  const selectedOrder =
    orders.find((row) => row.id === selectedOrderId)
    || pagedOrders[0]
    || null;

  if (!can('inventory.transactions.create')) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية تسجيل حركات المخزون.</p>;
  }

  const renderLineEditor = (
    line: SuppliesReceiptLine,
    index: number,
    onChange: (patch: Partial<SuppliesReceiptLine>) => void,
    onRemove: () => void,
    allowPickComponent: boolean,
  ) => (
    <tr key={`${line.itemType}-${line.itemId}-${index}`} className="border-b align-top">
      <td className="p-3">
        {allowPickComponent ? (
          <VoucherItemCombobox
            options={componentPicker.options}
            catalog={componentPicker.catalog}
            value={line.itemId ? `${line.itemType}::${line.itemId}` : ''}
            onChange={(value) => onChange(setLineComponent(line, value))}
            placeholder="ابحث بالاسم أو امسح الباركود"
          />
        ) : (
          <>
            <p className="font-semibold">{line.itemName || '—'}</p>
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{line.itemCode}</p>
            {line.suggestedQty != null && (
              <p className="text-[11px] font-bold text-[var(--color-text-muted)]">
                مقترح BOM: {Number(line.suggestedQty).toLocaleString('en-US')}
              </p>
            )}
          </>
        )}
      </td>
      <td className="p-3 text-center">
        <input
          className="w-28 rounded-lg border px-2 py-1.5 text-center text-sm tabular-nums"
          type="number"
          min={0}
          step="any"
          value={line.quantity || ''}
          onChange={(e) => onChange({ quantity: Number(e.target.value || 0) })}
        />
      </td>
      <td className="p-3">
        {locationsRequired ? (
          <SearchableSelect
            options={locationOptions}
            value={line.locationId}
            onChange={(value) => {
              const loc = warehouseLocations.find((l) => l.id === value);
              onChange({ locationId: value, locationCode: loc?.code || '' });
            }}
            placeholder="اللوكيشن"
          />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">بدون لوكيشنات</span>
        )}
        {line.defaultLocationCode && (
          <p className="mt-1 text-[11px] font-bold text-[rgb(var(--color-success))]">افتراضي: {line.defaultLocationCode}</p>
        )}
      </td>
      <td className="p-3 text-center">
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>حذف</Button>
      </td>
    </tr>
  );

  return (
    <ModuleOpsPageShell
      eyebrow={consumableMode ? 'استلام مستهلكات' : 'استلام مستلزمات'}
      rangeLabel={
        consumableMode
          ? 'إضافة مواد استهلاكية لأي مخزن نشط — مع اعتماد قبل إدخال الرصيد.'
          : 'استلام بأمر توريد أو حاوية/شحنة: منتج مفكك بمكوناته من الـ BOM أو مكونات مستقلة — مع اعتماد قبل إدخال الرصيد.'
      }
    >
      {!consumableMode && (
        <MaterialsWarehouseScopeBanner
          scoped={scoped}
          routingConfigured={routingConfigured}
          settingsPath={settingsPath}
        />
      )}

      <OpsDashPanel accent="inventory" title={consumableMode ? 'إنشاء إذن استلام مستهلكات' : 'إنشاء إذن استلام مستلزمات'}>
        <div className="grid grid-cols-1 items-end gap-3 p-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(250px,1fr)_minmax(280px,1.4fr)]">
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">مخزن الاستلام</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-[var(--color-bg)] disabled:text-[var(--color-text)]"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={effectiveWarehouseSelectLocked}
            >
              <option value="">اختر المخزن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">رقم أمر التوريد / الحاوية / الشحنة</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="اختياري"
              value={containerRef}
              onChange={(e) => setContainerRef(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">ملاحظة</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="اختياري"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {!consumableMode && (
            <Button variant="secondary" disabled={busy} onClick={addProductGroup}>إضافة منتج مفكك</Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={addStandalone}>
            {consumableMode ? 'إضافة مستهلك' : 'إضافة مكون فقط'}
          </Button>
          <Button
            variant="primary"
            disabled={busy || (!groups.length && !standaloneLines.length)}
            onClick={() => void createDraft()}
          >
            {canPrint ? 'حفظ مسودة وطباعة' : 'حفظ مسودة'}
          </Button>
        </div>
      </OpsDashPanel>

      {groups.map((group, gIndex) => (
        <OpsDashPanel accent="inventory"
          key={group.key}
          className="!p-0 overflow-hidden"
          title={`منتج مفكك #${gIndex + 1}${group.productName ? ` — ${group.productName}` : ''}`}
        >
          <div className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-6">
            <div className="md:col-span-3">
              <VoucherItemCombobox
                options={productPicker.options}
                catalog={productPicker.catalog}
                value={group.productId}
                onChange={(value) => {
                  const product = products.find((p) => p.id === value);
                  const qty = Number(group.quantity || 0);
                  updateGroup(group.key, {
                    productId: value,
                    productName: product?.name || '',
                    productCode: product?.code || '',
                    lines: [],
                  });
                  if (value && qty > 0) {
                    void fillGroupBom(group.key, { productId: value, quantity: qty });
                  }
                }}
                placeholder="ابحث بالاسم أو امسح الباركود"
              />
            </div>
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              type="number"
              min={0}
              placeholder="الكمية الإجمالية"
              value={group.quantity || ''}
              onChange={(e) => {
                const qty = Number(e.target.value || 0);
                updateGroup(group.key, { quantity: qty, lines: [] });
              }}
              onBlur={(e) => {
                const qty = Number(e.currentTarget.value || 0);
                if (group.productId && qty > 0) {
                  void fillGroupBom(group.key, { productId: group.productId, quantity: qty });
                }
              }}
            />
            <Button
              disabled={Boolean(fillingKey) || busy}
              onClick={() => void fillGroupBom(group.key)}
            >
              {fillingKey === group.key ? 'جاري التعبئة…' : 'تعبئة من BOM'}
            </Button>
            <Button variant="secondary" disabled={busy || Boolean(fillingKey)} onClick={() => removeGroup(group.key)}>حذف المجموعة</Button>
          </div>
          {group.lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-[var(--color-bg)]">
                    <th className="p-3 text-start">المكون</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-start">اللوكيشن</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((line, index) =>
                    renderLineEditor(
                      line,
                      index,
                      (patch) => updateGroupLine(group.key, index, patch),
                      () => removeGroupLine(group.key, index),
                      false,
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2 p-4">
            <Button variant="secondary" disabled={busy} onClick={() => addGroupLine(group.key)}>إضافة مكون للمجموعة</Button>
          </div>
        </OpsDashPanel>
      ))}

      {standaloneLines.length > 0 && (
        <OpsDashPanel accent="inventory" className="!p-0 overflow-hidden" title="مكونات مستقلة">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[var(--color-bg)]">
                  <th className="p-3 text-start">المكون</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3 text-start">اللوكيشن</th>
                  <th className="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {standaloneLines.map((line, index) =>
                  renderLineEditor(
                    line,
                    index,
                    (patch) => updateStandalone(index, patch),
                    () => removeStandalone(index),
                    true,
                  ))}
              </tbody>
            </table>
          </div>
        </OpsDashPanel>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <OpsDashPanel accent="inventory" className="!p-0 overflow-hidden" title="إذونات الاستلام">
          {orders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد إذونات استلام بعد.</p>
          ) : (
            <>
              {pagedOrders.map((row) => {
                const componentCount =
                  (row.groups || []).reduce((sum, group) => sum + (group.lines || []).length, 0)
                  + (row.standaloneLines?.length || 0);
                return (
                  <button
                    key={row.id || row.referenceNo}
                    type="button"
                    className={`block w-full border-b px-4 py-3 text-start transition-colors ${
                      selectedOrder?.id === row.id
                        ? 'bg-primary/10'
                        : 'hover:bg-[var(--color-surface-hover)] dark:hover:bg-[var(--color-surface-hover)]'
                    }`}
                    onClick={() => setSelectedOrderId(row.id || '')}
                  >
                    <p className="font-bold">{row.referenceNo}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {row.warehouseName || row.warehouseId} - {STATUS_LABELS[row.status] || row.status}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {row.containerRef ? `أمر التوريد: ${row.containerRef} · ` : ''}
                      {componentCount.toLocaleString('en-US')} مكون
                    </p>
                  </button>
                );
              })}
              <DataPaginationFooter
                page={safePage}
                totalPages={totalPages}
                totalItems={orders.length}
                onPageChange={setListPage}
                itemLabel="إذن"
              />
            </>
          )}
        </OpsDashPanel>

        <OpsDashPanel accent="inventory"
          className="!p-0 overflow-hidden"
          title={selectedOrder ? `تفاصيل ${selectedOrder.referenceNo}` : 'التفاصيل'}
        >
          {selectedOrder ? (
            <>
              <div className="flex flex-wrap gap-2 border-b p-4">
                {selectedOrder.status === 'draft' && (
                  <ToneActionButton
                    action="submit"
                    disabled={busy}
                    onClick={() => void actionOrder(selectedOrder, 'submit')}
                  >
                    تقديم للاعتماد
                  </ToneActionButton>
                )}
                {selectedOrder.status === 'submitted' && (
                  <>
                    <ToneActionButton
                      action="approve"
                      disabled={busy}
                      onClick={() => void actionOrder(selectedOrder, 'approve')}
                    >
                      اعتماد الإذن
                    </ToneActionButton>
                    <ToneActionButton
                      action="reject"
                      disabled={busy}
                      onClick={() => void actionOrder(selectedOrder, 'reject')}
                    >
                      رفض الإذن
                    </ToneActionButton>
                  </>
                )}
                {selectedOrder.status === 'approved' && (
                  <ToneActionButton
                    action="execute"
                    solid
                    disabled={busy}
                    onClick={() => void actionOrder(selectedOrder, 'execute')}
                  >
                    تنفيذ الاستلام
                  </ToneActionButton>
                )}
                {(selectedOrder.status === 'draft'
                  || selectedOrder.status === 'rejected'
                  || selectedOrder.status === 'cancelled') && (
                  <ToneActionButton
                    action="delete"
                    disabled={busy}
                    onClick={() => void actionOrder(selectedOrder, 'delete')}
                  >
                    حذف الإذن
                  </ToneActionButton>
                )}
                {canPrint && (
                  <ToneActionButton
                    action="print"
                    disabled={busy}
                    onClick={() => void print(selectedOrder)}
                  >
                    طباعة PDF
                  </ToneActionButton>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 border-b bg-[var(--color-bg)] p-4 md:grid-cols-4 dark:bg-[var(--color-surface-hover)]">
                <div className="rounded-lg border bg-[var(--color-card)] p-3 dark:bg-[var(--color-card)]">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">مخزن الاستلام</p>
                  <p className="mt-1 text-sm font-black">
                    {selectedOrder.warehouseName || selectedOrder.warehouseId}
                  </p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3 dark:bg-[var(--color-card)]">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">أمر التوريد / الشحنة</p>
                  <p className="mt-1 text-sm font-black">{selectedOrder.containerRef || '—'}</p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3 dark:bg-[var(--color-card)]">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">الحالة</p>
                  <p className="mt-1 text-sm font-black">
                    {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                  </p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3 dark:bg-[var(--color-card)]">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">تاريخ الإنشاء</p>
                  <p className="mt-1 text-sm font-black tabular-nums">
                    {formatReceiptDate(selectedOrder.createdAt)}
                  </p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3 dark:bg-[var(--color-card)]">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">أنشئ بواسطة</p>
                  <p className="mt-1 text-sm font-black">{selectedOrder.createdBy || '—'}</p>
                </div>
              </div>

              {selectedOrder.note?.trim() && (
                <div className="border-b px-4 py-3">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">ملاحظات</p>
                  <p className="mt-1 text-sm font-semibold">{selectedOrder.note}</p>
                </div>
              )}

              {(selectedOrder.groups || []).map((group, groupIndex) => (
                <section key={`${group.productId}-${groupIndex}`} className="border-b last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-bg)] px-4 py-3 dark:bg-[var(--color-surface-hover)]">
                    <div>
                      <p className="text-sm font-black">
                        منتج مفكك #{groupIndex + 1} — {group.productName}
                      </p>
                      {group.productCode && (
                        <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">{group.productCode}</p>
                      )}
                    </div>
                    <p className="text-xs font-bold text-[var(--color-text-muted)]">
                      كمية المنتج: <span className="tabular-nums">{Number(group.quantity || 0).toLocaleString('en-US')}</span>
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--color-bg)] dark:bg-[var(--color-surface-hover)]">
                          <th className="p-3 text-start">المكون</th>
                          <th className="p-3 text-center">الكمية</th>
                          <th className="p-3 text-center">الوحدة</th>
                          <th className="p-3 text-start">اللوكيشن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.lines || []).map((line, lineIndex) => (
                          <tr key={`${line.itemType}-${line.itemId}-${lineIndex}`} className="border-b last:border-b-0">
                            <td className="p-3">
                              <p className="font-bold">{line.itemName}</p>
                              <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">{line.itemCode}</p>
                            </td>
                            <td className="p-3 text-center font-bold tabular-nums">
                              {Number(line.quantity || 0).toLocaleString('en-US')}
                            </td>
                            <td className="p-3 text-center">{line.unit || '—'}</td>
                            <td className="p-3">{line.locationCode || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              {(selectedOrder.standaloneLines || []).length > 0 && (
                <section>
                  <div className="border-b bg-[var(--color-bg)] px-4 py-3 dark:bg-[var(--color-surface-hover)]">
                    <p className="text-sm font-black">
                      {consumableMode ? 'المستهلكات المستلمة' : 'المكونات المستقلة'}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--color-bg)] dark:bg-[var(--color-surface-hover)]">
                          <th className="p-3 text-start">المكون</th>
                          <th className="p-3 text-center">الكمية</th>
                          <th className="p-3 text-center">الوحدة</th>
                          <th className="p-3 text-start">اللوكيشن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.standaloneLines.map((line, lineIndex) => (
                          <tr key={`${line.itemType}-${line.itemId}-${lineIndex}`} className="border-b last:border-b-0">
                            <td className="p-3">
                              <p className="font-bold">{line.itemName}</p>
                              <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">{line.itemCode}</p>
                            </td>
                            <td className="p-3 text-center font-bold tabular-nums">
                              {Number(line.quantity || 0).toLocaleString('en-US')}
                            </td>
                            <td className="p-3 text-center">{line.unit || '—'}</td>
                            <td className="p-3">{line.locationCode || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {(selectedOrder.groups || []).length === 0
                && (selectedOrder.standaloneLines || []).length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد مكونات في هذا الإذن.
                  </p>
                )}
            </>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
              اختر إذناً لعرض تفاصيله.
            </p>
          )}
        </OpsDashPanel>
      </div>

      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          pointerEvents: 'none',
          direction: 'rtl',
          width: '210mm',
          maxWidth: 'none',
          overflow: 'visible',
        }}
      >
        <SuppliesReceiptPrint ref={printRef} order={printOrder} printSettings={printTemplate} />
      </div>
    </ModuleOpsPageShell>
  );
};
