import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { cn } from '@/lib/utils';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { employeeService } from '../../hr/employeeService';
import { userService } from '../../../services/userService';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { StatusBadge } from '../components/StatusBadge';
import { RepairJobQuickDrawer } from '../components/RepairJobQuickDrawer';
import type { FirestoreUserWithRepair, RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUSES, REPAIR_JOB_STATUS_LABELS, type RepairBranch, type RepairJob } from '../types';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
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
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';

type JobsFocusFilter = 'all' | 'open' | 'ready' | 'delivered' | 'overdue' | 'today';

function RepairJobKanbanCardBody({
  job,
  tenantSlug,
  showWorkshopLink,
  technicianName,
}: {
  job: RepairJob;
  tenantSlug?: string;
  showWorkshopLink: boolean;
  technicianName?: string;
}) {
  const cost = computeRepairJobCost(job);
  const overdue = job.dueAt && Date.parse(String(job.dueAt)) < Date.now();
  const detailPath = withTenantPath(tenantSlug, `/repair/jobs/${job.id}`);
  const workshopPath = withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`);
  const techLabel = technicianName
    || (job.technicianId ? `فني (${String(job.technicianId).slice(0, 8)}…)` : 'غير مسند');

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
      <div className="mt-1 truncate text-[11px] text-muted-foreground" title={techLabel}>
        الفني: {techLabel}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className={overdue ? 'font-semibold text-[rgb(var(--color-danger))]' : 'text-muted-foreground'}>
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
  const [technicianNameById, setTechnicianNameById] = useState<Map<string, string>>(new Map());
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
  const [searchParams] = useSearchParams();
  const focusFromQuery = String(searchParams.get('focus') || '').trim();
  const initialFocus: JobsFocusFilter =
    focusFromQuery === 'open'
    || focusFromQuery === 'ready'
    || focusFromQuery === 'delivered'
    || focusFromQuery === 'overdue'
    || focusFromQuery === 'today'
      ? focusFromQuery
      : 'all';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairJobStatus | 'all'>('all');
  const [focusFilter, setFocusFilter] = useState<JobsFocusFilter>(initialFocus);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [boardView, setBoardView] = useListViewMode('repair-jobs', 'kanban');
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  useEffect(() => {
    void repairBranchService.list().then(setBranches);
  }, []);
  useEffect(() => {
    void Promise.allSettled([employeeService.getAll(), userService.getAll()]).then((results) => {
      const employees = results[0].status === 'fulfilled' ? results[0].value : [];
      const users = results[1].status === 'fulfilled' ? results[1].value : [];
      const map = new Map<string, string>();

      const usersById = new Map<string, FirestoreUser>();
      users.forEach((user) => {
        const id = String(user.id || '').trim();
        if (id) usersById.set(id, user);
      });

      employees.forEach((employee: FirestoreEmployee) => {
        const employeeId = String(employee.id || '').trim();
        const userId = String(employee.userId || '').trim();
        const user = userId ? usersById.get(userId) : undefined;
        const name = String(employee.name || user?.displayName || user?.email || '').trim();
        if (employeeId && name) map.set(employeeId, name);
        if (userId && name && !map.has(userId)) map.set(userId, name);
      });

      users.forEach((user) => {
        const id = String(user.id || '').trim();
        const name = String(user.displayName || user.email || '').trim();
        if (id && name && !map.has(id)) map.set(id, name);
      });

      setTechnicianNameById(map);
    });
  }, []);
  useEffect(() => {
    if (
      focusFromQuery === 'open'
      || focusFromQuery === 'ready'
      || focusFromQuery === 'delivered'
      || focusFromQuery === 'overdue'
      || focusFromQuery === 'today'
    ) {
      setFocusFilter(focusFromQuery);
    }
  }, [focusFromQuery]);

  const resolveTechnicianName = (technicianId?: string | null) => {
    const id = String(technicianId || '').trim();
    if (!id) return '';
    return technicianNameById.get(id) || '';
  };

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

  const focusHero = [
    { key: 'all', label: 'إجمالي', value: summaryAll.total, onClick: () => setFocusFilter('all'), active: focusFilter === 'all' },
    { key: 'open', label: 'مفتوح', value: summaryAll.open, onClick: () => applyFocus('open'), active: focusFilter === 'open', toneClassName: 'ops-dash-kpi-card--tone-sky' },
    { key: 'ready', label: 'جاهز', value: summaryAll.ready, onClick: () => applyFocus('ready'), active: focusFilter === 'ready', toneClassName: 'ops-dash-kpi-card--tone-emerald' },
    { key: 'delivered', label: 'تم التسليم', value: summaryAll.delivered, onClick: () => applyFocus('delivered'), active: focusFilter === 'delivered' },
    { key: 'overdue', label: 'متأخر', value: summaryAll.overdue, onClick: () => applyFocus('overdue'), active: focusFilter === 'overdue', toneClassName: summaryAll.overdue > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined },
    { key: 'today', label: 'اليوم', value: summaryAll.createdToday, onClick: () => applyFocus('today'), active: focusFilter === 'today' },
    { key: 'revenue', label: 'قيمة ظاهرة', value: summary.revenue.toLocaleString('ar-EG'), meta: 'ج.م' },
  ];

  return (
    <RepairOpsPageShell
      eyebrow="طلبات الصيانة"
      dir={dir}
      hero={focusHero}
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <ListViewToggle value={boardView} onChange={setBoardView} />
          <Link to={withTenantPath(tenantSlug, '/repair/call-center')}>
            <Button variant="outline" size="sm" type="button">
              <Headset className="h-3.5 w-3.5 ms-1" />
              مركز الاتصال
            </Button>
          </Link>
          {can('repair.jobs.create') ? (
            <Button type="button" size="sm" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs/new'))}>
              جهاز جديد
            </Button>
          ) : null}
        </div>
      )}
    >
      {!canShowWorkshopNav ? (
        <div className="rounded-md border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)] px-3 py-2 text-sm text-[rgb(var(--color-primary))]">
          وضع الاستقبال: يمكنك متابعة الطلبات وطباعة الإيصال ومراسلة العميل. شغل الورشة (تشخيص/قطع/تكلفة) يظهر لحسابات الفني أو الإدارة.
        </div>
      ) : null}

      <OpsDashPanel
        title={boardView === 'kanban' ? 'لوحة المتابعة' : 'قائمة الطلبات'}
        accent="repair"
        bodyClassName="p-0"
      >
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

      {boardView === 'kanban' && (
          <div className="overflow-x-auto p-3 pb-4 md:p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              اضغط رقم الإيصال لفتح الطلب. اسحب البطاقة بين الأعمدة لتغيير الحالة
              {canShowWorkshopNav ? '' : ' (للفني/الإدارة فقط)'}.
            </p>
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
                  technicianName={resolveTechnicianName(job.technicianId)}
                />
              )}
            />
          </div>
      )}

      {boardView === 'table' && (
          <>
            <div className="erp-mobile-card-list p-2 md:hidden">
              {loading ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm text-muted-foreground">
                  <span role="status" aria-live="polite">جاري التحميل...</span>
                </div>
              ) : visibleJobs.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  لا توجد طلبات مطابقة للفلاتر الحالية.
                </p>
              ) : (
                visibleJobs.map((job) => {
                  const cost = computeRepairJobCost(job);
                  const overdue = job.dueAt
                    && Date.parse(String(job.dueAt)) < Date.now()
                    && openStatusSet.has(mapLegacyRepairStatus(job.status));
                  return (
                    <div
                      key={`m-${job.id}`}
                      className="cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                      onClick={() => setSelectedJob(job)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedJob(job);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            className="font-mono text-sm font-semibold text-primary hover:underline"
                            to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{job.receiptNo}
                          </Link>
                          <p className="mt-1 truncate text-sm font-medium">{job.customerName}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr">{job.customerPhone}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {job.deviceBrand} {job.deviceModel}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            الفني:{' '}
                            {resolveTechnicianName(job.technicianId)
                              || (job.technicianId ? `فني (${String(job.technicianId).slice(0, 8)}…)` : 'غير مسند')}
                          </p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <dt className="text-[10px] text-[var(--color-text-muted)]">التكلفة</dt>
                          <dd className="font-semibold tabular-nums">
                            {cost.finalCost.toLocaleString('ar-EG')}
                            <span className="ms-1 text-xs font-medium text-muted-foreground">ج.م</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-[var(--color-text-muted)]">الاستحقاق</dt>
                          <dd className={cn('tabular-nums', overdue && 'font-semibold text-[rgb(var(--color-danger))]')}>
                            {job.dueAt ? new Date(job.dueAt).toLocaleDateString('ar-EG') : '—'}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-2">
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
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="erp-desktop-table hidden overflow-x-auto md:block">
              <table className="table erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th text-right">الإيصال</th>
                    <th className="erp-th text-right">العميل</th>
                    <th className="erp-th text-right">الجهاز</th>
                    <th className="erp-th text-right">الفني</th>
                    <th className="erp-th text-right">الفرع</th>
                    <th className="erp-th text-right">الحالة</th>
                    <th className="erp-th text-right">التكلفة</th>
                    <th className="erp-th text-right">الاستحقاق</th>
                    <th className="erp-th text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="p-3" colSpan={9}>
                        <span role="status" aria-live="polite">جاري التحميل...</span>
                      </td>
                    </tr>
                  ) : visibleJobs.map((job) => {
                    const cost = computeRepairJobCost(job);
                    const overdue = job.dueAt
                      && Date.parse(String(job.dueAt)) < Date.now()
                      && openStatusSet.has(mapLegacyRepairStatus(job.status));
                    const techName = resolveTechnicianName(job.technicianId)
                      || (job.technicianId ? `فني (${String(job.technicianId).slice(0, 8)}…)` : 'غير مسند');
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
                        <td className="p-2.5">{techName}</td>
                        <td className="p-2.5">{branchNameById.get(String(job.branchId || '')) || '—'}</td>
                        <td className="p-2.5"><StatusBadge status={job.status} /></td>
                        <td className="p-2.5 font-semibold tabular-nums">
                          {cost.finalCost.toLocaleString('ar-EG')}
                          <span className="ms-1 text-xs font-medium text-muted-foreground">ج.م</span>
                        </td>
                        <td className={cn('p-2.5', overdue && 'font-semibold text-[rgb(var(--color-danger))]')}>
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
                      <td className="p-4 text-center text-muted-foreground" colSpan={9}>
                        لا توجد طلبات مطابقة للفلاتر الحالية.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
      )}
      </OpsDashPanel>
      <RepairJobQuickDrawer
        open={Boolean(selectedJob)}
        onOpenChange={(next) => { if (!next) setSelectedJob(null); }}
        job={selectedJob}
        tenantSlug={tenantSlug}
        branchName={selectedJob ? branchNameById.get(String(selectedJob.branchId || '').trim()) : undefined}
        technicianName={selectedJob ? resolveTechnicianName(selectedJob.technicianId) : undefined}
        showWorkshopLink={canShowWorkshopNav}
      />
    </RepairOpsPageShell>
  );
};

export default RepairJobs;
