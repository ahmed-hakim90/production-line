/** Shared TTL so concurrent dashboard mounts reuse one in-flight snapshot fetch. */
export const OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS = 45_000;

const CACHE_KEY_PREFIX = 'dashboard:operational-decision-snapshot:v5';

/** Tenant-scoped cache key — shared across all dashboard shells that mount this hook. */
export function resolveOperationalDecisionSnapshotCacheKey(tenantId: string | null): string {
  return `${CACHE_KEY_PREFIX}:${tenantId || 'none'}`;
}
