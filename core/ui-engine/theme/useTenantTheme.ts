import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { applyTenantTheme, loadTenantTheme, resolveTheme } from './tenantTheme';

export function useTenantTheme() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const userProfile = useAppStore((state) => state.userProfile);

  useEffect(() => {
    let active = true;

    const bootstrapTheme = async () => {
      const tenantId = (userProfile as { tenantId?: string } | null)?.tenantId;
      const theme = isAuthenticated ? await loadTenantTheme(tenantId) : resolveTheme();
      if (active) {
        applyTenantTheme(theme);
      }
    };

    void bootstrapTheme();

    return () => {
      active = false;
    };
  }, [isAuthenticated, userProfile]);
}
