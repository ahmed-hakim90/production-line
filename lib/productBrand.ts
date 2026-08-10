/** Public product brand — keep splash, auth, landing, and PWA names in sync. */
export const PRODUCT_BRAND = {
  name: 'ForgeOps',
  /** Short line under copyright / PWA full name */
  systemLine: 'ForgeOps',
  /**
   * Fixed public splash / auth branding panel color (ForgeOps blue).
   * Never follows tenant theme — avoids green/purple flicker across boot and login.
   */
  splashHex: '#1E4D8C',
  splashDarkHex: '#163A6B',
  splashLightHex: '#2B63B5',
} as const;
