import type { LeaveConfig, LeaveSalaryImpact } from './config';

export interface LeaveTypeDefinition {
  key: string;
  label: string;
  isPaid: boolean;
  defaultBalance?: number;
}

export interface LeaveReasonDefinition {
  code: string;
  label: string;
}

type LeaveTypeSource = LeaveConfig['leaveTypes'][number] & {
  key?: string;
  label?: string;
  isPaid?: boolean;
};

type LeaveReasonSource = NonNullable<LeaveConfig['leaveReasons']>[number] & {
  label?: string;
};

export const CORE_LEAVE_TYPE_KEYS = ['annual', 'sick', 'emergency', 'unpaid'] as const;

export const DEFAULT_LEAVE_TYPES: LeaveTypeDefinition[] = [
  { key: 'annual', label: 'سنوية', isPaid: true },
  { key: 'sick', label: 'مرضية', isPaid: true },
  { key: 'emergency', label: 'طارئة', isPaid: true },
  { key: 'unpaid', label: 'بدون راتب', isPaid: false },
];

export const DEFAULT_LEAVE_REASONS: LeaveReasonDefinition[] = [
  { code: 'illness', label: 'مرض' },
  { code: 'family_circumstance', label: 'ظرف عائلي' },
  { code: 'emergency', label: 'حالة طارئة' },
  { code: 'personal_errand', label: 'مهمة شخصية' },
  { code: 'travel', label: 'سفر' },
  { code: 'patient_companion', label: 'مرافقة مريض' },
  { code: 'bereavement', label: 'وفاة قريب' },
  { code: 'marriage', label: 'زواج' },
  { code: 'government_documents', label: 'تجديد أوراق حكومية' },
  { code: 'exams_study', label: 'امتحانات / دراسة' },
  { code: 'child_newborn_care', label: 'رعاية طفل / مولود' },
  { code: 'hajj_umrah', label: 'حج / عمرة' },
  { code: 'work_injury', label: 'إصابة عمل' },
  { code: 'maternity', label: 'إجازة أمومة / وضع' },
  { code: 'rest', label: 'راحة' },
];

function impactIsPaid(impact: LeaveSalaryImpact): boolean {
  return impact === 'full_paid';
}

function normalizeLeaveTypeEntry(entry: Partial<LeaveTypeSource>): LeaveTypeDefinition | null {
  const key = String(entry.type || entry.key || '').trim();
  const label = String(entry.labelAr || entry.label || '').trim();
  if (!key || !label) return null;
  const salaryImpact = entry.salaryImpact as LeaveSalaryImpact | undefined;
  const isPaid = typeof entry.isPaid === 'boolean'
    ? entry.isPaid
    : impactIsPaid(salaryImpact || 'full_paid');
  return {
    key,
    label,
    isPaid,
    defaultBalance: Number(entry.defaultBalance || 0),
  };
}

export function normalizeLeaveTypes(leaveTypes?: LeaveConfig['leaveTypes']): LeaveTypeDefinition[] {
  if (leaveTypes === undefined) {
    return [...DEFAULT_LEAVE_TYPES];
  }

  const fromConfig = leaveTypes
    .map((entry) => normalizeLeaveTypeEntry(entry))
    .filter((entry): entry is LeaveTypeDefinition => entry !== null);

  const deduped = new Map<string, LeaveTypeDefinition>();
  fromConfig.forEach((entry) => {
    deduped.set(entry.key, entry);
  });

  return Array.from(deduped.values());
}

export function leaveTypeMapByKey(leaveTypes: LeaveTypeDefinition[]): Record<string, LeaveTypeDefinition> {
  return Object.fromEntries(leaveTypes.map((entry) => [entry.key, entry]));
}

function normalizeLeaveReasonEntry(entry: Partial<LeaveReasonSource>): LeaveReasonDefinition | null {
  const code = String(entry.code || '').trim();
  const label = String(entry.labelAr || entry.label || '').trim();
  if (!code || !label) return null;
  return { code, label };
}

export function normalizeLeaveReasons(leaveReasons?: LeaveConfig['leaveReasons']): LeaveReasonDefinition[] {
  if (leaveReasons === undefined) {
    return [...DEFAULT_LEAVE_REASONS];
  }

  const deduped = new Map<string, LeaveReasonDefinition>();
  leaveReasons
    .map((entry) => normalizeLeaveReasonEntry(entry))
    .filter((entry): entry is LeaveReasonDefinition => entry !== null)
    .forEach((entry) => {
      deduped.set(entry.code, entry);
    });

  return Array.from(deduped.values());
}

export function leaveReasonMapByCode(leaveReasons: LeaveReasonDefinition[]): Record<string, LeaveReasonDefinition> {
  return Object.fromEntries(leaveReasons.map((entry) => [entry.code, entry]));
}

export function getLeaveTypeLabel(
  leaveType: string,
  leaveTypes: LeaveTypeDefinition[],
): string {
  const match = leaveTypes.find((entry) => entry.key === leaveType);
  if (match) return match.label;
  return leaveType;
}

export async function getLeaveTypesFromConfig(): Promise<LeaveTypeDefinition[]> {
  const { getConfigModule } = await import('./config');
  const leaveConfig = await getConfigModule('leave');
  return normalizeLeaveTypes(leaveConfig.leaveTypes);
}

export async function getLeaveReasonsFromConfig(): Promise<LeaveReasonDefinition[]> {
  const { getConfigModule } = await import('./config');
  const leaveConfig = await getConfigModule('leave');
  return normalizeLeaveReasons(leaveConfig.leaveReasons);
}

