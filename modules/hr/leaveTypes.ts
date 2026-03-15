import { getConfigModule } from './config';
import type { LeaveConfig } from './config';

export interface LeaveTypeDefinition {
  key: string;
  label: string;
  isPaid: boolean;
}

export const CORE_LEAVE_TYPE_KEYS = ['annual', 'sick', 'emergency', 'unpaid'] as const;

export const DEFAULT_LEAVE_TYPES: LeaveTypeDefinition[] = [
  { key: 'annual', label: 'سنوية', isPaid: true },
  { key: 'sick', label: 'مرضية', isPaid: true },
  { key: 'emergency', label: 'طارئة', isPaid: true },
  { key: 'unpaid', label: 'بدون راتب', isPaid: false },
];

function normalizeLeaveTypeEntry(entry: Partial<LeaveTypeDefinition>): LeaveTypeDefinition | null {
  const key = String(entry.key || '').trim();
  const label = String(entry.label || '').trim();
  if (!key || !label) return null;
  return {
    key,
    label,
    isPaid: Boolean(entry.isPaid),
  };
}

export function normalizeLeaveTypes(leaveTypes?: LeaveConfig['leaveTypes']): LeaveTypeDefinition[] {
  const fromConfig = (leaveTypes || [])
    .map((entry) => normalizeLeaveTypeEntry(entry))
    .filter((entry): entry is LeaveTypeDefinition => entry !== null);

  const deduped = new Map<string, LeaveTypeDefinition>();
  fromConfig.forEach((entry) => {
    deduped.set(entry.key, entry);
  });

  // Always keep core types as a safe fallback for older data/flows.
  DEFAULT_LEAVE_TYPES.forEach((entry) => {
    if (!deduped.has(entry.key)) {
      deduped.set(entry.key, entry);
    }
  });

  return Array.from(deduped.values());
}

export function leaveTypeMapByKey(leaveTypes: LeaveTypeDefinition[]): Record<string, LeaveTypeDefinition> {
  return Object.fromEntries(leaveTypes.map((entry) => [entry.key, entry]));
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
  const leaveConfig = await getConfigModule('leave');
  return normalizeLeaveTypes(leaveConfig.leaveTypes);
}

