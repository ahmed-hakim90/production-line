import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarProvider, useSidebar } from './useSidebar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileBottomBar } from './MobileBottomBar';
import { RepairMobileBottomBar } from './RepairMobileBottomBar';
import { isRepairWorkshopFocusPath, shouldShowRepairBottomBar } from './repairBottomBar';
import { PageBackProvider } from './PageBackContext';
import { GlobalBackgroundJobs } from '@/components/background-jobs/GlobalBackgroundJobs';
import { usePermission } from '@/utils/permissions';
import { PageShell } from '@/src/shared/ui/layout/PageShell';
import { useAppStore } from '@/store/useAppStore';
import { DEFAULT_THEME } from '@/utils/dashboardConfig';
import { resolveContentMaxWidthForPath, stripTenantSegmentFromPathname } from '@/core/ui-engine/theme/tenantTheme';
import { cn } from '@/lib/utils';
import { OfflineConnectionBanner } from './OfflineConnectionBanner';
import { useOnlineStatus } from './useOnlineStatus';
import { useAppDirection } from './useAppDirection';
import { PageRouteFallback } from '@/components/PageRouteFallback';
import { SidebarSkeleton } from '@/src/shared/ui/skeletons/SidebarSkeleton';
import { TopbarSkeleton } from '@/src/shared/ui/skeletons/TopbarSkeleton';
import { AppContentRefreshProvider, useAppContentRefresh } from './AppContentRefresh';

const APP_VERSION = __APP_VERSION__;

export interface AppLayoutProps {
  children: React.ReactNode;
  /**
   * Full chrome skeletons (sidebar + topbar + content). Rare cold gates only.
   */
  shellLoading?: boolean;
  /**
   * Keep real sidebar/topbar; only main page content becomes skeleton
   * (bootstrap after hydrate, or topbar soft refresh).
   */
  contentLoading?: boolean;
}

const AppLayoutInner: React.FC<AppLayoutProps> = ({
  children,
  shellLoading = false,
  contentLoading = false,
}) => {
  const { t } = useTranslation();
  const { isRTL } = useAppDirection();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggleCollapse } = useSidebar();
  const { can, canViewActivityLog } = usePermission();
  const location = useLocation();
  const { contentRefreshing, contentKey } = useAppContentRefresh();
  const themeSettings = useAppStore((s) => s.systemSettings?.theme ?? DEFAULT_THEME);
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const inventoryWarehouseId = useAppStore((s) => s.userProfile?.inventoryWarehouseId);
  const contentMaxWidth = useMemo(
    () => resolveContentMaxWidthForPath(location.pathname, themeSettings),
    [location.pathname, themeSettings],
  );
  const repairContentTheme = useMemo(() => {
    const p = stripTenantSegmentFromPathname(location.pathname);
    return p === '/repair' || p.startsWith('/repair/');
  }, [location.pathname]);
  const workshopFocusMode = useMemo(() => {
    const p = stripTenantSegmentFromPathname(location.pathname);
    return isRepairWorkshopFocusPath(p);
  }, [location.pathname]);
  const roleKey = useMemo(
    () => roles.find((r) => r.id === userRoleId)?.roleKey || null,
    [roles, userRoleId],
  );
  const useRepairBottomBar = useMemo(
    () => shouldShowRepairBottomBar({
      can: (permission: string) => can(permission as Parameters<typeof can>[0]),
      roleKey,
      inventoryWarehouseId,
    }),
    [can, inventoryWarehouseId, roleKey],
  );
  const online = useOnlineStatus();
  const showContentSkeleton = shellLoading || contentLoading || contentRefreshing;

  const contentMargin = isRTL
    ? (collapsed ? 'lg:mr-[52px]' : 'lg:mr-[260px]')
    : (collapsed ? 'lg:ml-[52px]' : 'lg:ml-[260px]');

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-x-hidden">
      <a
        href="#main-content"
        className="absolute start-4 top-0 z-[100] -translate-y-[150%] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] shadow-md transition-transform focus:translate-y-4 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      >
        {t('layout.skipToMainContent')}
      </a>
      {shellLoading ? (
        <SidebarSkeleton collapsed={collapsed} />
      ) : (
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      <div
        className={[
          'flex-1 flex flex-col min-w-0 overflow-x-hidden',
          'transition-[margin] duration-300 ease-in-out',
          contentMargin,
        ].join(' ')}
      >
        <PageBackProvider>
          {shellLoading ? (
            <TopbarSkeleton />
          ) : (
            <Topbar
              onMenuToggle={() => setSidebarOpen((o) => !o)}
              onSidebarCollapseToggle={toggleCollapse}
            />
          )}

          <OfflineConnectionBanner online={online} />

          <main
            id="main-content"
            className={[
              'flex-1',
              online ? 'pt-[52px]' : 'pt-[calc(52px+2.75rem)]',
              workshopFocusMode ? 'pb-0' : 'pb-[72px] lg:pb-0',
            ].join(' ')}
            tabIndex={-1}
          >
            <div
              className={cn(
                'mx-auto w-full px-4 sm:px-5 animate-in fade-in duration-200',
                repairContentTheme && 'erp-repair-theme',
              )}
              style={{
                maxWidth: `min(100%, ${contentMaxWidth})`,
                paddingTop: 'var(--layout-main-padding-y, 1rem)',
                paddingBottom: 'var(--layout-main-padding-y, 1rem)',
              }}
            >
              <PageShell>
                {showContentSkeleton ? (
                  <PageRouteFallback bare />
                ) : (
                  <div key={contentKey}>{children}</div>
                )}
              </PageShell>
            </div>
          </main>

          <footer className={cn(
            'border-t border-[var(--color-border)] bg-[var(--color-card)]',
            workshopFocusMode ? 'mb-0 hidden lg:block' : 'mb-[72px] lg:mb-0',
          )}>
            <div
              className="mx-auto w-full px-4 sm:px-5 py-3 flex flex-col sm:flex-row justify-between items-center gap-3"
              style={{ maxWidth: `min(100%, ${contentMaxWidth})` }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-center sm:text-start">
                <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                  © {new Date().getFullYear()} Factory PRODUCTION SYSTEM —{' '}
                  <span className="text-primary font-semibold">v{APP_VERSION}</span>
                </p>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {t('layout.developedBy')}{' '}
                  <a
                    href="https://portfolio-hakim90.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline underline-offset-2"
                    dir="ltr"
                  >
                    Ahmed AbdulHakim
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)]">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span>{t('layout.database')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <span>{t('layout.firestoreActive')}</span>
                </div>
              </div>
            </div>
          </footer>

          {canViewActivityLog && <GlobalBackgroundJobs />}
          {useRepairBottomBar ? (
            <RepairMobileBottomBar onMoreClick={() => setSidebarOpen(true)} />
          ) : (
            <MobileBottomBar onMoreClick={() => setSidebarOpen(true)} />
          )}
        </PageBackProvider>
      </div>
    </div>
  );
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  shellLoading,
  contentLoading,
}) => (
  <SidebarProvider>
    <AppContentRefreshProvider>
      <AppLayoutInner shellLoading={shellLoading} contentLoading={contentLoading}>
        {children}
      </AppLayoutInner>
    </AppContentRefreshProvider>
  </SidebarProvider>
);
