import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, KPIBox, Button, Badge } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, StockTransaction, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';

export const InventoryDashboard: React.FC = () => {
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bals, txs, whs] = await Promise.all([
        stockService.getBalances(),
        stockService.getTransactions(),
        warehouseService.getAll(),
      ]);
      setBalances(bals);
      setTransactions(txs.slice(0, 8));
      setWarehouses(whs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalQty = useMemo(
    () => balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [balances],
  );
  const lowItems = useMemo(
    () => balances.filter((row) => row.minStock > 0 && row.quantity <= row.minStock),
    [balances],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">لوحة المخازن</h2>
          <p className="text-sm text-slate-500 font-medium">متابعة فورية للأرصدة والحركات والجرد.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/inventory/movements"><Button variant="primary"><span className="material-icons-round text-sm">add</span>حركة مخزون</Button></Link>
          <Link to="/inventory/counts"><Button variant="outline"><span className="material-icons-round text-sm">fact_check</span>الجرد</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIBox label="عدد المخازن" value={warehouses.length} icon="warehouse" />
        <KPIBox label="أصناف نشطة بالمخزون" value={balances.length} icon="inventory_2" />
        <KPIBox label="إجمالي الكمية" value={formatNumber(totalQty)} icon="stacked_bar_chart" />
        <KPIBox label="أصناف منخفضة" value={lowItems.length} icon="warning" colorClass="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="آخر الحركات">
          {loading ? (
            <p className="text-sm text-slate-400">جاري التحميل...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد حركات حتى الآن.</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{tx.itemName}</p>
                    <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString('ar-EG')}</p>
                  </div>
                  <div className="text-left">
                    <Badge variant={tx.quantity >= 0 ? 'success' : 'danger'}>
                      {tx.quantity >= 0 ? `+${formatNumber(tx.quantity)}` : formatNumber(tx.quantity)}
                    </Badge>
                    <p className="text-xs text-slate-400 mt-1">{tx.movementType}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="تنبيهات الحد الأدنى">
          {lowItems.length === 0 ? (
            <p className="text-sm text-emerald-600 font-bold">لا توجد أصناف تحت الحد الأدنى.</p>
          ) : (
            <div className="space-y-3">
              {lowItems.slice(0, 12).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-900/10 px-3 py-2 border border-amber-100 dark:border-amber-800">
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{row.itemName}</p>
                    <p className="text-xs text-slate-500">{row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</p>
                  </div>
                  <div className="text-left text-sm font-bold text-amber-700 dark:text-amber-300">
                    {formatNumber(row.quantity)} / {formatNumber(row.minStock)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
