import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { usePermission } from '@/utils/permissions';
import { defaultTenantSlug, withTenantPath } from '@/lib/tenantPaths';
import { AdminDashboard } from './AdminDashboard';
import { Dashboard } from './Dashboard';
import { EmployeeDashboard } from './EmployeeDashboard';
import { FactoryManagerDashboard } from './FactoryManagerDashboard';

/**
 * Single `/` home: renders the same dashboard components as before, chosen by
 * permission priority (matches former getHomeRoute order).
 * Users with only online dispatch access (no admin/factory/employee home) go to `/online`.
 */
export const HomeDashboardRouter: React.FC = () => {
  const { can } = usePermission();
  const { tenantSlug: tenantSlugParam } = useParams<{ tenantSlug: string }>();
  const tenantSlug = tenantSlugParam || defaultTenantSlug();

  if (can('adminDashboard.view')) return <AdminDashboard />;
  if (can('factoryDashboard.view')) return <FactoryManagerDashboard />;
  if (can('employeeDashboard.view')) return <EmployeeDashboard />;
  if (can('onlineDispatch.view')) {
    return <Navigate to={withTenantPath(tenantSlug, '/online')} replace />;
  }
  return <Dashboard />;
};
