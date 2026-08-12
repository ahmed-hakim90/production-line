import { useMemo, useState } from 'react';

import type { WorkOrderStatus } from '../../../../../types';

export type WorkOrderGroupBy = 'none' | 'line' | 'status' | 'supervisor';
/** List filter: default stays on finished product; `all` shows both kinds. */
export type WorkOrderTypeFilter = 'finished_product' | 'component_injection' | 'all';

export interface WorkOrderFilterState {
  status: WorkOrderStatus | 'all';
  /** Default: finished product plans/orders only. */
  workOrderType: WorkOrderTypeFilter;
  lineId: string | 'all';
  dateRange: { from: string; to: string } | null;
  search: string;
  groupBy: WorkOrderGroupBy;
}

const INITIAL_FILTERS: WorkOrderFilterState = {
  status: 'all',
  workOrderType: 'finished_product',
  lineId: 'all',
  dateRange: null,
  search: '',
  groupBy: 'none',
};

export function useWorkOrderFilters(initial?: Partial<WorkOrderFilterState>) {
  const [filters, setFilters] = useState<WorkOrderFilterState>(() => ({
    ...INITIAL_FILTERS,
    ...initial,
    workOrderType: initial?.workOrderType === 'component_injection' || initial?.workOrderType === 'all'
      ? initial.workOrderType
      : 'finished_product',
  }));

  const setFilter = <K extends keyof WorkOrderFilterState>(key: K, value: WorkOrderFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.status !== 'all' ||
      filters.workOrderType !== 'finished_product' ||
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
