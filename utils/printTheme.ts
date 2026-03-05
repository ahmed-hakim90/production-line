import type { PrintTemplateSettings, PrintThemePreset } from '../types';

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
    primary: '#1f3b74',
    text: '#1f2937',
    mutedText: '#475569',
    border: '#9aa8bf',
    tableHeaderBg: '#dbe4f2',
    tableHeaderText: '#1f2937',
    tableRowAltBg: '#f5f8fc',
    success: '#166534',
    warning: '#b45309',
    danger: '#b91c1c',
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

export const getPrintThemePalette = (settings?: PrintTemplateSettings): PrintThemePalette => {
  const preset = settings?.printThemePreset ?? 'erpnext';
  const base = getPrintThemePresetDefaults(preset);
  return {
    preset,
    primary: settings?.primaryColor || base.primary,
    text: settings?.textColor || base.text,
    mutedText: settings?.mutedTextColor || base.mutedText,
    border: settings?.borderColor || base.border,
    tableHeaderBg: settings?.tableHeaderBgColor || base.tableHeaderBg,
    tableHeaderText: settings?.tableHeaderTextColor || base.tableHeaderText,
    tableRowAltBg: settings?.tableRowAltBgColor || base.tableRowAltBg,
    success: settings?.accentSuccessColor || base.success,
    warning: settings?.accentWarningColor || base.warning,
    danger: settings?.accentDangerColor || base.danger,
  };
};

