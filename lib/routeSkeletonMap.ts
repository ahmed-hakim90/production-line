import type { AppRouteDef } from '@/modules/shared/routes/types';
import type { PageSkeletonVariant } from '@/src/shared/ui/skeletons';
import { stripTenantSegmentFromPathname } from '@/core/ui-engine/theme/tenantTheme';

const FORM_PATH_SUFFIXES = ['/new', '/import', '/movements', '/setup'];
const FORM_STATIC_SEGMENTS = new Set([
  'new',
  'import',
  'settings',
  'movements',
  'setup',
  'logs',
  'daily',
  'monthly',
  'sync',
  'analytics',
  'exceptions',
  'warehouses',
  'balances',
  'transactions',
  'counts',
  'jobs',
  'parts',
  'branches',
  'treasury',
  'employees',
  'organization',
  'payroll',
  'vehicles',
  'evaluations',
  'transactions',
  'readiness',
  'users',
  'roles',
  'reports',
  'plans',
  'routing',
  'materials',
  'categories',
  'deposits',
  'health',
  'assets',
  'scanner',
]);

const DETAIL_PARENT_SEGMENTS = new Set([
  'products',
  'lines',
  'supervisors',
  'production-workers',
  'employees',
  'materials',
  'assets',
  'cost-centers',
  'jobs',
  'supply-cycles',
  'deposits',
  'routing',
  'execution',
  'work-orders',
]);

/**
 * Infer skeleton layout from logical path when route metadata omits `skeleton`.
 */
export function inferPageSkeletonVariant(logicalPath: string): PageSkeletonVariant {
  const path = logicalPath.split('?')[0] || '/';
  const normalized = path === '' ? '/' : path;

  if (normalized === '/' || /dashboard/i.test(normalized)) {
    return 'dashboard';
  }

  if (normalized.includes('/workspace')) {
    return 'detail';
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const last = segments[segments.length - 1]!;
    const parent = segments[segments.length - 2]!;
    if (
      DETAIL_PARENT_SEGMENTS.has(parent) &&
      !FORM_STATIC_SEGMENTS.has(last) &&
      !FORM_PATH_SUFFIXES.some((s) => normalized.endsWith(s))
    ) {
      return 'detail';
    }
  }

  if (
    FORM_PATH_SUFFIXES.some((s) => normalized.endsWith(s)) ||
    segments.some((seg) => seg === 'settings' || seg === 'movements' || seg === 'setup')
  ) {
    return 'form';
  }

  return 'list';
}

export function buildRouteSkeletonMap(routes: AppRouteDef[]): Map<string, PageSkeletonVariant> {
  const map = new Map<string, PageSkeletonVariant>();
  for (const route of routes) {
    if (!route.path || route.redirectTo) continue;
    const variant = route.skeleton ?? inferPageSkeletonVariant(route.path);
    map.set(route.path, variant);
  }
  return map;
}

export function resolvePageSkeletonVariant(
  pathname: string,
  routeMap: Map<string, PageSkeletonVariant>,
  override?: PageSkeletonVariant,
): PageSkeletonVariant {
  if (override) return override;
  const logical = stripTenantSegmentFromPathname(pathname);
  if (routeMap.has(logical)) {
    return routeMap.get(logical)!;
  }
  const entries = [...routeMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, variant] of entries) {
    if (prefix !== '/' && logical.startsWith(prefix)) {
      return variant;
    }
  }
  return inferPageSkeletonVariant(logical);
}
