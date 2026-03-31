import type { AppRouteDef } from '../../shared/routes';

/** Legacy dashboard URLs keep working; home content is unified on `/`. */
export const DASHBOARD_ROUTES: AppRouteDef[] = [
  { path: '/employee-dashboard', redirectTo: '/' },
  { path: '/factory-dashboard', redirectTo: '/' },
  { path: '/admin-dashboard', redirectTo: '/' },
  { path: '/supervisor-dashboard', redirectTo: '/' },
];
