import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DEFAULT_THEME } from '@/utils/dashboardConfig';
import {
  applyAppTheme,
  applyTenantTheme,
  bindAutoDarkModeListener,
  cacheTenantTheme,
  loadTenantTheme,
  mergeTenantThemeForApply,
  readCachedTenantTheme,
  resolveTheme,
} from './tenantTheme';

export function useTenantTheme() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const userProfile = useAppStore((state) => state.userProfile);
  const systemTheme = useAppStore((state) => state.systemSettings?.theme ?? DEFAULT_THEME);

  useEffect(() => {
    let active = true;

    const reapplyAuto = () => {
      const ts = useAppStore.getState().systemSettings?.theme ?? DEFAULT_THEME;
      const tid = (useAppStore.getState().userProfile as { tenantId?: string } | null)?.tenantId;
      void loadTenantTheme(tid).then((tt) => {
        applyAppTheme(mergeTenantThemeForApply(tt, ts), ts);
        cacheTenantTheme(mergeTenantThemeForApply(tt, ts));
      });
    };

    if (!isAuthenticated) {
      bindAutoDarkModeListener(DEFAULT_THEME, () => {
        applyTenantTheme(resolveTheme(), DEFAULT_THEME);
      });
      applyTenantTheme(resolveTheme(), DEFAULT_THEME);
      return () => {
        active = false;
      };
    }

    const cachedTheme = readCachedTenantTheme();
    if (cachedTheme) {
      applyAppTheme(mergeTenantThemeForApply(cachedTheme, systemTheme), systemTheme);
    }

    bindAutoDarkModeListener(systemTheme, reapplyAuto);

    void (async () => {
      const tenantId = (userProfile as { tenantId?: string } | null)?.tenantId;
      const theme = await loadTenantTheme(tenantId);
      if (!active) return;
      const merged = mergeTenantThemeForApply(theme, systemTheme);
      applyAppTheme(merged, systemTheme);
      cacheTenantTheme(merged);
    })();

    return () => {
      active = false;
    };
  }, [isAuthenticated, userProfile, systemTheme]);
}
