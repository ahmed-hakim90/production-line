import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { productionIssueService } from '../services/productionIssueService';
import type { ProductionIssueOrder } from '../types';
import { usePermission } from '../../../utils/permissions';
import { exportGenericRows } from '../../../utils/exportExcel';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { Skeleton } from '@/components/ui/skeleton';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';

export const ProductionConsumptionAnalysis: React.FC = () => {
  const { can } = usePermission();
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const [search, setSearch] = useState('');

  const {
    data: ordersData,
    loading,
  } = useCachedPageLoad<ProductionIssueOrder[]>(
    'inventory:production-consumption-analysis',
    () => productionIssueService.getAll(),
    { maxAgeMs: 60_000 },
  );

  const orders = useMemo(() => {
    const rows = ordersData ?? [];
    if (!scoped) return rows;
    if (allowedWarehouseIds.size === 0) return [];
    return rows.filter((order) => allowedWarehouseIds.has(order.sourceWarehouseId));
  }, [ordersData, scoped, allowedWarehouseIds]);

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

  if (loading && !ordersData) {
    return (
      <div className="erp-ds-clean space-y-5">
        <PageHeader title="تحليل استهلاك أوامر الشغل" subtitle="مقارنة BOM بالمصروف والتعويض والمرتجع والهالك الفعلي." icon="analytics" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader title="تحليل استهلاك أوامر الشغل" subtitle="مقارنة BOM بالمصروف والتعويض والمرتجع والهالك الفعلي." icon="analytics" />
      <Card>
        <SmartFilterBar
      pageId="production-consumption-analysis"
          searchPlaceholder="بحث بإذن الصرف، المنتج، أمر الشغل، أو المكون"
          searchValue={search}
          onSearchChange={setSearch}
          extra={
            <Button variant="secondary" disabled={filteredOrders.length === 0} onClick={exportRows} className="h-[34px]">تصدير Excel</Button>
          }
          className="mb-0 border-0 rounded-none"
        />
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
