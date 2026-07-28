import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { disassemblyService } from '../services/disassemblyService';
import { warehouseService } from '../services/warehouseService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';
import type { DisassemblyLine, DisassemblyOrder, Warehouse, WarehouseLocation, WarehouseRack } from '../types';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

const DISASSEMBLY_CACHE_KEY = 'inventory:disassembly';

type DisassemblyPageData = {
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  racks: WarehouseRack[];
  orders: DisassemblyOrder[];
};

export const Disassembly: React.FC = () => {
  const { can } = usePermission();
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
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const products = useAppStore((s) => s.products);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const uid = useAppStore((s) => s.uid);
  const initialCache = peekPageDataCache<DisassemblyPageData>(DISASSEMBLY_CACHE_KEY);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() =>
    initialCache ? filterWarehouses(initialCache.warehouses) : [],
  );
  const [locations, setLocations] = useState<WarehouseLocation[]>(() => initialCache?.locations ?? []);
  const [racks, setRacks] = useState<WarehouseRack[]>(() => initialCache?.racks ?? []);
  const [orders, setOrders] = useState<DisassemblyOrder[]>(() => {
    if (!initialCache) return [];
    if (!scoped) return initialCache.orders;
    if (allowedWarehouseIds.size === 0) return [];
    return initialCache.orders.filter(
      (row) =>
        allowedWarehouseIds.has(row.sourceWarehouseId)
        || allowedWarehouseIds.has(row.targetWarehouseId),
    );
  });
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [lines, setLines] = useState<DisassemblyLine[]>([]);
  const [message, setMessage] = useState('');
  const actor = userDisplayName || userEmail || 'Current User';

  const applyPageData = (data: DisassemblyPageData) => {
    const scopedWhs = filterWarehouses(data.warehouses);
    setWarehouses(scopedWhs);
    setLocations(data.locations);
    setRacks(data.racks);
    const scopedOrders = !scoped
      ? data.orders
      : allowedWarehouseIds.size === 0
        ? []
        : data.orders.filter(
          (row) =>
            allowedWarehouseIds.has(row.sourceWarehouseId)
            || allowedWarehouseIds.has(row.targetWarehouseId),
        );
    setOrders(scopedOrders);
    const defaultSource = scopedWhs[0]?.id || '';
    const defaultTarget = scopedWhs.find((w) => w.id !== defaultSource)?.id || scopedWhs[0]?.id || '';
    setSourceWarehouseId((prev) =>
      resolveScopedWarehouseId(prev, [scopedWarehouseId, defaultSource]),
    );
    setTargetWarehouseId((prev) => {
      if (prev && scopedWhs.some((w) => w.id === prev)) return prev;
      return defaultTarget;
    });
  };

  const load = async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<DisassemblyPageData>(DISASSEMBLY_CACHE_KEY);
    if (cached) applyPageData(cached);
    const { data } = await fetchCachedPageData(
      DISASSEMBLY_CACHE_KEY,
      async () => {
        const [whs, locs, rackRows, disRows] = await Promise.all([
          warehouseService.getActiveWarehouses(),
          warehouseLocationService.getAll(),
          warehouseRackService.getAll(),
          disassemblyService.getAll(),
        ]);
        return {
          warehouses: whs,
          locations: locs,
          racks: rackRows,
          orders: disRows,
        };
      },
      { force: opts?.force === true, maxAgeMs: 45_000 },
    );
    applyPageData(data);
  };

  const reload = async () => {
    invalidatePageDataCache(DISASSEMBLY_CACHE_KEY);
    await load({ force: true });
  };

  useEffect(() => {
    void load();
  }, [scoped, scopedWarehouseId, warehouseIds.join('|')]);

  const inactiveRackIds = useMemo(
    () => new Set(racks.filter((rack) => rack.isActive === false).map((rack) => rack.id).filter(Boolean)),
    [racks],
  );
  const targetLocations = useMemo(
    () => locations.filter((loc) =>
      loc.warehouseId === targetWarehouseId
      && loc.isActive !== false
      && (!loc.rackId || !inactiveRackIds.has(loc.rackId))),
    [locations, targetWarehouseId, inactiveRackIds],
  );
  const sourceLocations = useMemo(
    () => locations.filter((loc) =>
      loc.warehouseId === sourceWarehouseId
      && loc.isActive !== false
      && (!loc.rackId || !inactiveRackIds.has(loc.rackId))),
    [locations, sourceWarehouseId, inactiveRackIds],
  );
  const sourceWarehouse = warehouses.find((w) => w.id === sourceWarehouseId);
  const targetWarehouse = warehouses.find((w) => w.id === targetWarehouseId);
  const sourceLocation = sourceLocations.find((loc) => loc.id === sourceLocationId);

  const preview = async () => {
    setMessage('');
    try {
      const rows = await disassemblyService.previewLines(productId, quantity, targetWarehouseId);
      const firstLoc = targetLocations[0];
      setLines(rows.map((row) => ({
        ...row,
        locationId: row.defaultLocationId || firstLoc?.id || '',
        locationCode: row.defaultLocationCode || firstLoc?.code || '',
      })));
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تجهيز مكونات التفكيك.');
    }
  };

  const createRequest = async () => {
    setMessage('');
    try {
      if (lines.some((line) => !line.locationId)) throw new Error('حدد لوكيشن لكل مكون.');
      const id = await disassemblyService.create({
        sourceWarehouseId,
        sourceWarehouseName: sourceWarehouse?.name,
        sourceLocationId: sourceLocation?.id,
        sourceLocationCode: sourceLocation?.code,
        targetWarehouseId,
        targetWarehouseName: targetWarehouse?.name,
        productId,
        quantity,
        lines,
        createdBy: actor,
        createdByUserId: uid || undefined,
      });
      setMessage(`تم إنشاء طلب التفكيك ${id ? 'كمسودة' : ''}.`);
      setLines([]);
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر إنشاء طلب التفكيك.');
    }
  };

  const actionOrder = async (order: DisassemblyOrder, action: 'submit' | 'approve' | 'execute' | 'reject') => {
    if (!order.id) return;
    setMessage('');
    try {
      if (action === 'submit') await disassemblyService.submit(order.id);
      if (action === 'approve') await disassemblyService.approve(order.id, actor, uid || undefined);
      if (action === 'execute') await disassemblyService.execute(order.id, actor, uid || undefined);
      if (action === 'reject') {
        const reason = window.prompt('سبب الرفض:', '') || '';
        await disassemblyService.reject(order.id, actor, reason, uid || undefined);
      }
      setMessage('تم تحديث طلب التفكيك.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحديث طلب التفكيك.');
    }
  };

  if (!can('inventory.disassembly.manage')) {
    return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية إدارة التفكيك.</p>;
  }

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader title="تفكيك عكسي" subtitle="طلب تفكيك مع اعتماد قبل خصم المنتج وإرجاع مكوناته حسب BOM." icon="inventory_2" />

      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      <Card title="بيانات التفكيك">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4">
          <select className="rounded-lg border px-3 py-2 text-sm md:col-span-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">اختر المنتج</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <input className="rounded-lg border px-3 py-2 text-sm" type="number" placeholder="الكمية" value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value || 0))} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={sourceWarehouseId} disabled={warehouseSelectLocked} onChange={(e) => { setSourceWarehouseId(e.target.value); setSourceLocationId(''); }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={sourceLocationId} onChange={(e) => setSourceLocationId(e.target.value)}>
            <option value="">لوكيشن المنتج المصدر</option>
            {sourceLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={targetWarehouseId} disabled={warehouseSelectLocked && warehouses.length <= 1} onChange={(e) => setTargetWarehouseId(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <Button onClick={() => void preview()}>تجهيز المكونات</Button>
        </div>
        {message && <p className="px-4 pb-4 text-sm font-bold text-primary">{message}</p>}
      </Card>

      {lines.length > 0 && (
        <Card className="!p-0 overflow-hidden" title="مكونات التفكيك">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3 text-start">المكون</th>
                <th className="p-3 text-center">الكمية الراجعة</th>
                <th className="p-3 text-center">هالك التفكيك</th>
                <th className="p-3 text-start">لوكيشن الدخول</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.itemType}-${line.itemId}`} className="border-b">
                  <td className="p-3">
                    {line.itemName}
                    {line.defaultLocationCode && (
                      <p className="text-[11px] font-bold text-emerald-700">افتراضي: {line.defaultLocationCode}</p>
                    )}
                    {!line.defaultLocationCode && (
                      <p className="text-[11px] font-bold text-amber-700">لا يوجد افتراضي، تم اقتراح أول رف نشط</p>
                    )}
                  </td>
                  <td className="p-3 text-center">{line.quantity.toFixed(2)} {line.unit}</td>
                  <td className="p-3 text-center">{Number(line.wasteQty || 0).toFixed(2)}</td>
                  <td className="p-3">
                    <select
                      className="rounded-lg border px-2 py-1 text-xs"
                      value={line.locationId}
                      onChange={(e) => {
                        const loc = targetLocations.find((row) => row.id === e.target.value);
                        setLines((prev) => prev.map((row, i) => i === index ? { ...row, locationId: loc?.id || '', locationCode: loc?.code || '' } : row));
                      }}
                    >
                      <option value="">اختر لوكيشن</option>
                      {targetLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4">
            <Button variant="primary" onClick={() => void createRequest()}>حفظ طلب التفكيك</Button>
          </div>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden" title="طلبات التفكيك">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3 text-start">الطلب</th>
                <th className="p-3 text-start">المنتج</th>
                <th className="p-3 text-center">الكمية</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b">
                  <td className="p-3 font-mono">{order.referenceNo}</td>
                  <td className="p-3">{order.productName}</td>
                  <td className="p-3 text-center">{order.quantity}</td>
                  <td className="p-3 text-center">{order.status}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {order.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => void actionOrder(order, 'submit')}
                          title="إرسال"
                          aria-label={`إرسال طلب التفكيك ${order.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-primary hover:bg-[#f8f9fa] transition-colors"
                        >
                          <span className="material-icons-round text-sm">send</span>
                        </button>
                      )}
                      {order.status === 'submitted' && (
                        <button
                          type="button"
                          onClick={() => void actionOrder(order, 'approve')}
                          title="اعتماد"
                          aria-label={`اعتماد طلب التفكيك ${order.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                        >
                          <span className="material-icons-round text-sm">check_circle</span>
                        </button>
                      )}
                      {order.status === 'submitted' && (
                        <button
                          type="button"
                          onClick={() => void actionOrder(order, 'reject')}
                          title="رفض"
                          aria-label={`رفض طلب التفكيك ${order.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <span className="material-icons-round text-sm">cancel</span>
                        </button>
                      )}
                      {order.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => void actionOrder(order, 'execute')}
                          title="تنفيذ"
                          aria-label={`تنفيذ طلب التفكيك ${order.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-primary hover:bg-[#f8f9fa] transition-colors"
                        >
                          <span className="material-icons-round text-sm">play_circle</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
