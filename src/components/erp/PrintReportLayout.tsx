import { forwardRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
  resolveImageExportPalette,
} from "@/utils/imageExportTheme"
import { resolvePrintAccentHex } from "@/utils/printTheme"
import { PrintBrandHeader } from "./PrintBrandHeader"
import { PrintExtraLines } from "./PrintExtraLines"
import { PRINT_SURFACE } from "@/utils/print/printSurface"

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

const gridColsClass = (count: number) => {
  switch (count) {
    case 1:
      return "grid-cols-1"
    case 2:
      return "grid-cols-2"
    case 3:
      return "grid-cols-3"
    case 4:
      return "grid-cols-4"
    default:
      return "grid-cols-4"
  }
}

const gridTemplateColumns = (count: number) =>
  `repeat(${Math.max(1, Math.min(4, count))}, minmax(0, 1fr))`

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
    const cardWidth = nestedInShareWrapper ? ("100%" as const) : (640 as const)
    const customLines = extraLines ?? []
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

    /** Solid strip (no inset box-shadow — html2canvas can mis-render shadow as full fill). */
    const kpiStripColor = (kpi: ReportKPI): string => {
      if (kpi.color === "indigo") return accent
      if (kpi.color === "green") return "#059669"
      if (kpi.color === "red") return "#dc2626"
      if (kpi.color === "sky") return palette.workersStrip
      return "#cbd5e1"
    }

    const kpiValueColor = (kpi: ReportKPI): string => {
      if (kpi.color === "indigo") return accent
      if (kpi.color === "green") return "#047857"
      if (kpi.color === "red") return "#b91c1c"
      return "#0f172a"
    }

    return (
      <div
        id={exportRootId}
        ref={ref}
        dir="rtl"
        lang="ar"
        data-print-font={fontFamily}
        className={cn(
          "print-root print-report mx-auto [font-feature-settings:normal] arabic-export-root",
          !nestedInShareWrapper && !paperWidth && "w-[640px]",
          "print:w-full print:max-w-none print:min-w-0 print:mx-0",
        )}
        style={{
          fontFamily,
          fontSize,
          letterSpacing: "normal",
          wordSpacing: "normal",
          width: nestedInShareWrapper ? "100%" : (paperWidth ?? cardWidth),
          minWidth: nestedInShareWrapper || paperWidth ? undefined : 640,
          maxWidth: nestedInShareWrapper ? "100%" : (paperWidth ?? cardWidth),
          minHeight,
          boxSizing: "border-box",
          flexShrink: 0,
          color: PRINT_SURFACE.text,
          background: PRINT_SURFACE.card,
          padding: padding ?? "28px 32px",
        }}
      >
        <PrintBrandHeader
          companyName={companyName}
          documentType={reportType}
          printDate={printDate}
          logoUrl={logoUrl}
          brandAccent={accent}
        />

        <PrintExtraLines lines={customLines} />

        {metaCells.length > 0 ? (
          <div
            className={cn("print-meta-grid", gridColsClass(metaCells.length))}
            style={{
              display: "grid",
              gridTemplateColumns: gridTemplateColumns(metaCells.length),
              marginBottom: 16,
              overflow: "hidden",
              borderRadius: 8,
              border: `1px solid ${PRINT_SURFACE.border}`,
            }}
          >
            {metaCells.map((item, i) => (
              <div
                key={`${item.label}-${i}`}
                className="print-meta-cell"
                style={{
                  padding: "8px 12px",
                  background: PRINT_SURFACE.bg,
                  borderInlineEnd: i < metaCells.length - 1 ? `1px solid ${PRINT_SURFACE.border}` : undefined,
                }}
              >
                <p className="print-meta-label" style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, letterSpacing: "normal", color: PRINT_SURFACE.muted }}>
                  {item.label}
                </p>
                <p className="print-meta-value" style={{ margin: 0, fontSize: 11, fontWeight: 700, lineHeight: 1.3, wordBreak: "break-word", color: PRINT_SURFACE.text }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {kpiList.length > 0 ? (
          <div
            className={cn("print-kpi-grid", gridColsClass(kpiList.length))}
            style={{ display: "grid", gridTemplateColumns: gridTemplateColumns(kpiList.length), gap: 8, marginBottom: 16 }}
          >
            {kpiList.map((kpi, i) => (
              <div
                key={i}
                className="print-kpi-card"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  minHeight: "5.25rem",
                  overflow: "hidden",
                  borderRadius: 8,
                  border: `1px solid ${PRINT_SURFACE.border}`,
                  background: PRINT_SURFACE.bg,
                }}
              >
                <div className="print-kpi-strip" style={{ width: 3, flexShrink: 0, alignSelf: "stretch", backgroundColor: kpiStripColor(kpi) }} />
                <div
                  className="print-kpi-body"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "12px 8px",
                    textAlign: "center",
                  }}
                >
                  <div
                    dir="rtl"
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "center", gap: "0 4px", letterSpacing: "normal" }}
                  >
                    <span
                      style={{
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 22,
                        lineHeight: 1.15,
                        color: kpiValueColor(kpi),
                        letterSpacing: "normal",
                      }}
                    >
                      {typeof kpi.value === "number" ? kpi.value.toLocaleString("ar-EG") : kpi.value}
                    </span>
                    {kpi.unit ? (
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#475569",
                          letterSpacing: "normal",
                        }}
                      >
                        {kpi.unit}
                      </span>
                    ) : null}
                  </div>
                  <p
                    style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 600, lineHeight: 1.35, letterSpacing: "normal", maxWidth: "100%", color: PRINT_SURFACE.muted }}
                  >
                    {kpi.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {sections.map((section, si) => (
          <div key={si}>
            <div className="print-section-head" style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 8px" }}>
              <div
                className="print-section-bar"
                style={{ width: 3, height: 12, borderRadius: 999, flexShrink: 0, backgroundColor: accent }}
              />
              <p className="print-section-title" style={{ margin: 0, fontSize: 9, fontWeight: 800, letterSpacing: "normal", color: PRINT_SURFACE.muted }}>
                {section.title}
              </p>
            </div>

            <div
              className="print-kv-block"
              style={{ overflow: "hidden", borderRadius: 8, border: `1px solid ${PRINT_SURFACE.border}`, background: PRINT_SURFACE.card }}
            >
              {section.rows.map((row, ri) => (
                row.fullWidth ? (
                  <div
                    key={ri}
                    className="print-kv-row"
                    style={{
                      padding: "10px 12px",
                      borderBottom: ri < section.rows.length - 1 || section.progress ? `1px solid ${PRINT_SURFACE.border}` : undefined,
                    }}
                  >
                    {row.label ? (
                      <p className="print-kv-label" style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: PRINT_SURFACE.muted }}>
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
                      borderBottom: ri < section.rows.length - 1 || section.progress ? `1px solid ${PRINT_SURFACE.border}` : undefined,
                    }}
                  >
                    <p className="print-kv-label" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: PRINT_SURFACE.muted, paddingTop: 2 }}>{row.label}</p>
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
                )
              ))}

              {section.progress && (
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
                  <p className="print-kv-label" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: PRINT_SURFACE.muted }}>{section.progress.label}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      className="print-progress-track"
                      style={{ flex: 1, height: 6, borderRadius: 999, overflow: "hidden", background: palette.progressTrack }}
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
                      style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right", color: accent }}
                    >
                      {Math.max(0, Math.min(100, section.progress.value))}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {si < sections.length - 1 && <div style={{ height: 1, background: PRINT_SURFACE.bg, marginTop: 12 }} />}
          </div>
        ))}

        {signatures && signatures.length > 0 && (
          <div
            className={cn("print-sign-grid", gridColsClass(signatures.length))}
            style={{ display: "grid", gridTemplateColumns: gridTemplateColumns(signatures.length), gap: 20, marginTop: 24 }}
          >
            {signatures.map((sig, i) => (
              <div key={i} className="print-sign-slot" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <p style={{ margin: "0 0 20px", fontSize: 12, fontWeight: 800, color: PRINT_SURFACE.text, letterSpacing: "normal" }}>
                  {sig.title}
                </p>
                <div style={{ width: "100%", height: 1, background: PRINT_SURFACE.border }} />
                <p style={{ margin: "4px 0 0", fontSize: 10, color: PRINT_SURFACE.muted, letterSpacing: "normal" }}>
                  الاسم / التوقيع
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${PRINT_SURFACE.border}` }}>
          <p style={{ margin: 0, fontSize: 10, color: PRINT_SURFACE.muted, minWidth: 0, letterSpacing: "normal" }}>
            {footerTagline} — {printDate}
          </p>
          {version ? (
            <p
              style={{ margin: 0, fontSize: 9, fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: "#94a3b8", letterSpacing: "normal" }}
              title="إصدار النظام"
            >
              v{version}
            </p>
          ) : null}
        </div>
      </div>
    )
  },
)

PrintReportLayout.displayName = "PrintReportLayout"

export type { ReportKPI, ReportSection }
