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

/** A single A5 internal job card containing every product on the repair request. */
export const RepairJobProductCardPrint = React.forwardRef<HTMLDivElement, RepairJobProductCardPrintProps>(
  function RepairJobProductCardPrint({ job, branch, products, printSettings, statusMap, workUrl }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const palette = getPrintThemePalette(ps);
    const rows = resolveRepairJobPrintProducts(job, products);
    const cards = rows.map((product) => buildRepairProductCardFields(job, product, branch?.name, statusMap));
    const summary = cards[0];
    const statusStyle = repairStatusChipStyle(summary.statusColor);

    return (
      <div ref={ref} dir="rtl" className="print-root arabic-export-root">
        <div
          style={{
            fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
            width: '148mm', minHeight: '210mm', margin: '0 auto', padding: '8mm 9mm',
            background: '#fff', color: palette.text, fontSize: '10pt', lineHeight: 1.4, boxSizing: 'border-box',
          }}
        >
          <div style={{ border: `2.5px solid ${ps.primaryColor}`, borderRadius: '3mm', overflow: 'hidden', minHeight: '194mm', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '4mm 6mm', borderBottom: `3px solid ${ps.primaryColor}`, background: palette.tableRowAltBg, textAlign: 'center' }}>
              {ps.logoUrl ? <img src={ps.logoUrl} alt="" style={{ maxHeight: '11mm', objectFit: 'contain', margin: '0 auto 1mm', display: 'block' }} /> : null}
              <h1 style={{ margin: 0, fontSize: '15pt', fontWeight: 900, color: ps.primaryColor }}>{ps.headerText || 'مركز الصيانة'}</h1>
              <p style={{ margin: '1mm 0 0', fontSize: '12pt', fontWeight: 900 }}>كارت طلب الصيانة الداخلي</p>
              <p style={{ margin: '1mm 0 0', fontSize: '9pt', color: palette.mutedText, fontWeight: 700 }}>{summary.branchName}</p>
            </div>

            <div style={{ padding: '4mm 5mm', flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2mm', marginBottom: '3mm' }}>
                <div style={{ padding: '2mm 3mm', borderRadius: '2mm', background: ps.primaryColor, color: '#fff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                  <span style={{ fontSize: '8pt', fontWeight: 700 }}>رقم الإيصال </span>
                  <span style={{ fontSize: '13pt', fontWeight: 900, fontFamily: 'monospace' }}>{summary.receiptNo}</span>
                </div>
                <div style={{ padding: '2mm 3mm', borderRadius: '2mm', border: `1.5px solid ${statusStyle.borderColor}`, background: statusStyle.backgroundColor, color: statusStyle.color, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                  <span style={{ fontSize: '8pt', fontWeight: 700 }}>الحالة </span>
                  <span style={{ fontSize: '11pt', fontWeight: 900 }}>{summary.statusLabel}</span>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
                <tbody>
                  {[
                    { label: 'اسم العميل', value: summary.customerName },
                    { label: 'رقم الهاتف', value: summary.customerPhone },
                  ].map((row) => (
                    <tr key={row.label}>
                      <td style={{ padding: '2mm', width: '28%', borderBottom: `1px solid ${palette.border}`, color: palette.mutedText, fontWeight: 700, background: palette.tableRowAltBg }}>{row.label}</td>
                      <td style={{ padding: '2mm', borderBottom: `1px solid ${palette.border}`, fontWeight: 800 }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginBottom: '2mm', fontSize: '11pt', fontWeight: 900, color: ps.primaryColor }}>منتجات الطلب ({rows.length})</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: palette.tableRowAltBg }}>
                    {['#', 'المنتج والكمية', 'السيريال', 'العطل والملحقات'].map((label, index) => (
                      <th key={label} style={{ width: index === 0 ? '7%' : index === 1 ? '26%' : index === 2 ? '20%' : '47%', padding: '2mm 1.5mm', border: `1px solid ${palette.border}`, fontSize: '8.5pt', textAlign: 'right' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product, index) => {
                    const card = cards[index];
                    const quantity = Math.max(1, Math.round(Number(product.quantity || 1)));
                    return (
                      <tr key={product.itemId || index} style={{ breakInside: 'avoid' }}>
                        <td style={{ padding: '2mm 1.5mm', border: `1px solid ${palette.border}`, fontWeight: 900 }}>{index + 1}</td>
                        <td style={{ padding: '2mm 1.5mm', border: `1px solid ${palette.border}`, fontWeight: 900, overflowWrap: 'anywhere' }}>{card.productName}<div style={{ fontSize: '8pt', color: palette.mutedText }}>الكمية: {quantity}</div></td>
                        <td style={{ padding: '2mm 1.5mm', border: `1px solid ${palette.border}`, fontWeight: 700, overflowWrap: 'anywhere' }}>{card.serialNo}</td>
                        <td style={{ padding: '2mm 1.5mm', border: `1px solid ${palette.border}`, fontSize: '8.5pt', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          <strong>العطل:</strong> {card.diagnosis}<br /><strong>الملحقات:</strong> {card.accessories}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {workUrl ? (
                <div style={{ marginTop: '4mm', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4mm', border: `2px dashed ${ps.primaryColor}`, borderRadius: '3mm', padding: '3mm', background: '#fff', breakInside: 'avoid' }}>
                  <QRCodeSVG value={workUrl} size={92} includeMargin />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12pt', fontWeight: 900, color: ps.primaryColor }}>مسح الفني</div>
                    <div style={{ marginTop: '1mm', fontSize: '9pt', fontWeight: 700, color: palette.mutedText }}>
هذا باركود الفني للطلب.                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ padding: '3mm 6mm', borderTop: `1px solid ${palette.border}`, fontSize: '8.5pt', color: palette.mutedText, fontWeight: 700, textAlign: 'center' }}>
              كارت واحد للطلب بالكامل — للاستخدام الداخلي
            </div>
          </div>
        </div>
      </div>
    );
  },
);
