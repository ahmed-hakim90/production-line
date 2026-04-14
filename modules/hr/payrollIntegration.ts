/**
 * Payroll Integration — Functions consumed by the Payroll Engine.
 *
 * These bridge the Leave, Loan, and Employee Financials modules into payroll processing.
 * Pure data retrieval — the Payroll Engine decides how to apply them.
 */
import { leaveRequestService } from './leaveService';
import { loanService } from './loanService';
import {
  employeeAllowanceService,
  employeeDeductionService,
  summarizeAllowances,
  summarizeDeductions,
} from './employeeFinancialsService';
import type {
  FirestoreLeaveRequest,
  FirestoreEmployeeAllowance,
  FirestoreEmployeeDeduction,
  EmployeeAllowanceSummary,
  EmployeeDeductionSummary,
  LoanInstallment,
} from './types';

/**
 * Get all approved leaves for an employee within a payroll month.
 */
export async function getApprovedLeaves(
  employeeId: string,
  month: string,
): Promise<FirestoreLeaveRequest[]> {
  const trimmed = month.trim();
  const ym = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (!ym) return [];
  const year = Number(ym[1]);
  const mon = Number(ym[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) return [];
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return leaveRequestService.getApprovedByEmployeeAndRange(
    employeeId,
    startDate,
    endDate,
  );
}

/**
 * Get active loan installments for an employee (for monthly deduction).
 */
export async function getActiveLoanInstallments(
  employeeId: string,
  _month: string,
): Promise<LoanInstallment[]> {
  return loanService.getActiveInstallments(employeeId);
}

/**
 * Get employee-specific allowances applicable for a given month.
 */
export async function getEmployeeAllowancesForMonth(
  employeeId: string,
  month: string,
): Promise<FirestoreEmployeeAllowance[]> {
  return employeeAllowanceService.getByEmployeeAndMonth(employeeId, month);
}

/**
 * Get employee-specific deductions applicable for a given month.
 */
export async function getEmployeeDeductionsForMonth(
  employeeId: string,
  month: string,
): Promise<FirestoreEmployeeDeduction[]> {
  return employeeDeductionService.getByEmployeeAndMonth(employeeId, month);
}

/**
 * Get summarized employee allowances for a payroll month.
 */
export async function getEmployeeAllowanceSummary(
  employeeId: string,
  month: string,
): Promise<EmployeeAllowanceSummary> {
  const allowances = await getEmployeeAllowancesForMonth(employeeId, month);
  return summarizeAllowances(allowances);
}

/**
 * Get summarized employee deductions for a payroll month.
 */
export async function getEmployeeDeductionSummary(
  employeeId: string,
  month: string,
): Promise<EmployeeDeductionSummary> {
  const deductions = await getEmployeeDeductionsForMonth(employeeId, month);
  return summarizeDeductions(deductions);
}
