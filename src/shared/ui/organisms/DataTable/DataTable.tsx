import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useTableSettings } from '@/core/ui-engine/table-settings/useTableSettings';
import { TABLE_WIDTH_CLASS } from '@/core/ui-engine/table-settings/tableSettings.types';
import type { DataTableProps } from './DataTable.types';

function asComparableValue(value: unknown): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  return String(value ?? '');
}

export function DataTable<T>({
  tableId,
  userId,
  data,
  columns,
  getId,
  selectable = true,
  checkboxSelection = true,
  bulkActions = [],
  renderActions,
  actionsHeader = 'إجراءات',
  onRowClick,
  pageSize = 15,
  enableColumnVisibility = true,
  enableSearch = true,
  searchPlaceholder = 'بحث في الجدول...',
  toolbarContent,
  highlightRowId = null,
  emptyIcon = 'inbox',
  emptyTitle = 'لا توجد بيانات',
  emptySubtitle,
  footer,
  className = '',
  loading = false,
}: DataTableProps<T>) {
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const columnDefs = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessor: column.accessor,
        sortable: column.sortable,
        visible: column.visible,
        width: column.width,
      })),
    [columns],
  );

  const { settings, toggleVisibility, moveColumn, setWidth, reset } = useTableSettings({
    userId,
    tableId,
    columns: columnDefs,
  });

  const columnsById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  const resolvedColumns = useMemo(
    () =>
      settings
        .map((setting) => {
          const column = columnsById.get(setting.id);
          if (!column) return null;
          return {
            ...column,
            visible: setting.visible,
            width: setting.width,
            order: setting.order,
          };
        })
        .filter((column): column is NonNullable<typeof column> => Boolean(column))
        .sort((a, b) => a.order - b.order),
    [settings, columnsById],
  );

  const visibleColumns = useMemo(
    () => resolvedColumns.filter((column) => column.visible),
    [resolvedColumns],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    if (!normalizedQuery) {
      return data;
    }
    return data.filter((row) =>
      visibleColumns.some((column) =>
        String(column.accessor(row) ?? '').toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [data, searchTerm, visibleColumns]);

  const sortedRows = useMemo(() => {
    if (!sortColumnId) return filteredRows;
    const column = visibleColumns.find((candidate) => candidate.id === sortColumnId);
    if (!column?.sortable) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const leftValue = asComparableValue(column.accessor(left));
      const rightValue = asComparableValue(column.accessor(right));
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }
      const comparison = String(leftValue).localeCompare(String(rightValue), 'ar');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortColumnId, sortDirection, visibleColumns]);

  const effectivePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / effectivePageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortColumnId, sortDirection]);

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * effectivePageSize;
    return sortedRows.slice(start, start + effectivePageSize);
  }, [sortedRows, currentPage, effectivePageSize]);

  const visibleRowIds = useMemo(() => new Set(pageRows.map(getId)), [pageRows, getId]);
  const activeSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => visibleRowIds.has(id))),
    [selectedIds, visibleRowIds],
  );
  const allSelected = pageRows.length > 0 && activeSelectedIds.size === pageRows.length;
  const selectedItems = useMemo(
    () => pageRows.filter((row) => activeSelectedIds.has(getId(row))),
    [pageRows, activeSelectedIds, getId],
  );

  const canSelectRows = selectable && checkboxSelection;
  const totalColumns = visibleColumns.length + (canSelectRows ? 1 : 0) + (renderActions ? 1 : 0);

  const onSort = useCallback(
    (columnId: string) => {
      if (sortColumnId === columnId) {
        setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setSortColumnId(columnId);
      setSortDirection('asc');
    },
    [sortColumnId],
  );

  const toggleSelection = useCallback((rowId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const toggleAllSelection = useCallback(() => {
    setSelectedIds((previous) => {
      if (allSelected) {
        const next = new Set(previous);
        pageRows.forEach((row) => next.delete(getId(row)));
        return next;
      }
      const next = new Set(previous);
      pageRows.forEach((row) => next.add(getId(row)));
      return next;
    });
  }, [allSelected, pageRows, getId]);

  const columnsVisibilityControl = enableColumnVisibility ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowColumnsMenu((previous) => !previous)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span className="material-icons-round text-sm">view_column</span>
        الأعمدة
      </button>
      {showColumnsMenu && (
        <div className="absolute left-0 top-11 z-20 w-80 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2 space-y-1">
          {resolvedColumns.map((column, index) => (
            <div key={column.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => toggleVisibility(column.id)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
                  {column.header}
                </span>
                <button
                  onClick={() => moveColumn(column.id, 'left')}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  title="نقل لليسار"
                >
                  <span className="material-icons-round text-sm">west</span>
                </button>
                <button
                  onClick={() => moveColumn(column.id, 'right')}
                  disabled={index === resolvedColumns.length - 1}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  title="نقل لليمين"
                >
                  <span className="material-icons-round text-sm">east</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">العرض</span>
                {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setWidth(column.id, size)}
                    className={`px-2 py-1 rounded text-[10px] font-bold border ${
                      column.width === size
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            className="w-full text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={reset}
          >
            إعادة ضبط افتراضي
          </button>
        </div>
      )}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {[...Array(6)].map((_, idx) => (
          <div key={idx} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {canSelectRows && activeSelectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10">
          <span className="text-sm font-bold text-primary">{activeSelectedIds.size} عنصر محدد</span>
          <div className="flex-1" />
          {bulkActions.map((action) => (
            <button
              key={action.label}
              onClick={() => action.action(selectedItems)}
              disabled={action.disabled}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                action.variant === 'danger'
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : action.variant === 'primary'
                    ? 'bg-primary text-white hover:bg-primary/90'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60',
                action.disabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {action.icon && <span className="material-icons-round text-sm">{action.icon}</span>}
              {action.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          {enableSearch ? (
            <div className="relative w-full max-w-md">
              <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pr-9 pl-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          ) : null}

          {enableSearch && <div className="flex-1" />}

          {toolbarContent}
          {columnsVisibilityControl ? (
            <div className="shrink-0" style={{ marginInlineStart: 'auto' }}>
              {columnsVisibilityControl}
            </div>
          ) : null}
        </div>

        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 backdrop-blur">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {canSelectRows && (
                  <th className="w-12 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAllSelection}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30"
                    />
                  </th>
                )}

                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    className={[
                      'px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500',
                      TABLE_WIDTH_CLASS[column.width],
                      column.sortable ? 'cursor-pointer select-none hover:text-primary' : '',
                      column.headerClassName ?? '',
                    ].join(' ')}
                    onClick={column.sortable ? () => onSort(column.id) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.header}
                      {column.sortable && sortColumnId === column.id && (
                        <span className="material-icons-round text-sm text-primary">
                          {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}

                {renderActions && (
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500 text-left">
                    {actionsHeader}
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={totalColumns} className="px-6 py-16 text-center text-slate-400">
                    <span className="material-icons-round text-5xl opacity-30 block mb-2">{emptyIcon}</span>
                    <p className="text-lg font-bold">{emptyTitle}</p>
                    {emptySubtitle && <p className="text-sm mt-1">{emptySubtitle}</p>}
                  </td>
                </tr>
              )}

              {pageRows.map((row) => {
                const rowId = getId(row);
                const isSelected = activeSelectedIds.has(rowId);
                return (
                  <tr
                    key={rowId}
                    onClick={() => onRowClick?.(row)}
                    className={[
                      'group transition-colors',
                      onRowClick ? 'cursor-pointer' : '',
                      highlightRowId === rowId
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : isSelected
                          ? 'bg-primary/5 dark:bg-primary/10'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40',
                    ].join(' ')}
                  >
                    {canSelectRows && (
                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(rowId)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30"
                        />
                      </td>
                    )}
                    {visibleColumns.map((column) => (
                      <td
                        key={column.id}
                        className={`px-4 py-3 text-sm ${TABLE_WIDTH_CLASS[column.width]} ${column.className ?? ''}`}
                      >
                        {column.render ? column.render(row) : String(column.accessor(row) ?? '')}
                      </td>
                    ))}
                    {renderActions && (
                      <td className="px-4 py-3 text-left" onClick={(event) => event.stopPropagation()}>
                        {renderActions(row)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500">
            صفحة {currentPage} من {totalPages} - إجمالي {sortedRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
            >
              السابق
            </button>
            <button
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>

        {footer}
      </div>
    </div>
  );
}
