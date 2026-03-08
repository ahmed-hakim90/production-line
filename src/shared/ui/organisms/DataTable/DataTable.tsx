import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useTableSettings } from '@/core/ui-engine/table-settings/useTableSettings';
import { TABLE_WIDTH_CLASS } from '@/core/ui-engine/table-settings/tableSettings.types';
import { formatOperationDateTime } from '@/utils/calculations';
import type { DataTableProps } from './DataTable.types';

function asComparableValue(value: unknown): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  return String(value ?? '');
}

function isColumnSortable(sortable?: boolean): boolean {
  return sortable !== false;
}

export function DataTable<T>({
  tableId,
  userId,
  data,
  columns,
  getId,
  selectable = true,
  checkboxSelection = true,
  selectAllScope = 'page',
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
          return { ...column, visible: setting.visible, width: setting.width, order: setting.order };
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
    const q = searchTerm.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) =>
      visibleColumns.some((column) =>
        String(column.accessor(row) ?? '').toLowerCase().includes(q),
      ),
    );
  }, [data, searchTerm, visibleColumns]);

  const sortedRows = useMemo(() => {
    if (!sortColumnId) return filteredRows;
    const column = visibleColumns.find((c) => c.id === sortColumnId);
    if (!column || !isColumnSortable(column.sortable)) return filteredRows;
    return [...filteredRows].sort((l, r) => {
      const lv = asComparableValue(column.accessor(l));
      const rv = asComparableValue(column.accessor(r));
      if (typeof lv === 'number' && typeof rv === 'number')
        return sortDirection === 'asc' ? lv - rv : rv - lv;
      return sortDirection === 'asc'
        ? String(lv).localeCompare(String(rv), 'ar')
        : String(rv).localeCompare(String(lv), 'ar');
    });
  }, [filteredRows, sortColumnId, sortDirection, visibleColumns]);

  const effectivePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / effectivePageSize));

  useEffect(() => { setCurrentPage(1); }, [searchTerm, sortColumnId, sortDirection]);
  useEffect(() => { setCurrentPage((p) => Math.min(p, totalPages)); }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * effectivePageSize;
    return sortedRows.slice(start, start + effectivePageSize);
  }, [sortedRows, currentPage, effectivePageSize]);

  const filteredRowIds = useMemo(() => new Set(sortedRows.map(getId)), [sortedRows, getId]);
  const activeSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => filteredRowIds.has(id))),
    [selectedIds, filteredRowIds],
  );
  const selectableRows = selectAllScope === 'filtered' ? sortedRows : pageRows;
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => activeSelectedIds.has(getId(row)));
  const selectedItems = useMemo(
    () => sortedRows.filter((row) => activeSelectedIds.has(getId(row))),
    [sortedRows, activeSelectedIds, getId],
  );

  const canSelectRows = selectable && checkboxSelection;
  const totalColumns = visibleColumns.length + (canSelectRows ? 1 : 0) + (renderActions ? 1 : 0);

  const onSort = useCallback((columnId: string) => {
    if (sortColumnId === columnId) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumnId(columnId);
    setSortDirection('asc');
  }, [sortColumnId]);

  const toggleSelection = useCallback((rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  }, []);

  const toggleAllSelection = useCallback(() => {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        selectableRows.forEach((row) => next.delete(getId(row)));
        return next;
      }
      const next = new Set(prev);
      selectableRows.forEach((row) => next.add(getId(row)));
      return next;
    });
  }, [allSelected, selectableRows, getId]);

  /* ── Column visibility menu ── */
  const columnsVisibilityControl = enableColumnVisibility ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowColumnsMenu((p) => !p)}
        className={[
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors',
          showColumnsMenu
            ? 'border-[rgb(var(--color-primary)/0.4)] bg-[rgb(var(--color-primary)/0.06)] text-[rgb(var(--color-primary))]'
            : 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]',
        ].join(' ')}
      >
        <span className="material-icons-round text-[14px]">view_column</span>
        الأعمدة
      </button>
      {showColumnsMenu && (
        <div
          className="absolute top-10 z-20 erp-col-menu"
          style={{ insetInlineEnd: 0 }}
        >
          <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-[var(--color-border)]">
            <span className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">التحكم في الأعمدة</span>
            <button
              className="text-[11.5px] font-medium text-[rgb(var(--color-primary))] hover:underline"
              onClick={reset}
            >
              إعادة الإعدادات
            </button>
          </div>
          {resolvedColumns.map((column, index) => (
            <div key={column.id} className="erp-col-item">
              <input
                type="checkbox"
                checked={column.visible}
                onChange={() => toggleVisibility(column.id)}
              />
              <span className="text-[12.5px] font-medium text-[var(--color-text)] flex-1 truncate">{column.header}</span>
              <div className="flex items-center gap-0.5">
                {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setWidth(column.id, size)}
                    className={[
                      'px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors',
                      column.width === size
                        ? 'border-[rgb(var(--color-primary)/0.5)] text-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.08)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]',
                    ].join(' ')}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
                <button onClick={() => moveColumn(column.id, 'left')} disabled={index === 0}
                  className="p-0.5 rounded hover:bg-[#f0f2f5] disabled:opacity-25 transition-colors">
                  <span className="material-icons-round text-[12px] text-[var(--color-text-muted)]">west</span>
                </button>
                <button onClick={() => moveColumn(column.id, 'right')} disabled={index === resolvedColumns.length - 1}
                  className="p-0.5 rounded hover:bg-[#f0f2f5] disabled:opacity-25 transition-colors">
                  <span className="material-icons-round text-[12px] text-[var(--color-text-muted)]">east</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
        style={{ boxShadow: 'var(--shadow-card)' }}>
        {[...Array(6)].map((_, idx) => (
          <div key={idx} className="h-9 rounded-[var(--border-radius-sm)] bg-[#e8eaed]" />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>

      {/* ── Bulk action bar (ERPNext style) ── */}
      {canSelectRows && activeSelectedIds.size > 0 && (
        <div className="erp-bulk-bar erp-animate-in">
          <span className="material-icons-round text-[16px] text-[rgb(var(--color-primary))]">check_box</span>
          <span className="erp-bulk-count">{activeSelectedIds.size} عنصر محدد</span>
          <div className="flex-1" />
          {bulkActions.map((action) => (
            <button
              key={action.label}
              onClick={() => action.action(selectedItems)}
              disabled={action.disabled}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--border-radius-sm)] text-[12px] font-semibold transition-colors border',
                action.variant === 'danger'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : action.variant === 'primary'
                    ? 'bg-[rgb(var(--color-primary))] border-[rgb(var(--color-primary))] text-white hover:opacity-90'
                    : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[#f0f2f5]',
                action.disabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {action.icon && <span className="material-icons-round text-[13px]">{action.icon}</span>}
              {action.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[#f0f2f5] border border-transparent hover:border-[var(--color-border)] transition-colors"
            title="إلغاء التحديد"
          >
            <span className="material-icons-round text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* ── Main table container ── */}
      <div
        className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        {/* ── Toolbar (ERPNext style) ── */}
        <div className="erp-filter-bar">
          {/* Built-in quick search */}
          {enableSearch && (
            <div className="erp-search-input erp-search-input--table">
              <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 15, flexShrink: 0 }}>search</span>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}
                  title="مسح البحث"
                >
                  <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
                </button>
              )}
            </div>
          )}

          {/* Custom toolbar content (filter selects, date pickers, etc.) */}
          {toolbarContent}

          {/* Spacer + column visibility */}
          <div className="hidden sm:block" style={{ flex: 1 }} />
          {columnsVisibilityControl && (
            <div className="shrink-0">
              {columnsVisibilityControl}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="erp-table-scroll">
          <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: '#f8f9fa' }}>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {canSelectRows && (
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAllSelection}
                      className="w-3.5 h-3.5 rounded text-primary"
                    />
                  </th>
                )}
                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    className={[
                      'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] whitespace-nowrap',
                      TABLE_WIDTH_CLASS[column.width],
                      isColumnSortable(column.sortable) ? 'cursor-pointer select-none hover:text-primary transition-colors' : '',
                      column.headerClassName ?? '',
                    ].join(' ')}
                    onClick={isColumnSortable(column.sortable) ? () => onSort(column.id) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.header}
                      {isColumnSortable(column.sortable) && (
                        <span className={`material-icons-round text-[12px] ${sortColumnId === column.id ? 'text-primary' : 'text-[var(--color-border)]'}`}>
                          {sortColumnId === column.id
                            ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward')
                            : 'unfold_more'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                {renderActions && (
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] text-left whitespace-nowrap">
                    {actionsHeader}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={totalColumns} className="px-6 py-14 text-center">
                    <span className="material-icons-round text-[40px] opacity-25 block mb-2 text-[var(--color-text-muted)]">{emptyIcon}</span>
                    <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{emptyTitle}</p>
                    {emptySubtitle && <p className="text-[12px] text-[var(--color-text-muted)] mt-1">{emptySubtitle}</p>}
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
                    data-selected={isSelected ? 'true' : undefined}
                    className={[
                      'transition-colors group',
                      onRowClick ? 'cursor-pointer' : '',
                      isSelected ? 'row-selected' : '',
                    ].join(' ')}
                    style={{
                      borderBottom: '1px solid #f0f2f5',
                      backgroundColor: highlightRowId === rowId
                        ? '#fffbeb'
                        : isSelected
                          ? 'rgb(var(--color-primary) / 0.06)'
                          : undefined,
                      borderRight: isSelected
                        ? '3px solid rgb(var(--color-primary))'
                        : '3px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (highlightRowId !== rowId && !isSelected)
                        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f8f9fa';
                    }}
                    onMouseLeave={(e) => {
                      if (highlightRowId !== rowId && !isSelected)
                        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                    }}
                  >
                    {canSelectRows && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(rowId)}
                          className="w-3.5 h-3.5 rounded text-primary"
                        />
                      </td>
                    )}
                    {visibleColumns.map((column) => (
                      <td
                        key={column.id}
                        className={`px-3 py-2.5 text-[12.5px] text-[var(--color-text)] ${TABLE_WIDTH_CLASS[column.width]} ${column.className ?? ''}`}
                      >
                        {column.render
                          ? column.render(row)
                          : (() => {
                              const rawValue = column.accessor(row);
                              const formattedDateTime = formatOperationDateTime(rawValue);
                              return formattedDateTime ?? String(rawValue ?? '');
                            })()}
                      </td>
                    ))}
                    {renderActions && (
                      <td className="px-3 py-2.5 text-left" onClick={(e) => e.stopPropagation()}>
                        {renderActions(row)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="px-3 py-2.5 border-t border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[var(--color-card)]">
          <span className="text-[11.5px] text-[var(--color-text-muted)] font-medium">
            صفحة {currentPage} من {totalPages} — إجمالي {sortedRows.length} سجل
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] disabled:opacity-30 transition-colors"
              title="الأولى"
            >
              <span className="material-icons-round text-[14px]">first_page</span>
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] hover:bg-[#f0f2f5] disabled:opacity-30 transition-colors"
            >
              السابق
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) page = i + 1;
                else if (currentPage <= 3) page = i + 1;
                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                else page = currentPage - 2 + i;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={[
                      'w-7 h-7 rounded-[var(--border-radius-sm)] text-[12px] font-medium transition-colors',
                      page === currentPage
                        ? 'bg-primary text-white'
                        : 'text-[var(--color-text-muted)] hover:bg-[#f0f2f5]',
                    ].join(' ')}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] hover:bg-[#f0f2f5] disabled:opacity-30 transition-colors"
            >
              التالي
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] disabled:opacity-30 transition-colors"
              title="الأخيرة"
            >
              <span className="material-icons-round text-[14px]">last_page</span>
            </button>
          </div>
        </div>

        {footer}
      </div>
    </div>
  );
}
