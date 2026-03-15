import type { AppRouteDef } from '../../shared/routes';
import { AttendanceDailyView } from '../pages/AttendanceDailyView';
import { AttendanceLogs } from '../pages/AttendanceLogs';
import { AttendanceSyncDashboard } from '../pages/AttendanceSyncDashboard';

export const ATTENDANCE_ROUTES: AppRouteDef[] = [
  { path: '/attendance/logs', permission: 'attendance.view', component: AttendanceLogs },
  { path: '/attendance/daily', permission: 'attendance.view', component: AttendanceDailyView },
  { path: '/attendance/sync', permission: 'attendance.sync', component: AttendanceSyncDashboard },
];
