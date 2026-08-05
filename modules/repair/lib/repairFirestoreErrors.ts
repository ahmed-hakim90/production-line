/** Map Firebase/Firestore client errors to Arabic operator-safe messages. */
export function toUserSafeFirestoreError(error: unknown, fallback: string): string {
  const message = String((error as { message?: unknown })?.message || '').trim();
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(message)) {
    return 'ليس لديك صلاحية كافية لتنفيذ هذه العملية.';
  }
  if (code.includes('unauthenticated')) {
    return 'يجب تسجيل الدخول أولًا ثم إعادة المحاولة.';
  }
  if (message && !/firebase|firestore|https?:\/\//i.test(message) && !/missing or insufficient/i.test(message)) {
    return message;
  }
  return fallback;
}
