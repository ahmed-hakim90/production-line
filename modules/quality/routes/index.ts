import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const QualityHome = lazyNamed(() => import('../pages/QualityHome'), 'QualityHome');
const QualityPallets = lazyNamed(() => import('../pages/QualityPallets'), 'QualityPallets');
const QualityHourlySamples = lazyNamed(() => import('../pages/QualityHourlySamples'), 'QualityHourlySamples');
const QualityLineSamples = lazyNamed(() => import('../pages/QualityLineSamples'), 'QualityLineSamples');
const QualitySummaries = lazyNamed(() => import('../pages/QualitySummaries'), 'QualitySummaries');
const QualityFlowchart = lazyNamed(() => import('../pages/QualityFlowchart'), 'QualityFlowchart');
const QualityScrap = lazyNamed(() => import('../pages/QualityScrap'), 'QualityScrap');
const QualitySecondSort = lazyNamed(() => import('../pages/QualitySecondSort'), 'QualitySecondSort');
const QualityReports = lazyNamed(() => import('../pages/QualityReports'), 'QualityReports');
const QualitySettings = lazyNamed(() => import('../pages/QualitySettings'), 'QualitySettings');
const QualityStaff = lazyNamed(() => import('../pages/QualityStaff'), 'QualityStaff');

const view: AppRouteDef['permission'] = 'quality.view';

export const QUALITY_ROUTES: AppRouteDef[] = [
  { path: '/quality', permission: view, component: QualityHome },
  { path: '/quality/pallets', permission: 'quality.pallets.view', component: QualityPallets },
  { path: '/quality/hourly-samples', permission: 'quality.samples.view', component: QualityHourlySamples },
  { path: '/quality/line-samples', permission: 'quality.samples.view', component: QualityLineSamples },
  { path: '/quality/summaries', permission: 'quality.reports.view', component: QualitySummaries },
  { path: '/quality/flowchart', permission: 'quality.reports.view', component: QualityFlowchart },
  { path: '/quality/scrap', permission: 'quality.scrap.view', component: QualityScrap },
  { path: '/quality/second-sort', permission: 'quality.secondSort.view', component: QualitySecondSort },
  { path: '/quality/reports', permission: 'quality.reports.view', component: QualityReports },
  { path: '/quality/settings', permission: 'quality.settings.view', component: QualitySettings },
  { path: '/quality/staff', permission: 'quality.workers.view', component: QualityStaff },
  { path: '/quality/final-inspection', redirectTo: '/quality/pallets' },
  { path: '/quality/ipqc', redirectTo: '/quality/line-samples' },
  { path: '/quality/rework', redirectTo: '/quality/scrap' },
  { path: '/quality/capa', redirectTo: '/quality/second-sort' },
  { path: '/quality/workers', redirectTo: '/quality/staff' },
];
