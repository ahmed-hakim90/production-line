import React, { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveWarehouseOperatorHomePath } from '../lib/warehouseOperatorHome';
import {
  floorIssuePieceBalancesForProductCard,
  groupIssuedOrdersByProduct,
  isFloorReportCountingTowardIssue,
  reportsAffectedByFloorIssue,
  type FloorIssueCard,
  type FloorIssuePieceBalance,
} from '../lib/productionFloorProductCards';
import { useFloorIssuePrint } from '../hooks/useFloorIssuePrint';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import { productionIssueService } from '../services/productionIssueService';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import type { ProductionIssueOrder, StockItemBalance, Warehouse } from '../types';
import { productionPlanService } from '../../production/services/productionPlanService';
import { workOrderService } from '../../production/services/workOrderService';
import { reportService } from '../../production/services/reportService';
import type { ProductionPlan, ProductionReport, WorkOrder } from '../../../types';

type FloorProductDetailData = {
  warehouse: Warehouse | null;
  balances: StockItemBalance[];
  issuedOrders: ProductionIssueOrder[];
  plansById: Record<string, ProductionPlan>;
  workOrdersById: Record<string, WorkOrder>;
  reports: ProductionReport[];
  reportsLoadFailed: boolean;
};

const PLAN_STATUS_LABEL: Record<string, { label: string; type: 'success' | 'warning' | 'info' | 'muted' | 'danger' }> = {
  planned: { label: 'مش شغال', type: 'info' },
  in_progress: { label: 'شغال', type: 'warning' },
  paused: { label: 'متوقف', type: 'muted' },
  completed: { label: 'مكتمل', type: 'success' },
  cancelled: { label: 'ملغي', type: 'danger' },
};

function formatIssueDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

async function settledRecord<T extends { id?: string }>(
  ids: string[],
  loader: (id: string) => Promise<T | null>,
): Promise<Record<string, T>> {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  const results = await Promise.allSettled(unique.map((id) => loader(id)));
  const map: Record<string, T> = {};
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled' || !result.value?.id) return;
    map[unique[index]] = result.value;
  });
  return map;
}

export const ProductionFloorProductDetail: React.FC = () => {
  const { tenantSlug, productId: rawProductId } = useParams<{ tenantSlug?: string; productId?: string }>();
  const productId = decodeURIComponent(String(rawProductId || '').trim());
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const printOrders = useFloorIssuePrint();
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const floorId = String(routing.productionFloorWarehouseId || '').trim();
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
  const listPath = withTenantPath(tenantSlug, '/production/floor');
  const canPrint = can('productionIssue.print');
  const canViewReports = can('reports.view');

  const CACHE_KEY = canAccessFloor && productId
    ? `inventory:production-floor-product:${floorId}:${productId}`
    : null;

  const { data, loading, reload: reloadCached } = useCachedPageLoad<FloorProductDetailData>(
    CACHE_KEY,
    async () => {
      if (!canAccessFloor || !floorId || !productId) {
        return {
          warehouse: null,
          balances: [],
          issuedOrders: [],
          plansById: {},
          workOrdersById: {},
          reports: [],
          reportsLoadFailed: false,
        };
      }
      const [warehouses, balances, issuedOrders] = await Promise.all([
        warehouseService.getAllWarehouses(),
        stockService.getBalances(floorId),
        productionIssueService.listIssuedForTargetWarehouse(floorId),
      ]);
      const productOrders = issuedOrders.filter((order) => String(order.productId || '').trim() === productId);
      const [plansById, workOrdersById, reportsResult] = await Promise.all([
        settledRecord(
          productOrders.map((order) => String(order.productionPlanId || '')),
          (id) => productionPlanService.getById(id),
        ),
        settledRecord(
          productOrders.map((order) => String(order.workOrderId || '')),
          (id) => workOrderService.getById(id),
        ),
        Promise.allSettled([reportService.getByProduct(productId)]),
      ]);
      const reportsLoadFailed = reportsResult[0].status === 'rejected';
      return {
        warehouse: warehouses.find((w) => w.id === floorId) || null,
        balances: balances.filter((b) => Number(b.quantity || 0) !== 0),
        issuedOrders: productOrders,
        plansById,
        workOrdersById,
        reports: reportsResult[0].status === 'fulfilled' ? reportsResult[0].value : [],
        reportsLoadFailed,
      };
    },
    { maxAgeMs: 45_000 },
  );

  const reload = async () => {
    if (!CACHE_KEY) return;
    invalidatePageDataCache(CACHE_KEY);
    await reloadCached(true);
  };

  const card = useMemo(
    () => groupIssuedOrdersByProduct({
      orders: data?.issuedOrders || [],
      floorWarehouseId: floorId,
      balances: data?.balances || [],
    })[0] || null,
    [data?.issuedOrders, data?.balances, floorId],
  );

  const pieceBalances = useMemo(() => {
    if (!card) {
      return {
        byIssueId: new Map<string, FloorIssuePieceBalance>(),
        total: { issuedQty: 0, producedQty: 0, remainingQty: 0 } as FloorIssuePieceBalance,
      };
    }
    return floorIssuePieceBalancesForProductCard({
      card,
      reports: data?.reports || [],
      plansById: data?.plansById,
    });
  }, [card, data?.reports, data?.plansById]);

  const printProduct = () => {
    if (!card || !printOrders(card.issues.map((issue) => issue.order), `صالة-إنتاج-${card.productCode || card.productName}`)) {
      toast.error('لا توجد مكونات للطباعة.');
    }
  };

  const printIssue = (issue: FloorIssueCard) => {
    if (!printOrders([issue.order], `إذن صرف إنتاج-${issue.order.referenceNo || issue.order.id}`)) {
      toast.error('لا توجد مكونات للطباعة.');
    }
  };

  if (!can('inventory.view')) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>;
  }

  if (scoped && !canAccessFloor) {
    return <Navigate to={blockedHomePath} replace />;
  }

  if (!productId) {
    return <Navigate to={listPath} replace />;
  }

  if (loading && !data) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  const hero = card
    ? [
        { key: 'issues', label: 'أوامر صرف', value: card.issues.length },
        { key: 'issued', label: 'منصرف', value: formatNumber(pieceBalances.total.issuedQty) },
        { key: 'produced', label: 'إنتاج', value: formatNumber(pieceBalances.total.producedQty) },
        { key: 'remaining', label: 'باقي', value: formatNumber(pieceBalances.total.remainingQty) },
      ]
    : [];

  return (
    <ModuleOpsPageShell
      eyebrow="تفاصيل صالة الإنتاج"
      rangeLabel={card ? `${card.productName} · ${card.productCode || '—'}` : 'لا يوجد صرف لهذا المنتج في الصالة'}
      hero={hero}
      onRefresh={() => void reload()}
      refreshing={loading}
      actions={(
        <>
          <Link to={listPath}>
            <GhostButton iconName="arrow_forward" tone="view">رجوع للكروت</GhostButton>
          </Link>
          {canPrint && card && (
            <PrimaryButton iconName="print" tone="print" onClick={printProduct}>
              طباعة المكونات
            </PrimaryButton>
          )}
        </>
      )}
    >
      {!card ? (
        <OpsDashPanel title="لا توجد بيانات" accent="inventory">
          <p className="text-sm text-[var(--color-text-muted)]">
            لا يوجد إذن صرف مرحّل لهذا المنتج على مخزن صالة الإنتاج.
          </p>
        </OpsDashPanel>
      ) : (
        card.issues.map((issue) => {
          const plan = issue.order.productionPlanId
            ? data?.plansById[issue.order.productionPlanId]
            : undefined;
          const workOrder = issue.order.workOrderId
            ? data?.workOrdersById[issue.order.workOrderId]
            : undefined;
          const reports = reportsAffectedByFloorIssue({
            issue: issue.order,
            plan: plan || null,
            reports: data?.reports || [],
          });
          const countingReports = reports.filter(isFloorReportCountingTowardIssue);
          const issueBalance = pieceBalances.byIssueId.get(String(issue.order.id || ''))
            || {
              issuedQty: Math.max(0, Number(issue.order.quantity || 0)),
              producedQty: 0,
              remainingQty: Math.max(0, Number(issue.order.quantity || 0)),
            };
          const plannedQty = Number(plan?.plannedQuantity || workOrder?.quantity || issue.order.quantity || 0);
          const planProducedQty = Number(plan?.producedQuantity || workOrder?.producedQuantity || 0);
          const planRemainingQty = plan
            ? Number(plan.remainingQuantity ?? Math.max(0, plannedQty - planProducedQty))
            : Math.max(0, Number(workOrder?.quantity || 0) - planProducedQty);
          const status = plan ? PLAN_STATUS_LABEL[plan.status] : null;

          return (
            <div key={issue.order.id} className="space-y-3">
              <OpsDashPanel
                title={issue.summaryAr}
                accent="inventory"
                action={
                  canPrint ? (
                    <GhostButton iconName="print" tone="print" onClick={() => printIssue(issue)}>
                      طباعة هذا الصرف
                    </GhostButton>
                  ) : null
                }
              >
                <p className="text-sm text-[var(--color-text-muted)]">
                  {issue.order.referenceNo}
                  {' · '}
                  {issue.sourceLabel}
                  {' · '}
                  {formatIssueDate(issue.issuedAt)}
                  {data?.warehouse?.name ? ` · ${data.warehouse.name}` : ''}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:max-w-md">
                  <div className="rounded-lg border border-[var(--color-border)] px-2 py-2">
                    <p className="text-[10px] text-[var(--color-text-muted)]">منصرف</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(issueBalance.issuedQty)}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] px-2 py-2">
                    <p className="text-[10px] text-[var(--color-text-muted)]">إنتاج</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(issueBalance.producedQty)}</p>
                  </div>
                  <div className="rounded-lg border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.06)] px-2 py-2">
                    <p className="text-[10px] text-[var(--color-text-muted)]">باقي</p>
                    <p className="text-sm font-bold tabular-nums text-[rgb(var(--color-primary))]">
                      {formatNumber(issueBalance.remainingQty)}
                    </p>
                  </div>
                </div>
              </OpsDashPanel>

              <OpsDashPanel title="تفاصيل الخطة / أمر الشغل" accent="plans">
                {plan || workOrder ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-[var(--color-text-muted)]">المصدر</p>
                      <p className="text-sm font-bold">{issue.sourceLabel}</p>
                      {status ? <StatusBadge label={status.label} type={status.type} className="mt-1" /> : null}
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-text-muted)]">المخطط / أمر الشغل</p>
                      <p className="text-sm font-bold tabular-nums">{formatNumber(plannedQty)} قطعة</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-text-muted)]">منتج فعلياً (الخطة)</p>
                      <p className="text-sm font-bold tabular-nums">{formatNumber(planProducedQty)} قطعة</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-text-muted)]">متبقي الخطة</p>
                      <p className="text-sm font-bold tabular-nums">{formatNumber(planRemainingQty)} قطعة</p>
                    </div>
                    {plan ? (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-[var(--color-text-muted)]">فترة الخطة</p>
                        <p className="text-sm font-medium">
                          {plan.plannedStartDate || plan.startDate || '—'}
                          {' → '}
                          {plan.plannedEndDate || '—'}
                        </p>
                      </div>
                    ) : null}
                    {workOrder ? (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-[var(--color-text-muted)]">أمر الشغل</p>
                        <p className="text-sm font-medium">{workOrder.workOrderNumber || workOrder.id}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    لا توجد خطة أو أمر شغل مرتبط بهذا الصرف.
                  </p>
                )}
              </OpsDashPanel>

              <OpsDashPanel title="التقارير التي تأثرت بهذا الصرف" accent="production">
                {data?.reportsLoadFailed ? (
                  <p className="text-sm text-[rgb(var(--color-warning))]">تعذر تحميل التقارير. أعد المحاولة.</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">لا توجد تقارير إنتاج مرتبطة بهذه الخطة حتى الآن.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="erp-table w-full">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th text-start">التقرير</th>
                          <th className="erp-th text-center">التاريخ</th>
                          <th className="erp-th text-center">الكمية المنتَجة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((report) => {
                          const reportsHref = issue.order.productionPlanId
                            ? `/reports?productionPlanId=${encodeURIComponent(issue.order.productionPlanId)}`
                            : issue.order.workOrderId
                              ? `/reports?workOrderId=${encodeURIComponent(issue.order.workOrderId)}`
                              : '';
                          const counts = isFloorReportCountingTowardIssue(report);
                          return (
                          <tr key={report.id} className="border-b">
                            <td className="px-4 py-3">
                              {canViewReports && report.id && reportsHref ? (
                                <Link
                                  className="text-sm font-medium text-[rgb(var(--color-primary))] underline"
                                  to={withTenantPath(tenantSlug, reportsHref)}
                                >
                                  {report.reportCode || report.id}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium">{report.reportCode || report.id}</span>
                              )}
                              {!counts ? (
                                <p className="text-[11px] text-[var(--color-text-muted)]">
                                  لا يخصم من رصيد هذا الصرف
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-center text-sm tabular-nums">{report.date || '—'}</td>
                            <td className="px-4 py-3 text-center text-sm font-bold tabular-nums">
                              {formatNumber(report.quantityProduced)}
                            </td>
                          </tr>
                          );
                        })}
                        <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface)]">
                          <td className="px-4 py-3 text-sm font-bold" colSpan={2}>
                            إجمالي رصيد هذا الصرف
                            {countingReports.length !== reports.length ? (
                              <span className="ms-1 text-xs font-medium text-[var(--color-text-muted)]">
                                (تقارير مفعّلة فقط)
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold tabular-nums">
                            <span className="block">إنتاج {formatNumber(issueBalance.producedQty)}</span>
                            <span className="block text-[rgb(var(--color-primary))]">
                              باقي {formatNumber(issueBalance.remainingQty)}
                            </span>
                            <span className="block text-xs font-medium text-[var(--color-text-muted)]">
                              منصرف {formatNumber(issueBalance.issuedQty)}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </OpsDashPanel>

              <OpsDashPanel title="مكونات هذا الصرف" accent="inventory" bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="erp-table w-full">
                    <thead className="erp-thead">
                      <tr>
                        <th className="erp-th text-start">المكون</th>
                        <th className="erp-th text-center">لكل وحدة</th>
                        <th className="erp-th text-center">كمية هذا الصرف</th>
                        <th className="erp-th text-center">مرتجع</th>
                        <th className="erp-th text-center">تعويض</th>
                        <th className="erp-th text-center">رصيد الصالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issue.lines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
                            لا توجد مكونات في أمر الصرف.
                          </td>
                        </tr>
                      ) : (
                        issue.lines.map((line) => (
                          <tr key={`${issue.order.id}-${line.itemType}-${line.itemId}`} className="border-b">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium">{line.itemName}</p>
                              <p className="text-xs font-mono text-[var(--color-text-muted)]">{line.itemCode}</p>
                            </td>
                            <td className="px-4 py-3 text-center tabular-nums">{formatNumber(line.qtyPerUnit)}</td>
                            <td className="px-4 py-3 text-center tabular-nums font-bold">{formatNumber(line.issuedQty)}</td>
                            <td className="px-4 py-3 text-center tabular-nums">{formatNumber(line.returnedQty)}</td>
                            <td className="px-4 py-3 text-center tabular-nums">{formatNumber(line.compensatedQty)}</td>
                            <td className="px-4 py-3 text-center tabular-nums">{formatNumber(line.floorQty)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </OpsDashPanel>
            </div>
          );
        })
      )}
    </ModuleOpsPageShell>
  );
};
