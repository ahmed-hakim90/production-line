import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const HRDashboard = lazyNamed(() => import('../pages/HRDashboard'), 'HRDashboard');
const Employees = lazyNamed(() => import('../pages/Employees'), 'Employees');
const EmployeeProfile = lazyNamed(() => import('../pages/EmployeeProfile'), 'EmployeeProfile');
const HRImport = lazyNamed(() => import('../pages/HRImport'), 'HRImport');
const Organization = lazyNamed(() => import('../pages/Organization'), 'Organization');
const EmployeeSelfService = lazyNamed(() => import('../pages/EmployeeSelfService'), 'EmployeeSelfService');
const LeaveRequests = lazyNamed(() => import('../pages/LeaveRequests'), 'LeaveRequests');
const LoanRequests = lazyNamed(() => import('../pages/LoanRequests'), 'LoanRequests');
const ApprovalCenter = lazyNamed(() => import('../pages/ApprovalCenter'), 'ApprovalCenter');
const DelegationManagement = lazyNamed(() => import('../pages/DelegationManagement'), 'DelegationManagement');
const Payroll = lazyNamed(() => import('../pages/Payroll'), 'Payroll');
const PayrollAccounts = lazyNamed(() => import('../pages/PayrollAccounts'), 'PayrollAccounts');
const EmployeeEvaluation = lazyNamed(() => import('../pages/EmployeeEvaluation'), 'EmployeeEvaluation');
const EmployeeFinancials = lazyNamed(() => import('../pages/EmployeeFinancials'), 'EmployeeFinancials');
const EmployeeFinancialOverview = lazyNamed(() => import('../pages/EmployeeFinancialOverview'), 'EmployeeFinancialOverview');
const HRTransactions = lazyNamed(() => import('../pages/HRTransactions'), 'HRTransactions');
const Vehicles = lazyNamed(() => import('../pages/Vehicles'), 'Vehicles');
const HRSettings = lazyNamed(() => import('../pages/HRSettings'), 'HRSettings');

export const HR_ROUTES: AppRouteDef[] = [
  { path: '/hr-dashboard', permission: 'hrDashboard.view', component: HRDashboard },
  { path: '/employees', permission: 'employees.view', component: Employees },
  { path: '/employees/import', permission: 'employees.create', component: HRImport },
  { path: '/employees/:id', permission: 'employees.viewDetails', component: EmployeeProfile },
  { path: '/organization', permission: 'hrSettings.view', component: Organization },
  { path: '/self-service', permission: 'selfService.view', component: EmployeeSelfService },
  { path: '/attendance', redirectTo: '/attendance/logs' },
  { path: '/attendance/import', redirectTo: '/attendance/sync' },
  { path: '/leave-requests', permission: 'leave.view', component: LeaveRequests },
  { path: '/loan-requests', permission: 'loan.view', component: LoanRequests },
  { path: '/approval-center', permission: 'approval.view', component: ApprovalCenter },
  { path: '/delegations', permission: 'approval.delegate', component: DelegationManagement },
  { path: '/payroll', permission: 'payroll.view', component: Payroll },
  { path: '/payroll/accounts', permission: 'payroll.accounts.view', component: PayrollAccounts },
  { path: '/hr/evaluations', permission: 'hr.evaluation.view', component: EmployeeEvaluation },
  { path: '/employee-financials', permission: 'hrSettings.view', component: EmployeeFinancials },
  { path: '/employee-financial-overview', permission: 'payroll.view', component: EmployeeFinancialOverview },
  { path: '/hr-transactions', permission: 'hrDashboard.view', component: HRTransactions },
  { path: '/vehicles', permission: 'vehicles.view', component: Vehicles },
  { path: '/hr-settings', permission: 'hrSettings.view', component: HRSettings },
];
