import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';
import { LegacyEmployeeProfileRedirect } from './LegacyRedirects';

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

const AttendanceLogs = lazyNamed(() => import('../attendance/pages/AttendanceLogs'), 'AttendanceLogs');
const AttendanceDailyView = lazyNamed(() => import('../attendance/pages/AttendanceDailyView'), 'AttendanceDailyView');
const AttendanceMonthlyReport = lazyNamed(() => import('../attendance/pages/AttendanceMonthlyReport'), 'AttendanceMonthlyReport');
const AttendanceSyncDashboard = lazyNamed(() => import('../attendance/pages/AttendanceSyncDashboard'), 'AttendanceSyncDashboard');

/** Legacy logical paths → canonical `/hr/*` (bookmarks + external links). */
const HR_LEGACY_REDIRECTS: AppRouteDef[] = [
  { path: '/hr-dashboard', redirectTo: '/hr/dashboard' },
  { path: '/hr-settings', redirectTo: '/hr/settings' },
  { path: '/hr-transactions', redirectTo: '/hr/transactions' },
  { path: '/employee-financials', redirectTo: '/hr/employee-financials' },
  { path: '/employee-financial-overview', redirectTo: '/hr/employee-financial-overview' },
  { path: '/employees/import', redirectTo: '/hr/employees/import' },
  { path: '/employees', redirectTo: '/hr/employees' },
  { path: '/organization', redirectTo: '/hr/organization' },
  { path: '/self-service', redirectTo: '/hr/self-service' },
  { path: '/leave-requests', redirectTo: '/hr/leave-requests' },
  { path: '/loan-requests', redirectTo: '/hr/loan-requests' },
  { path: '/approval-center', redirectTo: '/hr/approval-center' },
  { path: '/delegations', redirectTo: '/hr/delegations' },
  { path: '/payroll/accounts', redirectTo: '/hr/payroll/accounts' },
  { path: '/payroll', redirectTo: '/hr/payroll' },
  { path: '/vehicles', redirectTo: '/hr/vehicles' },
  { path: '/attendance/import', redirectTo: '/hr/attendance/sync' },
  { path: '/attendance/logs', redirectTo: '/hr/attendance/logs' },
  { path: '/attendance/daily', redirectTo: '/hr/attendance/daily' },
  { path: '/attendance/monthly', redirectTo: '/hr/attendance/monthly' },
  { path: '/attendance/sync', redirectTo: '/hr/attendance/sync' },
  { path: '/attendance', redirectTo: '/hr/attendance/logs' },
];

const HR_LEGACY_PARAM_ROUTES: AppRouteDef[] = [
  { path: '/employees/:id', permission: 'employees.viewDetails', component: LegacyEmployeeProfileRedirect },
];

const HR_CANONICAL_ROUTES: AppRouteDef[] = [
  { path: '/hr/dashboard', permission: 'hrDashboard.view', component: HRDashboard, skeleton: 'dashboard' },
  { path: '/hr/employees', permission: 'employees.view', component: Employees },
  { path: '/hr/employees/import', permission: 'employees.create', component: HRImport },
  { path: '/hr/employees/:id', permission: 'employees.viewDetails', component: EmployeeProfile },
  { path: '/hr/organization', permission: 'hrSettings.view', component: Organization },
  { path: '/hr/self-service', permission: 'selfService.view', component: EmployeeSelfService },
  { path: '/hr/leave-requests', permission: 'leave.view', component: LeaveRequests },
  { path: '/hr/loan-requests', permission: 'loan.view', component: LoanRequests },
  { path: '/hr/approval-center', permission: 'approval.view', component: ApprovalCenter },
  { path: '/hr/delegations', permission: 'approval.delegate', component: DelegationManagement },
  { path: '/hr/payroll', permission: 'payroll.view', component: Payroll },
  { path: '/hr/payroll/accounts', permission: 'payroll.accounts.view', component: PayrollAccounts },
  { path: '/hr/evaluations', permission: 'hr.evaluation.view', component: EmployeeEvaluation },
  // Operational deep links; hidden from sidebar where noted in menu config.
  { path: '/hr/employee-financials', permission: 'hrSettings.view', component: EmployeeFinancials },
  { path: '/hr/employee-financial-overview', permission: 'payroll.view', component: EmployeeFinancialOverview },
  { path: '/hr/transactions', permission: 'hrDashboard.view', component: HRTransactions },
  { path: '/hr/vehicles', permission: 'vehicles.view', component: Vehicles },
  { path: '/hr/settings', permission: 'hrSettings.view', component: HRSettings },
  { path: '/hr/attendance/logs', permission: 'attendance.view', component: AttendanceLogs },
  { path: '/hr/attendance/daily', permission: 'attendance.view', component: AttendanceDailyView },
  { path: '/hr/attendance/monthly', permission: 'attendance.view', component: AttendanceMonthlyReport },
  { path: '/hr/attendance/sync', permission: 'attendance.sync', component: AttendanceSyncDashboard },
];

export const HR_ROUTES: AppRouteDef[] = [
  ...HR_LEGACY_REDIRECTS,
  ...HR_LEGACY_PARAM_ROUTES,
  ...HR_CANONICAL_ROUTES,
];
