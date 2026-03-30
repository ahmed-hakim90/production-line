import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';

export interface SupervisorLinePerformancePrintRow {
  lineName: string;
  reportsCount: number;
  produced: number;
  waste: number;
  wasteRatio: number;
  avgWorkers: number;
  totalHours: number;
}

export interface SupervisorProductPerformancePrintRow {
  productName: string;
  reportsCount: number;
  requiredQty: number;
  achievedQty: number;
  performanceRatio: number;
}

export interface SupervisorPerformancePrintData {
  supervisorName: string;
  supervisorCode?: string;
  departmentName: string;
  jobTitle: string;
  statusLabel: string;
  periodLabel: string;
  performanceScore: number;
  totalProduced: number;
  totalWaste: number;
  wasteRatio: number;
  reportsCount: number;
  workDays: number;
  todayProduced: number;
  weekProduced: number;
  linesCount: number;
  avgWorkers: number;
  requiredQty: number;
  achievedQty: number;
  performanceRatio: number;
  costStatusLabel: string;
  costStatusHigh: boolean;
  lineUtilizationRatio: number;
  lineUtilizationHigh: boolean;
  appreciationTitle: string;
  appreciationBody: string;
  recommendations: string[];
  productRows: SupervisorProductPerformancePrintRow[];
  lineRows: SupervisorLinePerformancePrintRow[];
}

interface SupervisorPerformancePrintProps {
  data: SupervisorPerformancePrintData | null;
  printSettings?: PrintTemplateSettings;
  generatedAt?: string;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const PRINT_COLORS = {
  subtle: '#475569',
  infoBg: '#dbeafe',
  noteBg: '#f8fafc',
};

function fmtNum(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export const SupervisorPerformancePrint = React.forwardRef<HTMLDivElement, SupervisorPerformancePrintProps>(
  ({ data, printSettings, generatedAt }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const scoreTone =
      data.performanceScore >= 85
        ? { text: 'ممتاز', color: '#059669' }
        : data.performanceScore >= 70
          ? { text: 'جيد', color: '#d97706' }
          : { text: 'يحتاج تحسين', color: '#dc2626' };
    const costTone = data.costStatusHigh ? palette.danger : palette.success;
    const utilizationTone = data.lineUtilizationHigh ? palette.success : palette.warning;

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: paper.minHeight,
          padding: isThermal ? '3mm 2.5mm' : '6mm 10mm',
          background: '#fff',
          color: palette.text,
          ['--print-text' as any]: palette.text,
          ['--print-muted-text' as any]: palette.mutedText,
          ['--print-border' as any]: palette.border,
          ['--print-th-bg' as any]: palette.tableHeaderBg,
          ['--print-th-text' as any]: palette.tableHeaderText,
          ['--print-row-alt' as any]: palette.tableRowAltBg,
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '2mm' : '6mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '1.5mm' : '5mm' }}>
          {ps.logoUrl && (
            <img
              src={ps.logoUrl}
              alt="logo"
              style={{ maxHeight: isThermal ? '10mm' : '18mm', marginBottom: '2mm', objectFit: 'contain' }}
            />
          )}
          <h1 style={{ margin: 0, fontSize: isThermal ? '11pt' : '18pt', fontWeight: 900, color: ps.primaryColor }}>
            {ps.headerText}
          </h1>
          <h2 style={{ margin: 0, fontSize: isThermal ? '9.5pt' : '14pt', fontWeight: 900, color: palette.text }}>
            تقرير تقييم أداء مشرف
          </h2>
        </div>

        <div style={{ marginBottom: isThermal ? '2mm' : '4mm' }}>
          
         
        </div>

        <div style={{ marginBottom: isThermal ? '2mm' : '4mm', borderBottom: `2px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '1.5mm' : '3mm' }}>
          <h2 style={{ margin: 0, fontSize: isThermal ? '10pt' : '16pt', fontWeight: 900, color: palette.text }}>
            {data.supervisorName}
          </h2>
          <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: palette.mutedText, fontWeight: 600 }}>
            {data.departmentName} — {data.jobTitle} — {data.statusLabel}
            {data.supervisorCode ? ` — ${data.supervisorCode}` : ''}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isThermal ? '1fr' : '1.2fr 1.2fr 2.2fr', gap: isThermal ? '1.5mm' : '2mm', marginBottom: isThermal ? '2.5mm' : '4mm' }}>
          <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto', gap: '1.4mm' }}>
            <SummaryBox label="إجمالي الإنتاج" value={fmtNum(data.totalProduced)} sub="وحدة" color={palette.primary} large />
            <SummaryBox label="إنتاج الأسبوع" value={fmtNum(data.weekProduced)} color={palette.primary} />
            <SummaryBox label="إنتاج اليوم" value={fmtNum(data.todayProduced)} color={palette.success} />
          </div>
          <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto', gap: '1.4mm' }}>
            <SummaryBox label="درجة الأداء" value={String(data.performanceScore)} sub={scoreTone.text} color={scoreTone.color} large />
            <SummaryBox label="عدد أيام العمل" value={String(data.workDays)} sub={`${data.linesCount} خط`} color={palette.mutedText} />
            <SummaryBox label="متوسط العمالة" value={fmtNum(data.avgWorkers)} sub="عامل/تقرير" color={palette.warning} />
          </div>
          <div
            style={{
              border: `1.5px solid ${palette.primary}`,
              borderRadius: '3mm',
              padding: isThermal ? '1.8mm' : '2.4mm',
              background: '#f8fafc',
            }}
          >
            <p style={{ margin: 0, fontSize: '8pt', color: palette.mutedText, fontWeight: 800 }}>ملخص التنفيذ الأساسي</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2mm', marginTop: '1.2mm' }}>
              <MetricLine label="الكمية المطلوبة" value={`${fmtNum(data.requiredQty)} وحدة`} color={palette.text} />
              <MetricLine label="الكمية المحققة" value={`${fmtNum(data.achievedQty)} وحدة`} color={palette.success} />
              <MetricLine label="نسبة الأداء" value={`${fmtNum(data.performanceRatio)}%`} color={scoreTone.color} />
              <MetricLine label="التكاليف" value={data.costStatusLabel} color={costTone} />
              <MetricLine label="استغلال الخط" value={`${fmtNum(data.lineUtilizationRatio)}% ${data.lineUtilizationHigh ? '(عالي)' : '(منخفض)'}`} color={utilizationTone} />
              <MetricLine label="نسبة الهالك" value={`${fmtNum(data.wasteRatio)}%`} color={palette.danger} />
            </div>
          </div>
        </div>

        <div style={{ border: `1.5px solid ${palette.primary}`, background: PRINT_COLORS.infoBg, borderRadius: '3mm', padding: isThermal ? '2mm' : '4mm', marginBottom: isThermal ? '3mm' : '6mm' }}>
          <p style={{ margin: 0, fontWeight: 900, color: palette.primary, fontSize: isThermal ? '8pt' : '11pt' }}>
            {data.appreciationTitle}
          </p>
          <p style={{ margin: '1mm 0 0', color: palette.text, fontSize: isThermal ? '7pt' : '10pt', fontWeight: 600 }}>
            {data.appreciationBody}
          </p>
        </div>

        <div style={{ marginBottom: isThermal ? '3mm' : '6mm' }}>
          <p style={{ margin: 0, fontWeight: 900, color: palette.text }}>تفصيل المنتجات (المخطط مقابل المحقق)</p>
          {data.productRows.length === 0 ? (
            <div style={{ marginTop: '2mm', border: `1px dashed ${palette.border}`, borderRadius: '2.5mm', padding: '3mm', textAlign: 'center', color: palette.mutedText, fontWeight: 700 }}>
              لا توجد بيانات منتجات في الفترة المختارة
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isThermal ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: isThermal ? '1.5mm' : '2mm', marginTop: '2mm' }}>
              {data.productRows.map((row, idx) => {
                const performanceColor = row.performanceRatio >= 100 ? palette.success : row.performanceRatio >= 85 ? palette.warning : palette.danger;
                return (
                  <div
                    key={`${row.productName}_${idx}`}
                    style={{
                      border: `1.1px solid ${palette.border}`,
                      borderRadius: '2.5mm',
                      padding: isThermal ? '2mm' : '2.4mm',
                      background: idx % 2 === 0 ? '#fff' : palette.tableRowAltBg,
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 900, color: palette.text, fontSize: isThermal ? '8pt' : '10pt' }}>
                      {shortProductName(row.productName)}
                    </p>
                    <p style={{ margin: '0.5mm 0 0', fontSize: '7pt', color: palette.mutedText, fontWeight: 700 }}>
                      عدد التقارير: {row.reportsCount}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8mm', marginTop: '1.1mm' }}>
                      <MetricLine compact label="المطلوبة" value={fmtNum(row.requiredQty)} color={palette.text} />
                      <MetricLine compact label="المحقق" value={fmtNum(row.achievedQty)} color={palette.success} />
                      <MetricLine compact label="نسبة الأداء" value={`${fmtNum(row.performanceRatio)}%`} color={performanceColor} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginBottom: isThermal ? '3mm' : '6mm' }}>
          <p style={{ margin: 0, fontWeight: 900, color: palette.text }}>تقييم تفصيلي لكل خط</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2mm', fontSize: isThermal ? '7pt' : '9.5pt' }}>
            <thead>
              <tr style={{ background: palette.tableHeaderBg }}>
                <Th>الخط</Th>
                <Th align="center">تقارير</Th>
                <Th align="center">إنتاج</Th>
                <Th align="center">هالك</Th>
                <Th align="center">نسبة هالك</Th>
                <Th align="center">متوسط عمالة</Th>
                <Th align="center">ساعات</Th>
              </tr>
            </thead>
            <tbody>
              {data.lineRows.map((row, idx) => (
                <tr key={`${row.lineName}_${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : palette.tableRowAltBg }}>
                  <Td>{row.lineName}</Td>
                  <Td align="center">{row.reportsCount}</Td>
                  <Td align="center" bold color={palette.success}>{fmtNum(row.produced)}</Td>
                  <Td align="center" bold color={palette.danger}>{fmtNum(row.waste)}</Td>
                  <Td align="center">{fmtNum(row.wasteRatio)}%</Td>
                  <Td align="center">{fmtNum(row.avgWorkers)}</Td>
                  <Td align="center">{fmtNum(row.totalHours)}</Td>
                </tr>
              ))}
              {data.lineRows.length === 0 && (
                <tr>
                  <Td colSpan={7} align="center">لا توجد بيانات إنتاج في الفترة المختارة</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data.recommendations.length > 0 && (
          <div style={{ border: `1.5px solid ${palette.border}`, borderRadius: '3mm', padding: isThermal ? '2mm' : '4mm', background: PRINT_COLORS.noteBg }}>
            <p style={{ margin: 0, fontWeight: 900, color: palette.text }}>ملخصات وتوصيات</p>
            <ul style={{ margin: '2mm 0 0', paddingInlineStart: '5mm', color: palette.mutedText, fontWeight: 600 }}>
              {data.recommendations.slice(0, 5).map((item, idx) => (
                <li key={idx} style={{ marginBottom: '1mm' }}>{item}</li>
              ))}
            </ul>
          </div>
        )}

      </div>
    );
  },
);

SupervisorPerformancePrint.displayName = 'SupervisorPerformancePrint';

const SummaryBox: React.FC<{ label: string; value: string; sub?: string; color: string; large?: boolean }> = ({ label, value, sub, color, large }) => (
  <div style={{ border: '1.2px solid var(--print-border, #475569)', borderRadius: '2.4mm', padding: large ? '2.6mm' : '2.2mm', textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: '7pt', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>{label}</p>
    <p style={{ margin: '0.7mm 0 0', fontSize: large ? '13.5pt' : '11.5pt', fontWeight: 900, color }}>{value}</p>
    {sub && <p style={{ margin: '0.7mm 0 0', fontSize: '6.5pt', color: PRINT_COLORS.subtle, fontWeight: 600 }}>{sub}</p>}
  </div>
);

const MetricLine: React.FC<{ label: string; value: string; color: string; compact?: boolean }> = ({ label, value, color, compact }) => (
  <div style={{ border: '1px dashed var(--print-border, #475569)', borderRadius: '2mm', padding: compact ? '0.8mm 1.1mm' : '1.2mm 1.5mm' }}>
    <p style={{ margin: 0, fontSize: compact ? '6.4pt' : '7pt', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>{label}</p>
    <p style={{ margin: '0.5mm 0 0', fontSize: compact ? '8.2pt' : '9pt', color, fontWeight: 900 }}>{value}</p>
  </div>
);

function shortProductName(name: string): string {
  const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return tokens.join(' ');
  return `${tokens[0]} ${tokens[1]}`;
}

const Th: React.FC<{ children: React.ReactNode; align?: string }> = ({ children, align }) => (
  <th
    style={{
      padding: '2.5mm 3mm',
      textAlign: (align || 'right') as React.CSSProperties['textAlign'],
      fontWeight: 900,
      fontSize: '8.5pt',
      color: 'var(--print-th-text, #475569)',
      borderBottom: '2px solid var(--print-border, #475569)',
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
      textAlign: (align || 'right') as React.CSSProperties['textAlign'],
      fontWeight: bold ? 700 : 400,
      color: color || 'var(--print-text, #475569)',
      borderBottom: '1px solid var(--print-border, #475569)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </td>
);
