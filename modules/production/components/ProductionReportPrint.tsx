/**
 * ProductionReportPrint - Configurable printable production report.
 * Reads printTemplate settings from system_settings/global (via props).
 * Accepts data via props so it contains ZERO business logic.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ProductionReport, PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { getReportWaste } from '../../../utils/calculations';
import { PrintReportLayout } from '@/src/components/erp/PrintReportLayout';

export interface ReportPrintRow {
  reportId?: string;
  reportCode?: string;
  date: string;
  lineName: string;
  productName: string;
  employeeName: string;
  quantityProduced: number;
  wasteQuantity: number;
  workersCount: number;
  workersProductionCount?: number;
  workersPackagingCount?: number;
  workersQualityCount?: number;
  workersMaintenanceCount?: number;
  workersExternalCount?: number;
  workHours: number;
  notes?: string;
  costPerUnit?: number;
  workOrderNumber?: string;
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
  printSettings?: PrintTemplateSettings;
}

/**
 * Convert raw ProductionReport[] to ReportPrintRow[] using lookup fns.
 * Call this from the parent page - keeps logic out of the print component.
 */
export const mapReportsToPrintRows = (
  reports: ProductionReport[],
  lookups: {
    getLineName: (id: string) => string;
    getProductName: (id: string) => string;
    getEmployeeName: (id: string) => string;
    getWorkOrder?: (id: string) => { workOrderNumber: string } | undefined;
  },
  costMap?: Map<string, number>,
): ReportPrintRow[] =>
  reports.map((r) => {
    const wo = r.workOrderId && lookups.getWorkOrder ? lookups.getWorkOrder(r.workOrderId) : undefined;
    return {
      date: r.date,
      reportId: r.id,
      reportCode: r.reportCode,
      lineName: lookups.getLineName(r.lineId),
      productName: lookups.getProductName(r.productId),
      employeeName: lookups.getEmployeeName(r.employeeId),
      quantityProduced: r.quantityProduced || 0,
      wasteQuantity: getReportWaste(r),
      workersCount: r.workersCount || 0,
      workersProductionCount: r.workersProductionCount || 0,
      workersPackagingCount: r.workersPackagingCount || 0,
      workersQualityCount: r.workersQualityCount || 0,
      workersMaintenanceCount: r.workersMaintenanceCount || 0,
      workersExternalCount: r.workersExternalCount || 0,
      workHours: r.workHours || 0,
      notes: r.notes,
      costPerUnit: r.id && costMap ? costMap.get(r.id) : undefined,
      workOrderNumber: wo?.workOrderNumber,
    };
  });

/**
 * Compute totals from rows.
 */
export const computePrintTotals = (rows: ReportPrintRow[], decimalPlaces = 0) => {
  const totalProduced = rows.reduce((s, r) => s + r.quantityProduced, 0);
  const totalWaste = rows.reduce((s, r) => s + r.wasteQuantity, 0);
  const totalHours = rows.reduce((s, r) => s + r.workHours, 0);
  const totalWorkers = rows.reduce((s, r) => s + r.workersCount, 0);
  const total = totalProduced + totalWaste;
  const wasteRatio = total > 0 ? ((totalWaste / total) * 100).toFixed(decimalPlaces) : '0';
  return { totalProduced, totalWaste, totalHours, totalWorkers, wasteRatio, reportsCount: rows.length };
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const PRINT_SPACING = {
  regular: {
    pagePadding: '10mm 12mm',
    sectionGap: '5mm',
    tableHeaderPadding: '3.2mm 3.4mm',
    tableCellPadding: '2.8mm 3.4mm',
    tableFontSize: '10pt',
    tableHeaderFontSize: '9pt',
    signatureTopMargin: '11mm',
  },
  thermal: {
    pagePadding: '4mm 3mm',
    sectionGap: '3mm',
    tableHeaderPadding: '1.8mm 2mm',
    tableCellPadding: '1.6mm 2mm',
    tableFontSize: '7.3pt',
    tableHeaderFontSize: '7pt',
    signatureTopMargin: '0',
  },
} as const;

function fmtNum(value: number, decimalPlaces: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

function shortProductName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[1]}`;
}

function formatReportNumber(reportId?: string): string {
  if (!reportId) return 'RPT-NA'
  const shortId = reportId.slice(-6).toUpperCase()
  return `RPT-${shortId}`
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ProductionReportPrint — Bulk report printout                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

export const ProductionReportPrint = React.forwardRef<HTMLDivElement, ReportPrintProps>(
  ({ title, subtitle, generatedAt, rows, totals, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const dp = ps.decimalPlaces;
    const t = totals ?? computePrintTotals(rows, dp);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const spacing = isThermal ? PRINT_SPACING.thermal : PRINT_SPACING.regular;

    const showWaste    = ps.showWaste;
    const showEmployee = ps.showEmployee;
    const showCosts    = ps.showCosts && rows.some((r) => r.costPerUnit != null && r.costPerUnit > 0);
    const showWO       = ps.showWorkOrder && rows.some((r) => !!r.workOrderNumber);
    const showNotes    = rows.some((r) => !!r.notes?.trim());
    const headerColSpan =
      4 +
      (showEmployee ? 1 : 0) +
      (showWO ? 1 : 0) +
      (showNotes ? 1 : 0);

    return (
      <div
        ref={ref}
        className="print-root print-report"
        dir="rtl"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: paper.minHeight,
          padding: spacing.pagePadding,
          background: '#fff',
          color: palette.text,
          ['--print-text' as any]: palette.text,
          ['--print-muted-text' as any]: palette.mutedText,
          ['--print-border' as any]: palette.border,
          ['--print-th-bg' as any]: palette.tableHeaderBg,
          ['--print-th-text' as any]: palette.tableHeaderText,
          ['--print-row-alt' as any]: palette.tableRowAltBg,
          fontSize: isThermal ? '8pt' : '10.5pt',
          lineHeight: 1.55,
          boxSizing: 'border-box',
        }}
      >
        {/* ── Factory Header ── */}
        <div style={{ textAlign: 'center', marginBottom: spacing.sectionGap, borderBottom: `2px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '5mm' }}>
          {ps.logoUrl && (
            <img
              src={ps.logoUrl}
              alt="logo"
              style={{ maxHeight: isThermal ? '12mm' : '20mm', marginBottom: '2mm', objectFit: 'contain' }}
            />
          )}
          <h1 style={{ margin: 0, fontSize: isThermal ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>
            {ps.headerText}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: palette.mutedText, fontWeight: 600 }}>
           مؤسسة المغربي
          </p>
        </div>

        {/* ── Report Title ── */}
        <div style={{ marginBottom: spacing.sectionGap }}>
          <h2 style={{ margin: 0, fontSize: isThermal ? '10pt' : '16pt', fontWeight: 800, color: '#0f172a' }}>{title}</h2>
          {subtitle && <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: palette.mutedText }}>{subtitle}</p>}
          <div
            style={{
              marginTop: '2.2mm',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '2mm',
              fontSize: isThermal ? '6pt' : '9pt',
              color: palette.mutedText,
              border: `1px solid ${palette.border}`,
              borderRadius: '2mm',
              padding: isThermal ? '1mm 1.3mm' : '1.4mm 1.8mm',
              background: palette.tableRowAltBg,
            }}
          >
            <span>تاريخ الطباعة: {now}</span>
            <span>عدد السجلات: {rows.length}</span>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isThermal ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: isThermal ? '1.5mm' : '3mm', marginBottom: spacing.sectionGap }}>
          <SummaryBox label="الكمية المنتجة"  value={fmtNum(t.totalProduced, dp)} unit="وحدة" color={ps.primaryColor} small={isThermal} />
          {showWaste && (
            <>
              <SummaryBox label="الكمية الهالكة" value={fmtNum(t.totalWaste, dp)}    unit="وحدة" color="#f43f5e"    small={isThermal} />
              <SummaryBox label="نسبة الهالك"    value={`${t.wasteRatio}%`}                       color="#f59e0b"    small={isThermal} />
            </>
          )}
          <SummaryBox label="ساعات العمل"    value={fmtNum(t.totalHours, dp)}    unit="ساعة" color="#8b5cf6"    small={isThermal} />
          <SummaryBox label="عدد التقارير"   value={String(t.reportsCount)}                   color="#64748b"    small={isThermal} />
        </div>

        {/* ── Data Table ── */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: spacing.tableFontSize,
            marginBottom: spacing.sectionGap,
            border: `1px solid ${palette.border}`,
          }}
        >
          <thead>
            <tr style={{ background: palette.tableHeaderBg }}>
              <Th>#</Th>
              <Th>التاريخ</Th>
              <Th>خط الإنتاج</Th>
              <Th wrap>المنتج</Th>
              {showEmployee && <Th>المشرف</Th>}
              {showWO       && <Th>أمر شغل</Th>}
              {showNotes    && <Th wrap>ملاحظة</Th>}
              <Th align="center">الكمية المنتجة</Th>
              {showWaste    && <Th align="center">الهالك</Th>}
              <Th align="center">عدد العمال</Th>
              <Th wrap>تفصيل العمالة</Th>
              <Th align="center">ساعات العمل</Th>
              {showCosts    && <Th align="center">تكلفة الوحدة</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : palette.tableRowAltBg }}>
                <Td>{i + 1}</Td>
                <Td>{row.date}</Td>
                <Td>{row.lineName}</Td>
                <Td wrap>{shortProductName(row.productName)}</Td>
                {showEmployee && <Td>{row.employeeName}</Td>}
                {showWO       && <Td>{row.workOrderNumber || '—'}</Td>}
                {showNotes    && <Td wrap>{row.notes?.trim() || '—'}</Td>}
                <Td align="center" bold color="#059669">{fmtNum(row.quantityProduced, dp)}</Td>
                {showWaste    && <Td align="center" bold>{fmtNum(row.wasteQuantity, dp)}</Td>}
                <Td align="center">{row.workersCount}</Td>
                <Td wrap>
                  إ:{row.workersProductionCount ?? 0} | ت:{row.workersPackagingCount ?? 0} | ج:{row.workersQualityCount ?? 0} | ص:{row.workersMaintenanceCount ?? 0} | خ:{row.workersExternalCount ?? 0}
                </Td>
                <Td align="center">{fmtNum(row.workHours, dp)}</Td>
                {showCosts    && (
                  <Td align="center" bold color={ps.primaryColor}>
                    {row.costPerUnit != null && row.costPerUnit > 0 ? fmtNum(row.costPerUnit, 2) : '—'}
                  </Td>
                )}
              </tr>
            ))}

            {/* Totals Row */}
            <tr style={{ background: palette.tableHeaderBg, fontWeight: 800 }}>
              <Td colSpan={headerColSpan} bold>الإجمالي</Td>
              <Td align="center" bold color="#059669">{fmtNum(t.totalProduced, dp)}</Td>
              {showWaste && <Td align="center" bold color="#f43f5e">{fmtNum(t.totalWaste, dp)}</Td>}
              <Td align="center">{fmtNum(t.totalWorkers, dp)}</Td>
              <Td>—</Td>
              <Td align="center">{fmtNum(t.totalHours, dp)}</Td>
              {showCosts && (() => {
                const costsArr = rows.filter((r) => r.costPerUnit != null && r.costPerUnit > 0).map((r) => r.costPerUnit!);
                const avg = costsArr.length > 0 ? costsArr.reduce((s, v) => s + v, 0) / costsArr.length : 0;
                return <Td align="center" bold color={ps.primaryColor}>{avg > 0 ? fmtNum(avg, 2) : '—'}</Td>;
              })()}
            </tr>
          </tbody>
        </table>

        {/* ── Signature Section ── */}
        {!isThermal && (
          <div style={{ marginTop: spacing.signatureTopMargin, display: 'flex', justifyContent: 'space-between', gap: '14mm' }}>
            <SignatureBlock label="مدير المصنع" />
            {showEmployee && <SignatureBlock label="مدير الخط" />}
            <SignatureBlock label="مراقب الجودة" />
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ marginTop: isThermal ? '2.8mm' : '8mm', borderTop: `1px solid ${palette.border}`, paddingTop: '2.8mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={`report-batch|${now}|count:${rows.length}|produced:${t.totalProduced}`}
                size={isThermal ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: '#94a3b8' }}>
                امسح رمز QR للتحقق من صحة التقرير
              </p>
            </div>
          )}
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText }}>
            {ps.footerText} — {now}
          </p>
        </div>
      </div>
    );
  },
);

ProductionReportPrint.displayName = 'ProductionReportPrint';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SingleReportPrint — Printable layout for ONE production report            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface SingleReportPrintProps {
  report: ReportPrintRow | null;
  printSettings?: PrintTemplateSettings;
  /** Unique root id when multiple export layouts exist on one page (e.g. showcase). */
  exportRootId?: string;
}

export const SingleReportPrint = React.forwardRef<HTMLDivElement, SingleReportPrintProps>(
  ({ report, printSettings, exportRootId }, ref) => {
    if (!report) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const dp = ps.decimalPlaces ?? 0;
    const now = new Date().toLocaleString('ar-EG');
    const total = Number(report.quantityProduced || 0) + Number(report.wasteQuantity || 0);
    const wasteRatio = total > 0 ? ((Number(report.wasteQuantity || 0) / total) * 100).toFixed(dp) : '0';

    return (
      <PrintReportLayout
        ref={ref}
        exportRootId={exportRootId}
        companyName={ps.headerText || 'مؤسسة المغربي للإستيراد'}
        reportType="تقرير إنتاج"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={ps.primaryColor}
        footerTagline={ps.footerText?.trim() || undefined}
        paperSize={ps.paperSize}
        orientation={ps.orientation}
        meta={{
          reportNumber: report.reportCode?.trim() || formatReportNumber(report.reportId),
          reportDate: report.date || '—',
          lineName: report.lineName || '—',
          supervisorName: report.employeeName || '—',
        }}
        kpis={[
          { label: 'الكمية المنتجة', value: Number(report.quantityProduced || 0), unit: 'وحدة', color: 'indigo' },
          { label: 'الهالك', value: Number(report.wasteQuantity || 0), unit: 'وحدة', color: report.wasteQuantity > 0 ? 'red' : 'default' },
          { label: 'العمال', value: report.workersCount || 0, color: 'default' },
          {
            label: 'تكلفة الوحدة',
            value: report.costPerUnit != null && report.costPerUnit > 0 ? report.costPerUnit.toFixed(2) : '—',
            unit: 'ج.م',
            color: 'green',
          },
        ]}
        sections={[
          {
            title: 'المنتج وأمر الشغل',
            rows: [
              { label: 'المنتج', value: shortProductName(report.productName || '—'), highlight: true },
              { label: 'أمر الشغل', value: report.workOrderNumber || '—' },
            ],
            progress: undefined,
          },
          {
            title: 'تفاصيل الإنتاج',
            rows: [
              { label: 'ساعات العمل', value: `${fmtNum(report.workHours, dp)} ساعات` },
              { label: 'نسبة الهالك', value: `${wasteRatio}%` },
              {
                label: 'توزيع العمالة',
                value: `إنتاج: ${report.workersProductionCount ?? 0} | تغليف: ${report.workersPackagingCount ?? 0} | جودة: ${report.workersQualityCount ?? 0} | صيانة: ${report.workersMaintenanceCount ?? 0} | خارجية: ${report.workersExternalCount ?? 0}`,
              },
            ],
          },
        ]}
        signatures={[
          { title: 'مدير المصنع' },
          { title: 'مدير الخط' },
          { title: 'مراقب الجودة' },
        ]}
      />
    );
  },
);

SingleReportPrint.displayName = 'SingleReportPrint';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  WorkOrderPrint — Printable layout for a single work order                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface WorkOrderPrintData {
  workOrderNumber: string;
  productName: string;
  lineName: string;
  supervisorName: string;
  quantity: number;
  producedQuantity: number;
  maxWorkers: number;
  targetDate: string;
  status: string;
  statusLabel: string;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string;
  showCosts?: boolean;
}

export interface WorkOrderPrintProps {
  data: WorkOrderPrintData | null;
  printSettings?: PrintTemplateSettings;
}

export const WorkOrderPrint = React.forwardRef<HTMLDivElement, WorkOrderPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const dp = ps.decimalPlaces;
    const now = new Date().toLocaleString('ar-EG');
    const progress = data.quantity > 0 ? Math.min((data.producedQuantity / data.quantity) * 100, 100) : 0;
    const remaining = Math.max(0, Number(data.quantity || 0) - Number(data.producedQuantity || 0));
    const showCosts = !!data.showCosts;

    return (
      <PrintReportLayout
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي للإستيراد'}
        reportType="أمر شغل"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={ps.primaryColor}
        footerTagline={ps.footerText?.trim() || undefined}
        paperSize={ps.paperSize}
        orientation={ps.orientation}
        meta={{
          reportNumber: data.workOrderNumber || '—',
          reportDate: data.targetDate || '—',
          lineName: data.lineName || '—',
          supervisorName: data.supervisorName || '—',
        }}
        kpis={[
          { label: 'الكمية المطلوبة', value: Number(data.quantity || 0), unit: 'وحدة', color: 'indigo' },
          { label: 'الكمية المنتجة', value: Number(data.producedQuantity || 0), unit: 'وحدة', color: 'green' },
          { label: 'المتبقي', value: remaining, unit: 'وحدة', color: remaining > 0 ? 'red' : 'default' },
          { label: 'نسبة الإنجاز', value: progress.toFixed(dp), unit: '%', color: progress >= 100 ? 'green' : 'default' },
        ]}
        sections={[
          {
            title: 'المنتج وأمر الشغل',
            rows: [
              { label: 'المنتج', value: data.productName || '—', highlight: true },
              { label: 'الحالة', value: data.statusLabel || data.status || '—' },
            ],
            progress: { label: 'تقدم أمر الشغل', value: Math.round(Math.max(0, Math.min(100, progress))) },
          },
          {
            title: 'تفاصيل التنفيذ',
            rows: [
              { label: 'الحد الأقصى للعمالة', value: `${data.maxWorkers || 0} عامل` },
              ...(showCosts && data.estimatedCost != null
                ? [{ label: 'التكلفة التقديرية', value: `${fmtNum(data.estimatedCost, 2)} ج.م` }]
                : []),
              ...(showCosts && data.actualCost != null && data.actualCost > 0
                ? [{ label: 'التكلفة الفعلية', value: `${fmtNum(data.actualCost, 2)} ج.م` }]
                : []),
              ...(data.notes ? [{ label: 'ملاحظات', value: data.notes }] : []),
            ],
          },
        ]}
        signatures={[
          { title: 'مدير المصنع' },
          { title: 'المشرف' },
          { title: 'مراقب الجودة' },
        ]}
      />
    );
  },
);

WorkOrderPrint.displayName = 'WorkOrderPrint';

/* ─── Helper sub-components (inline styled for print isolation) ─────────── */

const DetailRow: React.FC<{
  label: string;
  value: string;
  even?: boolean;
  highlight?: string;
}> = ({ label, value, even, highlight }) => (
  <tr style={{ background: even ? '#f8fafc' : '#fff' }}>
    <td
      style={{
        padding: '2.5mm 3mm',
        fontWeight: 700,
        color: 'var(--print-muted-text, #475569)',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        width: '35%',
        fontSize: '9.5pt',
      }}
    >
      {label}
    </td>
    <td
      style={{
        padding: '2.5mm 3mm',
        fontWeight: highlight ? 800 : 400,
        color: highlight || 'var(--print-text, #0f172a)',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        fontSize: highlight ? '11.5pt' : '10pt',
      }}
    >
      {value}
    </td>
  </tr>
);

const SummaryBox: React.FC<{ label: string; value: string; unit?: string; color: string; small?: boolean }> = ({ label, value, unit, color, small }) => (
  <div style={{ minWidth: small ? '18mm' : '30mm', border: '1px solid var(--print-border, #e2e8f0)', borderRadius: '2.5mm', padding: small ? '1.3mm 1.8mm' : '2.2mm 2.8mm', textAlign: 'center', background: '#fff' }}>
    <p style={{ margin: 0, fontSize: small ? '6pt' : '8pt', color: 'var(--print-muted-text, #64748b)', fontWeight: 600 }}>{label}</p>
    <p style={{ margin: '1mm 0 0', fontSize: small ? '10pt' : '14pt', fontWeight: 900, color }}>
      {value}
      {unit && <span style={{ fontSize: small ? '5pt' : '8pt', fontWeight: 600, marginRight: '1mm', color: '#94a3b8' }}>{unit}</span>}
    </p>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; align?: string; wrap?: boolean }> = ({ children, align, wrap }) => (
  <th
    style={{
      padding: '3.2mm 3.4mm',
      textAlign: (align || 'right') as React.CSSProperties['textAlign'],
      fontWeight: 800,
      fontSize: '9pt',
      color: 'var(--print-th-text, #475569)',
      borderBottom: '2px solid var(--print-border, #cbd5e1)',
      whiteSpace: wrap ? 'normal' : 'nowrap',
      lineHeight: 1.35,
    }}
  >
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; align?: string; bold?: boolean; color?: string; colSpan?: number; wrap?: boolean }> = ({
  children, align, bold, color, colSpan, wrap,
}) => (
  <td
    colSpan={colSpan}
    style={{
      padding: '2.8mm 3.4mm',
      textAlign: (align || 'right') as React.CSSProperties['textAlign'],
      fontWeight: bold ? 700 : 400,
      color: color || 'var(--print-text, #334155)',
      borderBottom: '1px solid var(--print-border, #e2e8f0)',
      whiteSpace: wrap ? 'normal' : 'nowrap',
      lineHeight: 1.45,
      wordBreak: wrap ? 'break-word' : 'normal',
    }}
  >
    {children}
  </td>
);

const SignatureBlock: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: '9pt', fontWeight: 700, color: 'var(--print-muted-text, #475569)' }}>{label}</p>
    <div style={{ marginTop: '12mm', borderBottom: '1px solid var(--print-border, #94a3b8)', width: '80%', marginLeft: 'auto', marginRight: 'auto' }} />
    <p style={{ margin: '2mm 0 0', fontSize: '8pt', color: 'var(--print-muted-text, #94a3b8)' }}>الاسم / التوقيع</p>
  </div>
);
