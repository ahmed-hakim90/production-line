import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { withTenantPath } from '@/lib/tenantPaths';
import { REPAIR_JOB_STATUS_LABELS, type RepairJob } from '../types';
import { buildRepairTrackPublicUrl } from '../lib/repairPublicLinks';
import { formatRepairWhatsAppMessage } from '../utils/whatsappRepairMessage';
import { WhatsAppShare } from './WhatsAppShare';
import { StatusBadge } from './StatusBadge';
import { computeRepairJobCost } from '../utils/repairBusinessLogic';

type RepairJobQuickDrawerProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  job: RepairJob | null;
  tenantSlug?: string;
  branchName?: string;
  technicianName?: string;
  showWorkshopLink?: boolean;
};

const printJobSummary = (job: RepairJob, branchName?: string, technicianName?: string) => {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  const partsText = Array.isArray(job.partsUsed) && job.partsUsed.length > 0
    ? job.partsUsed.map((part) => `${part.partName} x${part.quantity}`).join(' | ')
    : '-';

  popup.document.write(`
    <html dir="rtl">
      <head>
        <title>طلب صيانة #${job.receiptNo}</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #111827; }
          h2 { margin: 0 0 10px; }
          .muted { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: right; vertical-align: top; }
          th { width: 220px; background: #f9fafb; }
        </style>
      </head>
      <body>
        <h2>تفاصيل طلب الصيانة #${job.receiptNo || '-'}</h2>
        <div class="muted">تاريخ الإنشاء: ${new Date(job.createdAt).toLocaleString('ar-EG')}</div>
        <table>
          <tr><th>العميل</th><td>${job.customerName || '-'}</td></tr>
          <tr><th>الهاتف</th><td>${job.customerPhone || '-'}</td></tr>
          <tr><th>الفرع</th><td>${branchName || '-'}</td></tr>
          <tr><th>الحالة</th><td>${REPAIR_JOB_STATUS_LABELS[job.status] || job.status}</td></tr>
          <tr><th>الفني المسند</th><td>${technicianName || (job.technicianId ? `ID: ${job.technicianId}` : 'غير مسند')}</td></tr>
          <tr><th>الجهاز</th><td>${`${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim() || '-'}</td></tr>
          <tr><th>التكلفة النهائية</th><td>${Number(job.finalCostOverride ?? job.finalCost ?? 0).toLocaleString('ar-EG')}</td></tr>
          <tr><th>وصف العطل</th><td>${job.problemDescription || '-'}</td></tr>
          <tr><th>قطع الغيار المطلوبة/المستخدمة</th><td>${partsText}</td></tr>
        </table>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
};

export const RepairJobQuickDrawer: React.FC<RepairJobQuickDrawerProps> = ({
  open,
  onOpenChange,
  job,
  tenantSlug,
  branchName,
  technicianName,
  showWorkshopLink = false,
}) => {
  const trackUrl = useMemo(() => {
    if (!job) return '';
    return buildRepairTrackPublicUrl({
      tenantSlug,
      receiptNo: job.receiptNo,
      customerPhone: job.customerPhone,
    });
  }, [job, tenantSlug]);
  const whatsappText = useMemo(() => {
    if (!job) return '';
    return formatRepairWhatsAppMessage(job, trackUrl || undefined);
  }, [job, trackUrl]);

  if (!job) return null;

  const partsText = Array.isArray(job.partsUsed) && job.partsUsed.length > 0
    ? job.partsUsed.map((part) => `${part.partName} x${part.quantity}`).join(' | ')
    : '—';
  const cost = computeRepairJobCost(job);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="right-0 top-0 h-screen w-full max-w-xl translate-x-0 translate-y-0 rounded-none overflow-y-auto data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
        <DialogHeader>
          <DialogTitle>تفاصيل طلب الصيانة #{job.receiptNo}</DialogTitle>
          <DialogDescription>عرض سريع للطلب مع أدوات الطباعة والمشاركة.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={job.status} />
            <span className="text-muted-foreground">تاريخ الإنشاء: {new Date(job.createdAt).toLocaleString('ar-EG')}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2"><span className="text-muted-foreground">العميل: </span>{job.customerName || '—'}</div>
            <div className="rounded border p-2"><span className="text-muted-foreground">الهاتف: </span>{job.customerPhone || '—'}</div>
            <div className="rounded border p-2"><span className="text-muted-foreground">الفرع: </span>{branchName || '—'}</div>
            <div className="rounded border p-2"><span className="text-muted-foreground">الفني: </span>{technicianName || (job.technicianId ? `ID: ${job.technicianId}` : 'غير مسند')}</div>
            <div className="rounded border p-2 col-span-2"><span className="text-muted-foreground">الجهاز: </span>{`${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim() || '—'}</div>
            <div className="rounded border p-2"><span className="text-muted-foreground">قطع الغيار: </span>{cost.partsCost.toLocaleString('ar-EG')}</div>
            <div className="rounded border p-2"><span className="text-muted-foreground">عمالة/خدمة: </span>{(cost.laborCost + cost.serviceOnlyCost).toLocaleString('ar-EG')}</div>
            <div className="rounded border p-2 col-span-2"><span className="text-muted-foreground">التكلفة النهائية: </span>{cost.finalCost.toLocaleString('ar-EG')}</div>
            <div className="rounded border p-2 col-span-2"><span className="text-muted-foreground">العطل: </span>{job.problemDescription || '—'}</div>
            <div className="rounded border p-2 col-span-2"><span className="text-muted-foreground">قطع الغيار: </span>{partsText}</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button type="button" variant="outline" onClick={() => printJobSummary(job, branchName, technicianName)}>
              طباعة
            </Button>
            <WhatsAppShare text={whatsappText} phone={job.customerPhone} />
            {job.id && (
              <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
                <Button type="button" variant="secondary">التفاصيل / إيصال</Button>
              </Link>
            )}
            {job.id && showWorkshopLink ? (
              <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}>
                <Button type="button">فتح الورشة</Button>
              </Link>
            ) : null}
          </div>
          {trackUrl ? (
            <div className="rounded border bg-muted/20 p-2 text-[11px] break-all" dir="ltr">
              {trackUrl}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RepairJobQuickDrawer;
