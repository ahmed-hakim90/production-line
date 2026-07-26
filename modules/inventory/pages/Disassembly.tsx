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

export const Disassembly: React.FC = () => {
  const { can } = usePermission();
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    filterWarehouses,
    resolveScopedWarehouseId,
  } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const products = useAppStore((s) => s.products);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const uid = useAppStore((s) => s.uid);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [racks, setRacks] = useState<WarehouseRack[]>([]);
  const [orders, setOrders] = useState<DisassemblyOrder[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [lines, setLines] = useState<DisassemblyLine[]>([]);
  const [message, setMessage] = useState('');
  const actor = userDisplayName || userEmail || 'Current User';

  const load = async () => {
    const [whs, locs, rackRows, disRows] = await Promise.all([
      warehouseService.getActiveWarehouses(),
      warehouseLocationService.getAll(),
      warehouseRackService.getAll(),
      disassemblyService.getAll(),
    ]);
    const scopedWhs = filterWarehouses(whs);
    setWarehouses(scopedWhs);
    setLocations(locs);
    setRacks(rackRows);
    const scopedOrders = !scoped
      ? disRows
      : allowedWarehouseIds.size === 0
        ? []
        : disRows.filter(
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
      await load();
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
      await load();
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

      <Card title="بيانات التفكيك">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4">
          <select className="rounded-lg border px-3 py-2 text-sm md:col-span-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">اختر المنتج</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <input className="rounded-lg border px-3 py-2 text-sm" type="number" placeholder="الكمية" value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value || 0))} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={sourceWarehouseId} onChange={(e) => { setSourceWarehouseId(e.target.value); setSourceLocationId(''); }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={sourceLocationId} onChange={(e) => setSourceLocationId(e.target.value)}>
            <option value="">لوكيشن المنتج المصدر</option>
            {sourceLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={targetWarehouseId} onChange={(e) => setTargetWarehouseId(e.target.value)}>
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
                  <td className="p-3 text-center space-x-1 space-x-reverse">
                    {order.status === 'draft' && <button className="text-xs font-bold text-primary" onClick={() => void actionOrder(order, 'submit')}>إرسال</button>}
                    {order.status === 'submitted' && <button className="text-xs font-bold text-emerald-700" onClick={() => void actionOrder(order, 'approve')}>اعتماد</button>}
                    {order.status === 'submitted' && <button className="text-xs font-bold text-rose-700" onClick={() => void actionOrder(order, 'reject')}>رفض</button>}
                    {order.status === 'approved' && <button className="text-xs font-bold text-primary" onClick={() => void actionOrder(order, 'execute')}>تنفيذ</button>}
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
