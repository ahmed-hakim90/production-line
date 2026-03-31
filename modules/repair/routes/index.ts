import type { AppRouteDef } from '../../shared/routes/types';
import {
  RepairAdminDashboard,
  RepairDashboard,
  RepairJobs,
  NewRepairJob,
  RepairJobDetail,
  SparePartsInventory,
  RepairBranches,
  RepairTechnicianKPIs,
  RepairCashier,
  RepairSaleInvoice,
} from '../pages';

export const REPAIR_ROUTES: AppRouteDef[] = [
  { path: '/repair/admin', permission: 'repair.admin.view', component: RepairAdminDashboard },
  { path: '/repair', permission: 'repair.dashboard.view', component: RepairDashboard },
  { path: '/repair/jobs', permission: 'repair.view', component: RepairJobs },
  { path: '/repair/jobs/new', permission: 'repair.jobs.create', component: NewRepairJob },
  { path: '/repair/jobs/:id', permission: 'repair.view', component: RepairJobDetail },
  { path: '/repair/parts', permission: 'repair.parts.view', component: SparePartsInventory },
  { path: '/repair/branches', permission: 'repair.branches.manage', component: RepairBranches },
  { path: '/repair/technician-kpis', permission: 'repair.dashboard.view', component: RepairTechnicianKPIs },
  { path: '/repair/cashier', permission: 'repair.cashier.view', component: RepairCashier },
  { path: '/repair/sale-invoice', permission: 'repair.sales.create', component: RepairSaleInvoice },
];
