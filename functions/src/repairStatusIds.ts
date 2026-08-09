/** Keep in sync with modules/repair/utils/repairStatusIds.ts */
const LEGACY_REPAIR_STATUS_MAP: Record<string, string> = {
  inspection: 'diagnosing',
  repair: 'repairing',
};

export function mapLegacyRepairStatus(status: string | undefined | null): string {
  const s = String(status || '').trim();
  return LEGACY_REPAIR_STATUS_MAP[s] || s;
}
