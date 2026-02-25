import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';

export interface QualitySummaryPrintData {
  inspectedUnits: number;
  passedUnits: number;
  failedUnits: number;
  reworkUnits: number;
  defectRate: number;
  firstPassYield: number;
}

export interface QualityTopDefectItem {
  reasonLabel: string;
  quantity: number;
}

export interface QualityReportPrintProps {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  workOrderNumber?: string;
  summary: QualitySummaryPrintData;
  topDefects: QualityTopDefectItem[];
  printSettings?: PrintTemplateSettings;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const fmtNum = (value: number, decimalPlaces: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

export const QualityReportPrint = React.forwardRef<HTMLDivElement, QualityReportPrintProps>(
  ({ title, subtitle, generatedAt, workOrderNumber, summary, topDefects, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const dp = ps.decimalPlaces;
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: 'Calibri, Segoe UI, Tahoma, sans-serif',
          width: paper.width,
          minHeight: paper.minHeight,
          padding: ps.paperSize === 'thermal' ? '4mm 3mm' : '12mm 15mm',
          background: '#fff',
          color: '#1e293b',
          fontSize: ps.paperSize === 'thermal' ? '8pt' : '11pt',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: ps.paperSize === 'thermal' ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: ps.paperSize === 'thermal' ? '2mm' : '6mm' }}>
          {ps.logoUrl && (
            <img
              src={ps.logoUrl}
              alt="logo"
              style={{ maxHeight: ps.paperSize === 'thermal' ? '12mm' : '20mm', marginBottom: '2mm', objectFit: 'contain' }}
            />
          )}
          <h1 style={{ margin: 0, fontSize: ps.paperSize === 'thermal' ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>
            {ps.headerText}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: ps.paperSize === 'thermal' ? '7pt' : '10pt', color: '#64748b', fontWeight: 600 }}>
            نظام إدارة الجودة - تقارير الجودة
          </p>
        </div>

        <div style={{ marginBottom: ps.paperSize === 'thermal' ? '3mm' : '6mm' }}>
          <h2 style={{ margin: 0, fontSize: ps.paperSize === 'thermal' ? '10pt' : '16pt', fontWeight: 800, color: '#0f172a' }}>{title}</h2>
          {subtitle && <p style={{ margin: '1mm 0 0', fontSize: ps.paperSize === 'thermal' ? '7pt' : '10pt', color: '#64748b' }}>{subtitle}</p>}
          <p style={{ margin: '2mm 0 0', fontSize: ps.paperSize === 'thermal' ? '6pt' : '9pt', color: '#94a3b8' }}>
            تاريخ الطباعة: {now}
          </p>
        </div>

        <div style={{ display: 'flex', gap: ps.paperSize === 'thermal' ? '2mm' : '4mm', marginBottom: ps.paperSize === 'thermal' ? '3mm' : '6mm', flexWrap: 'wrap' }}>
          <SummaryBox label="تم الفحص" value={fmtNum(summary.inspectedUnits, 0)} color={ps.primaryColor} small={ps.paperSize === 'thermal'} />
          <SummaryBox label="ناجح" value={fmtNum(summary.passedUnits, 0)} color="#059669" small={ps.paperSize === 'thermal'} />
          <SummaryBox label="فاشل" value={fmtNum(summary.failedUnits, 0)} color="#f43f5e" small={ps.paperSize === 'thermal'} />
          <SummaryBox label="إعادة تشغيل" value={fmtNum(summary.reworkUnits, 0)} color="#f59e0b" small={ps.paperSize === 'thermal'} />
          <SummaryBox label="معدل العيوب" value={`${fmtNum(summary.defectRate, dp)}%`} color="#8b5cf6" small={ps.paperSize === 'thermal'} />
          <SummaryBox label="FPY" value={`${fmtNum(summary.firstPassYield, dp)}%`} color="#06b6d4" small={ps.paperSize === 'thermal'} />
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: ps.paperSize === 'thermal' ? '7pt' : '9.5pt',
            marginBottom: ps.paperSize === 'thermal' ? '3mm' : '8mm',
          }}
        >
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <Th>#</Th>
              <Th>سبب العيب</Th>
              <Th align="center">الكمية</Th>
            </tr>
          </thead>
          <tbody>
            {topDefects.length === 0 ? (
              <tr>
                <Td colSpan={3}>لا توجد عيوب مسجلة</Td>
              </tr>
            ) : (
              topDefects.map((item, idx) => (
                <tr key={`${item.reasonLabel}_${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <Td>{idx + 1}</Td>
                  <Td>{item.reasonLabel}</Td>
                  <Td align="center" bold color={ps.primaryColor}>{fmtNum(item.quantity, 0)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {ps.paperSize !== 'thermal' && (
          <div style={{ marginTop: '15mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="مدير الجودة" />
            <SignatureBlock label="مشرف الجودة" />
            <SignatureBlock label="مدير الإنتاج" />
          </div>
        )}

        <div style={{ marginTop: ps.paperSize === 'thermal' ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={`quality-kpi|${workOrderNumber || 'snapshot'}|inspected:${summary.inspectedUnits}|failed:${summary.failedUnits}`}
                size={ps.paperSize === 'thermal' ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: '#94a3b8' }}>رمز QR للتحقق من صحة تقرير الجودة</p>
            </div>
          )}
          <p style={{ margin: 0, fontSize: ps.paperSize === 'thermal' ? '6pt' : '8pt', color: '#94a3b8' }}>
            {ps.footerText} - {now}
          </p>
        </div>
      </div>
    );
  },
);

QualityReportPrint.displayName = 'QualityReportPrint';

const SummaryBox: React.FC<{ label: string; value: string; color: string; small?: boolean }> = ({ label, value, color, small }) => (
  <div style={{ flex: '1 1 0', minWidth: small ? '18mm' : '30mm', border: '1px solid #e2e8f0', borderRadius: '3mm', padding: small ? '1.5mm 2mm' : '3mm 4mm', textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: small ? '6pt' : '8pt', color: '#64748b', fontWeight: 600 }}>{label}</p>
    <p style={{ margin: '1mm 0 0', fontSize: small ? '10pt' : '14pt', fontWeight: 900, color }}>{value}</p>
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

