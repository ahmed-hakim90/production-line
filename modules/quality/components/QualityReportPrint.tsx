import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { getPrintThemePalette } from '@/utils/printTheme';

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
    const palette = getPrintThemePalette(ps);
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
          color: palette.text,
          ['--print-text' as any]: palette.text,
          ['--print-muted-text' as any]: palette.mutedText,
          ['--print-border' as any]: palette.border,
          ['--print-th-bg' as any]: palette.tableHeaderBg,
          ['--print-th-text' as any]: palette.tableHeaderText,
          ['--print-row-alt' as any]: palette.tableRowAltBg,
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
          <h1 style={{ margin: 0, fontSize: ps.paperSize === 'thermal' ? '12pt' : '20pt', fontWeight: 900, color: palette.primary }}>
            {ps.headerText}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: ps.paperSize === 'thermal' ? '7pt' : '10pt', color: palette.mutedText, fontWeight: 600 }}>
            نظام إدارة الجودة - تقارير الجودة
          </p>
        </div>

        <div style={{ marginBottom: ps.paperSize === 'thermal' ? '3mm' : '6mm' }}>
          <h2 style={{ margin: 0, fontSize: ps.paperSize === 'thermal' ? '10pt' : '16pt', fontWeight: 800, color: palette.text }}>{title}</h2>
          {subtitle && <p style={{ margin: '1mm 0 0', fontSize: ps.paperSize === 'thermal' ? '7pt' : '10pt', color: palette.mutedText }}>{subtitle}</p>}
          <p style={{ margin: '2mm 0 0', fontSize: ps.paperSize === 'thermal' ? '6pt' : '9pt', color: palette.mutedText }}>
            تاريخ الطباعة: {now}
          </p>
        </div>

        <div style={{ display: 'flex', gap: ps.paperSize === 'thermal' ? '2mm' : '4mm', marginBottom: ps.paperSize === 'thermal' ? '3mm' : '6mm', flexWrap: 'wrap' }}>
          <SummaryBox label="تم الفحص" value={fmtNum(summary.inspectedUnits, 0)} color={palette.primary} small={ps.paperSize === 'thermal'} />
          <SummaryBox label="ناجح" value={fmtNum(summary.passedUnits, 0)} color={palette.success} small={ps.paperSize === 'thermal'} />
          <SummaryBox label="فاشل" value={fmtNum(summary.failedUnits, 0)} color={palette.danger} small={ps.paperSize === 'thermal'} />
          <SummaryBox label="إعادة تشغيل" value={fmtNum(summary.reworkUnits, 0)} color={palette.warning} small={ps.paperSize === 'thermal'} />
          <SummaryBox label="معدل العيوب" value={`${fmtNum(summary.defectRate, dp)}%`} color={palette.warning} small={ps.paperSize === 'thermal'} />
          <SummaryBox label="FPY" value={`${fmtNum(summary.firstPassYield, dp)}%`} color={palette.primary} small={ps.paperSize === 'thermal'} />
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
            <tr style={{ background: palette.tableHeaderBg }}>
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
                <tr key={`${item.reasonLabel}_${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : 'var(--print-row-alt, #f8fafc)' }}>
                  <Td>{idx + 1}</Td>
                  <Td>{item.reasonLabel}</Td>
                  <Td align="center" bold color={palette.primary}>{fmtNum(item.quantity, 0)}</Td>
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

        <div style={{ marginTop: ps.paperSize === 'thermal' ? '3mm' : '10mm', borderTop: `1px solid ${palette.border}`, paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={`quality-kpi|${workOrderNumber || 'snapshot'}|inspected:${summary.inspectedUnits}|failed:${summary.failedUnits}`}
                size={ps.paperSize === 'thermal' ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: palette.mutedText }}>رمز QR للتحقق من صحة تقرير الجودة</p>
            </div>
          )}
          <p style={{ margin: 0, fontSize: ps.paperSize === 'thermal' ? '6pt' : '8pt', color: palette.mutedText }}>
            {ps.footerText} - {now}
          </p>
        </div>
      </div>
    );
  },
);

QualityReportPrint.displayName = 'QualityReportPrint';

export interface SingleIPQCPrintData {
  date: string;
  workOrderNumber: string;
  lineName: string;
  productName: string;
  inspectorName: string;
  statusLabel: string;
  serialBarcode?: string;
  reasonLabel?: string;
  notes?: string;
  photosCount?: number;
}

export interface SingleIPQCPrintProps {
  data: SingleIPQCPrintData | null;
  printSettings?: PrintTemplateSettings;
}

export const SingleIPQCPrint = React.forwardRef<HTMLDivElement, SingleIPQCPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const now = new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

    const reportLink =
      typeof window !== 'undefined'
        ? `${window.location.origin}/quality/ipqc`
        : `ipqc|${data.workOrderNumber}|${data.date}|${data.statusLabel}`;

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
          color: palette.text,
          ['--print-text' as any]: palette.text,
          ['--print-muted-text' as any]: palette.mutedText,
          ['--print-border' as any]: palette.border,
          ['--print-th-bg' as any]: palette.tableHeaderBg,
          ['--print-th-text' as any]: palette.tableHeaderText,
          ['--print-row-alt' as any]: palette.tableRowAltBg,
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
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
            تقرير فحص IPQC
          </h2>
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isThermal ? '7.5pt' : '10.5pt',
            marginBottom: isThermal ? '3mm' : '8mm',
          }}
        >
          <tbody>
            <DetailRow label="تاريخ الفحص" value={data.date} />
            <DetailRow label="رقم أمر الشغل" value={data.workOrderNumber} even />
            <DetailRow label="خط الإنتاج" value={data.lineName} />
            <DetailRow label="المنتج" value={data.productName} even />
            <DetailRow label="اسم الفاحص" value={data.inspectorName} />
            <DetailRow
              label="حالة الفحص"
              value={data.statusLabel}
              even
              highlight={data.statusLabel === 'Passed' || data.statusLabel === 'Approved' ? '#059669' : data.statusLabel === 'Rework' ? '#f59e0b' : '#f43f5e'}
            />
            {data.serialBarcode && <DetailRow label="Serial" value={data.serialBarcode} />}
            {data.reasonLabel && <DetailRow label="سبب العيب" value={data.reasonLabel} even />}
            <DetailRow label="عدد الصور" value={String(data.photosCount ?? 0)} />
            {data.notes?.trim() && <DetailRow label="ملاحظات" value={data.notes} even />}
          </tbody>
        </table>

        {!isThermal && (
          <div style={{ marginTop: '20mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="فني الجودة" />
            <SignatureBlock label="مشرف الجودة" />
            <SignatureBlock label="مدير الجودة" />
          </div>
        )}

        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={reportLink}
                size={isThermal ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: '#94a3b8' }}>
                امسح رمز QR للرجوع إلى صفحة IPQC
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

SingleIPQCPrint.displayName = 'SingleIPQCPrint';

export interface SingleFinalInspectionPrintProps {
  data: SingleIPQCPrintData | null;
  printSettings?: PrintTemplateSettings;
}

export const SingleFinalInspectionPrint = React.forwardRef<HTMLDivElement, SingleFinalInspectionPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const now = new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

    const reportLink =
      typeof window !== 'undefined'
        ? `${window.location.origin}/quality/final-inspection`
        : `final|${data.workOrderNumber}|${data.date}|${data.statusLabel}`;

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
          color: palette.text,
          ['--print-text' as any]: palette.text,
          ['--print-muted-text' as any]: palette.mutedText,
          ['--print-border' as any]: palette.border,
          ['--print-th-bg' as any]: palette.tableHeaderBg,
          ['--print-th-text' as any]: palette.tableHeaderText,
          ['--print-row-alt' as any]: palette.tableRowAltBg,
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
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
            تقرير الفحص النهائي
          </h2>
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isThermal ? '7.5pt' : '10.5pt',
            marginBottom: isThermal ? '3mm' : '8mm',
          }}
        >
          <tbody>
            <DetailRow label="تاريخ الفحص" value={data.date} />
            <DetailRow label="رقم أمر الشغل" value={data.workOrderNumber} even />
            <DetailRow label="خط الإنتاج" value={data.lineName} />
            <DetailRow label="المنتج" value={data.productName} even />
            <DetailRow label="اسم الفاحص" value={data.inspectorName} />
            <DetailRow
              label="حالة الفحص"
              value={data.statusLabel}
              even
              highlight={data.statusLabel === 'Passed' || data.statusLabel === 'Approved' ? '#059669' : data.statusLabel === 'Rework' ? '#f59e0b' : '#f43f5e'}
            />
            {data.reasonLabel && <DetailRow label="سبب العيب" value={data.reasonLabel} />}
            <DetailRow label="عدد الصور" value={String(data.photosCount ?? 0)} even />
            {data.notes?.trim() && <DetailRow label="ملاحظات" value={data.notes} />}
          </tbody>
        </table>

        {!isThermal && (
          <div style={{ marginTop: '20mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="فني الجودة" />
            <SignatureBlock label="مشرف الجودة" />
            <SignatureBlock label="مدير الجودة" />
          </div>
        )}

        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={reportLink}
                size={isThermal ? 40 : 64}
                level="L"
              />
              <p style={{ margin: '1mm 0 0', fontSize: '6pt', color: '#94a3b8' }}>
                امسح رمز QR للرجوع إلى صفحة الفحص النهائي
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

SingleFinalInspectionPrint.displayName = 'SingleFinalInspectionPrint';

export interface QualityDefectPrintRow {
  reasonLabel: string;
  quantity: number;
  severity: string;
  status: string;
  serialBarcode?: string;
}

export interface QualityDefectsPrintProps {
  workOrderNumber?: string;
  rows: QualityDefectPrintRow[];
  generatedAt?: string;
  printSettings?: PrintTemplateSettings;
}

export const QualityDefectsPrint = React.forwardRef<HTMLDivElement, QualityDefectsPrintProps>(
  ({ workOrderNumber, rows, generatedAt, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

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
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
          <h1 style={{ margin: 0, fontSize: isThermal ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>{ps.headerText}</h1>
          <h2 style={{ margin: '2mm 0 0', fontSize: isThermal ? '9pt' : '14pt', fontWeight: 700, color: '#334155' }}>
            تقرير العيوب
          </h2>
          {workOrderNumber && (
            <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: '#64748b' }}>
              أمر الشغل: {workOrderNumber}
            </p>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isThermal ? '7pt' : '9.5pt' }}>
          <thead>
            <tr style={{ background: 'var(--print-th-bg, #f1f5f9)' }}>
              <Th>#</Th>
              <Th>السبب</Th>
              <Th align="center">الكمية</Th>
              <Th>الشدة</Th>
              <Th>الحالة</Th>
              <Th>Serial</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={6}>لا توجد عيوب مسجلة</Td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.reasonLabel}_${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : 'var(--print-row-alt, #f8fafc)' }}>
                  <Td>{idx + 1}</Td>
                  <Td>{row.reasonLabel}</Td>
                  <Td align="center" bold color={ps.primaryColor}>{String(row.quantity)}</Td>
                  <Td>{row.severity}</Td>
                  <Td>{row.status}</Td>
                  <Td>{row.serialBarcode || '—'}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p style={{ marginTop: '6mm', fontSize: isThermal ? '6pt' : '8pt', color: '#94a3b8', textAlign: 'center' }}>
          {ps.footerText} — {now}
        </p>
      </div>
    );
  },
);

QualityDefectsPrint.displayName = 'QualityDefectsPrint';

export interface ReworkPrintRow {
  workOrderNumber: string;
  lineName: string;
  productName: string;
  defectId: string;
  serialBarcode?: string;
  statusLabel: string;
}

export interface ReworkOrdersPrintProps {
  rows: ReworkPrintRow[];
  generatedAt?: string;
  printSettings?: PrintTemplateSettings;
}

export const ReworkOrdersPrint = React.forwardRef<HTMLDivElement, ReworkOrdersPrintProps>(
  ({ rows, generatedAt, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

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
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
          <h1 style={{ margin: 0, fontSize: isThermal ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>{ps.headerText}</h1>
          <h2 style={{ margin: '2mm 0 0', fontSize: isThermal ? '9pt' : '14pt', fontWeight: 700, color: '#334155' }}>
            تقرير أوامر إعادة التشغيل
          </h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isThermal ? '7pt' : '9.5pt' }}>
          <thead>
            <tr style={{ background: 'var(--print-th-bg, #f1f5f9)' }}>
              <Th>#</Th>
              <Th>أمر الشغل</Th>
              <Th>الخط</Th>
              <Th>المنتج</Th>
              <Th>Defect</Th>
              <Th>Serial</Th>
              <Th>الحالة</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={7}>لا توجد أوامر إعادة تشغيل</Td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.workOrderNumber}_${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : 'var(--print-row-alt, #f8fafc)' }}>
                  <Td>{idx + 1}</Td>
                  <Td>{row.workOrderNumber}</Td>
                  <Td>{row.lineName}</Td>
                  <Td>{row.productName}</Td>
                  <Td>{row.defectId}</Td>
                  <Td>{row.serialBarcode || '—'}</Td>
                  <Td bold color={row.statusLabel === 'مفتوح' ? '#f59e0b' : row.statusLabel === 'قيد التنفيذ' ? '#0ea5e9' : '#059669'}>{row.statusLabel}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p style={{ marginTop: '6mm', fontSize: isThermal ? '6pt' : '8pt', color: '#94a3b8', textAlign: 'center' }}>
          {ps.footerText} — {now}
        </p>
      </div>
    );
  },
);

ReworkOrdersPrint.displayName = 'ReworkOrdersPrint';

export interface CAPAPrintRow {
  title: string;
  reasonLabel: string;
  ownerName: string;
  statusLabel: string;
  dueDate?: string;
}

export interface SingleCAPAPrintProps {
  rows: CAPAPrintRow[];
  generatedAt?: string;
  printSettings?: PrintTemplateSettings;
}

export const SingleCAPAPrint = React.forwardRef<HTMLDivElement, SingleCAPAPrintProps>(
  ({ rows, generatedAt, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

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
            تقرير الإجراءات التصحيحية والوقائية (CAPA)
          </h2>
        </div>

        <div style={{ display: 'flex', gap: isThermal ? '2mm' : '4mm', marginBottom: isThermal ? '3mm' : '6mm', flexWrap: 'wrap' }}>
          <SummaryBox label="إجمالي الإجراءات" value={String(rows.length)} color={ps.primaryColor} small={isThermal} />
          <SummaryBox label="مفتوحة" value={String(rows.filter((r) => r.statusLabel === 'مفتوح').length)} color="#f59e0b" small={isThermal} />
          <SummaryBox label="قيد التنفيذ" value={String(rows.filter((r) => r.statusLabel === 'قيد التنفيذ').length)} color="#0ea5e9" small={isThermal} />
          <SummaryBox label="مغلقة/منتهية" value={String(rows.filter((r) => r.statusLabel === 'مغلق' || r.statusLabel === 'مكتمل').length)} color="#059669" small={isThermal} />
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isThermal ? '7pt' : '9.5pt',
            marginBottom: isThermal ? '3mm' : '8mm',
          }}
        >
          <thead>
            <tr style={{ background: 'var(--print-th-bg, #f1f5f9)' }}>
              <Th>#</Th>
              <Th>العنوان</Th>
              <Th>سبب العيب</Th>
              <Th>المسؤول</Th>
              <Th>الحالة</Th>
              <Th align="center">تاريخ الاستحقاق</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={6}>لا توجد سجلات CAPA</Td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.title}_${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : 'var(--print-row-alt, #f8fafc)' }}>
                  <Td>{idx + 1}</Td>
                  <Td>{row.title}</Td>
                  <Td>{row.reasonLabel}</Td>
                  <Td>{row.ownerName}</Td>
                  <Td bold color={row.statusLabel === 'مفتوح' ? '#f59e0b' : row.statusLabel === 'قيد التنفيذ' ? '#0ea5e9' : '#059669'}>
                    {row.statusLabel}
                  </Td>
                  <Td align="center">{row.dueDate || '—'}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!isThermal && (
          <div style={{ marginTop: '15mm', display: 'flex', justifyContent: 'space-between', gap: '20mm' }}>
            <SignatureBlock label="مسؤول الجودة" />
            <SignatureBlock label="مدير الجودة" />
            <SignatureBlock label="مدير المصنع" />
          </div>
        )}

        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          {ps.showQRCode && (
            <div style={{ marginBottom: '3mm' }}>
              <QRCodeSVG
                value={`quality-capa|count:${rows.length}|generated:${now}`}
                size={isThermal ? 40 : 64}
                level="L"
              />
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

SingleCAPAPrint.displayName = 'SingleCAPAPrint';

const DetailRow: React.FC<{
  label: string;
  value: string;
  even?: boolean;
  highlight?: string;
}> = ({ label, value, even, highlight }) => (
  <tr style={{ background: even ? 'var(--print-row-alt, #f8fafc)' : '#fff' }}>
    <td
      style={{
        padding: '3mm 4mm',
        fontWeight: 700,
        color: 'var(--print-muted-text, #475569)',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
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
        color: highlight || 'var(--print-text, #0f172a)',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        fontSize: highlight ? '12pt' : '10.5pt',
      }}
    >
      {value}
    </td>
  </tr>
);

const SummaryBox: React.FC<{ label: string; value: string; color: string; small?: boolean }> = ({ label, value, color, small }) => (
  <div style={{ flex: '1 1 0', minWidth: small ? '18mm' : '30mm', border: '1px solid var(--print-border, #e2e8f0)', borderRadius: '3mm', padding: small ? '1.5mm 2mm' : '3mm 4mm', textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: small ? '6pt' : '8pt', color: 'var(--print-muted-text, #64748b)', fontWeight: 600 }}>{label}</p>
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
      color: 'var(--print-th-text, #475569)',
      borderBottom: '2px solid var(--print-border, #cbd5e1)',
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
      color: color || 'var(--print-text, #334155)',
      borderBottom: '1px solid var(--print-border, #e2e8f0)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </td>
);

const SignatureBlock: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: '9pt', fontWeight: 700, color: 'var(--print-muted-text, #475569)' }}>{label}</p>
    <div style={{ marginTop: '12mm', borderBottom: '1px solid var(--print-border, #94a3b8)', width: '80%', marginLeft: 'auto', marginRight: 'auto' }} />
    <p style={{ margin: '2mm 0 0', fontSize: '8pt', color: 'var(--print-muted-text, #94a3b8)' }}>التوقيع / التاريخ</p>
  </div>
);

