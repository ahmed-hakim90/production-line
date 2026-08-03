import React, { Suspense } from 'react';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { usePermission } from '@/utils/permissions';
import { lazyNamed } from '../../shared/routes/lazyNamed';
import { resolvePortalKind } from '../lib/portalHome';

const AdminDashboard = lazyNamed(() => import('./AdminDashboard'), 'AdminDashboard');
const Dashboard = lazyNamed(() => import('./Dashboard'), 'Dashboard');
const EmployeeDashboard = lazyNamed(() => import('./EmployeeDashboard'), 'EmployeeDashboard');
const FactoryManagerDashboard = lazyNamed(
  () => import('./FactoryManagerDashboard'),
  'FactoryManagerDashboard',
);

/**
 * Single `/` home: role-based portal shell (admin / factory / employee / generic).
 * Each portal dashboard is code-split so unused shells are not in the initial chunk.
 */
export const HomeDashboardRouter: React.FC = () => {
  const { can } = usePermission();
  const portal = resolvePortalKind({ can });

  let body: React.ReactNode = <Dashboard />;
  if (portal === 'admin') body = <AdminDashboard />;
  else if (portal === 'factory_manager') body = <FactoryManagerDashboard />;
  else if (portal === 'employee') body = <EmployeeDashboard />;

  return (
    <Suspense fallback={<PageContentSkeleton variant="dashboard" kpiCount={4} />}>
      {body}
    </Suspense>
  );
};
