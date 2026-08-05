import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { resolveRepairJobPrintProducts } from '../lib/repairJobPrint';
import type { RepairBranch, RepairJob, RepairJobProduct } from '../types';
import { isDeliveredStatus } from '../utils/repairWorkflowNormalize';

export type DeliveryReceiptPDFProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  printSettings?: PrintTemplateSettings;
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const WARRANTY_LABELS: Record<string, string> = {
  none: 'بدون ضمان',
  '3months': '3 شهور',
  '6months': '6 شهور',
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'غير مدفوع',
  partial: 'مدفوع جزئيًا',
  paid: 'مدفوع بالكامل',
  unpriced: 'غير مُسعّر — يحتاج مراجعة',
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-EG');
};

export const DeliveryReceiptPDF = React.forwardRef<HTMLDivElement, DeliveryReceiptPDFProps>(
  function DeliveryReceiptPDF({ job, branch, products, printSettings }, ref) {
    if (!job || (!isDeliveredStatus(job.status) && !job.deliveredAt)) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const rows = resolveRepairJobPrintProducts(job, products);
    const authorizationNo = job.deliveryAuthorizationNo || `DEL-${job.receiptNo}`;
    const deliveredAt = job.deliveryAuthorizationIssuedAt || job.deliveredAt;
    const finalCost = Math.max(0, Number(job.finalCost || 0));
    const isUnpriced = finalCost <= 0;
    const paidAmount = Math.max(0, Number(job.paidAmount ?? finalCost));
    const balanceDue = Math.max(0, Number(job.balanceDue ?? finalCost - paidAmount));
    const paymentStatus = isUnpriced ? 'unpriced' : job.paymentStatus || (balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid');
    const decimalPlaces = Math.max(0, Math.min(3, Number(ps.decimalPlaces ?? 0)));
    const money = (value: number) => `${value.toLocaleString('ar-EG', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    })} ج.م`;

    const thStyle: React.CSSProperties = {
      border: `1px solid ${ps.primaryColor}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      background: ps.primaryColor,
      color: '#fff',
      fontSize: isThermal ? '6.5pt' : '9pt',
      fontWeight: 900,
      textAlign: 'center',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      color: palette.text,
      fontSize: isThermal ? '6.5pt' : '9pt',
      verticalAlign: 'top',
    };
    const labelStyle: React.CSSProperties = {
      color: palette.mutedText,
      fontSize: isThermal ? '6pt' : '8pt',
      fontWeight: 700,
      margin: 0,
    };
    const valueStyle: React.CSSProperties = {
      color: palette.text,
      fontSize: isThermal ? '8pt' : '10pt',
      fontWeight: 900,
      margin: '0.8mm 0 0',
      overflowWrap: 'anywhere',
    };

    return (
      <div
        ref={ref}
        dir="rtl"
        className="print-root arabic-export-root"
        style={{
          width: paper.width,
          minHeight: paper.minHeight,
          boxSizing: 'border-box',
          margin: '0 auto',
          padding: isThermal ? '4mm 3mm' : '10mm 12mm',
          background: '#fff',
          color: palette.text,
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          lineHeight: 1.5,
        }}
      >
        <header style={{ border: `2px solid ${ps.primaryColor}`, borderRadius: '3mm', overflow: 'hidden', marginBottom: isThermal ? '3mm' : '6mm' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3mm', padding: isThermal ? '3mm' : '5mm 6mm', borderBottom: `3px solid ${ps.primaryColor}` }}>
            <div style={{ flex: 1, textAlign: 'right' }}>
              {ps.logoUrl ? <img src={ps.logoUrl} alt="" style={{ maxHeight: isThermal ? '9mm' : '16mm', maxWidth: '42mm', objectFit: 'contain' }} /> : null}
              <p style={{ margin: ps.logoUrl ? '1mm 0 0' : 0, color: ps.primaryColor, fontSize: isThermal ? '9pt' : '14pt', fontWeight: 900 }}>{ps.headerText}</p>
              <p style={{ ...labelStyle, marginTop: '1mm' }}>{branch?.name || 'مركز الصيانة'}</p>
            </div>
            <div style={{ flex: 1.25, textAlign: 'center' }}>
              <h1 style={{ margin: 0, fontSize: isThermal ? '11pt' : '18pt', fontWeight: 900 }}>إذن تسليم منتج</h1>
              <p style={{ ...labelStyle, marginTop: '1mm' }}>بعد إتمام أعمال الصيانة والتحصيل</p>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ display: 'inline-block', minWidth: isThermal ? '23mm' : '38mm', padding: isThermal ? '1.5mm' : '2.5mm 3mm', borderRadius: '2mm', background: ps.primaryColor, color: '#fff', textAlign: 'center', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', fontWeight: 700 }}>رقم إذن التسليم</p>
                <p style={{ margin: '0.8mm 0 0', fontSize: isThermal ? '7pt' : '10pt', fontWeight: 900, fontFamily: 'monospace' }}>{authorizationNo}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isThermal ? '1fr 1fr' : 'repeat(4, 1fr)', background: palette.tableRowAltBg }}>
            {[
              ['رقم طلب الصيانة', job.receiptNo],
              ['تاريخ التسليم', formatDate(deliveredAt)],
              ['الفرع', branch?.name || '—'],
              ['موظف التسليم', job.deliveryAuthorizationIssuedByName || '—'],
            ].map(([label, value], index) => (
              <div key={label} style={{ padding: isThermal ? '2mm' : '3mm', borderLeft: index < 3 ? `1px solid ${palette.border}` : undefined }}>
                <p style={labelStyle}>{label}</p>
                <p style={valueStyle}>{value}</p>
              </div>
            ))}
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: isThermal ? '1fr' : 'repeat(2, 1fr)', border: `1px solid ${palette.border}`, borderRadius: '2mm', overflow: 'hidden', marginBottom: isThermal ? '3mm' : '5mm' }}>
          {[
            ['اسم العميل / المستلم', job.customerName || '—'],
            ['رقم الهاتف', job.customerPhone || '—'],
            ['العنوان', job.customerAddress || '—'],
            ['عنوان الفرع وهاتفه', [branch?.address, branch?.phone].filter(Boolean).join(' — ') || '—'],
          ].map(([label, value], index) => (
            <div key={label} style={{ padding: isThermal ? '2mm' : '3mm 4mm', borderBottom: index < 2 ? `1px solid ${palette.border}` : undefined, borderLeft: !isThermal && index % 2 === 0 ? `1px solid ${palette.border}` : undefined, background: index % 3 === 0 ? palette.tableRowAltBg : '#fff' }}>
              <p style={labelStyle}>{label}</p>
              <p style={valueStyle}>{value}</p>
            </div>
          ))}
        </section>

        <section style={{ marginBottom: isThermal ? '3mm' : '5mm' }}>
          <p style={{ margin: '0 0 2mm', fontSize: isThermal ? '8pt' : '11pt', fontWeight: 900, color: ps.primaryColor }}>المنتجات المسلّمة</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '5%' }}>م</th>
                <th style={{ ...thStyle, width: '22%' }}>المنتج</th>
                <th style={{ ...thStyle, width: '15%' }}>السيريال</th>
                <th style={{ ...thStyle, width: '7%' }}>الكمية</th>
                <th style={{ ...thStyle, width: '29%' }}>العطل / العمل المنفذ</th>
                <th style={{ ...thStyle, width: '22%' }}>الملحقات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product, index) => (
                <tr key={product.itemId || index} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>{index + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{[product.productName, product.deviceBrand, product.deviceModel].filter(Boolean).join(' — ') || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace' }}>{product.serialNo || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{Math.max(1, Number(product.quantity || 1))}</td>
                  <td style={tdStyle}>{product.technicianDiagnosis || product.diagnosis || job.problemDescription || '—'}</td>
                  <td style={tdStyle}>{product.accessories || job.accessories || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: isThermal ? '1fr 1fr' : 'repeat(4, 1fr)', border: `2px solid ${ps.primaryColor}`, borderRadius: '2mm', overflow: 'hidden', marginBottom: isThermal ? '3mm' : '5mm' }}>
          {[
            ['التكلفة النهائية', money(finalCost)],
            ['المبلغ المحصل', money(paidAmount)],
            ['الرصيد المتبقي', money(balanceDue)],
            ['حالة السداد', PAYMENT_LABELS[paymentStatus] || paymentStatus],
            ['ضمان الإصلاح', WARRANTY_LABELS[job.warranty] || job.warranty || '—'],
            ['انتهاء الضمان', formatDate(job.warrantyExpiresAt)],
            ['عدد المنتجات', String(rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity || 1)), 0))],
            ['حالة الطلب', 'تم التسليم والإقفال'],
          ].map(([label, value], index) => (
            <div key={label} style={{ padding: isThermal ? '2mm' : '3mm', borderLeft: index % 4 < 3 ? `1px solid ${palette.border}` : undefined, borderBottom: index < 4 ? `1px solid ${palette.border}` : undefined, background: index % 2 ? '#fff' : palette.tableRowAltBg }}>
              <p style={labelStyle}>{label}</p>
              <p style={{ ...valueStyle, color: label === 'الرصيد المتبقي' && balanceDue > 0 ? palette.danger : palette.text }}>{value}</p>
            </div>
          ))}
        </section>

        <section style={{ border: `1px solid ${palette.border}`, borderRadius: '2mm', padding: isThermal ? '2.5mm' : '4mm', marginBottom: isThermal ? '5mm' : '10mm', background: palette.tableRowAltBg }}>
          <p style={{ margin: 0, fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, lineHeight: 1.7 }}>
            أقرّ أنا المستلم بأنني عاينت المنتجات الموضحة أعلاه واستلمتها بحالة سليمة بعد انتهاء أعمال الصيانة،
            واستلمت ملحقاتها الموضحة، وأقر بصحة بيانات التسليم والمبالغ والضمان المدوّنة في هذا الإذن.
          </p>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: isThermal ? '1fr' : 'repeat(3, 1fr)', gap: isThermal ? '7mm' : '10mm', marginTop: isThermal ? '4mm' : '8mm' }}>
          {[
            ['اسم وتوقيع المستلم', 'الاسم: ____________________'],
            ['موظف التسليم', job.deliveryAuthorizationIssuedByName || 'الاسم: ____________________'],
            ['اعتماد وختم الفرع', branch?.name || 'الختم: ____________________'],
          ].map(([title, detail]) => (
            <div key={title} style={{ minHeight: isThermal ? '16mm' : '24mm', borderTop: `1px solid ${palette.border}`, paddingTop: '2mm', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: isThermal ? '7pt' : '9pt', fontWeight: 900 }}>{title}</p>
              <p style={{ ...labelStyle, marginTop: '5mm' }}>{detail}</p>
            </div>
          ))}
        </section>

        {ps.footerText ? <footer style={{ marginTop: isThermal ? '5mm' : '9mm', paddingTop: '2mm', borderTop: `1px solid ${palette.border}`, textAlign: 'center', color: palette.mutedText, fontSize: isThermal ? '6pt' : '8pt' }}>{ps.footerText}</footer> : null}
      </div>
    );
  },
);
