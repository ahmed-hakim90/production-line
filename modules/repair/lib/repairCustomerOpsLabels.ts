import type {
  CustomerServiceRequestStatus,
  RepairReplacementStatus,
} from '../types';
import { mapLegacyRepairStatus } from '../utils/repairWorkflowNormalize';

export const CUSTOMER_REQUEST_STATUS_LABELS: Record<CustomerServiceRequestStatus, string> = {
  submitted: 'غير موزع',
  assigned: 'بانتظار الاستلام',
  converted: 'تم التحويل',
  cancelled: 'ملغى',
};

export const REPLACEMENT_STATUS_LABELS: Record<RepairReplacementStatus, string> = {
  pending_approval: 'بانتظار الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
};

export function formatRepairOpsDate(value?: string | null): string {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('ar-EG');
}

export function formatRepairOpsDateShort(value?: string | null): string {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('ar-EG');
}

export function custodyAgeDays(createdAt?: string, updatedAt?: string): number {
  const ms = Date.parse(createdAt || updatedAt || '');
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

/** Days since a job entered a canonical status (from statusHistory, else updatedAt). */
export function daysSinceJobStatus(
  job: {
    status?: string;
    updatedAt?: string;
    statusHistory?: Array<{ status?: string; at?: string }>;
  },
  targetStatus: string,
): number | null {
  const current = mapLegacyRepairStatus(String(job.status || ''));
  const target = mapLegacyRepairStatus(String(targetStatus || ''));
  if (!current || !target || current !== target) return null;
  const history = Array.isArray(job.statusHistory) ? job.statusHistory : [];
  let lastAt = '';
  for (const entry of history) {
    if (mapLegacyRepairStatus(String(entry?.status || '')) === target) {
      lastAt = String(entry?.at || '');
    }
  }
  const ms = Date.parse(lastAt || job.updatedAt || '');
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

export function openWhatsApp(phone: string | undefined, message: string): void {
  const digits = String(phone || '').replace(/\D/g, '');
  const url = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function toRepairOpsUserError(error: unknown, fallback: string): string {
  const message = String((error as { message?: unknown })?.message || '').trim();
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(message)) {
    return 'ليس لديك صلاحية كافية لتنفيذ هذه العملية.';
  }
  if (code.includes('unauthenticated')) {
    return 'يجب تسجيل الدخول أولًا ثم إعادة المحاولة.';
  }
  if (code.includes('failed-precondition') || /requires an index|create it here/i.test(message)) {
    return message && !/firebase|firestore|https?:\/\//i.test(message)
      ? message
      : 'تعذر إكمال العملية بسبب شرط تشغيلي. راجع البيانات وأعد المحاولة.';
  }
  if (message && !/firebase|firestore|https?:\/\//i.test(message)) {
    return message;
  }
  return fallback;
}
