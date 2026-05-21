import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const ExecutivePeriodReportPage = lazyNamed(
  () => import('../pages/ExecutivePeriodReport'),
  'ExecutivePeriodReportPage',
);

export const REPORTS_ROUTES: AppRouteDef[] = [
  { path: '/reports/executive', permission: 'reports.executive.export', component: ExecutivePeriodReportPage },
];
