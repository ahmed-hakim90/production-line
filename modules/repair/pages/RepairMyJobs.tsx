import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { repairBranchService } from '../services/repairBranchService';
import { StatusBadge } from '../components/StatusBadge';
import type { FirestoreUserWithRepair, RepairBranch, RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUSES, REPAIR_JOB_STATUS_LABELS } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairSettings } from '../config/repairSettings';

const PAGE_SIZE = 20;

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
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = visibleJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض طلباتك كفني.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusOptions = (
    repairSettings.workflow.statuses.length > 0
      ? repairSettings.workflow.statuses.map((s) => s.id)
      : REPAIR_JOB_STATUSES
  ) as RepairJobStatus[];

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="طلباتي (فني)"
        subtitle="الطلبات المسندة إليك فقط — متابعة سريعة للحالة والورشة"
        primaryAction={{
          label: 'تحديث',
          icon: 'refresh',
          onClick: () => void refetch(),
          disabled: isFetching,
        }}
      />

      <Card>
        <CardContent className="p-0">
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

          <div className="overflow-x-auto">
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
                        className="text-primary underline text-xs"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                      >
                        فتح الورشة
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && visibleJobs.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                      {listError
                        || (technicianIds.length === 0
                          ? 'لا يمكن عرض الطلبات — اربط حسابك بموظف من إدارة المستخدمين.'
                          : 'لا توجد طلبات مسندة إليك. من الاستقبال: افتح الطلب واختر الفني ثم احفظ الإسناد (مع ربط الموظف بالحساب).')}
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
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairMyJobs;
