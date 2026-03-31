import React from 'react';
import { usePermission } from '@/utils/permissions';
import { AdminDashboard } from './AdminDashboard';
import { Dashboard } from './Dashboard';
import { EmployeeDashboard } from './EmployeeDashboard';
import { FactoryManagerDashboard } from './FactoryManagerDashboard';

/**
 * Single `/` home: renders the same dashboard components as before, chosen by
 * permission priority (matches former getHomeRoute order).
 */
export const HomeDashboardRouter: React.FC = () => {
  const { can } = usePermission();

  if (can('adminDashboard.view')) return <AdminDashboard />;
  if (can('factoryDashboard.view')) return <FactoryManagerDashboard />;
  if (can('employeeDashboard.view')) return <EmployeeDashboard />;
  return <Dashboard />;
};
