import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { PrintTemplateSettings } from '@/types'
import { lightenHex } from '@/utils/imageExportTheme'
import { getPrintThemePalette, resolvePrintAccentHex } from '@/utils/printTheme'

export type FactoryPrintTableColumn = {
  key: string
  header: string
  width?: string
  align?: 'right' | 'center' | 'left'
  /** Empty handwriting cell (e.g. inventory actual qty). */
  blank?: boolean
}

export type FactoryPrintTableRow = {
  key: string
  cells: Record<string, ReactNode>
}

export type FactoryPrintTableProps = {
  columns: FactoryPrintTableColumn[]
  rows: FactoryPrintTableRow[]
  /** Print template primary / accent — drives header tint when settings omit table colors. */
  brandAccent?: string
  printSettings?: PrintTemplateSettings
  dense?: boolean
  className?: string
  tableLayout?: 'fixed' | 'auto'
}

/**
 * Shared themed print table — header uses tenant print palette; supports blank cells for handwriting.
 */
export function FactoryPrintTable({
  columns,
  rows,
  brandAccent,
  printSettings,
  dense = false,
  className,
  tableLayout = 'fixed',
}: FactoryPrintTableProps) {
  const palette = getPrintThemePalette(printSettings)
  const accent = resolvePrintAccentHex(brandAccent || printSettings?.primaryColor || palette.primary)
  const headerBg = printSettings?.tableHeaderBgColor || lightenHex(accent, 0.9)
  const headerText = printSettings?.tableHeaderTextColor || palette.tableHeaderText
  const borderColor = printSettings?.borderColor || palette.border
  const altRowBg = printSettings?.tableRowAltBgColor || palette.tableRowAltBg
  const cellPad = dense ? '6px' : '8px'
  const fontSize = dense ? 10 : 11
  const blankPad = dense ? '10px 6px' : '12px 8px'

  const borderStyle: CSSProperties = { borderColor }

  return (
    <table
      className={className}
      style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', tableLayout }}
    >
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                ...borderStyle,
                borderWidth: 1,
                borderStyle: 'solid',
                width: col.width,
                background: headerBg,
                color: headerText,
                letterSpacing: 'normal',
                padding: cellPad,
                fontSize,
                fontWeight: 800,
                textAlign: col.align === 'center' ? 'center' : col.align === 'left' ? 'left' : 'right',
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.key}
            style={{
              background: index % 2 === 0 ? '#ffffff' : altRowBg,
              breakInside: 'avoid',
              pageBreakInside: 'avoid',
            }}
          >
            {columns.map((col) => {
              if (col.blank) {
                return (
                  <td
                    key={col.key}
                    style={{
                      ...borderStyle,
                      borderWidth: 1,
                      borderStyle: 'solid',
                      background: '#ffffff',
                      padding: blankPad,
                    }}
                    aria-label={`${col.header} — خانة يدوية`}
                  />
                )
              }
              return (
                <td
                  key={col.key}
                  style={{
                    ...borderStyle,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    color: palette.text,
                    letterSpacing: 'normal',
                    padding: cellPad,
                    fontSize,
                    fontWeight: 600,
                    wordBreak: 'break-word',
                    textAlign: col.align === 'center' ? 'center' : col.align === 'left' ? 'left' : 'right',
                  }}
                >
                  {row.cells[col.key] ?? '—'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Emphasized numeric cell value for qty / money columns. */
export function FactoryPrintTableAccentValue({
  children,
  accent,
  className,
}: {
  children: ReactNode
  accent: string
  className?: string
}) {
  return (
    <span
      className={cn('font-black tabular-nums', className)}
      style={{ color: accent, letterSpacing: 'normal' }}
    >
      {children}
    </span>
  )
}
