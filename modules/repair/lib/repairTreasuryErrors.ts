/** User-safe Arabic mapping for repair treasury Firestore / tenant failures. */

export const REPAIR_TREASURY_INDEX_HINT =
  'مطلوب نشر فهارس خزينة الصيانة (tenantId + branchId). انشر فهارس Firestore ثم أعد المحاولة.';

export const REPAIR_TREASURY_PERMISSION_HINT =
  'ليس لديك صلاحية للوصول إلى خزينة الصيانة.';

export const REPAIR_TREASURY_TENANT_HINT =
  'سياق الشركة غير جاهز — أعد تحميل الصفحة.';

/**
 * Maps treasury query/mutation failures to operator-safe Arabic messages.
 * Never returns Firebase console index URLs or provider stack text.
 */
export function toRepairTreasuryErrorMessage(error: unknown, fallback: string): string {
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  const message = String((error as { message?: unknown })?.message || '').trim();
  const lower = message.toLowerCase();

  if (/tenant context not initiali[sz]ed/i.test(message)) {
    return REPAIR_TREASURY_TENANT_HINT;
  }
  if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(message)) {
    return REPAIR_TREASURY_PERMISSION_HINT;
  }
  if (
    code.includes('failed-precondition')
    || /requires an index/i.test(lower)
    || /index is currently building/i.test(lower)
  ) {
    return REPAIR_TREASURY_INDEX_HINT;
  }
  if (message && !/firebase|firestore|https?:\/\//i.test(message)) {
    return message;
  }
  return fallback;
}
