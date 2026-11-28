import type { QualityInjectionRecord } from '../model';

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
