import { forwardRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

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

interface PrintReportLayoutProps {
  companyName: string
  reportType: string
  printDate: string
  logoUrl?: string
  accentColor?: string
  footerText?: string
  paperSize?: "a4" | "a5" | "thermal"
  orientation?: "portrait" | "landscape"
  meta: {
    reportNumber: string
    reportDate: string
    lineName: string
    supervisorName: string
  }
  kpis: ReportKPI[]
  sections: ReportSection[]
  signatures?: { title: string }[]
  version?: string
}

const colorMap: Record<NonNullable<ReportKPI["color"]>, string> = {
  indigo: "text-indigo-600",
  green: "text-emerald-600",
  red: "text-red-600",
  default: "text-slate-900",
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
      logoUrl,
      accentColor = "#4f46e5",
      footerText = "هذا التقرير تم إنشاؤه آلياً من نظام إدارة الإنتاج",
      paperSize = "a4",
      orientation = "portrait",
      meta,
      kpis,
      sections,
      signatures,
      version = "v4.0.57",
    },
    ref,
  ) => {
    const sizeMap = {
      a4: { w: 210, h: 297 },
      a5: { w: 148, h: 210 },
      thermal: { w: 80, h: 210 },
    }
    const base = sizeMap[paperSize]
    const widthMm = orientation === "landscape" ? base.h : base.w
    const minHeightMm = orientation === "landscape" ? base.w : base.h

    return (
      <div
        ref={ref}
        dir="rtl"
        className="print-root print-report bg-white mx-auto p-9 print:p-0 print:w-full min-h-[860px] flex flex-col"
        style={{
          fontFamily: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
          fontSize: "13px",
          width: `${widthMm}mm`,
          minHeight: `${minHeightMm}mm`,
        }}
      >
        <div>
          <div className="flex items-start justify-between pb-3 mb-4 border-b-2" style={{ borderColor: accentColor }}>
          <div>
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-9 object-contain mb-1" />
            ) : null}
            <h1 className="text-[18px] font-bold text-slate-900">{companyName}</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">HAKIM PRODUCTION SYSTEM</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className="text-[13px] font-semibold px-3 py-1 rounded-md"
              style={{ backgroundColor: `${accentColor}14`, color: accentColor }}
            >
              {reportType}
            </span>
            <span className="text-[11px] text-slate-400">{printDate}</span>
          </div>
          </div>

          <div className="grid grid-cols-4 mb-4 border border-slate-200 rounded-lg overflow-hidden">
            {[
              { label: "رقم التقرير", value: meta.reportNumber },
              { label: "تاريخ التقرير", value: meta.reportDate },
              { label: "خط الإنتاج", value: meta.lineName },
              { label: "المشرف", value: meta.supervisorName },
            ].map((item, i) => (
              <div key={i} className={cn("px-3 py-2 bg-slate-50", i < 3 && "border-l border-slate-200")}>
                <p className="text-[9px] text-slate-400 mb-1">{item.label}</p>
                <p className="text-[11px] font-semibold text-slate-800 leading-tight">{item.value}</p>
              </div>
            ))}
          </div>

          <div className={cn("grid gap-2 mb-4", gridColsClass(kpis.length))}>
            {kpis.map((kpi, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2.5 text-center">
                <p className={cn("text-[20px] font-bold tabular-nums", colorMap[kpi.color ?? "default"])}>
                  {typeof kpi.value === "number" ? kpi.value.toLocaleString("ar-EG") : kpi.value}
                  {kpi.unit && <span className="text-xs font-normal text-slate-400 mr-1">{kpi.unit}</span>}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>

          {sections.map((section, si) => (
            <div key={si}>
              <div className="flex items-center gap-2 mb-2 mt-3">
                <div className="w-[3px] h-[12px] bg-indigo-500 rounded-full flex-shrink-0" />
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{section.title}</p>
              </div>

              <table className="w-full border-collapse">
                <tbody>
                  {section.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-slate-100 last:border-0">
                      <td className="!py-1.5 !px-2.5 !text-xs text-slate-500 w-[40%]">{row.label}</td>
                      <td
                        className={cn(
                          "!py-1.5 !px-2.5 !text-sm text-left",
                          row.highlight ? "font-bold text-indigo-600 text-[13px]" : "font-medium text-slate-800",
                        )}
                      >
                        {row.value}
                      </td>
                    </tr>
                  ))}

                  {section.progress && (
                    <tr>
                      <td className="!py-1.5 !px-2.5 !text-xs text-slate-500">{section.progress.label}</td>
                      <td className="!py-1.5 !px-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-indigo-50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ backgroundColor: accentColor, width: `${Math.max(0, Math.min(100, section.progress.value))}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold tabular-nums min-w-[32px] text-left" style={{ color: accentColor }}>
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
        </div>

        <div className="mt-auto pt-6">
          {signatures && signatures.length > 0 && (
            <div className={cn("grid gap-5 mt-6", gridColsClass(signatures.length))}>
              {signatures.map((sig, i) => (
                <div key={i} className="flex flex-col items-center">
                  <p className="text-xs font-bold text-slate-700 mb-5">{sig.title}</p>
                  <div className="w-full h-px bg-slate-300" />
                  <p className="text-[10px] text-slate-400 mt-1">الاسم / التوقيع</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
            <p className="text-[10px] text-slate-400">{footerText} — {printDate}</p>
            <p className="text-[10px] font-bold" style={{ color: accentColor }}>HAKIM {version}</p>
          </div>
        </div>
      </div>
    )
  },
)

PrintReportLayout.displayName = "PrintReportLayout"

export type { PrintReportLayoutProps, ReportKPI, ReportSection }
