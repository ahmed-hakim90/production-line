import { forwardRef, type ReactNode } from "react"
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
  resolveImageExportPalette,
} from "@/utils/imageExportTheme"
import { resolvePrintAccentHex } from "@/utils/printTheme"
import { PRINT_SURFACE } from "@/utils/print/printSurface"
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from "./FactoryPrintShell"

export interface ReportMetaCard {
  label: string
  value: string
}

interface ReportKPI {
  label: string
  value: string | number
  unit?: string
  color?: "indigo" | "green" | "red" | "sky" | "default"
}

interface ReportSection {
  title: string
  rows: {
    label: string
    value: string | ReactNode
    highlight?: boolean
    fullWidth?: boolean
  }[]
  progress?: { value: number; label: string }
}

export interface PrintReportLayoutProps {
  companyName: string
  reportType: string
  printDate: string
  /** When `metaCards` is non-empty, it replaces the default four production meta cells. */
  meta: {
    reportNumber: string
    reportDate: string
    lineName: string
    supervisorName: string
  }
  metaCards?: ReportMetaCard[]
  kpis: ReportKPI[]
  sections: ReportSection[]
  signatures?: { title: string }[]
  version?: string
  /** Root id for capture / clone hooks (unique per instance when multiple exports on one page). */
  exportRootId?: string
  logoUrl?: string
  /** Accent hex (e.g. print template primary). Defaults to brand blue. */
  brandAccent?: string
  /** Left footer phrase before em dash + date. */
  footerTagline?: string
  /** Ignored for layout; kept for call-site compatibility with print settings. */
  paperSize?: string
  orientation?: string
  /** When true, card fills a share wrapper (variance banner) instead of fixed 640 root. */
  nestedInShareWrapper?: boolean
  /** Tenant custom lines from print document settings */
  extraLines?: string[]
  /** CSS font-family stack from print settings */
  fontFamily?: string
  /** CSS font-size (e.g. 10pt) */
  fontSize?: string
  /** Physical paper width (e.g. 210mm) for browser print — matches FactoryPrintShell. */
  paperWidth?: string
  minHeight?: string
  padding?: string
}

/**
 * Report-style print surface on FactoryPrintShell chrome (header / meta / KPIs / signatures / footer).
 * Keeps production-specific KV sections + progress bars as children.
 */
export const PrintReportLayout = forwardRef<HTMLDivElement, PrintReportLayoutProps>(
  (
    {
      companyName,
      reportType,
      printDate,
      meta,
      metaCards,
      kpis,
      sections,
      signatures,
      version = __APP_VERSION__,
      exportRootId = "print-root",
      logoUrl,
      brandAccent,
      footerTagline = Factory_DEFAULT_FOOTER_TAGLINE,
      nestedInShareWrapper = false,
      extraLines,
      fontFamily = "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
      fontSize = "10pt",
      paperWidth,
      minHeight,
      padding,
    },
    ref,
  ) => {
    const palette = resolveImageExportPalette(resolvePrintAccentHex(brandAccent))
    const accent = palette.primary
    const metaCells: ReportMetaCard[] =
      metaCards != null
        ? metaCards
        : [
            { label: "رقم التقرير", value: meta.reportNumber },
            { label: "تاريخ التقرير", value: meta.reportDate },
            { label: "خط الإنتاج", value: meta.lineName },
            { label: "إشراف", value: meta.supervisorName },
          ]
    const kpiList = kpis ?? []

    return (
      <FactoryPrintShell
        ref={ref}
        exportRootId={exportRootId}
        companyName={companyName}
        documentType={reportType}
        printDate={printDate}
        logoUrl={logoUrl}
        brandAccent={accent}
        footerTagline={footerTagline}
        version={version}
        showVersion={Boolean(version)}
        extraLines={extraLines}
        fontFamily={fontFamily}
        fontSize={fontSize}
        width={nestedInShareWrapper ? "100%" : 640}
        paperWidth={paperWidth}
        minHeight={minHeight}
        padding={padding}
        className={nestedInShareWrapper ? "w-full max-w-none" : undefined}
        metaCards={metaCells.length > 0 ? metaCells : undefined}
        kpis={
          kpiList.length > 0
            ? kpiList.map((kpi) => ({
                label: kpi.label,
                value: kpi.value,
                unit: kpi.unit,
                tone: kpi.color === "default" ? undefined : kpi.color,
              }))
            : undefined
        }
        signatures={signatures}
      >
        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: si < sections.length - 1 ? 12 : 0 }}>
            <FactoryPrintSectionTitle title={section.title} accent={accent} />

            <div
              className="print-kv-block"
              style={{
                overflow: "hidden",
                borderRadius: 8,
                border: `1px solid ${PRINT_SURFACE.border}`,
                background: PRINT_SURFACE.card,
              }}
            >
              {section.rows.map((row, ri) =>
                row.fullWidth ? (
                  <div
                    key={ri}
                    className="print-kv-row"
                    style={{
                      padding: "10px 12px",
                      borderBottom:
                        ri < section.rows.length - 1 || section.progress
                          ? `1px solid ${PRINT_SURFACE.border}`
                          : undefined,
                    }}
                  >
                    {row.label ? (
                      <p
                        className="print-kv-label"
                        style={{
                          margin: "0 0 6px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: PRINT_SURFACE.muted,
                        }}
                      >
                        {row.label}
                      </p>
                    ) : null}
                    <div style={{ minWidth: 0 }}>{row.value}</div>
                  </div>
                ) : (
                  <div
                    key={ri}
                    className="print-kv-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "38% 1fr",
                      gap: 12,
                      padding: "10px 12px",
                      alignItems: "start",
                      borderBottom:
                        ri < section.rows.length - 1 || section.progress
                          ? `1px solid ${PRINT_SURFACE.border}`
                          : undefined,
                    }}
                  >
                    <p
                      className="print-kv-label"
                      style={{
                        margin: 0,
                        fontSize: 11,
                        fontWeight: 600,
                        color: PRINT_SURFACE.muted,
                        paddingTop: 2,
                      }}
                    >
                      {row.label}
                    </p>
                    <div
                      className="print-kv-value"
                      style={{
                        fontSize: 13,
                        fontWeight: row.highlight ? 800 : 700,
                        color: row.highlight ? accent : PRINT_SURFACE.text,
                        minWidth: 0,
                      }}
                    >
                      {row.value}
                    </div>
                  </div>
                ),
              )}

              {section.progress ? (
                <div
                  className="print-kv-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "38% 1fr",
                    gap: 12,
                    padding: "10px 12px",
                    alignItems: "center",
                  }}
                >
                  <p
                    className="print-kv-label"
                    style={{ margin: 0, fontSize: 11, fontWeight: 600, color: PRINT_SURFACE.muted }}
                  >
                    {section.progress.label}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      className="print-progress-track"
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 999,
                        overflow: "hidden",
                        background: palette.progressTrack,
                      }}
                    >
                      <div
                        className="print-progress-fill"
                        style={{
                          height: "100%",
                          borderRadius: 999,
                          width: `${Math.max(0, Math.min(100, section.progress.value))}%`,
                          backgroundColor: accent,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        minWidth: 32,
                        textAlign: "right",
                        color: accent,
                      }}
                    >
                      {Math.max(0, Math.min(100, section.progress.value))}%
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </FactoryPrintShell>
    )
  },
)

PrintReportLayout.displayName = "PrintReportLayout"

export type { ReportKPI, ReportSection }
