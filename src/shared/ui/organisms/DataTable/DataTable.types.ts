import type React from 'react';
import type { TableColumnWidth } from '@/core/ui-engine/table-settings/tableSettings.types';

// ─── Column Definition ───────────────────────────────────────────────────────

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessor: (item: T) => string | number | React.ReactNode;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  visible?: boolean;
  width?: TableColumnWidth;
  headerClassName?: string;
  className?: string;
  hideable?: boolean;
}

// ─── Bulk Actions ────────────────────────────────────────────────────────────

export interface DataTableBulkAction<T> {
  label: string;
  icon?: string;
  action: (items: T[]) => void;
  variant?: 'primary' | 'danger' | 'default';
  disabled?: boolean;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export type PaginationMode = 'load-more' | 'pages' | 'none';

// ─── Component Props ─────────────────────────────────────────────────────────

export interface DataTableProps<T> {
  tableId: string;
  userId?: string | null;
  data: T[];
  columns: DataTableColumn<T>[];
  getId: (item: T) => string;

  selectable?: boolean;
  checkboxSelection?: boolean;
  bulkActions?: DataTableBulkAction<T>[];

  renderActions?: (item: T) => React.ReactNode;
  actionsHeader?: string;
  onRowClick?: (item: T) => void;

  pageSize?: number;

  enableColumnVisibility?: boolean;
  enableSearch?: boolean;
  searchPlaceholder?: string;

  highlightRowId?: string | null;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  footer?: React.ReactNode;
  className?: string;
  loading?: boolean;
}
