import type { RepairDomainEventName } from '../types';

/** أسماء أحداث مستقرة لربط الأتمتة والتكاملات (Operations-first، مصدر الحقيقة: service_events). */
export const REPAIR_DOMAIN_EVENT_VERSION = 1 as const;

/**
 * يحدد الحدث الأكثر تحديدًا لانتقال الحالة (مع fallback إلى job.status_changed).
 * الحالات تُمرَّر بعد التوحيد (mapLegacyRepairStatus) حيث أمكن.
 */
export function resolveDomainEventForStatusChange(before: string, after: string): RepairDomainEventName {
  const b = String(before || '').trim();
  const a = String(after || '').trim();
  if (b === a) return 'job.status_changed';

  if (a === 'delivered') return 'job.delivered';
  if (a === 'cancelled') return 'job.cancelled';
  if (a === 'unrepairable') return 'job.unrepairable';

  if (a === 'ready') {
    if (b === 'testing') return 'testing.completed';
    if (b === 'repairing') return 'repair.finished';
    return 'job.ready';
  }

  if (a === 'testing' && b !== 'testing') return 'testing.started';
  if (a === 'repairing' && b !== 'repairing') return 'repair.started';

  if (b === 'diagnosing' && a !== 'diagnosing') return 'diagnosis.completed';
  if (a === 'diagnosing' && b !== 'diagnosing') return 'diagnosis.started';

  if (a === 'waiting_parts' && b !== 'waiting_parts') return 'job.waiting_parts';
  if (a === 'waiting_approval' && b !== 'waiting_approval') return 'job.waiting_approval';

  return 'job.status_changed';
}
