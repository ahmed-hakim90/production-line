import { forwardRef, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
  resolveImageExportPalette,
} from "@/utils/imageExportTheme"
import { resolvePrintAccentHex } from "@/utils/printTheme"
import { PrintExtraLines } from "./PrintExtraLines"

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
    },
    ref,
  ) => {
    const palette = resolveImageExportPalette(resolvePrintAccentHex(brandAccent))
    const accent = palette.primary
    const cardWidth = nestedInShareWrapper ? ("100%" as const) : (640 as const)
    const headerBorderStyle: CSSProperties = { borderBottomColor: accent }
    const customLines = extraLines ?? []
    const metaCells: ReportMetaCard[] =
      metaCards && metaCards.length > 0
        ? metaCards
        : [
            { label: "رقم التقرير", value: meta.reportNumber },
            { label: "تاريخ التقرير", value: meta.reportDate },
            { label: "خط الإنتاج", value: meta.lineName },
            { label: "إشراف", value: meta.supervisorName },
          ]

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
          "print-root print-report bg-[var(--color-card)] mx-auto p-9 print:p-0 print:w-full print:max-w-none print:min-w-0 print:mx-0 [font-feature-settings:normal] arabic-export-root",
          !nestedInShareWrapper && "w-[640px]",
        )}
        style={{
          fontFamily,
          fontSize,
          letterSpacing: "normal",
          wordSpacing: "normal",
          width: nestedInShareWrapper ? "100%" : cardWidth,
          minWidth: nestedInShareWrapper ? undefined : 640,
          maxWidth: nestedInShareWrapper ? "100%" : cardWidth,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <div className="flex items-start justify-between pb-3 mb-4 border-b-2" style={headerBorderStyle}>
          <div className="flex items-start gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-10 w-auto object-contain shrink-0" />
            ) : null}
            <div className="min-w-0">
              <h1 className="text-[18px] font-bold text-[var(--color-text)]" style={{ letterSpacing: "normal" }}>
                {companyName}
              </h1>
              <p className="text-[10px] font-semibold mt-0.5" style={{ color: accent, letterSpacing: "normal" }}>
                ForgeOps
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span
              className="inline-flex items-center justify-center rounded-md font-bold"
              style={{
                fontSize: "14px",
                lineHeight: 1.3,
                padding: "5px 10px",
                background: palette.badgeBg,
                color: palette.badgeText,
                letterSpacing: "normal",
                maxWidth: "220px",
                textAlign: "center",
              }}
            >
              {reportType}
            </span>
            <span className="text-[12px] text-[var(--color-text-muted)]" style={{ letterSpacing: "normal" }}>
              {printDate}
            </span>
          </div>
        </div>

        <PrintExtraLines lines={customLines} />

        <div
          className={cn("grid mb-4 border border-[var(--color-border)] rounded-lg overflow-hidden", gridColsClass(metaCells.length))}
          style={{ display: "grid", gridTemplateColumns: gridTemplateColumns(metaCells.length) }}
        >
          {metaCells.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className={cn("px-3 py-2 bg-[var(--color-bg)]", i < metaCells.length - 1 && "border-l border-[var(--color-border)]")}
            >
              <p className="text-[9px] text-[var(--color-text-muted)] mb-1" style={{ letterSpacing: "normal" }}>
                {item.label}
              </p>
              <p className="text-[11px] font-semibold text-[var(--color-text)] leading-tight" style={{ wordBreak: "break-word" }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div
          className={cn("grid gap-2 mb-4", gridColsClass(kpis.length))}
          style={{ display: "grid", gridTemplateColumns: gridTemplateColumns(kpis.length), gap: "0.5rem" }}
        >
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className="flex min-h-[5.25rem] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
              style={{ display: "flex", flexDirection: "row", minHeight: "5.25rem" }}
            >
              {/* في RTL الشريط أول العناصر فيُرسَم يمين البطاقة (بداية القراءة) */}
              <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: kpiStripColor(kpi) }} />
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-3">
                <div
                  className="flex flex-wrap items-baseline justify-center gap-x-1 gap-y-0"
                  dir="rtl"
                  style={{ letterSpacing: "normal" }}
                >
                  <span
                    className="font-bold tabular-nums"
                    style={{
                      fontSize: "22px",
                      lineHeight: 1.15,
                      color: kpiValueColor(kpi),
                      letterSpacing: "normal",
                    }}
                  >
                    {typeof kpi.value === "number" ? kpi.value.toLocaleString("ar-EG") : kpi.value}
                  </span>
                  {kpi.unit ? (
                    <span
                      className="font-semibold"
                      style={{
                        fontSize: "13px",
                        color: "#475569",
                        letterSpacing: "normal",
                      }}
                    >
                      {kpi.unit}
                    </span>
                  ) : null}
                </div>
                <p
                  className="mt-2 text-center font-semibold leading-snug text-[var(--color-text-muted)]"
                  style={{ fontSize: "11px", letterSpacing: "normal", maxWidth: "100%" }}
                >
                  {kpi.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {sections.map((section, si) => (
          <div key={si}>
            <div className="flex items-center gap-2 mb-2 mt-3">
              <div
                className="w-[3px] h-[12px] rounded-full flex-shrink-0"
                style={{ backgroundColor: accent }}
              />
              <p className="text-[9px] font-bold text-[var(--color-text-muted)]" style={{ letterSpacing: "normal" }}>
                {section.title}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-card)]">
              {section.rows.map((row, ri) => (
                row.fullWidth ? (
                  <div
                    key={ri}
                    className={cn("px-3 py-2.5", ri < section.rows.length - 1 && "border-b border-[var(--color-border)]")}
                  >
                    {row.label ? (
                      <p className="mb-1.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                        {row.label}
                      </p>
                    ) : null}
                    <div className="min-w-0">{row.value}</div>
                  </div>
                ) : (
                  <div
                    key={ri}
                    className={cn(
                      "grid grid-cols-[38%_1fr] gap-3 px-3 py-2.5 items-start",
                      ri < section.rows.length - 1 && "border-b border-[var(--color-border)]",
                    )}
                  >
                    <p className="text-[11px] font-semibold text-[var(--color-text-muted)] pt-0.5">{row.label}</p>
                    <div
                      className={cn(
                        "text-[13px] text-right min-w-0",
                        row.highlight ? "font-bold" : "font-semibold text-[var(--color-text)]",
                      )}
                      style={row.highlight ? { color: accent } : undefined}
                    >
                      {row.value}
                    </div>
                  </div>
                )
              ))}

              {section.progress && (
                <div className="grid grid-cols-[38%_1fr] gap-3 px-3 py-2.5 border-t border-[var(--color-border)] items-center">
                  <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">{section.progress.label}</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: palette.progressTrack }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, section.progress.value))}%`,
                          backgroundColor: accent,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-bold tabular-nums min-w-[32px] text-right"
                      style={{ color: accent }}
                    >
                      {Math.max(0, Math.min(100, section.progress.value))}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {si < sections.length - 1 && <div className="h-px bg-[var(--color-surface-hover)] mt-3" />}
          </div>
        ))}

        {signatures && signatures.length > 0 && (
          <div className={cn("grid gap-5 mt-6", gridColsClass(signatures.length))}>
            {signatures.map((sig, i) => (
              <div key={i} className="flex flex-col items-center">
                <p className="text-xs font-bold text-[var(--color-text)] mb-5" style={{ letterSpacing: "normal" }}>
                  {sig.title}
                </p>
                <div className="w-full h-px bg-[var(--color-border)]" />
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1" style={{ letterSpacing: "normal" }}>
                  الاسم / التوقيع
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-border)]">
          <p className="text-[10px] text-[var(--color-text-muted)]" style={{ letterSpacing: "normal" }}>
            {footerTagline} — {printDate}
          </p>
          <p className="text-[10px] font-bold" style={{ color: accent, letterSpacing: "normal" }}>
            Factory {version}
          </p>
        </div>
      </div>
    )
  },
)

PrintReportLayout.displayName = "PrintReportLayout"

export type { ReportKPI, ReportSection }
