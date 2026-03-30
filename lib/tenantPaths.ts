export const defaultTenantSlug = (): string =>
  import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'default';

export const tenantLoginPath = (tenantSlug?: string): string =>
  `/t/${tenantSlug || defaultTenantSlug()}/login`;

export const tenantHomePath = (tenantSlug?: string): string =>
  `/t/${tenantSlug || defaultTenantSlug()}/`;

/**
 * Protected app routes live under `/t/:tenantSlug/...`. Menu config and most `navigate('/x')`
 * calls use logical paths (`/`, `/products`). This maps them to the real URL.
 */
export function withTenantPath(tenantSlug: string | undefined, logicalPath: string): string {
  const slug = (tenantSlug && tenantSlug.trim()) || defaultTenantSlug();
  const raw = logicalPath.trim() || '/';
  const qIndex = raw.indexOf('?');
  const pathPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex) : '';
  const p = pathPart || '/';
  const suffix = p === '/' ? '/' : (p.startsWith('/') ? p : `/${p}`);
  const base = `/t/${slug}${suffix === '/' ? '/' : suffix}`;
  return `${base}${query}`;
}

/** Strip `/t/:tenantSlug` so `/t/acme/products` → `/products` (for menu active state). */
export function logicalPathnameFromLocation(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 't') {
    const rest = parts.slice(2);
    if (rest.length === 0) return '/';
    return `/${rest.join('/')}`;
  }
  return pathname;
}
