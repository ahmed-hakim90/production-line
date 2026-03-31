import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuthUiSlice } from '../../store/selectors';
import { AuthBrandedLoadingPage } from '../../components/system-ui/AuthLoadingState';
import { AccessDeniedPanel } from '../../components/system-ui/AccessDeniedPanel';
import { tenantHomePath } from '../../lib/tenantPaths';

export const SuperAdminGuard: React.FC = () => {
  const { isAuthenticated, loading } = useAuthUiSlice();
  const isSuperAdmin = useAppStore((s) => Boolean(s.userProfile?.isSuperAdmin));

  if (loading) {
    return <AuthBrandedLoadingPage subtitle="جاري التحقق من الصلاحيات..." />;
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
