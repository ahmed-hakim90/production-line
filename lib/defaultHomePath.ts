import type { Permission } from '../utils/permissions';

/** Logical paths allowed as tenant default home (no open redirect). */
export const ALLOWED_DEFAULT_HOME_LOGICAL_PATHS = ['', '/'] as const;

export type AllowedDefaultHomeLogicalPath = (typeof ALLOWED_DEFAULT_HOME_LOGICAL_PATHS)[number];

export function normalizeDefaultHomeLogicalPath(raw: string | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const withSlash = t.startsWith('/') ? t : `/${t}`;
  const noTrail = withSlash.replace(/\/+$/, '');
  if (noTrail === '') return '/';
  return noTrail;
}

/** Returns logical path to navigate to, or null to use HomeDashboardRouter. */
export function resolveDefaultHomeLogicalPath(
  raw: string | undefined,
  _can: (p: Permission) => boolean,
): string | null {
  const n = normalizeDefaultHomeLogicalPath(raw);
  // Only '' and '/' are allowlisted today → always use role dashboards.
  // When new paths are added to ALLOWED_DEFAULT_HOME_LOGICAL_PATHS, return them
  // here after a permission check via `_can`.
  if (!n || n === '/') return null;
  if (!(ALLOWED_DEFAULT_HOME_LOGICAL_PATHS as readonly string[]).includes(n)) {
    return null;
  }
  return null;
}
