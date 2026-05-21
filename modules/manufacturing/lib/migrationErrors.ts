const PERMISSION_PATTERNS = [
  'missing or insufficient permissions',
  'permission denied',
  'permission-denied',
  'insufficient permissions',
];

export function isFirestorePermissionDenied(error: unknown): boolean {
  if (error != null && typeof error === 'object') {
    const code = String((error as { code?: string }).code || '').toLowerCase();
    if (code === 'permission-denied') return true;
  }
  const message = String((error as Error)?.message || error || '').toLowerCase();
  return PERMISSION_PATTERNS.some((p) => message.includes(p));
}

export const MIGRATION_PERMISSION_DENIED_AR =
  'رفض Firestore للصلاحية. شغّل: npm run compose:firestore-rules ثم انشر القواعد (firebase deploy --only firestore:rules)، وتأكد أن دورك يملك materials.manage أو inventory.items.manage.';

export function formatMigrationError(error: unknown): string {
  if (isFirestorePermissionDenied(error)) return MIGRATION_PERMISSION_DENIED_AR;
  return error instanceof Error ? error.message : 'فشل الترحيل';
}
