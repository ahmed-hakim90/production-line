import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';

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
  <tr style={{ background: even ? '#f8fafc' : '#ffffff' }}>
    <td style={{ padding: '3mm 4mm', width: '35%', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
      {label}
    </td>
    <td style={{ padding: '3mm 4mm', borderBottom: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 700 }}>
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
  <tr style={{ background: even ? '#f8fafc' : '#ffffff' }}>
    <td style={{ padding: '3mm 4mm', width: '18%', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
      {leftLabel}
    </td>
    <td style={{ padding: '3mm 4mm', width: '32%', borderBottom: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 700 }}>
      {leftValue}
    </td>
    <td style={{ padding: '3mm 4mm', width: '18%', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
      {rightLabel || ''}
    </td>
    <td style={{ padding: '3mm 4mm', width: '32%', borderBottom: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 700 }}>
      {rightValue || ''}
    </td>
  </tr>
);

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
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
          color: '#1e293b',
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
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '10pt' : '18pt', fontWeight: 900, color: '#334155' }}>
            {transferTitle}
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '8mm' }}>
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
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4mm', color: '#64748b', fontWeight: 700 }}>
              لا توجد أصناف في هذه التحويلة.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '20%' }}>كود الصنف</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '8%' }}>م</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '34%' }}>المنتج</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '14%' }}>الوحدة</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '24%' }}>الكمية</th>
                </tr>
              </thead>
              <tbody>
                {transferItems.map((item, idx) => (
                  <tr key={`${item.itemCode}-${idx}`} style={{ pageBreakInside: 'avoid' }}>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontFamily: 'monospace' }}>{item.itemCode || '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', fontWeight: 700 }}>{item.itemName}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', textAlign: 'center' }}>{item.unitLabel}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2.5mm 2mm', textAlign: 'center', fontWeight: 700 }}>
                      {Number(item.quantity || 0).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: '1px solid #e2e8f0', paddingTop: '3mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: '#94a3b8' }}>
            {ps.footerText} — طباعة: {printedAt}
          </p>
        </div>
      </div>
    );
  },
);

StockTransferPrint.displayName = 'StockTransferPrint';

