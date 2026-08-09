/**
 * Lightweight sortable table for simple dashboards (few columns, row actions).
 * For toolbars, bulk actions, column visibility, and built-in search, use the organism:
 * `@/src/shared/ui/organisms/DataTable/DataTable`.
 *
 * Mobile: auto card list. Desktop: classic table.
 */
import { ReactNode, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { skeletonBlockClass } from "@/src/shared/ui/skeletons"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RowActionsMenu, type RowActionMenuItem } from "./RowActionsMenu"

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  width?: string
  align?: "start" | "center" | "end"
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  isLoading?: boolean
  emptyMessage?: string
  rowClassName?: (row: T) => string
  getRowActions?: (row: T) => RowActionMenuItem[]
  actionsHeader?: string
  /** Optional custom mobile card. Defaults to first column as title + remaining as meta rows. */
  renderMobileCard?: (row: T, index: number) => ReactNode
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage,
  rowClassName,
  getRowActions,
  actionsHeader,
  renderMobileCard,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const hasActions = Boolean(getRowActions)
  const resolvedEmptyMessage = emptyMessage ?? t("erpComponents.dataTable.emptyMessage")
  const resolvedActionsHeader = actionsHeader ?? t("erpComponents.dataTable.actionsHeader")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  const getAlignClass = (align?: Column<T>["align"]) => {
    if (align === "center") return "text-center"
    if (align === "end") return "text-left"
    return "text-right"
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    const targetColumn = columns.find((col) => col.key === sortKey && col.sortable)
    if (!targetColumn) return data
    return [...data].sort((a, b) => {
      const aValue = String(targetColumn.cell(a) ?? "")
      const bValue = String(targetColumn.cell(b) ?? "")
      const comparison = aValue.localeCompare(bValue, "ar", { numeric: true, sensitivity: "base" })
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [columns, data, sortDirection, sortKey])

  const onSort = (column: Column<T>) => {
    if (!column.sortable) return
    if (sortKey === column.key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(column.key)
    setSortDirection("asc")
  }

  const defaultMobileCard = (row: T, index: number) => {
    const [titleCol, ...rest] = columns
    return (
      <div
        key={`m-row-${index}`}
        className={cn(
          "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm",
          rowClassName?.(row),
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {titleCol ? (
              <>
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">{titleCol.header}</p>
                <div className="mt-0.5 text-sm font-bold text-[var(--color-text)]">{titleCol.cell(row)}</div>
              </>
            ) : null}
          </div>
          {hasActions ? <RowActionsMenu items={getRowActions?.(row) ?? []} /> : null}
        </div>
        {rest.length > 0 ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {rest.map((col) => (
              <div key={col.key} className="min-w-0">
                <dt className="text-[10px] font-semibold text-[var(--color-text-muted)]">{col.header}</dt>
                <dd className="truncate text-xs font-medium text-[var(--color-text)]">{col.cell(row)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-card)]">
      {/* Mobile cards */}
      <div className="erp-mobile-card-list p-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`m-sk-${i}`} className={cn("h-24 w-full rounded-xl", skeletonBlockClass)} />
          ))
        ) : sortedData.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">{resolvedEmptyMessage}</p>
        ) : (
          sortedData.map((row, i) =>
            renderMobileCard ? (
              <div key={`m-custom-${i}`}>{renderMobileCard(row, i)}</div>
            ) : (
              defaultMobileCard(row, i)
            ),
          )
        )}
      </div>

      {/* Desktop table */}
      <div className="erp-desktop-table hidden md:block">
        <Table>
          <TableHeader className="bg-[var(--color-bg)]">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]",
                    getAlignClass(col.align),
                    col.sortable && "cursor-pointer select-none",
                  )}
                  onClick={() => onSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      sortKey === col.key ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-[rgb(var(--color-primary))]" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-[rgb(var(--color-primary))]" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                      )
                    )}
                  </span>
                </TableHead>
              ))}
              {hasActions && (
                <TableHead className="w-[76px] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {resolvedActionsHeader}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`loading-${i}`} className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableCell key={`${col.key}-${i}`}>
                      <Skeleton className={cn("h-4 w-full rounded-md", skeletonBlockClass)} />
                    </TableCell>
                  ))}
                  {hasActions && (
                    <TableCell className="text-left">
                      <Skeleton className={cn("ms-auto h-7 w-7 rounded-md", skeletonBlockClass)} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : sortedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="h-24 text-center text-sm font-normal text-[var(--color-text-muted)]"
                >
                  {resolvedEmptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row, i) => (
                <TableRow key={`row-${i}`} className={cn("transition-colors hover:bg-[var(--color-bg)]", rowClassName?.(row))}>
                  {columns.map((col) => (
                    <TableCell
                      key={`${col.key}-${i}`}
                      className={cn("text-sm font-normal text-[var(--color-text)]", getAlignClass(col.align))}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                  {hasActions && (
                    <TableCell className="text-left">
                      <RowActionsMenu items={getRowActions?.(row) ?? []} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
