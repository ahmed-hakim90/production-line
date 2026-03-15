import { ReactNode } from "react"

interface PrintLayoutProps {
  companyName: string
  reportTitle: string
  reportDate?: string
  children: ReactNode
}

export function PrintLayout({ companyName, reportTitle, reportDate, children }: PrintLayoutProps) {
  const dateText = reportDate ?? new Date().toLocaleDateString("ar-EG")

  return (
    <section className="print-layout rounded-xl border border-slate-200 bg-white p-4">
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 12mm;
            }

            body {
              background: #fff !important;
              color: #000 !important;
            }

            aside,
            .topbar,
            [data-topbar],
            [data-sidebar],
            .no-print,
            .erp-page-actions,
            [data-print-hide="true"] {
              display: none !important;
            }

            .print-layout {
              border: 0 !important;
              border-radius: 0 !important;
              padding: 0 !important;
              margin: 0 !important;
              color: #000 !important;
              background: #fff !important;
            }

            .print-meta {
              display: flex !important;
            }

            .print-page-number::after {
              content: counter(page);
            }
          }
        `}
      </style>

      <header className="mb-4 border-b border-black pb-3">
        <h2 className="text-base font-medium text-black">{companyName}</h2>
        <p className="text-sm font-normal text-black">{reportTitle}</p>
        <div className="print-meta mt-2 hidden items-center justify-between text-xs font-normal text-black">
          <span>التاريخ: {dateText}</span>
          <span>
            الصفحة: <span className="print-page-number" />
          </span>
        </div>
      </header>

      <div className="text-black">{children}</div>
    </section>
  )
}
