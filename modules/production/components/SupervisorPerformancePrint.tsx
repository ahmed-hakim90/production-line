import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette, resolvePrintAccentHex } from '../../../utils/printTheme';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';

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
    const doc = resolvePrintDocumentConfig(ps, 'supervisorPerformance');
    const palette = getPrintThemePalette(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const brandName = String(doc.headerText || '').trim() || ps.headerText || 'الشركة';
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
      <FactoryPrintShell
        ref={ref}
        companyName={brandName}
        documentType="تقرير تقييم أداء مشرف"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '3mm 2.5mm' : '6mm 10mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'المشرف', value: data.supervisorName },
          { label: 'القسم', value: data.departmentName },
          { label: 'المسمى', value: data.jobTitle },
          { label: 'الحالة', value: data.statusLabel },
          ...(data.supervisorCode ? [{ label: 'الكود', value: data.supervisorCode }] : []),
          ...(data.periodLabel ? [{ label: 'الفترة', value: data.periodLabel }] : []),
        ]}
        kpis={[
          { label: 'إجمالي الإنتاج', value: fmtNum(data.totalProduced), unit: 'وحدة', tone: 'indigo' },
          {
            label: 'درجة الأداء',
            value: data.performanceScore,
            unit: scoreTone.text,
            tone: data.performanceScore >= 85 ? 'green' : data.performanceScore >= 70 ? 'default' : 'red',
          },
          { label: 'نسبة الأداء', value: `${fmtNum(data.performanceRatio)}%`, tone: 'sky' },
          {
            label: 'نسبة الهالك',
            value: `${fmtNum(data.wasteRatio)}%`,
            tone: 'red',
          },
        ]}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isThermal ? '1fr' : '1.2fr 1.2fr 2.2fr',
            gap: isThermal ? '1.5mm' : '2mm',
            marginBottom: isThermal ? '2.5mm' : '4mm',
          }}
        >
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
              border: `1.5px solid ${accent}`,
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
              <MetricLine
                label="استغلال الخط"
                value={`${fmtNum(data.lineUtilizationRatio)}% ${data.lineUtilizationHigh ? '(عالي)' : '(منخفض)'}`}
                color={utilizationTone}
              />
              <MetricLine label="نسبة الهالك" value={`${fmtNum(data.wasteRatio)}%`} color={palette.danger} />
            </div>
          </div>
        </div>

        <div
          style={{
            border: `1.5px solid ${accent}`,
            background: PRINT_COLORS.infoBg,
            borderRadius: '3mm',
            padding: isThermal ? '2mm' : '4mm',
            marginBottom: isThermal ? '3mm' : '6mm',
          }}
        >
          <p style={{ margin: 0, fontWeight: 900, color: accent, fontSize: isThermal ? '8pt' : '11pt' }}>
            {data.appreciationTitle}
          </p>
          <p style={{ margin: '1mm 0 0', color: palette.text, fontSize: isThermal ? '7pt' : '10pt', fontWeight: 600 }}>
            {data.appreciationBody}
          </p>
        </div>

        {doc.isFieldVisible('products') ? (
          <div style={{ marginBottom: isThermal ? '3mm' : '6mm' }}>
            <FactoryPrintSectionTitle title="تفصيل المنتجات (المخطط مقابل المحقق)" accent={accent} />
            {data.productRows.length === 0 ? (
              <div
                style={{
                  marginTop: '2mm',
                  border: `1px dashed ${palette.border}`,
                  borderRadius: '2.5mm',
                  padding: '3mm',
                  textAlign: 'center',
                  color: palette.mutedText,
                  fontWeight: 700,
                }}
              >
                لا توجد بيانات منتجات في الفترة المختارة
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isThermal ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: isThermal ? '1.5mm' : '2mm',
                  marginTop: '2mm',
                }}
              >
                {data.productRows.map((row, idx) => {
                  const performanceColor =
                    row.performanceRatio >= 100
                      ? palette.success
                      : row.performanceRatio >= 85
                        ? palette.warning
                        : palette.danger;
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
        ) : null}

        {doc.isFieldVisible('lines') ? (
          <div style={{ marginBottom: isThermal ? '3mm' : '6mm' }}>
            <FactoryPrintSectionTitle title="تقييم تفصيلي لكل خط" accent={accent} />
            <FactoryPrintTable
              brandAccent={accent}
              printSettings={ps}
              dense={isThermal}
              columns={[
                { key: 'line', header: 'الخط' },
                { key: 'reports', header: 'تقارير', width: '10%', align: 'center' },
                { key: 'produced', header: 'إنتاج', width: '12%', align: 'center' },
                { key: 'waste', header: 'هالك', width: '12%', align: 'center' },
                { key: 'wasteRatio', header: 'نسبة هالك', width: '12%', align: 'center' },
                { key: 'avgWorkers', header: 'متوسط عمالة', width: '12%', align: 'center' },
                { key: 'hours', header: 'ساعات', width: '10%', align: 'center' },
              ]}
              rows={
                data.lineRows.length === 0
                  ? [
                      {
                        key: 'empty',
                        cells: {
                          line: 'لا توجد بيانات إنتاج في الفترة المختارة',
                          reports: '—',
                          produced: '—',
                          waste: '—',
                          wasteRatio: '—',
                          avgWorkers: '—',
                          hours: '—',
                        },
                      },
                    ]
                  : data.lineRows.map((row, idx) => ({
                      key: `${row.lineName}_${idx}`,
                      cells: {
                        line: row.lineName,
                        reports: row.reportsCount,
                        produced: (
                          <span style={{ fontWeight: 700, color: palette.success }}>{fmtNum(row.produced)}</span>
                        ),
                        waste: (
                          <span style={{ fontWeight: 700, color: palette.danger }}>{fmtNum(row.waste)}</span>
                        ),
                        wasteRatio: `${fmtNum(row.wasteRatio)}%`,
                        avgWorkers: fmtNum(row.avgWorkers),
                        hours: fmtNum(row.totalHours),
                      },
                    }))
              }
            />
          </div>
        ) : null}

        {doc.isFieldVisible('recommendations') && data.recommendations.length > 0 ? (
          <div
            style={{
              border: `1.5px solid ${palette.border}`,
              borderRadius: '3mm',
              padding: isThermal ? '2mm' : '4mm',
              background: PRINT_COLORS.noteBg,
            }}
          >
            <FactoryPrintSectionTitle title="ملخصات وتوصيات" accent={accent} />
            <ul style={{ margin: '2mm 0 0', paddingInlineStart: '5mm', color: palette.mutedText, fontWeight: 600 }}>
              {data.recommendations.slice(0, 5).map((item, idx) => (
                <li key={idx} style={{ marginBottom: '1mm' }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

SupervisorPerformancePrint.displayName = 'SupervisorPerformancePrint';

const SummaryBox: React.FC<{ label: string; value: string; sub?: string; color: string; large?: boolean }> = ({
  label,
  value,
  sub,
  color,
  large,
}) => (
  <div
    style={{
      border: '1.2px solid var(--print-border, #475569)',
      borderRadius: '2.4mm',
      padding: large ? '2.6mm' : '2.2mm',
      textAlign: 'center',
    }}
  >
    <p style={{ margin: 0, fontSize: '7pt', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>{label}</p>
    <p style={{ margin: '0.7mm 0 0', fontSize: large ? '13.5pt' : '11.5pt', fontWeight: 900, color }}>{value}</p>
    {sub && (
      <p style={{ margin: '0.7mm 0 0', fontSize: '6.5pt', color: PRINT_COLORS.subtle, fontWeight: 600 }}>{sub}</p>
    )}
  </div>
);

const MetricLine: React.FC<{ label: string; value: string; color: string; compact?: boolean }> = ({
  label,
  value,
  color,
  compact,
}) => (
  <div
    style={{
      border: '1px dashed var(--print-border, #475569)',
      borderRadius: '2mm',
      padding: compact ? '0.8mm 1.1mm' : '1.2mm 1.5mm',
    }}
  >
    <p style={{ margin: 0, fontSize: compact ? '6.4pt' : '7pt', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {label}
    </p>
    <p style={{ margin: '0.5mm 0 0', fontSize: compact ? '8.2pt' : '9pt', color, fontWeight: 900 }}>{value}</p>
  </div>
);

function shortProductName(name: string): string {
  const tokens = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length <= 2) return tokens.join(' ');
  return `${tokens[0]} ${tokens[1]}`;
}
