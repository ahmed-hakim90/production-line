import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { REPAIR_JOB_STATUSES, REPAIR_JOB_STATUS_LABELS, resolveUserRepairBranchIds, type RepairBranch, type RepairJob } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext, resolveRepairTechnicianIds } from '../utils/repairAccessContext';
import { resolveRepairSettings } from '../config/repairSettings';

function RepairKanbanCard({ job, tenantSlug }: { job: RepairJob; tenantSlug?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id || '' });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.55 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="rounded-lg border bg-background p-2 shadow-sm touch-none cursor-grab active:cursor-grabbing"
    >
      <div className="text-xs font-mono text-muted-foreground">#{job.receiptNo}</div>
      <div className="text-sm font-medium leading-snug">{job.customerName}</div>
      <div className="text-xs text-muted-foreground">{job.deviceBrand} {job.deviceModel}</div>
      <Link
        className="text-xs text-primary underline mt-1 inline-block"
        to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        فتح الورشة
      </Link>
    </div>
  );
}

function RepairKanbanColumn({
  statusId,
  label,
  jobs,
  tenantSlug,
}: {
  statusId: string;
  label: string;
  jobs: RepairJob[];
  tenantSlug?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statusId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-w-[220px] max-w-[280px] flex-shrink-0 rounded-xl border bg-muted/25 p-2',
        isOver && 'ring-2 ring-primary/40',
      )}
    >
      <div className="text-sm font-semibold mb-2 px-1 flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        <Badge variant="secondary">{jobs.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[120px]">
        {jobs.map((j) => (
          <RepairKanbanCard key={j.id} job={j} tenantSlug={tenantSlug} />
        ))}
      </div>
    </div>
  );
}

export const RepairJobs: React.FC = () => {
  const { dir } = useAppDirection();
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
  const technicianIds = useMemo(
    () => resolveRepairTechnicianIds(userProfile, currentEmployee?.id),
    [userProfile, currentEmployee?.id],
  );
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedJob, setSelectedJob] = useState<RepairJob | null>(null);
  const userBranchIds = useMemo(() => {
    const base = resolveUserRepairBranchIds(userProfile);
    return Array.from(new Set([...base, ...assignedBranchIds]));
  }, [userProfile, assignedBranchIds]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairJobStatus | 'all'>('all');
  const [boardView, setBoardView] = useState<'kanban' | 'table'>('kanban');
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  useEffect(() => {
    if (can('repair.branches.manage') || !userProfile?.id) {
      setAssignedBranchIds([]);
      return;
    }
    void repairBranchService.list().then((branchRows) => {
      setBranches(branchRows);
      const uid = String(userProfile.id || '').trim();
      const eid = String(currentEmployee?.id || '').trim();
      const ids = branchRows
        .filter((branch) => {
          const t = branch.technicianIds || [];
          return (uid && t.includes(uid)) || (eid && t.includes(eid));
        })
        .map((branch) => branch.id || '')
        .filter(Boolean);
      setAssignedBranchIds(ids);
    });
  }, [can, userProfile?.id, currentEmployee?.id]);

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

  const kanbanGroups = useMemo(() => {
    const g: Record<string, RepairJob[]> = {};
    statusColumns.forEach((s) => {
      g[s.id] = [];
    });
    const fallback = statusColumns[0]?.id || 'received';
    jobs.forEach((job) => {
      const key = statusColumns.some((s) => s.id === job.status) ? job.status : fallback;
      if (!g[key]) g[key] = [];
      g[key].push(job);
    });
    return g;
  }, [jobs, statusColumns]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onKanbanDragEnd = async (e: DragEndEvent) => {
    const jobId = String(e.active.id || '');
    const overId = e.over?.id != null ? String(e.over.id) : '';
    if (!jobId || !overId) return;
    if (!can('repair.jobs.edit')) {
      toast.error('لا تملك صلاحية تعديل حالة الطلب.');
      return;
    }
    const row = jobs.find((j) => j.id === jobId);
    if (!row || row.status === overId) return;
    try {
      await repairJobService.changeStatus({
        jobId,
        status: overId,
        technicianId: userProfile?.id,
        actorUid: userProfile?.id || '',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
      });
      await refetch();
      toast.success('تم تحديث حالة الطلب.');
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحديث الحالة.');
    }
  };
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
  const openJobs = useMemo(
    () => jobs.filter((j) => repairSettings.workflow.openStatusIds.includes(j.status)).length,
    [jobs, repairSettings.workflow.openStatusIds],
  );
  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      if (id) map.set(id, String(branch.name || ''));
    });
    return map;
  }, [branches]);

  return (
    <div className="space-y-4" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">طلبات الصيانة</h1>
              <p className="text-sm text-muted-foreground mt-1">متابعة جميع الطلبات وحالاتها وتفاصيل العملاء.</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="outline" type="button" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                تحديث
              </Button>
              <Button
                variant={boardView === 'kanban' ? 'default' : 'outline'}
                size="sm"
                type="button"
                onClick={() => setBoardView('kanban')}
              >
                لوحة كنبان
              </Button>
              <Button
                variant={boardView === 'table' ? 'default' : 'outline'}
                size="sm"
                type="button"
                onClick={() => setBoardView('table')}
              >
                جدول
              </Button>
              <Link to={withTenantPath(tenantSlug, '/repair/call-center')}>
                <Button variant="outline" size="sm" type="button">
                  مركز الاتصال
                </Button>
              </Link>
              {can('repair.jobs.create') && (
                <Link to={withTenantPath(tenantSlug, '/repair/jobs/new')}>
                  <Button>جهاز جديد</Button>
                </Link>
              )}
            </div>
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
            {((repairSettings.workflow.statuses.map((s) => s.id).length > 0
              ? repairSettings.workflow.statuses.map((s) => s.id)
              : REPAIR_JOB_STATUSES) as RepairJobStatus[]).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {repairSettings.statusMap[status]?.label || REPAIR_JOB_STATUS_LABELS[status] || status}
                <Badge variant="secondary" className="mr-2">{jobsByStatus[status] || 0}</Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {boardView === 'kanban' && (
        <Card>
          <CardHeader>
            <CardTitle>لوحة المتابعة</CardTitle>
            <CardDescription>اسحب البطاقة بين الأعمدة لتغيير الحالة — بسرعة وبشكل بصري.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-4">
            <DndContext sensors={sensors} onDragEnd={(ev) => void onKanbanDragEnd(ev)}>
              <div className="flex gap-3 min-h-[320px] items-start">
                {statusColumns.map((col) => (
                  <RepairKanbanColumn
                    key={col.id}
                    statusId={col.id}
                    label={col.label || REPAIR_JOB_STATUS_LABELS[col.id] || col.id}
                    jobs={kanbanGroups[col.id] || []}
                    tenantSlug={tenantSlug}
                  />
                ))}
              </div>
            </DndContext>
          </CardContent>
        </Card>
      )}

      {boardView === 'table' && (
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
                    <th className="p-2 text-right">ورشة</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td className="p-3" colSpan={5}><span role="status" aria-live="polite">جاري التحميل...</span></td></tr> : visibleJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-t hover:bg-muted/40 cursor-pointer"
                      onClick={() => setSelectedJob(job)}
                    >
                      <td className="p-2">
                        <Link
                          className="text-primary underline"
                          to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {job.receiptNo}
                        </Link>
                      </td>
                      <td className="p-2">{job.customerName} - {job.customerPhone}</td>
                      <td className="p-2">{job.deviceBrand} {job.deviceModel}</td>
                      <td className="p-2"><StatusBadge status={job.status} /></td>
                      <td className="p-2">
                        <Link
                          className="text-primary underline text-xs"
                          to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          فتح
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && visibleJobs.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground" colSpan={5}>
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
      />
    </div>
  );
};

export default RepairJobs;
