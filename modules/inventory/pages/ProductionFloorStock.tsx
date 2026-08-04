import React, { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { sourceModuleLabel } from '../lib/stockLabels';
import { resolveWarehouseOperatorHomePath } from '../lib/warehouseOperatorHome';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import { stockReportService } from '../services/stockReportService';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import type { PeriodBalanceRow, StockItemBalance, StockTransaction, Warehouse } from '../types';
import { exportGenericRows } from '../../../utils/exportExcel';

type FloorPageData = {
  warehouse: Warehouse | null;
  balances: StockItemBalance[];
  recentTx: StockTransaction[];
  periodRows: PeriodBalanceRow[];
  truncated: boolean;
  daily: Array<{ date: string; inQty: number; outQty: number; transferInQty: number; transferOutQty: number; adjustmentQty: number }>;
};

const PAGE_SIZE = 20;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export const ProductionFloorStock: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const floorId = String(routing.productionFloorWarehouseId || '').trim();
  const decomposedId = String(routing.decomposedWarehouseId || '').trim();
  const { scoped, isWarehouseAllowed, warehouseId: scopedWarehouseId, isMaterialsWarehouseRole } =
    useMaterialsWarehouseScope();
  const canAccessFloor = Boolean(floorId) && (!scoped || isWarehouseAllowed(floorId));
  const blockedHomePath = withTenantPath(
    tenantSlug,
    resolveWarehouseOperatorHomePath({
      boundWarehouseId: scopedWarehouseId,
      isMaterialsWarehouseRole,
    }),
  );

  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d');
  const [page, setPage] = useState(1);

  const range = useMemo(() => {
    const end = new Date().toISOString();
    if (period === 'today') {
      return { startDate: `${getTodayDateString()}T00:00:00.000Z`, endDate: end };
    }
    if (period === '30d') return { startDate: daysAgoIso(30), endDate: end };
    return { startDate: daysAgoIso(7), endDate: end };
  }, [period]);

  const CACHE_KEY = canAccessFloor ? `inventory:production-floor:${floorId}:${period}` : null;

  const { data, loading, reload: reloadCached } = useCachedPageLoad<FloorPageData>(
    CACHE_KEY,
    async () => {
      if (!canAccessFloor || !floorId) {
        return {
          warehouse: null,
          balances: [],
          recentTx: [],
          periodRows: [],
          truncated: false,
          daily: [],
        };
      }
      const [warehouses, balances, recentTx, report] = await Promise.all([
        warehouseService.getAllWarehouses(),
        stockService.getBalances(floorId),
        stockService.getTransactionsPaged({ warehouseId: floorId, limit: 15 }),
        stockReportService.buildWarehousePeriodReport({
          warehouseId: floorId,
          startDate: range.startDate,
          endDate: range.endDate,
        }),
      ]);
      return {
        warehouse: warehouses.find((w) => w.id === floorId) || null,
        balances: balances.filter((b) => Number(b.quantity || 0) !== 0),
        recentTx: recentTx.items,
        periodRows: report.rows,
        truncated: Boolean(report.truncated),
        daily: report.daily || [],
      };
    },
    { maxAgeMs: 45_000 },
  );

  const reload = async () => {
    if (!CACHE_KEY) return;
    invalidatePageDataCache(CACHE_KEY);
    await reloadCached(true);
  };

  const totalQty = useMemo(
    () => (data?.balances || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [data?.balances],
  );

  const periodRows = data?.periodRows || [];
  const totalPages = Math.max(1, Math.ceil(periodRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = periodRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportPeriod = () => {
    if (!periodRows.length) {
      toast.error('لا توجد بيانات للتصدير.');
      return;
    }
    exportGenericRows(
      periodRows.map((row) => ({
        الصنف: row.itemName,
        الكود: row.itemCode,
        أول_المدة: row.openingQty,
        وارد: row.inQty,
        منصرف: row.outQty,
        تحويل_داخل: row.transferInQty,
        تحويل_خارج: row.transferOutQty,
        تسويات: row.adjustmentQty,
        آخر_المدة: row.closingQty,
      })),
      `صالة-الإنتاج-${period}`,
    );
    toast.success('تم تصدير تقرير الفترة.');
  };

  if (!can('inventory.view')) {
    return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض المخازن.</p>;
  }

  if (scoped && !canAccessFloor) {
    return <Navigate to={blockedHomePath} replace />;
  }

  if (loading && !data) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  return (
    <div className="erp-ds-clean space-y-6">
      <PageHeader
        title="مخزون صالة الإنتاج"
        subtitle={
          floorId
            ? `رصيد المكونات المصروفة من المفكك إلى «${data?.warehouse?.name || 'صالة الإنتاج'}» واستهلاك التقارير`
            : 'حدّد مخزن صالة الإنتاج في توجيه المخازن'
        }
        actions={(
          <div className="flex flex-wrap gap-2">
            <GhostButton iconName="refresh" tone="neutral" onClick={() => void reload()} disabled={loading}>
              تحديث
            </GhostButton>
            <PrimaryButton iconName="download" tone="share" onClick={exportPeriod} disabled={!periodRows.length}>
              تصدير الفترة
            </PrimaryButton>
          </div>
        )}
      />

      {!floorId && (
        <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          عيّن «مخزن صالة الإنتاج» من إعدادات توجيه المخزون.
          <Link className="font-bold underline ms-2" to={withTenantPath(tenantSlug, '/settings/production')}>
            فتح الإعدادات
          </Link>
        </p>
      )}

      {data?.truncated && (
        <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          تحذير: تقرير الفترة مقطوع بسبب حجم الحركات الكبير. قلّص الفترة أو نفّذ backfill يومي.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="أصناف في الصالة" value={data?.balances.length || 0} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="إجمالي الرصيد" value={formatNumber(totalQty)} iconType="metric" color="green" loading={loading} />
        <KPICard label="أيام الفترة" value={data?.daily.length || 0} iconType="trend" color="amber" loading={loading} />
        <KPICard label="بنود التقرير" value={periodRows.length} iconType="metric" color="indigo" loading={loading} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {(['today', '7d', '30d'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
              period === key ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600'
            }`}
            onClick={() => {
              setPeriod(key);
              setPage(1);
              invalidatePageDataCache(CACHE_KEY);
            }}
          >
            {key === 'today' ? 'اليوم' : key === '7d' ? '7 أيام' : '30 يوم'}
          </button>
        ))}
        {floorId && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(floorId)}`)}>
            <GhostButton iconName="inventory_2" tone="share">أرصدة الصالة</GhostButton>
          </Link>
        )}
        {decomposedId && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(decomposedId)}`)}>
            <GhostButton iconName="warehouse" tone="view">أرصدة المفكك</GhostButton>
          </Link>
        )}
        {can('inventory.transactions.create') && (
          <Link to={withTenantPath(tenantSlug, '/quick-inventory-transfer')}>
            <GhostButton iconName="swap_horiz" tone="edit">تحويل / مرتجع</GhostButton>
          </Link>
        )}
        {can('inventory.counts.manage') && (
          <Link to={withTenantPath(tenantSlug, '/inventory/counts')}>
            <GhostButton iconName="checklist" tone="approve">جرد / تسوية</GhostButton>
          </Link>
        )}
      </div>

      <Card className="border-slate-200 shadow-none overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">تقرير الفترة (أول / وارد / منصرف / آخر)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-start">الصنف</th>
                  <th className="erp-th text-center">أول المدة</th>
                  <th className="erp-th text-center">وارد</th>
                  <th className="erp-th text-center">منصرف</th>
                  <th className="erp-th text-center">تحويل داخل</th>
                  <th className="erp-th text-center">تحويل خارج</th>
                  <th className="erp-th text-center">تسوية</th>
                  <th className="erp-th text-center">آخر المدة</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                      لا توجد حركات في الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <tr key={`${row.itemType}-${row.itemId}`} className="border-b">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{row.itemName}</p>
                        <p className="text-xs font-mono text-slate-400">{row.itemCode}</p>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{formatNumber(row.openingQty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{formatNumber(row.inQty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{formatNumber(row.outQty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{formatNumber(row.transferInQty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{formatNumber(row.transferOutQty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{formatNumber(row.adjustmentQty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums font-bold">{formatNumber(row.closingQty)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={periodRows.length}
            onPageChange={setPage}
            itemLabel="صنف"
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium">آخر الحركات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.recentTx || []).length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد حركات.</p>
          ) : (
            (data?.recentTx || []).map((tx) => (
              <div key={tx.id} className="flex justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{tx.itemName}</p>
                  <p className="text-xs text-slate-500">
                    {sourceModuleLabel(tx.sourceModule)} · {tx.movementType}
                    {tx.transferDirection ? `/${tx.transferDirection}` : ''}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums">{formatNumber(tx.quantity)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
