/**
 * Payroll Finalizer — Freezes payroll with snapshot protection.
 *
 * Finalization rules:
 *   - Only HR or Admin can finalize
 *   - Status must be draft
 *   - Calculates month totals
 *   - Creates snapshot of all settings used
 *   - Freezes all payroll_records
 *   - Sets status = finalized
 *   - Writes audit log
 *
 * After finalization: no recalculation, no editing.
 */
import {
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import {
  payrollRecordsRef,
  payrollCostSummaryRef,
  PAYROLL_COLLECTIONS,
} from './collections';
import {
  penaltyRulesRef,
  lateRulesRef,
  allowanceTypesRef,
  hrSettingsDocRef,
  hrSettingsLegacyDocRef,
} from '../collections';
import { getPayrollMonth, getPayrollRecords } from './payrollEngine';
import { payrollAuditService } from './payrollAudit';
import type {
  FinalizePayrollOptions,
  PayrollSnapshot,
  FirestorePayrollRecord,
  FirestorePayrollCostSummary,
} from './types';
import type {
  FirestoreHRSettings,
  FirestorePenaltyRule,
  FirestoreLateRule,
  FirestoreAllowanceType,
} from '../types';
import { captureConfigVersionSnapshot } from '../config/configService';

/** Generate a unique snapshot version identifier */
function generateSnapshotVersion(): string {
  return `v${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a snapshot of current HR settings for preservation */
async function createSnapshot(): Promise<PayrollSnapshot> {
  const [settingsSnap, legacySettingsSnap, penaltySnap, lateSnap, allowanceSnap] = await Promise.all([
    getDoc(hrSettingsDocRef()),
    getDoc(hrSettingsLegacyDocRef()),
    getDocs(penaltyRulesRef()),
    getDocs(lateRulesRef()),
    getDocs(allowanceTypesRef()),
  ]);

  const settings = settingsSnap.exists()
    ? (settingsSnap.data() as FirestoreHRSettings)
    : legacySettingsSnap.exists()
      ? (legacySettingsSnap.data() as FirestoreHRSettings)
      : null;

  return {
    version: generateSnapshotVersion(),
    overtimeMultiplier: settings?.overtimeMultiplier ?? 1.5,
    lateRules: lateSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLateRule)),
    penaltyRules: penaltySnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestorePenaltyRule)),
    allowanceTypes: allowanceSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAllowanceType)),
    workingDaysPerWeek: settings?.workingDaysPerWeek ?? 6,
    workingHoursPerDay: settings?.workingHoursPerDay ?? 8,
    weeklyOffDays: settings?.weeklyOffDays ?? ['friday'],
    allowNegativeSalary: settings?.allowNegativeSalary ?? false,
  };
}

/** Aggregate cost per department+costCenter+productionLine */
function aggregateCosts(
  records: FirestorePayrollRecord[],
): Map<string, { departmentId: string; costCenterId: string; productionLineId: string | null; totalGross: number; totalNet: number; totalDeductions: number; employeeCount: number }> {
  const map = new Map<string, {
    departmentId: string;
    costCenterId: string;
    productionLineId: string | null;
    totalGross: number;
    totalNet: number;
    totalDeductions: number;
    employeeCount: number;
  }>();

  for (const rec of records) {
    const key = `${rec.departmentId}|${rec.costCenterId}|${rec.productionLineId ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalGross += rec.grossSalary;
      existing.totalNet += rec.netSalary;
      existing.totalDeductions += rec.totalDeductions;
      existing.employeeCount++;
    } else {
      map.set(key, {
        departmentId: rec.departmentId,
        costCenterId: rec.costCenterId,
        productionLineId: rec.productionLineId,
        totalGross: rec.grossSalary,
        totalNet: rec.netSalary,
        totalDeductions: rec.totalDeductions,
        employeeCount: 1,
      });
    }
  }

  return map;
}

/**
 * Finalize payroll for a month.
 */
export async function finalizePayroll(
  options: FinalizePayrollOptions,
): Promise<{ success: boolean; snapshotVersion: string }> {
  if (!isConfigured) throw new Error('Firebase not configured');

  const { month, finalizedBy } = options;

  // Validate month exists and is draft
  const payrollMonth = await getPayrollMonth(month);
  if (!payrollMonth?.id) {
    throw new Error('لم يتم العثور على كشف رواتب لهذا الشهر. يرجى إنشاء الكشف أولاً.');
  }
  if (payrollMonth.status === 'finalized') {
    throw new Error('كشف الرواتب مُعتمد بالفعل.');
  }
  if (payrollMonth.status === 'locked') {
    throw new Error('كشف الرواتب مقفل ولا يمكن تعديله.');
  }

  // Create snapshot (settings + config versions)
  const [snapshot, configVersionSnapshot] = await Promise.all([
    createSnapshot(),
    captureConfigVersionSnapshot(),
  ]);

  // Get all records
  const records = await getPayrollRecords(payrollMonth.id);
  if (records.length === 0) {
    throw new Error('لا توجد سجلات رواتب في هذا الشهر.');
  }

  // Freeze all records (mark with snapshot version + lock employee financials)
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batchChunk = records.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const rec of batchChunk) {
      if (!rec.id) continue;
      batch.update(doc(db, PAYROLL_COLLECTIONS.PAYROLL_RECORDS, rec.id), {
        calculationSnapshotVersion: snapshot.version,
        isLocked: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // Calculate totals
  const totalGross = records.reduce((sum, r) => sum + r.grossSalary, 0);
  const totalNet = records.reduce((sum, r) => sum + r.netSalary, 0);
  const totalDeductions = records.reduce((sum, r) => sum + r.totalDeductions, 0);

  // Update payroll month
  await updateDoc(
    doc(db, PAYROLL_COLLECTIONS.PAYROLL_MONTHS, payrollMonth.id),
    {
      status: 'finalized',
      totalEmployees: records.length,
      totalGross: Math.round(totalGross * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      finalizedAt: serverTimestamp(),
      finalizedBy,
      snapshotVersion: snapshot.version,
      snapshot,
      configVersionSnapshot,
    },
  );

  // Write cost summaries
  const costAggregations = aggregateCosts(records);
  for (const [, agg] of costAggregations) {
    await addDoc(payrollCostSummaryRef(), {
      payrollMonthId: payrollMonth.id,
      month,
      departmentId: agg.departmentId,
      departmentName: '',
      costCenterId: agg.costCenterId,
      productionLineId: agg.productionLineId,
      totalGross: Math.round(agg.totalGross * 100) / 100,
      totalNet: Math.round(agg.totalNet * 100) / 100,
      totalDeductions: Math.round(agg.totalDeductions * 100) / 100,
      employeeCount: agg.employeeCount,
      createdAt: serverTimestamp(),
    } satisfies Omit<FirestorePayrollCostSummary, 'id'>);
  }

  // Audit log
  await payrollAuditService.log(
    payrollMonth.id,
    'finalize',
    finalizedBy,
    `تم اعتماد كشف رواتب شهر ${month} — ${records.length} موظف — النسخة: ${snapshot.version}`,
  );

  return { success: true, snapshotVersion: snapshot.version };
}
