import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
import type { RepairBranch, RepairJob } from '../types';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { StatusBadge } from '../components/StatusBadge';
import { employeeService } from '../../hr/employeeService';
import { userService } from '../../../services/userService';
import { RepairJobQuickDrawer } from '../components/RepairJobQuickDrawer';
import { toast } from '../../../components/Toast';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { useAppStore } from '../../../store/useAppStore';
import type { FirestoreUserWithRepair } from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveUserRepairBranchIds } from '../types';
import { resolveRepairSettings } from '../config/repairSettings';
import { isOpenRepairJob } from '../lib/repairAdminDashboardMetrics';
import { PageHeader } from '@/components/PageHeader';
import { withTenantPath } from '@/lib/tenantPaths';
import { Link, useParams } from 'react-router-dom';

const OVERDUE_DAYS = 7;
const CURRENCY_FMT = new Intl.NumberFormat('ar-EG');

const getJobValue = (job: RepairJob): number =>
  Number(job.finalCostOverride ?? job.finalCost ?? job.estimatedCost ?? job.serviceOnlyCost ?? 0);

const getWorkDaysElapsed = (createdAt?: string): number => {
  const createdMs = Date.parse(String(createdAt || ''));
  if (!Number.isFinite(createdMs)) return 0;
  const diffMs = Date.now() - createdMs;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

const isOpenJob = (job: RepairJob, openStatuses: string[]) => isOpenRepairJob(job, openStatuses);
const canDeleteRepairJob = (job: RepairJob) => {
  const normalizedStatus = String(job.status || '').trim().toLowerCase();
  return normalizedStatus !== 'delivered' && !Boolean(job.isClosed);
};

export const RepairAdminOrders: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [search, setSearch] = useState('');
  const [technicianNameById, setTechnicianNameById] = useState<Map<string, string>>(new Map());
  const [selectedJob, setSelectedJob] = useState<RepairJob | null>(null);
  const [jobToDelete, setJobToDelete] = useState<RepairJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void repairBranchService.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  const allowedBranchIds = useMemo(() => {
    if (repairCtx.adminSeesAllBranches) {
      return branches.map((b) => String(b.id || '')).filter(Boolean);
    }
    const base = resolveUserRepairBranchIds(user);
    const set = new Set(base);
    const employeeId = String(currentEmployee?.id || '').trim();
    const userId = String(user?.id || '').trim();
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      if (!id) return;
      if (employeeId && String(branch.managerEmployeeId || '').trim() === employeeId) set.add(id);
      const techs = (branch.technicianIds || []).map((x) => String(x || '').trim());
      if ((userId && techs.includes(userId)) || (employeeId && techs.includes(employeeId))) set.add(id);
    });
    return Array.from(set);
  }, [branches, repairCtx.adminSeesAllBranches, user, currentEmployee?.id]);

  useEffect(() => {
    let unsub: () => void = () => {};
    if (repairCtx.adminSeesAllBranches) {
      unsub = repairJobService.subscribeAll(setJobs);
    } else if (allowedBranchIds.length > 1) {
      unsub = repairJobService.subscribeByBranches(allowedBranchIds, setJobs);
    } else {
      unsub = repairJobService.subscribeByBranch(allowedBranchIds[0] || '', setJobs);
    }

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

    return () => unsub();
  }, [repairCtx.adminSeesAllBranches, JSON.stringify(allowedBranchIds)]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      if (id) map.set(id, String(branch.name || ''));
    });
    return map;
  }, [branches]);

  const rows = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    return jobs.filter((job) => {
      if (!query) return true;
      const haystack = [
        job.receiptNo,
        job.customerName,
        job.customerPhone,
        job.deviceBrand,
        job.deviceModel,
        technicianNameById.get(String(job.technicianId || '').trim()) || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [jobs, search, technicianNameById]);

  const pendingDeliveryCount = useMemo(() => rows.filter((job) => job.status === 'ready').length, [rows]);
  const inDeliveryCount = pendingDeliveryCount;
  const overdueCount = useMemo(
    () => rows.filter((job) => isOpenJob(job, repairSettings.workflow.openStatusIds) && getWorkDaysElapsed(job.createdAt) > OVERDUE_DAYS).length,
    [rows, repairSettings.workflow.openStatusIds],
  );

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="عرض طلبات الصيانة - الإدارة"
        subtitle="متابعة الطلبات بالتفاصيل التشغيلية، والفني المسند، وحالة التسليم."
        icon="fact_check"
        backAction={{ to: withTenantPath(tenantSlug, '/repair') }}
        actions={(
          <Link to={withTenantPath(tenantSlug, '/repair')}>
            <Button variant="outline" size="sm">لوحة الصيانة</Button>
          </Link>
        )}
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="px-3 py-1.5 text-sm">
          متأخر (+{OVERDUE_DAYS} أيام): <span className="font-bold text-rose-600 ms-1">{CURRENCY_FMT.format(overdueCount)}</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm">
          بانتظار التسليم: <span className="font-bold text-amber-600 ms-1">{CURRENCY_FMT.format(pendingDeliveryCount)}</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm">
          جاري التسليم: <span className="font-bold text-indigo-600 ms-1">{CURRENCY_FMT.format(inDeliveryCount)}</span>
        </Badge>
      </div>

      <Card>
        <SmartFilterBar
      pageId="repair-admin-orders"
          searchPlaceholder="بحث: رقم الطلب، العميل، الهاتف، الجهاز، الفني"
          searchValue={search}
          onSearchChange={setSearch}
          className="mb-0 border-0 rounded-none"
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>جدول طلبات الصيانة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">رقم الطلب</th>
                  <th className="p-2 text-right">اسم العميل</th>
                  <th className="p-2 text-right">الهاتف</th>
                  <th className="p-2 text-right">الفرع</th>
                  <th className="p-2 text-right">القيمة</th>
                  <th className="p-2 text-right">أيام العمل</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">الجهاز</th>
                  <th className="p-2 text-right">قطعة الغيار المطلوبة</th>
                  <th className="p-2 text-right">الفني المسند</th>
                  <th className="p-2 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => {
                  const technicianId = String(job.technicianId || '').trim();
                  const technicianName = technicianNameById.get(technicianId) || (technicianId ? `ID: ${technicianId}` : 'غير مسند');
                  const partsText = Array.isArray(job.partsUsed) && job.partsUsed.length > 0
                    ? job.partsUsed.map((part) => `${part.partName} x${part.quantity}`).join(' | ')
                    : '—';
                  const elapsed = getWorkDaysElapsed(job.createdAt);
                  const overdue = isOpenJob(job, repairSettings.workflow.openStatusIds) && elapsed > OVERDUE_DAYS;
                  const canDelete = canDeleteRepairJob(job);

                  return (
                    <tr
                      key={job.id}
                      className="border-t hover:bg-muted/40 cursor-pointer"
                      onClick={() => setSelectedJob(job)}
                    >
                      <td className="p-2 font-medium">{job.receiptNo}</td>
                      <td className="p-2">{job.customerName || '—'}</td>
                      <td className="p-2">{job.customerPhone || '—'}</td>
                      <td className="p-2">{branchNameById.get(String(job.branchId || '').trim()) || '—'}</td>
                      <td className="p-2">{CURRENCY_FMT.format(getJobValue(job))}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span>{elapsed}</span>
                          {overdue && <Badge variant="destructive">متأخر</Badge>}
                        </div>
                      </td>
                      <td className="p-2"><StatusBadge status={job.status} /></td>
                      <td className="p-2">{`${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim() || '—'}</td>
                      <td className="p-2">{partsText}</td>
                      <td className="p-2">{technicianName}</td>
                      <td className="p-2">
                        {canDelete ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setJobToDelete(job);
                            }}
                          >
                            حذف
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">غير متاح</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={11}>
                      لا توجد طلبات مطابقة للفلاتر الحالية.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <RepairJobQuickDrawer
        open={Boolean(selectedJob)}
        onOpenChange={(next) => { if (!next) setSelectedJob(null); }}
        job={selectedJob}
        branchName={selectedJob ? branchNameById.get(String(selectedJob.branchId || '').trim()) : undefined}
        technicianName={selectedJob ? technicianNameById.get(String(selectedJob.technicianId || '').trim()) : undefined}
        showWorkshopLink
      />
      <Dialog open={Boolean(jobToDelete)} onOpenChange={(next) => { if (!next) setJobToDelete(null); }}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>تأكيد حذف طلب الصيانة</DialogTitle>
            <DialogDescription>
              سيتم حذف الطلب نهائيًا. رقم الطلب: <span className="font-semibold">{jobToDelete?.receiptNo || '—'}</span>
              {' '}— العميل: <span className="font-semibold">{jobToDelete?.customerName || '—'}</span>
              <br />
              سيتم أيضًا: عكس الخزينة، عكس صرف المخزون، وإلغاء الفاتورة المرتبطة إن وُجدت.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobToDelete(null)} disabled={deleting}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={deleting || !jobToDelete?.id}
              onClick={async () => {
                if (!jobToDelete?.id) return;
                try {
                  setDeleting(true);
                  await repairJobService.removeWithRollback(jobToDelete.id, {
                    deletedBy: String(user?.id || ''),
                    deletedByName: String(user?.displayName || user?.email || 'system'),
                    cancelReason: 'حذف من شاشة طلبات الإدارة',
                  });
                  toast.success('تم حذف الطلب وعكس القيود المرتبطة بنجاح.');
                  setJobToDelete(null);
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر حذف طلب الصيانة مع عكس القيود.');
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairAdminOrders;
