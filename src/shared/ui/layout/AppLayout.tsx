import React, { useState } from 'react';
import { SidebarProvider, useSidebar } from './useSidebar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const APP_VERSION = __APP_VERSION__;

export interface AppLayoutProps {
  children: React.ReactNode;
}

// Inner component consumes the shared sidebar context
const AppLayoutInner: React.FC<AppLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggleCollapse } = useSidebar();

  // Margin matches sidebar width: collapsed=52px icon bar, expanded=260px
  const contentMargin = collapsed ? 'lg:mr-[52px]' : 'lg:mr-[260px]';

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-x-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div
        className={[
          'flex-1 flex flex-col min-w-0 overflow-x-hidden',
          'transition-[margin] duration-300 ease-in-out',
          contentMargin,
        ].join(' ')}
      >
        <Topbar
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          onSidebarCollapseToggle={toggleCollapse}
        />

        <main className="flex-1">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-5 py-4 sm:py-5 animate-in fade-in duration-200">
            {children}
          </div>
        </main>

        <footer className="border-t border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-5 py-3 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
              © {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM —{' '}
              <span className="text-primary font-semibold">v{APP_VERSION}</span>
            </p>
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
