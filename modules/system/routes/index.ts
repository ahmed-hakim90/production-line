import type { AppRouteDef } from '../../shared/routes';
import { RolesManagement } from '../pages/RolesManagement';
import { ActivityLogPage } from '../pages/ActivityLog';
import { Settings } from '../pages/Settings';
import { UsersManagement } from '../pages/UsersManagement';

export const SYSTEM_ROUTES: AppRouteDef[] = [
  { path: '/system/users', permission: 'users.manage', component: UsersManagement },
  { path: '/roles', permission: 'roles.manage', component: RolesManagement },
  { path: '/activity-log', permission: 'activityLog.view', component: ActivityLogPage },
  { path: '/settings', permission: 'settings.view', component: Settings },
];
