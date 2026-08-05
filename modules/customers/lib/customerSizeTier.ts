/** عتبات حجم الشغل لتصنيف العميل — قابلة للتعديل لاحقاً من الإعدادات */
export const CUSTOMER_SIZE_TIER_THRESHOLDS = {
  /** أقل من هذا = صغير */
  mediumMin: 50_000,
  /** من هذا فأعلى = كبير */
  largeMin: 200_000,
} as const;

export type CustomerSizeTier = 'large' | 'medium' | 'small' | 'unclassified';

export const CUSTOMER_SIZE_TIER_LABELS: Record<CustomerSizeTier, string> = {
  large: 'كبير',
  medium: 'متوسط',
  small: 'صغير',
  unclassified: 'غير مصنّف',
};

export const CUSTOMER_SIZE_TIER_OPTIONS: Array<{ value: CustomerSizeTier; label: string }> = [
  { value: 'large', label: CUSTOMER_SIZE_TIER_LABELS.large },
  { value: 'medium', label: CUSTOMER_SIZE_TIER_LABELS.medium },
  { value: 'small', label: CUSTOMER_SIZE_TIER_LABELS.small },
  { value: 'unclassified', label: CUSTOMER_SIZE_TIER_LABELS.unclassified },
];

export function isCustomerSizeTier(value: unknown): value is CustomerSizeTier {
  return value === 'large' || value === 'medium' || value === 'small' || value === 'unclassified';
}

/**
 * يصنّف العميل حسب حجم الشغل.
 * حجم غير معرّف / غير صالح → unclassified.
 */
export function classifyCustomerSizeTier(businessVolume: number | null | undefined): CustomerSizeTier {
  if (businessVolume == null || !Number.isFinite(businessVolume) || businessVolume < 0) {
    return 'unclassified';
  }
  if (businessVolume >= CUSTOMER_SIZE_TIER_THRESHOLDS.largeMin) return 'large';
  if (businessVolume >= CUSTOMER_SIZE_TIER_THRESHOLDS.mediumMin) return 'medium';
  return 'small';
}
