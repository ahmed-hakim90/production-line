import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Headset, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { cn } from '@/lib/utils';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { StatusBadge } from '../components/StatusBadge';
import { RepairJobQuickDrawer } from '../components/RepairJobQuickDrawer';
import type { FirestoreUserWithRepair, RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUSES, REPAIR_JOB_STATUS_LABELS, type RepairBranch, type RepairJob } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveRepairSettings } from '../config/repairSettings';
import { computeRepairJobCost, summarizeRepairJobs } from '../utils/repairBusinessLogic';
import { canManageRepairWorkshopWork } from '../lib/repairJobIntake';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { resolveRepairStatusChip } from '../lib/repairStatusChipStyle';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { isDeliveredStatus, mapLegacyRepairStatus } from '../utils/repairWorkflowNormalize';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { ListViewToggle, useListViewMode } from '@/src/components/erp/ListViewToggle';
import { StatusKanbanBoard } from '@/src/components/erp/StatusKanbanBoard';
import { PageHeader } from '@/components/PageHeader';

type JobsFocusFilter = 'all' | 'open' | 'ready' | 'delivered' | 'overdue' | 'today';

function SummaryMetricChip({
  label,
  value,
  active,
  tone,
  onClick,
  suffix,
}: {
  label: string;
  value: string | number;
  active?: boolean;
  tone: 'neutral' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';
  onClick?: () => void;
  suffix?: string;
}) {
  const toneClass = {
    neutral: 'border-border/80 bg-background text-foreground',
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
    violet: 'border-violet-200 bg-violet-50 text-violet-950',
  }[tone];

  const className = cn(
    'inline-flex min-w-[6.5rem] flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-start transition-colors',
    toneClass,
    active && 'ring-2 ring-offset-1 ring-primary/40 shadow-sm',
    onClick && 'cursor-pointer hover:brightness-[0.98]',
  );

  const body = (
    <>
      <span className="text-[11px] font-medium opacity-80">{label}</span>
      <span className="text-base font-semibold tabular-nums tracking-tight">
        {value}
        {suffix ? <span className="ms-1 text-xs font-medium opacity-70">{suffix}</span> : null}
      </span>
    </>
  );

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-pressed={Boolean(active)}>
      {body}
    </button>
  );
}

function RepairJobKanbanCardBody({
  job,
  tenantSlug,
  showWorkshopLink,
}: {
  job: RepairJob;
  tenantSlug?: string;
  showWorkshopLink: boolean;
}) {
  const cost = computeRepairJobCost(job);
  const overdue = job.dueAt && Date.parse(String(job.dueAt)) < Date.now();
  const detailPath = withTenantPath(tenantSlug, `/repair/jobs/${job.id}`);
  const workshopPath = withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`);

  return (
    <>
      <Link
        to={detailPath}
        className="inline-block font-mono text-xs font-semibold text-primary hover:underline"
        title="فتح تفاصيل الطلب"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        #{job.receiptNo}
      </Link>
      <div className="mt-1.5 truncate text-sm font-medium leading-snug">{job.customerName}</div>
      <div className="line-clamp-2 text-xs text-muted-foreground">
        {[job.deviceBrand, job.deviceModel].filter(Boolean).join(' ') || '—'}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className={overdue ? 'font-semibold text-rose-600' : 'text-muted-foreground'}>
          {job.dueAt ? new Date(job.dueAt).toLocaleDateString('ar-EG') : 'بدون موعد'}
        </span>
        <span className="font-semibold tabular-nums">
          {cost.finalCost.toLocaleString('ar-EG')}
          <span className="ms-0.5 text-[10px] font-medium text-muted-foreground">ج.م</span>
        </span>
      </div>
      <div className="mt-2">
        {showWorkshopLink ? (
          <Link
            className="text-xs font-medium text-primary hover:underline"
            to={workshopPath}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            فتح الورشة
          </Link>
        ) : (
          <Link
            className="text-xs font-medium text-primary hover:underline"
            to={detailPath}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            التفاصيل / إيصال
          </Link>
        )}
      </div>
    </>
  );
}

export const RepairJobs: React.FC = () => {
  const { dir } = useAppDirection();
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [userProfile, userRoleName, systemSettings, userPermissions],
  );
  const technicianIds = useRepairTechnicianIds(userProfile, currentEmployee?.id);
  const canShowWorkshopNav = canManageRepairWorkshopWork({
    canEditJob: can('repair.jobs.edit') || repairCtx.isRepairTechnician,
    isRepairTechnician: repairCtx.isRepairTechnician,
    isAssignedTechnician: repairCtx.isRepairTechnician,
    canManageBranches: can('repair.branches.manage'),
    canViewAllCallCenter: can('repair.callCenter.viewAll'),
    canCreateJobs: can('repair.jobs.create'),
    canEditJobs: can('repair.jobs.edit'),
  });
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedJob, setSelectedJob] = useState<RepairJob | null>(null);
  const userBranchIds = useMemo(
    () =>
      resolveAccessibleRepairBranchIds({
        user: userProfile,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: repairCtx.canViewAllBranches,
      }),
    [userProfile, branches, currentEmployee?.id, repairCtx.canViewAllBranches],
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairJobStatus | 'all'>('all');
  const [focusFilter, setFocusFilter] = useState<JobsFocusFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [boardView, setBoardView] = useListViewMode('repair-jobs', 'kanban');
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  useEffect(() => {
    void repairBranchService.list().then(setBranches);
  }, []);

  const { jobs, loading, refetch, isFetching } = useRepairJobs({
    branchId: userBranchIds[0],
    branchIds: userBranchIds,
    canViewAllBranches: repairCtx.canViewAllBranches,
    technicianOnly: repairCtx.jobsTechnicianOnly,
    technicianIds,
    searchText: search,
  });

  const statusColumns = useMemo(
    () => repairSettings.workflow.statuses.filter((s) => s.isEnabled !== false),
    [repairSettings.workflow.statuses],
  );
  const openStatusIds = repairSettings.workflow.openStatusIds;
  const openStatusSet = useMemo(
    () => new Set(openStatusIds.map((id) => mapLegacyRepairStatus(id))),
    [openStatusIds],
  );

  const visibleJobs = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter((job) => {
      const jobStatus = mapLegacyRepairStatus(job.status);
      if (statusFilter !== 'all' && jobStatus !== mapLegacyRepairStatus(statusFilter)) return false;
      if (branchFilter !== 'all' && String(job.branchId || '') !== branchFilter) return false;
      const created = Date.parse(String(job.createdAt || ''));
      if (Number.isFinite(created) && (created < from || created > to)) return false;

      if (focusFilter === 'open' && !openStatusSet.has(jobStatus)) return false;
      if (focusFilter === 'ready' && jobStatus !== 'ready') return false;
      if (focusFilter === 'delivered' && !isDeliveredStatus(jobStatus)) return false;
      if (focusFilter === 'today' && job.createdAt?.slice(0, 10) !== today) return false;
      if (focusFilter === 'overdue') {
        const isOverdue = Boolean(job.dueAt)
          && Date.parse(String(job.dueAt)) < Date.now()
          && openStatusSet.has(jobStatus);
        if (!isOverdue) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, branchFilter, fromDate, toDate, focusFilter, openStatusSet]);

  const kanbanColumns = useMemo(
    () =>
      statusColumns.map((col) => {
        const chip = resolveRepairStatusChip(col.id, repairSettings.statusMap);
        return {
          id: col.id,
          label: col.label || chip.label || REPAIR_JOB_STATUS_LABELS[col.id] || col.id,
          accentColor: chip.color,
        };
      }),
    [statusColumns, repairSettings.statusMap],
  );

  const kanbanItems = useMemo(
    () =>
      visibleJobs
        .filter((job) => Boolean(job.id))
        .map((job) => ({ ...job, id: String(job.id), status: mapLegacyRepairStatus(job.status) })),
    [visibleJobs],
  );

  const onKanbanMove = async (jobId: string, overId: string) => {
    if (!canShowWorkshopNav) {
      toast.error('تغيير الحالة يتم من صفحة الورشة فقط.');
      return;
    }
    if (!can('repair.jobs.edit')) {
      toast.error('لا تملك صلاحية تعديل حالة الطلب.');
      return;
    }
    const row = jobs.find((j) => j.id === jobId);
    if (!row || mapLegacyRepairStatus(row.status) === mapLegacyRepairStatus(overId)) return;
    try {
      await repairJobService.changeStatus({
        jobId,
        status: overId,
        technicianId: userProfile?.id,
        actorUid: userProfile?.id || '',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
      });
      toast.success('تم تحديث حالة الطلب.');
      void refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحديث الحالة.');
      void refetch();
    }
  };

  const summary = useMemo(
    () => summarizeRepairJobs(visibleJobs, openStatusIds),
    [visibleJobs, openStatusIds],
  );
  /** Totals for chips use unfiltered-by-focus list so counts stay stable while focusing. */
  const summaryAll = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    const scoped = jobs.filter((job) => {
      if (
        statusFilter !== 'all'
        && mapLegacyRepairStatus(job.status) !== mapLegacyRepairStatus(statusFilter)
      ) return false;
      if (branchFilter !== 'all' && String(job.branchId || '') !== branchFilter) return false;
      const created = Date.parse(String(job.createdAt || ''));
      if (Number.isFinite(created) && (created < from || created > to)) return false;
      return true;
    });
    return summarizeRepairJobs(scoped, openStatusIds);
  }, [jobs, statusFilter, branchFilter, fromDate, toDate, openStatusIds]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      if (id) map.set(id, String(branch.name || ''));
    });
    return map;
  }, [branches]);

  const applyFocus = (next: JobsFocusFilter) => {
    setFocusFilter((prev) => (prev === next ? 'all' : next));
    if (next === 'ready') setStatusFilter('all');
    if (next === 'delivered') setStatusFilter('all');
  };

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="طلبات الصيانة"
        subtitle={canShowWorkshopNav
          ? 'تشغيل الورشة، متابعة الحالات، ومراجعة التكلفة من شاشة واحدة.'
          : 'متابعة الطلبات والاستلام والتواصل مع العميل. شغل الورشة يظهر للفني/الإدارة.'}
        icon="fact_check"
        primaryAction={can('repair.jobs.create') ? {
          label: 'جهاز جديد',
          icon: 'add',
          onClick: () => navigate(withTenantPath(tenantSlug, '/repair/jobs/new')),
        } : undefined}
        actions={(
            <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" type="button" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5 ms-1', isFetching && 'animate-spin')} />
              تحديث
            </Button>
            <ListViewToggle value={boardView} onChange={setBoardView} />
            <Link to={withTenantPath(tenantSlug, '/repair/call-center')}>
              <Button variant="outline" size="sm" type="button">
                <Headset className="h-3.5 w-3.5 ms-1" />
                مركز الاتصال
              </Button>
            </Link>
          </div>
        )}
      />

      {!canShowWorkshopNav ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          وضع الاستقبال: يمكنك متابعة الطلبات وطباعة الإيصال ومراسلة العميل. شغل الورشة (تشخيص/قطع/تكلفة) يظهر لحسابات الفني أو الإدارة.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
        <SummaryMetricChip
          label="إجمالي"
          value={summaryAll.total}
          tone="neutral"
          active={focusFilter === 'all'}
          onClick={() => setFocusFilter('all')}
        />
        <SummaryMetricChip
          label="مفتوح"
          value={summaryAll.open}
          tone="sky"
          active={focusFilter === 'open'}
          onClick={() => applyFocus('open')}
        />
        <SummaryMetricChip
          label="جاهز"
          value={summaryAll.ready}
          tone="emerald"
          active={focusFilter === 'ready'}
          onClick={() => applyFocus('ready')}
        />
        <SummaryMetricChip
          label="تم التسليم"
          value={summaryAll.delivered}
          tone="violet"
          active={focusFilter === 'delivered'}
          onClick={() => applyFocus('delivered')}
        />
        <SummaryMetricChip
          label="متأخر"
          value={summaryAll.overdue}
          tone={summaryAll.overdue > 0 ? 'rose' : 'neutral'}
          active={focusFilter === 'overdue'}
          onClick={() => applyFocus('overdue')}
        />
        <SummaryMetricChip
          label="اليوم"
          value={summaryAll.createdToday}
          tone="amber"
          active={focusFilter === 'today'}
          onClick={() => applyFocus('today')}
        />
        <SummaryMetricChip
          label="قيمة ظاهرة"
          value={summary.revenue.toLocaleString('ar-EG')}
          suffix="ج.م"
          tone="neutral"
        />
      </div>

      <Card className="mb-0 border-0 rounded-none">
        <CardContent className="p-0">
          <SmartFilterBar
            pageId="repair-jobs"
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="بحث: الاسم، الهاتف، الإيصال، نوع الجهاز..."
            quickFilters={[
              {
                key: 'branch',
                placeholder: 'كل الفروع',
                options: branches.map((branch) => ({ value: String(branch.id), label: branch.name || '' })),
              },
              {
                key: 'status',
                placeholder: 'كل الحالات',
                options: ((repairSettings.workflow.statuses.map((s) => s.id).length > 0
                  ? repairSettings.workflow.statuses.map((s) => s.id)
                  : REPAIR_JOB_STATUSES) as RepairJobStatus[]).map((status) => ({
                  value: status,
                  label: repairSettings.statusMap[status]?.label || REPAIR_JOB_STATUS_LABELS[status] || status,
                })),
              },
            ]}
            quickFilterValues={{ branch: branchFilter, status: statusFilter }}
            onQuickFilterChange={(key, value) => {
              if (key === 'branch') setBranchFilter(value);
              if (key === 'status') {
                setStatusFilter(value as RepairJobStatus | 'all');
                setFocusFilter('all');
              }
            }}
            advancedFilters={[
              { key: 'fromDate', label: 'من تاريخ', placeholder: 'من', type: 'date', options: [] },
              { key: 'toDate', label: 'إلى تاريخ', placeholder: 'إلى', type: 'date', options: [] },
            ]}
            advancedFilterValues={{ fromDate, toDate }}
            onAdvancedFilterChange={(key, value) => {
              if (key === 'fromDate') setFromDate(value);
              if (key === 'toDate') setToDate(value);
            }}
            className="mb-0 border-0 rounded-none"
          />
        </CardContent>
      </Card>

      {boardView === 'kanban' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>لوحة المتابعة</CardTitle>
            <CardDescription>
              اضغط رقم الإيصال لفتح الطلب. اسحب البطاقة بين الأعمدة لتغيير الحالة
              {canShowWorkshopNav ? '' : ' (للفني/الإدارة فقط)'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-4">
            <StatusKanbanBoard
              columns={kanbanColumns}
              items={kanbanItems}
              resolveColumnId={(job) => {
                const canonical = mapLegacyRepairStatus(job.status);
                const match = statusColumns.find((col) => mapLegacyRepairStatus(col.id) === canonical);
                return match?.id || statusColumns[0]?.id || 'received';
              }}
              loading={loading}
              draggable={canShowWorkshopNav && can('repair.jobs.edit')}
              onMove={onKanbanMove}
              emptyColumnLabel="لا طلبات"
              renderCard={(job) => (
                <RepairJobKanbanCardBody
                  job={job}
                  tenantSlug={tenantSlug}
                  showWorkshopLink={canShowWorkshopNav}
                />
              )}
            />
          </CardContent>
        </Card>
      )}

      {boardView === 'table' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>قائمة الطلبات</CardTitle>
            <CardDescription>اضغط رقم الإيصال لفتح تفاصيل الطلب.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2.5 text-right font-medium">الإيصال</th>
                    <th className="p-2.5 text-right font-medium">العميل</th>
                    <th className="p-2.5 text-right font-medium">الجهاز</th>
                    <th className="p-2.5 text-right font-medium">الفرع</th>
                    <th className="p-2.5 text-right font-medium">الحالة</th>
                    <th className="p-2.5 text-right font-medium">التكلفة</th>
                    <th className="p-2.5 text-right font-medium">الاستحقاق</th>
                    <th className="p-2.5 text-right font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="p-3" colSpan={8}>
                        <span role="status" aria-live="polite">جاري التحميل...</span>
                      </td>
                    </tr>
                  ) : visibleJobs.map((job) => {
                    const cost = computeRepairJobCost(job);
                    const overdue = job.dueAt
                      && Date.parse(String(job.dueAt)) < Date.now()
                      && openStatusSet.has(mapLegacyRepairStatus(job.status));
                    return (
                      <tr
                        key={job.id}
                        className="border-t hover:bg-muted/40 cursor-pointer"
                        onClick={() => setSelectedJob(job)}
                      >
                        <td className="p-2.5">
                          <Link
                            className="font-mono text-sm font-semibold text-primary hover:underline"
                            to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{job.receiptNo}
                          </Link>
                        </td>
                        <td className="p-2.5">
                          <div className="font-medium">{job.customerName}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">{job.customerPhone}</div>
                        </td>
                        <td className="p-2.5">{job.deviceBrand} {job.deviceModel}</td>
                        <td className="p-2.5">{branchNameById.get(String(job.branchId || '')) || '—'}</td>
                        <td className="p-2.5"><StatusBadge status={job.status} /></td>
                        <td className="p-2.5 font-semibold tabular-nums">
                          {cost.finalCost.toLocaleString('ar-EG')}
                          <span className="ms-1 text-xs font-medium text-muted-foreground">ج.م</span>
                        </td>
                        <td className={cn('p-2.5', overdue && 'font-semibold text-rose-600')}>
                          {job.dueAt ? new Date(job.dueAt).toLocaleDateString('ar-EG') : '—'}
                        </td>
                        <td className="p-2.5">
                          {canShowWorkshopNav ? (
                            <Link
                              className="text-xs font-medium text-primary hover:underline"
                              to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              الورشة
                            </Link>
                          ) : (
                            <Link
                              className="text-xs font-medium text-primary hover:underline"
                              to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              إيصال
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && visibleJobs.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground" colSpan={8}>
                        لا توجد طلبات مطابقة للفلاتر الحالية.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <RepairJobQuickDrawer
        open={Boolean(selectedJob)}
        onOpenChange={(next) => { if (!next) setSelectedJob(null); }}
        job={selectedJob}
        tenantSlug={tenantSlug}
        branchName={selectedJob ? branchNameById.get(String(selectedJob.branchId || '').trim()) : undefined}
        showWorkshopLink={canShowWorkshopNav}
      />
    </div>
  );
};

export default RepairJobs;
