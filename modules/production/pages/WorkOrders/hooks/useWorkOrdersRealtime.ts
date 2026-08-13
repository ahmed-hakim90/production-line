import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db, isConfigured } from '../../../../auth/services/firebase';
import type { WorkOrder, WorkOrderStatus } from '../../../../../types';
import { normalizeFirestoreSearch } from '@/lib/firestoreSearch';

const COLLECTION_NAME = 'work_orders';
const DEFAULT_PAGE_SIZE = 20;

export interface WorkOrderRealtimeFilters {
  tenantId?: string | null;
  status?: WorkOrderStatus | 'all' | null;
  lineId?: string | 'all' | null;
  supervisorId?: string | null;
  dateRange?: { from?: string | null; to?: string | null } | null;
  search?: string | null;
}

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

const makeBaseConstraints = (filters: WorkOrderRealtimeFilters): QueryConstraint[] => {
  const constraints: QueryConstraint[] = [];
  let hasTargetDateRange = false;
  if (filters.status && filters.status !== 'all') constraints.push(where('status', '==', filters.status));
  if (filters.lineId && filters.lineId !== 'all') constraints.push(where('lineId', '==', filters.lineId));
  if (filters.supervisorId) constraints.push(where('supervisorId', '==', filters.supervisorId));
  const search = normalizeFirestoreSearch(filters.search);
  if (search.length >= 2) constraints.push(where('searchPrefixes', 'array-contains', search));
  if (filters.dateRange?.from) {
    constraints.push(where('targetDate', '>=', filters.dateRange.from));
    hasTargetDateRange = true;
  }
  if (filters.dateRange?.to) {
    constraints.push(where('targetDate', '<=', filters.dateRange.to));
    hasTargetDateRange = true;
  }
  if (hasTargetDateRange) constraints.push(orderBy('targetDate', 'asc'));
  constraints.push(orderBy('createdAt', 'desc'), orderBy(documentId()));
  return constraints;
};

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
  pageIndexRef.current = pageIndex;

  const safePageSize = Math.max(1, Math.min(pageSize, 50));
  const tenantId = filters.tenantId ?? null;
  const status = filters.status ?? 'all';
  const lineId = filters.lineId ?? 'all';
  const supervisorId = filters.supervisorId ?? null;
  const dateFrom = filters.dateRange?.from ?? null;
  const dateTo = filters.dateRange?.to ?? null;
  const search = filters.search ?? '';
  const baseConstraints = useMemo(() => makeBaseConstraints({
    status, lineId, supervisorId, dateRange: { from: dateFrom, to: dateTo }, search,
  }), [status, lineId, supervisorId, dateFrom, dateTo, search]);

  useEffect(() => {
    pagesRef.current = [];
    setPageIndex(0);
    setOrders([]);
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
    setLoading(true);
    const firstPageQuery = query(
      collection(db, COLLECTION_NAME),
      where('tenantId', '==', tenantId),
      ...baseConstraints,
      limit(safePageSize + 1),
    );
    return onSnapshot(firstPageQuery, { includeMetadataChanges: true }, (snap) => {
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
      console.error('useWorkOrdersRealtime snapshot error:', snapshotError);
      setError('تعذر تحميل أوامر الشغل في الوقت الحقيقي.');
      setLoading(false);
    });
  }, [baseConstraints, safePageSize, tenantId]);

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
        ...baseConstraints,
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
  }, [baseConstraints, hasMore, loadingMore, pageIndex, safePageSize, tenantId]);

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
