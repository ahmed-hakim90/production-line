import React, { useCallback } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { useInventoryControlData } from './inventoryDashboard/useInventoryControlData';
import { InventoryActionQueue } from './inventoryDashboard/InventoryActionQueue';
import { InventoryReviewTabs } from './inventoryDashboard/InventoryReviewTabs';
import { WarehouseHealthGrid } from './inventoryDashboard/WarehouseHealthGrid';
import { InventoryExceptionsPreview } from './inventoryDashboard/InventoryExceptionsPreview';

export const InventoryDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { scoped, controlPath } = useMaterialsWarehouseScope();
  const { can } = usePermission();
  const data = useInventoryControlData();

  const tenantPath = useCallback(
    (path: string) => withTenantPath(tenantSlug, path),
    [tenantSlug],
  );

  if (scoped) {
    return <Navigate to={withTenantPath(tenantSlug, controlPath)} replace />;
  }

  if (data.loading && data.warehousesCount === 0) {
    return <PageContentSkeleton variant="dashboard" kpiCount={8} />;
  }

  const canCreateTx = can('inventory.transactions.create');
  const canCounts = can('inventory.counts.manage');
  const canAnalytics = can('inventory.analytics.view');
  const canExceptions = can('inventory.exceptions.view');

  return (
    <div className="erp-ds-clean erp-dashboard-theme space-y-6">
      <PageHeader
        title="لوحة تحكم المخزون"
        subtitle="مراجعة شاملة لكل المخازن والحركات وصرف الإنتاج والاستلامات والتحويلات."
        actions={(
          <div className="flex flex-wrap gap-2">
            <GhostButton
              iconName="refresh"
              tone="neutral"
              onClick={() => void data.refresh()}
              disabled={data.loading || data.txLoading}
            >
              تحديث
            </GhostButton>
            {canCreateTx && (
              <>
                <Link to={tenantPath('/inventory/movements')}>
                  <PrimaryButton iconName="swap_horiz" tone="execute">
                    حركة مخزون
                  </PrimaryButton>
                </Link>
                <Link to={tenantPath('/inventory/raw-materials/receive')}>
                  <GhostButton iconName="inventory_2" tone="share">
                    استلام مستلزمات
                  </GhostButton>
                </Link>
                <Link to={tenantPath('/quick-inventory-transfer')}>
                  <GhostButton iconName="sync_alt" tone="export">
                    تحويل سريع
                  </GhostButton>
                </Link>
              </>
            )}
            <Link to={tenantPath('/inventory/transfer-approvals')}>
              <GhostButton iconName="fact_check" tone="approve">
                اعتماد التحويلات
              </GhostButton>
            </Link>
            <Link to={tenantPath('/inventory/production-issues')}>
              <GhostButton iconName="precision_manufacturing" tone="edit">
                صرف إنتاج
              </GhostButton>
            </Link>
            {canCounts && (
              <Link to={tenantPath('/inventory/counts')}>
                <GhostButton iconName="checklist" tone="save">
                  الجرد
                </GhostButton>
              </Link>
            )}
            {canExceptions && (
              <Link to={tenantPath('/inventory/exceptions')}>
                <GhostButton iconName="warning_amber" tone="undo">
                  الاستثناءات
                </GhostButton>
              </Link>
            )}
            {canAnalytics && (
              <Link to={tenantPath('/inventory/analytics')}>
                <GhostButton iconName="analytics" tone="view">
                  التحليلات
                </GhostButton>
              </Link>
            )}
            <Link to={tenantPath('/settings/production')}>
              <GhostButton iconName="settings" tone="print">
                إعدادات التوجيه
              </GhostButton>
            </Link>
          </div>
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="inv-control-warehouse">
          المخزن
        </label>
        <select
          id="inv-control-warehouse"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[220px]"
          value={data.warehouseId}
          onChange={(e) => data.setWarehouseId(e.target.value)}
        >
          <option value="">كل المخازن</option>
          {data.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {!data.loading && (data.kpiSummary.truncated || data.balancesTruncated) && (
        <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          تم حساب جزء من مؤشرات الأرصدة على حد المسح. راجع صفحة الأرصدة للتفاصيل الكاملة إن لزم.
        </p>
      )}

      {!data.loading && !data.routingReady && (
        <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          توجيه المخازن غير مكتمل (WIP / تم الصنع). أكمل الإعداد من صفحة الإعدادات ثم شغّل مزامنة V1.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          label="عدد المخازن"
          value={data.warehousesCount}
          iconType="metric"
          color="indigo"
          loading={data.loading}
        />
        <KPICard
          label="إجمالي الأصناف"
          value={data.kpiSummary.totalLines}
          iconType="metric"
          color="indigo"
          loading={data.loading}
        />
        <KPICard
          label="إجمالي الكميات"
          value={formatNumber(data.kpiSummary.totalQty)}
          iconType="metric"
          color="green"
          loading={data.loading}
        />
        <KPICard
          label="أصناف منخفضة"
          value={data.kpiSummary.lowStockCount}
          iconType="money"
          color="amber"
          loading={data.loading}
        />
        <KPICard
          label="تحويلات معلقة"
          value={data.pendingTransfersCount}
          iconType="trend"
          color="amber"
          loading={data.loading}
        />
        <KPICard
          label="صرف إنتاج معلق"
          value={data.pendingIssuesCount}
          iconType="trend"
          color="amber"
          loading={data.loading}
        />
        <KPICard
          label="استلامات بانتظار"
          value={data.awaitingReceiptsCount}
          iconType="trend"
          color="amber"
          loading={data.loading}
        />
        <KPICard
          label="أرصدة سالبة"
          value={data.negativeCount}
          iconType="metric"
          color="red"
          loading={data.loading}
        />
        <KPICard
          label="رصيد WIP"
          value={formatNumber(data.wipQty)}
          iconType="metric"
          color="green"
          loading={data.loading}
        />
        <KPICard
          label="رصيد تم الصنع"
          value={formatNumber(data.finishedQty)}
          iconType="metric"
          color="green"
          loading={data.loading}
        />
        <KPICard
          label="رصيد الهالك"
          value={formatNumber(data.wasteQty)}
          iconType="metric"
          color="gray"
          loading={data.loading}
        />
        <KPICard
          label="قيمة المخزون (تقديري)"
          value={formatNumber(data.stockValueSummary.totalValue)}
          iconType="money"
          color="indigo"
          loading={data.loading}
        />
        {!data.warehouseId && (
          <KPICard
            label="تنبيهات مستلزمات"
            value={data.suppliesAlertCount}
            iconType="trend"
            color="amber"
            loading={data.loading}
          />
        )}
        <KPICard
          label="أصناف بلا تكلفة"
          value={data.stockValueSummary.unknownLines}
          iconType="metric"
          color="gray"
          loading={data.loading}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">طابور المراجعة</h2>
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
      </div>

      <InventoryReviewTabs
        tenantPath={tenantPath}
        loading={data.loading}
        txLoading={data.txLoading}
        reviewTab={data.reviewTab}
        setReviewTab={data.setReviewTab}
        period={data.period}
        setPeriod={data.setPeriod}
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

      <div className={`grid grid-cols-1 gap-5 ${canExceptions ? 'xl:grid-cols-2' : ''}`}>
        <WarehouseHealthGrid
          loading={data.loading}
          rows={data.warehouseHealth}
          onSelectWarehouse={(id) => data.setWarehouseId(id)}
        />
        {canExceptions && (
          <InventoryExceptionsPreview
            tenantPath={tenantPath}
            loading={data.loading}
            rows={data.exceptionPreview}
          />
        )}
      </div>
    </div>
  );
};
