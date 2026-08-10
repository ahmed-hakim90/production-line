import React, { useCallback } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { resolveWarehouseOperatorHomePath } from '../lib/warehouseOperatorHome';
import { useInventoryControlData, type PeriodPreset } from './inventoryDashboard/useInventoryControlData';
import { InventoryActionQueue } from './inventoryDashboard/InventoryActionQueue';
import { InventoryReviewTabs } from './inventoryDashboard/InventoryReviewTabs';
import { WarehouseHealthGrid } from './inventoryDashboard/WarehouseHealthGrid';
import { InventoryExceptionsPreview } from './inventoryDashboard/InventoryExceptionsPreview';

const CHART_TICK = { fontSize: 11, fill: 'var(--color-text-muted)' } as const;
const GRID_STROKE = 'var(--color-border)';

const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'today', label: 'اليوم' },
  { value: '7d', label: '7 أيام' },
  { value: '30d', label: '30 يوم' },
  { value: 'all', label: 'الكل' },
];

export const InventoryDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const {
    scoped,
    warehouseId,
    isMaterialsWarehouseRole,
  } = useMaterialsWarehouseScope();
  const { can } = usePermission();
  const data = useInventoryControlData();

  const tenantPath = useCallback(
    (path: string) => withTenantPath(tenantSlug, path),
    [tenantSlug],
  );

  if (scoped) {
    const home = resolveWarehouseOperatorHomePath({
      boundWarehouseId: warehouseId || null,
      isMaterialsWarehouseRole,
    });
    return <Navigate to={withTenantPath(tenantSlug, home)} replace />;
  }

  if (data.loading && data.warehousesCount === 0 && !data.loadError) {
    return <PageContentSkeleton variant="dashboard" kpiCount={8} />;
  }

  const canCreateTx = can('inventory.transactions.create');
  const canCounts = can('inventory.counts.manage');
  const canAnalytics = can('inventory.analytics.view');
  const canExceptions = can('inventory.exceptions.view');

  const hero = [
    {
      key: 'warehouses',
      label: 'عدد المخازن',
      value: data.loading ? '…' : formatNumber(data.warehousesCount),
      accent: true as const,
    },
    {
      key: 'lines',
      label: 'إجمالي الأصناف',
      value: data.loading ? '…' : formatNumber(data.kpiSummary.totalLines),
    },
    {
      key: 'qty',
      label: 'إجمالي الكميات',
      value: data.loading ? '…' : formatNumber(data.kpiSummary.totalQty),
    },
    {
      key: 'low',
      label: 'أصناف منخفضة',
      value: data.loading ? '…' : formatNumber(data.kpiSummary.lowStockCount),
      meta: `سالب ${formatNumber(data.negativeCount)}`,
    },
    {
      key: 'transfers',
      label: 'تحويلات معلّقة',
      value: data.loading ? '…' : formatNumber(data.pendingTransfersCount),
      meta: `صرف ${formatNumber(data.pendingIssuesCount)}`,
    },
    {
      key: 'value',
      label: 'قيمة المخزون',
      value: data.loading ? '…' : formatNumber(data.stockValueSummary.totalValue),
      meta: `WIP ${formatNumber(data.wipQty)} · تام ${formatNumber(data.finishedQty)}`,
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة المخازن"
      hero={hero}
      periods={PERIODS}
      activePeriod={data.period}
      onPeriodChange={(value) => data.setPeriod(value as PeriodPreset)}
      onRefresh={() => { void data.refresh(); }}
      refreshing={data.loading || data.txLoading}
      periodExtra={(
        <select
          id="inv-control-warehouse"
          className="ops-dash-period-chip !rounded-lg"
          value={data.warehouseId}
          onChange={(e) => data.setWarehouseId(e.target.value)}
          aria-label="المخزن"
        >
          <option value="">كل المخازن</option>
          {data.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}
      secondarySummary="إجراءات وروابط المخازن"
      secondary={(
        <div className="flex flex-wrap gap-2">
          {canCreateTx && (
            <>
              <Link to={tenantPath('/inventory/movements')}>
                <PrimaryButton iconName="swap_horiz" tone="execute">حركة مخزون</PrimaryButton>
              </Link>
              <Link to={tenantPath('/inventory/raw-materials/receive')}>
                <GhostButton iconName="inventory_2" tone="share">استلام مستلزمات</GhostButton>
              </Link>
              <Link to={tenantPath('/quick-inventory-transfer')}>
                <GhostButton iconName="sync_alt" tone="export">تحويل سريع</GhostButton>
              </Link>
            </>
          )}
          <Link to={tenantPath('/inventory/transfer-approvals')}>
            <GhostButton iconName="fact_check" tone="approve">اعتماد التحويلات</GhostButton>
          </Link>
          <Link to={tenantPath('/inventory/production-issues')}>
            <GhostButton iconName="precision_manufacturing" tone="edit">صرف إنتاج</GhostButton>
          </Link>
          {(can('departmentConsumables.view') || can('inventory.view')) && (
            <Link to={tenantPath('/inventory/department-consumables')}>
              <GhostButton iconName="shopping_bag" tone="edit">مستهلكات الأقسام</GhostButton>
            </Link>
          )}
          {canCounts && (
            <Link to={tenantPath('/inventory/counts')}>
              <GhostButton iconName="checklist" tone="save">الجرد</GhostButton>
            </Link>
          )}
          {canExceptions && (
            <Link to={tenantPath('/inventory/exceptions')}>
              <GhostButton iconName="warning_amber" tone="undo">الاستثناءات</GhostButton>
            </Link>
          )}
          {canAnalytics && (
            <Link to={tenantPath('/inventory/analytics')}>
              <GhostButton iconName="analytics" tone="view">التحليلات</GhostButton>
            </Link>
          )}
          <Link to={tenantPath('/settings/production')}>
            <GhostButton iconName="settings" tone="print">إعدادات التوجيه</GhostButton>
          </Link>
        </div>
      )}
    >
      {!data.loading && (data.kpiSummary.truncated || data.balancesTruncated) && (
        <p className="text-sm font-medium text-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)] rounded-lg px-4 py-3">
          تم حساب جزء من مؤشرات الأرصدة على حد المسح. راجع صفحة الأرصدة للتفاصيل الكاملة إن لزم.
        </p>
      )}

      {!data.loading && !data.routingReady && (
        <p className="text-sm font-medium text-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)] rounded-lg px-4 py-3">
          توجيه المخازن غير مكتمل (WIP / تم الصنع). أكمل الإعداد من صفحة الإعدادات ثم شغّل مزامنة V1.
        </p>
      )}

      <div className="ops-module-charts__qty-row ops-module-charts__qty-row--4">
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">استلامات بانتظار</p>
          <p className="ops-module-charts__qty-value">{formatNumber(data.awaitingReceiptsCount)}</p>
        </div>
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">رصيد WIP</p>
          <p className="ops-module-charts__qty-value">{formatNumber(data.wipQty)}</p>
        </div>
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">رصيد تام</p>
          <p className="ops-module-charts__qty-value">{formatNumber(data.finishedQty)}</p>
        </div>
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">هالك</p>
          <p className="ops-module-charts__qty-value">{formatNumber(data.wasteQty)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsDashPanel title="تحليل الحركة (الفترة)" accent="inventory">
          <div className="ops-module-charts__chart" dir="ltr">
            {data.movementSummaryTruncated ? (
              <p className="ops-module-charts__hint px-2 pt-1 text-right" dir="rtl">
                عُدّت حتى {formatNumber(data.movementSummaryScanned)} حركة — قد تكون هناك حركات أقدم خارج العينة.
              </p>
            ) : null}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.movementBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_TICK} width={32} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="value" name="العدد" fill="var(--chart-7)" radius={[8, 8, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </OpsDashPanel>
        <OpsDashPanel title="مخاطر المخزون" accent="inventory">
          <div className="ops-module-charts__chart" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.riskBars} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={CHART_TICK} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={96} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="value" name="العدد" fill="var(--color-warning-hex)" radius={[0, 8, 8, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </OpsDashPanel>
      </div>

      <InventoryActionQueue
        tenantPath={tenantPath}
        loading={data.loading}
        transfers={data.queueTransfers}
        transfersTotal={data.pendingTransfersCount}
        issues={data.queueIssues}
        issuesTotal={data.pendingIssuesCount}
        receipts={data.queueReceipts}
        receiptsTotal={data.awaitingReceiptsCount}
      />

      <details className="ops-dash-secondary">
        <summary>مراجعة تفصيلية (حركات / صرف / استلام / تحويل)</summary>
        <div className="ops-dash-secondary__body">
          <InventoryReviewTabs
            tenantPath={tenantPath}
            loading={data.loading}
            txLoading={data.txLoading}
            period={data.period}
            setPeriod={data.setPeriod}
            reviewTab={data.reviewTab}
            setReviewTab={data.setReviewTab}
            movementFilter={data.movementFilter}
            setMovementFilter={data.setMovementFilter}
            sourceFilter={data.sourceFilter}
            setSourceFilter={data.setSourceFilter}
            issueStatusFilter={data.issueStatusFilter}
            setIssueStatusFilter={data.setIssueStatusFilter}
            receiptStatusFilter={data.receiptStatusFilter}
            setReceiptStatusFilter={data.setReceiptStatusFilter}
            transferStatusFilter={data.transferStatusFilter}
            setTransferStatusFilter={data.setTransferStatusFilter}
            movements={data.reviewMovements}
            issues={data.reviewIssues}
            receipts={data.reviewReceipts}
            transfers={data.reviewTransfers}
            warehouseNameById={data.warehouseNameById}
          />
        </div>
      </details>

      <div className={`grid grid-cols-1 gap-3 ${canExceptions ? 'xl:grid-cols-2' : ''}`}>
        <WarehouseHealthGrid
          loading={data.loading}
          rows={data.warehouseHealth}
          onSelectWarehouse={(id) => data.setWarehouseId(id)}
        />
        {canExceptions ? (
          <InventoryExceptionsPreview
            tenantPath={tenantPath}
            loading={data.loading}
            rows={data.exceptionPreview}
          />
        ) : null}
      </div>
    </DomainHomeShell>
  );
};
