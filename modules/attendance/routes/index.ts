import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const AttendanceDailyView = lazyNamed(() => import('../pages/AttendanceDailyView'), 'AttendanceDailyView');
const AttendanceLogs = lazyNamed(() => import('../pages/AttendanceLogs'), 'AttendanceLogs');
const AttendanceMonthlyReport = lazyNamed(() => import('../pages/AttendanceMonthlyReport'), 'AttendanceMonthlyReport');
const AttendanceSyncDashboard = lazyNamed(() => import('../pages/AttendanceSyncDashboard'), 'AttendanceSyncDashboard');

export const ATTENDANCE_ROUTES: AppRouteDef[] = [
  { path: '/attendance/logs', permission: 'attendance.view', component: AttendanceLogs },
  { path: '/attendance/daily', permission: 'attendance.view', component: AttendanceDailyView },
  // Keep as deep-link route; intentionally hidden from sidebar menu.
  { path: '/attendance/monthly', permission: 'attendance.view', component: AttendanceMonthlyReport },
  { path: '/attendance/sync', permission: 'attendance.sync', component: AttendanceSyncDashboard },
];
