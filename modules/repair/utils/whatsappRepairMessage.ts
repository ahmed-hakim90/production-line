import type { RepairJob, RepairJobStatus } from '../types';
import { REPAIR_STATUS_LABELS, REPAIR_WARRANTY_LABELS } from '../types';

/** Build an Arabic WhatsApp message for a status change notification */
export function buildStatusWhatsAppMessage(job: RepairJob, branchPhone?: string): string {
  const statusLabel = REPAIR_STATUS_LABELS[job.status] ?? job.status;

  const lines: string[] = [
    `مرحباً ${job.customerName} 👋`,
    ``,
    `بخصوص جهازك 📱`,
    `${job.deviceBrand} ${job.deviceModel}`,
    `رقم الإيصال: *${job.receiptNo}*`,
    ``,
    `حالة الجهاز دلوقتي: *${statusLabel}*`,
  ];

  if (job.status === 'ready') {
    lines.push(``, `✅ جهازك جاهز للاستلام، تعال خد جهازك 🎉`);
  }

  if (job.status === 'unrepairable') {
    lines.push(``, `⚠️ للأسف الجهاز غير قابل للإصلاح.`);
    if (job.unrepairableReason) {
      lines.push(`السبب: ${job.unrepairableReason}`);
    }
    lines.push(`يرجى التواصل معنا لاستلام الجهاز.`);
  }

  if (job.status === 'delivered') {
    if (job.finalCost !== undefined && job.finalCost > 0) {
      lines.push(``, `💰 تكلفة الإصلاح: ${job.finalCost.toLocaleString('ar-EG')} جنيه`);
    } else if (job.paymentType === 'warranty_free') {
      lines.push(``, `✅ الإصلاح مجاني (ضمان)`);
    }

    const warrantyLabel = job.warranty ? REPAIR_WARRANTY_LABELS[job.warranty] : null;
    if (warrantyLabel && job.warranty !== 'none') {
      lines.push(`🛡️ الضمان: ${warrantyLabel}`);
    }

    lines.push(``, `شكراً لثقتكم بنا 🙏`);
  }

  if (branchPhone) {
    lines.push(``, `📞 للتواصل: ${branchPhone}`);
  }

  return lines.join('\n');
}

/** Open WhatsApp with a pre-filled message */
export function sendWhatsAppMessage(phone: string, message: string): void {
  // Strip non-numeric, then prepend country code if needed
  const cleaned = phone.replace(/\D/g, '');
  const withCode = cleaned.startsWith('0') ? `20${cleaned.slice(1)}` : cleaned;
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${withCode}?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
