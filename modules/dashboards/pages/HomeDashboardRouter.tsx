import React from 'react';
import { usePermission } from '@/utils/permissions';
import { resolvePortalKind } from '../lib/portalHome';
import { AdminDashboard } from './AdminDashboard';
import { Dashboard } from './Dashboard';
import { EmployeeDashboard } from './EmployeeDashboard';
import { FactoryManagerDashboard } from './FactoryManagerDashboard';

/**
 * Single `/` home: role-based portal shell (admin / factory / employee / generic).
 */
export const HomeDashboardRouter: React.FC = () => {
  const { can } = usePermission();
  const portal = resolvePortalKind({ can });

  if (portal === 'admin') return <AdminDashboard />;
  if (portal === 'factory_manager') return <FactoryManagerDashboard />;
  if (portal === 'employee') return <EmployeeDashboard />;
  return <Dashboard />;
};
