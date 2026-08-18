import { HttpsError, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https';

const GENERIC_MESSAGE =
  /^(internal|unknown|ok|cancelled|not-found|not found|unauthenticated|permission-denied|permission denied|failed-precondition|resource-exhausted|unavailable|deadline-exceeded|invalid-argument|already-exists|aborted|out-of-range|unimplemented|data-loss)$/i;

const PROVIDER_LEAK =
  /firebase|firestore|grpc|internal assertion|missing or insufficient permissions/i;

const BUSINESS_CODES: FunctionsErrorCode[] = [
  'invalid-argument',
  'failed-precondition',
  'not-found',
  'permission-denied',
  'unauthenticated',
  'resource-exhausted',
  'aborted',
];

export const isGenericCallableMessage = (message: string): boolean => {
  const trimmed = String(message || '').trim();
  if (!trimmed) return true;
  if (trimmed.toLowerCase().startsWith('functions/')) return true;
  return GENERIC_MESSAGE.test(trimmed);
};

/** Prefer the Arabic business copy when Firestore wraps HttpsError as INTERNAL/gRPC. */
export const extractCallableBusinessMessage = (message: string): string => {
  const trimmed = String(message || '').trim();
  if (!trimmed) return '';
  const arabic = trimmed.match(/[\u0600-\u06FF][^]*[\u0600-\u06FF0-9).]/);
  if (arabic) {
    const text = arabic[0].trim();
    if (text.length >= 4 && text.length < 180) return text;
  }
  if (isGenericCallableMessage(trimmed) || PROVIDER_LEAK.test(trimmed) || trimmed.length >= 180) {
    return '';
  }
  return trimmed;
};

const resolveBusinessCode = (error: unknown, fallback: FunctionsErrorCode): FunctionsErrorCode => {
  const raw = String((error as { code?: string })?.code || '')
    .replace(/^functions\//, '')
    .toLowerCase();
  return BUSINESS_CODES.includes(raw as FunctionsErrorCode)
    ? (raw as FunctionsErrorCode)
    : fallback;
};

/**
 * Keep operator-facing HttpsError copy. Firestore transactions often wrap
 * thrown HttpsError as a generic INTERNAL — recover the Arabic message.
 */
export const toCallableUserSafeError = (error: unknown, fallback: string): HttpsError => {
  if (error instanceof HttpsError) {
    const recovered = extractCallableBusinessMessage(error.message);
    if (recovered) {
      if (error.code === 'internal' || error.code === 'unknown') {
        return new HttpsError('failed-precondition', recovered);
      }
      return error;
    }
    const code = error.code === 'internal' || error.code === 'unknown'
      ? 'failed-precondition'
      : error.code;
    return new HttpsError(code, fallback);
  }

  const recovered = extractCallableBusinessMessage(
    String((error as { message?: string })?.message || ''),
  );
  if (recovered) {
    return new HttpsError(resolveBusinessCode(error, 'failed-precondition'), recovered);
  }
  return new HttpsError('failed-precondition', fallback);
};

export const wrapCallableUserSafe = <T>(
  fallback: string,
  handler: (request: CallableRequest) => Promise<T>,
) => async (request: CallableRequest): Promise<T> => {
  try {
    return await handler(request);
  } catch (error: unknown) {
    throw toCallableUserSafeError(error, fallback);
  }
};
