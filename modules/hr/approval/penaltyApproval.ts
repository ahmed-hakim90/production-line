import type { FirestoreEmployee } from '@/types';
import type { FirestoreEmployeeDeduction } from '../types';
import type { FirestoreApprovalRequest } from './types';

const ROUND_TO_CENTS = 100;

export const PENALTY_DURATION_PRESETS = [
  { days: 0.125, label: '١/٨ يوم' },
  { days: 0.25, label: 'ربع يوم' },
  { days: 0.5, label: 'نصف يوم' },
  { days: 1, label: 'يوم' },
  { days: 3, label: '٣ أيام' },
] as const;

export type PenaltyAmountSource = 'legacy_amount' | 'base_salary_daily_rate' | 'duration_only';

export function normalizePenaltyDurationDays(value: unknown): number {
  const days = Number(value || 0);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round(days * 1000) / 1000;
}

export function formatPenaltyDuration(days: unknown): string {
  const normalizedDays = normalizePenaltyDurationDays(days);
  if (normalizedDays <= 0) return '';

  const preset = PENALTY_DURATION_PRESETS.find((row) => row.days === normalizedDays);
  if (preset) return preset.label;

  if (normalizedDays === 2) return 'يومان';
  const value = normalizedDays.toLocaleString('ar-EG', { maximumFractionDigits: 3 });
  return `${value} ${normalizedDays >= 3 && normalizedDays <= 10 ? 'أيام' : 'يوم'}`;
}

export function getPenaltyDurationLabel(data: Record<string, any>): string {
  const explicitLabel = String(data.penaltyDurationLabel || '').trim();
  if (explicitLabel) return explicitLabel;
  return formatPenaltyDuration(data.penaltyDurationDays);
}

export function formatPenaltyRequestSummary(data: Record<string, any>): string {
  const name = String(data.penaltyName || 'جزاء');
  const durationLabel = getPenaltyDurationLabel(data);
  const amount = Number(data.penaltyAmount || data.penaltyCalculatedAmount || data.amount || 0);

  if (durationLabel) {
    const amountText = amount > 0 ? ` — ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م` : '';
    return `${name} — ${durationLabel}${amountText}`;
  }

  if (amount > 0) return `${name} — ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;
  return name;
}

export function calculatePenaltyAmountFromDuration(
  durationDays: unknown,
  employee?: Pick<FirestoreEmployee, 'baseSalary'> | null,
): { amount: number; dailyRate: number } | null {
  const days = normalizePenaltyDurationDays(durationDays);
  const baseSalary = Number(employee?.baseSalary || 0);
  if (days <= 0 || baseSalary <= 0) return null;

  const dailyRate = Math.round((baseSalary / 30) * ROUND_TO_CENTS) / ROUND_TO_CENTS;
  if (dailyRate <= 0) return null;

  return {
    amount: Math.round(dailyRate * days * ROUND_TO_CENTS) / ROUND_TO_CENTS,
    dailyRate,
  };
}

type PenaltyDeductionInput = Omit<FirestoreEmployeeDeduction, 'id' | 'createdAt' | 'updatedAt'> & {
  penaltyDurationDays?: number;
  penaltyDurationLabel?: string;
  penaltyDailyRate?: number;
  penaltyAmountSource?: PenaltyAmountSource;
};

export function buildPenaltyDeductionInput(
  request: Pick<FirestoreApprovalRequest, 'id' | 'employeeId' | 'createdBy' | 'requestData'>,
  employee?: Pick<FirestoreEmployee, 'baseSalary'> | null,
): PenaltyDeductionInput | null {
  const data = request.requestData || {};
  if (data.deductionId) return null;

  const legacyAmount = Number(data.penaltyAmount || data.amount || 0);
  const durationDays = normalizePenaltyDurationDays(data.penaltyDurationDays);
  const durationLabel = getPenaltyDurationLabel(data);
  const calculated = legacyAmount > 0 ? null : calculatePenaltyAmountFromDuration(durationDays, employee);
  const amount = legacyAmount > 0 ? legacyAmount : calculated?.amount ?? 0;
  const amountSource: PenaltyAmountSource = legacyAmount > 0
    ? 'legacy_amount'
    : calculated
      ? 'base_salary_daily_rate'
      : 'duration_only';
  const startMonth = String(data.startMonth || data.month || '').trim();
  if (!request.id || !request.employeeId || (!durationDays && amount <= 0) || !startMonth) return null;

  return {
    employeeId: request.employeeId,
    deductionTypeId: `approval_penalty_${request.id}`,
    deductionTypeName: String(data.penaltyName || 'جزاء تأديبي'),
    amount,
    isRecurring: false,
    startMonth,
    endMonth: null,
    reason: String(data.reason || '—'),
    category: 'disciplinary',
    status: 'active',
    createdBy: String(data.requestedByEmployeeId || request.createdBy || ''),
    ...(durationDays > 0 ? { penaltyDurationDays: durationDays } : {}),
    ...(durationLabel ? { penaltyDurationLabel: durationLabel } : {}),
    ...(calculated?.dailyRate ? { penaltyDailyRate: calculated.dailyRate } : {}),
    penaltyAmountSource: amountSource,
  };
}
