import React from 'react';
import { TopNav } from './TopNav';
import { GlobalBackgroundJobs } from '@/components/background-jobs/GlobalBackgroundJobs';

const APP_VERSION = __APP_VERSION__;

export interface AppLayoutHorizontalProps {
  children: React.ReactNode;
}

/**
 * AppLayoutHorizontal
 *
 * Layout rules for sticky header to work correctly:
 *  - Root wrapper: flex flex-col min-h-screen  → no overflow, window scrolls
 *  - TopNav:       sticky top-0 z-40           → sticks to viewport on scroll
 *  - Main:         flex-1                       → no overflow-y, grows naturally
 *
 * DO NOT add overflow-hidden or overflow-y-auto to the root wrapper.
 * Scroll is handled at the window (body) level.
 */
export const AppLayoutHorizontal: React.FC<AppLayoutHorizontalProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Sticky two-row header — sticks on window scroll */}
      <TopNav />

      {/* Main content — grows to fill remaining height, window handles scroll */}
      <main className="flex-1">
        <div className="p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">
          {children}
        </div>

        <footer className="mt-8 py-4 px-6 sm:px-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-400 text-xs font-medium">
          <p className="font-mono">
            © {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM —{' '}
            <span className="text-primary font-bold">v{APP_VERSION}</span>
          </p>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              <span>قاعدة البيانات مستقرة</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              <span>Firestore نشط</span>
            </div>
          </div>
        </footer>

        <GlobalBackgroundJobs />
      </main>
    </div>
  );
};
