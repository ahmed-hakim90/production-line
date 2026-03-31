import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const RolesManagement = lazyNamed(() => import('../pages/RolesManagement'), 'RolesManagement');
const OperationsMonitorPage = lazyNamed(() => import('../pages/OperationsMonitor'), 'OperationsMonitorPage');
const Settings = lazyNamed(() => import('../pages/Settings'), 'Settings');
const UsersManagement = lazyNamed(() => import('../pages/UsersManagement'), 'UsersManagement');
const ImageExportShowcase = lazyNamed(() => import('../pages/ImageExportShowcase'), 'ImageExportShowcase');

export const SYSTEM_ROUTES: AppRouteDef[] = [
  { path: '/system/users', permission: 'users.manage', component: UsersManagement },
  { path: '/roles', permission: 'roles.manage', component: RolesManagement },
  { path: '/activity-log', permission: 'activityLog.view', component: OperationsMonitorPage },
  { path: '/operations-monitor', redirectTo: '/activity-log' },
  { path: '/settings', permission: 'settings.view', component: Settings },
  { path: '/dev/image-export', permission: 'dashboard.view', component: ImageExportShowcase },
];
