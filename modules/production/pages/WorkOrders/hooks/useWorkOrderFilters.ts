import { useMemo, useState } from 'react';

import type { WorkOrderStatus } from '../../../../../types';

export type WorkOrderGroupBy = 'none' | 'line' | 'status' | 'supervisor';

export interface WorkOrderFilterState {
  status: WorkOrderStatus | 'all';
  lineId: string | 'all';
  dateRange: { from: string; to: string } | null;
  search: string;
  groupBy: WorkOrderGroupBy;
}

const INITIAL_FILTERS: WorkOrderFilterState = {
  status: 'all',
  lineId: 'all',
  dateRange: null,
  search: '',
  groupBy: 'none',
};

export function useWorkOrderFilters() {
  const [filters, setFilters] = useState<WorkOrderFilterState>(INITIAL_FILTERS);

  const setFilter = <K extends keyof WorkOrderFilterState>(key: K, value: WorkOrderFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.status !== 'all' ||
      filters.lineId !== 'all' ||
      Boolean(filters.dateRange) ||
      Boolean(filters.search.trim()) ||
      filters.groupBy !== 'none'
    );
  }, [filters]);

  return {
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters,
  };
}
