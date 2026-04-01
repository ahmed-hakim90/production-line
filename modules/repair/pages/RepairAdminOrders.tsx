import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const isOpenJob = (job: RepairJob) => !['delivered', 'unrepairable'].includes(String(job.status || ''));
const canDeleteRepairJob = (job: RepairJob) => {
  const normalizedStatus = String(job.status || '').trim().toLowerCase();
  return normalizedStatus !== 'delivered' && !Boolean(job.isClosed);
};

export const RepairAdminOrders: React.FC = () => {
  const { dir } = useAppDirection();
  const user = useAppStore((s) => s.userProfile);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [search, setSearch] = useState('');
  const [technicianNameById, setTechnicianNameById] = useState<Map<string, string>>(new Map());
  const [selectedJob, setSelectedJob] = useState<RepairJob | null>(null);
  const [jobToDelete, setJobToDelete] = useState<RepairJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsub = repairJobService.subscribeAll(setJobs);
    void repairBranchService.list().then(setBranches).catch(() => setBranches([]));

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
  }, []);

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
    () => rows.filter((job) => isOpenJob(job) && getWorkDaysElapsed(job.createdAt) > OVERDUE_DAYS).length,
    [rows],
  );

  return (
    <div className="space-y-4" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold">عرض طلبات الصيانة - الإدارة</h1>
          <p className="text-sm text-muted-foreground mt-1">متابعة الطلبات بالتفاصيل التشغيلية، والفني المسند، وحالة التسليم.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">طلبات متأخرة (+{OVERDUE_DAYS} أيام)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-rose-600">{CURRENCY_FMT.format(overdueCount)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">بانتظار التسليم</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-600">{CURRENCY_FMT.format(pendingDeliveryCount)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">جاري التسليم</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-indigo-600">{CURRENCY_FMT.format(inDeliveryCount)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>فلترة سريعة</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث: رقم الطلب، العميل، الهاتف، الجهاز، الفني"
          />
        </CardContent>
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
                  const overdue = isOpenJob(job) && elapsed > OVERDUE_DAYS;
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
