import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermission, type Permission } from '../utils/permissions';

interface ProtectedRouteProps {
  permission: Permission;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permission, children }) => {
  const can = usePermission();

  if (!can(permission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
