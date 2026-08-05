import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { resolveRepairJobPrintProducts, type RepairPrintStatusMap } from '../lib/repairJobPrint';
import { shouldShowRepairPrintCosts } from '../lib/repairJobIntake';
import { resolveRepairStatusChip } from '../lib/repairStatusChipStyle';
import type { RepairBranch, RepairJob, RepairJobProduct } from '../types';

export type RepairJobPrintProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  trackUrl?: string;
  printSettings?: PrintTemplateSettings;
  statusMap?: RepairPrintStatusMap;
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const WARRANTY_LABELS: Record<string, string> = {
  none: 'بدون',
  '3months': '3 شهور',
  '6months': '6 شهور',
};

const money = (value: number | undefined | null) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toLocaleString('ar-EG')} ج.م`;
};

export const RepairJobPrint = React.forwardRef<HTMLDivElement, RepairJobPrintProps>(
  function RepairJobPrint({ job, branch, products, trackUrl, printSettings, statusMap }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const rows = resolveRepairJobPrintProducts(job, products);
    const createdAt = job.createdAt ? new Date(job.createdAt).toLocaleString('ar-EG') : '—';
    const printedAt = new Date().toLocaleString('ar-EG');
    const statusChip = resolveRepairStatusChip(job.status, statusMap);
    const warrantyLabel = WARRANTY_LABELS[job.warranty] || job.warranty || '—';
    const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
    // Repair intake slips always include track QR when a public URL exists.
    const showQr = Boolean(trackUrl);
    const showCosts = ps.showCosts !== false && shouldShowRepairPrintCosts(job, products);

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
    const labelCell: React.CSSProperties = {
      padding: isThermal ? '1.5mm' : '2.5mm 3mm',
      width: '22%',
      borderBottom: `1px solid ${palette.border}`,
      color: palette.mutedText,
      fontWeight: 700,
      background: palette.tableRowAltBg,
    };
    const valueCell: React.CSSProperties = {
      padding: isThermal ? '1.5mm' : '2.5mm 3mm',
      width: '28%',
      borderBottom: `1px solid ${palette.border}`,
      color: palette.text,
      fontWeight: 700,
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
              <p style={{ margin: 0, fontSize: isThermal ? '10pt' : '14pt', fontWeight: 900 }}>
                {showCosts ? 'طلب صيانة' : 'إيصال استلام قطعة صيانة'}
              </p>
              <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '9pt', color: palette.mutedText, fontWeight: 700 }}>
                {branch?.name || '—'}
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
                  minWidth: isThermal ? '22mm' : '30mm',
                }}
              >
                <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', fontWeight: 700, opacity: 0.9 }}>رقم الطلب</p>
                <p style={{ margin: '0.5mm 0 0', fontSize: isThermal ? '8pt' : '11pt', fontWeight: 900, fontFamily: 'monospace' }}>
                  {job.receiptNo}
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
              { label: 'تاريخ الإنشاء', value: createdAt },
              { label: 'الحالة', value: statusChip.label, emphasize: true },
              { label: 'عدد المنتجات', value: String(rows.length) },
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
                {cell.emphasize ? (
                  <p
                    style={{
                      margin: '1mm 0 0',
                      display: 'inline-block',
                      padding: isThermal ? '0.8mm 1.5mm' : '1mm 2.5mm',
                      borderRadius: '1.5mm',
                      border: `1.5px solid ${statusChip.style.borderColor}`,
                      background: statusChip.style.backgroundColor,
                      color: statusChip.style.color,
                      fontSize: isThermal ? '8pt' : '10pt',
                      fontWeight: 900,
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact',
                    }}
                  >
                    {cell.value}
                  </p>
                ) : (
                  <p style={{ margin: '0.5mm 0 0', fontSize: isThermal ? '8pt' : '10pt', fontWeight: 900 }}>
                    {cell.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '3mm' : '5mm' }}>
          <tbody>
            <tr>
              <td style={labelCell}>العميل</td>
              <td style={valueCell}>{job.customerName || '—'}</td>
              <td style={labelCell}>الهاتف</td>
              <td style={valueCell}>{job.customerPhone || '—'}</td>
            </tr>
            <tr>
              <td style={labelCell}>العنوان</td>
              <td style={valueCell} colSpan={3}>{job.customerAddress || '—'}</td>
            </tr>
            <tr>
              <td style={labelCell}>الضمان</td>
              <td style={valueCell}>{warrantyLabel}</td>
              <td style={labelCell}>التكلفة النهائية</td>
              <td style={valueCell}>{showCosts ? money(job.finalCost) : '—'}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginBottom: isThermal ? '2mm' : '3mm', fontWeight: 900, fontSize: isThermal ? '9pt' : '11pt' }}>
          المنتجات والتشخيص
        </div>
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
              <th style={{ ...thStyle, width: '24%' }}>المنتج</th>
              <th style={{ ...thStyle, width: '14%' }}>السيريال</th>
              <th style={{ ...thStyle, width: '8%' }}>الكمية</th>
              <th style={{ ...thStyle, width: '16%' }}>الإكسسوارات</th>
              <th style={{ ...thStyle, width: '18%' }}>وصف العطل</th>
              {showCosts ? <th style={{ ...thStyle, width: '12%' }}>خدمات</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={item.itemId || index} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{index + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>
                  {item.productName || '—'}
                  {item.inWarranty ? (
                    <div style={{ fontSize: '8pt', color: palette.mutedText, fontWeight: 700 }}>داخل الضمان</div>
                  ) : null}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace' }}>{item.serialNo || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>{Math.max(1, Number(item.quantity || 1))}</td>
                <td style={tdStyle}>{item.accessories || '—'}</td>
                <td style={tdStyle}>
                  {item.diagnosis || '—'}
                  {item.technicianDiagnosis ? (
                    <div style={{ marginTop: 4, fontSize: '8pt', color: palette.mutedText }}>
                      فني: {item.technicianDiagnosis}
                    </div>
                  ) : null}
                </td>
                {showCosts ? (
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                    {item.inWarranty ? 'مجاني' : money(item.finalCost)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: '2mm',
            padding: isThermal ? '2mm' : '3mm 4mm',
            marginBottom: isThermal ? '3mm' : '5mm',
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: '1mm' }}>وصف العطل</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{job.problemDescription || '—'}</div>
        </div>

        {parts.length > 0 ? (
          <>
            <div style={{ marginBottom: isThermal ? '2mm' : '3mm', fontWeight: 900 }}>قطع الغيار المستخدمة</div>
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
                  <th style={{ ...thStyle, width: '10%' }}>م</th>
                  <th style={{ ...thStyle, width: '55%' }}>القطعة</th>
                  <th style={{ ...thStyle, width: '15%' }}>الكمية</th>
                  <th style={{ ...thStyle, width: '20%' }}>النطاق</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part, index) => (
                  <tr key={`${part.partId}-${index}`} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{part.partName}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>{part.quantity}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {part.scope === 'product' ? (part.productName || 'منتج') : 'الطلب'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showQr ? '1fr 1fr 1fr' : '1fr 1fr',
            gap: '6mm',
            marginTop: isThermal ? '6mm' : '10mm',
            alignItems: 'end',
          }}
        >
          <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '2mm', textAlign: 'center', fontWeight: 700 }}>
            توقيع الموظف
          </div>
          <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '2mm', textAlign: 'center', fontWeight: 700 }}>
            <div>توقيع العميل</div>
            <div style={{ fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText, fontWeight: 700, marginTop: '1mm' }}>
              أقرّ باستلام المركز للقطعة بالتفاصيل أعلاه
            </div>
          </div>
          {showQr && trackUrl ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: 700, marginBottom: '2mm', color: palette.mutedText }}>
                متابعة الطلب
              </div>
              <div style={{ display: 'inline-block', border: `1px solid ${palette.border}`, padding: '2mm', background: '#fff' }}>
                <QRCodeSVG value={trackUrl} size={isThermal ? 64 : 88} includeMargin />
              </div>
            </div>
          ) : null}
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
