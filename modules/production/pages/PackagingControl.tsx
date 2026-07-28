import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';
import { sourceModuleLabel } from '../../inventory/lib/stockLabels';
import { stockService } from '../../inventory/services/stockService';
import { warehouseService } from '../../inventory/services/warehouseService';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import type { StockItemBalance, StockTransaction, Warehouse } from '../../inventory/types';

type PackagingControlPageData = {
  warehouses: Warehouse[];
  balances: StockItemBalance[];
  transactions: StockTransaction[];
  pendingPackaging: number;
};

/**
 * Production packaging hub:
 * balances waiting in تم الإنتاج → packaging reports → final product warehouse.
 */
export const PackagingControl: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);

  const sourceWarehouseId =
    String(routing.packagingSourceWarehouseId || routing.finishedStagingWarehouseId || '').trim();
  const targetWarehouseId =
    String(routing.packagingTargetWarehouseId || routing.finalProductWarehouseId || '').trim();

  const CACHE_KEY = `production:packaging-control:${sourceWarehouseId}:${targetWarehouseId}`;

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<PackagingControlPageData>(
    CACHE_KEY,
    async () => {
      const [whs, bals, txs, pending] = await Promise.all([
        warehouseService.getAllWarehouses(),
        sourceWarehouseId ? stockService.getBalances(sourceWarehouseId) : Promise.resolve([]),
        sourceWarehouseId ? stockService.getTransactions(sourceWarehouseId) : Promise.resolve([]),
        transferApprovalService.getByStatus('pending'),
      ]);
      return {
        warehouses: whs,
        balances: bals.filter(
          (row) => row.itemType === 'finished_good' && Number(row.quantity || 0) !== 0,
        ),
        transactions: txs.slice(0, 10),
        pendingPackaging: pending.filter(
          (row) =>
            (row.requestType || '') === 'packaging_transfer' &&
            (row.fromWarehouseId === sourceWarehouseId || row.toWarehouseId === targetWarehouseId),
        ).length,
      };
    },
    { maxAgeMs: 45_000 },
  );

  const warehouses = data?.warehouses ?? [];
  const balances = data?.balances ?? [];
  const transactions = data?.transactions ?? [];
  const pendingPackaging = data?.pendingPackaging ?? 0;

  const reload = async () => {
    invalidatePageDataCache(CACHE_KEY);
    await reloadCached(true);
  };

  const sourceWarehouse = warehouses.find((w) => w.id === sourceWarehouseId) || null;
  const targetWarehouse = warehouses.find((w) => w.id === targetWarehouseId) || null;

  const totalQty = useMemo(
    () => balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [balances],
  );

  const configured = Boolean(sourceWarehouseId && targetWarehouseId && sourceWarehouseId !== targetWarehouseId);

  if (loading && warehouses.length === 0) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  return (
    <div className="erp-ds-clean erp-dashboard-theme space-y-6">
      <PageHeader
        title="تحكم التغليف"
        subtitle={
          configured
            ? `بانتظار التغليف في «${sourceWarehouse?.name || 'تم الإنتاج'}» → «${targetWarehouse?.name || 'منتج تام'}»`
            : 'حدّد مخزن تم الإنتاج ومخزن المنتج التام في توجيه المخازن'
        }
        icon={<Package size={18} />}
        actions={(
          <div className="flex flex-wrap gap-2">
            <GhostButton onClick={() => void reload()} disabled={loading}>تحديث</GhostButton>
            {can('reports.view') || can('reports.packaging.create') ? (
              <Link to={withTenantPath(tenantSlug, '/reports')}>
                <PrimaryButton>تقرير تغليف</PrimaryButton>
              </Link>
            ) : null}
          </div>
        )}
      />

      {!configured && (
        <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          التوجيه غير مكتمل: عيّن «مخزن التغليف (من)» = تم الإنتاج و«إلى» = منتج تام من الإعدادات.
          <Link className="font-bold underline ms-2" to={withTenantPath(tenantSlug, '/settings/production')}>
            فتح الإعدادات
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard label="أصناف بانتظار التغليف" value={balances.length} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="إجمالي الوحدات" value={formatNumber(totalQty)} iconType="metric" color="green" loading={loading} />
        <KPICard label="تحويلات تغليف معلّقة" value={pendingPackaging} iconType="trend" color="amber" loading={loading} />
        <KPICard
          label="مخزن الوجهة"
          value={targetWarehouse?.name || '—'}
          iconType="metric"
          color="indigo"
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {sourceWarehouseId && can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(sourceWarehouseId)}`)}>
            <GhostButton>أرصدة تم الإنتاج</GhostButton>
          </Link>
        )}
        {targetWarehouseId && can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(targetWarehouseId)}`)}>
            <GhostButton>أرصدة المنتج التام</GhostButton>
          </Link>
        )}
        {can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, '/inventory/transfer-approvals')}>
            <GhostButton>
              اعتماد التحويلات
              {pendingPackaging > 0 ? ` (${pendingPackaging})` : ''}
            </GhostButton>
          </Link>
        )}
      </div>

      <Card className="border-slate-200 shadow-none overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-800">
            أرصدة بانتظار التغليف
          </CardTitle>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            منتجات في مخزن تم الإنتاج جاهزة لتقرير التغليف ثم التحويل إلى منتج تام.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-start">الصنف</th>
                  <th className="erp-th text-center">الرصيد</th>
                  <th className="erp-th text-center">متاح</th>
                  <th className="erp-th text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td className="px-4 py-3" colSpan={4}>
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      لا توجد أرصدة بانتظار التغليف في هذا المخزن.
                    </td>
                  </tr>
                ) : (
                  balances
                    .slice()
                    .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
                    .map((row) => (
                      <tr key={row.id || `${row.itemId}-${row.warehouseId}`} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[var(--color-text)]">{row.itemName}</p>
                          <p className="text-xs text-slate-400 font-mono">{row.itemCode || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold tabular-nums">
                          {formatNumber(row.quantity)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums">
                          {formatNumber(row.availableQty ?? row.quantity)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-amber-700">
                          بانتظار التغليف
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-800">آخر حركات المخزن</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا توجد حركات حديثة.</p>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{tx.itemName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {tx.movementType} · {sourceModuleLabel(tx.sourceModule)} · {tx.referenceNo || '—'}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">{formatNumber(tx.quantity)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
