import type { AppRouteDef } from '../../shared/routes';
import { Products } from '../pages/Products';
import { ProductDetails } from '../pages/ProductDetails';
import { Lines } from '../pages/Lines';
import { LineDetails } from '../pages/LineDetails';
import { ProductionPlans } from '../pages/ProductionPlans';
import { WorkOrders } from '../pages/WorkOrders';
import { WorkOrderScanner } from '../pages/WorkOrderScanner';
import { Supervisors } from '../pages/Supervisors';
import { SupervisorDetails } from '../pages/SupervisorDetails';
import { ProductionWorkers } from '../pages/ProductionWorkers';
import { ProductionWorkerDetails } from '../pages/ProductionWorkerDetails';
import { Reports } from '../pages/Reports';
import { QuickAction } from '../pages/QuickAction';
import { LineWorkerAssignment } from '../pages/LineWorkerAssignment';

export const PRODUCTION_ROUTES: AppRouteDef[] = [
  { path: '/products', permission: 'products.view', component: Products },
  { path: '/products/:id', permission: 'products.view', component: ProductDetails },
  { path: '/lines', permission: 'lines.view', component: Lines },
  { path: '/lines/:id', permission: 'lines.view', component: LineDetails },
  { path: '/production-plans', permission: 'plans.view', component: ProductionPlans },
  { path: '/work-orders', permission: 'workOrders.view', component: WorkOrders },
  { path: '/work-orders/:id/scanner', permission: 'workOrders.view', component: WorkOrderScanner },
  { path: '/supervisors', permission: 'supervisors.view', component: Supervisors },
  { path: '/supervisors/:id', permission: 'supervisors.view', component: SupervisorDetails },
  { path: '/production-workers', permission: 'productionWorkers.view', component: ProductionWorkers },
  { path: '/production-workers/:id', permission: 'productionWorkers.view', component: ProductionWorkerDetails },
  { path: '/reports', permission: 'reports.view', component: Reports },
  { path: '/quick-action', permission: 'quickAction.view', component: QuickAction },
  { path: '/line-workers', permission: 'lineWorkers.view', component: LineWorkerAssignment },
  { path: '/users', redirectTo: '/employees' },
];
