import { forwardRef, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  HAKIM_DEFAULT_FOOTER_TAGLINE,
  HAKIM_IMAGE_PRIMARY,
  HAKIM_IMAGE_PRIMARY_BADGE_BG,
  HAKIM_IMAGE_PRIMARY_BADGE_TEXT,
  HAKIM_IMAGE_PROGRESS_TRACK,
} from "@/utils/imageExportTheme"

export interface ReportMetaCard {
  label: string
  value: string
}

interface ReportKPI {
  label: string
  value: string | number
  unit?: string
  color?: "indigo" | "green" | "red" | "default"
}

interface ReportSection {
  title: string
  rows: {
    label: string
    value: string | ReactNode
    highlight?: boolean
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
      brandAccent = HAKIM_IMAGE_PRIMARY,
      footerTagline = HAKIM_DEFAULT_FOOTER_TAGLINE,
    },
    ref,
  ) => {
    const accent = brandAccent
    const headerBorderStyle: CSSProperties = { borderBottomColor: accent }
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
        className="print-root print-report bg-white w-[640px] mx-auto p-9 print:p-0 print:w-full [font-feature-settings:normal] arabic-export-root"
        style={{
          fontFamily: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
          fontSize: "13px",
          letterSpacing: "normal",
          wordSpacing: "normal",
        }}
      >
        <div className="flex items-start justify-between pb-3 mb-4 border-b-2" style={headerBorderStyle}>
          <div className="flex items-start gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-10 w-auto object-contain shrink-0" />
            ) : null}
            <div className="min-w-0">
              <h1 className="text-[18px] font-bold text-slate-900" style={{ letterSpacing: "normal" }}>
                {companyName}
              </h1>
              <p className="text-[10px] font-semibold mt-0.5" style={{ color: accent, letterSpacing: "normal" }}>
                HAKIM PRODUCTION SYSTEM
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
                background: HAKIM_IMAGE_PRIMARY_BADGE_BG,
                color: HAKIM_IMAGE_PRIMARY_BADGE_TEXT,
                letterSpacing: "normal",
                maxWidth: "220px",
                textAlign: "center",
              }}
            >
              {reportType}
            </span>
            <span className="text-[12px] text-slate-500" style={{ letterSpacing: "normal" }}>
              {printDate}
            </span>
          </div>
        </div>

        <div
          className={cn("grid mb-4 border border-slate-200 rounded-lg overflow-hidden", gridColsClass(metaCells.length))}
        >
          {metaCells.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className={cn("px-3 py-2 bg-slate-50", i < metaCells.length - 1 && "border-l border-slate-200")}
            >
              <p className="text-[9px] text-slate-400 mb-1" style={{ letterSpacing: "normal" }}>
                {item.label}
              </p>
              <p className="text-[11px] font-semibold text-slate-800 leading-tight" style={{ wordBreak: "break-word" }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className={cn("grid gap-2 mb-4", gridColsClass(kpis.length))}>
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className="flex min-h-[5.25rem] overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
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
                  className="mt-2 text-center font-semibold leading-snug text-slate-500"
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
              <p className="text-[9px] font-bold text-slate-400" style={{ letterSpacing: "normal" }}>
                {section.title}
              </p>
            </div>

            <table className="erp-table w-full border-collapse">
              <tbody>
                {section.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100 last:border-0">
                    <td
                      className="!py-1.5 !px-2.5 !text-xs text-slate-500 w-[40%]"
                      style={{ letterSpacing: "normal" }}
                    >
                      {row.label}
                    </td>
                    <td
                      className={cn(
                        "!py-1.5 !px-2.5 !text-sm text-right",
                        row.highlight ? "font-bold text-[13px]" : "font-medium text-slate-800",
                      )}
                      style={{
                        letterSpacing: "normal",
                        ...(row.highlight ? { color: accent } : {}),
                      }}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}

                {section.progress && (
                  <tr>
                    <td
                      className="!py-1.5 !px-2.5 !text-xs text-slate-500"
                      style={{ letterSpacing: "normal" }}
                    >
                      {section.progress.label}
                    </td>
                    <td className="!py-1.5 !px-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: HAKIM_IMAGE_PROGRESS_TRACK }}
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
                          style={{ color: accent, letterSpacing: "normal" }}
                        >
                          {Math.max(0, Math.min(100, section.progress.value))}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {si < sections.length - 1 && <div className="h-px bg-slate-100 mt-3" />}
          </div>
        ))}

        {signatures && signatures.length > 0 && (
          <div className={cn("grid gap-5 mt-6", gridColsClass(signatures.length))}>
            {signatures.map((sig, i) => (
              <div key={i} className="flex flex-col items-center">
                <p className="text-xs font-bold text-slate-700 mb-5" style={{ letterSpacing: "normal" }}>
                  {sig.title}
                </p>
                <div className="w-full h-px bg-slate-300" />
                <p className="text-[10px] text-slate-400 mt-1" style={{ letterSpacing: "normal" }}>
                  الاسم / التوقيع
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
          <p className="text-[10px] text-slate-400" style={{ letterSpacing: "normal" }}>
            {footerTagline} — {printDate}
          </p>
          <p className="text-[10px] font-bold" style={{ color: accent, letterSpacing: "normal" }}>
            HAKIM {version}
          </p>
        </div>
      </div>
    )
  },
)

PrintReportLayout.displayName = "PrintReportLayout"

export type { ReportKPI, ReportSection }
