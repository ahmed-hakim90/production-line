import { buildThemeSettingsCssVars } from '@/core/ui-engine/theme/themeCssVars';
import { useAppStore } from '@/store/useAppStore';
import { DEFAULT_THEME } from '@/utils/dashboardConfig';
import type { UiDensityMode } from './uiDensity';

const THEME_RUNTIME_KEYS = [
  '--font-size-base',
  '--font-size-sm',
  '--font-size-xs',
  '--font-size-2xs',
  '--font-family-base',
  '--border-radius-sm',
  '--border-radius-base',
  '--border-radius-lg',
  '--border-radius-xl',
  '--radius',
  '--control-height-sm',
  '--control-height',
  '--control-height-lg',
  '--density-scale',
] as const;

/**
 * Re-apply font + control heights from saved theme when local density changes
 * (`applyUiDensity` is spacing-only).
 */
export function applyThemeTypographyForDensity(density: UiDensityMode): void {
  if (typeof document === 'undefined') return;
  const saved = useAppStore.getState().systemSettings?.theme;
  const vars = buildThemeSettingsCssVars({ ...DEFAULT_THEME, ...saved, density });
  const root = document.documentElement;
  for (const key of THEME_RUNTIME_KEYS) {
    const value = vars[key];
    if (value) root.style.setProperty(key, value);
  }
}
