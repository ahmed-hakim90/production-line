import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { Card, Button, SearchableSelect } from '../components/UI';
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

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  executed: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

type ComponentOption = {
  id: string;
  itemType: InventoryItemType;
  name: string;
  code: string;
  unit: string;
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
  const {
    scoped,
    warehouseIds,
    warehouseSelectLocked,
    filterWarehouses,
    routingConfigured,
    settingsPath,
  } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const { warehouseId: suppliesWarehouseId, warehouseName: suppliesWarehouseName } = useRawMaterialWarehouse();

  const products = useAppStore((s) => s.products);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const uid = useAppStore((s) => s.uid);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const actor = userDisplayName || userEmail || 'Current User';

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [racks, setRacks] = useState<WarehouseRack[]>([]);
  const [componentOptions, setComponentOptions] = useState<ComponentOption[]>([]);
  const [orders, setOrders] = useState<SuppliesReceiptOrder[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [containerRef, setContainerRef] = useState('');
  const [note, setNote] = useState('');
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [standaloneLines, setStandaloneLines] = useState<SuppliesReceiptLine[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [fillingKey, setFillingKey] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [printOrder, setPrintOrder] = useState<SuppliesReceiptOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'مستند استلام مستلزمات',
  });

  const queryWarehouseId = searchParams.get('warehouseId') || '';

  const load = useCallback(async () => {
    const [whs, locs, rackRows, materials, raws, receiptRows] = await Promise.all([
      warehouseService.getActiveWarehouses(),
      warehouseLocationService.getAll(),
      warehouseRackService.getAll(),
      materialService.getAll().catch(() => []),
      rawMaterialService.getAll().catch(() => []),
      suppliesReceiptService.getAll(),
    ]);
    const scopedWhs = filterWarehouses(whs);
    setWarehouses(scopedWhs);
    setLocations(locs);
    setRacks(rackRows);

    const materialOpts: ComponentOption[] = materials
      .filter((m) => m.id && m.isActive !== false)
      .map((m) => ({
        id: m.id!,
        itemType: 'material' as const,
        name: m.name,
        code: m.code,
        unit: m.baseUnit || 'unit',
      }));
    const rawOpts: ComponentOption[] = raws
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
    setComponentOptions(merged);

    const scopedOrders = !scoped
      ? receiptRows
      : allowedWarehouseIds.size === 0
        ? []
        : receiptRows.filter((row) => allowedWarehouseIds.has(row.warehouseId));
    setOrders(scopedOrders);

    setWarehouseId((prev) => {
      if (queryWarehouseId && scopedWhs.some((w) => w.id === queryWarehouseId)) return queryWarehouseId;
      if (suppliesWarehouseId && scopedWhs.some((w) => w.id === suppliesWarehouseId)) return suppliesWarehouseId;
      if (prev && scopedWhs.some((w) => w.id === prev)) return prev;
      return scopedWhs[0]?.id || '';
    });
  }, [
    allowedWarehouseIds,
    filterWarehouses,
    queryWarehouseId,
    scoped,
    suppliesWarehouseId,
  ]);

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

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.code})`,
      })),
    [products],
  );

  const componentSelectOptions = useMemo(
    () =>
      componentOptions.map((c) => ({
        value: `${c.itemType}::${c.id}`,
        label: `${c.name} (${c.code})`,
      })),
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
    setMessage('');
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
      setMessage(`تم تعبئة مكونات ${product?.name || 'المنتج'} من الـ BOM.`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'تعذر تعبئة مكونات المنتج.');
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

  const createDraft = async () => {
    setMessage('');
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
      setMessage(id ? 'تم حفظ مستند الاستلام كمسودة.' : 'تعذر الحفظ.');
      resetForm();
      await load();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء مستند الاستلام.');
    } finally {
      setBusy(false);
    }
  };

  const actionOrder = async (
    order: SuppliesReceiptOrder,
    action: 'submit' | 'approve' | 'execute' | 'reject' | 'delete',
  ) => {
    if (!order.id) return;
    setMessage('');
    setBusy(true);
    try {
      if (action === 'submit') await suppliesReceiptService.submit(order.id);
      if (action === 'approve') await suppliesReceiptService.approve(order.id, actor, uid || undefined);
      if (action === 'execute') await suppliesReceiptService.execute(order.id, actor, uid || undefined);
      if (action === 'reject') {
        const reason = window.prompt('سبب الرفض:', '') || '';
        await suppliesReceiptService.reject(order.id, actor, reason, uid || undefined);
      }
      if (action === 'delete') {
        const ok = window.confirm(`حذف مستند الاستلام ${order.referenceNo}؟ لا يمكن التراجع.`);
        if (!ok) {
          setBusy(false);
          return;
        }
        await suppliesReceiptService.remove(order.id);
        setMessage('تم حذف مستند الاستلام.');
      } else {
        setMessage('تم تحديث مستند الاستلام.');
      }
      await load();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'تعذر تحديث مستند الاستلام.');
    } finally {
      setBusy(false);
    }
  };

  const print = async (order: SuppliesReceiptOrder) => {
    setPrintOrder(order);
    await new Promise((r) => window.setTimeout(r, 80));
    handlePrint();
  };

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(listPage, totalPages);
  const pagedOrders = useMemo(
    () => orders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [orders, safePage],
  );

  if (!can('inventory.transactions.create')) {
    return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية تسجيل حركات المخزون.</p>;
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
          <SearchableSelect
            options={componentSelectOptions}
            value={line.itemId ? `${line.itemType}::${line.itemId}` : ''}
            onChange={(value) => onChange(setLineComponent(line, value))}
            placeholder="اختر المكون"
          />
        ) : (
          <>
            <p className="font-semibold">{line.itemName || '—'}</p>
            <p className="font-mono text-xs text-slate-500">{line.itemCode}</p>
            {line.suggestedQty != null && (
              <p className="text-[11px] font-bold text-slate-500">
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
          <span className="text-xs text-slate-400">بدون لوكيشنات</span>
        )}
        {line.defaultLocationCode && (
          <p className="mt-1 text-[11px] font-bold text-emerald-700">افتراضي: {line.defaultLocationCode}</p>
        )}
      </td>
      <td className="p-3 text-center">
        <button type="button" className="text-xs font-bold text-rose-700" onClick={onRemove}>حذف</button>
      </td>
    </tr>
  );

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader
        title="استلام مستلزمات"
        subtitle="استلام حاويات/شحنات: منتج مفكك بمكوناته من الـ BOM أو مكونات مستقلة — مع اعتماد قبل إدخال الرصيد."
        icon="inventory_2"
      />

      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      <Card title="بيانات الاستلام">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <select
            className="rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            disabled={warehouseSelectLocked}
          >
            <option value="">اختر المخزن</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="مرجع الحاوية / الشحنة (اختياري)"
            value={containerRef}
            onChange={(e) => setContainerRef(e.target.value)}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
            placeholder="ملاحظة"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {message && <p className="px-4 pb-2 text-sm font-bold text-primary">{message}</p>}
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <Button variant="secondary" disabled={busy} onClick={addProductGroup}>إضافة منتج مفكك</Button>
          <Button variant="secondary" disabled={busy} onClick={addStandalone}>إضافة مكون فقط</Button>
          <Button disabled={busy || (!groups.length && !standaloneLines.length)} onClick={() => void createDraft()}>
            حفظ مسودة
          </Button>
        </div>
      </Card>

      {groups.map((group, gIndex) => (
        <Card
          key={group.key}
          className="!p-0 overflow-hidden"
          title={`منتج مفكك #${gIndex + 1}${group.productName ? ` — ${group.productName}` : ''}`}
        >
          <div className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-6">
            <div className="md:col-span-3">
              <SearchableSelect
                options={productOptions}
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
                placeholder="اختر المنتج"
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
                  <tr className="border-b bg-slate-50">
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
        </Card>
      ))}

      {standaloneLines.length > 0 && (
        <Card className="!p-0 overflow-hidden" title="مكونات مستقلة">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
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
        </Card>
      )}

      <Card className="!p-0 overflow-hidden" title="مستندات الاستلام">
        <div className="overflow-x-auto">
          <table className="erp-table w-full border-collapse text-right text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">المرجع</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th">الحاوية</th>
                <th className="erp-th text-center">مجموعات</th>
                <th className="erp-th text-center">مستقلة</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">لا توجد مستندات استلام.</td>
                </tr>
              ) : (
                pagedOrders.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3">{row.warehouseName || row.warehouseId}</td>
                    <td className="px-4 py-3">{row.containerRef || '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.groups?.length || 0}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.standaloneLines?.length || 0}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="space-x-1 space-x-reverse px-4 py-3 text-center">
                      {row.status === 'draft' && (
                        <button className="text-xs font-bold text-primary" disabled={busy} onClick={() => void actionOrder(row, 'submit')}>تقديم</button>
                      )}
                      {row.status === 'submitted' && (
                        <button className="text-xs font-bold text-emerald-700" disabled={busy} onClick={() => void actionOrder(row, 'approve')}>اعتماد</button>
                      )}
                      {row.status === 'submitted' && (
                        <button className="text-xs font-bold text-rose-700" disabled={busy} onClick={() => void actionOrder(row, 'reject')}>رفض</button>
                      )}
                      {row.status === 'approved' && (
                        <button className="text-xs font-bold text-primary" disabled={busy} onClick={() => void actionOrder(row, 'execute')}>تنفيذ</button>
                      )}
                      {(row.status === 'draft' || row.status === 'rejected' || row.status === 'cancelled') && (
                        <button className="text-xs font-bold text-rose-700" disabled={busy} onClick={() => void actionOrder(row, 'delete')}>حذف</button>
                      )}
                      {can('inventory.transactions.print') && (
                        <button className="text-xs font-bold text-slate-700" disabled={busy} onClick={() => void print(row)}>طباعة</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={orders.length}
          onPageChange={setListPage}
          itemLabel="مستند"
        />
      </Card>

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: -1,
          pointerEvents: 'none',
          direction: 'rtl',
          width: '210mm',
          maxWidth: 'none',
          overflow: 'visible',
        }}
      >
        <SuppliesReceiptPrint ref={printRef} order={printOrder} printSettings={printTemplate} />
      </div>
    </div>
  );
};
