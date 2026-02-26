import React, { useMemo } from 'react';
import type { Permission } from '../utils/permissions';
import { usePermission } from '../utils/permissions';
import { DataTable } from '@/src/shared/ui/organisms/DataTable/DataTable';
import type { DataTableColumn } from '@/src/shared/ui/organisms/DataTable/DataTable.types';
import { useAppStore } from '@/store/useAppStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TableColumn<T> {
  id?: string;
  header: string;
  render: (item: T) => React.ReactNode;
  headerClassName?: string;
  className?: string;
  sortKey?: (item: T) => string | number;
  hideable?: boolean;
  defaultHidden?: boolean;
}

export interface TableBulkAction<T> {
  label: string;
  icon?: string;
  action: (items: T[]) => void;
  permission?: Permission;
  variant?: 'primary' | 'danger' | 'default';
  disabled?: boolean;
}

interface SelectableTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  getId: (item: T) => string;
  bulkActions?: TableBulkAction<T>[];
  /** Per-row action buttons (rightmost column) */
  renderActions?: (item: T) => React.ReactNode;
  actionsHeader?: string;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  /** Optional footer content below the table */
  footer?: React.ReactNode;
  className?: string;
  /** Number of items per page. 0 = no pagination (default) */
  pageSize?: number;
  /** Optional per-table column visibility menu */
  enableColumnVisibility?: boolean;
  /** Optional row id to emphasize */
  highlightRowId?: string | null;
  /** Optional row click callback */
  onRowClick?: (item: T) => void;
  /** Optional search input toggle */
  enableSearch?: boolean;
  /** Optional search placeholder */
  searchPlaceholder?: string;
  /** Optional table id for user-specific settings */
  tableId?: string;
  /** Disable checkbox selection while keeping actions */
  checkboxSelection?: boolean;
  /** Loading state */
  loading?: boolean;
}

export function SelectableTable<T>({
  data,
  columns,
  getId,
  bulkActions = [],
  renderActions,
  actionsHeader = 'إجراءات',
  emptyIcon = 'inbox',
  emptyTitle = 'لا توجد بيانات',
  emptySubtitle,
  footer,
  className = '',
  pageSize = 0,
  enableColumnVisibility = false,
  highlightRowId = null,
  onRowClick,
  enableSearch = false,
  searchPlaceholder,
  tableId,
  checkboxSelection = true,
  loading = false,
}: SelectableTableProps<T>) {
  const { can } = usePermission();
  const userId = useAppStore((state) => state.uid);

  const allowedBulkActions = useMemo(
    () => bulkActions.filter((action) => !action.permission || can(action.permission)),
    [bulkActions, can],
  );

  const mappedColumns = useMemo<DataTableColumn<T>[]>(
    () =>
      columns.map((column, index) => ({
        id: column.id ?? `${tableId ?? 'table'}-${index}`,
        header: column.header,
        accessor: (row: T) => {
          const value = column.sortKey ? column.sortKey(row) : '';
          return value;
        },
        render: column.render,
        sortable: Boolean(column.sortKey),
        hideable: column.hideable,
        visible: !column.defaultHidden,
        headerClassName: column.headerClassName,
        className: column.className,
      })),
    [columns, tableId],
  );

  return (
    <DataTable<T>
      tableId={tableId ?? 'global-table'}
      userId={userId}
      data={data}
      columns={mappedColumns}
      getId={getId}
      selectable={true}
      checkboxSelection={checkboxSelection}
      bulkActions={allowedBulkActions.map((action) => ({
        label: action.label,
        icon: action.icon,
        action: action.action,
        variant: action.variant,
        disabled: action.disabled,
      }))}
      renderActions={renderActions}
      actionsHeader={actionsHeader}
      onRowClick={onRowClick}
      pageSize={pageSize > 0 ? pageSize : 15}
      enableColumnVisibility={enableColumnVisibility}
      enableSearch={enableSearch}
      searchPlaceholder={searchPlaceholder}
      highlightRowId={highlightRowId}
      emptyIcon={emptyIcon}
      emptyTitle={emptyTitle}
      emptySubtitle={emptySubtitle}
      footer={footer}
      className={className}
      loading={loading}
    />
  );
}
