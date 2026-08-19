import React, { Suspense, useMemo } from 'react';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { lazyNamed } from '../../shared/routes/lazyNamed';
import { resolvePortalKind, shouldUseSupervisorDashboard } from '../lib/portalHome';

const AdminDashboard = lazyNamed(() => import('./AdminDashboard'), 'AdminDashboard');
const Dashboard = lazyNamed(() => import('./Dashboard'), 'Dashboard');
const EmployeeDashboard = lazyNamed(() => import('./EmployeeDashboard'), 'EmployeeDashboard');
const SupervisorDashboard = lazyNamed(
  () => import('./SupervisorDashboard'),
  'SupervisorDashboard',
);
const FactoryManagerDashboard = lazyNamed(
  () => import('./FactoryManagerDashboard'),
  'FactoryManagerDashboard',
);
const WarehouseManagerHome = lazyNamed(
  () => import('./WarehouseManagerHome'),
  'WarehouseManagerHome',
);
const RepairDashboard = lazyNamed(
  () => import('../../repair/pages/RepairDashboard'),
  'RepairDashboard',
);
const RepairTechnicianHome = lazyNamed(
  () => import('../../repair/pages/RepairTechnicianHome'),
  'RepairTechnicianHome',
);
const PackagingControl = lazyNamed(
  () => import('../../production/pages/PackagingControl'),
  'PackagingControl',
);

/**
 * Single `/` home: role-based portal shell
 * (admin / factory / employee / warehouse / repair / repair technician / generic).
 */
export const HomeDashboardRouter: React.FC = () => {
  const { can } = usePermission();
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const userProfile = useAppStore((s) => s.userProfile);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const roleKey = useMemo(
    () => roles.find((r) => r.id === userRoleId)?.roleKey || null,
    [roles, userRoleId],
  );
  const userRoleName = useAppStore((s) => s.userRoleName);

  const portal = resolvePortalKind({
    can,
    roleKey,
    roleName: userRoleName,
    inventoryWarehouseId: userProfile?.inventoryWarehouseId,
  });

  const useSupervisorDashboard = shouldUseSupervisorDashboard(
    { can },
    currentEmployee?.level,
  );

  let body: React.ReactNode = <Dashboard />;
  if (portal === 'admin') body = <AdminDashboard />;
  else if (portal === 'factory_manager') body = <FactoryManagerDashboard />;
  else if (portal === 'employee') {
    body = useSupervisorDashboard ? <SupervisorDashboard /> : <EmployeeDashboard />;
  } else if (portal === 'packaging') body = <PackagingControl />;
  else if (portal === 'warehouse_manager') body = <WarehouseManagerHome />;
  else if (portal === 'repair') body = <RepairDashboard />;
  else if (portal === 'repair_technician') body = <RepairTechnicianHome />;

  return (
    <Suspense fallback={<PageContentSkeleton variant="dashboard" kpiCount={4} />}>
      {body}
    </Suspense>
  );
};
