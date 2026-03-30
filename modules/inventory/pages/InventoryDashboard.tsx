import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, StockTransaction, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { withTenantPath } from '@/lib/tenantPaths';

export const InventoryDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
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
    <div className="erp-ds-clean space-y-6">
      <PageHeader
        title="لوحة المخازن"
        subtitle="متابعة فورية للأرصدة والحركات والجرد."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to={withTenantPath(tenantSlug, '/inventory/movements')}>
              <PrimaryButton>حركة مخزون</PrimaryButton>
            </Link>
            <Link to={withTenantPath(tenantSlug, '/inventory/counts')}>
              <GhostButton>الجرد</GhostButton>
            </Link>
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard label="عدد المخازن" value={warehouses.length} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="أصناف ???? بالمخزون" value={balances.length} iconType="trend" color="gray" loading={loading} />
        <KPICard label="إجمالي الكمية" value={formatNumber(totalQty)} iconType="metric" color="green" loading={loading} />
        <KPICard label="أصناف منخفضة" value={lowItems.length} iconType="money" color="amber" loading={loading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-800">آخر الحركات</CardTitle>
          </CardHeader>
          <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`tx-skeleton-${i}`} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد حركات حتى الآن.</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{tx.itemName}</p>
                    <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString('ar-EG')}</p>
                  </div>
                  <div className="text-left">
                    <StatusBadge
                      label={tx.quantity >= 0 ? `+${formatNumber(tx.quantity)}` : formatNumber(tx.quantity)}
                      type={tx.quantity >= 0 ? 'success' : 'danger'}
                    />
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">{tx.movementType}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-800">تنبيهات الحد الأدنى</CardTitle>
          </CardHeader>
          <CardContent>
          {lowItems.length === 0 ? (
            <p className="text-sm font-medium text-emerald-600">لا توجد أصناف تحت الحد الأدنى.</p>
          ) : (
            <div className="space-y-3">
              {lowItems.slice(0, 12).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-[var(--border-radius-lg)] bg-amber-50 dark:bg-amber-900/10 px-3 py-2 border border-amber-100">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{row.itemName}</p>
                    <p className="text-xs text-slate-500">{row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</p>
                  </div>
                  <div className="text-left text-sm font-medium text-amber-700">
                    {formatNumber(row.quantity)} / {formatNumber(row.minStock)}
                  </div>
                </div>
              ))}
            </div>
          )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
