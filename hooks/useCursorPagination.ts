import { useCallback, useEffect, useRef, useState } from 'react';

export interface CursorPage<T, TCursor = unknown> {
  items: T[];
  nextCursor: TCursor | null;
  hasNext: boolean;
}

export interface CursorPaginationState<T> {
  items: T[];
  page: number;
  loading: boolean;
  error: unknown;
  hasPrevious: boolean;
  hasNext: boolean;
  next: () => Promise<void>;
  previous: () => void;
  refresh: () => Promise<void>;
}

type CachedPage<T, TCursor> = CursorPage<T, TCursor> & { startCursor: TCursor | null };

/** In-session cursor navigation. Visited pages are reused without a Firestore read. */
export function useCursorPagination<T, TCursor = unknown>(options: {
  queryKey: string;
  loadPage: (cursor: TCursor | null) => Promise<CursorPage<T, TCursor>>;
  enabled?: boolean;
}): CursorPaginationState<T> {
  const { queryKey, loadPage, enabled = true } = options;
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;
  const pagesRef = useRef<Array<CachedPage<T, TCursor>>>([]);
  const requestRef = useRef(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [items, setItems] = useState<T[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);

  const fetchAt = useCallback(async (index: number, cursor: TCursor | null, replace: boolean) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loadPageRef.current(cursor);
      if (requestId !== requestRef.current) return;
      const cached = { ...result, startCursor: cursor };
      if (replace) pagesRef.current[index] = cached;
      else pagesRef.current = [...pagesRef.current.slice(0, index), cached];
      setPageIndex(index);
      setItems(result.items);
      setHasNext(result.hasNext);
    } catch (nextError) {
      if (requestId === requestRef.current) setError(nextError);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    pagesRef.current = [];
    setPageIndex(0);
    setItems([]);
    setHasNext(false);
    setError(null);
    if (!enabled) {
      setLoading(false);
      return;
    }
    void fetchAt(0, null, false);
  }, [enabled, fetchAt, queryKey]);

  const next = useCallback(async () => {
    if (loading || !hasNext) return;
    const nextIndex = pageIndex + 1;
    const cached = pagesRef.current[nextIndex];
    if (cached) {
      setPageIndex(nextIndex);
      setItems(cached.items);
      setHasNext(cached.hasNext);
      setError(null);
      return;
    }
    const current = pagesRef.current[pageIndex];
    if (!current?.nextCursor) return;
    await fetchAt(nextIndex, current.nextCursor, false);
  }, [fetchAt, hasNext, loading, pageIndex]);

  const previous = useCallback(() => {
    if (loading || pageIndex === 0) return;
    const previousIndex = pageIndex - 1;
    const cached = pagesRef.current[previousIndex];
    if (!cached) return;
    setPageIndex(previousIndex);
    setItems(cached.items);
    setHasNext(cached.hasNext);
    setError(null);
  }, [loading, pageIndex]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = pagesRef.current[pageIndex];
    await fetchAt(pageIndex, current?.startCursor ?? null, true);
  }, [enabled, fetchAt, pageIndex]);

  return {
    items,
    page: pageIndex + 1,
    loading,
    error,
    hasPrevious: pageIndex > 0,
    hasNext,
    next,
    previous,
    refresh,
  };
}
