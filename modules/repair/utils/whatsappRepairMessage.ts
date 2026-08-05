import type { RepairJob } from '../types';
import { computeRepairJobCost } from './repairBusinessLogic';
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

const money = (value: unknown): string =>
  `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;

const deviceLabel = (job: Pick<RepairJob, 'deviceBrand' | 'deviceModel'>): string =>
  `${String(job.deviceBrand || '').trim()} ${String(job.deviceModel || '').trim()}`.trim() || 'الجهاز';

const joinMessage = (blocks: Array<string | false | null | undefined>): string =>
  blocks
    .filter((block): block is string => typeof block === 'string' && block.trim().length > 0)
    .join('\n\n');

const formatPartsBlock = (job: Pick<RepairJob, 'partsUsed'>): string => {
  const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
  const lines = parts
    .filter((part) => Number(part.quantity || 0) > 0)
    .slice(0, 20)
    .map((part, index) => {
      const qty = Number(part.quantity || 0);
      const unit = Number(part.unitCost || 0);
      const lineTotal = qty * unit;
      const priceBit = unit > 0 ? ` — ${money(lineTotal)}` : '';
      return `${index + 1}) ${part.partName || 'قطعة'} × ${qty.toLocaleString('ar-EG')}${priceBit}`;
    });
  if (lines.length === 0) return '';
  return ['قطع الغيار المقترحة:', ...lines].join('\n');
};

/** رسالة حالة عامة + رابط التتبع عند توفره */
export const formatRepairWhatsAppMessage = (job: RepairJob, trackUrl?: string): string => {
  const st = mapLegacyRepairStatus(job.status);
  const header = [
    `مرحباً ${job.customerName || 'عميلنا'}،`,
    `تحديث حالة جهازكم (${deviceLabel(job)}).`,
  ].join('\n');

  const details = [
    `رقم الإيصال: ${job.receiptNo || '—'}`,
    `الحالة الحالية: ${statusLabelMap[st] || st}`,
  ];

  if (isDeliveredStatus(job.status)) {
    details.push(`تكلفة الإصلاح: ${money(job.finalCost)}`);
    details.push(`الضمان: ${warrantyLabelMap[job.warranty] || 'بدون ضمان'}`);
  }

  if (st === 'unrepairable' && job.notes) {
    details.push(`سبب التعذر: ${job.notes}`);
  }

  return joinMessage([
    header,
    details.join('\n'),
    trackUrl ? `رابط متابعة الطلب:\n${trackUrl}` : '',
  ]);
};

/** تأكيد استلام الجهاز في الورشة */
export const formatRepairIntakeConfirmationMessage = (job: RepairJob, trackUrl?: string): string =>
  joinMessage([
    [
      `مرحباً ${job.customerName || 'عميلنا'}،`,
      `تم استلام جهازكم (${deviceLabel(job)}) في مركز الصيانة.`,
    ].join('\n'),
    [
      `رقم الإيصال: ${job.receiptNo || '—'}`,
      'سنوافيكم بالتحديثات عند اكتشاف العطل والتكلفة.',
    ].join('\n'),
    trackUrl ? `رابط متابعة الطلب:\n${trackUrl}` : '',
  ]);

/** جاهز للاستلام من الفرع */
export const formatRepairReadyMessage = (job: RepairJob, trackUrl?: string): string =>
  joinMessage([
    [
      `مرحباً ${job.customerName || 'عميلنا'}،`,
      `جهازكم (${deviceLabel(job)}) أصبح جاهزاً للاستلام.`,
    ].join('\n'),
    [
      `رقم الإيصال: ${job.receiptNo || '—'}`,
      'نرجو زيارة الفرع في أقرب وقت.',
    ].join('\n'),
    trackUrl ? `رابط متابعة الطلب:\n${trackUrl}` : '',
  ]);

/** تسليم نهائي + شكر */
export const formatRepairDeliveredMessage = (job: RepairJob, trackUrl?: string): string =>
  joinMessage([
    [
      `شكراً لثقتكم ${job.customerName || ''}،`,
      'تم تسليم الجهاز بعد الإصلاح.',
    ].join('\n'),
    [
      `رقم الإيصال: ${job.receiptNo || '—'}`,
      `التكلفة: ${money(job.finalCost)}`,
      `ضمان الورشة: ${warrantyLabelMap[job.warranty] || 'بدون ضمان'}`,
    ].join('\n'),
    trackUrl ? `رابط متابعة الطلب:\n${trackUrl}` : '',
  ]);

/** رابط موافقة العميل على التقدير — يشمل قطع الغيار عند توفرها */
export const formatRepairApprovalRequestMessage = (job: RepairJob, approveUrl: string): string => {
  const cost = computeRepairJobCost(job);
  const estimate = cost.estimatedCost > 0 ? cost.estimatedCost : cost.finalCost;
  const partsBlock = formatPartsBlock(job);
  const costLines = [
    `رقم الإيصال: ${job.receiptNo || '—'}`,
    `إجمالي التقدير: ${money(estimate)}`,
  ];
  if (cost.partsCost > 0) costLines.push(`منها قطع غيار: ${money(cost.partsCost)}`);
  if (cost.laborCost > 0) costLines.push(`أجور صيانة: ${money(cost.laborCost)}`);
  if (cost.serviceOnlyCost > 0) costLines.push(`خدمة: ${money(cost.serviceOnlyCost)}`);

  return joinMessage([
    [
      `مرحباً ${job.customerName || 'عميلنا'}،`,
      `نحتاج موافقتكم على تقدير إصلاح جهاز (${deviceLabel(job)}).`,
    ].join('\n'),
    costLines.join('\n'),
    partsBlock,
    approveUrl
      ? `رابط الموافقة أو الرفض (صالح لمدة محدودة):\n${approveUrl}`
      : 'الرجاء طلب رابط الموافقة من الفرع.',
  ]);
};
