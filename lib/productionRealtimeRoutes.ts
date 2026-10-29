/**
 * Production live listeners (today's reports, line status, all work orders, today's scans)
 * stay on the factory floor and home. Other modules load their own data on demand.
 */
const DEFER_PRODUCTION_REALTIME_PREFIXES = [
  'attendance',
  'system/users',
  'roles',
  'activity-log',
  'settings',
  'dev',
  'hr',
  'repair',
  'customers',
  'accounting',
  'cost-centers',
  'cost-settings',
  'monthly-costs',
  'costs',
  'catalog',
  'products',
  'manufacturing',
  'quality',
  'inventory',
] as const;

export function shouldDeferProductionRealtime(relPath: string | null): boolean {
  if (relPath === null) return true;
  if (!relPath) return false;
  // This screen links open work orders and does not own a separate listener.
  if (relPath === 'inventory/production-issues' || relPath.startsWith('inventory/production-issues/')) {
    return false;
  }
  return DEFER_PRODUCTION_REALTIME_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`),
  );
}
