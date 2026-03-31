import React from 'react';
import type { RepairJob, RepairBranch } from '../types';

export const DeliveryReceiptPDF = React.forwardRef<
  HTMLDivElement,
  { job: RepairJob; branch?: RepairBranch | null }
>(function DeliveryReceiptPDF({ job, branch }, ref) {
  return (
    <div ref={ref} className="print-root bg-white text-slate-900 p-6 w-[800px]" dir="rtl">
      <h2 className="text-xl font-bold mb-4">إيصال تسليم صيانة</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><b>رقم الإيصال:</b> {job.receiptNo}</div>
        <div><b>الفرع:</b> {branch?.name || '-'}</div>
        <div><b>العميل:</b> {job.customerName}</div>
        <div><b>الهاتف:</b> {job.customerPhone}</div>
        <div><b>الجهاز:</b> {job.deviceBrand} {job.deviceModel}</div>
        <div><b>اللون:</b> {job.deviceColor || '-'}</div>
        <div><b>تكلفة الإصلاح:</b> {Number(job.finalCost || 0).toFixed(2)}</div>
        <div><b>الضمان:</b> {job.warranty}</div>
      </div>
      <div className="mt-5 border rounded-md p-3 text-sm">
        <b>الوصف:</b>
        <p className="mt-1">{job.problemDescription}</p>
      </div>
      <div className="mt-8 text-xs text-slate-500">
        ختم الفرع: {branch?.name || '______________'}
      </div>
    </div>
  );
});
