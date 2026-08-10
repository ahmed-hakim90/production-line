/**
 * Tenant activity packs — which module-apps are product-enabled for a company.
 *
 * Missing / empty packs resolve to manufacturing + repair so existing factories
 * keep Production, Inventory, Quality, and Repair without migration.
 *
 * Platform modules (dashboards, system, HR, customers, accounting) stay available
 * whenever the tenant is active; packs only gate domain apps.
 * Manufacturing costing screens live under the Accounting menu but keep `costs.*`
 * permissions (Roles group still pack-gated to manufacturing).
 */

export const ACTIVITY_PACK_IDS = ['manufacturing', 'repair'] as const;

export type ActivityPackId = (typeof ACTIVITY_PACK_IDS)[number];

export const DEFAULT_ACTIVITY_PACKS: readonly ActivityPackId[] = ['manufacturing', 'repair'];

export const ACTIVITY_PACK_LABELS: Record<ActivityPackId, string> = {
  manufacturing: 'التصنيع والإنتاج',
  repair: 'الصيانة ومراكز الخدمة',
};

/** Menu group keys → required packs (any-of). `platform` = always on. */
const MENU_GROUP_PACKS: Record<string, readonly ActivityPackId[] | 'platform'> = {
  dashboards: 'platform',
  catalog: ['manufacturing'],
  production: ['manufacturing'],
  inventory: ['manufacturing', 'repair'],
  quality: ['manufacturing'],
  hr: 'platform',
  customers: 'platform',
  repair: ['repair'],
  accounting: 'platform',
  system: 'platform',
};

/** Permission group keys (Roles UI) → packs. */
const PERMISSION_GROUP_PACKS: Record<string, readonly ActivityPackId[] | 'platform'> = {
  dashboards: 'platform',
  catalog: ['manufacturing'],
  manufacturing: ['manufacturing'],
  production: ['manufacturing'],
  inventory: ['manufacturing', 'repair'],
  quality: ['manufacturing'],
  hr: 'platform',
  customers: 'platform',
  repair: ['repair'],
  accounting: 'platform',
  /** Costing ops stay manufacturing-gated in Roles even though nav lives under الحسابات. */
  costs: ['manufacturing'],
  system: 'platform',
  special: 'platform',
};

export function isActivityPackId(value: unknown): value is ActivityPackId {
  return typeof value === 'string' && (ACTIVITY_PACK_IDS as readonly string[]).includes(value);
}

/**
 * Resolve effective packs for a tenant.
 * Empty / missing → default (manufacturing + repair) — never breaks Production.
 */
export function resolveActivityPacks(raw?: readonly string[] | null): ActivityPackId[] {
  if (!raw || raw.length === 0) {
    return [...DEFAULT_ACTIVITY_PACKS];
  }
  const next = Array.from(new Set(raw.filter(isActivityPackId)));
  return next.length > 0 ? next : [...DEFAULT_ACTIVITY_PACKS];
}

export function tenantHasActivityPack(
  packs: readonly ActivityPackId[],
  pack: ActivityPackId,
): boolean {
  return packs.includes(pack);
}

function packsAllow(
  requirement: readonly ActivityPackId[] | 'platform' | undefined,
  enabled: readonly ActivityPackId[],
): boolean {
  if (!requirement || requirement === 'platform') return true;
  return requirement.some((pack) => enabled.includes(pack));
}

export function isMenuGroupEnabledForPacks(
  menuGroupKey: string,
  enabledPacks: readonly ActivityPackId[],
): boolean {
  return packsAllow(MENU_GROUP_PACKS[menuGroupKey] ?? 'platform', enabledPacks);
}

export function isPermissionGroupEnabledForPacks(
  permissionGroupKey: string,
  enabledPacks: readonly ActivityPackId[],
): boolean {
  return packsAllow(PERMISSION_GROUP_PACKS[permissionGroupKey] ?? 'platform', enabledPacks);
}

/** Sanitize for Firestore write — never persist empty (would look like “no packs”). */
export function sanitizeActivityPacksForWrite(
  raw: readonly string[],
): ActivityPackId[] {
  const next = resolveActivityPacks(raw);
  return next;
}
