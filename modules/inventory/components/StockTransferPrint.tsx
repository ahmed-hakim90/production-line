import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { PrintReportLayout } from '@/src/components/erp/PrintReportLayout';
import { Factory_IMAGE_PRIMARY, Factory_TRANSFER_FOOTER_TAGLINE } from '@/utils/imageExportTheme';

export interface StockTransferPrintData {
  transferNo: string;
  createdAt: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  items?: Array<{
    itemName: string;
    itemCode: string;
    unitLabel: string;
    quantity: number;
    quantityPieces: number;
    unitsPerCarton?: number;
  }>;
  itemName?: string;
  itemCode?: string;
  quantityPieces?: number;
  quantityCartons?: number;
  unitsPerCarton?: number;
  note?: string;
  createdBy: string;
}

export interface StockTransferPrintProps {
  data: StockTransferPrintData | null;
  printSettings?: PrintTemplateSettings;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const detailRow = (label: string, value: string, even?: boolean) => (
  <tr style={{ background: even ? 'var(--print-row-alt, #f8fafc)' : '#ffffff' }}>
    <td style={{ padding: '3mm 4mm', width: '35%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {label}
    </td>
    <td style={{ padding: '3mm 4mm', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-text, #0f172a)', fontWeight: 700 }}>
      {value}
    </td>
  </tr>
);

const summaryPairRow = (
  leftLabel: string,
  leftValue: string,
  rightLabel?: string,
  rightValue?: string,
  even?: boolean,
) => (
  <tr style={{ background: even ? 'var(--print-row-alt, #f8fafc)' : '#ffffff' }}>
    <td style={{ padding: '3mm 4mm', width: '18%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {leftLabel}
    </td>
    <td style={{ padding: '3mm 4mm', width: '32%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-text, #0f172a)', fontWeight: 700 }}>
      {leftValue}
    </td>
    <td style={{ padding: '3mm 4mm', width: '18%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {rightLabel || ''}
    </td>
    <td style={{ padding: '3mm 4mm', width: '32%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-text, #0f172a)', fontWeight: 700 }}>
      {rightValue || ''}
    </td>
  </tr>
);

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const printedAt = new Date().toLocaleString('ar-EG');
    const transferItems = data.items && data.items.length > 0
      ? data.items
      : (data.itemName
        ? [{
            itemName: data.itemName,
            itemCode: data.itemCode || '—',
            unitLabel: data.quantityCartons != null ? 'كرتونة' : 'قطعة',
            quantity: data.quantityCartons ?? data.quantityPieces ?? 0,
            quantityPieces: data.quantityPieces ?? 0,
            unitsPerCarton: data.unitsPerCarton,
          }]
        : []);
    const totalPieces = transferItems.reduce((sum, item) => sum + Number(item.quantityPieces || 0), 0);
    const totalCartons = transferItems
      .filter((item) => item.unitLabel === 'كرتونة')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalLoosePieces = transferItems
      .filter((item) => item.unitLabel === 'قطعة')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const hasLoosePieces = totalLoosePieces > 0;
    const movementDate = new Date(data.createdAt).toLocaleDateString('ar-EG');
    const transferTitle = `إذن تحويل ${data.fromWarehouseName || 'مخزني'}`;

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
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
          {ps.logoUrl && (
            <img src={ps.logoUrl} alt="logo" style={{ maxHeight: isThermal ? '12mm' : '20mm', marginBottom: '2mm', objectFit: 'contain' }} />
          )}
          <h1 style={{ margin: 0, fontSize: isThermal ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>
            {ps.headerText}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '10pt' : '18pt', fontWeight: 900, color: palette.mutedText }}>
            {transferTitle}
          </p>
        </div>

        <table className="erp-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '8mm' }}>
          <tbody>
            {summaryPairRow('رقم التحويلة', data.transferNo, 'تاريخ الحركة', movementDate)}
            {summaryPairRow('من المخزن', data.fromWarehouseName, 'إلى المخزن', data.toWarehouseName, true)}
            {summaryPairRow('عدد الأصناف', transferItems.length.toLocaleString('en-US'), 'المنفذ', data.createdBy)}
            {summaryPairRow('إجمالي الكراتين', totalCartons.toLocaleString('en-US'), hasLoosePieces ? 'إجمالي القطع' : '', hasLoosePieces ? totalLoosePieces.toLocaleString('en-US') : '', true)}
          </tbody>
        </table>

        <div style={{ marginBottom: isThermal ? '4mm' : '8mm' }}>
          <h2 style={{ margin: 0, marginBottom: '3mm', fontSize: isThermal ? '9pt' : '12pt', fontWeight: 900, color: '#0f172a' }}>
            تفاصيل الأصناف
          </h2>
          {transferItems.length === 0 ? (
            <div style={{ border: `1px solid ${palette.border}`, borderRadius: '6px', padding: '4mm', color: palette.mutedText, fontWeight: 700 }}>
              لا توجد أصناف في هذه التحويلة.
            </div>
          ) : (
            <table className="erp-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: palette.tableHeaderBg, color: palette.tableHeaderText }}>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '20%' }}>كود الصنف</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '8%' }}>م</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '34%' }}>المنتج</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '14%' }}>الوحدة</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '24%' }}>الكمية</th>
                </tr>
              </thead>
              <tbody>
                {transferItems.map((item, idx) => (
                  <tr key={`${item.itemCode}-${idx}`} style={{ pageBreakInside: 'avoid', background: idx % 2 === 0 ? '#fff' : palette.tableRowAltBg }}>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontFamily: 'monospace' }}>{item.itemCode || '—'}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontWeight: 700 }}>{item.itemName}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', textAlign: 'center' }}>{item.unitLabel}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', textAlign: 'center', fontWeight: 700 }}>
                      {Number(item.quantity || 0).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: `1px solid ${palette.border}`, paddingTop: '3mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText }}>
            {ps.footerText} — طباعة: {printedAt}
          </p>
        </div>
      </div>
    );
  },
);

StockTransferPrint.displayName = 'StockTransferPrint';

// ─── Share Card — same layout as production report (PrintReportLayout) ─────

export interface StockTransferShareCardProps {
  data: StockTransferPrintData | null;
  companyName?: string;
  version?: string;
  exportRootId?: string;
}

export const StockTransferShareCard = React.forwardRef<HTMLDivElement, StockTransferShareCardProps>(
  ({ data, companyName = 'مؤسسة المغربي للإستيراد', version = 'v4.0.57', exportRootId = 'stock-transfer-share-root' }, ref) => {
    if (!data) return <div ref={ref} />;

    const transferItems =
      data.items && data.items.length > 0
        ? data.items
        : data.itemName
          ? [
              {
                itemName: data.itemName,
                itemCode: data.itemCode || '—',
                unitLabel: data.quantityCartons != null ? 'كرتونة' : 'قطعة',
                quantity: data.quantityCartons ?? data.quantityPieces ?? 0,
                quantityPieces: data.quantityPieces ?? 0,
                unitsPerCarton: data.unitsPerCarton,
              },
            ]
          : [];

    const totalCartons = transferItems
      .filter((i) => i.unitLabel === 'كرتونة')
      .reduce((s, i) => s + Number(i.quantity || 0), 0);

    const totalPieces = transferItems.reduce((s, i) => s + Number(i.quantityPieces || 0), 0);

    let movementDate: string;
    try {
      movementDate = new Date(data.createdAt).toLocaleDateString('ar-EG');
    } catch {
      movementDate = data.createdAt;
    }

    const printNow = new Date().toLocaleString('ar-EG');

    const formatQty = (value: number) => Number(value || 0).toLocaleString('ar-EG');
    const transferRoute = (
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[9px] font-bold text-slate-400">من المخزن</p>
          <p className="mt-1 text-[13px] font-black text-slate-900 leading-snug">{data.fromWarehouseName || '—'}</p>
        </div>
        <div className="flex items-center justify-center px-1">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#EDEEF8] text-[16px] font-black text-[#4A55A2]">←</span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[9px] font-bold text-slate-400">إلى المخزن</p>
          <p className="mt-1 text-[13px] font-black text-slate-900 leading-snug">{data.toWarehouseName || '—'}</p>
        </div>
      </div>
    );
    const itemsTable = transferItems.length > 0 ? (
      <table className="w-full border-collapse overflow-hidden rounded-lg text-right">
        <thead>
          <tr className="bg-slate-100 text-[10px] font-bold text-slate-500">
            <th className="border border-slate-200 px-2 py-1.5 text-center w-9">#</th>
            <th className="border border-slate-200 px-2 py-1.5">الصنف</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center w-20">الوحدة</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center w-24">الكمية</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center w-24">قطع</th>
          </tr>
        </thead>
        <tbody>
          {transferItems.map((item, idx) => (
            <tr key={`${item.itemCode}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] font-bold text-slate-500">{idx + 1}</td>
              <td className="border border-slate-200 px-2 py-1.5">
                <p className="text-[12px] font-black leading-snug text-slate-900">{item.itemName}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{item.itemCode || '—'}</p>
              </td>
              <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] font-bold text-slate-700">
                {item.unitsPerCarton ? `${item.unitLabel} / ${item.unitsPerCarton}` : item.unitLabel}
              </td>
              <td className="border border-slate-200 px-2 py-1.5 text-center text-[12px] font-black text-[#4A55A2]">
                {formatQty(Number(item.quantity || 0))}
              </td>
              <td className="border border-slate-200 px-2 py-1.5 text-center text-[12px] font-black text-slate-900">
                {formatQty(Number(item.quantityPieces || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
        لا توجد أصناف في هذه التحويلة.
      </div>
    );

    return (
      <PrintReportLayout
        ref={ref}
        exportRootId={exportRootId}
        companyName={companyName}
        reportType="إذن تحويل مخزون"
        printDate={printNow}
        brandAccent={Factory_IMAGE_PRIMARY}
        footerTagline={Factory_TRANSFER_FOOTER_TAGLINE}
        version={version}
        meta={{
          reportNumber: data.transferNo,
          reportDate: movementDate,
          lineName: data.fromWarehouseName || '—',
          supervisorName: data.createdBy || '—',
        }}
        metaCards={[
          { label: 'رقم التحويل', value: data.transferNo },
          { label: 'تاريخ الحركة', value: movementDate },
          { label: 'من المخزن', value: data.fromWarehouseName || '—' },
          { label: 'إلى المخزن', value: data.toWarehouseName || '—' },
        ]}
        kpis={[
          { label: 'إجمالي الكراتين', value: totalCartons, color: 'indigo' },
          { label: 'إجمالي القطع', value: totalPieces, color: 'default' },
          { label: 'عدد الأصناف', value: transferItems.length, color: 'default' },
          { label: 'الحالة', value: 'للاعتماد', color: 'green' },
        ]}
        sections={[
          {
            title: 'بيانات التحويل',
            rows: [
              { label: 'مسار التحويل', value: transferRoute, fullWidth: true },
              { label: 'المنفذ', value: data.createdBy || '—' },
              ...(data.note?.trim() ? [{ label: 'ملاحظة', value: data.note }] : []),
            ],
          },
          {
            title: 'تفاصيل الأصناف',
            rows: [{ label: 'الأصناف', value: itemsTable, fullWidth: true }],
          },
        ]}
      />
    );
  },
);

StockTransferShareCard.displayName = 'StockTransferShareCard';

