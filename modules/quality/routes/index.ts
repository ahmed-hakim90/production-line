import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const QualitySettings = lazyNamed(() => import('../pages/QualitySettings'), 'QualitySettings');
const QualityWorkers = lazyNamed(() => import('../pages/QualityWorkers'), 'QualityWorkers');
const FinalInspection = lazyNamed(() => import('../pages/FinalInspection'), 'FinalInspection');
const IPQC = lazyNamed(() => import('../pages/IPQC'), 'IPQC');
const ReworkOrders = lazyNamed(() => import('../pages/ReworkOrders'), 'ReworkOrders');
const CAPA = lazyNamed(() => import('../pages/CAPA'), 'CAPA');
const QualityReports = lazyNamed(() => import('../pages/QualityReports'), 'QualityReports');

export const QUALITY_ROUTES: AppRouteDef[] = [
  { path: '/quality/settings', permission: 'quality.settings.view', component: QualitySettings },
  { path: '/quality/workers', permission: 'quality.workers.view', component: QualityWorkers },
  { path: '/quality/final-inspection', permission: 'quality.finalInspection.view', component: FinalInspection },
  { path: '/quality/ipqc', permission: 'quality.ipqc.view', component: IPQC },
  { path: '/quality/rework', permission: 'quality.rework.view', component: ReworkOrders },
  { path: '/quality/capa', permission: 'quality.capa.view', component: CAPA },
  { path: '/quality/reports', permission: 'quality.reports.view', component: QualityReports },
];
