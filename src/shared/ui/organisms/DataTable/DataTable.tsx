import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useTableSettings } from '@/core/ui-engine/table-settings/useTableSettings';
import { TABLE_WIDTH_CLASS } from '@/core/ui-engine/table-settings/tableSettings.types';
import { formatOperationDateTime } from '@/utils/calculations';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CheckSquare,
  Download,
  Eye,
  FileDown,
  Pencil,
  Search,
  Settings2,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DataTableProps } from './DataTable.types';

function asComparableValue(value: unknown): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  return String(value ?? '');
}

function isColumnSortable(sortable?: boolean): boolean {
  return sortable !== false;
}

const ACTION_ICON_MAP: Record<string, LucideIcon> = {
  check: Check,
  delete: Trash2,
  download: Download,
  edit: Pencil,
  file_download: FileDown,
  preview: Eye,
  view: Eye,
};

function renderActionIcon(icon?: string, className?: string) {
  if (!icon) return null;
  const Lucide = ACTION_ICON_MAP[icon];
  if (Lucide) return <Lucide size={13} className={className} />;
  return <span className={`material-icons-round text-[13px] ${className ?? ''}`}>{icon}</span>;
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
    <Popover open={showColumnsMenu} onOpenChange={setShowColumnsMenu}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={showColumnsMenu ? 'secondary' : 'outline'}
          size="sm"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
        >
          <Settings2 size={14} />
          الأعمدة
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-3">
        <div className="flex items-center justify-between pb-2 mb-1 border-b border-[var(--color-border)]">
          <span className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">التحكم في الأعمدة</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11.5px]" onClick={reset}>
            إعادة الإعدادات
          </Button>
        </div>
        <div className="max-h-[300px] overflow-auto space-y-1">
          {resolvedColumns.map((column, index) => (
            <div key={column.id} className="erp-col-item">
              <Checkbox checked={column.visible} onCheckedChange={() => toggleVisibility(column.id)} />
              <span className="text-[12.5px] font-medium text-[var(--color-text)] flex-1 truncate">{column.header}</span>
              <div className="flex items-center gap-0.5">
                {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                  <Button
                    type="button"
                    key={size}
                    variant={column.width === size ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setWidth(column.id, size)}
                    className="h-6 px-1.5 text-[9px] font-bold"
                  >
                    {size.toUpperCase()}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveColumn(column.id, 'left')}
                  disabled={index === 0}
                  className="h-6 w-6"
                >
                  <ArrowLeft size={12} className="text-[var(--color-text-muted)]" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveColumn(column.id, 'right')}
                  disabled={index === resolvedColumns.length - 1}
                  className="h-6 w-6"
                >
                  <ArrowRight size={12} className="text-[var(--color-text-muted)]" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  ) : null;

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
        style={{ boxShadow: 'var(--shadow-card)' }}>
        {[...Array(6)].map((_, idx) => (
          <Skeleton key={idx} className="h-9 rounded-[var(--border-radius-sm)] bg-[#e8eaed]" />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>

      {/* ── Bulk action bar (ERPNext style) ── */}
      {canSelectRows && activeSelectedIds.size > 0 && (
        <div className="erp-bulk-bar erp-animate-in">
          <CheckSquare size={16} className="text-[rgb(var(--color-primary))]" />
          <span className="erp-bulk-count">{activeSelectedIds.size} عنصر محدد</span>
          <div className="flex-1" />
          {bulkActions.map((action) => (
            <Button
              type="button"
              key={action.label}
              onClick={() => action.action(selectedItems)}
              disabled={action.disabled}
              className={[
                'inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold',
                action.variant === 'danger'
                  ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                  : action.variant === 'primary'
                    ? 'bg-[rgb(var(--color-primary))] border border-[rgb(var(--color-primary))] text-white hover:opacity-90'
                    : 'bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[#f0f2f5]',
                action.disabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {renderActionIcon(action.icon)}
              {action.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSelectedIds(new Set())}
            className="h-7 w-7 p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[#f0f2f5] border border-transparent hover:border-[var(--color-border)]"
            title="إلغاء التحديد"
          >
            <X className="h-4 w-4" />
          </Button>
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
              <Search className="text-[var(--color-text-muted)]" style={{ width: 15, height: 15, flexShrink: 0 }} />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="!border-0 !bg-transparent !shadow-none !ring-0 focus-visible:!ring-0"
              />
              {searchTerm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchTerm('')}
                  className="h-5 w-5 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  title="مسح البحث"
                >
                  <X style={{ width: 14, height: 14 }} />
                </Button>
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
          <Table className="w-full text-right border-collapse">
            <TableHeader className="sticky top-0 z-10" style={{ background: '#f8f9fa' }}>
              <TableRow style={{ borderBottom: '1px solid var(--color-border)' }}>
                {canSelectRows && (
                  <TableHead className="w-10 px-3 py-2.5">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAllSelection} />
                  </TableHead>
                )}
                {visibleColumns.map((column) => (
                  <TableHead
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
                        sortColumnId === column.id ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={12} className="text-primary" />
                          ) : (
                            <ArrowDown size={12} className="text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown size={12} className="text-[var(--color-border)]" />
                        )
                      )}
                    </span>
                  </TableHead>
                ))}
                {renderActions && (
                  <TableHead className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] text-left whitespace-nowrap">
                    {actionsHeader}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="px-6 py-14 text-center">
                    <span className="material-icons-round text-[40px] opacity-25 block mb-2 text-[var(--color-text-muted)]">{emptyIcon}</span>
                    <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{emptyTitle}</p>
                    {emptySubtitle && <p className="text-[12px] text-[var(--color-text-muted)] mt-1">{emptySubtitle}</p>}
                  </TableCell>
                </TableRow>
              )}

              {pageRows.map((row) => {
                const rowId = getId(row);
                const isSelected = activeSelectedIds.has(rowId);
                return (
                  <TableRow
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
                      <TableCell className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelection(rowId)} />
                      </TableCell>
                    )}
                    {visibleColumns.map((column) => (
                      <TableCell
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
                      </TableCell>
                    ))}
                    {renderActions && (
                      <TableCell className="px-3 py-2.5 text-left" onClick={(e) => e.stopPropagation()}>
                        {renderActions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="px-3 py-2.5 border-t border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[var(--color-card)]">
          <span className="text-[11.5px] text-[var(--color-text-muted)] font-medium">
            صفحة {currentPage} من {totalPages} — إجمالي {sortedRows.length} سجل
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-1 text-[var(--color-text-muted)] hover:bg-[#f0f2f5] disabled:opacity-30"
              title="الأولى"
            >
              <ChevronsRight size={14} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 px-2.5 text-[12px] font-medium hover:bg-[#f0f2f5] disabled:opacity-30"
            >
              السابق
            </Button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) page = i + 1;
                else if (currentPage <= 3) page = i + 1;
                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                else page = currentPage - 2 + i;
                return (
                  <Button
                    type="button"
                    variant={page === currentPage ? 'default' : 'ghost'}
                    size="icon"
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={page === currentPage
                      ? 'h-7 w-7 bg-primary text-white'
                      : 'h-7 w-7 text-[var(--color-text-muted)] hover:bg-[#f0f2f5]'}
                  >
                    {page}
                  </Button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-7 px-2.5 text-[12px] font-medium hover:bg-[#f0f2f5] disabled:opacity-30"
            >
              التالي
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-1 text-[var(--color-text-muted)] hover:bg-[#f0f2f5] disabled:opacity-30"
              title="الأخيرة"
            >
              <ChevronsLeft size={14} />
            </Button>
          </div>
        </div>

        {footer}
      </div>
    </div>
  );
}
