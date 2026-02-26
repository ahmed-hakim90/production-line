/**
 * ProductionReportPrint - Configurable printable production report.
 * Reads printTemplate settings from system_settings/global (via props).
 * Accepts data via props so it contains ZERO business logic.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ProductionReport, PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';

export interface ReportPrintRow {
  reportId?: string;
  date: string;
  lineName: string;
  productName: string;
  employeeName: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
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
      lineName: lookups.getLineName(r.lineId),
      productName: lookups.getProductName(r.productId),
      employeeName: lookups.getEmployeeName(r.employeeId),
      quantityProduced: r.quantityProduced || 0,
      quantityWaste: r.quantityWaste || 0,
      workersCount: r.workersCount || 0,
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
  const totalWaste = rows.reduce((s, r) => s + r.quantityWaste, 0);
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

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ProductionReportPrint — Bulk report printout                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

export const ProductionReportPrint = React.forwardRef<HTMLDivElement, ReportPrintProps>(
  ({ title, subtitle, generatedAt, rows, totals, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const dp = ps.decimalPlaces;
    const t = totals ?? computePrintTotals(rows, dp);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

    const showWaste    = ps.showWaste;
    const showEmployee = ps.showEmployee;
    const showCosts    = ps.showCosts && rows.some((r) => r.costPerUnit != null && r.costPerUnit > 0);
    const showWO       = ps.showWorkOrder && rows.some((r) => !!r.workOrderNumber);
    const showNotes    = rows.some((r) => !!r.notes?.trim());

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: paper.minHeight,
          padding: isThermal ? '4mm 3mm' : '12mm 15mm',
          background: '#fff',
          color: '#1e293b',
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        {/* ── Factory Header ── */}
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
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
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: '#64748b', fontWeight: 600 }}>
            نظام إدارة الإنتاج - مؤسسة المغربي
          </p>
        </div>

        {/* ── Report Title ── */}
        <div style={{ marginBottom: isThermal ? '3mm' : '6mm' }}>
          <h2 style={{ margin: 0, fontSize: isThermal ? '10pt' : '16pt', fontWeight: 800, color: '#0f172a' }}>{title}</h2>
          {subtitle && <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: '#64748b' }}>{subtitle}</p>}
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '6pt' : '9pt', color: '#94a3b8' }}>تاريخ الطباعة: {now}</p>
        </div>

        {/* ── Summary Cards ── */}
        <div style={{ display: 'flex', gap: isThermal ? '2mm' : '4mm', marginBottom: isThermal ? '3mm' : '6mm', flexWrap: 'wrap' }}>
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
            fontSize: isThermal ? '7pt' : '9.5pt',
            marginBottom: isThermal ? '3mm' : '8mm',
          }}
        >
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <Th>#</Th>
              <Th>التاريخ</Th>
              <Th>خط الإنتاج</Th>
              <Th>المنتج</Th>
              {showEmployee && <Th>المشرف</Th>}
              {showWO       && <Th>أمر شغل</Th>}
              {showNotes    && <Th>ملاحظة</Th>}
              <Th align="center">الكمية المنتجة</Th>
              {showWaste    && <Th align="center">الهالك</Th>}
              <Th align="center">عدد العمال</Th>
              <Th align="center">ساعات العمل</Th>
              {showCosts    && <Th align="center">تكلفة الوحدة</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <Td>{i + 1}</Td>
                <Td>{row.date}</Td>
                <Td>{row.lineName}</Td>
                <Td>{shortProductName(row.productName)}</Td>
                {showEmployee && <Td>{row.employeeName}</Td>}
                {showWO       && <Td>{row.workOrderNumber || '—'}</Td>}
                {showNotes    && <Td>{row.notes?.trim() || '—'}</Td>}
                <Td align="center" bold color="#059669">{fmtNum(row.quantityProduced, dp)}</Td>
                {showWaste    && <Td align="center" bold>{fmtNum(row.quantityWaste, dp)}</Td>}
                <Td align="center">{row.workersCount}</Td>
                <Td align="center">{fmtNum(row.workHours, dp)}</Td>
                {showCosts    && (
                  <Td align="center" bold color={ps.primaryColor}>
                    {row.costPerUnit != null && row.costPerUnit > 0 ? fmtNum(row.costPerUnit, 2) : '—'}
                  </Td>
                )}
              </tr>
            ))}

            {/* Totals Row */}
            <tr style={{ background: '#e2e8f0', fontWeight: 800 }}>
              <Td colSpan={(showEmployee ? 5 : 4) + (showWO ? 1 : 0) + (showNotes ? 1 : 0)}>الإجمالي</Td>
              <Td align="center" bold color="#059669">{fmtNum(t.totalProduced, dp)}</Td>
              {showWaste && <Td align="center" bold color="#f43f5e">{fmtNum(t.totalWaste, dp)}</Td>}
              <Td align="center">{fmtNum(t.totalWorkers, dp)}</Td>
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
          <div style={{ marginTop: '15mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="مدير المصنع" />
            {showEmployee && <SignatureBlock label="مدير الخط" />}
            <SignatureBlock label="مراقب الجودة" />
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
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
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: '#94a3b8' }}>
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
}

export const SingleReportPrint = React.forwardRef<HTMLDivElement, SingleReportPrintProps>(
  ({ report, printSettings }, ref) => {
    if (!report) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const dp = ps.decimalPlaces;
    const now = new Date().toLocaleString('ar-EG');
    const total = report.quantityProduced + report.quantityWaste;
    const wasteRatio = total > 0 ? ((report.quantityWaste / total) * 100).toFixed(dp) : '0';
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

    const reportLink =
      report.reportId && typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}#/reports?reportId=${encodeURIComponent(report.reportId)}`
        : `report|${report.date}|${report.lineName}|${report.productName}|qty:${report.quantityProduced}`;

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: ps.paperSize === 'a4' ? '148mm' : paper.minHeight,
          padding: isThermal ? '4mm 3mm' : '12mm 15mm',
          background: '#fff',
          color: '#1e293b',
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
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
          <h2 style={{ margin: '2mm 0 0', fontSize: isThermal ? '9pt' : '14pt', fontWeight: 700, color: '#334155' }}>
            تقرير إنتاج
          </h2>
        </div>

        {/* Report Details */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isThermal ? '7.5pt' : '10.5pt',
            marginBottom: isThermal ? '3mm' : '8mm',
          }}
        >
          <tbody>
            <DetailRow label="التاريخ"           value={report.date} />
            <DetailRow label="خط الإنتاج"         value={report.lineName}      even />
            <DetailRow label="المنتج"             value={report.productName} />
            {ps.showEmployee    && <DetailRow label="المشرف"              value={report.employeeName}  even />}
            {ps.showWorkOrder && report.workOrderNumber && (
              <DetailRow label="أمر شغل"          value={report.workOrderNumber} />
            )}
            <DetailRow label="الكمية المنتجة"     value={`${fmtNum(report.quantityProduced, dp)} وحدة`} highlight="#059669" even />
            {ps.showWaste && (
              <>
                <DetailRow label="الهالك"          value={`${fmtNum(report.quantityWaste, dp)} وحدة`}   highlight="#f43f5e" />
                <DetailRow label="نسبة الهالك"     value={`${wasteRatio}%`}                              even />
              </>
            )}
            <DetailRow label="عدد العمال"         value={String(report.workersCount)} />
            <DetailRow label="ساعات العمل"        value={fmtNum(report.workHours, dp)}               even />
            {ps.showCosts && report.costPerUnit != null && report.costPerUnit > 0 && (
              <DetailRow label="تكلفة الوحدة"     value={`${fmtNum(report.costPerUnit, 2)} ج.م`}     highlight={ps.primaryColor} />
            )}
            {report.notes?.trim() && (
              <DetailRow label="ملاحظة"           value={report.notes} even />
            )}
          </tbody>
        </table>

        {/* Signature Section */}
        {!isThermal && (
          <div style={{ marginTop: '20mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="مدير المصنع" />
            {ps.showEmployee && <SignatureBlock label="مدير الخط" />}
            <SignatureBlock label="مراقب الجودة" />
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={reportLink}
                size={isThermal ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: '#94a3b8' }}>
                امسح رمز QR للرجوع إلى التقرير
              </p>
            </div>
          )}
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: '#94a3b8' }}>
            {ps.footerText} — {now}
          </p>
        </div>
      </div>
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
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const progress = data.quantity > 0 ? Math.min((data.producedQuantity / data.quantity) * 100, 100) : 0;

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: ps.paperSize === 'a4' ? '148mm' : paper.minHeight,
          padding: isThermal ? '4mm 3mm' : '12mm 15mm',
          background: '#fff',
          color: '#1e293b',
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
          {ps.logoUrl && (
            <img src={ps.logoUrl} alt="logo" style={{ maxHeight: isThermal ? '12mm' : '20mm', marginBottom: '2mm', objectFit: 'contain' }} />
          )}
          <h1 style={{ margin: 0, fontSize: isThermal ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>
            {ps.headerText}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: '#64748b', fontWeight: 600 }}>
            أمر شغل رقم: {data.workOrderNumber}
          </p>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: isThermal ? '3mm' : '8mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#64748b', marginBottom: '1mm' }}>
            <span>نسبة الإنجاز</span>
            <span style={{ fontWeight: 800, color: progress >= 100 ? '#059669' : ps.primaryColor }}>{progress.toFixed(0)}%</span>
          </div>
          <div style={{ width: '100%', height: isThermal ? '3mm' : '5mm', background: '#e2e8f0', borderRadius: '3mm', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(progress, 100)}%`, height: '100%', background: progress >= 100 ? '#059669' : ps.primaryColor, borderRadius: '3mm' }} />
          </div>
        </div>

        {/* Details Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isThermal ? '7.5pt' : '10.5pt', marginBottom: isThermal ? '3mm' : '8mm' }}>
          <tbody>
            <DetailRow label="رقم أمر الشغل"             value={data.workOrderNumber} />
            <DetailRow label="المنتج"                     value={data.productName}     even />
            <DetailRow label="خط الإنتاج"                value={data.lineName} />
            <DetailRow label="المشرف"                     value={data.supervisorName}  even />
            <DetailRow label="الكمية المطلوبة"            value={`${fmtNum(data.quantity, dp)} وحدة`}          highlight={ps.primaryColor} />
            <DetailRow label="الكمية المنتجة"             value={`${fmtNum(data.producedQuantity, dp)} وحدة`}   highlight="#059669"         even />
            <DetailRow label="نسبة الإنجاز"              value={`${progress.toFixed(dp)}%`}                    highlight={progress >= 100 ? '#059669' : progress >= 50 ? '#f59e0b' : '#f43f5e'} />
            <DetailRow label="الحد الأقصى للعمالة"        value={`${data.maxWorkers} عامل`}                    even />
            <DetailRow label="التاريخ المستهدف للإنجاز"   value={data.targetDate} />
            <DetailRow label="الحالة"                     value={data.statusLabel}     even />
            {data.showCosts && data.estimatedCost != null && (
              <DetailRow label="التكلفة التقديرية"        value={`${fmtNum(data.estimatedCost, 2)} ج.م`}       highlight={ps.primaryColor} />
            )}
            {data.showCosts && data.actualCost != null && data.actualCost > 0 && (
              <DetailRow label="التكلفة الفعلية"          value={`${fmtNum(data.actualCost, 2)} ج.م`}          highlight="#059669"         even />
            )}
            {data.notes && <DetailRow label="ملاحظات"     value={data.notes} />}
          </tbody>
        </table>

        {/* Signature Section */}
        {!isThermal && (
          <div style={{ marginTop: '20mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="مدير المصنع" />
            <SignatureBlock label="المشرف" />
            <SignatureBlock label="مراقب الجودة" />
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={`work-order|${data.workOrderNumber}|${data.productName}|qty:${data.quantity}|produced:${data.producedQuantity}`}
                size={isThermal ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: '#94a3b8' }}>
                امسح رمز QR للرجوع إلى أمر الشغل
              </p>
            </div>
          )}
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: '#94a3b8' }}>
            {ps.footerText} — {now}
          </p>
        </div>
      </div>
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

const SummaryBox: React.FC<{ label: string; value: string; unit?: string; color: string; small?: boolean }> = ({ label, value, unit, color, small }) => (
  <div style={{ flex: '1 1 0', minWidth: small ? '18mm' : '30mm', border: '1px solid #e2e8f0', borderRadius: '3mm', padding: small ? '1.5mm 2mm' : '3mm 4mm', textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: small ? '6pt' : '8pt', color: '#64748b', fontWeight: 600 }}>{label}</p>
    <p style={{ margin: '1mm 0 0', fontSize: small ? '10pt' : '14pt', fontWeight: 900, color }}>
      {value}
      {unit && <span style={{ fontSize: small ? '5pt' : '8pt', fontWeight: 600, marginRight: '1mm', color: '#94a3b8' }}>{unit}</span>}
    </p>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; align?: string }> = ({ children, align }) => (
  <th
    style={{
      padding: '2.5mm 3mm',
      textAlign: (align || 'right') as React.CSSProperties['textAlign'],
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
      textAlign: (align || 'right') as React.CSSProperties['textAlign'],
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
    <p style={{ margin: '2mm 0 0', fontSize: '8pt', color: '#94a3b8' }}>الاسم / التوقيع</p>
  </div>
);
