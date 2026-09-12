import { QRCodeSVG } from 'qrcode.react';
import { FactoryPrintShell } from '@/src/components/erp/FactoryPrintShell';
import type { CycleOrder, CycleSlot } from '../services/workOrderCycleService';

export function WorkOrderContainerCard({ order, slot, url, companyName, timezone = 'Africa/Cairo' }: { order: CycleOrder; slot: CycleSlot; url: string; companyName: string; timezone?: string }) {
  const printedDate = slot.submittedAt ? new Date(slot.submittedAt).toLocaleString('ar-EG', { timeZone: timezone }) : '';
  return <FactoryPrintShell companyName={companyName} documentType="بطاقة إنتاج الساعة — ليست اعتماد جودة" printDate={`${printedDate} (${timezone})`} width="100%" dense version="1" showVersion metaCards={[
    { label: 'أمر الشغل', value: order.workOrderNumber }, { label: 'المنتج', value: order.productName },
    { label: 'الخط', value: order.lineName }, { label: 'اليوم والساعة', value: `${slot.date} | ${slot.startTime}–${slot.endTime}` },
  ]} kpis={[{ label: 'المنتج', value: slot.actualQuantity || 0 }, { label: 'المرفوض المبدئي', value: slot.rejectedQuantity || 0 }, { label: 'العمالة الفعلية', value: slot.workersSnapshotCount || 0 }]}>
    <div dir="rtl" className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row">
      <div className="min-w-0 w-full flex-1 space-y-2 sm:w-auto"><p className="font-semibold">بانتظار الفحص واعتماد مدير الجودة</p><p className="break-all text-sm">الحاوية: <bdi>{slot.containerId}</bdi></p><p className="break-all text-sm">المستند: <bdi>{slot.productionDocumentId}</bdi></p><p className="text-sm">هذه البطاقة لا تسمح باستلام التغليف. مسح الرمز يفتح الحالة الحالية ولا يسجل حركة.</p></div>
      <QRCodeSVG className="shrink-0" value={url} size={192} level="M" marginSize={4} title={`بطاقة الحاوية ${slot.containerId}`} />
    </div>
  </FactoryPrintShell>;
}
