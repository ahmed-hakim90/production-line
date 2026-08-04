import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import type { RepairSalesInvoice } from '../types';

export type RepairSalesInvoicePrintProps = {
  invoice: RepairSalesInvoice | null;
  branchName?: string;
  printSettings?: PrintTemplateSettings;
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Number(n || 0));

export const RepairSalesInvoicePrint = React.forwardRef<HTMLDivElement, RepairSalesInvoicePrintProps>(
  function RepairSalesInvoicePrint({ invoice, branchName, printSettings }, ref) {
    if (!invoice) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const cancelled = String(invoice.status || '').toLowerCase() === 'cancelled';
    const createdAt = invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('ar-EG') : '—';
    const printedAt = new Date().toLocaleString('ar-EG');
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

    const thStyle: React.CSSProperties = {
      border: `1px solid ${ps.primaryColor}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      fontSize: isThermal ? '7pt' : '10pt',
      background: ps.primaryColor,
      color: '#ffffff',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      fontWeight: 900,
      textAlign: 'center',
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      fontSize: isThermal ? '7pt' : '10pt',
      color: palette.text,
    };

    return (
      <div
        ref={ref}
        dir="rtl"
        className="print-root arabic-export-root"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: paper.minHeight,
          margin: '0 auto',
          padding: isThermal ? '4mm 3mm' : '10mm 12mm',
          background: '#fff',
          color: palette.text,
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.55,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            border: `2px solid ${ps.primaryColor}`,
            borderRadius: isThermal ? '2mm' : '3mm',
            overflow: 'hidden',
            marginBottom: isThermal ? '3mm' : '6mm',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4mm',
              padding: isThermal ? '3mm' : '5mm 6mm',
              borderBottom: `3px solid ${ps.primaryColor}`,
            }}
          >
            <div style={{ flex: 1, textAlign: 'right' }}>
              {ps.logoUrl ? (
                <img
                  src={ps.logoUrl}
                  alt=""
                  style={{
                    maxHeight: isThermal ? '10mm' : '16mm',
                    objectFit: 'contain',
                    display: 'block',
                    marginBottom: '1.5mm',
                  }}
                />
              ) : null}
              <h1 style={{ margin: 0, fontSize: isThermal ? '11pt' : '15pt', fontWeight: 900, color: ps.primaryColor }}>
                {ps.headerText}
              </h1>
            </div>
            <div style={{ flex: 1.2, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: isThermal ? '10pt' : '14pt', fontWeight: 900 }}>فاتورة بيع قطع غيار</p>
              <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '9pt', color: palette.mutedText, fontWeight: 700 }}>
                {branchName || '—'}
              </p>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: isThermal ? '1.5mm 2mm' : '2.5mm 3.5mm',
                  borderRadius: '2mm',
                  background: cancelled ? '#991b1b' : ps.primaryColor,
                  color: '#fff',
                  textAlign: 'center',
                  minWidth: isThermal ? '22mm' : '30mm',
                }}
              >
                <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', fontWeight: 700, opacity: 0.9 }}>رقم الفاتورة</p>
                <p style={{ margin: '0.5mm 0 0', fontSize: isThermal ? '8pt' : '11pt', fontWeight: 900, fontFamily: 'monospace' }}>
                  {invoice.invoiceNo}
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isThermal ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
              background: palette.tableRowAltBg,
            }}
          >
            {[
              { label: 'التاريخ', value: createdAt },
              { label: 'الحالة', value: cancelled ? 'ملغاة' : 'نشطة' },
              { label: 'عدد البنود', value: String(lines.length) },
              { label: 'تاريخ الطباعة', value: printedAt },
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
                <p style={{ margin: '0.5mm 0 0', fontSize: isThermal ? '8pt' : '10pt', fontWeight: 900 }}>
                  {cell.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '3mm' : '5mm' }}>
          <tbody>
            <tr>
              <td style={{ padding: '2.5mm 3mm', width: '22%', borderBottom: `1px solid ${palette.border}`, color: palette.mutedText, fontWeight: 700, background: palette.tableRowAltBg }}>
                العميل
              </td>
              <td style={{ padding: '2.5mm 3mm', width: '28%', borderBottom: `1px solid ${palette.border}`, fontWeight: 700 }}>
                {invoice.customerName || 'عميل نقدي'}
              </td>
              <td style={{ padding: '2.5mm 3mm', width: '22%', borderBottom: `1px solid ${palette.border}`, color: palette.mutedText, fontWeight: 700, background: palette.tableRowAltBg }}>
                الهاتف
              </td>
              <td style={{ padding: '2.5mm 3mm', width: '28%', borderBottom: `1px solid ${palette.border}`, fontWeight: 700 }}>
                {invoice.customerPhone || '—'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '2.5mm 3mm', borderBottom: `1px solid ${palette.border}`, color: palette.mutedText, fontWeight: 700, background: palette.tableRowAltBg }}>
                منشئ الفاتورة
              </td>
              <td style={{ padding: '2.5mm 3mm', borderBottom: `1px solid ${palette.border}`, fontWeight: 700 }} colSpan={3}>
                {invoice.createdByName || '—'}
              </td>
            </tr>
          </tbody>
        </table>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: isThermal ? '3mm' : '5mm',
            border: `1.5px solid ${ps.primaryColor}`,
          }}
        >
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '8%' }}>م</th>
              <th style={{ ...thStyle, width: '40%' }}>القطعة</th>
              <th style={{ ...thStyle, width: '14%' }}>الكمية</th>
              <th style={{ ...thStyle, width: '19%' }}>سعر الوحدة</th>
              <th style={{ ...thStyle, width: '19%' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.partId}-${index}`} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{index + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{line.partName}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{fmt(line.quantity)}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{fmt(line.unitPrice)}</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>{fmt(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            border: `1.5px solid ${ps.primaryColor}`,
            borderRadius: '2mm',
            padding: isThermal ? '2mm 3mm' : '3mm 4mm',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isThermal ? '3mm' : '5mm',
            fontWeight: 900,
          }}
        >
          <span>الإجمالي النهائي</span>
          <span style={{ fontSize: isThermal ? '11pt' : '14pt' }}>{fmt(Number(invoice.total || 0))} ج.م</span>
        </div>

        <div
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: '2mm',
            padding: isThermal ? '2mm' : '3mm 4mm',
            marginBottom: isThermal ? '4mm' : '8mm',
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: '1mm' }}>ملاحظات</div>
          <div>{invoice.notes || '—'}</div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8mm',
            marginTop: isThermal ? '6mm' : '10mm',
          }}
        >
          <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '2mm', textAlign: 'center', fontWeight: 700 }}>
            توقيع البائع
          </div>
          <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '2mm', textAlign: 'center', fontWeight: 700 }}>
            توقيع العميل
          </div>
        </div>

        {ps.footerText ? (
          <p
            style={{
              marginTop: isThermal ? '4mm' : '8mm',
              fontSize: isThermal ? '6pt' : '8pt',
              color: palette.mutedText,
              textAlign: 'center',
              borderTop: `1px solid ${palette.border}`,
              paddingTop: '2mm',
            }}
          >
            {ps.footerText}
          </p>
        ) : null}
      </div>
    );
  },
);
