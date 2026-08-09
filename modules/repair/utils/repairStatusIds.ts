/**
 * Canonical repair job status IDs vs legacy aliases still stored in some tenants.
 * Keep this file free of repairSettings imports to avoid circular deps.
 */
export const LEGACY_REPAIR_STATUS_MAP: Record<string, string> = {
  inspection: 'diagnosing',
  repair: 'repairing',
};

export function mapLegacyRepairStatus(status: string | undefined | null): string {
  const s = String(status || '').trim();
  return LEGACY_REPAIR_STATUS_MAP[s] || s;
}

/** True when two status ids refer to the same workflow step (legacy or canonical). */
export function isSameRepairStatus(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  return mapLegacyRepairStatus(a) === mapLegacyRepairStatus(b);
}
