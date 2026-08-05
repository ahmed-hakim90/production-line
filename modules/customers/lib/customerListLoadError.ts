import { getCurrentTenantIdOrNull } from '@/lib/currentTenant';

export const CUSTOMER_LIST_LOAD_FALLBACK = 'تعذر تحميل العملاء.';

const INDEX_HINT =
  'مطلوب نشر فهرس العملاء (tenantId + code). انشر فهارس Firestore أو افتح رابط الفهرس من كونسول Firebase ثم أعد المحاولة.';

const PERMISSION_HINT = 'ليس لديك صلاحية قراءة العملاء.';

const TENANT_HINT = 'سياق الشركة غير جاهز — أعد تحميل الصفحة.';

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return String((error as { code?: unknown }).code || '').toLowerCase();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  return String(error || '');
}

/**
 * Maps Firestore / tenant failures from customer list queries to a safe Arabic message.
 * Does not expose stack traces, index URLs with tokens, or provider internals beyond the known index hint.
 */
export function toCustomerListLoadErrorMessage(
  error: unknown,
  fallback: string = CUSTOMER_LIST_LOAD_FALLBACK,
): string {
  const code = errorCode(error);
  const text = errorMessage(error);
  const lower = text.toLowerCase();

  if (
    /tenant context not initialised/i.test(text)
    || /tenant context not initialized/i.test(text)
  ) {
    return TENANT_HINT;
  }

  if (
    code.includes('permission-denied')
    || /missing or insufficient permissions/i.test(text)
  ) {
    return PERMISSION_HINT;
  }

  if (
    code.includes('failed-precondition')
    || /requires an index/i.test(lower)
    || /index is currently building/i.test(lower)
    || /the query requires an index/i.test(lower)
  ) {
    return INDEX_HINT;
  }

  // Known Arabic messages from our own throws — keep as-is when already user-safe.
  if (text === TENANT_HINT || text === PERMISSION_HINT || text === INDEX_HINT) {
    return text;
  }

  return fallback;
}

export type WaitForTenantOptions = {
  /** Total attempts including the first immediate check. */
  attempts?: number;
  /** Delay between attempts in ms. */
  delayMs?: number;
};

/**
 * Waits briefly for tenant context before list queries.
 * Returns the tenant id, or null if still unset after retries.
 */
export async function waitForTenantId(
  opts?: WaitForTenantOptions,
): Promise<string | null> {
  const attempts = Math.max(1, Math.floor(opts?.attempts ?? 8));
  const delayMs = Math.max(0, Math.floor(opts?.delayMs ?? 50));

  for (let i = 0; i < attempts; i += 1) {
    const id = getCurrentTenantIdOrNull();
    if (id) return id;
    if (i < attempts - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return getCurrentTenantIdOrNull();
}
