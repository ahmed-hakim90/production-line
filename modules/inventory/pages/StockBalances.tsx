import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { downloadInventoryInByCodeTemplate } from '../../../utils/downloadTemplates';

export const StockBalances: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">أرصدة المخزون</h2>
        <p className="text-sm text-slate-500 font-medium">عرض الرصيد الحالي لكل صنف داخل كل مخزن.</p>
        {can('inventory.transactions.create') && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={downloadInventoryInByCodeTemplate}>
              <span className="material-icons-round text-sm">download</span>
              تحميل قالب الاستيراد
            </Button>
            <Button variant="outline" onClick={() => navigate('/inventory/movements?action=import-in-by-code')}>
              <span className="material-icons-round text-sm">upload_file</span>
              استيراد بالكود والكمية
            </Button>
          </div>
        )}
      </div>

      <Card className="!p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
            placeholder="بحث بالاسم أو الكود"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="">كل المخازن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={itemTypeFilter} onChange={(e) => setItemTypeFilter(e.target.value)}>
            <option value="">كل الأنواع</option>
            <option value="finished_good">منتج نهائي</option>
            <option value="raw_material">مادة خام</option>
          </select>
          <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-xs font-black text-slate-500">الصنف</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">النوع</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">المخزن</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الرصيد</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الحد الأدنى</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 && (
                <tr><td className="px-4 py-10 text-center text-slate-400" colSpan={6}>لا توجد بيانات مطابقة.</td></tr>
              )}
              {rows.map((row) => {
                const isLow = row.minStock > 0 && row.quantity <= row.minStock;
                const isOut = row.quantity <= 0;
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{row.itemName}</p>
                      <p className="text-xs text-slate-400 font-mono">{row.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                    <td className="px-4 py-3 text-sm">{warehouseNameById.get(row.warehouseId) ?? row.warehouseId}</td>
                    <td className="px-4 py-3 text-sm text-center font-black tabular-nums">{formatNumber(row.quantity)}</td>
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
