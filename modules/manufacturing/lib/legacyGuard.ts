export const LEGACY_MANUFACTURING_READONLY =
  'تم الانتقال إلى نظام المواد والـ BOM الجديد. استخدم صفحة المواد التصنيعية.';

export function assertManufacturingWriteAllowed(): void {
  throw new Error(LEGACY_MANUFACTURING_READONLY);
}
