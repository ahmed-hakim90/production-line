// ─── HR Module — Public API ─────────────────────────────────────────────────

// Employee service
export { employeeService } from './employeeService';

// Types
export type {
  JobLevel,
  PenaltyType,
  ValueType,
  CalculationType,
  DayOfWeek,
  AttendanceSource,
  FirestoreDepartment,
  FirestoreJobPosition,
  FirestoreShift,
  FirestoreHRSettings,
  FirestoreVehicle,
  FirestorePenaltyRule,
  FirestoreLateRule,
  FirestoreAllowanceType,
  FirestoreAttendanceRawLog,
  FirestoreAttendanceLog,
  ZKRawPunch,
  CSVParseResult,
  EmployeeCodeMap,
  EmployeeDayGroup,
  ProcessedAttendanceRecord,
  AttendanceBatchResult,
  WorkingMinutesResult,
  LateDetectionResult,
  EarlyLeaveResult,
  AbsenceResult,
  PenaltyResult,
  AllowanceResult,
  AllowanceSummary,
  NetSalaryResult,
  ApprovalRequestType,
  ApprovalStatus,
  ApprovalChainItem,
  LeaveType,
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  FirestoreApprovalRequest,
  LoanStatus,
  LoanType,
  FirestoreEmployeeLoan,
  LoanInstallment,
  EmployeeFinancialStatus,
  FirestoreEmployeeAllowance,
  FirestoreEmployeeDeduction,
  DeductionCategory,
  EmployeeAllowanceSummary,
  EmployeeDeductionSummary,
} from './types';

export { JOB_LEVEL_LABELS, LEAVE_TYPE_LABELS, LOAN_TYPE_LABELS, DEFAULT_LEAVE_BALANCE } from './types';

// Engine (pure functions)
export {
  calculateWorkingMinutes,
  detectLate,
  calculateEarlyLeave,
  calculateAbsence,
  calculatePenalty,
  applyAllowances,
  calculateNetSalary,
} from './hrEngine';

// Attendance processor (pure functions)
export {
  parseCSV,
  groupPunchesByDay,
  processDay,
  processBatch,
} from './attendanceProcessor';

// Attendance service (Firestore CRUD)
export {
  attendanceRawLogService,
  attendanceLogService,
} from './attendanceService';

// Leave service (Firestore CRUD)
export {
  leaveRequestService,
  leaveBalanceService,
} from './leaveService';

// Loan service (Firestore CRUD)
export { loanService } from './loanService';

// Legacy approval engine (kept for backward compatibility with leave/loan pages)
export {
  generateApprovalChain,
  processApprovalAction,
  deriveFinalStatus,
  canApproverAct,
  filterActionableForApprover,
} from './approvalEngine';

export type { EmployeeHierarchyInfo, ApprovalChainResult, ApprovalActionResult } from './approvalEngine';

// Enterprise Approval Engine (Phase 6 — dynamic + snapshot + hierarchy)
export {
  // Types
  type ApprovalRequestStatus,
  type ApprovalAction,
  type ApprovalChainSnapshot,
  type ApprovalStepStatus,
  type ApprovalHistoryEntry,
  type FirestoreApprovalSettings,
  type AutoApproveThreshold,
  type FirestoreApprovalDelegation,
  type FirestoreApprovalAuditLog,
  type ApprovalEmployeeInfo,
  type BuildChainOptions,
  type BuildChainResult,
  type CreateRequestOptions,
  type ApprovalActionOptions,
  type CancelRequestOptions,
  type AdminOverrideOptions,
  type OperationResult,
  type PendingApprovalsQuery,
  type ApprovalRole,
  type CallerContext,
  DEFAULT_APPROVAL_SETTINGS,
  // Collections
  APPROVAL_COLLECTIONS,
  approvalRequestDocRef,
  approvalSettingsDocRef as approvalSettingsRef,
  approvalDelegationsRef,
  approvalDelegationDocRef,
  approvalAuditLogsRef,
  // Builder
  buildApprovalChain,
  tryAutoApprove,
  previewApprovalChain,
  validateChain,
  // Engine
  getApprovalSettings,
  updateApprovalSettings,
  createRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  adminOverride,
  getRequestById,
  getRequestsByEmployee,
  getRequestsByType,
  getAllRequests,
  getPendingApprovals,
  getRequestsByStatus,
  // Validation
  resolveApprovalRole,
  validateCreate,
  validateAction,
  validateCancel,
  checkAutoApprove,
  canViewAllRequests,
  canActOnRequest,
  // Escalation
  processEscalations,
  getEscalatedRequests,
  isRequestOverdue,
  // Delegation
  approvalDelegationService,
  // Audit
  approvalAuditService,
} from './approval';

// Payroll integration (consumed by Payroll Engine)
export {
  getApprovedLeaves,
  getActiveLoanInstallments,
  getEmployeeAllowancesForMonth,
  getEmployeeDeductionsForMonth,
  getEmployeeAllowanceSummary,
  getEmployeeDeductionSummary,
} from './payrollIntegration';

// Payroll Engine (Phase 5)
export {
  // Types
  type PayrollMonthStatus,
  type EmploymentType as PayrollEmploymentType,
  type PayrollAuditAction,
  type PayrollSnapshot,
  type FirestorePayrollMonth,
  type FirestorePayrollRecord,
  type FirestorePayrollAuditLog,
  type FirestorePayrollCostSummary,
  type PayrollEmployeeData,
  type EmployeeAttendanceSummary,
  type PayrollCalculationResult,
  type GeneratePayrollOptions,
  type FinalizePayrollOptions,
  type LockPayrollOptions,
  type SalaryStrategy,
  // Collections
  PAYROLL_COLLECTIONS,
  payrollMonthsRef,
  payrollMonthDocRef,
  payrollRecordsRef,
  payrollAuditLogsRef,
  payrollCostSummaryRef,
  // Engine
  generatePayroll,
  getPayrollMonth,
  getPayrollRecords,
  // Strategies
  getStrategy,
  // Finalizer
  finalizePayroll,
  // Locker
  lockPayroll,
  // Audit
  payrollAuditService,
} from './payroll';

// HR Config Module (modular settings)
export {
  // Types
  type HRConfigModuleName,
  type ConfigMetadata,
  type GeneralConfig,
  type AttendanceConfig,
  type OvertimeConfig,
  type LeaveConfig,
  type LoanConfig,
  type PayrollSettingsConfig,
  type ApprovalConfig,
  type TransportZone,
  type TransportConfig,
  type HRConfigMap,
  type HRConfigVersionSnapshot,
  type HRConfigAuditAction,
  type FirestoreHRConfigAuditLog,
  HR_CONFIG_MODULES,
  HR_CONFIG_TABS,
  // Defaults
  HR_CONFIG_DEFAULTS,
  // Collections
  HR_CONFIG_COLLECTIONS,
  hrConfigModulesRef,
  hrConfigModuleDocRef,
  hrConfigAuditLogsRef,
  // Service
  getConfigModule,
  getAllConfigModules,
  updateConfigModule,
  resetConfigModule,
  captureConfigVersionSnapshot,
  initializeConfigModules,
  // Audit
  hrConfigAuditService,
} from './config';

// Vehicle service
export { vehicleService } from './vehicleService';

// Employee Financials (per-employee allowances & deductions)
export {
  employeeAllowanceService,
  employeeDeductionService,
  summarizeAllowances,
  summarizeDeductions,
  syncVehicleDeduction,
} from './employeeFinancialsService';

// Collection references (approval-specific refs exported from ./approval above)
export {
  HR_COLLECTIONS,
  employeesRef,
  departmentsRef,
  jobPositionsRef,
  shiftsRef,
  hrSettingsDocRef,
  penaltyRulesRef,
  lateRulesRef,
  allowanceTypesRef,
  attendanceRawLogsRef,
  attendanceLogsRef,
  leaveRequestsRef,
  leaveBalancesRef,
  employeeLoansRef,
  approvalRequestsRef,
  vehiclesRef,
  employeeAllowancesRef,
  employeeDeductionsRef,
} from './collections';

export * from './components';
export * from './hooks';
export * from './routes';
export { Employees } from './pages/Employees';
export { EmployeeProfile } from './pages/EmployeeProfile';
export { EmployeeSelfService } from './pages/EmployeeSelfService';
