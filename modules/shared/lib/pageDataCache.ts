/**
 * Session page-data cache: keeps list/detail payloads across route remounts
 * so revisiting a page does not blank the UI while refreshing.
 */

export type PageDataCacheOptions = {
  force?: boolean;
  /** Default 60s — operational lists stay reasonably fresh. */
  maxAgeMs?: number;
};

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const DEFAULT_MAX_AGE_MS = 60_000;
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function peekPageDataCache<T>(key: string): T | null {
  const entry = cache.get(key);
  return entry ? (entry.data as T) : null;
}

export function getPageDataCacheAgeMs(key: string): number | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return Date.now() - entry.fetchedAt;
}

export function isPageDataCacheFresh(key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  const age = getPageDataCacheAgeMs(key);
  return age != null && age < maxAgeMs;
}

export function setPageDataCache<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

export function invalidatePageDataCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    cache.clear();
    inflight.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) inflight.delete(key);
  }
}

/**
 * Fetch with TTL + in-flight dedupe. Returns cached data immediately when fresh
 * unless `force` is set.
 */
export async function fetchCachedPageData<T>(
  key: string,
  loader: () => Promise<T>,
  options: PageDataCacheOptions = {},
): Promise<{ data: T; fromCache: boolean }> {
  const force = options.force === true;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cached = cache.get(key) as CacheEntry<T> | undefined;

  if (!force && cached && Date.now() - cached.fetchedAt < maxAgeMs) {
    return { data: cached.data, fromCache: true };
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    const data = await existing;
    return { data, fromCache: false };
  }

  const pending = (async () => {
    const data = await loader();
    cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  })();

  inflight.set(key, pending);
  try {
    const data = await pending;
    return { data, fromCache: false };
  } finally {
    inflight.delete(key);
  }
}
