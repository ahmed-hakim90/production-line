/**
 * Unified visual tokens for PNG / WhatsApp image exports (Factory report style).
 * Accent comes from print settings (or UI theme fallback via callers).
 */

export const Factory_IMAGE_PRIMARY = '#4A55A2'
export const Factory_IMAGE_PRIMARY_SOFT = '#EDEEF8'
export const Factory_IMAGE_PRIMARY_BADGE_BG = '#EEF0FA'
export const Factory_IMAGE_PRIMARY_BADGE_TEXT = '#4A55A2'
export const Factory_IMAGE_PROGRESS_TRACK = '#E8EAFF'
/** KPI accent for workers card (between quantity indigo and cost green). */
export const Factory_IMAGE_WORKERS_STRIP = '#60a5fa'

/** Default Arabic footer line (before em dash and print timestamp). */
export const Factory_DEFAULT_FOOTER_TAGLINE = 'هذا التقرير تم إنشاؤه آلياً من نظام إدارة الإنتاج'

export const Factory_TRANSFER_FOOTER_TAGLINE = 'هذا الإذن تم إنشاؤه آلياً من نظام إدارة المخزون'

/** Default Arabic footer for repair / maintenance print documents. */
export const Factory_REPAIR_FOOTER_TAGLINE = 'هذا المستند تم إنشاؤه آلياً من نظام إدارة الصيانة'

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = String(hex || '').trim();
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[\da-fA-F]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  if (/^[\da-fA-F]{3}$/.test(h)) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix hex toward white (amount 0–1). */
export function lightenHex(hex: string, amount = 0.88): string {
  const rgb = parseHex(hex);
  if (!rgb) return Factory_IMAGE_PRIMARY_SOFT;
  return toHex({
    r: rgb.r * (1 - amount) + 255 * amount,
    g: rgb.g * (1 - amount) + 255 * amount,
    b: rgb.b * (1 - amount) + 255 * amount,
  });
}

/** Mix hex toward black (amount 0–1). */
export function darkenHex(hex: string, amount = 0.22): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex || Factory_IMAGE_PRIMARY;
  return toHex({
    r: rgb.r * (1 - amount),
    g: rgb.g * (1 - amount),
    b: rgb.b * (1 - amount),
  });
}

export type ImageExportPalette = {
  primary: string;
  primarySoft: string;
  badgeBg: string;
  badgeText: string;
  progressTrack: string;
  workersStrip: string;
};

/** Build export/print accent palette from a primary hex (printTemplate or UI theme). */
export function resolveImageExportPalette(primaryHex?: string | null): ImageExportPalette {
  const candidate = String(primaryHex || '').trim();
  const withHash = candidate
    ? (candidate.startsWith('#') ? candidate : `#${candidate}`)
    : Factory_IMAGE_PRIMARY;
  const safe = parseHex(withHash) ? withHash : Factory_IMAGE_PRIMARY;
  return {
    primary: safe,
    primarySoft: lightenHex(safe, 0.9),
    badgeBg: lightenHex(safe, 0.92),
    badgeText: safe,
    progressTrack: lightenHex(safe, 0.88),
    workersStrip: lightenHex(safe, 0.45),
  };
}
