// ─── HR Module Types ────────────────────────────────────────────────────────
// Strict types for all HR Firestore documents and engine inputs/outputs.
// All HR logic depends on employeeId — no duplicated identity structures.

// ─── Enums & Literal Unions ─────────────────────────────────────────────────

export type JobLevel = 1 | 2 | 3 | 4;

export const JOB_LEVEL_LABELS: Record<JobLevel, string> = {
  1: 'Worker',
  2: 'Supervisor',
  3: 'Manager',
  4: 'Executive',
};

export type PenaltyType = 'late' | 'absence' | 'disciplinary';
export type ValueType = 'fixed' | 'percentage';
export type CalculationType = 'fixed' | 'percentage';
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

// ─── Firestore Document Types ───────────────────────────────────────────────

export interface FirestoreDepartment {
  id?: string;
  name: string;
  code: string;
  managerId: string;
  isActive: boolean;
  createdAt?: any;
}

export interface FirestoreJobPosition {
  id?: string;
  title: string;
  departmentId: string;
  level: JobLevel;
  hasSystemAccessDefault: boolean;
  isActive: boolean;
  createdAt?: any;
}

export interface FirestoreShift {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  latestCheckInTime?: string;
  firstCheckOutTime?: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  crossesMidnight: boolean;
  isActive: boolean;
}

export interface FirestoreVehicle {
  id?: string;
  name: string;
  plateNumber: string;
  capacity: number;
  dailyRate: number;
  workingDaysPerMonth: number;
  driverName: string;
  driverPhone: string;
  assignedEmployees: string[];
  notes: string;
  isActive: boolean;
  createdAt?: any;
}

export interface FirestoreHRSettings {
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  weeklyOffDays: DayOfWeek[];
  overtimeMultiplier: number;
  allowNegativeSalary: boolean;
  autoClosePayrollMonth: boolean;
  minimumRestHoursBetweenShifts: number;
  useMultipleShifts: boolean;
}

export interface FirestorePenaltyRule {
  id?: string;
  name: string;
  type: PenaltyType;
  valueType: ValueType;
  value: number;
  isActive: boolean;
}

export interface FirestoreLateRule {
  id?: string;
  minutesFrom: number;
  minutesTo: number;
  penaltyType: ValueType;
  penaltyValue: number;
}

export interface FirestoreAllowanceType {
  id?: string;
  name: string;
  calculationType: CalculationType;
  value: number;
  isActive: boolean;
}

// ─── Engine Input/Output Types ──────────────────────────────────────────────

export interface WorkingMinutesResult {
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
}

export interface LateDetectionResult {
  isLate: boolean;
  lateMinutes: number;
  withinGrace: boolean;
  matchedRule: FirestoreLateRule | null;
}

export interface EarlyLeaveResult {
  isEarly: boolean;
  earlyMinutes: number;
}

export interface AbsenceResult {
  isAbsent: boolean;
  deductionMinutes: number;
}

export interface PenaltyResult {
  amount: number;
  appliedRule: string;
  type: PenaltyType;
}

export interface AllowanceResult {
  name: string;
  amount: number;
}

export interface AllowanceSummary {
  items: AllowanceResult[];
  total: number;
}

export interface NetSalaryResult {
  baseSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  totalPenalties: number;
  netSalary: number;
}

// ─── Attendance Types ───────────────────────────────────────────────────────

export type {
  AttendanceLog,
  AttendanceRecord,
  AttendanceSyncPayload,
  ZKTecoRawRecord,
} from '@/modules/attendance/types';

export type AttendanceSource = 'zk_csv' | 'manual';

export interface FirestoreAttendanceRawLog {
  id?: string;
  employeeCode: string;
  timestamp: any;
  deviceId: string;
  importedBatchId: string;
  createdAt?: any;
}

export interface FirestoreAttendanceLog {
  id?: string;
  employeeId: string;
  date: string;
  shiftId: string;
  checkIn: any;
  checkOut: any | null;
  totalMinutes: number;
  totalHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isAbsent: boolean;
  isIncomplete: boolean;
  isWeeklyOff: boolean;
  createdFrom: AttendanceSource;
  processedBatchId: string;
  createdAt?: any;
}

export interface FirestoreAttendanceImportHistory {
  id?: string;
  batchId: string;
  fileName: string;
  importedBy: string;
  importedByName: string;
  importedAt: any;
  totalPunches: number;
  processedRecords: number;
  unmatchedCodes: string[];
  format: 'zk_standard' | 'zk_export';
  status: 'completed' | 'partial';
}

/** A single row parsed from the ZKTeco CSV file */
export interface ZKRawPunch {
  employeeCode: string;
  timestamp: Date;
  deviceId: string;
}

/** Result of CSV parsing before processing */
export interface CSVParseResult {
  punches: ZKRawPunch[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
  errors: string[];
}

/** Mapping from device employee code to Firestore employeeId */
export type EmployeeCodeMap = Record<string, string>;

/** Grouped punches for a single employee on a single work date */
export interface EmployeeDayGroup {
  employeeId: string;
  employeeCode: string;
  workDate: string;
  punches: Date[];
}

/** Result of processing a single employee's day */
export interface ProcessedAttendanceRecord {
  employeeId: string;
  employeeCode: string;
  date: string;
  shiftId: string;
  checkIn: Date;
  checkOut: Date | null;
  totalMinutes: number;
  totalHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isAbsent: boolean;
  isIncomplete: boolean;
  isWeeklyOff: boolean;
}

/** Full result of batch processing */
export interface AttendanceBatchResult {
  batchId: string;
  processedDate: Date;
  records: ProcessedAttendanceRecord[];
  totalProcessed: number;
  unmatchedCodes: string[];
  errors: string[];
}

// ─── Approval Workflow Types ────────────────────────────────────────────────

export type ApprovalRequestType = 'overtime' | 'leave' | 'loan';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalChainItem {
  approverEmployeeId: string;
  level: JobLevel;
  status: ApprovalStatus;
  actionDate: any | null;
  notes: string;
}

/**
 * Re-export from the enterprise approval module for backward compatibility.
 * New code should import directly from `modules/hr/approval`.
 */
export type { FirestoreApprovalRequest } from './approval/types';

// ─── Leave Management Types ─────────────────────────────────────────────────

export type LeaveType = string;

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'سنوية',
  sick: 'مرضية',
  unpaid: 'بدون راتب',
  emergency: 'طارئة',
};

export interface FirestoreLeaveRequest {
  id?: string;
  employeeId: string;
  leaveType: LeaveType;
  leaveTypeLabel?: string;
  leaveTypeIsPaid?: boolean;
  startDate: string;
  endDate: string;
  totalDays: number;
  affectsSalary: boolean;
  status: ApprovalStatus;
  approvalChain: ApprovalChainItem[];
  finalStatus: ApprovalStatus;
  reason: string;
  createdAt?: any;
  createdBy: string;
}

export interface FirestoreLeaveBalance {
  id?: string;
  employeeId: string;
  annualBalance: number;
  sickBalance: number;
  unpaidTaken: number;
  emergencyBalance: number;
  lastUpdated?: any;
}

export const DEFAULT_LEAVE_BALANCE: Omit<FirestoreLeaveBalance, 'id' | 'employeeId'> = {
  annualBalance: 21,
  sickBalance: 14,
  unpaidTaken: 0,
  emergencyBalance: 5,
};

// ─── Loan Management Types ──────────────────────────────────────────────────

export type LoanStatus = 'pending' | 'active' | 'closed';
export type LoanType = 'monthly_advance' | 'installment';

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  monthly_advance: 'سلفة شهرية',
  installment: 'سلفة مقسطة',
};

export interface FirestoreEmployeeLoan {
  id?: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  loanType: LoanType;
  loanAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  remainingInstallments: number;
  startMonth: string;
  status: LoanStatus;
  approvalChain: ApprovalChainItem[];
  finalStatus: ApprovalStatus;
  reason: string;
  disbursed: boolean;
  disbursedAt?: any;
  disbursedBy?: string;
  disbursedByName?: string;
  month?: string;
  createdAt?: any;
  createdBy: string;
}

export interface LoanInstallment {
  loanId: string;
  employeeId: string;
  installmentAmount: number;
  remainingInstallments: number;
}

// ─── Employee-Specific Allowances & Deductions ──────────────────────────────

export type EmployeeFinancialStatus = 'active' | 'stopped';

export interface FirestoreEmployeeAllowance {
  id?: string;
  employeeId: string;
  allowanceTypeId: string;
  allowanceTypeName: string;
  amount: number;
  isRecurring: boolean;
  startMonth: string;
  endMonth: string | null;
  status: EmployeeFinancialStatus;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

export type DeductionCategory = 'manual' | 'disciplinary' | 'transport' | 'override' | 'other';

export interface FirestoreEmployeeDeduction {
  id?: string;
  employeeId: string;
  deductionTypeId: string;
  deductionTypeName: string;
  amount: number;
  isRecurring: boolean;
  startMonth: string;
  endMonth: string | null;
  reason: string;
  category: DeductionCategory;
  status: EmployeeFinancialStatus;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface HRNotification {
  id?: string;
  recipientEmployeeId: string;
  recipientUserId: string;
  type: 'new_approval_request' | 'request_approved' | 'request_rejected' | 'payroll_ready';
  title: string;
  body: string;
  requestId?: string;
  read: boolean;
  actionUrl: string;
  createdAt: any;
}

export interface FirestorePayrollDistribution {
  id?: string;
  month: string;
  distributedAt: any;
  distributedBy: string;
  distributedByName: string;
  employeeCount: number;
  status: 'distributed' | 'pending_disbursement' | 'disbursed';
}

export interface EmployeeAllowanceSummary {
  items: { name: string; amount: number; isRecurring: boolean }[];
  total: number;
}

export interface EmployeeDeductionSummary {
  items: { name: string; amount: number; isRecurring: boolean; reason: string }[];
  total: number;
}

export type PerformanceGrade = 'A' | 'B' | 'C' | 'D';

export interface FirestoreEmployeePerformance {
  id?: string;
  employeeId: string;
  employeeName: string;
  month: string;
  attendanceScore: number;
  punctualityScore: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  workingDays: number;
  productivityScore: number;
  behaviorScore: number;
  overallScore: number;
  grade: PerformanceGrade;
  bonusEligible: boolean;
  bonusAmount: number;
  bonusApproved: boolean;
  bonusApprovedBy?: string;
  bonusApprovedAt?: any;
  notes: string;
  evaluatedBy: string;
  evaluatedAt: any;
  createdAt?: any;
}
