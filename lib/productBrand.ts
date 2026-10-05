/** Public product brand — keep splash, auth, landing, and PWA names in sync. */
export const PRODUCT_BRAND = {
  name: 'Maghraby Group',
  /** Short line under copyright / PWA full name */
  systemLine: 'Maghraby Group',
  /** El Maghraby corporate slogan shown on the boot splash. */
  slogan: 'ثقة تكمل معاك',
  /**
   * Fixed public splash / auth branding panel color (El Maghraby red).
   * Never follows tenant theme — avoids color flicker across boot and login.
   */
  splashHex: '#C1101C',
  splashDarkHex: '#91050F',
  splashLightHex: '#ED1F26',
  /** Square red emblem — app mark, favicon, PWA source. */
  emblemSrc: '/brand/elmaghraby-emblem.png',
  /** Full red wordmark (emblem + Arabic + Latin) for light surfaces / print. */
  logoSrc: '/brand/elmaghraby-logo.png',
  /** White wordmark for the red splash / brand panels. */
  logoWhiteSrc: '/brand/elmaghraby-logo-white.png',
  icon180Src: '/icons/elmaghraby-icon-180.png',
  icon192Src: '/icons/elmaghraby-icon-192.png',
  icon512Src: '/icons/elmaghraby-icon-512.png',
  iconMaskable512Src: '/icons/elmaghraby-icon-maskable-512.png',
} as const;
