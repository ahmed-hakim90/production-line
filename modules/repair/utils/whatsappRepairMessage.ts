import type { RepairJob, RepairJobStatus } from '../types';

const statusLabelMap: Record<string, string> = {
  received: 'وارد',
  inspection: 'فحص',
  repair: 'إصلاح',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  unrepairable: 'غير قابل للإصلاح',
};

const warrantyLabelMap = {
  none: 'بدون ضمان',
  '3months': 'ضمان 3 شهور',
  '6months': 'ضمان 6 شهور',
} as const;

export const formatRepairWhatsAppMessage = (job: RepairJob): string => {
  const lines = [
    `مرحباً ${job.customerName}،`,
    `جهازك (${job.deviceBrand} ${job.deviceModel}) حالته الآن: ${statusLabelMap[job.status] || job.status}`,
    `رقم الإيصال: ${job.receiptNo}`,
  ];

  if (job.status === 'delivered') {
    lines.push(`تكلفة الإصلاح: ${Number(job.finalCost || 0).toFixed(2)}`);
    lines.push(`الضمان: ${warrantyLabelMap[job.warranty]}`);
  }

  if (job.status === 'unrepairable' && job.notes) {
    lines.push(`سبب التعذر: ${job.notes}`);
  }

  return lines.join('\n');
};
