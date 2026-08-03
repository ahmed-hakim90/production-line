import { getLastVisitedTenantSlug } from './lastTenantSlugStorage';
import { defaultTenantSlug, tenantHomePath } from './tenantPaths';

export type PreferredTenantSlugInput = {
  /** Injected for tests; defaults to localStorage last-visited slug. */
  lastVisitedSlug?: string | null;
  /** Injected for tests; defaults to VITE_DEFAULT_TENANT_SLUG / built-in default. */
  envDefaultSlug?: string;
};

/**
 * Prefer the last visited tenant slug when safe; otherwise env/default slug.
 * Never invent a tenant when a known slug is available.
 */
export function resolvePreferredTenantSlug(input: PreferredTenantSlugInput = {}): string {
  const last =
    input.lastVisitedSlug !== undefined
      ? (input.lastVisitedSlug || '').trim()
      : (getLastVisitedTenantSlug() || '').trim();
  if (last) return last;
  const envDefault = (input.envDefaultSlug ?? defaultTenantSlug()).trim();
  return envDefault || defaultTenantSlug();
}

export function resolvePreferredTenantHomePath(input: PreferredTenantSlugInput = {}): string {
  return tenantHomePath(resolvePreferredTenantSlug(input));
}

/** Detect stale-chunk / dynamic import failures (deploy + SW cache). */
export function isDynamicImportLoadFailure(reason: unknown): boolean {
  const msg =
    typeof reason === 'string'
      ? reason
      : (reason as { message?: string })?.message || '';
  const lower = msg.toLowerCase();
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('failed to load module script') ||
    (lower.includes('mime type') && lower.includes('module')) ||
    (lower.includes('loading chunk') && lower.includes('failed'))
  );
}
