import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import {
  buildRepairProductCardFields,
  resolveRepairJobPrintProducts,
  type RepairPrintStatusMap,
} from '../lib/repairJobPrint';
import { repairStatusChipStyle } from '../lib/repairStatusChipStyle';
import type { RepairBranch, RepairJob, RepairJobProduct } from '../types';

export type RepairJobProductCardPrintProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  printSettings?: PrintTemplateSettings;
  statusMap?: RepairPrintStatusMap;
  workUrl?: string;
};

/** Compact A5-width internal job card — height follows content (no fixed full-page stretch). */
export const RepairJobProductCardPrint = React.forwardRef<HTMLDivElement, RepairJobProductCardPrintProps>(
  function RepairJobProductCardPrint({ job, branch, products, printSettings, statusMap, workUrl }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const palette = getPrintThemePalette(ps);
    const rows = resolveRepairJobPrintProducts(job, products);
    const cards = rows.map((product) => buildRepairProductCardFields(job, product, branch?.name, statusMap));
    const summary = cards[0];
    const statusStyle = repairStatusChipStyle(summary.statusColor);
    const createdAt = job.createdAt
      ? (() => {
          const d = new Date(job.createdAt);
          return Number.isNaN(d.getTime()) ? job.createdAt : d.toLocaleString('ar-EG');
        })()
      : '—';

    const cellPad = '1mm 1.2mm';
    const thStyle: React.CSSProperties = {
      padding: cellPad,
      border: `1px solid ${palette.border}`,
      fontSize: '6.5pt',
      fontWeight: 900,
      textAlign: 'right',
      background: palette.tableRowAltBg,
      lineHeight: 1.2,
    };
    const tdStyle: React.CSSProperties = {
      padding: cellPad,
      border: `1px solid ${palette.border}`,
      fontSize: '7pt',
      verticalAlign: 'top',
      lineHeight: 1.25,
      overflowWrap: 'anywhere',
    };

    return (
      <div ref={ref} dir="rtl" className="print-root arabic-export-root">
        <div
          style={{
            fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
            width: '148mm',
            margin: '0 auto',
            padding: '3mm 3.5mm',
            background: '#fff',
            color: palette.text,
            fontSize: '8pt',
            lineHeight: 1.25,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              border: `1.5px solid ${ps.primaryColor}`,
              borderRadius: '2mm',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '2mm 3mm',
                borderBottom: `2px solid ${ps.primaryColor}`,
                background: palette.tableRowAltBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '2mm',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                {ps.logoUrl ? (
                  <img
                    src={ps.logoUrl}
                    alt=""
                    style={{ maxHeight: '7mm', objectFit: 'contain', marginBottom: '0.4mm', display: 'block' }}
                  />
                ) : null}
                <h1 style={{ margin: 0, fontSize: '11pt', fontWeight: 900, color: ps.primaryColor, lineHeight: 1.15 }}>
                  {ps.headerText || 'مركز الصيانة'}
                </h1>
                <p style={{ margin: '0.3mm 0 0', fontSize: '8pt', fontWeight: 900, lineHeight: 1.15 }}>
                  كارت طلب الصيانة الداخلي
                </p>
                <p style={{ margin: '0.2mm 0 0', fontSize: '6.5pt', color: palette.mutedText, fontWeight: 700 }}>
                  {summary.branchName}
                  {createdAt !== '—' ? ` · ${createdAt}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1mm', alignItems: 'stretch', flexShrink: 0 }}>
                <div
                  style={{
                    padding: '1mm 2mm',
                    borderRadius: '1.2mm',
                    background: ps.primaryColor,
                    color: '#fff',
                    textAlign: 'center',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  <span style={{ fontSize: '5.5pt', fontWeight: 700, display: 'block' }}>رقم الإيصال</span>
                  <span style={{ fontSize: '11pt', fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.1 }}>
                    {summary.receiptNo}
                  </span>
                </div>
                <div
                  style={{
                    padding: '1mm 2mm',
                    borderRadius: '1.2mm',
                    border: `1px solid ${statusStyle.borderColor}`,
                    background: statusStyle.backgroundColor,
                    color: statusStyle.color,
                    textAlign: 'center',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  <span style={{ fontSize: '5.5pt', fontWeight: 700 }}>الحالة </span>
                  <span style={{ fontSize: '8.5pt', fontWeight: 900 }}>{summary.statusLabel}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '2.5mm 3mm' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2mm' }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        ...tdStyle,
                        width: '16%',
                        color: palette.mutedText,
                        fontWeight: 700,
                        background: palette.tableRowAltBg,
                        fontSize: '6.5pt',
                      }}
                    >
                      العميل
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 800, width: '34%' }}>{summary.customerName}</td>
                    <td
                      style={{
                        ...tdStyle,
                        width: '14%',
                        color: palette.mutedText,
                        fontWeight: 700,
                        background: palette.tableRowAltBg,
                        fontSize: '6.5pt',
                      }}
                    >
                      الهاتف
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 800, width: '36%' }}>{summary.customerPhone}</td>
                  </tr>
                </tbody>
              </table>

              <div
                style={{
                  marginBottom: '1mm',
                  fontSize: '8pt',
                  fontWeight: 900,
                  color: ps.primaryColor,
                  lineHeight: 1.2,
                }}
              >
                منتجات الطلب ({rows.length})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '5%' }}>#</th>
                    <th style={{ ...thStyle, width: '28%' }}>المنتج × الكمية</th>
                    <th style={{ ...thStyle, width: '16%' }}>السيريال</th>
                    <th style={{ ...thStyle, width: '51%' }}>العطل / الملحقات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product, index) => {
                    const card = cards[index];
                    const quantity = Math.max(1, Math.round(Number(product.quantity || 1)));
                    return (
                      <tr key={product.itemId || index} style={{ breakInside: 'avoid' }}>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>{index + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 900 }}>
                          {card.productName}
                          <span style={{ fontWeight: 800, color: palette.mutedText }}> × {quantity}</span>
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 700,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: '6.5pt',
                          }}
                        >
                          {card.serialNo}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '6.5pt', whiteSpace: 'pre-wrap' }}>
                          <strong>عطل:</strong> {card.diagnosis}
                          {' · '}
                          <strong>ملحقات:</strong> {card.accessories}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {workUrl ? (
                <div
                  style={{
                    marginTop: '2.5mm',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2.5mm',
                    border: `1.5px dashed ${ps.primaryColor}`,
                    borderRadius: '1.5mm',
                    padding: '1.5mm 2mm',
                    background: '#fff',
                    breakInside: 'avoid',
                  }}
                >
                  <QRCodeSVG value={workUrl} size={64} includeMargin={false} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 900, color: ps.primaryColor, lineHeight: 1.2 }}>
                      مسح الفني
                    </div>
                    <div style={{ marginTop: '0.4mm', fontSize: '6.5pt', fontWeight: 700, color: palette.mutedText, lineHeight: 1.25 }}>
                      باركود فتح مساحة عمل الطلب
                    </div>
                    <div
                      style={{
                        marginTop: '0.4mm',
                        fontSize: '6pt',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: palette.mutedText,
                      }}
                    >
                      {summary.receiptNo}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div
              style={{
                padding: '1.5mm 3mm',
                borderTop: `1px solid ${palette.border}`,
                fontSize: '6.5pt',
                color: palette.mutedText,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              كارت واحد للطلب بالكامل — للاستخدام الداخلي
            </div>
          </div>
        </div>
      </div>
    );
  },
);
