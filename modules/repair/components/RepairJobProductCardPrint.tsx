import React from 'react';
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
};

/**
 * A5 product tag cards — one page per product — for sticking on the received unit.
 * Not a sticker label; full A5 paper with customer / fault / accessories.
 */
export const RepairJobProductCardPrint = React.forwardRef<HTMLDivElement, RepairJobProductCardPrintProps>(
  function RepairJobProductCardPrint({ job, branch, products, printSettings, statusMap }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const palette = getPrintThemePalette(ps);
    const rows = resolveRepairJobPrintProducts(job, products);

    return (
      <div ref={ref} dir="rtl" className="print-root arabic-export-root">
        {rows.map((product, index) => {
          const card = buildRepairProductCardFields(job, product, branch?.name, statusMap);
          const statusStyle = repairStatusChipStyle(card.statusColor);
          return (
            <div
              key={product.itemId || index}
              style={{
                fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
                width: '148mm',
                minHeight: '210mm',
                margin: '0 auto',
                padding: '10mm 12mm',
                background: '#fff',
                color: palette.text,
                fontSize: '12pt',
                lineHeight: 1.55,
                boxSizing: 'border-box',
                pageBreakAfter: index < rows.length - 1 ? 'always' : 'auto',
                breakAfter: index < rows.length - 1 ? 'page' : 'auto',
              }}
            >
              <div
                style={{
                  border: `2.5px solid ${ps.primaryColor}`,
                  borderRadius: '3mm',
                  overflow: 'hidden',
                  minHeight: '190mm',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    padding: '6mm 7mm',
                    borderBottom: `3px solid ${ps.primaryColor}`,
                    background: palette.tableRowAltBg,
                    textAlign: 'center',
                  }}
                >
                  {ps.logoUrl ? (
                    <img
                      src={ps.logoUrl}
                      alt=""
                      style={{ maxHeight: '14mm', objectFit: 'contain', margin: '0 auto 2mm', display: 'block' }}
                    />
                  ) : null}
                  <h1 style={{ margin: 0, fontSize: '16pt', fontWeight: 900, color: ps.primaryColor }}>
                    {ps.headerText || 'مركز الصيانة'}
                  </h1>
                  <p style={{ margin: '2mm 0 0', fontSize: '13pt', fontWeight: 900 }}>كارت القطعة</p>
                  <p style={{ margin: '1mm 0 0', fontSize: '10pt', color: palette.mutedText, fontWeight: 700 }}>
                    {card.branchName}
                  </p>
                </div>

                <div style={{ padding: '5mm 7mm', flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '3mm',
                      marginBottom: '5mm',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '2.5mm 4mm',
                        borderRadius: '2mm',
                        background: ps.primaryColor,
                        color: '#fff',
                        WebkitPrintColorAdjust: 'exact',
                        printColorAdjust: 'exact',
                      }}
                    >
                      <span style={{ fontSize: '9pt', fontWeight: 700, opacity: 0.9 }}>رقم الإيصال </span>
                      <span style={{ fontSize: '14pt', fontWeight: 900, fontFamily: 'monospace' }}>{card.receiptNo}</span>
                    </div>
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '2.5mm 4mm',
                        borderRadius: '2mm',
                        border: `1.5px solid ${statusStyle.borderColor}`,
                        background: statusStyle.backgroundColor,
                        color: statusStyle.color,
                        WebkitPrintColorAdjust: 'exact',
                        printColorAdjust: 'exact',
                      }}
                    >
                      <span style={{ fontSize: '9pt', fontWeight: 700, opacity: 0.85 }}>الحالة </span>
                      <span style={{ fontSize: '12pt', fontWeight: 900 }}>{card.statusLabel}</span>
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        { label: 'الحالة', value: card.statusLabel },
                        { label: 'اسم العميل', value: card.customerName },
                        { label: 'رقم الهاتف', value: card.customerPhone },
                        { label: 'المنتج', value: card.productName },
                        { label: 'السيريال', value: card.serialNo },
                        { label: 'وصف العطل (العميل)', value: card.diagnosis },
                        { label: 'الملحقات / الإكسسوارات', value: card.accessories },
                      ].map((row) => (
                        <tr key={row.label}>
                          <td
                            style={{
                              padding: '3.5mm 3mm',
                              width: '34%',
                              borderBottom: `1px solid ${palette.border}`,
                              color: palette.mutedText,
                              fontWeight: 700,
                              background: palette.tableRowAltBg,
                              verticalAlign: 'top',
                            }}
                          >
                            {row.label}
                          </td>
                          <td
                            style={{
                              padding: '3.5mm 3mm',
                              borderBottom: `1px solid ${palette.border}`,
                              fontWeight: 800,
                              fontSize: '13pt',
                              whiteSpace: 'pre-wrap',
                              verticalAlign: 'top',
                            }}
                          >
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    padding: '4mm 7mm',
                    borderTop: `1px solid ${palette.border}`,
                    fontSize: '9pt',
                    color: palette.mutedText,
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  يُلصق على القطعة داخل المركز — للاستخدام الداخلي
                  {rows.length > 1 ? ` · منتج ${index + 1} من ${rows.length}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);
