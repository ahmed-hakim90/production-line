import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { warehouseService } from '../services/warehouseService';
import { materialService } from '../../manufacturing/services/materialService';
import { materialPurchaseCostPerBaseUnit } from '../../manufacturing/types';
import { useAppStore } from '../../../store/useAppStore';
import { resolveInventoryRoutingV1 } from '../services/inventoryRoutingService';
import { estimateStockValue, stockUnitCostKey } from '../lib/stockValuation';
import { sourceModuleLabel } from '../lib/stockLabels';
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
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stockValueSummary, setStockValueSummary] = useState({
    totalValue: 0,
    valuedLines: 0,
    unknownLines: 0,
  });
  const [kpiSummary, setKpiSummary] = useState({
    totalLines: 0,
    totalQty: 0,
    lowStockCount: 0,
    truncated: false,
  });
  const systemSettings = useAppStore((s) => s.systemSettings);
  const rawProducts = useAppStore((s) => s._rawProducts);

  /** KPIs use a single balances page (newest first) instead of a full tenant scan via `getBalances`. */
  const loadData = async () => {
    setLoading(true);
    try {
      const [balPage, kpi, txs, whs, pending, materials] = await Promise.all([
        stockService.getBalancesPaged({ limit: 100, cursor: null }),
        stockService.getInventoryKpiSummary(),
        stockService.getTransactions(),
        warehouseService.getAllWarehouses(),
        transferApprovalService.getByStatus('pending'),
        materialService.getAll(),
      ]);
      setBalances(balPage.items);
      setKpiSummary({
        totalLines: kpi.totalLines,
        totalQty: kpi.totalQty,
        lowStockCount: kpi.lowStockCount,
        truncated: kpi.truncated,
      });
      setTransactions(txs.slice(0, 8));
      setWarehouses(whs);
      setPendingTransfers(pending.length);

      const unitCostByItem = new Map<string, number>();
      rawProducts.forEach((p) => {
        if (!p.id) return;
        unitCostByItem.set(
          stockUnitCostKey('finished_good', p.id),
          Number((p as { unitCost?: number }).unitCost || p.chineseUnitCost || 0),
        );
      });
      materials.forEach((m) => {
        if (!m.id) return;
        const cost = materialPurchaseCostPerBaseUnit(m);
        unitCostByItem.set(stockUnitCostKey('material', m.id), cost);
        if (m.legacyRawMaterialId) {
          unitCostByItem.set(stockUnitCostKey('raw_material', m.legacyRawMaterialId), cost);
        }
      });
      setStockValueSummary(estimateStockValue(balPage.items, unitCostByItem));
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
  const negativeItems = useMemo(
    () => balances.filter((row) => Number(row.quantity || 0) < 0),
    [balances],
  );
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const wipQty = useMemo(() => {
    const wipId = routing.productionWipWarehouseId;
    if (!wipId) return 0;
    return balances
      .filter((b) => b.warehouseId === wipId)
      .reduce((s, b) => s + Number(b.quantity || 0), 0);
  }, [balances, routing.productionWipWarehouseId]);
  const wasteQty = useMemo(() => {
    const wasteId = routing.wasteWarehouseId;
    if (!wasteId) return 0;
    return balances
      .filter((b) => b.warehouseId === wasteId)
      .reduce((s, b) => s + Number(b.quantity || 0), 0);
  }, [balances, routing.wasteWarehouseId]);
  const routingReady = Boolean(
    routing.productionWipWarehouseId && routing.finishedStagingWarehouseId,
  );

  return (
    <div className="erp-ds-clean erp-dashboard-theme space-y-6">
      <PageHeader
        title="لوحة المخازن"
        subtitle="متابعة فورية للأرصدة والحركات والجرد. مؤشرات KPI من مسح كامل للأرصدة؛ الجدول يعرض أحدث ١٠٠ سطر."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to={withTenantPath(tenantSlug, '/inventory/movements')}>
              <PrimaryButton>حركة مخزون</PrimaryButton>
            </Link>
            <Link to={withTenantPath(tenantSlug, '/inventory/counts')}>
              <GhostButton>الجرد</GhostButton>
            </Link>
            <Link to={withTenantPath(tenantSlug, '/inventory/transfer-approvals')}>
              <GhostButton>اعتماد التحويلات</GhostButton>
            </Link>
            <Link to={withTenantPath(tenantSlug, '/settings')}>
              <GhostButton>إعدادات التوجيه</GhostButton>
            </Link>
          </div>
        )}
      />

      {!loading && kpiSummary.truncated && (
        <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          تم حساب المؤشرات على جزء من الأرصدة (حد المسح). راجع صفحة الأرصدة للتفاصيل الكاملة.
        </p>
      )}

      {!loading && !routingReady && (
        <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          توجيه المخازن غير مكتمل (WIP / تم الصنع). أكمل الإعداد من صفحة الإعدادات ثم شغّل مزامنة V1.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <KPICard label="عدد المخازن" value={warehouses.length} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="تحويلات معلقة" value={pendingTransfers} iconType="trend" color="amber" loading={loading} />
        <KPICard label="إجمالي الأصناف" value={kpiSummary.totalLines} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="إجمالي الكميات" value={formatNumber(kpiSummary.totalQty)} iconType="metric" color="green" loading={loading} />
        <KPICard label="أصناف منخفضة" value={kpiSummary.lowStockCount} iconType="money" color="amber" loading={loading} />
        <KPICard label="أرصدة سالبة" value={negativeItems.length} iconType="metric" color="red" loading={loading} />
        <KPICard label="رصيد WIP (تقديري)" value={formatNumber(wipQty)} iconType="metric" color="green" loading={loading} />
        <KPICard label="رصيد الهالك" value={formatNumber(wasteQty)} iconType="metric" color="gray" loading={loading} />
        <KPICard
          label="قيمة المخزون (تقديري)"
          value={formatNumber(stockValueSummary.totalValue)}
          iconType="money"
          color="indigo"
          loading={loading}
        />
        <KPICard
          label="أصناف بلا تكلفة"
          value={stockValueSummary.unknownLines}
          iconType="metric"
          color="gray"
          loading={loading}
        />
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
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {tx.movementType} · {sourceModuleLabel(tx.sourceModule)}
                    </p>
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
