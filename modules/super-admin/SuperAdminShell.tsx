import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${
    isActive
      ? 'bg-[rgb(var(--color-primary)/0.12)] text-[rgb(var(--color-primary))]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-muted)]/40'
  }`;

export const SuperAdminShell: React.FC = () => (
  <div className="min-h-screen bg-[var(--color-bg)]" dir="rtl">
    <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 sm:gap-6">
      <span className="font-bold text-[var(--color-text)]">مشرف المنصة</span>
      <nav className="flex flex-wrap gap-1">
        <NavLink to="/super-admin/tenants" className={linkClass} end={false}>
          طلبات تسجيل الشركات
        </NavLink>
        <NavLink to="/super-admin/insights" className={linkClass}>
          إحصائيات الشركات واستخدام Firestore
        </NavLink>
      </nav>
    </header>
    <Outlet />
  </div>
);
