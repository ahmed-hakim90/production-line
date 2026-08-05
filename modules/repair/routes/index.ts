import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const RepairDashboard = lazyNamed(() => import('../pages/RepairDashboard'), 'RepairDashboard');
const RepairAdminOrders = lazyNamed(() => import('../pages/RepairAdminOrders'), 'RepairAdminOrders');
const RepairJobs = lazyNamed(() => import('../pages/RepairJobs'), 'RepairJobs');
const RepairMyJobs = lazyNamed(() => import('../pages/RepairMyJobs'), 'RepairMyJobs');
const RepairCallCenter = lazyNamed(() => import('../pages/RepairCallCenter'), 'RepairCallCenter');
const NewRepairJob = lazyNamed(() => import('../pages/NewRepairJob'), 'NewRepairJob');
const RepairJobDetail = lazyNamed(() => import('../pages/RepairJobDetail'), 'RepairJobDetail');
const RepairJobWorkspace = lazyNamed(() => import('../pages/RepairJobWorkspace'), 'RepairJobWorkspace');
const SparePartsInventory = lazyNamed(() => import('../pages/SparePartsInventory'), 'SparePartsInventory');
const RepairPartsPricing = lazyNamed(() => import('../pages/RepairPartsPricing'), 'RepairPartsPricing');
const RepairPartsReplenishment = lazyNamed(() => import('../pages/RepairPartsReplenishment'), 'RepairPartsReplenishment');
const RepairSpareIssues = lazyNamed(() => import('../pages/RepairSpareIssues'), 'RepairSpareIssues');
const RepairComplaints = lazyNamed(() => import('../pages/RepairComplaints'), 'RepairComplaints');
const RepairBranches = lazyNamed(() => import('../pages/RepairBranches'), 'RepairBranches');
const RepairTechnicianKPIs = lazyNamed(() => import('../pages/RepairTechnicianKPIs'), 'RepairTechnicianKPIs');
const RepairTreasury = lazyNamed(() => import('../pages/RepairTreasury'), 'RepairTreasury');
const RepairTreasuryMonthlyReport = lazyNamed(() => import('../pages/RepairTreasuryMonthlyReport'), 'RepairTreasuryMonthlyReport');
const RepairSalesInvoice = lazyNamed(() => import('../pages/RepairSalesInvoice'), 'RepairSalesInvoicePage');
const RepairPayments = lazyNamed(() => import('../pages/RepairPayments'), 'RepairPayments');
const RepairTechnicianHome = lazyNamed(() => import('../pages/RepairTechnicianHome'), 'RepairTechnicianHome');
const RepairSettings = lazyNamed(() => import('../pages/RepairSettings'), 'RepairSettings');
const WarehouseWorkspace = lazyNamed(
  () => import('../../inventory/pages/WarehouseWorkspace'),
  'WarehouseWorkspace',
);

export const REPAIR_ROUTES: AppRouteDef[] = [
  {
    path: '/repair',
    permission: 'repair.dashboard.view',
    permissionsAny: ['repair.dashboard.view', 'repair.adminDashboard.view', 'repair.jobs.technician'],
    component: RepairDashboard,
    skeleton: 'dashboard',
  },
  {
    path: '/repair/admin-dashboard',
    permission: 'repair.adminDashboard.view',
    component: RepairDashboard,
    skeleton: 'dashboard',
  },
  // Keep as internal admin flow; intentionally hidden from sidebar menu.
  { path: '/repair/admin-orders', permission: 'repair.adminDashboard.view', component: RepairAdminOrders },
  { path: '/repair/jobs', permission: 'repair.view', component: RepairJobs },
  { path: '/repair/technician', permission: 'repair.jobs.technician', component: RepairTechnicianHome, skeleton: 'dashboard' },
  {
    path: '/repair/my-jobs',
    permission: 'repair.jobs.technician',
    permissionsAny: ['repair.jobs.technician', 'repair.view'],
    component: RepairMyJobs,
  },
  { path: '/repair/call-center', permission: 'repair.view', component: RepairCallCenter },
  { path: '/repair/payments', permission: 'repair.payments.view', component: RepairPayments },
  { path: '/repair/jobs/new', permission: 'repair.jobs.create', component: NewRepairJob, skeleton: 'form' },
  { path: '/repair/jobs/:jobId', permission: 'repair.view', component: RepairJobDetail },
  {
    path: '/repair/jobs/:jobId/workspace',
    permissionsAny: ['repair.jobs.technician', 'repair.view'],
    component: RepairJobWorkspace,
  },
  { path: '/repair/parts', permission: 'repair.parts.view', component: SparePartsInventory },
  { path: '/repair/parts-pricing', permission: 'repair.pricing.manage', component: RepairPartsPricing },
  {
    path: '/repair/warehouses/:warehouseId',
    permission: 'repair.parts.view',
    permissionsAny: ['repair.parts.view', 'inventory.view'],
    component: WarehouseWorkspace,
    skeleton: 'dashboard',
  },
  {
    path: '/repair/parts-replenishment',
    permission: 'sparePartsReplenishment.view',
    permissionsAny: [
      'sparePartsReplenishment.view',
      'sparePartsReplenishment.create',
      'sparePartsReplenishment.receive',
    ],
    component: RepairPartsReplenishment,
  },
  { path: '/repair/spare-issues', permission: 'repairSpareIssues.view', component: RepairSpareIssues },
  { path: '/repair/complaints', permission: 'repair.complaints.view', component: RepairComplaints },
  { path: '/repair/branches', permission: 'repair.branches.manage', component: RepairBranches },
  { path: '/repair/technician-kpis', permission: 'repair.technician.view', component: RepairTechnicianKPIs },
  { path: '/repair/treasury', permission: 'repair.treasury.view', component: RepairTreasury },
  { path: '/repair/settings', permission: 'repair.settings.manage', component: RepairSettings },
  // Keep as report deep-link from treasury page; intentionally hidden from sidebar menu.
  { path: '/repair/treasury-report', permission: 'repair.treasury.view', component: RepairTreasuryMonthlyReport },
  { path: '/repair/sales-invoice', permission: 'repair.salesInvoice.create', component: RepairSalesInvoice },
];
