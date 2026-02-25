import type { AppRouteDef } from '../../shared/routes';
import { QualitySettings } from '../pages/QualitySettings';
import { QualityWorkers } from '../pages/QualityWorkers';
import { FinalInspection } from '../pages/FinalInspection';
import { IPQC } from '../pages/IPQC';
import { ReworkOrders } from '../pages/ReworkOrders';
import { CAPA } from '../pages/CAPA';
import { QualityReports } from '../pages/QualityReports';

export const QUALITY_ROUTES: AppRouteDef[] = [
  { path: '/quality/settings', permission: 'quality.settings.view', component: QualitySettings },
  { path: '/quality/workers', permission: 'quality.workers.view', component: QualityWorkers },
  { path: '/quality/final-inspection', permission: 'quality.finalInspection.view', component: FinalInspection },
  { path: '/quality/ipqc', permission: 'quality.ipqc.view', component: IPQC },
  { path: '/quality/rework', permission: 'quality.rework.view', component: ReworkOrders },
  { path: '/quality/capa', permission: 'quality.capa.view', component: CAPA },
  { path: '/quality/reports', permission: 'quality.reports.view', component: QualityReports },
];
