import React, { useState } from 'react';
import { useSidebar } from './useSidebar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { GlobalBackgroundJobs } from '@/components/background-jobs/GlobalBackgroundJobs';

const APP_VERSION = __APP_VERSION__;

export interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggleCollapse } = useSidebar();

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-x-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className={`flex-1 ${collapsed ? 'lg:mr-20' : 'lg:mr-64'} flex flex-col min-w-0 transition-all duration-300 overflow-x-hidden`}>
        <Topbar
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          onSidebarCollapseToggle={toggleCollapse}
        />

        <div className="p-4 sm:p-6 lg:p-8 flex-1 animate-in fade-in duration-500 overflow-x-hidden">
          {children}
        </div>

        <footer className="mt-auto py-4 sm:py-6 px-4 sm:px-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-xs sm:text-sm font-medium">
          <p>© {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM — v{APP_VERSION}</p>
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span>قاعدة البيانات مستقرة</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(19,146,236,0.5)]" />
              <span>Firestore نشط</span>
            </div>
          </div>
        </footer>

        <GlobalBackgroundJobs />
      </main>
    </div>
  );
};
