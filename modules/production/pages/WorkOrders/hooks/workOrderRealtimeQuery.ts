import {
  documentId,
  orderBy,
  where,
  type QueryConstraint,
} from 'firebase/firestore';

import type { WorkOrderStatus } from '../../../../../types';
import { resolveFirestoreSearchKey, SEARCH_MIN_LENGTH } from '../../../../../lib/firestoreSearch';

export interface WorkOrderRealtimeFilters {
  tenantId?: string | null;
  status?: WorkOrderStatus | 'all' | null;
  lineId?: string | 'all' | null;
  supervisorId?: string | null;
  dateRange?: { from?: string | null; to?: string | null } | null;
  search?: string | null;
}

export function resolveWorkOrderRealtimeSearchKey(search?: string | null): string {
  const key = resolveFirestoreSearchKey(search);
  return key.length >= SEARCH_MIN_LENGTH ? key : '';
}

export function isWorkOrderRealtimeIndexError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: string }).code === 'failed-precondition',
  );
}

export const makeBaseConstraints = (
  filters: WorkOrderRealtimeFilters,
  options?: { includeSearch?: boolean },
): QueryConstraint[] => {
  const constraints: QueryConstraint[] = [];
  let hasTargetDateRange = false;
  if (filters.status && filters.status !== 'all') constraints.push(where('status', '==', filters.status));
  if (filters.lineId && filters.lineId !== 'all') constraints.push(where('lineId', '==', filters.lineId));
  if (filters.supervisorId) constraints.push(where('supervisorId', '==', filters.supervisorId));
  if (options?.includeSearch !== false) {
    const search = resolveWorkOrderRealtimeSearchKey(filters.search);
    if (search) constraints.push(where('searchPrefixes', 'array-contains', search));
  }
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
