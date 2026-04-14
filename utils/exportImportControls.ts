import type { ExportImportPageControl, ExportImportSettings } from '../types';
import { DEFAULT_EXPORT_IMPORT_PAGE_CONTROL } from './dashboardConfig';

export interface ExportImportPageRegistryItem {
  key: string;
  label: string;
  path: string;
}

export const EXPORT_IMPORT_PAGE_REGISTRY: ExportImportPageRegistryItem[] = [
  { key: 'reports', label: 'صفحة التقارير', path: '/reports' },
  { key: 'supply_cycles', label: 'صفحة دورات التوريد', path: '/supply-cycles' },
  { key: 'products', label: 'صفحة المنتجات', path: '/products' },
  { key: 'productionWorkers', label: 'صفحة عمال الإنتاج', path: '/production-workers' },
  { key: 'supervisors', label: 'صفحة المشرفين', path: '/supervisors' },
  { key: 'costCenters', label: 'صفحة مراكز التكلفة', path: '/cost-centers' },
  { key: 'monthlyProductionCosts', label: 'صفحة تكلفة الإنتاج الشهرية', path: '/cost-centers/:id' },
  { key: 'employees', label: 'صفحة الموظفين', path: '/hr/employees' },
  { key: 'employeeFinancials', label: 'صفحة بدلات واستقطاعات', path: '/hr/employee-financials' },
  { key: 'leaveRequests', label: 'صفحة الإجازات', path: '/hr/leave-requests' },
  { key: 'loanRequests', label: 'صفحة السلف', path: '/hr/loan-requests' },
  { key: 'vehicles', label: 'صفحة المركبات', path: '/hr/vehicles' },
  { key: 'hrTransactions', label: 'صفحة سجل حركات HR', path: '/hr/transactions' },
  { key: 'attendanceList', label: 'صفحة سجل الحضور', path: '/hr/attendance/logs' },
  { key: 'payroll', label: 'صفحة كشف الرواتب', path: '/hr/payroll' },
  { key: 'adminDashboard', label: 'لوحة مدير النظام', path: '/' },
];

export function getExportImportPageControl(
  settings: ExportImportSettings | null | undefined,
  pageKey: string,
): ExportImportPageControl {
  return {
    ...DEFAULT_EXPORT_IMPORT_PAGE_CONTROL,
    ...(settings?.pages?.[pageKey] ?? {}),
  };
}
