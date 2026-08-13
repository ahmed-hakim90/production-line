import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
  Factory_IMAGE_PRIMARY,
  resolveImageExportPalette,
} from '@/utils/imageExportTheme'
import { resolvePrintAccentHex } from '@/utils/printTheme'
import { PrintBrandHeader } from './PrintBrandHeader'
import { PrintExtraLines } from './PrintExtraLines'
import { PRINT_SURFACE } from '@/utils/print/printSurface'

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
 * Shared Factory print chrome — same visual language as stock transfer permit / report layouts.
 * Use for vouchers and invoices that need custom table bodies via `children`.
 * Prefer `PrintReportLayout` (which wraps this shell) for KPI + section reports.
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
          'print-root print-report arabic-export-root mx-auto print:mx-0 print:w-full print:max-w-none print:min-w-0',
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
          color: PRINT_SURFACE.text,
          background: PRINT_SURFACE.card,
        }}
      >
        <PrintBrandHeader
          companyName={companyName}
          documentType={documentType}
          printDate={printDate}
          logoUrl={logoUrl}
          brandAccent={accent}
          dense={dense}
        />

        <PrintExtraLines lines={customLines} dense={dense} />

        {meta.length > 0 ? (
          <div
            className={cn('print-meta-grid', gridColsClass(meta.length))}
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplateColumns(meta.length),
              marginBottom: 16,
              overflow: 'hidden',
              borderRadius: 8,
              border: `1px solid ${PRINT_SURFACE.border}`,
            }}
          >
            {meta.map((item, i) => (
              <div
                key={`${item.label}-${i}`}
                className="print-meta-cell"
                style={{
                  padding: dense ? '6px 10px' : '8px 12px',
                  background: PRINT_SURFACE.bg,
                  borderInlineEnd: i < meta.length - 1 ? `1px solid ${PRINT_SURFACE.border}` : undefined,
                }}
              >
                <p className="print-meta-label" style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 800, letterSpacing: 'normal', color: PRINT_SURFACE.muted }}>
                  {item.label}
                </p>
                <p
                  className="print-meta-value"
                  style={{ margin: 0, fontSize: 11, fontWeight: 800, lineHeight: 1.3, wordBreak: 'break-word', color: PRINT_SURFACE.text }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {kpiList.length > 0 ? (
          <div
            className={cn('print-kpi-grid', gridColsClass(kpiList.length))}
            style={{ display: 'grid', gridTemplateColumns: gridTemplateColumns(kpiList.length), gap: 8, marginBottom: 16 }}
          >
            {kpiList.map((kpi, i) => (
              <div
                key={`${kpi.label}-${i}`}
                className="print-kpi-card"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  minHeight: dense ? '3.75rem' : '4.5rem',
                  overflow: 'hidden',
                  borderRadius: 8,
                  border: `1px solid ${PRINT_SURFACE.border}`,
                  background: PRINT_SURFACE.bg,
                }}
              >
                <div
                  className="print-kpi-strip"
                  style={{ width: 3, flexShrink: 0, alignSelf: 'stretch', backgroundColor: kpiStripColor(kpi.tone, accent, palette.workersStrip) }}
                />
                <div
                  className="print-kpi-body"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: dense ? '8px 8px' : '10px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div dir="rtl" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', columnGap: 4 }}>
                    <span
                      style={{
                        fontWeight: 900,
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: dense ? 18 : 20,
                        lineHeight: 1.15,
                        color: kpiValueColor(kpi.tone, accent),
                        letterSpacing: 'normal',
                      }}
                    >
                      {typeof kpi.value === 'number' ? kpi.value.toLocaleString('ar-EG') : kpi.value}
                    </span>
                    {kpi.unit ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: PRINT_SURFACE.muted }}>{kpi.unit}</span>
                    ) : null}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, lineHeight: 1.35, color: PRINT_SURFACE.muted }}>{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {children}

        {signatures && signatures.length > 0 ? (
          <section
            className={cn('print-sign-grid', gridColsClass(signatures.length))}
            style={{ display: 'grid', gridTemplateColumns: gridTemplateColumns(signatures.length), gap: 16, marginTop: 24 }}
          >
            {signatures.map((sig) => (
              <div key={sig.title} className="print-sign-slot" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <p style={{ margin: '0 0 32px', fontSize: 12, fontWeight: 800, color: PRINT_SURFACE.text }}>{sig.title}</p>
                <div style={{ width: '100%', borderTop: `1px solid ${PRINT_SURFACE.border}`, paddingTop: 4, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 10, color: PRINT_SURFACE.muted }}>{sig.detail || 'الاسم / التوقيع'}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <footer style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${PRINT_SURFACE.border}`, paddingTop: 12 }}>
          <p style={{ margin: 0, fontSize: 10, minWidth: 0, letterSpacing: 'normal', color: PRINT_SURFACE.muted }}>
            {footerTagline} — {printDate}
          </p>
          {showVersion && version ? (
            <p
              style={{ margin: 0, fontSize: 9, fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: '#94a3b8', letterSpacing: 'normal' }}
              title="إصدار النظام"
            >
              v{version}
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
    <div className="print-section-head" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
      <div className="print-section-bar" style={{ height: 12, width: 3, flexShrink: 0, borderRadius: 999, backgroundColor: accent }} />
      <p className="print-section-title" style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 'normal', color: PRINT_SURFACE.muted }}>
        {title}
      </p>
    </div>
  )
}
