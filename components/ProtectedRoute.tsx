import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { tenantLoginPath } from '../lib/tenantPaths';
import { useAppStore } from '../store/useAppStore';
import { usePermission, type Permission } from '../utils/permissions';

interface ProtectedRouteProps {
  permission: Permission;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permission, children }) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { can } = usePermission();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();

  if (!isAuthenticated) {
    return <Navigate to={tenantLoginPath(tenantSlug)} replace />;
  }

  if (!can(permission)) {
    return <Navigate to={tenantSlug ? `/t/${tenantSlug}/` : '/'} replace />;
  }

  return <>{children}</>;
};
