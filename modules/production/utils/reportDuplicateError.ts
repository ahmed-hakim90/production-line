export const REPORT_DUPLICATE_ERROR_CODE = 'report/duplicate';
export const REPORT_DUPLICATE_MESSAGE = 'هذا التقرير مسجل من قبل لنفس اليوم والخط والمشرف والمنتج';
export const INJECTION_REPORT_DUPLICATE_MESSAGE =
  'هذا التقرير مسجل من قبل لنفس اليوم والخط والمكون والوردية';

/** Shown when Firestore returns permission-denied (e.g. tenant/rules mismatch). */
export const REPORT_FIRESTORE_PERMISSION_DENIED_AR =
  'ليس لديك صلاحية لإكمال هذه العملية. إذا استمرّت المشكلة، تأكد من شركة العمل أو تواصل مع المسؤول.';

type MaybeCodeError = Error & { code?: string };

const extractMessage = (error: unknown): string => {
  if (typeof error === 'string') return error.trim();
  return String((error as MaybeCodeError | undefined)?.message || '').trim();
};

function isFirestorePermissionDenied(error: unknown): boolean {
  if (error != null && typeof error === 'object') {
    const code = String((error as MaybeCodeError)?.code || '').toLowerCase();
    if (code === 'permission-denied') return true;
  }
  const message = extractMessage(error).toLowerCase();
  return (
    message.includes('missing or insufficient permissions')
    || message.includes('permission denied')
    || message.includes('insufficient permissions')
  );
}

export function createReportDuplicateError(): Error {
  const error = new Error(REPORT_DUPLICATE_MESSAGE) as MaybeCodeError;
  error.code = REPORT_DUPLICATE_ERROR_CODE;
  return error;
}

export function isReportDuplicateError(error: unknown): boolean {
  const code = (error as MaybeCodeError | undefined)?.code || '';
  if (code === REPORT_DUPLICATE_ERROR_CODE) return true;
  const message = extractMessage(error);
  return message === REPORT_DUPLICATE_MESSAGE || message === INJECTION_REPORT_DUPLICATE_MESSAGE;
}

export function getReportDuplicateMessage(error: unknown, fallbackMessage: string): string {
  if (isReportDuplicateError(error)) return REPORT_DUPLICATE_MESSAGE;
  if (error != null && isFirestorePermissionDenied(error)) return REPORT_FIRESTORE_PERMISSION_DENIED_AR;
  const message = extractMessage(error);
  return message || fallbackMessage;
}
