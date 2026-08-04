import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  REPAIR_JOB_STATUS_LABELS,
  type RepairFollowUp,
  type RepairJob,
  type RepairJobProduct,
} from '../types';
import { StatusBadge } from './StatusBadge';
import { repairFollowUpService } from '../services/repairFollowUpService';

type RepairCallCenterJobPanelProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  job: RepairJob | null;
  branchName?: string;
  actorUid: string;
  actorName: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('ar-EG');
};

const resolveJobProducts = (job: RepairJob): RepairJobProduct[] => {
  if (Array.isArray(job.jobProducts) && job.jobProducts.length > 0) return job.jobProducts;
  return [
    {
      itemId: 'legacy',
      productName: job.productName || `${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim() || 'جهاز',
      deviceBrand: job.deviceBrand,
      deviceModel: job.deviceModel,
      serialNo: job.deviceSerial,
      quantity: 1,
    },
  ];
};

export const RepairCallCenterJobPanel: React.FC<RepairCallCenterJobPanelProps> = ({
  open,
  onOpenChange,
  job,
  branchName,
  actorUid,
  actorName,
}) => {
  const [followUps, setFollowUps] = useState<RepairFollowUp[]>([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadFollowUps = useCallback(async (jobId: string) => {
    setFollowUpsLoading(true);
    try {
      const rows = await repairFollowUpService.listByJob(jobId);
      setFollowUps(rows);
    } catch {
      setFollowUps([]);
    } finally {
      setFollowUpsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !job?.id) {
      setFollowUps([]);
      setNote('');
      setFollowUpAt('');
      return;
    }
    void loadFollowUps(job.id);
  }, [open, job?.id, loadFollowUps]);

  const submitFollowUp = async () => {
    if (!job?.id || !job.branchId) return;
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      toast.error('اكتب ملاحظة المتابعة.');
      return;
    }
    setSubmitting(true);
    try {
      await repairFollowUpService.create({
        jobId: job.id,
        branchId: job.branchId,
        tenantId: job.tenantId,
        note: trimmedNote,
        followUpAt: followUpAt.trim() ? new Date(followUpAt.trim()).toISOString() : undefined,
        actorUid,
        actorName,
      });
      toast.success('تمت إضافة المتابعة.');
      setNote('');
      setFollowUpAt('');
      await loadFollowUps(job.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ المتابعة.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!job) return null;

  const products = resolveJobProducts(job);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>طلب #{job.receiptNo}</SheetTitle>
          <SheetDescription>عرض تفاصيل الطلب للمراجعة — بدون تعديل.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <Badge variant="outline">{branchName || job.branchId || '—'}</Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border p-2">
              <span className="text-muted-foreground">العميل: </span>
              {job.customerName || '—'}
            </div>
            <div className="rounded border p-2 font-mono">
              <span className="text-muted-foreground font-sans">الهاتف: </span>
              {job.customerPhone || '—'}
            </div>
            {job.customerAddress ? (
              <div className="rounded border p-2 sm:col-span-2">
                <span className="text-muted-foreground">العنوان: </span>
                {job.customerAddress}
              </div>
            ) : null}
            <div className="rounded border p-2">
              <span className="text-muted-foreground">تاريخ الإنشاء: </span>
              {formatDateTime(job.createdAt)}
            </div>
            <div className="rounded border p-2">
              <span className="text-muted-foreground">آخر تحديث: </span>
              {formatDateTime(job.updatedAt)}
            </div>
            <div className="rounded border p-2">
              <span className="text-muted-foreground">الموعد المتوقع: </span>
              {formatDateTime(job.dueAt)}
            </div>
            <div className="rounded border p-2">
              <span className="text-muted-foreground">الأولوية: </span>
              {job.priority === 'urgent' ? 'عاجل' : 'عادي'}
            </div>
          </div>

          <div className="rounded border p-3 space-y-2">
            <div className="font-medium">الأجهزة / المنتجات</div>
            {products.map((row) => (
              <div key={row.itemId} className="rounded bg-muted/40 p-2">
                <div>{row.productName}</div>
                <div className="text-xs text-muted-foreground">
                  {[row.deviceBrand, row.deviceModel].filter(Boolean).join(' · ') || '—'}
                  {row.serialNo ? ` · S/N ${row.serialNo}` : ''}
                  {row.quantity && row.quantity > 1 ? ` · ×${row.quantity}` : ''}
                </div>
              </div>
            ))}
          </div>

          {job.problemDescription ? (
            <div className="rounded border p-3">
              <div className="font-medium mb-1">وصف العطل</div>
              <p className="text-muted-foreground whitespace-pre-wrap">{job.problemDescription}</p>
            </div>
          ) : null}

          {Array.isArray(job.statusHistory) && job.statusHistory.length > 0 ? (
            <div className="rounded border p-3 space-y-2">
              <div className="font-medium">سجل الحالات</div>
              {[...job.statusHistory].reverse().slice(0, 12).map((entry, idx) => (
                <div key={`${entry.status}-${entry.at}-${idx}`} className="flex justify-between gap-2 text-xs">
                  <span>{REPAIR_JOB_STATUS_LABELS[entry.status] || entry.status}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(entry.at)}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded border p-3 space-y-3">
            <div className="font-medium">متابعات مركز الاتصال</div>
            {followUpsLoading ? (
              <p className="text-muted-foreground text-xs">جاري تحميل المتابعات…</p>
            ) : followUps.length === 0 ? (
              <p className="text-muted-foreground text-xs">لا توجد متابعات مسجّلة بعد.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {followUps.map((row) => (
                  <div key={row.id} className="rounded bg-muted/40 p-2 text-xs">
                    <div className="whitespace-pre-wrap">{row.note}</div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                      <span>{row.actorName}</span>
                      <span>{formatDateTime(row.createdAt)}</span>
                      {row.followUpAt ? <span>موعد: {formatDateTime(row.followUpAt)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t pt-3">
              <div>
                <Label htmlFor="call-center-followup-note">ملاحظة متابعة</Label>
                <textarea
                  id="call-center-followup-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="مثال: العميل طلب الاتصال غدًا بعد 5 مساءً"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div>
                <Label htmlFor="call-center-followup-at">موعد متابعة (اختياري)</Label>
                <Input
                  id="call-center-followup-at"
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void submitFollowUp()} disabled={submitting}>
                {submitting ? 'جاري الحفظ…' : 'إضافة متابعة'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RepairCallCenterJobPanel;
