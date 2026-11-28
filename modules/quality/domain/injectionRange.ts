import type { QualityInjectionRecord } from '../model';
import { normalizeInjectionShift } from './incomingReceipt';

export type InjectionShiftFilter = 'all' | 'نهاري' | 'ليلي';
export type InjectionQuantityFilter = 'all' | 'accepted' | 'rejected' | 'both';

export function isMissingFirestoreIndexError(error: unknown): boolean {
  const firestoreError = error as { code?: unknown; message?: unknown };
  const code = String(firestoreError?.code ?? '').toLowerCase();
  const message = String(firestoreError?.message ?? '').toLowerCase();
  return code.includes('failed-precondition')
    && (message.includes('requires an index') || message.includes('query requires an index'));
}

export function filterInjectionRecordsByDateRange(
  records: QualityInjectionRecord[],
  from: string,
  to: string,
): QualityInjectionRecord[] {
  return records.filter((record) => record.date >= from && record.date <= to);
}

export function filterInjectionRecordsByCriteria<T extends {
  shift: string;
  acceptedQuantity: number;
  rejectedQuantity: number;
}>(
  records: T[],
  shift: InjectionShiftFilter,
  quantity: InjectionQuantityFilter,
): T[] {
  return records.filter((record) => {
    if (shift !== 'all' && normalizeInjectionShift(record.shift) !== shift) return false;
    const hasAccepted = record.acceptedQuantity > 0;
    const hasRejected = record.rejectedQuantity > 0;
    if (quantity === 'accepted') return hasAccepted;
    if (quantity === 'rejected') return hasRejected;
    if (quantity === 'both') return hasAccepted && hasRejected;
    return true;
  });
}
