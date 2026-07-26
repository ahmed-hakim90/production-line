import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { productionIssueService } from '../services/productionIssueService';
import type { ProductionIssueOrder } from '../types';
import { usePermission } from '../../../utils/permissions';
import { exportGenericRows } from '../../../utils/exportExcel';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';

export const ProductionConsumptionAnalysis: React.FC = () => {
  const { can } = usePermission();
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const [orders, setOrders] = useState<ProductionIssueOrder[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void productionIssueService.getAll().then((rows) => {
      if (!scoped) {
        setOrders(rows);
        return;
      }
      if (allowedWarehouseIds.size === 0) {
        setOrders([]);
        return;
      }
      setOrders(rows.filter((order) => allowedWarehouseIds.has(order.sourceWarehouseId)));
    });
  }, [scoped, allowedWarehouseIds]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) =>
      [order.referenceNo, order.productName, order.productCode, order.workOrderId, order.productionPlanId]
        .some((value) => String(value || '').toLowerCase().includes(q))
      || order.lines.some((line) => [line.itemName, line.itemCode].some((value) => String(value || '').toLowerCase().includes(q))));
  }, [orders, search]);

  const exportRows = () => {
    const rows = filteredOrders.flatMap((order) => order.lines.map((line) => {
      const issued = Number(line.issuedQty || 0);
      const comp = Number(line.compensatedQty || 0);
      const ret = Number(line.returnedQty || 0);
      const scrap = Number(line.actualScrapQty || 0);
      const net = issued + comp - ret;
      const variance = net - Number(line.requiredQty || 0);
      return {
        'إذن الصرف': order.referenceNo,
        المنتج: order.productName,
        'أمر الشغل/الخطة': order.workOrderId || order.productionPlanId || '',
        المكون: line.itemName,
        'كود المكون': line.itemCode,
        'طبيعي BOM': Number(line.baseRequiredQty.toFixed(2)),
        'هالك قياسي': Number(line.plannedWasteQty.toFixed(2)),
        المطلوب: Number(line.requiredQty.toFixed(2)),
        مصروف: Number(issued.toFixed(2)),
        تعويض: Number(comp.toFixed(2)),
        مرتجع: Number(ret.toFixed(2)),
        'هالك فعلي': Number(scrap.toFixed(2)),
        صافي: Number(net.toFixed(2)),
        انحراف: Number(variance.toFixed(2)),
      };
    }));
    exportGenericRows(rows, 'تحليل استهلاك الإنتاج', `تحليل-استهلاك-الإنتاج-${new Date().toISOString().slice(0, 10)}`);
  };

  if (!can('inventory.view')) return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض المخازن.</p>;

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader title="تحليل استهلاك أوامر الشغل" subtitle="مقارنة BOM بالمصروف والتعويض والمرتجع والهالك الفعلي." icon="analytics" />
      <Card title="تصفية وتصدير">
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <input
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            placeholder="بحث بإذن الصرف، المنتج، أمر الشغل، أو المكون"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" disabled={filteredOrders.length === 0} onClick={exportRows}>تصدير Excel</Button>
        </div>
      </Card>
      {filteredOrders.map((order) => (
        <Card key={order.id} className="!p-0 overflow-hidden" title={`${order.referenceNo} - ${order.productName}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="p-3 text-start">المكون</th>
                  <th className="p-3 text-center">طبيعي BOM</th>
                  <th className="p-3 text-center">هالك قياسي</th>
                  <th className="p-3 text-center">مصروف</th>
                  <th className="p-3 text-center">تعويض</th>
                  <th className="p-3 text-center">مرتجع</th>
                  <th className="p-3 text-center">هالك فعلي</th>
                  <th className="p-3 text-center">صافي</th>
                  <th className="p-3 text-center">انحراف</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const issued = Number(line.issuedQty || 0);
                  const comp = Number(line.compensatedQty || 0);
                  const ret = Number(line.returnedQty || 0);
                  const scrap = Number(line.actualScrapQty || 0);
                  const net = issued + comp - ret;
                  const variance = net - Number(line.requiredQty || 0);
                  return (
                    <tr key={`${line.itemType}-${line.itemId}`} className="border-b">
                      <td className="p-3">{line.itemName}</td>
                      <td className="p-3 text-center">{line.baseRequiredQty.toFixed(2)}</td>
                      <td className="p-3 text-center">{line.plannedWasteQty.toFixed(2)}</td>
                      <td className="p-3 text-center">{issued.toFixed(2)}</td>
                      <td className="p-3 text-center">{comp.toFixed(2)}</td>
                      <td className="p-3 text-center">{ret.toFixed(2)}</td>
                      <td className="p-3 text-center">{scrap.toFixed(2)}</td>
                      <td className="p-3 text-center font-bold">{net.toFixed(2)}</td>
                      <td className={`p-3 text-center font-bold ${Math.abs(variance) > 0.000001 ? 'text-amber-700' : 'text-emerald-700'}`}>{variance.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
};
