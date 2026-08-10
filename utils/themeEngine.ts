/**
 * @deprecated Prefer `applyAppTheme` from `@/core/ui-engine/theme/tenantTheme`.
 * Kept as a thin wrapper so legacy callers stay on the single theme pipeline.
 */
import type { ThemeSettings } from '../types';
import { DEFAULT_THEME } from './dashboardConfig';
import {
  applyAppTheme,
  bindAutoDarkModeListener,
  mapThemeSettingsToTenantTheme,
  mergeTenantThemeForApply,
  resolveTheme,
} from '@/core/ui-engine/theme/tenantTheme';

export function applyTheme(theme?: ThemeSettings): void {
  const settings = { ...DEFAULT_THEME, ...theme };
  const tenant = mergeTenantThemeForApply(resolveTheme(), settings);
  applyAppTheme(tenant, settings);
  bindAutoDarkModeListener(settings, () => {
    const next = mergeTenantThemeForApply(mapThemeSettingsToTenantTheme(settings), settings);
    applyAppTheme(next, settings);
  });
}

export function setupAutoThemeListener(theme?: ThemeSettings): void {
  const settings = { ...DEFAULT_THEME, ...theme };
  bindAutoDarkModeListener(settings, () => applyTheme(settings));
}
