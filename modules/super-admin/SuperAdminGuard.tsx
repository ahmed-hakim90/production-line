import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuthUiSlice } from '../../store/selectors';
import { AppShellSkeleton } from '../../src/shared/ui/skeletons';
import { AccessDeniedPanel } from '../../components/system-ui/AccessDeniedPanel';
import { tenantHomePath } from '../../lib/tenantPaths';

export const SuperAdminGuard: React.FC = () => {
  const { isAuthenticated, loading } = useAuthUiSlice();
  const isSuperAdmin = useAppStore((s) => Boolean(s.userProfile?.isSuperAdmin));

  if (loading) {
    return <AppShellSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    return (
      <AccessDeniedPanel
        title="ليس لديك صلاحية الوصول"
        description="لوحة المشرف العام مخصصة لحسابات المشرفين على المنصة فقط. يمكنك العودة إلى لوحة تحكم شركتك."
        homeHref={tenantHomePath()}
      />
    );
  }

  return <Outlet />;
};
