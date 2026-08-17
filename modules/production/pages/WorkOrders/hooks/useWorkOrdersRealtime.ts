import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db, isConfigured } from '../../../../auth/services/firebase';
import type { WorkOrder } from '../../../../../types';
import {
  isWorkOrderRealtimeIndexError,
  makeBaseConstraints,
  resolveWorkOrderRealtimeSearchKey,
  type WorkOrderRealtimeFilters,
} from './workOrderRealtimeQuery';

export {
  isWorkOrderRealtimeIndexError,
  makeBaseConstraints,
  resolveWorkOrderRealtimeSearchKey,
  type WorkOrderRealtimeFilters,
};

const COLLECTION_NAME = 'work_orders';
const DEFAULT_PAGE_SIZE = 20;

interface CachedWorkOrderPage {
  orders: WorkOrder[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasNext: boolean;
}

interface UseWorkOrdersRealtimeResult {
  orders: WorkOrder[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  hasPrevious: boolean;
  page: number;
  error: string | null;
  loadMore: () => Promise<void>;
  loadPrevious: () => void;
}

const toWorkOrder = (docSnap: QueryDocumentSnapshot<DocumentData>): WorkOrder => ({
  id: docSnap.id,
  ...(docSnap.data() as WorkOrder),
});

const toPage = (docs: QueryDocumentSnapshot<DocumentData>[], pageSize: number): CachedWorkOrderPage => {
  const hasNext = docs.length > pageSize;
  const visible = hasNext ? docs.slice(0, pageSize) : docs;
  return {
    orders: visible.map(toWorkOrder),
    nextCursor: visible.length > 0 ? visible[visible.length - 1]! : null,
    hasNext,
  };
};

/** Realtime is deliberately limited to page one; historical pages are one-shot reads. */
export function useWorkOrdersRealtime(
  filters: WorkOrderRealtimeFilters,
  pageSize: number = DEFAULT_PAGE_SIZE,
): UseWorkOrdersRealtimeResult {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<CachedWorkOrderPage[]>([]);
  const pageIndexRef = useRef(0);
  const activeConstraintsRef = useRef<QueryConstraint[]>([]);
  const loadedCountRef = useRef(0);
  pageIndexRef.current = pageIndex;
  loadedCountRef.current = orders.length;

  const safePageSize = Math.max(1, Math.min(pageSize, 50));
  const tenantId = filters.tenantId ?? null;
  const status = filters.status ?? 'all';
  const lineId = filters.lineId ?? 'all';
  const supervisorId = filters.supervisorId ?? null;
  const dateFrom = filters.dateRange?.from ?? null;
  const dateTo = filters.dateRange?.to ?? null;
  const search = filters.search ?? '';
  const searchKey = resolveWorkOrderRealtimeSearchKey(search);
  const filterSnapshot = useMemo(() => ({
    status, lineId, supervisorId, dateRange: { from: dateFrom, to: dateTo }, search,
  }), [status, lineId, supervisorId, dateFrom, dateTo, search]);
  const baseConstraints = useMemo(
    () => makeBaseConstraints(filterSnapshot),
    [filterSnapshot],
  );
  const fallbackConstraints = useMemo(
    () => makeBaseConstraints(filterSnapshot, { includeSearch: false }),
    [filterSnapshot],
  );

  useEffect(() => {
    pagesRef.current = [];
    setPageIndex(0);
    setHasMore(false);
    setError(null);
    if (!isConfigured || !db) {
      setLoading(false);
      return;
    }
    if (!tenantId) {
      // Auth can hydrate before the tenant profile is ready. Keep the initial
      // loading state and retry when the resolved tenant id reaches this hook.
      setLoading(true);
      return;
    }
    // Keep the current rows visible while a new filter/search query attaches.
    setLoading((current) => current || loadedCountRef.current === 0);

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let usedSearchFallback = false;

    const listen = (constraints: QueryConstraint[]) => {
      if (!db) return;
      activeConstraintsRef.current = constraints;
      const firstPageQuery = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        ...constraints,
        limit(safePageSize + 1),
      );
      unsubscribe = onSnapshot(firstPageQuery, { includeMetadataChanges: true }, (snap) => {
        if (cancelled) return;
        const page = toPage(snap.docs, safePageSize);
        pagesRef.current[0] = page;
        if (pageIndexRef.current === 0) {
          setOrders(page.orders);
          setHasMore(page.hasNext);
        }
        // Firestore may emit an empty cache snapshot before the server result.
        // Do not present that provisional state as a confirmed empty list.
        if (!snap.metadata.fromCache || page.orders.length > 0) {
          setLoading(false);
        }
      }, (snapshotError) => {
        if (cancelled) return;
        const canFallbackToClientSearch = Boolean(searchKey)
          && !usedSearchFallback
          && isWorkOrderRealtimeIndexError(snapshotError);
        if (canFallbackToClientSearch) {
          usedSearchFallback = true;
          unsubscribe?.();
          listen(fallbackConstraints);
          return;
        }
        console.error('useWorkOrdersRealtime snapshot error:', snapshotError);
        setError('تعذر تحميل أوامر الشغل في الوقت الحقيقي.');
        setLoading(false);
      });
    };

    listen(baseConstraints);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [baseConstraints, fallbackConstraints, safePageSize, searchKey, tenantId]);

  const loadMore = useCallback(async () => {
    if (!isConfigured || !db || !tenantId || loadingMore || !hasMore) return;
    const nextIndex = pageIndex + 1;
    const cached = pagesRef.current[nextIndex];
    if (cached) {
      setPageIndex(nextIndex);
      setOrders(cached.orders);
      setHasMore(cached.hasNext);
      return;
    }
    const current = pagesRef.current[pageIndex];
    if (!current?.nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextQuery = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        ...activeConstraintsRef.current,
        startAfter(current.nextCursor),
        limit(safePageSize + 1),
      );
      const snap = await getDocs(nextQuery);
      const page = toPage(snap.docs, safePageSize);
      pagesRef.current = [...pagesRef.current.slice(0, nextIndex), page];
      setPageIndex(nextIndex);
      setOrders(page.orders);
      setHasMore(page.hasNext);
    } catch (loadError) {
      console.error('useWorkOrdersRealtime next page error:', loadError);
      setError('تعذر تحميل صفحة أوامر الشغل التالية.');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, pageIndex, safePageSize, tenantId]);

  const loadPrevious = useCallback(() => {
    if (loadingMore || pageIndex === 0) return;
    const previous = pagesRef.current[pageIndex - 1];
    if (!previous) return;
    setPageIndex((value) => value - 1);
    setOrders(previous.orders);
    setHasMore(previous.hasNext);
  }, [loadingMore, pageIndex]);

  return {
    orders,
    loading,
    loadingMore,
    hasMore,
    hasPrevious: pageIndex > 0,
    page: pageIndex + 1,
    error,
    loadMore,
    loadPrevious,
  };
}
