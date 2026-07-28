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
    const printedAt = new Date().toLocaleString('ar-EG');
    const supplyOrderNo = order.containerRef?.trim() || '';
    const statusLabel = STATUS_LABELS[order.status] || order.status;

    const thStyle: React.CSSProperties = {
      border: `1px solid ${ps.primaryColor}`,
      padding: isThermal ? '1.5mm 1mm' : '3mm 2mm',
      fontSize: isThermal ? '7pt' : '10pt',
      background: ps.primaryColor,
      color: '#ffffff',
      fontWeight: 900,
      textAlign: 'center',
      whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      fontSize: isThermal ? '7pt' : '10pt',
      color: palette.text,
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
      <table
        className="erp-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          marginBottom: isThermal ? '3mm' : '6mm',
          border: `1.5px solid ${ps.primaryColor}`,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '8%' }}>م</th>
            <th style={{ ...thStyle, width: '16%' }}>كود الصنف</th>
            <th style={{ ...thStyle, width: '36%' }}>اسم المكون</th>
            <th style={{ ...thStyle, width: '12%' }}>الوحدة</th>
            <th style={{ ...thStyle, width: '14%' }}>الكمية</th>
            <th style={{ ...thStyle, width: '14%' }}>اللوكيشن</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.itemCode}-${index}`} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
              <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{index + 1}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'center' }}>{line.itemCode || '—'}</td>
              <td style={{ ...tdStyle, fontWeight: 700 }}>
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
        {/* Document header */}
        <div
          style={{
            marginBottom: isThermal ? '3mm' : '7mm',
            border: `2px solid ${ps.primaryColor}`,
            borderRadius: isThermal ? '2mm' : '3mm',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4mm',
              padding: isThermal ? '3mm' : '5mm 6mm',
              background: '#fff',
              borderBottom: `3px solid ${ps.primaryColor}`,
            }}
          >
            <div style={{ flex: 1, textAlign: 'right' }}>
              {ps.logoUrl && (
                <img
                  src={ps.logoUrl}
                  alt="logo"
                  style={{ maxHeight: isThermal ? '10mm' : '16mm', objectFit: 'contain', display: 'block', marginBottom: '1.5mm' }}
                />
              )}
              <h1 style={{ margin: 0, fontSize: isThermal ? '11pt' : '16pt', fontWeight: 900, color: ps.primaryColor }}>
                {ps.headerText}
              </h1>
            </div>
            <div style={{ textAlign: 'center', flex: 1.2 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: isThermal ? '9pt' : '14pt',
                  fontWeight: 900,
                  color: '#0f172a',
                  letterSpacing: '0.02em',
                }}
              >
                إذن استلام مستلزمات
              </p>
              <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 700, color: palette.mutedText }}>
                {order.warehouseName || order.warehouseId}
              </p>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: isThermal ? '1.5mm 2mm' : '2.5mm 3.5mm',
                  borderRadius: '2mm',
                  background: ps.primaryColor,
                  color: '#fff',
                  textAlign: 'center',
                  minWidth: isThermal ? '22mm' : '32mm',
                }}
              >
                <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', fontWeight: 700, opacity: 0.9 }}>رقم الإذن</p>
                <p style={{ margin: '0.5mm 0 0', fontSize: isThermal ? '8pt' : '11pt', fontWeight: 900, fontFamily: 'monospace' }}>
                  {order.referenceNo}
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: supplyOrderNo ? '1.2fr 1fr 1fr 0.9fr' : '1.2fr 1fr 1fr',
              gap: 0,
              background: palette.tableRowAltBg,
            }}
          >
            {[
              { label: 'التاريخ', value: createdAt },
              ...(supplyOrderNo
                ? [{ label: 'رقم أمر التوريد', value: supplyOrderNo }]
                : []),
              { label: 'الحالة', value: statusLabel },
              { label: 'عدد الأسطر', value: totalLines.toLocaleString('en-US') },
            ].map((cell, idx, arr) => (
              <div
                key={cell.label}
                style={{
                  padding: isThermal ? '2mm' : '3mm 4mm',
                  borderLeft: idx < arr.length - 1 ? `1px solid ${palette.border}` : undefined,
                }}
              >
                <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', fontWeight: 700, color: palette.mutedText }}>
                  {cell.label}
                </p>
                <p
                  style={{
                    margin: '0.5mm 0 0',
                    fontSize: isThermal ? '8pt' : '11pt',
                    fontWeight: 900,
                    color: palette.text,
                    fontFamily: cell.label.includes('أمر') || cell.label === 'عدد الأسطر' ? 'monospace' : undefined,
                  }}
                >
                  {cell.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {!order.id && (
          <div
            style={{
              marginBottom: isThermal ? '3mm' : '5mm',
              padding: '2.5mm 3.5mm',
              border: `1px dashed ${palette.border}`,
              borderRadius: '2mm',
              color: palette.mutedText,
              fontWeight: 800,
              fontSize: isThermal ? '7pt' : '9pt',
              background: '#fffbeb',
            }}
          >
            طباعة قبل الحفظ — لم يُسجَّل الإذن بعد
          </div>
        )}

        <table className="erp-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '7mm' }}>
          <tbody>
            {summaryPairRow('المخزن', order.warehouseName || order.warehouseId, 'المنشئ', order.createdBy || '—')}
            {summaryPairRow('أمر التوريد', supplyOrderNo || '—', 'إجمالي الكميات', totalQty.toLocaleString('en-US'), true)}
            {summaryPairRow('المعتمد', order.approvedBy || '—', 'المنفّذ', order.executedBy || '—')}
            {order.note ? summaryPairRow('ملاحظة', order.note, '', '', true) : null}
          </tbody>
        </table>

        {groups.map((group, gIndex) => (
          <div key={`${group.productId}-${gIndex}`} style={{ marginBottom: isThermal ? '4mm' : '8mm' }}>
            <div
              style={{
                marginBottom: '2.5mm',
                padding: isThermal ? '1.5mm 2mm' : '2.5mm 3.5mm',
                background: palette.tableRowAltBg,
                borderRight: `4px solid ${ps.primaryColor}`,
                borderRadius: '0 2mm 2mm 0',
              }}
            >
              <h2 style={{ margin: 0, fontSize: isThermal ? '9pt' : '11pt', fontWeight: 900, color: '#0f172a' }}>
                منتج مفكك: {group.productName}
                {group.productCode ? ` (${group.productCode})` : ''}
                {' — '}
                الكمية: {Number(group.quantity || 0).toLocaleString('en-US')}
              </h2>
            </div>
            {group.lines?.length ? renderLinesTable(group.lines) : (
              <div style={{ border: `1px solid ${palette.border}`, borderRadius: '6px', padding: '4mm', color: palette.mutedText, fontWeight: 700 }}>
                لا توجد مكونات لهذه المجموعة.
              </div>
            )}
          </div>
        ))}

        {standalone.length > 0 && (
          <div style={{ marginBottom: isThermal ? '4mm' : '8mm' }}>
            <div
              style={{
                marginBottom: '2.5mm',
                padding: isThermal ? '1.5mm 2mm' : '2.5mm 3.5mm',
                background: palette.tableRowAltBg,
                borderRight: `4px solid ${ps.primaryColor}`,
                borderRadius: '0 2mm 2mm 0',
              }}
            >
              <h2 style={{ margin: 0, fontSize: isThermal ? '9pt' : '11pt', fontWeight: 900, color: '#0f172a' }}>
                مكونات مستقلة
              </h2>
            </div>
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

        <div style={{ marginTop: isThermal ? '3mm' : '8mm', borderTop: `1px solid ${palette.border}`, paddingTop: '3mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText }}>
            {ps.footerText} — طباعة: {printedAt}
          </p>
        </div>
      </div>
    );
  },
);

SuppliesReceiptPrint.displayName = 'SuppliesReceiptPrint';
