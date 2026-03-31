import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { repairBranchService } from '../services/repairBranchService';
import { StatusBadge } from '../components/StatusBadge';
import type { FirestoreUserWithRepair, RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUSES, REPAIR_JOB_STATUS_LABELS, resolveUserRepairBranchIds } from '../types';

export const RepairJobs: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const userBranchIds = useMemo(() => {
    const base = resolveUserRepairBranchIds(userProfile);
    return Array.from(new Set([...base, ...assignedBranchIds]));
  }, [userProfile, assignedBranchIds]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairJobStatus | 'all'>('all');
  useEffect(() => {
    if (can('repair.branches.manage') || !userProfile?.id) {
      setAssignedBranchIds([]);
      return;
    }
    void repairBranchService.list().then((branches) => {
      const ids = branches
        .filter((branch) => (branch.technicianIds || []).includes(userProfile.id || ''))
        .map((branch) => branch.id || '')
        .filter(Boolean);
      setAssignedBranchIds(ids);
    });
  }, [can, userProfile?.id]);

  const { jobs, loading } = useRepairJobs({
    branchId: userBranchIds[0],
    branchIds: userBranchIds,
    canViewAllBranches: can('repair.branches.manage'),
    searchText: search,
  });
  const visibleJobs = useMemo(
    () => (statusFilter === 'all' ? jobs : jobs.filter((job) => job.status === statusFilter)),
    [jobs, statusFilter],
  );
  const jobsByStatus = useMemo(
    () =>
      jobs.reduce<Record<string, number>>((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {}),
    [jobs],
  );
  const openJobs = useMemo(() => jobs.filter((j) => !['delivered', 'unrepairable'].includes(j.status)).length, [jobs]);

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">طلبات الصيانة</h1>
              <p className="text-sm text-muted-foreground mt-1">متابعة جميع الطلبات وحالاتها وتفاصيل العملاء.</p>
            </div>
            {can('repair.jobs.create') && (
              <Link to={withTenantPath(tenantSlug, '/repair/jobs/new')}>
                <Button>جهاز جديد</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">إجمالي الطلبات</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{jobs.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">طلبات مفتوحة</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{openJobs}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">جاهز للتسليم</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{jobsByStatus.ready || 0}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>بحث وفلاتر</CardTitle>
          <CardDescription>فلترة الطلبات حسب الحالة أو البحث بالكود والعميل والجهاز.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث سريع: الاسم، الهاتف، الإيصال، نوع الجهاز..." />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>
              الكل
              <Badge variant="secondary" className="mr-2">{jobs.length}</Badge>
            </Button>
            {REPAIR_JOB_STATUSES.map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {REPAIR_JOB_STATUS_LABELS[status]}
                <Badge variant="secondary" className="mr-2">{jobsByStatus[status] || 0}</Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>قائمة الطلبات</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">الإيصال</th>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الجهاز</th>
                  <th className="p-2 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td className="p-3" colSpan={4}><span role="status" aria-live="polite">جاري التحميل...</span></td></tr> : visibleJobs.map((job) => (
                  <tr key={job.id} className="border-t hover:bg-muted/40">
                    <td className="p-2">
                      <Link className="text-primary underline" to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
                        {job.receiptNo}
                      </Link>
                    </td>
                    <td className="p-2">{job.customerName} - {job.customerPhone}</td>
                    <td className="p-2">{job.deviceBrand} {job.deviceModel}</td>
                    <td className="p-2"><StatusBadge status={job.status} /></td>
                  </tr>
                ))}
                {!loading && visibleJobs.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={4}>
                      لا توجد طلبات مطابقة للفلاتر الحالية.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairJobs;
