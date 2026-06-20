import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const RolesManagement = lazyNamed(() => import('../pages/RolesManagement'), 'RolesManagement');
const ActivityLogPage = lazyNamed(() => import('../pages/ActivityLog'), 'ActivityLogPage');
const SettingsOverview = lazyNamed(() => import('../pages/settings/SettingsOverview'), 'SettingsOverview');
const GeneralSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'GeneralSettingsPage');
const AppearanceSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'AppearanceSettingsPage');
const ProductionSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'ProductionSettingsPage');
const DashboardSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'DashboardSettingsPage');
const AlertSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'AlertSettingsPage');
const ReportSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'ReportSettingsPage');
const DataSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'DataSettingsPage');
const ClientVersionSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'ClientVersionSettingsPage');
const BackupSettingsPage = lazyNamed(() => import('../pages/settings/SettingsSectionPages'), 'BackupSettingsPage');
const UsersManagement = lazyNamed(() => import('../pages/UsersManagement'), 'UsersManagement');
const ImageExportShowcase = lazyNamed(() => import('../pages/ImageExportShowcase'), 'ImageExportShowcase');
const TenantReadiness = lazyNamed(() => import('../pages/TenantReadiness'), 'TenantReadiness');

export const SYSTEM_ROUTES: AppRouteDef[] = [
  { path: '/system/users', permission: 'users.manage', component: UsersManagement },
  { path: '/roles', permission: 'roles.manage', component: RolesManagement },
  { path: '/activity-log', permission: 'activityLog.view', component: ActivityLogPage },
  { path: '/operations-monitor', redirectTo: '/activity-log' },
  { path: '/settings', permission: 'settings.view', component: SettingsOverview },
  { path: '/settings/general', permission: 'settings.view', component: GeneralSettingsPage },
  { path: '/settings/appearance', permission: 'settings.view', component: AppearanceSettingsPage },
  { path: '/settings/production', permission: 'roles.manage', component: ProductionSettingsPage },
  { path: '/settings/dashboards', permission: 'roles.manage', component: DashboardSettingsPage },
  { path: '/settings/alerts', permission: 'roles.manage', component: AlertSettingsPage },
  { path: '/settings/reports', permission: 'roles.manage', component: ReportSettingsPage },
  { path: '/settings/data', permission: 'roles.manage', component: DataSettingsPage },
  { path: '/settings/client-version', permission: 'roles.manage', component: ClientVersionSettingsPage },
  { path: '/settings/backup', permission: 'roles.manage', component: BackupSettingsPage },
  { path: '/system/readiness', permission: 'system.readiness.view', component: TenantReadiness },
  // Keep as developer utility deep-link; intentionally hidden from sidebar menu.
  { path: '/dev/image-export', permission: 'dashboard.view', component: ImageExportShowcase },
];
