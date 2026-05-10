import type { RepairJob } from '../types';
import { isDeliveredStatus, mapLegacyRepairStatus } from './repairWorkflowNormalize';

const statusLabelMap: Record<string, string> = {
  received: 'وارد',
  diagnosing: 'تشخيص',
  waiting_approval: 'بانتظار موافقة',
  waiting_parts: 'بانتظار قطع',
  repairing: 'إصلاح',
  testing: 'اختبار',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  unrepairable: 'غير قابل للإصلاح',
  inspection: 'فحص',
  repair: 'إصلاح',
};

const warrantyLabelMap = {
  none: 'بدون ضمان',
  '3months': 'ضمان 3 شهور',
  '6months': 'ضمان 6 شهور',
} as const;

export const formatRepairWhatsAppMessage = (job: RepairJob): string => {
  const st = mapLegacyRepairStatus(job.status);
  const lines = [
    `مرحباً ${job.customerName}،`,
    `جهازك (${job.deviceBrand} ${job.deviceModel}) حالته الآن: ${statusLabelMap[st] || st}`,
    `رقم الإيصال: ${job.receiptNo}`,
  ];

  if (isDeliveredStatus(job.status)) {
    lines.push(`تكلفة الإصلاح: ${Number(job.finalCost || 0).toFixed(2)}`);
    lines.push(`الضمان: ${warrantyLabelMap[job.warranty]}`);
  }

  if (st === 'unrepairable' && job.notes) {
    lines.push(`سبب التعذر: ${job.notes}`);
  }

  return lines.join('\n');
};

/** تأكيد استلام الجهاز في الورشة — رسالة قصيرة وسريعة للعميل */
export const formatRepairIntakeConfirmationMessage = (job: RepairJob): string =>
  [
    `مرحباً ${job.customerName}،`,
    `تم استلام جهازكم (${job.deviceBrand} ${job.deviceModel}) في مركز الصيانة.`,
    `رقم الإيصال: ${job.receiptNo}`,
    `سنوافيكم بالتحديثات عند اكتشاف العطل والتكلفة.`,
  ].join('\n');

/** جاهز للاستلام من الفرع */
export const formatRepairReadyMessage = (job: RepairJob): string =>
  [
    `مرحباً ${job.customerName}،`,
    `جهازكم (${job.deviceBrand}) أصبح جاهزاً للاستلام.`,
    `إيصال: ${job.receiptNo}`,
    `نرجو زيارة الفرع في أقرب وقت.`,
  ].join('\n');

/** تسليم نهائي + شكر */
export const formatRepairDeliveredMessage = (job: RepairJob): string =>
  [
    `شكراً لثقتكم ${job.customerName}،`,
    `تم تسليم الجهاز بعد الإصلاح.`,
    `إيصال: ${job.receiptNo}`,
    `التكلفة: ${Number(job.finalCost || 0).toFixed(2)} ج.م`,
    `ضمان الورشة: ${warrantyLabelMap[job.warranty]}`,
  ].join('\n');

/** رابط موافقة العميل على التقدير — يُرسل مع التوكن في الرابط */
export const formatRepairApprovalRequestMessage = (job: RepairJob, approveUrl: string): string =>
  [
    `مرحباً ${job.customerName}،`,
    `نحتاج موافقتكم على تقدير إصلاح جهاز (${job.deviceBrand} ${job.deviceModel}).`,
    `رقم الإيصال: ${job.receiptNo}`,
    `التقدير الحالي (إن وُجد): ${Number(job.estimatedCost || job.finalCost || 0).toFixed(2)} ج.م`,
    `رابط الموافقة أو الرفض (صالح لمدة محدودة):`,
    approveUrl,
  ].join('\n');
