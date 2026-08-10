import React, { useLayoutEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContentSkeleton, type PageSkeletonVariant } from './pageSkeletons';
import { SidebarSkeleton } from './SidebarSkeleton';
import { TopbarSkeleton } from './TopbarSkeleton';
import { resolvePageSkeletonVariant } from '@/lib/routeSkeletonMap';
import { routeSkeletonMap } from '@/lib/routeSkeletonRegistry';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { SidebarProvider, useSidebar } from '@/src/shared/ui/layout/useSidebar';
import { dismissHtmlSplash } from '@/lib/dismissHtmlSplash';
import { cn } from '@/lib/utils';

export type AppShellSkeletonProps = {
  variant?: PageSkeletonVariant;
  className?: string;
};

function AppShellSkeletonInner({ variant: variantOverride, className }: AppShellSkeletonProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isRTL } = useAppDirection();
  const { collapsed } = useSidebar();
  const variant = useMemo(
    () => resolvePageSkeletonVariant(pathname, routeSkeletonMap, variantOverride),
    [pathname, variantOverride],
  );

  useLayoutEffect(() => {
    dismissHtmlSplash();
  }, []);

  const contentMargin = isRTL
    ? (collapsed ? 'lg:mr-[52px]' : 'lg:mr-[260px]')
    : (collapsed ? 'lg:ml-[52px]' : 'lg:ml-[260px]');

  return (
    <div
      className={cn(
        'flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-x-hidden',
        className,
      )}
      aria-busy="true"
      aria-label={t('ui.loadingPageContent')}
    >
      <SidebarSkeleton collapsed={collapsed} />

      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 overflow-x-hidden',
          'transition-[margin] duration-300 ease-in-out',
          contentMargin,
        )}
      >
        <TopbarSkeleton />

        <main className="flex-1 pt-[52px] pb-[72px] lg:pb-0" tabIndex={-1}>
          <div
            className="mx-auto w-full px-4 sm:px-5"
            style={{
              maxWidth: 'min(100%, 1280px)',
              paddingTop: 'var(--layout-main-padding-y, 1rem)',
              paddingBottom: 'var(--layout-main-padding-y, 1rem)',
            }}
          >
            <PageContentSkeleton variant={variant} bare />
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Full app chrome skeleton: sidebar + topbar + page content stay in layout positions.
 * Use when Layout cannot mount yet — never the branded splash screens.
 */
export function AppShellSkeleton(props: AppShellSkeletonProps) {
  return (
    <SidebarProvider>
      <AppShellSkeletonInner {...props} />
    </SidebarProvider>
  );
}
