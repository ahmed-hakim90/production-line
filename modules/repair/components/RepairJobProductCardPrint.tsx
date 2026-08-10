import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { PrintExtraLines } from '@/src/components/erp/PrintExtraLines';
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

/** Internal job card — fills full printable width (no fixed 148mm column). */
export const RepairJobProductCardPrint = React.forwardRef<HTMLDivElement, RepairJobProductCardPrintProps>(
  function RepairJobProductCardPrint({ job, branch, products, printSettings, statusMap, workUrl }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const doc = resolvePrintDocumentConfig(ps, 'repairJobCard');
    const palette = getPrintThemePalette(ps);
    const font = resolvePrintFont(ps);
    const rows = resolveRepairJobPrintProducts(job, products);
    const cards = rows.map((product) => buildRepairProductCardFields(job, product, branch?.name, statusMap));
    const summary = cards[0];
    const statusStyle = repairStatusChipStyle(summary.statusColor);
    const showQr = Boolean(workUrl) && doc.isFieldVisible('qrCode');
    const showStatus = doc.isFieldVisible('statusBadge');
    const brandName = String(doc.headerText || '').trim() || 'مركز الصيانة';
    const createdAt = job.createdAt
      ? (() => {
          const d = new Date(job.createdAt);
          return Number.isNaN(d.getTime()) ? job.createdAt : d.toLocaleString('ar-EG');
        })()
      : '—';

    const cellPad = '1.5mm 2mm';
    const thStyle: React.CSSProperties = {
      padding: cellPad,
      border: `1px solid ${palette.border}`,
      fontSize: '8pt',
      fontWeight: 900,
      textAlign: 'right',
      background: palette.tableRowAltBg,
      lineHeight: 1.25,
    };
    const tdStyle: React.CSSProperties = {
      padding: cellPad,
      border: `1px solid ${palette.border}`,
      fontSize: '9pt',
      verticalAlign: 'top',
      lineHeight: 1.3,
      overflowWrap: 'anywhere',
    };

    return (
      <div
        ref={ref}
        dir="rtl"
        lang="ar"
        className="print-root print-report arabic-export-root"
        style={{
          fontFamily: font.fontFamily,
          // Screen: stay A5-sized inside off-screen parking. Print CSS expands to full width.
          width: '100%',
          maxWidth: '148mm',
          margin: '0 auto',
          padding: '4mm 5mm',
          background: '#fff',
          color: palette.text,
          fontSize: font.denseFontSize,
          lineHeight: 1.3,
          boxSizing: 'border-box',
          letterSpacing: 'normal',
        }}
      >
        <div style={{ borderBottom: `2px solid ${ps.primaryColor}` }}>
          <div
            style={{
              padding: '2mm 0 3mm',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '3mm',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
              {ps.logoUrl ? (
                <img
                  src={ps.logoUrl}
                  alt=""
                  style={{ maxHeight: '9mm', objectFit: 'contain', marginBottom: '0.6mm', display: 'block' }}
                />
              ) : null}
              <h1 style={{ margin: 0, fontSize: '13pt', fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>
                {brandName}
              </h1>
              <p style={{ margin: '0.3mm 0 0', fontSize: '7pt', fontWeight: 700, color: ps.primaryColor }}>
                Factory PRODUCTION SYSTEM
              </p>
              <p style={{ margin: '0.5mm 0 0', fontSize: '10pt', fontWeight: 900, lineHeight: 1.15 }}>
                كارت طلب الصيانة الداخلي
              </p>
              <p style={{ margin: '0.3mm 0 0', fontSize: '8pt', color: palette.mutedText, fontWeight: 700 }}>
                {summary.branchName}
                {createdAt !== '—' ? ` · ${createdAt}` : ''}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5mm',
                alignItems: 'stretch',
                flexShrink: 0,
                minWidth: '32mm',
              }}
            >
              <div
                style={{
                  padding: '1.5mm 2.5mm',
                  borderRadius: '1.5mm',
                  background: ps.primaryColor,
                  color: '#fff',
                  textAlign: 'center',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                <span style={{ fontSize: '6.5pt', fontWeight: 700, display: 'block' }}>رقم الإيصال</span>
                <span style={{ fontSize: '12pt', fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.1 }}>
                  {summary.receiptNo}
                </span>
              </div>
              {showStatus ? (
              <div
                style={{
                  padding: '1.5mm 2.5mm',
                  borderRadius: '1.5mm',
                  border: `1px solid ${statusStyle.borderColor}`,
                  background: statusStyle.backgroundColor,
                  color: statusStyle.color,
                  textAlign: 'center',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                <span style={{ fontSize: '6.5pt', fontWeight: 700 }}>الحالة </span>
                <span style={{ fontSize: '9pt', fontWeight: 900 }}>{summary.statusLabel}</span>
              </div>
              ) : null}
            </div>
          </div>

          <PrintExtraLines lines={doc.customLines} dense />

          <div style={{ padding: '3mm 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3mm' }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      ...tdStyle,
                      width: '14%',
                      color: palette.mutedText,
                      fontWeight: 700,
                      background: palette.tableRowAltBg,
                    }}
                  >
                    العميل
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 800, width: '36%' }}>{summary.customerName}</td>
                  <td
                    style={{
                      ...tdStyle,
                      width: '12%',
                      color: palette.mutedText,
                      fontWeight: 700,
                      background: palette.tableRowAltBg,
                    }}
                  >
                    الهاتف
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 800, width: '38%' }}>{summary.customerPhone}</td>
                </tr>
              </tbody>
            </table>

            <div
              style={{
                marginBottom: '1.5mm',
                fontSize: '9pt',
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
                  <th style={{ ...thStyle, width: '6%' }}>#</th>
                  <th style={{ ...thStyle, width: '28%' }}>المنتج × الكمية</th>
                  <th style={{ ...thStyle, width: '18%' }}>السيريال</th>
                  <th style={{ ...thStyle, width: '48%' }}>العطل / الملحقات</th>
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
                          fontSize: '8pt',
                        }}
                      >
                        {card.serialNo}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '8pt', whiteSpace: 'pre-wrap' }}>
                        <strong>عطل:</strong> {card.diagnosis}
                        {' · '}
                        <strong>ملحقات:</strong> {card.accessories}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {showQr && workUrl ? (
              <div
                style={{
                  marginTop: '3mm',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3mm',
                  border: `1.5px dashed ${ps.primaryColor}`,
                  borderRadius: '2mm',
                  padding: '2.5mm 3mm',
                  background: '#fff',
                  breakInside: 'avoid',
                }}
              >
                <QRCodeSVG value={workUrl} size={72} includeMargin={false} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10pt', fontWeight: 900, color: ps.primaryColor, lineHeight: 1.2 }}>
                    مسح الفني
                  </div>
                  <div style={{ marginTop: '0.5mm', fontSize: '8pt', fontWeight: 700, color: palette.mutedText, lineHeight: 1.25 }}>
                    باركود فتح مساحة عمل الطلب
                  </div>
                  <div
                    style={{
                      marginTop: '0.5mm',
                      fontSize: '7.5pt',
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
              padding: '2mm 0',
              borderTop: `1px solid ${palette.border}`,
              fontSize: '8pt',
              color: palette.mutedText,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {String(doc.footerText || '').trim() || 'كارت واحد للطلب بالكامل — للاستخدام الداخلي'}
          </div>
        </div>
      </div>
    );
  },
);
