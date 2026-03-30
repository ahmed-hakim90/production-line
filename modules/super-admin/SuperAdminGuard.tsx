import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuthUiSlice } from '../../store/selectors';

const defaultTenantLogin = () =>
  `/t/${import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'default'}/login`;

export const SuperAdminGuard: React.FC = () => {
  const { isAuthenticated, loading } = useAuthUiSlice();
  const isSuperAdmin = useAppStore((s) => Boolean(s.userProfile?.isSuperAdmin));

  if (loading) {
    return (
      <div className="erp-auth-page" dir="rtl">
        <p className="text-center text-[var(--color-text-muted)]">جاري التحميل...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={defaultTenantLogin()} replace />;
  }

  if (!isSuperAdmin) {
    return (
      <div className="erp-auth-page" dir="rtl">
        <div className="erp-auth-card" style={{ maxWidth: 440, margin: '2rem auto' }}>
          <p className="text-center text-rose-600 font-semibold">ليس لديك صلاحية الوصول إلى لوحة المشرف العام.</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
