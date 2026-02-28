import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockTransaction, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';

const movementLabel: Record<string, string> = {
  IN: 'وارد',
  OUT: 'منصرف',
  TRANSFER: 'تحويل',
  ADJUSTMENT: 'تسوية',
};

export const StockTransactions: React.FC = () => {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [movementFilter, setMovementFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    const [txs, whs] = await Promise.all([
      stockService.getTransactions(),
      warehouseService.getAll(),
    ]);
    setTransactions(txs);
    setWarehouses(whs);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const filtered = useMemo(() => transactions.filter((tx) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || tx.itemName.toLowerCase().includes(q) || tx.itemCode.toLowerCase().includes(q);
    const matchesWarehouse = !warehouseFilter || tx.warehouseId === warehouseFilter;
    const matchesMovement = !movementFilter || tx.movementType === movementFilter;
    return matchesSearch && matchesWarehouse && matchesMovement;
  }), [transactions, search, warehouseFilter, movementFilter]);

  const exportCsv = () => {
    const headers = ['التاريخ', 'الصنف', 'الكود', 'النوع', 'الحركة', 'الكمية', 'المخزن', 'المرجع', 'ملاحظة', 'المنفذ'];
    const lines = filtered.map((tx) => [
      tx.createdAt,
      tx.itemName,
      tx.itemCode,
      tx.itemType,
      tx.movementType,
      String(tx.quantity),
      warehouseMap.get(tx.warehouseId) ?? tx.warehouseId,
      tx.referenceNo ?? '',
      tx.note ?? '',
      tx.createdBy,
    ]);
    const content = [headers, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">سجل حركات المخزون</h2>
          <p className="text-sm text-slate-500 font-medium">تتبع كامل لكل حركة على المنتجات والخامات.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <span className="material-icons-round text-sm">download</span>
          تصدير CSV
        </Button>
      </div>

      <Card className="!p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)}>
            <option value="">كل أنواع الحركة</option>
            <option value="IN">وارد</option>
            <option value="OUT">منصرف</option>
            <option value="TRANSFER">تحويل</option>
            <option value="ADJUSTMENT">تسوية</option>
          </select>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-xs font-black text-slate-500">التاريخ</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">الصنف</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">الحركة</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الكمية</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">المخزن</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">المنفذ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">لا توجد حركات مطابقة.</td></tr>}
              {filtered.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-4 py-3 text-xs text-slate-500">{new Date(tx.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{tx.itemName}</p>
                    <p className="text-xs text-slate-400 font-mono">{tx.itemCode}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant="info">{movementLabel[tx.movementType] ?? tx.movementType}</Badge></td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-black tabular-nums ${tx.quantity >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {tx.quantity >= 0 ? '+' : ''}{formatNumber(tx.quantity)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{warehouseMap.get(tx.warehouseId) ?? tx.warehouseId}</td>
                  <td className="px-4 py-3 text-sm">{tx.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
