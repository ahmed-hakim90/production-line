/**
 * Remember last visited tenant slug so PWA / root `/` can open `/t/{slug}/…`
 * instead of the marketing landing (manifest start_url is `/`).
 *
 * localStorage + cookie: iOS standalone PWA sometimes partitions storage;
 * a path=/ cookie survives Add to Home Screen more reliably.
 */
const KEY = 'Factory_erp_last_tenant_slug';
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~13 months

function isSafeTenantSlugSegment(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 128) return false;
  if (t.includes('/') || t.includes('\\') || t.includes('..')) return false;
  return true;
}

function readCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey !== name) continue;
      return decodeURIComponent(rest.join('=') || '');
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  try {
    if (typeof document === 'undefined') return;
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

function clearCookie(name: string): void {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function getLastVisitedTenantSlug(): string | null {
  try {
    const fromLs = localStorage.getItem(KEY)?.trim();
    if (fromLs && isSafeTenantSlugSegment(fromLs)) return fromLs;
  } catch {
    /* ignore */
  }
  const fromCookie = readCookie(KEY)?.trim();
  if (fromCookie && isSafeTenantSlugSegment(fromCookie)) {
    // Rehydrate localStorage when cookie survived but LS did not (common on iOS PWA).
    try {
      localStorage.setItem(KEY, fromCookie);
    } catch {
      /* ignore */
    }
    return fromCookie;
  }
  return null;
}

export function setLastVisitedTenantSlug(slug: string): void {
  const s = String(slug || '').trim();
  if (!s || !isSafeTenantSlugSegment(s)) return;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* ignore */
  }
  writeCookie(KEY, s);
}

export function clearLastVisitedTenantSlug(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  clearCookie(KEY);
}

/** If stored slug matches this path slug, clear (breaks root↔bad-slug redirect loop). */
export function clearLastVisitedTenantSlugIfMatches(pathSlug: string): void {
  const stored = getLastVisitedTenantSlug();
  const p = String(pathSlug || '').trim();
  if (stored && p && stored === p) clearLastVisitedTenantSlug();
}
