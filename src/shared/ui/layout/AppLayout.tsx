import React, { useState } from 'react';
import { SidebarProvider, useSidebar } from './useSidebar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { PageBackProvider } from './PageBackContext';
import { GlobalBackgroundJobs } from '@/components/background-jobs/GlobalBackgroundJobs';
import { usePermission } from '@/utils/permissions';
import { PageShell } from '@/src/shared/ui/layout/PageShell';

const APP_VERSION = __APP_VERSION__;

export interface AppLayoutProps {
  children: React.ReactNode;
}

// Inner component consumes the shared sidebar context
const AppLayoutInner: React.FC<AppLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggleCollapse } = useSidebar();
  const { canViewActivityLog } = usePermission();

  // Margin matches sidebar width: collapsed=52px icon bar, expanded=260px
  const contentMargin = collapsed ? 'lg:mr-[52px]' : 'lg:mr-[260px]';

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-x-hidden">
      <a
        href="#main-content"
        className="absolute start-4 top-0 z-[100] -translate-y-[150%] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] shadow-md transition-transform focus:translate-y-4 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      >
        تخطي إلى المحتوى الرئيسي
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div
        className={[
          'flex-1 flex flex-col min-w-0 overflow-x-hidden',
          'transition-[margin] duration-300 ease-in-out',
          contentMargin,
        ].join(' ')}
      >
        <PageBackProvider>
          <Topbar
            onMenuToggle={() => setSidebarOpen((o) => !o)}
            onSidebarCollapseToggle={toggleCollapse}
          />

          <main id="main-content" className="flex-1 pt-[52px]" tabIndex={-1}>
            <div
              className="max-w-screen-2xl mx-auto px-4 sm:px-5 animate-in fade-in duration-200"
              style={{
                paddingTop: 'var(--layout-main-padding-y, 1rem)',
                paddingBottom: 'var(--layout-main-padding-y, 1rem)',
              }}
            >
              <PageShell>{children}</PageShell>
            </div>
          </main>

          <footer className="border-t border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-5 py-3 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-center sm:text-start">
                <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                  © {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM —{' '}
                  <span className="text-primary font-semibold">v{APP_VERSION}</span>
                </p>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  تطوير بواسطة{' '}
                  <a
                    href="https://hakimo-cv.vercel.app/hakimo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline underline-offset-2"
                    dir="ltr"
                  >
                    Ahmed Abdulhakim
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)]">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span>قاعدة البيانات</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <span>Firestore نشط</span>
                </div>
              </div>
            </div>
          </footer>

          {/* Global jobs panel/history mounted once for the full app layout */}
          {canViewActivityLog && <GlobalBackgroundJobs />}
        </PageBackProvider>
      </div>
    </div>
  );
};

// Outer component provides shared sidebar context to the entire layout tree
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => (
  <SidebarProvider>
    <AppLayoutInner>{children}</AppLayoutInner>
  </SidebarProvider>
);
