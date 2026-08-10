import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { repairBranchService } from '../services/repairBranchService';
import { StatusBadge } from '../components/StatusBadge';
import type { FirestoreUserWithRepair, RepairBranch, RepairJob, RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUSES, REPAIR_JOB_STATUS_LABELS } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairSettings } from '../config/repairSettings';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

const PAGE_SIZE = 20;

function isClosedJobStatus(status: string): boolean {
  return ['delivered', 'unrepairable', 'cancelled'].includes(String(status || ''));
}

function TechnicianJobMobileCard({
  job,
  branchName,
  tenantSlug,
}: {
  job: RepairJob;
  branchName: string;
  tenantSlug?: string;
}) {
  const closed = isClosedJobStatus(String(job.status || ''));
  const device = [job.deviceBrand, job.deviceModel].filter(Boolean).join(' ') || '—';
  const workshopPath = withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`);
  const overdue = job.dueAt && Date.parse(String(job.dueAt)) < Date.now() && !closed;

  return (
    <Link
      to={workshopPath}
      className="block rounded-xl border bg-card p-3 shadow-sm transition-colors active:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-bold text-primary">#{job.receiptNo}</div>
          <div className="mt-1 truncate text-base font-semibold leading-snug">{device}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{branchName || '—'}</div>
        </div>
        <ChevronLeft className="mt-1 h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status} />
        {job.dueAt ? (
          <span className={`text-xs tabular-nums ${overdue ? 'font-semibold text-[rgb(var(--color-danger))]' : 'text-muted-foreground'}`}>
            استحقاق {new Date(job.dueAt).toLocaleDateString('ar-EG')}
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        <span className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-primary/10 px-3 text-sm font-bold text-primary">
          {closed ? 'عرض الطلب' : 'فتح الورشة'}
        </span>
      </div>
    </Link>
  );
}

export const RepairMyJobs: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canView = can('repair.jobs.technician') || can('repair.view');

  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const technicianIds = useRepairTechnicianIds(userProfile, currentEmployee?.id);

  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairJobStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState('');

  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);

  useEffect(() => {
    void repairBranchService.list()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  const { jobs, loading, refetch, isFetching, error } = useRepairJobs({
    technicianOnly: true,
    technicianIds,
    searchText: search,
  });

  useEffect(() => {
    if (!error) {
      setListError('');
      return;
    }
    setListError('تعذر تحميل الطلبات المسندة. أعد المحاولة أو تأكد من ربط الحساب بموظف وإسناد الطلبات إليك.');
  }, [error]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      if (id) map.set(id, String(branch.name || ''));
    });
    return map;
  }, [branches]);

  const visibleJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    const wanted = mapLegacyRepairStatus(statusFilter);
    return jobs.filter((job) => mapLegacyRepairStatus(job.status) === wanted);
  }, [jobs, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = visibleJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="طلباتي" dir={dir}>
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض طلباتك كفني.</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  const statusOptions = (
    repairSettings.workflow.statuses.length > 0
      ? repairSettings.workflow.statuses.map((s) => s.id)
      : REPAIR_JOB_STATUSES
  ) as RepairJobStatus[];

  const emptyMessage = listError
    || (technicianIds.length === 0
      ? 'لا يمكن عرض الطلبات — اربط حسابك بموظف من إدارة المستخدمين.'
      : 'لا توجد طلبات مسندة إليك. من الاستقبال: افتح الطلب واختر الفني ثم احفظ الإسناد (مع ربط الموظف بالحساب).');

  return (
    <RepairOpsPageShell
      eyebrow="طلباتي"
      dir={dir}
      hero={[
        { key: 'total', label: 'مسند إليّ', value: visibleJobs.length },
        { key: 'open', label: 'مفتوح', value: visibleJobs.filter((j) => !isClosedJobStatus(String(j.status || ''))).length },
      ]}
      onRefresh={() => void refetch()}
      refreshing={isFetching}
    >
      <OpsDashPanel title="طلباتي المسندة" accent="repair" bodyClassName="p-0">
          <SmartFilterBar
            pageId="repair-my-jobs"
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="بحث: رقم الإيصال أو نوع الجهاز..."
            quickFilters={[
              {
                key: 'status',
                placeholder: 'كل الحالات',
                options: statusOptions.map((status) => ({
                  value: status,
                  label: repairSettings.statusMap[status]?.label || REPAIR_JOB_STATUS_LABELS[status] || status,
                })),
              },
            ]}
            quickFilterValues={{ status: statusFilter }}
            onQuickFilterChange={(key, value) => {
              if (key === 'status') setStatusFilter(value as RepairJobStatus | 'all');
            }}
          />

          <div className="erp-mobile-card-list space-y-2 p-3 md:hidden">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
                جاري التحميل...
              </p>
            ) : pagedJobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              pagedJobs.map((job) => (
                <TechnicianJobMobileCard
                  key={job.id}
                  job={job}
                  branchName={branchNameById.get(String(job.branchId || '')) || ''}
                  tenantSlug={tenantSlug}
                />
              ))
            )}
          </div>

          <div className="erp-desktop-table hidden overflow-x-auto md:block">
            <table className="table erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-right">الإيصال</th>
                  <th className="erp-th text-right">الفرع</th>
                  <th className="erp-th text-right">الحالة</th>
                  <th className="erp-th text-right">الجهاز</th>
                  <th className="erp-th text-right">الورشة</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                      <span role="status" aria-live="polite">جاري التحميل...</span>
                    </td>
                  </tr>
                ) : pagedJobs.map((job) => (
                  <tr key={job.id} className="border-t hover:bg-muted/40">
                    <td className="p-2 font-mono">{job.receiptNo}</td>
                    <td className="p-2">{branchNameById.get(String(job.branchId || '')) || '—'}</td>
                    <td className="p-2"><StatusBadge status={job.status} /></td>
                    <td className="p-2 text-muted-foreground">
                      {job.deviceBrand} {job.deviceModel}
                    </td>
                    <td className="p-2">
                      <Link
                        className="text-xs text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                      >
                        {isClosedJobStatus(String(job.status || '')) ? 'عرض الطلب' : 'فتح الورشة'}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && visibleJobs.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={visibleJobs.length}
            onPageChange={setPage}
            itemLabel="طلب"
          />
      </OpsDashPanel>

      <div className="md:hidden">
        <Link to={withTenantPath(tenantSlug, '/')}>
          <Button type="button" variant="outline" className="min-h-11 w-full">
            العودة للوحة الفني
          </Button>
        </Link>
      </div>
    </RepairOpsPageShell>
  );
};

export default RepairMyJobs;
