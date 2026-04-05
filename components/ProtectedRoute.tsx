import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { tenantLoginPath } from '../lib/tenantPaths';
import { useAppStore } from '../store/useAppStore';
import { usePermission, type Permission } from '../utils/permissions';

interface ProtectedRouteProps {
  permission?: Permission;
  permissionsAny?: Permission[];
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permission, permissionsAny, children }) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { can } = usePermission();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();

  if (!isAuthenticated) {
    return <Navigate to={tenantLoginPath(tenantSlug)} replace />;
  }

  const allowed =
    permissionsAny && permissionsAny.length > 0
      ? permissionsAny.some((p) => can(p))
      : permission
        ? can(permission)
        : false;

  if (!allowed) {
    return <Navigate to={tenantSlug ? `/t/${tenantSlug}/` : '/'} replace />;
  }

  return <>{children}</>;
};
