import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import type { SuppliesReceiptOrder } from '../types';

export interface SuppliesReceiptPrintProps {
  order: SuppliesReceiptOrder | null;
  printSettings?: PrintTemplateSettings;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  executed: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

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

export const SuppliesReceiptPrint = React.forwardRef<HTMLDivElement, SuppliesReceiptPrintProps>(
  ({ order, printSettings }, ref) => {
    if (!order) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const groups = order.groups || [];
    const standalone = order.standaloneLines || [];
    const totalLines =
      groups.reduce((sum, g) => sum + (g.lines || []).length, 0) + standalone.length;
    const totalQty =
      groups.reduce(
        (sum, g) => sum + (g.lines || []).reduce((s, l) => s + Number(l.quantity || 0), 0),
        0,
      ) + standalone.reduce((s, l) => s + Number(l.quantity || 0), 0);
    const createdAt = order.createdAt
      ? new Date(order.createdAt).toLocaleString('ar-EG')
      : '—';

    const thStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: '2.5mm 2mm',
      fontSize: isThermal ? '7pt' : '10pt',
      background: palette.tableHeaderBg,
      color: palette.tableHeaderText,
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: '2.5mm 2mm',
      fontSize: isThermal ? '7pt' : '10pt',
    };

    const renderLinesTable = (
      lines: Array<{
        itemCode: string;
        itemName: string;
        unit: string;
        quantity: number;
        suggestedQty?: number;
        locationCode: string;
      }>,
    ) => (
      <table className="erp-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: isThermal ? '3mm' : '6mm' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '8%' }}>م</th>
            <th style={{ ...thStyle, width: '18%' }}>الكود</th>
            <th style={{ ...thStyle, width: '34%' }}>المكون</th>
            <th style={{ ...thStyle, width: '12%' }}>الوحدة</th>
            <th style={{ ...thStyle, width: '14%' }}>الكمية</th>
            <th style={{ ...thStyle, width: '14%' }}>اللوكيشن</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.itemCode}-${index}`} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{index + 1}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{line.itemCode || '—'}</td>
              <td style={tdStyle}>
                {line.itemName}
                {line.suggestedQty != null && Number(line.suggestedQty) !== Number(line.quantity) && (
                  <div style={{ fontSize: '8pt', color: palette.mutedText, fontWeight: 700 }}>
                    مقترح BOM: {Number(line.suggestedQty).toLocaleString('en-US')}
                  </div>
                )}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{line.unit || '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                {Number(line.quantity || 0).toLocaleString('en-US')}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{line.locationCode || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

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
          ['--print-text' as string]: palette.text,
          ['--print-muted-text' as string]: palette.mutedText,
          ['--print-border' as string]: palette.border,
          ['--print-row-alt' as string]: palette.tableRowAltBg,
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
            مستند استلام مستلزمات
          </p>
        </div>

        <table className="erp-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '8mm' }}>
          <tbody>
            {summaryPairRow('رقم المستند', order.referenceNo, 'التاريخ', createdAt)}
            {summaryPairRow('المخزن', order.warehouseName || order.warehouseId, 'الحالة', STATUS_LABELS[order.status] || order.status, true)}
            {summaryPairRow('مرجع الحاوية', order.containerRef || '—', 'المنشئ', order.createdBy || '—')}
            {summaryPairRow('المعتمد', order.approvedBy || '—', 'المنفّذ', order.executedBy || '—', true)}
            {summaryPairRow('عدد الأسطر', totalLines.toLocaleString('en-US'), 'إجمالي الكميات', totalQty.toLocaleString('en-US'))}
            {order.note ? summaryPairRow('ملاحظة', order.note, '', '', true) : null}
          </tbody>
        </table>

        {groups.map((group, gIndex) => (
          <div key={`${group.productId}-${gIndex}`} style={{ marginBottom: isThermal ? '4mm' : '8mm' }}>
            <h2 style={{ margin: 0, marginBottom: '3mm', fontSize: isThermal ? '9pt' : '12pt', fontWeight: 900, color: '#0f172a' }}>
              منتج مفكك: {group.productName}
              {group.productCode ? ` (${group.productCode})` : ''}
              {' — '}
              الكمية: {Number(group.quantity || 0).toLocaleString('en-US')}
            </h2>
            {group.lines?.length ? renderLinesTable(group.lines) : (
              <div style={{ border: `1px solid ${palette.border}`, borderRadius: '6px', padding: '4mm', color: palette.mutedText, fontWeight: 700 }}>
                لا توجد مكونات لهذه المجموعة.
              </div>
            )}
          </div>
        ))}

        {standalone.length > 0 && (
          <div style={{ marginBottom: isThermal ? '4mm' : '8mm' }}>
            <h2 style={{ margin: 0, marginBottom: '3mm', fontSize: isThermal ? '9pt' : '12pt', fontWeight: 900, color: '#0f172a' }}>
              مكونات مستقلة
            </h2>
            {renderLinesTable(standalone)}
          </div>
        )}

        {groups.length === 0 && standalone.length === 0 && (
          <div style={{ border: `1px solid ${palette.border}`, borderRadius: '6px', padding: '4mm', color: palette.mutedText, fontWeight: 700 }}>
            لا توجد أصناف في هذا المستند.
          </div>
        )}

        <div style={{ marginTop: isThermal ? '6mm' : '12mm', display: 'flex', justifyContent: 'space-between', gap: '8mm' }}>
          {['المستلم', 'المعتمد', 'المخازن'].map((title) => (
            <div key={title} style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 900, color: palette.mutedText }}>{title}</p>
              <div style={{ marginTop: '12mm', borderTop: `1px solid ${palette.border}` }} />
            </div>
          ))}
        </div>
      </div>
    );
  },
);

SuppliesReceiptPrint.displayName = 'SuppliesReceiptPrint';
