import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCachedPageData,
  peekPageDataCache,
  type PageDataCacheOptions,
} from '../lib/pageDataCache';

export type UseCachedPageLoadResult<T> = {
  data: T | null;
  /** True only when there is no cached data to show yet. */
  loading: boolean;
  /** True while a background refresh is in flight with visible data. */
  refreshing: boolean;
  error: string | null;
  reload: (force?: boolean) => Promise<void>;
};

/**
 * Stale-while-revalidate page load: shows cached data instantly on revisit,
 * refreshes in the background without blanking the screen.
 */
export function useCachedPageLoad<T>(
  key: string | null,
  loader: () => Promise<T>,
  options: PageDataCacheOptions & { enabled?: boolean } = {},
): UseCachedPageLoadResult<T> {
  const enabled = options.enabled !== false && Boolean(key);
  const maxAgeMs = options.maxAgeMs;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [data, setData] = useState<T | null>(() =>
    key ? peekPageDataCache<T>(key) : null,
  );
  const [loading, setLoading] = useState(() => {
    if (!enabled || !key) return false;
    return peekPageDataCache<T>(key) == null;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (force = false) => {
      if (!key || !enabled) return;
      const cached = peekPageDataCache<T>(key);
      if (cached != null) {
        setData(cached);
        setRefreshing(true);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await fetchCachedPageData(key, () => loaderRef.current(), {
          force,
          maxAgeMs,
        });
        setData(result.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key, enabled, maxAgeMs],
  );

  useEffect(() => {
    if (!enabled || !key) return;
    const cached = peekPageDataCache<T>(key);
    if (cached != null) setData(cached);
    void reload(false);
  }, [key, enabled, reload]);

  return { data, loading, refreshing, error, reload };
}
