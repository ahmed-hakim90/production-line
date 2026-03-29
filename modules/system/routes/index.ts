import type { AppRouteDef } from '../../shared/routes';
import { RolesManagement } from '../pages/RolesManagement';
import { OperationsMonitorPage } from '../pages/OperationsMonitor';
import { Settings } from '../pages/Settings';
import { UsersManagement } from '../pages/UsersManagement';
import { ImageExportShowcase } from '../pages/ImageExportShowcase';

export const SYSTEM_ROUTES: AppRouteDef[] = [
  { path: '/system/users', permission: 'users.manage', component: UsersManagement },
  { path: '/roles', permission: 'roles.manage', component: RolesManagement },
  { path: '/activity-log', permission: 'activityLog.view', component: OperationsMonitorPage },
  { path: '/operations-monitor', redirectTo: '/activity-log' },
  { path: '/settings', permission: 'settings.view', component: Settings },
  { path: '/dev/image-export', permission: 'dashboard.view', component: ImageExportShowcase },
];
