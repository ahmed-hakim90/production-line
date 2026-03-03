import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { downloadInventoryInByCodeTemplate } from '../../../utils/downloadTemplates';
import { exportHRData } from '../../../utils/exportExcel';
import { useAppStore } from '../../../store/useAppStore';
import { PageHeader } from '../../../components/PageHeader';

export const StockBalances: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const rawProducts = useAppStore((s) => s._rawProducts);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void (async () => {
      const [bals, whs] = await Promise.all([
        stockService.getBalances(),
        warehouseService.getAll(),
      ]);
      setBalances(bals);
      setWarehouses(whs);
    })();
  }, []);

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );

  const rows = useMemo(() => balances.filter((row) => {
    const matchesWarehouse = !warehouseFilter || row.warehouseId === warehouseFilter;
    const matchesType = !itemTypeFilter || row.itemType === itemTypeFilter;
    const isLow = row.minStock > 0 && row.quantity <= row.minStock;
    const isOut = row.quantity <= 0;
    const matchesStatus = !statusFilter
      || (statusFilter === 'low' && isLow)
      || (statusFilter === 'out' && isOut)
      || (statusFilter === 'ok' && !isLow && !isOut);
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || row.itemName.toLowerCase().includes(q)
      || row.itemCode.toLowerCase().includes(q);
    return matchesWarehouse && matchesType && matchesStatus && matchesSearch;
  }), [balances, warehouseFilter, itemTypeFilter, statusFilter, search]);

  const exportBalancesExcel = () => {
    if (rows.length === 0) return;
    const exportRows = rows.map((row) => {
      const isLow = row.minStock > 0 && row.quantity <= row.minStock;
      const isOut = row.quantity <= 0;
      const status = isOut ? 'نفد' : isLow ? 'منخفض' : 'طبيعي';
      const unitsPerCarton = row.itemType === 'finished_good'
        ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
        : 0;
      const cartons = unitsPerCarton > 0
        ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
        : null;
      return {
        'الصنف': row.itemName,
        'الكود': row.itemCode,
        'النوع': row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام',
        'المخزن': warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
        'الرصيد': Number(row.quantity || 0),
        'الرصيد / كرتونة': cartons ?? '—',
        'الحد الأدنى': Number(row.minStock || 0),
        'الحالة': status,
      };
    });
    const date = new Date().toISOString().slice(0, 10);
    exportHRData(exportRows, 'أرصدة المخزون', `أرصدة-المخزون-${date}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="أرصدة المخزون"
        subtitle="عرض الرصيد الحالي لكل صنف داخل كل مخزن"
        icon="warehouse"
        moreActions={[
          {
            label: 'تصدير الأرصدة Excel',
            icon: 'table_view',
            group: 'تصدير',
            hidden: !can('inventory.transactions.export') || rows.length === 0,
            onClick: exportBalancesExcel,
          },
          {
            label: 'تحميل قالب الاستيراد',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !can('inventory.transactions.create'),
            onClick: downloadInventoryInByCodeTemplate,
          },
          {
            label: 'استيراد بالكود والكمية',
            icon: 'upload_file',
            group: 'استيراد',
            hidden: !can('inventory.transactions.create'),
            onClick: () => navigate('/inventory/movements?action=import-in-by-code'),
          },
        ]}
      />

      <Card className="!p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]"
            placeholder="بحث بالاسم أو الكود"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="">كل المخازن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]" value={itemTypeFilter} onChange={(e) => setItemTypeFilter(e.target.value)}>
            <option value="">كل الأنواع</option>
            <option value="finished_good">منتج نهائي</option>
            <option value="raw_material">مادة خام</option>
          </select>
          <select className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="ok">طبيعي</option>
            <option value="low">منخفض</option>
            <option value="out">نفد</option>
          </select>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الصنف</th>
                <th className="erp-th">النوع</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th text-center">الرصيد</th>
                <th className="erp-th text-center">الرصيد / كرتونة</th>
                <th className="erp-th text-center">الحد الأدنى</th>
                <th className="erp-th text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.length === 0 && (
                <tr><td className="px-4 py-10 text-center text-slate-400" colSpan={7}>لا توجد بيانات مطابقة.</td></tr>
              )}
              {rows.map((row) => {
                const isLow = row.minStock > 0 && row.quantity <= row.minStock;
                const isOut = row.quantity <= 0;
                const unitsPerCarton = row.itemType === 'finished_good'
                  ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
                  : 0;
                const cartonBalance = unitsPerCarton > 0
                  ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
                  : null;
                return (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono">{row.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                    <td className="px-4 py-3 text-sm">{warehouseNameById.get(row.warehouseId) ?? row.warehouseId}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.quantity)}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">
                      {cartonBalance == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cartonBalance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.minStock || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {isOut ? <Badge variant="danger">نفد</Badge> : isLow ? <Badge variant="warning">منخفض</Badge> : <Badge variant="success">طبيعي</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
