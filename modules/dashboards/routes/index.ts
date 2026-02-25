import type { AppRouteDef } from '../../shared/routes';
import { EmployeeDashboard } from '../pages/EmployeeDashboard';
import { FactoryManagerDashboard } from '../pages/FactoryManagerDashboard';
import { AdminDashboard } from '../pages/AdminDashboard';

export const DASHBOARD_ROUTES: AppRouteDef[] = [
  { path: '/employee-dashboard', permission: 'employeeDashboard.view', component: EmployeeDashboard },
  { path: '/factory-dashboard', permission: 'factoryDashboard.view', component: FactoryManagerDashboard },
  { path: '/admin-dashboard', permission: 'adminDashboard.view', component: AdminDashboard },
  { path: '/supervisor-dashboard', redirectTo: '/employee-dashboard' },
];
