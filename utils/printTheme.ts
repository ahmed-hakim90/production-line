import type { PrintTemplateSettings, PrintThemePreset } from '../types';
import { DEFAULT_THEME } from './dashboardConfig';
import { resolveImageExportPalette } from './imageExportTheme';

export interface PrintThemePalette {
  preset: PrintThemePreset;
  primary: string;
  text: string;
  mutedText: string;
  border: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  tableRowAltBg: string;
  success: string;
  warning: string;
  danger: string;
}

const PRESET_PALETTES: Record<PrintThemePreset, Omit<PrintThemePalette, 'preset'>> = {
  // ERPNext-inspired print tone: deep blue headers, strong text contrast.
  erpnext: {
    primary: '#1f2937',
    text: '#0f172a',
    mutedText: '#334155',
    border: '#94a3b8',
    tableHeaderBg: '#e2e8f0',
    tableHeaderText: '#0f172a',
    tableRowAltBg: '#f8fafc',
    success: '#065f46',
    warning: '#92400e',
    danger: '#991b1b',
  },
  classic: {
    primary: '#1392ec',
    text: '#1e293b',
    mutedText: '#64748b',
    border: '#cbd5e1',
    tableHeaderBg: '#f1f5f9',
    tableHeaderText: '#475569',
    tableRowAltBg: '#f8fafc',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
  },
  high_contrast: {
    primary: '#0f172a',
    text: '#000000',
    mutedText: '#1f2937',
    border: '#374151',
    tableHeaderBg: '#d1d5db',
    tableHeaderText: '#000000',
    tableRowAltBg: '#f3f4f6',
    success: '#14532d',
    warning: '#92400e',
    danger: '#991b1b',
  },
  minimal: {
    primary: '#334155',
    text: '#1f2937',
    mutedText: '#6b7280',
    border: '#d1d5db',
    tableHeaderBg: '#f3f4f6',
    tableHeaderText: '#374151',
    tableRowAltBg: '#fafafa',
    success: '#166534',
    warning: '#a16207',
    danger: '#991b1b',
  },
};

export const getPrintThemePresetDefaults = (preset: PrintThemePreset): Omit<PrintThemePalette, 'preset'> => (
  PRESET_PALETTES[preset] ?? PRESET_PALETTES.erpnext
);

function readCssColor(varName: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || undefined;
}

/** UI theme colors as print fallbacks when printTemplate omits a field. */
export function readUiThemePrintFallbacks(): Partial<PrintThemePalette> {
  return {
    primary: readCssColor('--color-primary-hex') || DEFAULT_THEME.primaryColor,
    text: readCssColor('--color-text') || DEFAULT_THEME.textColor || '#0f172a',
    mutedText: readCssColor('--color-text-muted') || DEFAULT_THEME.mutedTextColor || '#64748b',
    border: readCssColor('--color-border') || '#e2e8f0',
    success: readCssColor('--color-success-hex') || DEFAULT_THEME.successColor,
    warning: readCssColor('--color-warning-hex') || DEFAULT_THEME.warningColor,
    danger: readCssColor('--color-danger-hex') || DEFAULT_THEME.dangerColor,
  };
}

/**
 * Accent for PNG / WhatsApp / print chrome:
 * printTemplate.primaryColor → live UI theme → Factory default indigo.
 */
export function resolvePrintAccentHex(printPrimary?: string | null): string {
  const raw = String(printPrimary || '').trim();
  if (raw) return resolveImageExportPalette(raw).primary;
  const ui = readCssColor('--color-primary-hex') || DEFAULT_THEME.primaryColor;
  return resolveImageExportPalette(ui).primary;
}

export const getPrintThemePalette = (settings?: PrintTemplateSettings): PrintThemePalette => {
  const preset = settings?.printThemePreset ?? 'erpnext';
  const base = getPrintThemePresetDefaults(preset);
  const ui = readUiThemePrintFallbacks();
  return {
    preset,
    primary: settings?.primaryColor || ui.primary || base.primary,
    text: settings?.textColor || ui.text || base.text,
    mutedText: settings?.mutedTextColor || ui.mutedText || base.mutedText,
    border: settings?.borderColor || ui.border || base.border,
    tableHeaderBg: settings?.tableHeaderBgColor || base.tableHeaderBg,
    tableHeaderText: settings?.tableHeaderTextColor || base.tableHeaderText,
    tableRowAltBg: settings?.tableRowAltBgColor || base.tableRowAltBg,
    success: settings?.accentSuccessColor || ui.success || base.success,
    warning: settings?.accentWarningColor || ui.warning || base.warning,
    danger: settings?.accentDangerColor || ui.danger || base.danger,
  };
};
