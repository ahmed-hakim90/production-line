import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { appendRepairServiceEvent, repairServiceEventService } from '../services/repairServiceEventService';
import { REPAIR_DOMAIN_EVENT_VERSION } from '../utils/repairDomainEvents';
import { StatusBadge } from '../components/StatusBadge';
import { WhatsAppShare } from '../components/WhatsAppShare';
import {
  formatRepairApprovalRequestMessage,
  formatRepairIntakeConfirmationMessage,
  formatRepairReadyMessage,
} from '../utils/whatsappRepairMessage';
import type { FirestoreUserWithRepair, RepairBranch, RepairPartReservation, RepairServiceEvent, RepairSparePart, RepairSparePartStock } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext, resolveRepairTechnicianIds } from '../utils/repairAccessContext';
import { resolveRepairSettings } from '../config/repairSettings';
import { useRepairJobDoc } from '../hooks/useRepairJobDoc';
import { uploadRepairJobPhoto } from '../utils/repairPhotoStorage';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
} from '../utils/repairWorkflowNormalize';
import { computeRepairJobCost, resolveRepairJobActionState } from '../utils/repairBusinessLogic';

export const RepairJobWorkspace: React.FC = () => {
  const { dir } = useAppDirection();
  const { jobId = '', tenantSlug = '' } = useParams<{ jobId: string; tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
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
  const { job, loading } = useRepairJobDoc(jobId);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [stockRows, setStockRows] = useState<RepairSparePartStock[]>([]);
  const [reservations, setReservations] = useState<RepairPartReservation[]>([]);
  const [events, setEvents] = useState<RepairServiceEvent[]>([]);
  const [laborCost, setLaborCost] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('');
  const [reason, setReason] = useState('');
  const [resPartId, setResPartId] = useState('');
  const [resQty, setResQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState('');

  useEffect(() => {
    void repairBranchService.list().then(setBranches);
  }, []);

  useEffect(() => {
    if (!job?.branchId) return;
    void sparePartsService.listParts(job.branchId).then(setParts);
  }, [job?.branchId]);

  useEffect(() => {
    if (!jobId) return;
    void repairServiceEventService.listByJob(jobId).then(setEvents);
  }, [jobId, job?.updatedAt]);

  useEffect(() => {
    if (!job) return;
    setLaborCost(String(job.laborCost ?? ''));
    setNotes(String(job.notes || ''));
    setStatus(job.status);
  }, [job?.id, job?.status, job?.laborCost, job?.notes]);

  const branch = useMemo(
    () => branches.find((b) => String(b.id) === String(job?.branchId)),
    [branches, job?.branchId],
  );
  const branchWarehouseId = String(branch?.warehouseId || '').trim();
  const branchWarehouseName = branch?.name ? `مخزن ${branch.name}` : String(branch?.warehouseCode || '').trim();

  useEffect(() => {
    if (!job?.branchId) return;
    void sparePartsService.listStock(job.branchId, branchWarehouseId || undefined).then(setStockRows);
  }, [job?.branchId, branchWarehouseId]);

  useEffect(() => {
    if (!job?.id) return;
    void sparePartsService.listActiveReservationsForJob(job.id).then(setReservations);
  }, [job?.id, job?.updatedAt]);

  const actionState = useMemo(
    () =>
      job
        ? resolveRepairJobActionState({
            job,
            access: repairCtx,
            technicianIds,
            canEditByPermission: can('repair.jobs.edit'),
            canCreatePartsUsage: can('repair.parts.view'),
          })
        : null,
    [job, repairCtx, technicianIds, can],
  );
  const canEditThisJob = Boolean(actionState?.canEdit);
  const costSummary = useMemo(() => (job ? computeRepairJobCost(job) : null), [job]);
  const stockByPartId = useMemo(() => {
    const map = new Map<string, number>();
    stockRows.forEach((row) => map.set(String(row.partId || ''), Number(row.quantity || 0)));
    return map;
  }, [stockRows]);

  const persistFields = async () => {
    if (!job?.id || !canEditThisJob) return;
    setSaving(true);
    try {
      await repairJobService.update(job.id, {
        laborCost: Number(laborCost || 0),
        notes,
      });
      toast.success('تم حفظ الملاحظات والأجور.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الحفظ.');
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async () => {
    if (!job?.id || !canEditThisJob) return;
    try {
      await repairJobService.changeStatus({
        jobId: job.id,
        status,
        technicianId: userProfile?.id,
        reason: isUnrepairableStatus(status) || isCancelledStatus(status) ? reason : undefined,
        finalCost: isDeliveredStatus(status) ? Number(costSummary?.finalCost || job.finalCost || 0) : undefined,
        warranty: isDeliveredStatus(status) ? job.warranty : undefined,
        actorUid: userProfile?.id || '',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
      });
      toast.success('تم تحديث الحالة.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحديث الحالة.');
    }
  };

  const addReservation = async () => {
    if (!job?.id || !canEditThisJob || !branchWarehouseId) {
      toast.error('أكمل إعداد مخزن الفرع أو الصلاحيات.');
      return;
    }
    const part = parts.find((p) => p.id === resPartId);
    const qty = Number(resQty || 0);
    if (!part || qty <= 0) {
      toast.error('اختر قطعة وكمية صحيحة.');
      return;
    }
    try {
      await sparePartsService.reserveForJob({
        branchId: job.branchId,
        jobId: job.id,
        partId: part.id || '',
        partName: part.name,
        quantity: qty,
        warehouseId: branchWarehouseId,
        warehouseName: branchWarehouseName,
        createdBy: userProfile?.displayName || userProfile?.email || 'user',
      });
      toast.success('تم حجز الكمية على الطلب (waiting_parts).');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الحجز.');
    }
  };

  const generateApprovalLink = async () => {
    if (!job?.id || !canEditThisJob) return;
    try {
      const r = await repairJobService.requestCustomerApproval({
        jobId: job.id,
        actorUid: userProfile?.id || '',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
      });
      if (!r?.token) return;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setApprovalUrl(
        `${origin}/track/${encodeURIComponent(tenantSlug || '')}/approve?job=${encodeURIComponent(job.id)}&token=${encodeURIComponent(r.token)}`,
      );
      toast.success('تم إنشاء رابط موافقة جديد.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنشاء الرابط.');
    }
  };

  const uploadPhoto = async (fileList: FileList | null, field: 'intake' | 'repair') => {
    const f = fileList?.[0];
    if (!f || !job?.id) return;
    if ((job.intakePhotoUrls?.length || 0) + (job.repairPhotoUrls?.length || 0) >= 16) {
      toast.error('الحد الأقصى للصور لهذا الطلب 16.');
      return;
    }
    try {
      const url = await uploadRepairJobPhoto(job.id, f);
      const patch =
        field === 'intake'
          ? { intakePhotoUrls: [...(job.intakePhotoUrls || []), url].slice(0, 12) }
          : { repairPhotoUrls: [...(job.repairPhotoUrls || []), url].slice(0, 12) };
      await repairJobService.update(job.id, patch);
      await appendRepairServiceEvent(job.id, {
        tenantId: job.tenantId,
        branchId: job.branchId,
        at: new Date().toISOString(),
        actorUid: userProfile?.id || 'unknown',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
        action: 'photo_added',
        domainEvent: 'job.photo_added',
        eventSchemaVersion: REPAIR_DOMAIN_EVENT_VERSION,
        payload: { field, url },
      });
      toast.success('تم رفع الصورة.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الرفع.');
    }
  };

  if (loading && !job) {
    return (
      <div className="p-6" dir={dir}>
        <p className="text-muted-foreground">جاري تحميل الطلب…</p>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="p-6" dir={dir}>
        <p>الطلب غير موجود.</p>
        <Button variant="outline" className="mt-2" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
          رجوع
        </Button>
      </div>
    );
  }

  const waIntake = formatRepairIntakeConfirmationMessage(job);
  const waReady = formatRepairReadyMessage(job);
  const waApproval = formatRepairApprovalRequestMessage(job, approvalUrl || '(أنشئ الرابط أولاً)');

  return (
    <div className="pb-28 space-y-4 px-3 max-w-7xl mx-auto" dir={dir}>
      <div className="flex items-start justify-between gap-3 flex-wrap pt-2">
        <div>
          <h1 className="text-xl font-bold">ورشة الإصلاح #{job.receiptNo}</h1>
          <p className="text-sm text-muted-foreground">{job.customerName} — {job.customerPhone}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {actionState?.isClosed && <Badge variant="secondary">مغلق</Badge>}
          {job.approvalStatus && job.approvalStatus !== 'not_required' && <Badge variant="outline">موافقة: {job.approvalStatus}</Badge>}
          <StatusBadge status={job.status} />
        </div>
      </div>
      {actionState?.blockedReason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionState.blockedReason}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
          <Button variant="outline" size="sm">تفاصيل / إيصال</Button>
        </Link>
        <Button variant="secondary" size="sm" type="button" disabled={!actionState?.canRequestApproval} onClick={() => void generateApprovalLink()}>
          إنشاء رابط موافقة
        </Button>
        <WhatsAppShare phone={job.customerPhone} text={waIntake} label="واتساب استلام" />
        {approvalUrl ? (
          <WhatsAppShare phone={job.customerPhone} text={waApproval} label="واتساب موافقة" />
        ) : null}
        <WhatsAppShare phone={job.customerPhone} text={waReady} label="جاهز للاستلام" />
      </div>
      {approvalUrl && (
        <Input readOnly className="text-xs font-mono" value={approvalUrl} onFocus={(e) => e.target.select()} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>الحالة والتشغيل</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>تغيير الحالة</Label>
                <Select value={status} onValueChange={(v) => setStatus(v)}>
                  <SelectTrigger className="min-h-12 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {repairSettings.workflow.statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>موعد الاستحقاق</Label>
                <div className="min-h-12 rounded-md border px-3 py-2 text-sm flex items-center">
                  {job.dueAt ? new Date(job.dueAt).toLocaleString('ar-EG') : 'غير محدد'}
                </div>
              </div>
              {(isUnrepairableStatus(status) || isCancelledStatus(status)) && (
                <div className="space-y-1 md:col-span-2">
                  <Label>سبب الإغلاق</Label>
                  <textarea
                    className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-base"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              )}
              <Button className="w-full min-h-12 text-base md:col-span-2" disabled={!actionState?.canChangeStatus} onClick={() => void applyStatus()}>
                تطبيق الحالة
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>تشخيص وتكلفة يدوية</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label>أجور يدوية / عمالة (ج.م)</Label>
              <Input
                className="min-h-12 text-base"
                inputMode="decimal"
                value={laborCost}
                onChange={(e) => setLaborCost(e.target.value)}
              />
              <Label>ملاحظات الورشة</Label>
              <textarea
                className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-2 text-base"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button className="w-full min-h-12" disabled={!canEditThisJob || saving} onClick={() => void persistFields()}>
                حفظ الملاحظات والأجور
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>حجز قطع الغيار</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                الحجز يقلل المتاح بدون صرف فعلي من المخزون حتى يتم الاستهلاك.
              </p>
              <Select value={resPartId} onValueChange={setResPartId}>
                <SelectTrigger className="min-h-12"><SelectValue placeholder="اختر قطعة" /></SelectTrigger>
                <SelectContent>
                  {parts.map((p) => {
                    const available = stockByPartId.get(String(p.id || '')) || 0;
                    return (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} - رصيد {available.toLocaleString('ar-EG')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Input className="min-h-12" inputMode="numeric" value={resQty} onChange={(e) => setResQty(e.target.value)} />
              <Button className="w-full min-h-12" disabled={!actionState?.canUseParts} onClick={() => void addReservation()}>
                حجز للطلب
              </Button>
              <div className="rounded-md border divide-y">
                {reservations.length === 0 && <p className="p-3 text-sm text-muted-foreground">لا توجد حجوزات نشطة.</p>}
                {reservations.map((row) => (
                  <div key={row.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                    <span>{row.partName}</span>
                    <Badge variant="outline">{Number(row.quantity || 0).toLocaleString('ar-EG')}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>صور سريعة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <Label>صورة ورشة</Label>
                <Input
                  type="file"
                  accept="image/*"
                  className="min-h-12"
                  disabled={!canEditThisJob}
                  onChange={(e) => void uploadPhoto(e.target.files, 'repair')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(job.repairPhotoUrls || []).map((u, index) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded border px-2 py-1 text-xs text-primary underline">
                    صورة {index + 1}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader><CardTitle>ملخص التكلفة</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">قطع الغيار</span><strong>{costSummary?.partsCost.toLocaleString('ar-EG') || 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عمالة</span><strong>{costSummary?.laborCost.toLocaleString('ar-EG') || 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">خدمة</span><strong>{costSummary?.serviceOnlyCost.toLocaleString('ar-EG') || 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">منتجات/بنود</span><strong>{costSummary?.productsFinalCost.toLocaleString('ar-EG') || 0}</strong></div>
              <div className="border-t pt-2 flex justify-between text-base"><span>الإجمالي النهائي</span><strong>{costSummary?.finalCost.toLocaleString('ar-EG') || 0} ج.م</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">حالة الدفع</span><Badge variant="outline">{costSummary?.paymentStatus || 'unpaid'}</Badge></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>سجل الأحداث</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm max-h-64 overflow-y-auto">
          {events.length === 0 && <p className="text-muted-foreground">لا أحداث بعد.</p>}
          {events.map((ev) => (
            <div key={ev.id} className="border rounded p-2">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{ev.actorName}</span>
                <span>{new Date(ev.at).toLocaleString('ar-EG')}</span>
              </div>
              <div className="font-medium">{ev.action}</div>
              {ev.domainEvent && (
                <div className="text-[11px] font-mono text-muted-foreground">{ev.domainEvent}</div>
              )}
              {ev.statusBefore && ev.statusAfter && (
                <div className="text-xs">{ev.statusBefore} → {ev.statusAfter}</div>
              )}
              {ev.note && <div className="text-xs mt-1">{ev.note}</div>}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-3 flex gap-2 justify-center safe-area-pb">
        <Button className="flex-1 max-w-xs min-h-12 text-base" disabled={!canEditThisJob || saving} onClick={() => void persistFields()}>
          حفظ سريع
        </Button>
        <Button className="flex-1 max-w-xs min-h-12 text-base" variant="secondary" disabled={!canEditThisJob} onClick={() => void applyStatus()}>
          تطبيق الحالة
        </Button>
      </div>
    </div>
  );
};

export default RepairJobWorkspace;
