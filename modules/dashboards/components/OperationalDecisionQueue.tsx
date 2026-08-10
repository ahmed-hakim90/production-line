import React, { useEffect, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { KPICard } from '@/src/components/erp/KPICard';
import { GhostButton } from '@/src/components/erp/ActionButton';
import { formatNumber } from '../../../utils/calculations';
import type { OperationalDecisionSnapshot } from '../hooks/useOperationalDecisionSnapshot';
import { usePermission } from '../../../utils/permissions';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import { repairSpareIssueService } from '../../repair/services/repairSpareIssueService';

type Props = {
  snapshot: OperationalDecisionSnapshot;
  loading?: boolean;
  title?: string;
  /** Dense list for single-viewport boards — hides the wide KPI strip. */
  compact?: boolean;
  /** Max actionable queue rows in compact mode (default 6). */
  maxItems?: number;
  /** Extra absence risk from production worker snapshot (factory). */
  absentWorkersToday?: number;
  /** Sum of remaining × expected unit cost for active work orders. */
  costToComplete?: number | null;
  /** Active WOs where forecast finish is after targetDate. */
  atRiskWorkOrders?: number;
  /** Work orders waiting quality approval. */
  qualityPending?: number;
  /**
   * Labor utilization proxy (actual / scheduled hours) — not true OEE.
   * Pass from dashboard reports when available.
   */
  laborUtilizationPercent?: number | null;
  performanceProxyPercent?: number | null;
};

type QueueItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info' | 'ok';
  path: string;
  permission?: string;
  anyOf?: string[];
};

function toneClass(tone: QueueItem['tone']): string {
  if (tone === 'danger') return 'border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)]/80 text-[rgb(var(--color-danger))] dark:bg-[rgb(var(--color-danger))]/15 dark:border-[rgb(var(--color-danger)/0.25)] dark:text-[rgb(var(--color-danger))]';
  if (tone === 'warning') return 'border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/80 text-[rgb(var(--color-warning))] dark:bg-[rgb(var(--color-warning))]/15 dark:border-[rgb(var(--color-warning)/0.25)] dark:text-[rgb(var(--color-warning))]';
  if (tone === 'ok') return 'border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)]/70 text-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success))]/15 dark:border-[rgb(var(--color-success)/0.25)] dark:text-[rgb(var(--color-success))]';
  return 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] dark:bg-[var(--color-surface-hover)] dark:border-[var(--color-border)] dark:text-[var(--color-text-muted)]';
}

export const OperationalDecisionQueue: React.FC<Props> = ({
  snapshot,
  loading,
  title = 'طابور القرارات التشغيلية',
  compact = false,
  maxItems = 6,
  absentWorkersToday,
  costToComplete,
  atRiskWorkOrders,
  qualityPending,
  laborUtilizationPercent,
  performanceProxyPercent,
}) => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const {
    issues,
    transfers,
    packaging,
    inventory,
    receipts,
    stockCounts,
    materials,
    planVolumeAchievement,
    scheduleAdherence,
    behindScheduleCount,
  } = snapshot;

  const canSeeRepairReplenishment =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.approve')
    || can('sparePartsReplenishment.prepare')
    || can('sparePartsReplenishment.receive');
  const canSeeRepairSpareIssues = can('repairSpareIssues.view');
  const [repairCounts, setRepairCounts] = useState({
    centralPending: 0,
    awaitingReceive: 0,
    spareIssuesPending: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const loadRepairQueues = async () => {
      if (!canSeeRepairReplenishment && !canSeeRepairSpareIssues) return;
      try {
        const [centralPending, awaitingReceive, spareIssuesPending] = await Promise.all([
          canSeeRepairReplenishment
            ? sparePartsReplenishmentService.countCentralPending()
            : Promise.resolve(0),
          canSeeRepairReplenishment
            ? sparePartsReplenishmentService.countAwaitingReceive()
            : Promise.resolve(0),
          canSeeRepairSpareIssues
            ? repairSpareIssueService.countPending()
            : Promise.resolve(0),
        ]);
        if (!cancelled) {
          setRepairCounts({ centralPending, awaitingReceive, spareIssuesPending });
        }
      } catch {
        if (!cancelled) {
          setRepairCounts({ centralPending: 0, awaitingReceive: 0, spareIssuesPending: 0 });
        }
      }
    };
    void loadRepairQueues();
    return () => {
      cancelled = true;
    };
  }, [canSeeRepairReplenishment, canSeeRepairSpareIssues]);

  const canSee = (item: QueueItem): boolean => {
    if (item.anyOf?.length) return item.anyOf.some((p) => can(p as any));
    if (item.permission) return can(item.permission as any);
    return true;
  };

  const items: QueueItem[] = [
    {
      id: 'issues',
      label: 'صرف إنتاج معلّق',
      value: String(issues.openCount),
      detail:
        issues.openCount > 0
          ? `${formatNumber(issues.openRequestedQty)} وحدة مطلوبة · تنفيذ ${issues.fulfilmentPercent}% · متأخر +24س: ${issues.agingOver24h + issues.agingOver72h}`
          : 'لا توجد طلبات مفتوحة',
      tone: issues.agingOver72h > 0 ? 'danger' : issues.openCount > 0 ? 'warning' : 'ok',
      path: '/inventory/production-issues',
      anyOf: ['inventory.view', 'productionIssue.approve', 'productionIssue.request', 'productionIssue.create'],
    },
    {
      id: 'packaging',
      label: 'بانتظار التغليف / استلام',
      value: packaging.configured ? formatNumber(packaging.awaitingUnits + packaging.handoverRemainingUnits) : '—',
      detail: packaging.configured
        ? `تحت التسليم: ${formatNumber(packaging.handoverRemainingUnits)} · بانتظار تغليف: ${formatNumber(packaging.awaitingUnits)} · استلام معلّق: ${packaging.pendingHandover}`
        : 'حدّد مخازن التغليف في توجيه المخازن',
      tone: !packaging.configured
        ? 'info'
        : packaging.pendingHandover > 0 || packaging.pendingTransfers > 0 || packaging.awaitingUnits > 0
          ? 'warning'
          : 'ok',
      path: '/production/packaging/control',
      anyOf: ['reports.view', 'reports.packaging.create', 'productionHandover.approve'],
    },
    {
      id: 'fg-entry',
      label: 'اعتماد دخول إنتاج',
      value: String(transfers.pendingProductionEntry),
      detail:
        transfers.agingOver24h > 0
          ? `${transfers.agingOver24h} طلب تحويل تجاوز 24 ساعة`
          : 'تحويلات production_entry بانتظار الاعتماد',
      tone: transfers.pendingProductionEntry > 0 ? 'warning' : 'ok',
      path: '/inventory/transfer-approvals',
      anyOf: ['inventory.view', 'inventory.transfers.approve'],
    },
    {
      id: 'plans',
      label: 'خطط متأخرة عن الجدول',
      value: String(behindScheduleCount),
      detail: `التزام الجدول ${scheduleAdherence}% · تحقيق موزون بالحجم ${planVolumeAchievement}%`,
      tone: behindScheduleCount > 0 ? (scheduleAdherence < 70 ? 'danger' : 'warning') : 'ok',
      path: '/production-plans',
      anyOf: ['plans.view', 'factoryDashboard.view', 'adminDashboard.view'],
    },
    {
      id: 'inventory-risk',
      label: 'مخاطر المخزون',
      value: String(inventory.negativeCount + inventory.lowStockCount),
      detail: `سالب ${inventory.negativeCount} · تحت الحد ${inventory.lowStockCount} · تنبيهات مستلزمات ${inventory.suppliesAlertCount}`,
      tone:
        inventory.negativeCount > 0
          ? 'danger'
          : inventory.lowStockCount > 0 || inventory.suppliesAlertCount > 0
            ? 'warning'
            : 'ok',
      path: '/inventory/exceptions',
      anyOf: ['inventory.view', 'inventory.exceptions.view', 'adminDashboard.view', 'factoryDashboard.view'],
    },
    {
      id: 'receipts',
      label: 'إيصالات مستلزمات معلّقة',
      value: String(receipts.awaitingCount),
      detail:
        receipts.awaitingCount > 0
          ? `متوسط دورة التنفيذ ${receipts.avgCycleHours ?? '—'} س · متأخر +24س: ${receipts.agingOver24h + receipts.agingOver72h}`
          : receipts.avgCycleHours != null
            ? `متوسط دورة آخر الإيصالات ${receipts.avgCycleHours} ساعة`
            : 'لا طابور استلام مفتوح',
      tone: receipts.agingOver72h > 0 ? 'danger' : receipts.awaitingCount > 0 ? 'warning' : 'ok',
      path: '/inventory/production-approvals',
      anyOf: ['inventory.view', 'inventory.transactions.create'],
    },
    {
      id: 'counts',
      label: 'الجرد والمطابقة',
      value:
        stockCounts.accuracyPercent != null
          ? `${stockCounts.accuracyPercent}%`
          : String(stockCounts.openSessions + stockCounts.awaitingApproval),
      detail:
        stockCounts.countedLines > 0
          ? `دقة المطابقة · مفتوح ${stockCounts.openSessions} · بانتظار اعتماد ${stockCounts.awaitingApproval} · فرق مطلق ${formatNumber(stockCounts.absoluteVarianceQty)}`
          : `جلسات مفتوحة ${stockCounts.openSessions} · بانتظار اعتماد ${stockCounts.awaitingApproval}`,
      tone:
        stockCounts.awaitingApproval > 0 || (stockCounts.accuracyPercent != null && stockCounts.accuracyPercent < 90)
          ? 'warning'
          : stockCounts.openSessions > 0
            ? 'info'
            : 'ok',
      path: '/inventory/counts',
      anyOf: ['inventory.counts.manage', 'inventory.view'],
    },
    {
      id: 'materials',
      label: 'جاهزية المواد للخطط',
      value:
        materials.assemblableCoveragePercent != null
          ? `${materials.assemblableCoveragePercent}%`
          : `${materials.readinessPercent}%`,
      detail:
        materials.assemblableCoveragePercent != null
          ? `تغطية تجميع حية · خطط بنواقص مسجّلة ${materials.plansWithShortage} · تحت القدرة ${materials.plansBelowAssemblable} · عجز ${formatNumber(materials.assemblableShortfallQty)}`
          : materials.plansWithShortage > 0
            ? `${materials.plansWithShortage} خطة بنواقص · ${formatNumber(materials.totalShortageQty)} وحدة مكوّن · متبقي معرّض ${formatNumber(materials.blockedRemainingQty)}`
            : 'لا نواقص مكونات مفتوحة على الخطط النشطة',
      tone:
        (materials.assemblableCoveragePercent != null && materials.assemblableCoveragePercent < 70) ||
        materials.readinessPercent < 70
          ? 'danger'
          : materials.plansWithShortage > 0 || materials.plansBelowAssemblable > 0
            ? 'warning'
            : 'ok',
      path: '/production/issue-requests',
      anyOf: [
        'plans.view',
        'productionIssue.request',
        'factoryDashboard.view',
        'adminDashboard.view',
        'inventory.view',
      ],
    },
    {
      id: 'spare-replenishment-central',
      label: 'تموين مراكز معلّق',
      value: String(repairCounts.centralPending),
      detail:
        repairCounts.centralPending > 0
          ? 'طلبات بانتظار اعتماد / تجهيز / موافقة المسؤول'
          : 'لا طابور تموين في المخزن المركزي',
      tone: repairCounts.centralPending > 0 ? 'warning' : 'ok',
      path: '/inventory/spare-parts-replenishment',
      anyOf: [
        'sparePartsReplenishment.view',
        'sparePartsReplenishment.approve',
        'sparePartsReplenishment.prepare',
        'inventory.view',
      ],
    },
    {
      id: 'spare-replenishment-receive',
      label: 'تموين بانتظار استلام المركز',
      value: String(repairCounts.awaitingReceive),
      detail:
        repairCounts.awaitingReceive > 0
          ? 'طلبات معتمدة جاهزة لتأكيد الاستلام في المركز'
          : 'لا استلام معلّق',
      tone: repairCounts.awaitingReceive > 0 ? 'warning' : 'ok',
      path: '/repair/parts-replenishment',
      anyOf: [
        'sparePartsReplenishment.view',
        'sparePartsReplenishment.receive',
        'sparePartsReplenishment.create',
      ],
    },
    {
      id: 'repair-spare-issues',
      label: 'سندات صرف قطع غيار معلّقة',
      value: String(repairCounts.spareIssuesPending),
      detail:
        repairCounts.spareIssuesPending > 0
          ? 'مسودات / مقدّمة / معتمدة بانتظار الصرف'
          : 'لا سندات صرف مفتوحة',
      tone: repairCounts.spareIssuesPending > 0 ? 'warning' : 'ok',
      path: '/repair/spare-issues',
      anyOf: ['repairSpareIssues.view', 'repair.parts.view', 'repair.view'],
    },
  ];

  if (typeof absentWorkersToday === 'number') {
    items.push({
      id: 'absent',
      label: 'عمال غائبون اليوم',
      value: String(absentWorkersToday),
      detail: 'من متابعة أهداف عمال الإنتاج',
      tone: absentWorkersToday > 0 ? 'warning' : 'ok',
      path: '/production-workers',
      anyOf: ['production.workers.view', 'productionWorkers.view', 'factoryDashboard.view'],
    });
  }

  if (typeof qualityPending === 'number') {
    items.push({
      id: 'quality',
      label: 'جودة بانتظار الاعتماد',
      value: String(qualityPending),
      detail: 'أوامر شغل حالتها غير معتمدة',
      tone: qualityPending > 0 ? 'warning' : 'ok',
      path: '/quality/reports',
      anyOf: ['quality.view', 'quality.reports.view', 'quality.approve', 'workOrders.view', 'adminDashboard.view', 'factoryDashboard.view'],
    });
  }

  if (typeof atRiskWorkOrders === 'number') {
    items.push({
      id: 'wo-risk',
      label: 'أوامر شغل متأخرة عن الهدف',
      value: String(atRiskWorkOrders),
      detail:
        typeof costToComplete === 'number' && costToComplete > 0
          ? `تكلفة إكمال متبقية ≈ ${formatNumber(Math.round(costToComplete))} ج.م`
          : 'حسب توقع الإنجاز مقابل تاريخ الهدف',
      tone: atRiskWorkOrders > 0 ? 'danger' : 'ok',
      path: '/work-orders',
      anyOf: ['workOrders.view', 'factoryDashboard.view', 'adminDashboard.view'],
    });
  }

  const visible = items.filter(canSee);
  // Compact board: only items that need attention — never dump every green "ok" card.
  const attentionItems = visible
    .filter((item) => item.tone !== 'ok')
    .sort((a, b) => {
      const rank = (tone: QueueItem['tone']) => (tone === 'danger' ? 0 : tone === 'warning' ? 1 : 2);
      return rank(a.tone) - rank(b.tone);
    });
  const compactItems = compact
    ? attentionItems.slice(0, Math.max(1, maxItems))
    : visible;
  const hiddenCount = compact ? Math.max(0, attentionItems.length - compactItems.length) : 0;

  if (compact) {
    return (
      <div className="space-y-2 h-full">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-1.5">
            <span className="material-icons-round text-base text-primary">rule</span>
            يحتاج متابعة
          </h3>
          {hiddenCount > 0 && (
            <span className="text-[11px] font-bold text-[var(--color-text-muted)]">
              +{hiddenCount}
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={`cq-skel-${idx}`} className="h-12 rounded-[var(--border-radius-lg)] bg-[var(--color-surface-hover)] animate-pulse" />
            ))}
          </div>
        ) : compactItems.length === 0 ? (
          <div className="rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)]/80 px-3 py-6 text-center">
            <p className="text-xs font-bold text-[rgb(var(--color-success))]">لا يوجد ما يحتاج متابعة الآن</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {compactItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                className={`w-full text-right rounded-[var(--border-radius-lg)] border px-3 py-2.5 transition hover:shadow-sm ${toneClass(item.tone)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold opacity-80 truncate">{item.label}</p>
                    <p className="text-[10px] mt-0.5 opacity-75 truncate">{item.detail}</p>
                  </div>
                  <span className="text-lg font-black tabular-nums shrink-0">{item.value}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <span className="material-icons-round text-base text-primary">rule</span>
          {title}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] sm:mr-auto">
          داتا حية من صرف · تغليف · تموين مراكز · سندات قطع · اعتمادات · مخزون · إيصالات · التزام الخطط
        </p>
      </div>

      <div className="overflow-x-auto pb-1 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
        <div className="flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 sm:gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <KPICard key={`decision-kpi-loading-${idx}`} label="" value="" loading />
            ))
          ) : (
            <>
              <KPICard
                label="تنفيذ صرف الإنتاج"
                value={`${issues.fulfilmentPercent}%`}
                iconType="trend"
                color={issues.fulfilmentPercent >= 80 ? 'green' : issues.openCount > 0 ? 'amber' : 'indigo'}
                trend={
                  issues.openCount > 0
                    ? `${issues.openCount} طلب مفتوح · ${formatNumber(issues.openRequestedQty)} وحدة`
                    : 'لا طابور مفتوح'
                }
                trendUp={issues.fulfilmentPercent >= 80}
              />
              <KPICard
                label="تحقيق الخطة (موزون)"
                value={`${planVolumeAchievement}%`}
                iconType="metric"
                color={planVolumeAchievement >= 90 ? 'green' : planVolumeAchievement >= 70 ? 'amber' : 'red'}
                trend={`التزام الجدول ${scheduleAdherence}%`}
                trendUp={planVolumeAchievement >= 70}
              />
              <KPICard
                label="وحدات بانتظار التغليف"
                value={packaging.configured ? formatNumber(packaging.awaitingUnits) : '—'}
                unit={packaging.configured ? 'وحدة' : undefined}
                iconType="trend"
                color={packaging.awaitingUnits > 0 ? 'amber' : 'green'}
                trend={
                  packaging.configured
                    ? `${packaging.pendingTransfers} تحويل تغليف معلّق`
                    : 'التوجيه غير مكتمل'
                }
                trendUp={packaging.awaitingUnits === 0}
              />
              <KPICard
                label="اعتمادات معلّقة"
                value={String(transfers.pendingTotal)}
                iconType="trend"
                color={transfers.pendingTotal > 0 ? 'amber' : 'green'}
                trend={`إنتاج ${transfers.pendingProductionEntry} · تغليف ${transfers.pendingPackaging}`}
                trendUp={transfers.pendingTotal === 0}
              />
              <KPICard
                label="تغطية تم الصنع"
                value={
                  inventory.finishedDaysOfCover != null
                    ? `${inventory.finishedDaysOfCover}`
                    : '—'
                }
                unit={inventory.finishedDaysOfCover != null ? 'يوم' : undefined}
                iconType="metric"
                color={
                  inventory.negativeCount > 0
                    ? 'red'
                    : inventory.finishedDaysOfCover != null && inventory.finishedDaysOfCover < 3
                      ? 'amber'
                      : 'green'
                }
                trend={`WIP ${formatNumber(inventory.wipQty)} · هالك ${formatNumber(inventory.wasteQty)} · تحت الحد ${inventory.lowStockCount}`}
                trendUp={inventory.negativeCount === 0 && (inventory.finishedDaysOfCover == null || inventory.finishedDaysOfCover >= 3)}
              />
              <KPICard
                label="دقة الجرد"
                value={stockCounts.accuracyPercent != null ? `${stockCounts.accuracyPercent}%` : '—'}
                iconType="trend"
                color={
                  stockCounts.accuracyPercent == null
                    ? 'indigo'
                    : stockCounts.accuracyPercent >= 95
                      ? 'green'
                      : stockCounts.accuracyPercent >= 85
                        ? 'amber'
                        : 'red'
                }
                trend={
                  typeof laborUtilizationPercent === 'number'
                    ? `استغلال عمالة ${laborUtilizationPercent}%${
                        typeof performanceProxyPercent === 'number'
                          ? ` · أداء ${performanceProxyPercent}%`
                          : ''
                      } (ليس OEE)`
                    : materials.assemblableCoveragePercent != null
                      ? `تغطية تجميع ${materials.assemblableCoveragePercent}% · نواقص ${materials.openShortageRows}`
                      : `جاهزية مواد ${materials.readinessPercent}% · نواقص ${materials.openShortageRows}`
                }
                trendUp={
                  stockCounts.accuracyPercent == null
                    ? (materials.assemblableCoveragePercent ?? materials.readinessPercent) >= 90
                    : stockCounts.accuracyPercent >= 90
                }
              />
            </>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              className={`text-right rounded-[var(--border-radius-lg)] border px-3.5 py-3 transition hover:shadow-sm ${toneClass(item.tone)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold opacity-80">{item.label}</p>
                  <p className="text-xl font-black tabular-nums mt-0.5">{loading ? '…' : item.value}</p>
                  <p className="text-[11px] mt-1 opacity-80 leading-snug">{item.detail}</p>
                </div>
                <span className="material-icons-round text-base opacity-60">chevron_left</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {can('productionIssue.request' as any) && (
          <GhostButton onClick={() => navigate('/production/issue-requests')} iconName="fact_check" className="h-8 px-2.5 text-xs">
            طلبات الصرف
          </GhostButton>
        )}
        {(can('reports.packaging.create' as any) || can('reports.view' as any)) && (
          <GhostButton onClick={() => navigate('/production/packaging/control')} iconName="package_2" className="h-8 px-2.5 text-xs">
            تحكم التغليف
          </GhostButton>
        )}
        {can('inventory.view' as any) && (
          <GhostButton onClick={() => navigate('/inventory/dashboard')} iconName="warehouse" className="h-8 px-2.5 text-xs">
            لوحة المخزون
          </GhostButton>
        )}
        {can('inventory.view' as any) && (
          <GhostButton onClick={() => navigate('/inventory/exceptions')} iconName="report_problem" className="h-8 px-2.5 text-xs">
            استثناءات المخزون
          </GhostButton>
        )}
      </div>
    </div>
  );
};
