import type { WorkOrderStatus } from '../../../../types';
import { WORK_ORDER_STATUS_LABELS } from '../../utils/workOrderReportLinking';
import type { WorkOrderFilterState, WorkOrderGroupBy } from './hooks/useWorkOrderFilters';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';

interface FilterCounts {
  all: number;
  pending: number;
  in_progress: number;
  paused: number;
  completed: number;
  cancelled: number;
}

interface WorkOrderFiltersProps {
  filters: WorkOrderFilterState;
  counts: FilterCounts;
  lines: Array<{ id: string; name: string }>;
  onSetFilter: <K extends keyof WorkOrderFilterState>(key: K, value: WorkOrderFilterState[K]) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: Array<{ key: WorkOrderStatus | 'all'; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'in_progress', label: WORK_ORDER_STATUS_LABELS.in_progress },
  { key: 'pending', label: WORK_ORDER_STATUS_LABELS.pending },
  { key: 'paused', label: WORK_ORDER_STATUS_LABELS.paused },
  { key: 'completed', label: WORK_ORDER_STATUS_LABELS.completed },
  { key: 'cancelled', label: WORK_ORDER_STATUS_LABELS.cancelled },
];

export function WorkOrderFilters({
  filters,
  counts,
  lines,
  onSetFilter,
  onClear: _onClear,
}: WorkOrderFiltersProps) {
  const selectedStatusCount = counts[filters.status];

  return (
    <SmartFilterBar
      pageId="work-orders"
      searchPlaceholder="بحث برقم الأمر أو المنتج..."
      searchValue={filters.search}
      onSearchChange={(value) => onSetFilter('search', value)}
      quickFilters={[
        {
          key: 'status',
          placeholder: 'كل الحالات',
          options: STATUS_OPTIONS.filter((option) => option.key !== 'all').map((option) => ({
            value: option.key,
            label: option.label,
          })),
          width: 'w-[140px]',
        },
      ]}
      quickFilterValues={{ status: filters.status }}
      onQuickFilterChange={(key, value) => {
        if (key !== 'status') return;
        onSetFilter('status', value as WorkOrderStatus | 'all');
      }}
      advancedFilters={[
        {
          key: 'lineId',
          label: 'خط الإنتاج',
          placeholder: 'كل الخطوط',
          options: lines.map((line) => ({ value: line.id, label: line.name })),
          width: 'w-[160px]',
        },
        {
          key: 'groupBy',
          label: 'تجميع',
          placeholder: 'بدون تجميع',
          options: [
            { value: 'none', label: 'بدون تجميع' },
            { value: 'line', label: 'تجميع بالخط' },
            { value: 'status', label: 'تجميع بالحالة' },
            { value: 'supervisor', label: 'تجميع بالمشرف' },
          ],
          width: 'w-[150px]',
        },
        { key: 'dateFrom', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
        { key: 'dateTo', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
      ]}
      advancedFilterValues={{
        lineId: filters.lineId,
        groupBy: filters.groupBy === 'none' ? 'all' : filters.groupBy,
        dateFrom: filters.dateRange?.from ?? '',
        dateTo: filters.dateRange?.to ?? '',
      }}
      onAdvancedFilterChange={(key, value) => {
        if (key === 'lineId') {
          onSetFilter('lineId', value as WorkOrderFilterState['lineId']);
          return;
        }
        if (key === 'groupBy') {
          onSetFilter('groupBy', value === 'all' ? 'none' : (value as WorkOrderGroupBy));
          return;
        }
        if (key === 'dateFrom') {
          onSetFilter('dateRange', {
            from: value,
            to: filters.dateRange?.to ?? '',
          });
          return;
        }
        if (key === 'dateTo') {
          onSetFilter('dateRange', {
            from: filters.dateRange?.from ?? '',
            to: value,
          });
        }
      }}
      extra={(
        <div className="inline-flex h-[34px] items-center rounded-lg border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-text-muted)]">
          نتائج الحالة: {selectedStatusCount}
        </div>
      )}
      className="mb-0"
    />
  );
}
