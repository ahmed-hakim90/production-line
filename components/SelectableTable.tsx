import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { BulkActionBar } from './BulkActionBar';
import type { BulkAction } from './BulkActionBar';
import type { Permission } from '../utils/permissions';

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
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function usePagination<T>(data: T[], pageSize: number) {
  const [visibleCount, setVisibleCount] = useState(pageSize > 0 ? pageSize : data.length);

  useEffect(() => {
    if (pageSize <= 0) {
      setVisibleCount(data.length);
      return;
    }
    // Reset visible rows when dataset changes (new sort/filter/search).
    setVisibleCount(pageSize);
  }, [data, data.length, pageSize]);

  const pageData = useMemo(() => {
    if (pageSize <= 0) return data;
    return data.slice(0, visibleCount);
  }, [data, visibleCount, pageSize]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + pageSize, data.length));
  }, [data.length, pageSize]);

  const hasPagination = pageSize > 0 && data.length > pageSize;
  const canLoadMore = pageSize > 0 && visibleCount < data.length;
  const remainingCount = pageSize > 0 ? Math.max(data.length - visibleCount, 0) : 0;

  return { pageData, hasPagination, canLoadMore, remainingCount, loadMore };
}

// ─── Component ───────────────────────────────────────────────────────────────

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
}: SelectableTableProps<T>) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () =>
      new Set(
        columns
          .map((col, i) => ({ ...col, _id: col.id ?? `${col.header}-${i}` }))
          .filter((col) => col.defaultHidden)
          .map((col) => col._id)
      )
  );

  const columnsWithId = useMemo(
    () => columns.map((col, i) => ({ ...col, _id: col.id ?? `${col.header}-${i}` })),
    [columns]
  );

  const visibleColumns = useMemo(
    () => columnsWithId.filter((col) => !hiddenCols.has(col._id)),
    [columnsWithId, hiddenCols]
  );

  const hideableColumns = useMemo(
    () => columnsWithId.filter((col) => col.hideable),
    [columnsWithId]
  );

  const handleSort = useCallback((colId: string) => {
    if (sortCol === colId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colId);
      setSortDir('asc');
    }
  }, [sortCol]);

  const toggleColumn = useCallback((colId: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  }, []);

  const sortedData = useMemo(() => {
    if (sortCol === null) return data;
    const col = visibleColumns.find((c) => c._id === sortCol);
    if (!col?.sortKey) return data;
    const fn = col.sortKey;
    return [...data].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === 'asc' ? sa.localeCompare(sb, 'ar') : sb.localeCompare(sa, 'ar');
    });
  }, [data, sortCol, sortDir, visibleColumns]);

  const effectivePageSize = pageSize > 0 ? Math.min(pageSize, 15) : 0;
  const { pageData, hasPagination, canLoadMore, remainingCount, loadMore } = usePagination(sortedData, effectivePageSize);

  const {
    selectedItems,
    selectedCount,
    allSelected,
    isSelected,
    toggle,
    toggleAll,
    clearAll,
  } = useBulkSelection(pageData, getId);

  const totalCols =
    visibleColumns.length + 1 + (renderActions ? 1 : 0);

  const barActions: BulkAction[] = useMemo(
    () =>
      bulkActions.map((ba) => ({
        label: ba.label,
        icon: ba.icon,
        action: () => ba.action(selectedItems),
        permission: ba.permission,
        variant: ba.variant,
        disabled: ba.disabled,
      })),
    [bulkActions, selectedItems],
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedCount}
        actions={barActions}
        onClear={clearAll}
      />

      {/* Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
        {enableColumnVisibility && hideableColumns.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-end relative">
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <span className="material-icons-round text-sm">view_column</span>
              الأعمدة
            </button>
            {showColumnsMenu && (
              <div className="absolute left-4 top-12 z-20 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 space-y-1">
                {hideableColumns.map((col) => {
                  const visible = !hiddenCols.has(col._id);
                  return (
                    <label key={col._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => toggleColumn(col._id)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30 cursor-pointer"
                      />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{col.header}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                {/* Select-all checkbox */}
                <th className="px-4 py-4 w-12">
                  <label className="flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected && pageData.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </label>
                </th>

                {visibleColumns.map((col) => (
                  <th
                    key={col._id}
                    className={`px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] ${col.sortKey ? 'cursor-pointer select-none hover:text-primary transition-colors' : ''} ${col.headerClassName ?? ''}`}
                    onClick={col.sortKey ? () => handleSort(col._id) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortKey && sortCol === col._id && (
                        <span className="material-icons-round text-primary text-sm">
                          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                      {col.sortKey && sortCol !== col._id && (
                        <span className="material-icons-round text-slate-300 dark:text-slate-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                          unfold_more
                        </span>
                      )}
                    </span>
                  </th>
                ))}

                {renderActions && (
                  <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-left">
                    {actionsHeader}
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={totalCols} className="px-6 py-16 text-center text-slate-400">
                    <span className="material-icons-round text-5xl mb-3 block opacity-30">
                      {emptyIcon}
                    </span>
                    <p className="font-bold text-lg">{emptyTitle}</p>
                    {emptySubtitle && (
                      <p className="text-sm mt-1">{emptySubtitle}</p>
                    )}
                  </td>
                </tr>
              )}

              {pageData.map((item) => {
                const id = getId(item);
                const checked = isSelected(id);
                return (
                  <tr
                    key={id}
                    data-row-id={id}
                    className={`transition-colors group ${
                      highlightRowId === id
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        :
                      checked
                        ? 'bg-primary/5 dark:bg-primary/10'
                        : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-4 py-4 w-12">
                      <label className="flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(id)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/30 cursor-pointer"
                        />
                      </label>
                    </td>

                    {visibleColumns.map((col) => (
                      <td
                        key={col._id}
                        className={`px-5 py-4 text-sm ${col.className ?? ''}`}
                      >
                        {col.render(item)}
                      </td>
                    ))}

                    {renderActions && (
                      <td className="px-5 py-4 text-left">
                        {renderActions(item)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {hasPagination && (
          <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض <span className="text-primary">{pageData.length}</span> من{' '}
              <span className="text-primary">{data.length}</span> عنصر
            </span>
            {canLoadMore && (
              <button
                onClick={loadMore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all"
              >
                <span className="material-icons-round text-sm">expand_more</span>
                تحميل المزيد{remainingCount > 0 ? ` (متبقي ${remainingCount})` : ''}
              </button>
            )}
          </div>
        )}

        {/* Custom Footer */}
        {footer}
      </div>
    </div>
  );
}
