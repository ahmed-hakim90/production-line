import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const RepairDashboard = lazyNamed(() => import('../pages/RepairDashboard'), 'RepairDashboard');
const RepairAdminDashboard = lazyNamed(() => import('../pages/RepairAdminDashboard'), 'RepairAdminDashboard');
const RepairAdminOrders = lazyNamed(() => import('../pages/RepairAdminOrders'), 'RepairAdminOrders');
const RepairJobs = lazyNamed(() => import('../pages/RepairJobs'), 'RepairJobs');
const RepairCallCenter = lazyNamed(() => import('../pages/RepairCallCenter'), 'RepairCallCenter');
const NewRepairJob = lazyNamed(() => import('../pages/NewRepairJob'), 'NewRepairJob');
const RepairJobDetail = lazyNamed(() => import('../pages/RepairJobDetail'), 'RepairJobDetail');
const RepairJobWorkspace = lazyNamed(() => import('../pages/RepairJobWorkspace'), 'RepairJobWorkspace');
const SparePartsInventory = lazyNamed(() => import('../pages/SparePartsInventory'), 'SparePartsInventory');
const RepairBranches = lazyNamed(() => import('../pages/RepairBranches'), 'RepairBranches');
const RepairTechnicianKPIs = lazyNamed(() => import('../pages/RepairTechnicianKPIs'), 'RepairTechnicianKPIs');
const RepairTreasury = lazyNamed(() => import('../pages/RepairTreasury'), 'RepairTreasury');
const RepairTreasuryMonthlyReport = lazyNamed(() => import('../pages/RepairTreasuryMonthlyReport'), 'RepairTreasuryMonthlyReport');
const RepairSalesInvoice = lazyNamed(() => import('../pages/RepairSalesInvoice'), 'RepairSalesInvoicePage');
const RepairSettings = lazyNamed(() => import('../pages/RepairSettings'), 'RepairSettings');

export const REPAIR_ROUTES: AppRouteDef[] = [
  { path: '/repair', permission: 'repair.dashboard.view', component: RepairDashboard, skeleton: 'dashboard' },
  {
    path: '/repair/admin-dashboard',
    permission: 'repair.adminDashboard.view',
    component: RepairAdminDashboard,
    skeleton: 'dashboard',
  },
  // Keep as internal admin flow; intentionally hidden from sidebar menu.
  { path: '/repair/admin-orders', permission: 'repair.adminDashboard.view', component: RepairAdminOrders },
  { path: '/repair/jobs', permission: 'repair.view', component: RepairJobs },
  { path: '/repair/call-center', permission: 'repair.view', component: RepairCallCenter },
  { path: '/repair/jobs/new', permission: 'repair.jobs.create', component: NewRepairJob, skeleton: 'form' },
  { path: '/repair/jobs/:jobId', permission: 'repair.view', component: RepairJobDetail },
  { path: '/repair/jobs/:jobId/workspace', permission: 'repair.view', component: RepairJobWorkspace },
  { path: '/repair/parts', permission: 'repair.parts.view', component: SparePartsInventory },
  { path: '/repair/branches', permission: 'repair.branches.manage', component: RepairBranches },
  { path: '/repair/technician-kpis', permission: 'repair.technician.view', component: RepairTechnicianKPIs },
  { path: '/repair/treasury', permission: 'repair.treasury.view', component: RepairTreasury },
  { path: '/repair/settings', permission: 'repair.settings.manage', component: RepairSettings },
  // Keep as report deep-link from treasury page; intentionally hidden from sidebar menu.
  { path: '/repair/treasury-report', permission: 'repair.treasury.view', component: RepairTreasuryMonthlyReport },
  { path: '/repair/sales-invoice', permission: 'repair.salesInvoice.create', component: RepairSalesInvoice },
];
