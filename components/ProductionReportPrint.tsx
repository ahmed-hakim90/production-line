/**
 * ProductionReportPrint — A4-styled printable production report.
 * Used by react-to-print for direct printing, html2canvas for PDF/image export.
 * Accepts data via props so it contains ZERO business logic.
 */
import React from 'react';
import type { ProductionReport } from '../types';

export interface ReportPrintRow {
  date: string;
  lineName: string;
  productName: string;
  supervisorName: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workHours: number;
}

export interface ReportPrintProps {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  rows: ReportPrintRow[];
  totals?: {
    totalProduced: number;
    totalWaste: number;
    totalHours: number;
    totalWorkers: number;
    wasteRatio: string;
    reportsCount: number;
  };
}

/**
 * Convert raw ProductionReport[] to ReportPrintRow[] using lookup fns.
 * Call this from the parent page — keeps logic out of the print component.
 */
export const mapReportsToPrintRows = (
  reports: ProductionReport[],
  lookups: {
    getLineName: (id: string) => string;
    getProductName: (id: string) => string;
    getSupervisorName: (id: string) => string;
  }
): ReportPrintRow[] =>
  reports.map((r) => ({
    date: r.date,
    lineName: lookups.getLineName(r.lineId),
    productName: lookups.getProductName(r.productId),
    supervisorName: lookups.getSupervisorName(r.supervisorId),
    quantityProduced: r.quantityProduced || 0,
    quantityWaste: r.quantityWaste || 0,
    workersCount: r.workersCount || 0,
    workHours: r.workHours || 0,
  }));

/**
 * Compute totals from rows.
 */
export const computePrintTotals = (rows: ReportPrintRow[]) => {
  const totalProduced = rows.reduce((s, r) => s + r.quantityProduced, 0);
  const totalWaste = rows.reduce((s, r) => s + r.quantityWaste, 0);
  const totalHours = rows.reduce((s, r) => s + r.workHours, 0);
  const totalWorkers = rows.reduce((s, r) => s + r.workersCount, 0);
  const total = totalProduced + totalWaste;
  const wasteRatio = total > 0 ? ((totalWaste / total) * 100).toFixed(1) : '0';
  return { totalProduced, totalWaste, totalHours, totalWorkers, wasteRatio, reportsCount: rows.length };
};

/* ═══════════════════════════════════════════════════════════════════════════ */

export const ProductionReportPrint = React.forwardRef<HTMLDivElement, ReportPrintProps>(
  ({ title, subtitle, generatedAt, rows, totals }, ref) => {
    const t = totals ?? computePrintTotals(rows);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: 'Calibri, Segoe UI, Tahoma, sans-serif',
          width: '210mm',
          minHeight: '297mm',
          padding: '12mm 15mm',
          background: '#fff',
          color: '#1e293b',
          fontSize: '11pt',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        {/* ── Factory Header ── */}
        <div style={{ textAlign: 'center', marginBottom: '8mm', borderBottom: '3px solid #1392ec', paddingBottom: '6mm' }}>
          <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: 900, color: '#1392ec' }}>
            مؤسسة المغربي
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: '10pt', color: '#64748b', fontWeight: 600 }}>
            نظام إدارة الإنتاج — تقارير الإنتاج
          </p>
        </div>

        {/* ── Report Title ── */}
        <div style={{ marginBottom: '6mm' }}>
          <h2 style={{ margin: 0, fontSize: '16pt', fontWeight: 800, color: '#0f172a' }}>{title}</h2>
          {subtitle && <p style={{ margin: '1mm 0 0', fontSize: '10pt', color: '#64748b' }}>{subtitle}</p>}
          <p style={{ margin: '2mm 0 0', fontSize: '9pt', color: '#94a3b8' }}>تاريخ الطباعة: {now}</p>
        </div>

        {/* ── Summary Cards ── */}
        <div style={{ display: 'flex', gap: '4mm', marginBottom: '6mm', flexWrap: 'wrap' }}>
          <SummaryBox label="إجمالي الإنتاج" value={t.totalProduced.toLocaleString('ar-EG')} unit="وحدة" color="#1392ec" />
          <SummaryBox label="إجمالي الهالك" value={t.totalWaste.toLocaleString('ar-EG')} unit="وحدة" color="#f43f5e" />
          <SummaryBox label="نسبة الهالك" value={`${t.wasteRatio}%`} color="#f59e0b" />
          <SummaryBox label="إجمالي الساعات" value={t.totalHours.toLocaleString('ar-EG')} unit="ساعة" color="#8b5cf6" />
          <SummaryBox label="عدد التقارير" value={String(t.reportsCount)} color="#64748b" />
        </div>

        {/* ── Data Table ── */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9.5pt',
            marginBottom: '8mm',
          }}
        >
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <Th>#</Th>
              <Th>التاريخ</Th>
              <Th>خط الإنتاج</Th>
              <Th>المنتج</Th>
              <Th>المشرف</Th>
              <Th align="center">الكمية المنتجة</Th>
              <Th align="center">الهالك</Th>
              <Th align="center">عدد العمال</Th>
              <Th align="center">ساعات العمل</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <Td>{i + 1}</Td>
                <Td>{row.date}</Td>
                <Td>{row.lineName}</Td>
                <Td>{row.productName}</Td>
                <Td>{row.supervisorName}</Td>
                <Td align="center" bold color="#059669">{row.quantityProduced.toLocaleString('ar-EG')}</Td>
                <Td align="center" bold >{row.quantityWaste.toLocaleString('ar-EG')}</Td>
                <Td align="center">{row.workersCount}</Td>
                <Td align="center">{row.workHours}</Td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr style={{ background: '#e2e8f0', fontWeight: 800 }}>
              <Td colSpan={5}>الإجمالي</Td>
              <Td align="center" bold color="#059669">{t.totalProduced.toLocaleString('ar-EG')}</Td>
              <Td align="center" bold color="#f43f5e">{t.totalWaste.toLocaleString('ar-EG')}</Td>
              <Td align="center">{t.totalWorkers.toLocaleString('ar-EG')}</Td>
              <Td align="center">{t.totalHours.toLocaleString('ar-EG')}</Td>
            </tr>
          </tbody>
        </table>

        {/* ── Signature Section ── */}
        <div style={{ marginTop: '15mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
          <SignatureBlock label="مدير الإنتاج" />
          <SignatureBlock label="مشرف الخط" />
          <SignatureBlock label="مراقب الجودة" />
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '8pt', color: '#94a3b8' }}>
            هذا التقرير تم إنشاؤه آلياً من نظام HAKIMO — {now}
          </p>
        </div>
      </div>
    );
  }
);

ProductionReportPrint.displayName = 'ProductionReportPrint';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SingleReportPrint — Printable layout for ONE production report            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface SingleReportPrintProps {
  report: ReportPrintRow | null;
}

export const SingleReportPrint = React.forwardRef<HTMLDivElement, SingleReportPrintProps>(
  ({ report }, ref) => {
    if (!report) return <div ref={ref} />;

    const now = new Date().toLocaleString('ar-EG');
    const total = report.quantityProduced + report.quantityWaste;
    const wasteRatio = total > 0 ? ((report.quantityWaste / total) * 100).toFixed(1) : '0';

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: 'Calibri, Segoe UI, Tahoma, sans-serif',
          width: '210mm',
          minHeight: '148mm',
          padding: '12mm 15mm',
          background: '#fff',
          color: '#1e293b',
          fontSize: '11pt',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '8mm', borderBottom: '3px solid #1392ec', paddingBottom: '6mm' }}>
          <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: 900, color: '#1392ec' }}>
           مؤسسة المغربي للإستيراد
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: '10pt', color: '#64748b', fontWeight: 600 }}>
           تقرير انتاج
          </p>
        </div>

        {/* Report Title */}
        <div style={{ marginBottom: '8mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '15pt', fontWeight: 800, color: '#0f172a' }}>تقرير إنتاج</h2>
            <p style={{ margin: '1mm 0 0', fontSize: '10pt', color: '#64748b' }}>
              {report.lineName} — {report.date}
            </p>
          </div>
          <div style={{ textAlign: 'left', fontSize: '9pt', color: '#94a3b8' }}>
            تاريخ الطباعة: {now}
          </div>
        </div>

        {/* Report Details */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '10.5pt',
            marginBottom: '8mm',
          }}
        >
          <tbody>
            <DetailRow label="التاريخ" value={report.date} />
            <DetailRow label="خط الإنتاج" value={report.lineName} even />
            <DetailRow label="المنتج" value={report.productName} />
            <DetailRow label="المشرف" value={report.supervisorName} even />
            <DetailRow label="الكمية المنتجة" value={`${report.quantityProduced.toLocaleString('ar-EG')} وحدة`} highlight="#059669" />
            <DetailRow label="الهالك" value={`${report.quantityWaste.toLocaleString('ar-EG')} وحدة`} highlight="#f43f5e" even />
            <DetailRow label="نسبة الهالك" value={`${wasteRatio}%`}  />
            <DetailRow label="عدد العمال" value={String(report.workersCount)} even />
            <DetailRow label="ساعات العمل" value={String(report.workHours)} />
          </tbody>
        </table>

        {/* Signature Section */}
        <div style={{ marginTop: '20mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
          <SignatureBlock label="مدير الإنتاج" />
          <SignatureBlock label="مشرف الخط" />
          <SignatureBlock label="مراقب الجودة" />
        </div>

        {/* Footer */}
        <div style={{ marginTop: '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '8pt', color: '#94a3b8' }}>
            هذا التقرير تم إنشاؤه آلياً من نظام المغربي للتصنيع — {now}
          </p>
        </div>
      </div>
    );
  }
);

SingleReportPrint.displayName = 'SingleReportPrint';

/* ─── Helper sub-components (inline styled for print isolation) ───────── */

const DetailRow: React.FC<{
  label: string;
  value: string;
  even?: boolean;
  highlight?: string;
}> = ({ label, value, even, highlight }) => (
  <tr style={{ background: even ? '#f8fafc' : '#fff' }}>
    <td
      style={{
        padding: '3mm 4mm',
        fontWeight: 700,
        color: '#475569',
        borderBottom: '1px solid #e2e8f0',
        width: '35%',
        fontSize: '10pt',
      }}
    >
      {label}
    </td>
    <td
      style={{
        padding: '3mm 4mm',
        fontWeight: highlight ? 800 : 400,
        color: highlight || '#0f172a',
        borderBottom: '1px solid #e2e8f0',
        fontSize: highlight ? '12pt' : '10.5pt',
      }}
    >
      {value}
    </td>
  </tr>
);

const SummaryBox: React.FC<{ label: string; value: string; unit?: string; color: string }> = ({ label, value, unit, color }) => (
  <div style={{ flex: '1 1 0', minWidth: '30mm', border: '1px solid #e2e8f0', borderRadius: '3mm', padding: '3mm 4mm', textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: '8pt', color: '#64748b', fontWeight: 600 }}>{label}</p>
    <p style={{ margin: '1mm 0 0', fontSize: '14pt', fontWeight: 900, color }}>
      {value}
      {unit && <span style={{ fontSize: '8pt', fontWeight: 600, marginRight: '1mm', color: '#94a3b8' }}>{unit}</span>}
    </p>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; align?: string }> = ({ children, align }) => (
  <th
    style={{
      padding: '2.5mm 3mm',
      textAlign: (align || 'right') as any,
      fontWeight: 800,
      fontSize: '8.5pt',
      color: '#475569',
      borderBottom: '2px solid #cbd5e1',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; align?: string; bold?: boolean; color?: string; colSpan?: number }> = ({
  children, align, bold, color, colSpan,
}) => (
  <td
    colSpan={colSpan}
    style={{
      padding: '2mm 3mm',
      textAlign: (align || 'right') as any,
      fontWeight: bold ? 700 : 400,
      color: color || '#334155',
      borderBottom: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </td>
);

const SignatureBlock: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: '9pt', fontWeight: 700, color: '#475569' }}>{label}</p>
    <div style={{ marginTop: '12mm', borderBottom: '1px solid #94a3b8', width: '80%', marginLeft: 'auto', marginRight: 'auto' }} />
    <p style={{ margin: '2mm 0 0', fontSize: '8pt', color: '#94a3b8' }}>التوقيع / التاريخ</p>
  </div>
);
