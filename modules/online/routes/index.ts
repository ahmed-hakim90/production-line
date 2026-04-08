import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const OnlineDashboard = lazyNamed(() => import('../pages/OnlineDashboard'), 'OnlineDashboard');
const OnlineQuickScan = lazyNamed(() => import('../pages/OnlineQuickScan'), 'OnlineQuickScan');

export const ONLINE_ROUTES: AppRouteDef[] = [
  {
    path: '/online',
    permissionsAny: ['onlineDispatch.view', 'onlineDispatch.manage'],
    component: OnlineDashboard,
  },
  {
    path: '/online/dashboard',
    permissionsAny: ['onlineDispatch.view', 'onlineDispatch.manage'],
    component: OnlineDashboard,
  },
  {
    path: '/online/scan/:mode',
    permissionsAny: [
      'onlineDispatch.manage',
      'onlineDispatch.handoffToWarehouse',
      'onlineDispatch.handoffToPost',
    ],
    component: OnlineQuickScan,
  },
];
