import type { ExportImportPageControl, ExportImportSettings } from '../types';
import { DEFAULT_EXPORT_IMPORT_PAGE_CONTROL } from './dashboardConfig';

export interface ExportImportPageRegistryItem {
  key: string;
  label: string;
  path: string;
}

export const EXPORT_IMPORT_PAGE_REGISTRY: ExportImportPageRegistryItem[] = [
  { key: 'reports', label: 'صفحة التقارير', path: '/reports' },
  { key: 'products', label: 'صفحة المنتجات', path: '/products' },
  { key: 'productionWorkers', label: 'صفحة عمال الإنتاج', path: '/production-workers' },
  { key: 'supervisors', label: 'صفحة المشرفين', path: '/supervisors' },
  { key: 'costCenters', label: 'صفحة مراكز التكلفة', path: '/cost-centers' },
  { key: 'monthlyProductionCosts', label: 'صفحة تكلفة الإنتاج الشهرية', path: '/cost-centers/:id' },
  { key: 'employees', label: 'صفحة الموظفين', path: '/employees' },
  { key: 'employeeFinancials', label: 'صفحة بدلات واستقطاعات', path: '/employee-financials' },
  { key: 'leaveRequests', label: 'صفحة الإجازات', path: '/leave-requests' },
  { key: 'loanRequests', label: 'صفحة السلف', path: '/loan-requests' },
  { key: 'vehicles', label: 'صفحة المركبات', path: '/vehicles' },
  { key: 'hrTransactions', label: 'صفحة سجل حركات HR', path: '/hr-transactions' },
  { key: 'attendanceList', label: 'صفحة سجل الحضور', path: '/attendance' },
  { key: 'payroll', label: 'صفحة كشف الرواتب', path: '/payroll' },
  { key: 'adminDashboard', label: 'لوحة مدير النظام', path: '/admin-dashboard' },
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
