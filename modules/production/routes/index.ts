import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const Lines = lazyNamed(() => import('../pages/Lines'), 'Lines');
const LineDetails = lazyNamed(() => import('../pages/LineDetails'), 'LineDetails');
const ProductionPlans = lazyNamed(() => import('../pages/ProductionPlans'), 'ProductionPlans');
const WorkOrders = lazyNamed(() => import('../pages/WorkOrders/index'), 'WorkOrders');
const WorkOrderScanner = lazyNamed(() => import('../pages/WorkOrderScanner'), 'WorkOrderScanner');
const Supervisors = lazyNamed(() => import('../pages/Supervisors'), 'Supervisors');
const SupervisorDetails = lazyNamed(() => import('../pages/SupervisorDetails'), 'SupervisorDetails');
const SupervisorLineAssignment = lazyNamed(() => import('../pages/SupervisorLineAssignment'), 'SupervisorLineAssignment');
const ProductionWorkers = lazyNamed(() => import('../pages/ProductionWorkers'), 'ProductionWorkers');
const ProductionWorkerDetails = lazyNamed(() => import('../pages/ProductionWorkerDetails'), 'ProductionWorkerDetails');
const Reports = lazyNamed(() => import('../pages/Reports'), 'Reports');
const QuickAction = lazyNamed(() => import('../pages/QuickAction'), 'QuickAction');
const LineWorkerAssignment = lazyNamed(() => import('../pages/LineWorkerAssignment'), 'LineWorkerAssignment');

export const PRODUCTION_ROUTES: AppRouteDef[] = [
  { path: '/lines', permission: 'lines.view', component: Lines },
  { path: '/lines/:id', permission: 'lines.view', component: LineDetails },
  { path: '/production-plans', permission: 'plans.view', component: ProductionPlans },
  { path: '/work-orders', permission: 'workOrders.view', component: WorkOrders },
  { path: '/work-orders/:id/scanner', permission: 'workOrders.view', component: WorkOrderScanner },
  { path: '/supervisors', permission: 'supervisors.view', component: Supervisors },
  { path: '/supervisors/:id', permission: 'supervisors.view', component: SupervisorDetails },
  { path: '/supervisor-line-assignments', permission: 'supervisorAssignments.manage', component: SupervisorLineAssignment },
  { path: '/production-workers', permission: 'productionWorkers.view', component: ProductionWorkers },
  { path: '/production-workers/:id', permission: 'productionWorkers.view', component: ProductionWorkerDetails },
  { path: '/reports', permission: 'reports.view', component: Reports },
  { path: '/quick-action', permission: 'quickAction.view', component: QuickAction },
  { path: '/line-workers', permission: 'lineWorkers.view', component: LineWorkerAssignment },
  { path: '/users', redirectTo: '/employees' },
];
