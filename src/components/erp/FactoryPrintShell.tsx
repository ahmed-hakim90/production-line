import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
  Factory_IMAGE_PRIMARY,
  resolveImageExportPalette,
} from '@/utils/imageExportTheme'
import { resolvePrintAccentHex } from '@/utils/printTheme'
import { PrintExtraLines } from './PrintExtraLines'

export type FactoryPrintMetaCard = {
  label: string
  value: string
}

export type FactoryPrintKpi = {
  label: string
  value: string | number
  unit?: string
  /** Accent strip + value tone */
  tone?: 'indigo' | 'green' | 'red' | 'sky' | 'default'
}

export type FactoryPrintShellProps = {
  companyName: string
  documentType: string
  printDate: string
  logoUrl?: string
  brandAccent?: string
  footerTagline?: string
  version?: string
  showVersion?: boolean
  metaCards?: FactoryPrintMetaCard[]
  kpis?: FactoryPrintKpi[]
  signatures?: { title: string; detail?: string }[]
  /** Tenant custom lines from print document settings */
  extraLines?: string[]
  children?: ReactNode
  /** Root id for capture / clone hooks */
  exportRootId?: string
  /** Pixel width for screen/PDF capture (default Factory card). Ignored when `paperWidth` is set. */
  width?: number | string
  /** Physical paper width (e.g. 210mm / 148mm / 80mm) for browser print. */
  paperWidth?: string
  minHeight?: string
  padding?: string
  className?: string
  /** Compact thermal / A5 density */
  dense?: boolean
  /** CSS font-family stack from print settings */
  fontFamily?: string
  /** CSS font-size (e.g. 10pt) */
  fontSize?: string
}

const gridColsClass = (count: number) => {
  switch (Math.max(1, Math.min(4, count))) {
    case 1:
      return 'grid-cols-1'
    case 2:
      return 'grid-cols-2'
    case 3:
      return 'grid-cols-3'
    default:
      return 'grid-cols-4'
  }
}

const gridTemplateColumns = (count: number) =>
  `repeat(${Math.max(1, Math.min(4, count))}, minmax(0, 1fr))`

const kpiStripColor = (tone: FactoryPrintKpi['tone'], accent: string, workersStrip: string): string => {
  if (tone === 'indigo') return accent
  if (tone === 'green') return '#059669'
  if (tone === 'red') return '#dc2626'
  if (tone === 'sky') return workersStrip
  return '#cbd5e1'
}

const kpiValueColor = (tone: FactoryPrintKpi['tone'], accent: string): string => {
  if (tone === 'indigo') return accent
  if (tone === 'green') return '#047857'
  if (tone === 'red') return '#b91c1c'
  if (tone === 'sky') return '#0369a1'
  return '#0f172a'
}

/**
 * Shared Factory print chrome — same visual language as PrintReportLayout / stock transfer permit.
 * Use for vouchers and invoices that need custom table bodies via `children`.
 */
export const FactoryPrintShell = forwardRef<HTMLDivElement, FactoryPrintShellProps>(
  (
    {
      companyName,
      documentType,
      printDate,
      logoUrl,
      brandAccent,
      footerTagline = Factory_DEFAULT_FOOTER_TAGLINE,
      version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '',
      showVersion = true,
      metaCards,
      kpis,
      signatures,
      extraLines,
      children,
      exportRootId = 'print-root',
      width = 640,
      paperWidth,
      minHeight,
      padding,
      className,
      dense = false,
      fontFamily = "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
      fontSize,
    },
    ref,
  ) => {
    const palette = resolveImageExportPalette(resolvePrintAccentHex(brandAccent))
    const accent = palette.primary
    // Screen / PDF capture keep an explicit preview width.
    // @media print (printManager + index.css) forces 100% of the printable area.
    const resolvedWidth = paperWidth ?? width
    const resolvedPadding = padding ?? (dense ? '14px 16px' : '28px 32px')
    const headerBorderStyle: CSSProperties = { borderBottomColor: accent }
    const meta = metaCards ?? []
    const kpiList = kpis ?? []
    const customLines = extraLines ?? []
    const resolvedFontSize = fontSize ?? (dense ? '9pt' : '10pt')

    return (
      <div
        id={exportRootId}
        ref={ref}
        dir="rtl"
        lang="ar"
        data-print-font={fontFamily}
        className={cn(
          'print-root print-report arabic-export-root bg-[var(--color-card)] mx-auto print:mx-0 print:w-full print:max-w-none print:min-w-0',
          !paperWidth && 'w-[640px]',
          className,
        )}
        style={{
          fontFamily,
          fontSize: resolvedFontSize,
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          width: resolvedWidth,
          minWidth: paperWidth ? undefined : resolvedWidth,
          maxWidth: resolvedWidth,
          minHeight,
          boxSizing: 'border-box',
          padding: resolvedPadding,
          flexShrink: 0,
          color: '#0f172a',
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b-2 pb-3 mb-4" style={headerBorderStyle}>
          <div className="flex items-start gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className={cn('w-auto object-contain shrink-0', dense ? 'h-8' : 'h-10')} />
            ) : null}
            <div className="min-w-0">
              <h1
                className={cn('font-extrabold text-[var(--color-text)] leading-tight', dense ? 'text-[15px]' : 'text-[18px]')}
                style={{ letterSpacing: 'normal' }}
              >
                {companyName}
              </h1>
              <p className="mt-0.5 text-[10px] font-semibold" style={{ color: accent, letterSpacing: 'normal' }}>
                Factory PRODUCTION SYSTEM
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span
              className="inline-flex items-center justify-center rounded-md font-extrabold"
              style={{
                fontSize: dense ? '12px' : '13px',
                lineHeight: 1.3,
                padding: dense ? '4px 8px' : '5px 10px',
                background: palette.badgeBg,
                color: palette.badgeText,
                letterSpacing: 'normal',
                maxWidth: '220px',
                textAlign: 'center',
              }}
            >
              {documentType}
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)]" style={{ letterSpacing: 'normal' }}>
              {printDate}
            </span>
          </div>
        </header>

        <PrintExtraLines lines={customLines} dense={dense} />

        {meta.length > 0 ? (
          <div
            className={cn(
              'mb-4 grid overflow-hidden rounded-lg border border-[var(--color-border)]',
              gridColsClass(meta.length),
            )}
            style={{ display: 'grid', gridTemplateColumns: gridTemplateColumns(meta.length) }}
          >
            {meta.map((item, i) => (
              <div
                key={`${item.label}-${i}`}
                className={cn('bg-[var(--color-bg)] px-3 py-2', i < meta.length - 1 && 'border-l border-[var(--color-border)]')}
              >
                <p className="mb-1 text-[9px] font-bold text-[var(--color-text-muted)]" style={{ letterSpacing: 'normal' }}>
                  {item.label}
                </p>
                <p
                  className="text-[11px] font-extrabold leading-tight text-[var(--color-text)]"
                  style={{ wordBreak: 'break-word' }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {kpiList.length > 0 ? (
          <div
            className={cn('mb-4 grid gap-2', gridColsClass(kpiList.length))}
            style={{ display: 'grid', gridTemplateColumns: gridTemplateColumns(kpiList.length), gap: '0.5rem' }}
          >
            {kpiList.map((kpi, i) => (
              <div
                key={`${kpi.label}-${i}`}
                className="flex min-h-[4.5rem] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
                style={{ display: 'flex', flexDirection: 'row', minHeight: dense ? '3.75rem' : '4.5rem' }}
              >
                <div
                  className="w-[3px] shrink-0 self-stretch"
                  style={{ backgroundColor: kpiStripColor(kpi.tone, accent, palette.workersStrip) }}
                />
                <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-2.5 text-center">
                  <div className="flex flex-wrap items-baseline justify-center gap-x-1" dir="rtl">
                    <span
                      className="font-black tabular-nums"
                      style={{
                        fontSize: dense ? '18px' : '20px',
                        lineHeight: 1.15,
                        color: kpiValueColor(kpi.tone, accent),
                        letterSpacing: 'normal',
                      }}
                    >
                      {typeof kpi.value === 'number' ? kpi.value.toLocaleString('ar-EG') : kpi.value}
                    </span>
                    {kpi.unit ? (
                      <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">{kpi.unit}</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] font-bold leading-snug text-[var(--color-text-muted)]">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {children}

        {signatures && signatures.length > 0 ? (
          <section
            className={cn('mt-6 grid gap-4', gridColsClass(signatures.length))}
            style={{ display: 'grid', gridTemplateColumns: gridTemplateColumns(signatures.length) }}
          >
            {signatures.map((sig) => (
              <div key={sig.title} className="flex flex-col items-center">
                <p className="mb-8 text-[12px] font-extrabold text-[var(--color-text)]">{sig.title}</p>
                <div className="w-full border-t border-[var(--color-border)] pt-1 text-center">
                  <p className="text-[10px] text-[var(--color-text-muted)]">{sig.detail || 'الاسم / التوقيع'}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <footer className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
          <p className="text-[10px] text-[var(--color-text-muted)]" style={{ letterSpacing: 'normal' }}>
            {footerTagline} — {printDate}
          </p>
          {showVersion && version ? (
            <p className="text-[10px] font-bold" style={{ color: accent, letterSpacing: 'normal' }}>
              Factory {version}
            </p>
          ) : null}
        </footer>
      </div>
    )
  },
)

FactoryPrintShell.displayName = 'FactoryPrintShell'

/** Section title with Factory accent bar — use above tables / note blocks. */
export function FactoryPrintSectionTitle({
  title,
  accent = Factory_IMAGE_PRIMARY,
}: {
  title: string
  accent?: string
}) {
  return (
    <div className="mb-2 mt-1 flex items-center gap-2">
      <div className="h-3 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-extrabold text-[var(--color-text-muted)]" style={{ letterSpacing: 'normal' }}>
        {title}
      </p>
    </div>
  )
}
