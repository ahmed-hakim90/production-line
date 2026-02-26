import type { AppRouteDef } from '../../shared/routes';
import { HRDashboard } from '../pages/HRDashboard';
import { Employees } from '../pages/Employees';
import { EmployeeProfile } from '../pages/EmployeeProfile';
import { HRImport } from '../pages/HRImport';
import { Organization } from '../pages/Organization';
import { EmployeeSelfService } from '../pages/EmployeeSelfService';
import { AttendanceList } from '../pages/AttendanceList';
import { AttendanceImport } from '../pages/AttendanceImport';
import { LeaveRequests } from '../pages/LeaveRequests';
import { LoanRequests } from '../pages/LoanRequests';
import { ApprovalCenter } from '../pages/ApprovalCenter';
import { DelegationManagement } from '../pages/DelegationManagement';
import { Payroll } from '../pages/Payroll';
import { EmployeeFinancials } from '../pages/EmployeeFinancials';
import { HRTransactions } from '../pages/HRTransactions';
import { Vehicles } from '../pages/Vehicles';
import { HRSettings } from '../pages/HRSettings';

export const HR_ROUTES: AppRouteDef[] = [
  { path: '/hr-dashboard', permission: 'hrDashboard.view', component: HRDashboard },
  { path: '/employees', permission: 'employees.view', component: Employees },
  { path: '/employees/import', permission: 'import', component: HRImport },
  { path: '/employees/:id', permission: 'employees.viewDetails', component: EmployeeProfile },
  { path: '/organization', permission: 'hrSettings.view', component: Organization },
  { path: '/self-service', permission: 'selfService.view', component: EmployeeSelfService },
  { path: '/attendance', permission: 'attendance.view', component: AttendanceList },
  { path: '/attendance/import', permission: 'attendance.import', component: AttendanceImport },
  { path: '/leave-requests', permission: 'leave.view', component: LeaveRequests },
  { path: '/loan-requests', permission: 'loan.view', component: LoanRequests },
  { path: '/approval-center', permission: 'approval.view', component: ApprovalCenter },
  { path: '/delegations', permission: 'approval.delegate', component: DelegationManagement },
  { path: '/payroll', permission: 'payroll.view', component: Payroll },
  { path: '/employee-financials', permission: 'hrSettings.view', component: EmployeeFinancials },
  { path: '/hr-transactions', permission: 'hrDashboard.view', component: HRTransactions },
  { path: '/vehicles', permission: 'vehicles.view', component: Vehicles },
  { path: '/hr-settings', permission: 'hrSettings.view', component: HRSettings },
];



