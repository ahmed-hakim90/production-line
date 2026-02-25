import type { AppRouteDef } from '../../shared/routes';
import { RolesManagement } from '../pages/RolesManagement';
import { ActivityLogPage } from '../pages/ActivityLog';
import { Settings } from '../pages/Settings';

export const SYSTEM_ROUTES: AppRouteDef[] = [
  { path: '/roles', permission: 'roles.manage', component: RolesManagement },
  { path: '/activity-log', permission: 'activityLog.view', component: ActivityLogPage },
  { path: '/settings', permission: 'settings.view', component: Settings },
];
