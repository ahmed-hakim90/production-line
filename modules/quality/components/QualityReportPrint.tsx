import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintAccentHex } from '@/utils/printTheme';

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
  value.toLocaleString('ar-EG', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

export const QualityReportPrint = React.forwardRef<HTMLDivElement, QualityReportPrintProps>(
  ({ title, subtitle, generatedAt, workOrderNumber, summary, topDefects, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'qualityReport');
    const dp = ps.decimalPlaces;
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const showQr = doc.isFieldVisible('qrCode');

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مؤسسة المغربي'}
        documentType={title || 'تقرير الجودة'}
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : ps.paperSize === 'a5' ? '8mm 9mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'أمر الشغل', value: workOrderNumber || '—' },
                { label: 'التاريخ', value: now },
                { label: 'القسم', value: 'إدارة الجودة' },
                { label: 'الملخص', value: subtitle || title || '—' },
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'تم الفحص', value: summary.inspectedUnits, tone: 'indigo' as const },
                { label: 'ناجح', value: summary.passedUnits, tone: 'green' as const },
                { label: 'فاشل', value: summary.failedUnits, tone: 'red' as const },
                { label: 'إعادة تشغيل', value: summary.reworkUnits, tone: 'sky' as const },
                { label: 'معدل العيوب', value: `${fmtNum(summary.defectRate, dp)}%`, tone: 'red' as const },
                { label: 'FPY', value: `${fmtNum(summary.firstPassYield, dp)}%`, tone: 'indigo' as const },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [
                { title: 'مدير الجودة' },
                { title: 'مشرف الجودة' },
                { title: 'مدير الإنتاج' },
              ]
            : undefined
        }
      >
        {doc.isFieldVisible('defects') ? (
          <>
            <FactoryPrintSectionTitle title="أهم أسباب العيوب" accent={accent} />
            <FactoryPrintTable
              dense={isThermal}
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'reason', header: 'السبب', width: '70%' },
                { key: 'qty', header: 'الكمية', width: '30%', align: 'center' },
              ]}
              rows={
                topDefects.length === 0
                  ? [
                      {
                        key: 'empty',
                        cells: { reason: 'لا توجد عيوب مسجلة', qty: '—' },
                      },
                    ]
                  : topDefects.map((item, idx) => ({
                      key: `defect-${idx}`,
                      cells: {
                        reason: `${idx + 1}. ${item.reasonLabel}`,
                        qty: <strong>{fmtNum(item.quantity, 0)}</strong>,
                      },
                    }))
              }
            />
          </>
        ) : null}

        {showQr ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <FactoryPrintSectionTitle title="التحقق" accent={accent} />
            <QRCodeSVG
              value={`quality-kpi|${workOrderNumber || 'snapshot'}|inspected:${summary.inspectedUnits}|failed:${summary.failedUnits}`}
              size={64}
              level="L"
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>
              رمز QR للتحقق من صحة تقرير الجودة
            </span>
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

QualityReportPrint.displayName = 'QualityReportPrint';

const inspectionStatusColor = (statusLabel: string) =>
  statusLabel === 'Passed' || statusLabel === 'Approved'
    ? '#059669'
    : statusLabel === 'Rework'
      ? '#f59e0b'
      : '#f43f5e';

const reworkStatusColor = (statusLabel: string) =>
  statusLabel === 'مفتوح' ? '#f59e0b' : statusLabel === 'قيد التنفيذ' ? '#0ea5e9' : '#059669';

function PrintDetailGrid({
  rows,
  isThermal,
}: {
  rows: Array<{ label: string; value: string; color?: string }>;
  isThermal: boolean;
}) {
  return (
    <div
      className={`mb-4 grid overflow-hidden rounded-lg border border-slate-200 ${
        isThermal ? 'grid-cols-1' : 'grid-cols-2'
      }`}
    >
      {rows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          className={`border-b border-slate-100 px-3 py-2.5 ${
            index % 2 === 0 ? 'bg-slate-50' : 'bg-white'
          } ${!isThermal && index % 2 === 0 ? 'border-l border-slate-200' : ''}`}
        >
          <p className="text-[10px] font-bold text-slate-500">{row.label}</p>
          <p
            className="mt-1 text-[13px] font-extrabold text-slate-900"
            style={row.color ? { color: row.color } : undefined}
          >
            {row.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function PrintQrBlock({
  value,
  caption,
  isThermal,
}: {
  value: string;
  caption?: string;
  isThermal: boolean;
}) {
  return (
    <div className="mb-2 flex flex-col items-center gap-1 py-2">
      <QRCodeSVG value={value} size={isThermal ? 40 : 64} level="L" />
      {caption ? (
        <p className="text-center text-[10px] font-bold text-slate-500">{caption}</p>
      ) : null}
    </div>
  );
}

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
    const font = resolvePrintFont(ps);
    const now = new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);

    const reportLink =
      typeof window !== 'undefined'
        ? `${window.location.origin}/quality/ipqc`
        : `ipqc|${data.workOrderNumber}|${data.date}|${data.statusLabel}`;

    const detailRows = [
      { label: 'تاريخ الفحص', value: data.date },
      { label: 'رقم أمر الشغل', value: data.workOrderNumber },
      { label: 'خط الإنتاج', value: data.lineName },
      { label: 'المنتج', value: data.productName },
      { label: 'اسم الفاحص', value: data.inspectorName },
      {
        label: 'حالة الفحص',
        value: data.statusLabel,
        color: inspectionStatusColor(data.statusLabel),
      },
      ...(data.serialBarcode ? [{ label: 'Serial', value: data.serialBarcode }] : []),
      ...(data.reasonLabel ? [{ label: 'سبب العيب', value: data.reasonLabel }] : []),
      { label: 'عدد الصور', value: String(data.photosCount ?? 0) },
      ...(data.notes?.trim() ? [{ label: 'ملاحظات', value: data.notes }] : []),
    ];

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي'}
        documentType="تقرير فحص IPQC"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'أمر الشغل', value: data.workOrderNumber || '—' },
          { label: 'تاريخ الفحص', value: data.date || '—' },
          { label: 'خط الإنتاج', value: data.lineName || '—' },
          { label: 'الفاحص', value: data.inspectorName || '—' },
        ]}
        signatures={
          isThermal
            ? undefined
            : [{ title: 'فني الجودة' }, { title: 'مشرف الجودة' }, { title: 'مدير الجودة' }]
        }
      >
        <PrintDetailGrid rows={detailRows} isThermal={isThermal} />
        {ps.showQRCode ? (
          <PrintQrBlock
            value={reportLink}
            caption="امسح رمز QR للرجوع إلى صفحة IPQC"
            isThermal={isThermal}
          />
        ) : null}
      </FactoryPrintShell>
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
    const font = resolvePrintFont(ps);
    const now = new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);

    const reportLink =
      typeof window !== 'undefined'
        ? `${window.location.origin}/quality/final-inspection`
        : `final|${data.workOrderNumber}|${data.date}|${data.statusLabel}`;

    const detailRows = [
      { label: 'تاريخ الفحص', value: data.date },
      { label: 'رقم أمر الشغل', value: data.workOrderNumber },
      { label: 'خط الإنتاج', value: data.lineName },
      { label: 'المنتج', value: data.productName },
      { label: 'اسم الفاحص', value: data.inspectorName },
      {
        label: 'حالة الفحص',
        value: data.statusLabel,
        color: inspectionStatusColor(data.statusLabel),
      },
      ...(data.reasonLabel ? [{ label: 'سبب العيب', value: data.reasonLabel }] : []),
      { label: 'عدد الصور', value: String(data.photosCount ?? 0) },
      ...(data.notes?.trim() ? [{ label: 'ملاحظات', value: data.notes }] : []),
    ];

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي'}
        documentType="تقرير الفحص النهائي"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'أمر الشغل', value: data.workOrderNumber || '—' },
          { label: 'تاريخ الفحص', value: data.date || '—' },
          { label: 'خط الإنتاج', value: data.lineName || '—' },
          { label: 'الفاحص', value: data.inspectorName || '—' },
        ]}
        signatures={
          isThermal
            ? undefined
            : [{ title: 'فني الجودة' }, { title: 'مشرف الجودة' }, { title: 'مدير الجودة' }]
        }
      >
        <PrintDetailGrid rows={detailRows} isThermal={isThermal} />
        {ps.showQRCode ? (
          <PrintQrBlock
            value={reportLink}
            caption="امسح رمز QR للرجوع إلى صفحة الفحص النهائي"
            isThermal={isThermal}
          />
        ) : null}
      </FactoryPrintShell>
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
    const font = resolvePrintFont(ps);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي'}
        documentType="تقرير العيوب"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'أمر الشغل', value: workOrderNumber || '—' },
          { label: 'تاريخ الطباعة', value: now },
          { label: 'عدد العيوب', value: String(rows.length) },
          { label: 'القسم', value: 'إدارة الجودة' },
        ]}
      >
        <section className="mb-2">
          <FactoryPrintSectionTitle title="سجل العيوب" accent={accent} />
          <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '8%' }}>
                  #
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '28%' }}>
                  السبب
                </th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '12%' }}>
                  الكمية
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '16%' }}>
                  الشدة
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '16%' }}>
                  الحالة
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '20%' }}>
                  Serial
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-slate-200 px-2 py-3 text-center text-[12px] font-bold text-slate-500"
                  >
                    لا توجد عيوب مسجلة
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={`${row.reasonLabel}_${idx}`}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                  >
                    <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                      {row.reasonLabel}
                    </td>
                    <td
                      className="border border-slate-200 px-2 py-2 text-center text-[13px] font-black tabular-nums"
                      style={{ color: accent }}
                    >
                      {String(row.quantity)}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold text-slate-700">
                      {row.severity}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold text-slate-700">
                      {row.status}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700">
                      {row.serialBarcode || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </FactoryPrintShell>
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
    const font = resolvePrintFont(ps);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي'}
        documentType="تقرير أوامر إعادة التشغيل"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'تاريخ الطباعة', value: now },
          { label: 'عدد الأوامر', value: String(rows.length) },
          { label: 'القسم', value: 'إدارة الجودة' },
          { label: 'النوع', value: 'إعادة تشغيل' },
        ]}
      >
        <section className="mb-2">
          <FactoryPrintSectionTitle title="أوامر إعادة التشغيل" accent={accent} />
          <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '7%' }}>
                  #
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '16%' }}>
                  أمر الشغل
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '14%' }}>
                  الخط
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '20%' }}>
                  المنتج
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '14%' }}>
                  Defect
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '15%' }}>
                  Serial
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '14%' }}>
                  الحالة
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-slate-200 px-2 py-3 text-center text-[12px] font-bold text-slate-500"
                  >
                    لا توجد أوامر إعادة تشغيل
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={`${row.workOrderNumber}_${idx}`}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                  >
                    <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                      {row.workOrderNumber}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700">
                      {row.lineName}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                      {row.productName}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700">
                      {row.defectId}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700">
                      {row.serialBarcode || '—'}
                    </td>
                    <td
                      className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold"
                      style={{ color: reworkStatusColor(row.statusLabel) }}
                    >
                      {row.statusLabel}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </FactoryPrintShell>
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
    const font = resolvePrintFont(ps);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);

    const openCount = rows.filter((r) => r.statusLabel === 'مفتوح').length;
    const inProgressCount = rows.filter((r) => r.statusLabel === 'قيد التنفيذ').length;
    const closedCount = rows.filter(
      (r) => r.statusLabel === 'مغلق' || r.statusLabel === 'مكتمل',
    ).length;

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي'}
        documentType="تقرير الإجراءات التصحيحية والوقائية (CAPA)"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'تاريخ الطباعة', value: now },
          { label: 'القسم', value: 'إدارة الجودة' },
          { label: 'النوع', value: 'CAPA' },
          { label: 'إجمالي الإجراءات', value: String(rows.length) },
        ]}
        kpis={[
          { label: 'إجمالي الإجراءات', value: rows.length, tone: 'indigo' },
          { label: 'مفتوحة', value: openCount, tone: 'sky' },
          { label: 'قيد التنفيذ', value: inProgressCount, tone: 'default' },
          { label: 'مغلقة/منتهية', value: closedCount, tone: 'green' },
        ]}
        signatures={
          isThermal
            ? undefined
            : [{ title: 'مسؤول الجودة' }, { title: 'مدير الجودة' }, { title: 'مدير المصنع' }]
        }
      >
        <section className="mb-4">
          <FactoryPrintSectionTitle title="سجل إجراءات CAPA" accent={accent} />
          <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '7%' }}>
                  #
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '24%' }}>
                  العنوان
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '20%' }}>
                  سبب العيب
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '16%' }}>
                  المسؤول
                </th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '15%' }}>
                  الحالة
                </th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '18%' }}>
                  تاريخ الاستحقاق
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-slate-200 px-2 py-3 text-center text-[12px] font-bold text-slate-500"
                  >
                    لا توجد سجلات CAPA
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={`${row.title}_${idx}`}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                  >
                    <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                      {row.title}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700">
                      {row.reasonLabel}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700">
                      {row.ownerName}
                    </td>
                    <td
                      className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold"
                      style={{ color: reworkStatusColor(row.statusLabel) }}
                    >
                      {row.statusLabel}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-slate-700">
                      {row.dueDate || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {ps.showQRCode ? (
          <PrintQrBlock
            value={`quality-capa|count:${rows.length}|generated:${now}`}
            isThermal={isThermal}
          />
        ) : null}
      </FactoryPrintShell>
    );
  },
);

SingleCAPAPrint.displayName = 'SingleCAPAPrint';
