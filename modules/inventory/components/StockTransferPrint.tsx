import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';

export interface StockTransferPrintData {
  transferNo: string;
  createdAt: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  itemName: string;
  itemCode: string;
  quantityPieces: number;
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

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const printedAt = new Date().toLocaleString('ar-EG');

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
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '8pt' : '12pt', fontWeight: 800, color: '#334155' }}>
            إذن تحويل مخزني
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '8mm' }}>
          <tbody>
            {detailRow('رقم التحويلة', data.transferNo)}
            {detailRow('تاريخ الحركة', new Date(data.createdAt).toLocaleString('ar-EG'), true)}
            {detailRow('من المخزن', data.fromWarehouseName)}
            {detailRow('إلى المخزن', data.toWarehouseName, true)}
            {detailRow('الصنف', `${data.itemName} (${data.itemCode})`)}
            {detailRow('الكمية (قطعة)', data.quantityPieces.toLocaleString('en-US'), true)}
            {detailRow('الكمية (كرتونة)', data.quantityCartons != null ? data.quantityCartons.toLocaleString('en-US') : '—')}
            {detailRow('الوحدات/كرتونة', data.unitsPerCarton != null ? data.unitsPerCarton.toLocaleString('en-US') : '—', true)}
            {detailRow('المنفذ', data.createdBy)}
            {detailRow('الملاحظة', data.note?.trim() || '—', true)}
          </tbody>
        </table>

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

