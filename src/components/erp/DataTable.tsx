/**
 * Lightweight sortable table for simple dashboards (few columns, row actions).
 * For toolbars, bulk actions, column visibility, and built-in search, use the organism:
 * `@/src/shared/ui/organisms/DataTable/DataTable`.
 */
import { ReactNode, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
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
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage,
  rowClassName,
  getRowActions,
  actionsHeader,
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "text-xs font-medium text-[#64748B]",
                  getAlignClass(col.align),
                  col.sortable && "cursor-pointer select-none"
                )}
                onClick={() => onSort(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    sortKey === col.key ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-[#4F46E5]" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-[#4F46E5]" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 text-[#94A3B8]" />
                    )
                  )}
                </span>
              </TableHead>
            ))}
            {hasActions && (
              <TableHead className="w-[76px] text-left text-xs font-medium text-[#64748B]">
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
                    <Skeleton className="h-4 w-full rounded-md" />
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell className="text-left">
                    <Skeleton className="ms-auto h-7 w-7 rounded-md" />
                  </TableCell>
                )}
              </TableRow>
            ))
          ) : sortedData.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (hasActions ? 1 : 0)}
                className="h-24 text-center text-sm font-normal text-[#64748B]"
              >
                {resolvedEmptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((row, i) => (
              <TableRow key={`row-${i}`} className={cn("transition-colors hover:bg-slate-50", rowClassName?.(row))}>
                {columns.map((col) => (
                  <TableCell
                    key={`${col.key}-${i}`}
                    className={cn("text-sm font-normal text-[#0F172A]", getAlignClass(col.align))}
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
  )
}
