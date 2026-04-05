/**
 * Remember last visited tenant slug so PWA / root `/` can open `/t/{slug}/…`
 * instead of the marketing landing (manifest start_url is `/`).
 */
const KEY = 'hakim_erp_last_tenant_slug';

function isSafeTenantSlugSegment(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 128) return false;
  if (t.includes('/') || t.includes('\\') || t.includes('..')) return false;
  return true;
}

export function getLastVisitedTenantSlug(): string | null {
  try {
    const v = localStorage.getItem(KEY)?.trim();
    if (!v || !isSafeTenantSlugSegment(v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function setLastVisitedTenantSlug(slug: string): void {
  try {
    const s = String(slug || '').trim();
    if (!s || !isSafeTenantSlugSegment(s)) return;
    localStorage.setItem(KEY, s);
  } catch {
    /* ignore */
  }
}

export function clearLastVisitedTenantSlug(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** If stored slug matches this path slug, clear (breaks root↔bad-slug redirect loop). */
export function clearLastVisitedTenantSlugIfMatches(pathSlug: string): void {
  const stored = getLastVisitedTenantSlug();
  const p = String(pathSlug || '').trim();
  if (stored && p && stored === p) clearLastVisitedTenantSlug();
}
