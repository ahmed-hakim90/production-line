import type { ThemeSettings } from '@/types';
import { DEFAULT_THEME, resolveUiFontFamily } from '@/utils/dashboardConfig';

export type ThemePresetForCss = 'indigo-pro' | 'light' | 'dark' | 'factory' | 'custom';

export function toRgbChannels(color: string, fallback = '79 70 229'): string {
  const value = color.trim();
  if (!value) return fallback;

  if (/^\d+\s+\d+\s+\d+$/.test(value)) return value;

  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[\da-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }
  if (/^[\da-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `${r} ${g} ${b}`;
  }

  const rgbMatch = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) return `${rgbMatch[1]} ${rgbMatch[2]} ${rgbMatch[3]}`;

  return fallback;
}

/**
 * Pure CSS custom-property map from ThemeSettings (testable without DOM / Firebase).
 */
export function buildThemeSettingsCssVars(
  settings: ThemeSettings,
  tenantPreset: ThemePresetForCss = 'custom',
): Record<string, string> {
  const t = { ...DEFAULT_THEME, ...settings };
  const densityFactor = t.density === 'compact' ? 0.92 : 1;
  const fs = Math.max(10, Math.round(t.baseFontSize * densityFactor));
  const br = Math.max(0, Number(t.borderRadius ?? 6));
  const radiusSm = br === 0 ? 0 : Math.max(2, Math.round(br * 0.6));
  const radiusLg = br === 0 ? 0 : Math.round(br * 1.4);
  const radiusXl = br === 0 ? 0 : Math.round(br * 2);
  const muted =
    t.mutedTextColor
    || (tenantPreset === 'dark' ? '#94a3b8' : '#64748b');
  const cw = (t.contentMaxWidth ?? DEFAULT_THEME.contentMaxWidth ?? '1536px').trim();
  const uiFont = resolveUiFontFamily(t.baseFontFamily);
  const fontStack = `'${uiFont}', 'Noto Sans Arabic', sans-serif`;
  /** Scale toolbar/input/header-action heights with base font so settings affect buttons, not only body text. */
  const controlScale = (fs / 14) * densityFactor;
  const controlSm = Math.max(28, Math.round(34 * controlScale));
  const controlMd = Math.max(32, Math.round(38 * controlScale));
  const controlLg = Math.max(36, Math.round(42 * controlScale));

  const vars: Record<string, string> = {
    '--color-secondary': toRgbChannels(t.secondaryColor),
    '--color-success': toRgbChannels(t.successColor),
    '--color-warning': toRgbChannels(t.warningColor),
    '--color-danger': toRgbChannels(t.dangerColor),
    '--color-secondary-hex': t.secondaryColor,
    '--color-success-hex': t.successColor,
    '--color-warning-hex': t.warningColor,
    '--color-danger-hex': t.dangerColor,
    '--color-text-muted': muted,
    '--font-family-base': fontStack,
    '--font-size-base': `${fs}px`,
    '--font-size-sm': `${Math.max(10, fs - 1)}px`,
    '--font-size-xs': `${Math.max(10, fs - 2)}px`,
    '--font-size-2xs': `${Math.max(9, fs - 3)}px`,
    '--border-radius-sm': `${radiusSm}px`,
    '--border-radius-base': `${br}px`,
    '--border-radius-lg': `${radiusLg}px`,
    '--border-radius-xl': `${radiusXl}px`,
    /** shadcn / legacy token — kept in sync with محرك المظهر */
    '--radius': `${br}px`,
    '--control-height-sm': `${controlSm}px`,
    '--control-height': `${controlMd}px`,
    '--control-height-lg': `${controlLg}px`,
    '--density-scale': t.density === 'compact' ? '0.92' : '1',
    '--content-max-width': cw,
  };

  if (t.cssVars) {
    Object.entries(t.cssVars).forEach(([key, value]) => {
      // Never let a stale `--radius` in cssVars override ThemeSettings.borderRadius.
      if (key === '--radius') return;
      vars[key] = value;
    });
  }
  return vars;
}
