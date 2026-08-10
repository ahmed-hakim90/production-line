/** Public product brand — keep splash, auth, landing, and PWA names in sync. */
export const PRODUCT_BRAND = {
  name: 'ForgeOps',
  /** Short line under copyright / PWA full name */
  systemLine: 'ForgeOps',
  /**
   * Fixed public splash / auth branding panel color.
   * Never follows tenant theme — avoids green/purple flicker across boot and login.
   */
  splashHex: '#2D6255',
  splashDarkHex: '#234F45',
  splashLightHex: '#3A7868',
} as const;
