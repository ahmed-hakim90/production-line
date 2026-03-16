import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
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

const COLLECTION_NAME = 'work_orders';
const DEFAULT_PAGE_SIZE = 25;

export interface WorkOrderRealtimeFilters {
  status?: WorkOrderStatus | 'all' | null;
  lineId?: string | 'all' | null;
  supervisorId?: string | null;
  dateRange?: {
    from?: string | null;
    to?: string | null;
  } | null;
}

interface UseWorkOrdersRealtimeResult {
  orders: WorkOrder[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
}

const mergeUniqueOrders = (prev: WorkOrder[], next: WorkOrder[]): WorkOrder[] => {
  const map = new Map<string, WorkOrder>();

  for (const order of prev) {
    if (!order.id) continue;
    map.set(order.id, order);
  }

  for (const order of next) {
    if (!order.id) continue;
    map.set(order.id, order);
  }

  return Array.from(map.values());
};

const makeBaseConstraints = (filters: WorkOrderRealtimeFilters): QueryConstraint[] => {
  const constraints: QueryConstraint[] = [];
  let hasTargetDateRange = false;

  if (filters.status && filters.status !== 'all') {
    constraints.push(where('status', '==', filters.status));
  }

  if (filters.lineId && filters.lineId !== 'all') {
    constraints.push(where('lineId', '==', filters.lineId));
  }

  if (filters.supervisorId) {
    constraints.push(where('supervisorId', '==', filters.supervisorId));
  }

  if (filters.dateRange?.from) {
    constraints.push(where('targetDate', '>=', filters.dateRange.from));
    hasTargetDateRange = true;
  }

  if (filters.dateRange?.to) {
    constraints.push(where('targetDate', '<=', filters.dateRange.to));
    hasTargetDateRange = true;
  }

  // Firestore range filters perform best when the same field is the first orderBy.
  if (hasTargetDateRange) {
    constraints.push(orderBy('targetDate', 'asc'));
  }
  constraints.push(orderBy('createdAt', 'desc'));

  return constraints;
};

const toWorkOrder = (docSnap: QueryDocumentSnapshot<DocumentData>): WorkOrder => ({
  id: docSnap.id,
  ...(docSnap.data() as WorkOrder),
});

export function useWorkOrdersRealtime(
  filters: WorkOrderRealtimeFilters,
  pageSize: number = DEFAULT_PAGE_SIZE,
): UseWorkOrdersRealtimeResult {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const safePageSize = Math.max(1, pageSize);
  const status = filters.status ?? 'all';
  const lineId = filters.lineId ?? 'all';
  const supervisorId = filters.supervisorId ?? null;
  const dateFrom = filters.dateRange?.from ?? null;
  const dateTo = filters.dateRange?.to ?? null;

  const baseConstraints = useMemo(
    () => makeBaseConstraints({
      status,
      lineId,
      supervisorId,
      dateRange: { from: dateFrom, to: dateTo },
    }),
    [status, lineId, supervisorId, dateFrom, dateTo],
  );

  useEffect(() => {
    if (!isConfigured || !db) {
      setOrders([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setError(null);
      lastDocRef.current = null;
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingMore(false);
    setHasMore(false);
    lastDocRef.current = null;

    const firstPageQuery = query(
      collection(db, COLLECTION_NAME),
      ...baseConstraints,
      limit(safePageSize),
    );

    const unsubscribe = onSnapshot(
      firstPageQuery,
      (snap) => {
        const nextOrders = snap.docs.map(toWorkOrder);
        setOrders(nextOrders);
        lastDocRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        setHasMore(snap.docs.length === safePageSize);
        setLoading(false);
      },
      (snapshotError) => {
        console.error('useWorkOrdersRealtime snapshot error:', snapshotError);
        setError('تعذر تحميل أوامر الشغل في الوقت الحقيقي.');
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [baseConstraints, safePageSize]);

  const loadMore = useCallback(async () => {
    if (!isConfigured || !db || loadingMore || !hasMore || !lastDocRef.current) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const nextQuery = query(
        collection(db, COLLECTION_NAME),
        ...baseConstraints,
        startAfter(lastDocRef.current),
        limit(safePageSize),
      );

      const snap = await getDocs(nextQuery);
      const nextOrders = snap.docs.map(toWorkOrder);

      setOrders((prev) => mergeUniqueOrders(prev, nextOrders));
      lastDocRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : lastDocRef.current;
      setHasMore(snap.docs.length === safePageSize);
    } catch (loadError) {
      console.error('useWorkOrdersRealtime loadMore error:', loadError);
      setError('تعذر تحميل المزيد من أوامر الشغل.');
    } finally {
      setLoadingMore(false);
    }
  }, [baseConstraints, hasMore, loadingMore, safePageSize]);

  return {
    orders,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  };
}
