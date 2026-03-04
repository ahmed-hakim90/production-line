export const REPORT_DUPLICATE_ERROR_CODE = 'report/duplicate';
export const REPORT_DUPLICATE_MESSAGE = 'هذا التقرير مسجل من قبل لنفس اليوم والخط والمشرف والمنتج';

type MaybeCodeError = Error & { code?: string };

const extractMessage = (error: unknown): string => {
  if (typeof error === 'string') return error.trim();
  return String((error as MaybeCodeError | undefined)?.message || '').trim();
};

export function createReportDuplicateError(): Error {
  const error = new Error(REPORT_DUPLICATE_MESSAGE) as MaybeCodeError;
  error.code = REPORT_DUPLICATE_ERROR_CODE;
  return error;
}

export function isReportDuplicateError(error: unknown): boolean {
  const code = (error as MaybeCodeError | undefined)?.code || '';
  if (code === REPORT_DUPLICATE_ERROR_CODE) return true;
  const message = extractMessage(error);
  return message === REPORT_DUPLICATE_MESSAGE;
}

export function getReportDuplicateMessage(error: unknown, fallbackMessage: string): string {
  if (isReportDuplicateError(error)) return REPORT_DUPLICATE_MESSAGE;
  const message = extractMessage(error);
  return message || fallbackMessage;
}
