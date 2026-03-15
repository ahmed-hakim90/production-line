// ─── Payroll Module — Public API ────────────────────────────────────────────

// Types
export type {
  PayrollMonthStatus,
  EmploymentType,
  PayrollAuditAction,
  PayrollSnapshot,
  FirestorePayrollMonth,
  FirestorePayrollRecord,
  FirestorePayrollAuditLog,
  FirestorePayrollCostSummary,
  PayrollEmployeeData,
  EmployeeAttendanceSummary,
  PayrollCalculationResult,
  GeneratePayrollOptions,
  FinalizePayrollOptions,
  LockPayrollOptions,
} from './types';

// Collections
export {
  PAYROLL_COLLECTIONS,
  payrollMonthsRef,
  payrollMonthDocRef,
  payrollRecordsRef,
  payrollAuditLogsRef,
  payrollCostSummaryRef,
} from './collections';

// Salary strategies
export { getStrategy } from './salaryStrategies';
export type { SalaryStrategy } from './salaryStrategies';

// Engine
export {
  generatePayroll,
  getPayrollMonth,
  getPayrollRecords,
  getEmployeeLockedPayslip,
} from './payrollEngine';

// Finalizer
export { finalizePayroll } from './payrollFinalizer';

// Locker
export { lockPayroll } from './payrollLocker';

// Audit
export { payrollAuditService } from './payrollAudit';
