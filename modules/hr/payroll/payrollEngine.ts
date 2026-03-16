/**
 * Payroll Engine — Core generation logic
 *
 * Responsibilities:
 *   - Generate payroll for a given month (draft status only)
 *   - Process employees in batches (chunk size configurable, default 50)
 *   - Calculate per-employee payroll using strategy pattern
 *   - Integrate attendance, leaves, loans, penalties, allowances
 *   - Store results in payroll_records
 *   - Create/update payroll_months document
 *
 * Safety: generation only allowed when month status = draft (or new).
 * Existing draft records are deleted before regeneration.
 */
import {
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import {
  payrollMonthsRef,
  payrollRecordsRef,
  PAYROLL_COLLECTIONS,
} from './collections';
import {
  attendanceLogsRef,
  penaltyRulesRef,
  lateRulesRef,
  allowanceTypesRef,
  hrSettingsDocRef,
} from '../collections';
import {
  getApprovedLeaves,
  getActiveLoanInstallments,
  getEmployeeAllowanceSummary,
  getEmployeeDeductionSummary,
} from '../payrollIntegration';
import { applyAllowances, calculatePenalty } from '../hrEngine';
import { getStrategy } from './salaryStrategies';
import { payrollAuditService } from './payrollAudit';
import type {
  FirestorePayrollMonth,
  FirestorePayrollRecord,
  PayrollEmployeeData,
  PayrollCalculationResult,
  EmployeeAttendanceSummary,
  GeneratePayrollOptions,
} from './types';
import type {
  FirestoreHRSettings,
  FirestorePenaltyRule,
  FirestoreLateRule,
  FirestoreAllowanceType,
  FirestoreAttendanceLog,
} from '../types';
import { captureConfigVersionSnapshot } from '../config/configService';
import { getConfigModule } from '../config';
import { attendanceProcessingService } from '@/modules/attendance/services/attendanceProcessingService';
import type { AttendanceRecord } from '@/modules/attendance/types';
import type { LeaveConfig, LeaveTypeDefinition } from '../config/types';

const DEFAULT_BATCH_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMonthDateRange(month: string): { startDate: string; endDate: string } {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Split an array into chunks */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Data Fetching ──────────────────────────────────────────────────────────

async function fetchHRSettings(): Promise<FirestoreHRSettings | null> {
  if (!isConfigured) return null;
  const snap = await getDoc(hrSettingsDocRef());
  return snap.exists() ? (snap.data() as FirestoreHRSettings) : null;
}

async function fetchPenaltyRules(): Promise<FirestorePenaltyRule[]> {
  if (!isConfigured) return [];
  const snap = await getDocs(query(penaltyRulesRef(), where('isActive', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestorePenaltyRule));
}

async function fetchLateRules(): Promise<FirestoreLateRule[]> {
  if (!isConfigured) return [];
  const snap = await getDocs(query(lateRulesRef(), orderBy('minutesFrom', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLateRule));
}

async function fetchAllowanceTypes(): Promise<FirestoreAllowanceType[]> {
  if (!isConfigured) return [];
  const snap = await getDocs(query(allowanceTypesRef(), where('isActive', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAllowanceType));
}

async function fetchAttendanceForMonth(month: string): Promise<FirestoreAttendanceLog[]> {
  if (!isConfigured) return [];
  const { startDate, endDate } = getMonthDateRange(month);
  const q = query(
    attendanceLogsRef(),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAttendanceLog));
}

/** Build attendance summary per employee from attendance logs */
function buildAttendanceSummaries(
  logs: FirestoreAttendanceLog[],
  hrSettings: FirestoreHRSettings,
): Map<string, EmployeeAttendanceSummary> {
  const map = new Map<string, EmployeeAttendanceSummary>();

  for (const log of logs) {
    if (log.isWeeklyOff) continue;

    let summary = map.get(log.employeeId);
    if (!summary) {
      summary = {
        workingDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        totalLateMinutes: 0,
        totalOvertimeHours: 0,
      };
      map.set(log.employeeId, summary);
    }

    summary.workingDays++;
    if (log.isAbsent) {
      summary.absentDays++;
    } else {
      summary.presentDays++;
      const expectedMinutes = hrSettings.workingHoursPerDay * 60;
      if (log.totalMinutes > expectedMinutes) {
        summary.totalOvertimeHours += (log.totalMinutes - expectedMinutes) / 60;
      }
    }
    if (log.lateMinutes > 0) {
      summary.lateDays++;
      summary.totalLateMinutes += log.lateMinutes;
    }
  }

  return map;
}

function buildAttendanceSummariesFromRecords(
  records: AttendanceRecord[],
  hrSettings: FirestoreHRSettings,
): Map<string, EmployeeAttendanceSummary> {
  const map = new Map<string, EmployeeAttendanceSummary>();
  for (const record of records) {
    let summary = map.get(record.employeeId);
    if (!summary) {
      summary = {
        workingDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        totalLateMinutes: 0,
        totalOvertimeHours: 0,
      };
      map.set(record.employeeId, summary);
    }

    summary.workingDays += 1;
    if (record.status === 'absent') {
      summary.absentDays += 1;
    } else {
      summary.presentDays += 1;
      const overtimeMinutes = Math.max(
        0,
        Number(record.overtimeMinutes || 0),
      );
      if (overtimeMinutes > 0) {
        summary.totalOvertimeHours += overtimeMinutes / 60;
      } else {
        const expectedMinutes = hrSettings.workingHoursPerDay * 60;
        if (record.workedMinutes > expectedMinutes) {
          summary.totalOvertimeHours += (record.workedMinutes - expectedMinutes) / 60;
        }
      }
    }
    if (record.lateMinutes > 0) {
      summary.lateDays += 1;
      summary.totalLateMinutes += record.lateMinutes;
    }
  }
  return map;
}

// ─── Per-Employee Calculation ───────────────────────────────────────────────

async function calculateEmployeePayroll(
  employee: PayrollEmployeeData,
  attendance: EmployeeAttendanceSummary,
  month: string,
  hrSettings: FirestoreHRSettings,
  leaveTypeConfig: LeaveTypeDefinition[],
  penaltyRules: FirestorePenaltyRule[],
  lateRules: FirestoreLateRule[],
  allowanceTypes: FirestoreAllowanceType[],
): Promise<PayrollCalculationResult> {
  const strategy = getStrategy(employee.employmentType);

  // 1. Base salary
  const baseSalary = strategy.calculateBase(
    employee,
    attendance.workingDays,
    attendance.presentDays,
  );

  // 2. Absence deduction
  const absenceDeduction = strategy.calculateAbsenceDeduction(
    employee,
    attendance.absentDays,
    attendance.workingDays,
  );

  // 3. Overtime (approved hours only)
  const overtimeAmount = strategy.calculateOvertime(
    employee,
    attendance.totalOvertimeHours,
    hrSettings.overtimeMultiplier,
  );

  // 4. Leave impact — reads leave type config salary impact
  const approvedLeaves = await getApprovedLeaves(employee.employeeId, month);
  const leaveConfig = leaveTypeConfig ?? [];
  const dailyRate = employee.baseSalary / (attendance.workingDays || 30);
  let leaveDeduction = 0;
  let unpaidLeaveDays = 0;
  for (const leave of approvedLeaves) {
    const leaveDef = leaveConfig.find((lt) => lt.type === leave.leaveType);
    const impact = leaveDef?.salaryImpact
      ?? (leave.leaveType === 'unpaid' || leave.affectsSalary ? 'unpaid' : 'full_paid');

    switch (impact) {
      case 'full_paid':
        break;
      case 'deduct_daily':
        leaveDeduction += Math.round(dailyRate * leave.totalDays * 100) / 100;
        unpaidLeaveDays += leave.totalDays;
        break;
      case 'deduct_percent':
        leaveDeduction += Math.round(
          (employee.baseSalary * (leaveDef?.deductPercent ?? 0) / 100)
          * (leave.totalDays / (attendance.workingDays || 30)) * 100,
        ) / 100;
        unpaidLeaveDays += leave.totalDays;
        break;
      case 'unpaid':
        leaveDeduction += Math.round(dailyRate * leave.totalDays * 100) / 100;
        unpaidLeaveDays += leave.totalDays;
        break;
    }
  }
  const unpaidLeaveDeduction = Math.round(leaveDeduction * 100) / 100;

  // 5. Loan installments
  const installments = await getActiveLoanInstallments(employee.employeeId, month);
  const loanInstallment = installments.reduce((sum, i) => sum + i.installmentAmount, 0);

  // 6. Late penalties
  let latePenalty = 0;
  if (attendance.lateDays > 0 && lateRules.length > 0) {
    const avgLateMinutes = Math.round(attendance.totalLateMinutes / attendance.lateDays);
    const matchedRule = lateRules.find(
      (r) => avgLateMinutes >= r.minutesFrom && avgLateMinutes <= r.minutesTo,
    );
    if (matchedRule) {
      latePenalty = matchedRule.penaltyType === 'fixed'
        ? matchedRule.penaltyValue * attendance.lateDays
        : (employee.baseSalary * matchedRule.penaltyValue / 100) * attendance.lateDays;
      latePenalty = Math.round(latePenalty * 100) / 100;
    }
  }

  // Other penalties (disciplinary, etc.)
  let otherPenalties = 0;
  const disciplinaryRules = penaltyRules.filter((r) => r.type === 'disciplinary');
  for (const rule of disciplinaryRules) {
    const result = calculatePenalty(rule, employee.baseSalary);
    otherPenalties += result.amount;
  }

  // 7. Global allowances (from allowance_types collection)
  const allowanceSummary = applyAllowances(employee.baseSalary, allowanceTypes);

  // 8. Employee-specific allowances & deductions
  const [empAllowanceSummary, empDeductionSummary] = await Promise.all([
    getEmployeeAllowanceSummary(employee.employeeId, month),
    getEmployeeDeductionSummary(employee.employeeId, month),
  ]);

  // 9. Transport is tracked on vehicles page but NOT deducted from employee salary
  const transportDeduction = 0;

  // Calculate totals
  const grossSalary = Math.round(
    (baseSalary + overtimeAmount + allowanceSummary.total + empAllowanceSummary.total) * 100,
  ) / 100;

  const totalDeductions = Math.round(
    (absenceDeduction + latePenalty + loanInstallment + otherPenalties +
      unpaidLeaveDeduction + empDeductionSummary.total) * 100,
  ) / 100;

  const netSalary = hrSettings.allowNegativeSalary
    ? Math.round((grossSalary - totalDeductions) * 100) / 100
    : Math.max(0, Math.round((grossSalary - totalDeductions) * 100) / 100);

  return {
    baseSalary,
    overtimeHours: Math.round(attendance.totalOvertimeHours * 100) / 100,
    overtimeAmount,
    allowancesTotal: allowanceSummary.total,
    allowancesBreakdown: allowanceSummary.items,
    employeeAllowancesTotal: empAllowanceSummary.total,
    employeeAllowancesBreakdown: empAllowanceSummary.items,
    workingDays: attendance.workingDays,
    presentDays: attendance.presentDays,
    absentDays: attendance.absentDays,
    lateDays: attendance.lateDays,
    absenceDeduction,
    latePenalty,
    loanInstallment,
    otherPenalties,
    transportDeduction,
    unpaidLeaveDays,
    unpaidLeaveDeduction,
    employeeDeductionsTotal: empDeductionSummary.total,
    employeeDeductionsBreakdown: empDeductionSummary.items,
    grossSalary,
    totalDeductions,
    netSalary,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getPayrollMonth(month: string): Promise<FirestorePayrollMonth | null> {
  if (!isConfigured) return null;
  const q = query(payrollMonthsRef(), where('month', '==', month));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as FirestorePayrollMonth;
}

export async function getPayrollRecords(payrollMonthId: string): Promise<FirestorePayrollRecord[]> {
  if (!isConfigured) return [];
  const q = query(
    payrollRecordsRef(),
    where('payrollMonthId', '==', payrollMonthId),
    orderBy('employeeName', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestorePayrollRecord));
}

/**
 * Get employee payslip only from locked payroll months.
 * Enforces lock guard at service level, not UI only.
 */
export async function getEmployeeLockedPayslip(
  employeeId: string,
  month?: string,
): Promise<{ month: FirestorePayrollMonth; record: FirestorePayrollRecord } | null> {
  if (!isConfigured || !employeeId) return null;

  const getRecordForMonth = async (payrollMonth: FirestorePayrollMonth) => {
    if (!payrollMonth.id) return null;
    const recSnap = await getDocs(
      query(
        payrollRecordsRef(),
        where('payrollMonthId', '==', payrollMonth.id),
        where('employeeId', '==', employeeId),
        limit(1),
      ),
    );
    if (recSnap.empty) return null;
    return {
      month: payrollMonth,
      record: { id: recSnap.docs[0].id, ...recSnap.docs[0].data() } as FirestorePayrollRecord,
    };
  };

  if (month) {
    const payrollMonth = await getPayrollMonth(month);
    if (!payrollMonth?.id || payrollMonth.status !== 'locked') {
      return null;
    }
    return getRecordForMonth(payrollMonth);
  }

  const lockedMonthsSnap = await getDocs(
    query(
      payrollMonthsRef(),
      where('status', '==', 'locked'),
      orderBy('month', 'desc'),
      limit(24),
    ),
  );

  for (const monthDoc of lockedMonthsSnap.docs) {
    const lockedMonth = { id: monthDoc.id, ...monthDoc.data() } as FirestorePayrollMonth;
    const result = await getRecordForMonth(lockedMonth);
    if (result) return result;
  }

  return null;
}

/** Delete all draft payroll records for a month */
async function deleteDraftRecords(payrollMonthId: string): Promise<number> {
  if (!isConfigured) return 0;
  const q = query(
    payrollRecordsRef(),
    where('payrollMonthId', '==', payrollMonthId),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const CHUNK = 500;
  const docs = snap.docs;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const batchChunk = docs.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const d of batchChunk) batch.delete(d.ref);
    await batch.commit();
    deleted += batchChunk.length;
  }

  return deleted;
}

/**
 * Generate payroll for a month.
 *
 * Rules:
 *   - Only allowed if month status = draft or month doesn't exist
 *   - Deletes existing draft records before regeneration
 *   - Processes employees in batches
 */
export async function generatePayroll(
  options: GeneratePayrollOptions,
): Promise<{ payrollMonthId: string; totalProcessed: number; totalGross: number; totalNet: number; totalDeductions: number }> {
  if (!isConfigured) throw new Error('Firebase not configured');

  const { month, generatedBy, employees, leaveTypeConfig, batchSize = DEFAULT_BATCH_SIZE } = options;

  // Check existing month status
  const existing = await getPayrollMonth(month);
  if (existing && existing.status !== 'draft') {
    throw new Error(
      existing.status === 'finalized'
        ? 'لا يمكن إعادة احتساب رواتب شهر مُعتمد. يجب أن يكون الشهر في حالة مسودة.'
        : 'لا يمكن تعديل رواتب شهر مقفل.',
    );
  }

  // Fetch all required data in parallel (including config version snapshot)
  const leaveConfigPromise = leaveTypeConfig
    ? Promise.resolve(leaveTypeConfig)
    : getConfigModule('leave').then((config) => (config as LeaveConfig | null)?.leaveTypes ?? []);
  const [hrSettings, leaveConfig, penaltyRules, lateRules, allowanceTypes, attendanceLogs, attendanceRecords, configVersionSnapshot] =
    await Promise.all([
      fetchHRSettings(),
      leaveConfigPromise,
      fetchPenaltyRules(),
      fetchLateRules(),
      fetchAllowanceTypes(),
      fetchAttendanceForMonth(month),
      attendanceProcessingService.getRecordsForMonth(month),
      captureConfigVersionSnapshot(),
    ]);

  if (!hrSettings) throw new Error('إعدادات الموارد البشرية غير متوفرة. يرجى ضبط الإعدادات أولاً.');

  // Build attendance summaries
  const attendanceMap = attendanceRecords.length > 0
    ? buildAttendanceSummariesFromRecords(attendanceRecords, hrSettings)
    : buildAttendanceSummaries(attendanceLogs, hrSettings);

  // Default working days for employees without attendance
  const { startDate, endDate } = getMonthDateRange(month);
  const [, mon] = month.split('-').map(Number);
  const [yr] = month.split('-').map(Number);
  const totalCalendarDays = new Date(yr, mon, 0).getDate();
  const offDaysPerWeek = hrSettings.weeklyOffDays.length;
  const defaultWorkingDays = Math.round(totalCalendarDays * (7 - offDaysPerWeek) / 7);

  // Create or update payroll month doc
  let payrollMonthId: string;
  if (existing?.id) {
    payrollMonthId = existing.id;
    await deleteDraftRecords(payrollMonthId);
  } else {
    const docRef = await addDoc(payrollMonthsRef(), {
      month,
      status: 'draft',
      totalEmployees: 0,
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      generatedAt: serverTimestamp(),
      finalizedAt: null,
      lockedAt: null,
      generatedBy,
      finalizedBy: null,
      lockedBy: null,
      snapshotVersion: null,
      snapshot: null,
      configVersionSnapshot,
    } satisfies Omit<FirestorePayrollMonth, 'id'>);
    payrollMonthId = docRef.id;
  }

  // Process employees in batches
  const employeeBatches = chunk(employees, batchSize);
  let totalProcessed = 0;
  let totalGross = 0;
  let totalNet = 0;
  let totalDeductions = 0;

  for (const batch of employeeBatches) {
    const calculations = await Promise.all(
      batch.map(async (employee) => {
        const attendance = attendanceMap.get(employee.employeeId) ?? {
          workingDays: defaultWorkingDays,
          presentDays: defaultWorkingDays,
          absentDays: 0,
          lateDays: 0,
          totalLateMinutes: 0,
          totalOvertimeHours: 0,
        };

        const result = await calculateEmployeePayroll(
          employee,
          attendance,
          month,
          hrSettings,
          leaveConfig,
          penaltyRules,
          lateRules,
          allowanceTypes,
        );

        return { employee, result };
      }),
    );

    // Write batch to Firestore
    const firestoreBatch = writeBatch(db);
    for (const { employee, result } of calculations) {
      const ref = doc(payrollRecordsRef());
      firestoreBatch.set(ref, {
        payrollMonthId,
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        departmentId: employee.departmentId,
        costCenterId: employee.costCenterId,
        productionLineId: employee.productionLineId,
        employmentType: employee.employmentType,
        ...result,
        isLocked: false,
        calculationSnapshotVersion: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } satisfies Omit<FirestorePayrollRecord, 'id'>);

      totalGross += result.grossSalary;
      totalNet += result.netSalary;
      totalDeductions += result.totalDeductions;
      totalProcessed++;
    }
    await firestoreBatch.commit();
  }

  // Update month totals
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, PAYROLL_COLLECTIONS.PAYROLL_MONTHS, payrollMonthId), {
    totalEmployees: totalProcessed,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    generatedAt: serverTimestamp(),
    generatedBy,
  });

  // Audit log
  await payrollAuditService.log(
    payrollMonthId,
    existing ? 'recalculate' : 'generate',
    generatedBy,
    `تم ${existing ? 'إعادة احتساب' : 'إنشاء'} كشف رواتب شهر ${month} — ${totalProcessed} موظف`,
  );

  return {
    payrollMonthId,
    totalProcessed,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
  };
}
