// ─── Payroll Module Types ───────────────────────────────────────────────────
// Enterprise payroll types: months, records, audit, cost summaries, snapshots.
// All payroll engine logic depends on these strict interfaces.

import type {
  FirestoreLateRule,
  FirestorePenaltyRule,
  FirestoreAllowanceType,
  AllowanceResult,
  DayOfWeek,
} from '../types';
import type { HRConfigVersionSnapshot, LeaveTypeDefinition } from '../config/types';

// ─── Enums & Literal Unions ─────────────────────────────────────────────────

export type PayrollMonthStatus = 'draft' | 'finalized' | 'locked';
export type EmploymentType = 'monthly' | 'daily' | 'hourly';
export type PayrollAuditAction = 'generate' | 'recalculate' | 'finalize' | 'lock' | 'edit';

// ─── Payroll Snapshot (frozen settings at finalization) ─────────────────────

export interface PayrollSnapshot {
  version: string;
  overtimeMultiplier: number;
  lateRules: FirestoreLateRule[];
  penaltyRules: FirestorePenaltyRule[];
  allowanceTypes: FirestoreAllowanceType[];
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  weeklyOffDays: DayOfWeek[];
  allowNegativeSalary: boolean;
}

// ─── Firestore: Payroll Month ──────────────────────────────────────────────

export interface FirestorePayrollMonth {
  id?: string;
  month: string;
  status: PayrollMonthStatus;
  totalEmployees: number;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  generatedAt: any;
  finalizedAt: any | null;
  lockedAt: any | null;
  generatedBy: string;
  finalizedBy: string | null;
  lockedBy: string | null;
  snapshotVersion: string | null;
  snapshot: PayrollSnapshot | null;
  configVersionSnapshot: HRConfigVersionSnapshot | null;
}

// ─── Firestore: Payroll Record (per employee per month) ────────────────────

export interface FirestorePayrollRecord {
  id?: string;
  payrollMonthId: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  costCenterId: string;
  productionLineId: string | null;
  employmentType: EmploymentType;

  // Earnings
  baseSalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  allowancesTotal: number;
  allowancesBreakdown: AllowanceResult[];
  employeeAllowancesTotal: number;
  employeeAllowancesBreakdown: { name: string; amount: number; isRecurring: boolean }[];

  // Attendance summary
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;

  // Deductions
  absenceDeduction: number;
  latePenalty: number;
  loanInstallment: number;
  otherPenalties: number;
  transportDeduction: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  employeeDeductionsTotal: number;
  employeeDeductionsBreakdown: { name: string; amount: number; isRecurring: boolean; reason: string }[];

  // Summary
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;

  // Meta
  isLocked: boolean;
  calculationSnapshotVersion: string | null;
  createdAt: any;
  updatedAt: any;
}

// ─── Firestore: Payroll Audit Log ──────────────────────────────────────────

export interface FirestorePayrollAuditLog {
  id?: string;
  payrollMonthId: string;
  action: PayrollAuditAction;
  performedBy: string;
  timestamp: any;
  details: string;
}

// ─── Firestore: Payroll Cost Summary ───────────────────────────────────────

export interface FirestorePayrollCostSummary {
  id?: string;
  payrollMonthId: string;
  month: string;
  departmentId: string;
  departmentName: string;
  costCenterId: string;
  productionLineId: string | null;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  employeeCount: number;
  createdAt: any;
}

// ─── Engine Input: Employee Data for Payroll ───────────────────────────────

export interface PayrollEmployeeData {
  employeeId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  costCenterId: string;
  productionLineId: string | null;
  employmentType: EmploymentType;
  baseSalary: number;
  transportDeduction: number;
  dailyRate?: number;
  hourlyRate?: number;
}

// ─── Engine Input: Attendance Summary per Employee ─────────────────────────

export interface EmployeeAttendanceSummary {
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  totalOvertimeHours: number;
}

// ─── Engine Output: Calculation Result ─────────────────────────────────────

export interface PayrollCalculationResult {
  baseSalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  allowancesTotal: number;
  allowancesBreakdown: AllowanceResult[];
  employeeAllowancesTotal: number;
  employeeAllowancesBreakdown: { name: string; amount: number; isRecurring: boolean }[];
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  absenceDeduction: number;
  latePenalty: number;
  loanInstallment: number;
  otherPenalties: number;
  transportDeduction: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  employeeDeductionsTotal: number;
  employeeDeductionsBreakdown: { name: string; amount: number; isRecurring: boolean; reason: string }[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}

// ─── Generation Options ────────────────────────────────────────────────────

export interface GeneratePayrollOptions {
  month: string;
  generatedBy: string;
  employees: PayrollEmployeeData[];
  leaveTypeConfig?: LeaveTypeDefinition[];
  batchSize?: number;
}

export interface FinalizePayrollOptions {
  month: string;
  finalizedBy: string;
}

export interface LockPayrollOptions {
  month: string;
  lockedBy: string;
}
