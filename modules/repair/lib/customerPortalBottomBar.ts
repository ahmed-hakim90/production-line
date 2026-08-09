export type CustomerPortalTab = 'compose' | 'requests' | 'timeline' | 'profile';

export type CustomerPortalBottomBarItem = {
  key: CustomerPortalTab;
  label: string;
  /** Elevated primary action (طلب جديد). */
  primary?: boolean;
};

/** Fixed customer-portal chrome — always the same four destinations after login. */
export const CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS: readonly CustomerPortalBottomBarItem[] = [
  { key: 'requests', label: 'طلباتي' },
  { key: 'compose', label: 'طلب جديد', primary: true },
  { key: 'timeline', label: 'التحديثات' },
  { key: 'profile', label: 'ملفي' },
] as const;

export function isCustomerPortalTab(value: string): value is CustomerPortalTab {
  return CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS.some((item) => item.key === value);
}
