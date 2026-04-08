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

const RoutingPlansPage = lazyNamed(() => import('../routing/pages/RoutingPlansPage'), 'RoutingPlansPage');
const PlanBuilderPage = lazyNamed(() => import('../routing/pages/PlanBuilderPage'), 'PlanBuilderPage');
const ExecutionPage = lazyNamed(() => import('../routing/pages/ExecutionPage'), 'ExecutionPage');
const RoutingAnalyticsPage = lazyNamed(() => import('../routing/pages/RoutingAnalyticsPage'), 'RoutingAnalyticsPage');
const LineWorkerAssignment = lazyNamed(() => import('../pages/LineWorkerAssignment'), 'LineWorkerAssignment');
const SupplyCyclesList = lazyNamed(() => import('../pages/SupplyCyclesList'), 'SupplyCyclesList');
const SupplyCycleDetail = lazyNamed(() => import('../pages/SupplyCycleDetail'), 'SupplyCycleDetail');

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
  { path: '/supply-cycles', permission: 'supplyCycles.view', component: SupplyCyclesList },
  { path: '/supply-cycles/:cycleId', permission: 'supplyCycles.view', component: SupplyCycleDetail },
  { path: '/quick-action', permission: 'quickAction.view', component: QuickAction },
  { path: '/line-workers', permission: 'lineWorkers.view', component: LineWorkerAssignment },
  { path: '/production/routing/analytics', permission: 'routing.analytics', component: RoutingAnalyticsPage },
  { path: '/production/routing/execution/:executionId', permission: 'routing.execute', component: ExecutionPage },
  {
    path: '/production/routing/:productId',
    permissionsAny: ['routing.view', 'routing.execute'],
    component: PlanBuilderPage,
  },
  { path: '/production/routing', permission: 'routing.view', component: RoutingPlansPage },
  { path: '/users', redirectTo: '/employees' },
];
