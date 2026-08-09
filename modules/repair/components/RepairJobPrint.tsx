import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import {
  formatRepairPrintProductLabel,
  repairCustomerReceiptAcknowledgment,
  repairCustomerReceiptTitle,
  resolveRepairJobPrintProducts,
  type RepairPrintStatusMap,
} from '../lib/repairJobPrint';
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
  none: 'بدون ضمان مصنّع',
  '3months': 'ضمان مصنّع 3 شهور',
  '6months': 'ضمان مصنّع 6 شهور',
};

const money = (value: number | undefined | null, decimalPlaces = 0) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toLocaleString('ar-EG', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })} ج.م`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-EG');
};

export const RepairJobPrint = React.forwardRef<HTMLDivElement, RepairJobPrintProps>(
  function RepairJobPrint({ job, branch, products, trackUrl, printSettings, statusMap }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const rows = resolveRepairJobPrintProducts(job, products);
    const createdAt = formatDateTime(job.createdAt);
    const printedAt = new Date().toLocaleString('ar-EG');
    const statusChip = resolveRepairStatusChip(job.status, statusMap);
    const warrantyLabel = WARRANTY_LABELS[job.warranty] || job.warranty || '—';
    const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
    const showQr = Boolean(trackUrl);
    const showCosts = ps.showCosts !== false && shouldShowRepairPrintCosts(job, products);
    const decimalPlaces = Math.max(0, Math.min(3, Number(ps.decimalPlaces ?? 0)));
    const brandName = String(ps.headerText || '').trim() || 'مركز الصيانة';
    const documentTitle = repairCustomerReceiptTitle(showCosts);
    const acknowledgment = repairCustomerReceiptAcknowledgment(showCosts);
    const branchContact = [branch?.address, branch?.phone].filter(Boolean).join(' — ');
    const totalQty = rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity || 1)), 0);
    const problemText = String(job.problemDescription || '').trim();
    const showProblemBlock = Boolean(
      problemText
      && !rows.some((row) => String(row.diagnosis || '').trim() === problemText),
    );

    const labelStyle: React.CSSProperties = {
      margin: 0,
      color: palette.mutedText,
      fontSize: isThermal ? '6pt' : '8pt',
      fontWeight: 700,
    };
    const valueStyle: React.CSSProperties = {
      margin: '0.8mm 0 0',
      color: palette.text,
      fontSize: isThermal ? '8pt' : '10.5pt',
      fontWeight: 800,
      overflowWrap: 'anywhere',
    };
    const sectionTitle: React.CSSProperties = {
      margin: `0 0 ${isThermal ? '1.5mm' : '2.5mm'}`,
      color: palette.primary,
      fontSize: isThermal ? '8.5pt' : '11pt',
      fontWeight: 900,
    };
    const thStyle: React.CSSProperties = {
      border: `1px solid ${palette.primary}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      fontSize: isThermal ? '6.5pt' : '9pt',
      background: palette.primary,
      color: '#ffffff',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      fontWeight: 900,
      textAlign: 'center',
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
      fontSize: isThermal ? '6.5pt' : '9.5pt',
      color: palette.text,
      verticalAlign: 'top',
    };

    const customerInfoRows: Array<[string, string]> = [
      ['اسم العميل', job.customerName || '—'],
      ['رقم الهاتف', job.customerPhone || '—'],
      ['العنوان', job.customerAddress || '—'],
      ['الضمان', warrantyLabel],
      ['التكلفة', showCosts ? money(job.finalCost, decimalPlaces) : 'تُحدد بعد التشخيص'],
      ['مركز الخدمة', branch?.name || '—'],
    ];
    const infoColumns = isThermal ? 1 : 2;

    const configuredFooter = String(ps.footerText || '').trim();
    const footerLine =
      configuredFooter && configuredFooter !== DEFAULT_PRINT_TEMPLATE.footerText
        ? configuredFooter
        : `شكرًا لثقتكم بـ ${brandName} — يُرجى الاحتفاظ بهذا الإيصال حتى استلام المنتج.`;

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
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        {/* Brand accent bar */}
        <div
          style={{
            height: isThermal ? '1.2mm' : '2mm',
            background: palette.primary,
            borderRadius: '1mm',
            marginBottom: isThermal ? '3mm' : '4mm',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        />

        <header
          style={{
            border: `1.5px solid ${palette.border}`,
            borderRadius: isThermal ? '2mm' : '3mm',
            overflow: 'hidden',
            marginBottom: isThermal ? '3mm' : '5mm',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '3mm',
              padding: isThermal ? '3mm' : '5mm 6mm',
              borderBottom: `2.5px solid ${palette.primary}`,
              background: '#fff',
            }}
          >
            <div style={{ flex: 1.15, textAlign: 'right', minWidth: 0 }}>
              {ps.logoUrl ? (
                <img
                  src={ps.logoUrl}
                  alt=""
                  style={{
                    maxHeight: isThermal ? '10mm' : '18mm',
                    maxWidth: isThermal ? '28mm' : '48mm',
                    objectFit: 'contain',
                    display: 'block',
                    marginBottom: '1.5mm',
                  }}
                />
              ) : null}
              <h1
                style={{
                  margin: 0,
                  fontSize: isThermal ? '11pt' : '16pt',
                  fontWeight: 900,
                  color: palette.primary,
                  letterSpacing: '-0.01em',
                }}
              >
                {brandName}
              </h1>
              <p style={{ ...labelStyle, marginTop: '1mm' }}>
                {branch?.name || 'مركز الصيانة'}
                {branchContact ? ` · ${branchContact}` : ''}
              </p>
            </div>

            <div style={{ flex: 1.1, textAlign: 'center', minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  display: 'inline-block',
                  padding: isThermal ? '0.6mm 1.5mm' : '1mm 2.5mm',
                  borderRadius: '999px',
                  border: `1px solid ${palette.border}`,
                  background: palette.tableRowAltBg,
                  fontSize: isThermal ? '6pt' : '8pt',
                  fontWeight: 800,
                  color: palette.mutedText,
                }}
              >
                نسخة العميل
              </p>
              <h2
                style={{
                  margin: isThermal ? '1.5mm 0 0' : '2mm 0 0',
                  fontSize: isThermal ? '11pt' : '15pt',
                  fontWeight: 900,
                  color: palette.text,
                }}
              >
                {documentTitle}
              </h2>
              <p style={{ ...labelStyle, marginTop: '1mm' }}>
                {showCosts ? 'بيان طلب وصيانة' : 'إثبات استلام قطعة لدى المركز'}
              </p>
            </div>

            <div style={{ flex: 1, textAlign: 'left' }}>
              <div
                style={{
                  display: 'inline-block',
                  minWidth: isThermal ? '24mm' : '36mm',
                  padding: isThermal ? '2mm' : '3mm 3.5mm',
                  borderRadius: '2.5mm',
                  background: palette.primary,
                  color: '#fff',
                  textAlign: 'center',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', fontWeight: 700, opacity: 0.92 }}>
                  رقم الإيصال
                </p>
                <p
                  style={{
                    margin: '1mm 0 0',
                    fontSize: isThermal ? '9pt' : '13pt',
                    fontWeight: 900,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    letterSpacing: '0.02em',
                  }}
                >
                  {job.receiptNo}
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isThermal ? '1fr 1fr' : 'repeat(4, 1fr)',
              background: palette.tableRowAltBg,
            }}
          >
            {[
              { label: 'تاريخ الاستلام', value: createdAt },
              { label: 'حالة الطلب', value: statusChip.label },
              { label: 'عدد القطع', value: String(totalQty) },
              { label: 'تاريخ الطباعة', value: printedAt },
            ].map((cell, idx, arr) => (
              <div
                key={cell.label}
                style={{
                  padding: isThermal ? '2mm' : '3mm 4mm',
                  borderLeft: idx < arr.length - 1 ? `1px solid ${palette.border}` : undefined,
                }}
              >
                <p style={labelStyle}>{cell.label}</p>
                <p style={{ ...valueStyle, fontSize: isThermal ? '8pt' : '10pt' }}>{cell.value}</p>
              </div>
            ))}
          </div>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isThermal ? '1fr' : '1fr 1fr',
            border: `1px solid ${palette.border}`,
            borderRadius: '2.5mm',
            overflow: 'hidden',
            marginBottom: isThermal ? '3mm' : '5mm',
          }}
        >
          {customerInfoRows.map(([label, value], index) => (
            <div
              key={label}
              style={{
                padding: isThermal ? '2mm' : '3mm 4mm',
                borderLeft:
                  !isThermal && index % infoColumns === 0 ? `1px solid ${palette.border}` : undefined,
                borderBottom:
                  index < customerInfoRows.length - infoColumns
                    ? `1px solid ${palette.border}`
                    : undefined,
                background: index % 2 === 0 ? palette.tableRowAltBg : '#fff',
              }}
            >
              <p style={labelStyle}>{label}</p>
              <p style={valueStyle}>{value}</p>
            </div>
          ))}
        </section>

        <section style={{ marginBottom: isThermal ? '3mm' : '5mm' }}>
          <p style={sectionTitle}>المنتجات المستلمة</p>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              border: `1.5px solid ${palette.primary}`,
              borderRadius: '2mm',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '7%' }}>م</th>
                <th style={{ ...thStyle, width: showCosts ? '22%' : '26%' }}>المنتج</th>
                <th style={{ ...thStyle, width: '14%' }}>السيريال</th>
                <th style={{ ...thStyle, width: '8%' }}>الكمية</th>
                <th style={{ ...thStyle, width: showCosts ? '16%' : '20%' }}>الملحقات</th>
                <th style={{ ...thStyle, width: showCosts ? '18%' : '25%' }}>وصف العطل</th>
                {showCosts ? <th style={{ ...thStyle, width: '15%' }}>التكلفة</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((item: RepairJobProduct, index) => (
                <tr key={item.itemId || index} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>{index + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>
                    {formatRepairPrintProductLabel(item)}
                    {item.inWarranty ? (
                      <div style={{ marginTop: '1mm', fontSize: isThermal ? '6pt' : '8pt', color: palette.success, fontWeight: 800 }}>
                        داخل الضمان
                      </div>
                    ) : null}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: isThermal ? '6pt' : '8.5pt',
                    }}
                  >
                    {item.serialNo || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                    {Math.max(1, Number(item.quantity || 1))}
                  </td>
                  <td style={tdStyle}>{item.accessories || '—'}</td>
                  <td style={tdStyle}>{item.diagnosis || problemText || '—'}</td>
                  {showCosts ? (
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                      {item.inWarranty ? 'مجاني' : money(item.finalCost, decimalPlaces)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {showProblemBlock ? (
          <section
            style={{
              border: `1px solid ${palette.border}`,
              borderRadius: '2.5mm',
              padding: isThermal ? '2.5mm' : '3.5mm 4mm',
              marginBottom: isThermal ? '3mm' : '5mm',
              background: palette.tableRowAltBg,
            }}
          >
            <p style={{ ...sectionTitle, marginBottom: '1.5mm' }}>ملاحظات الاستلام</p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: isThermal ? '7.5pt' : '10pt', fontWeight: 600 }}>
              {problemText}
            </p>
          </section>
        ) : null}

        {parts.length > 0 && showCosts ? (
          <section style={{ marginBottom: isThermal ? '3mm' : '5mm' }}>
            <p style={sectionTitle}>قطع الغيار المستخدمة</p>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: `1.5px solid ${palette.primary}`,
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
          </section>
        ) : null}

        <section
          style={{
            border: `1.5px solid ${palette.primary}`,
            borderRadius: '2.5mm',
            padding: isThermal ? '2.5mm' : '4mm',
            marginBottom: isThermal ? '4mm' : '7mm',
            background: palette.tableRowAltBg,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <p style={{ margin: 0, fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, lineHeight: 1.7 }}>
            {acknowledgment}
          </p>
          {showQr ? (
            <p style={{ ...labelStyle, marginTop: '2mm' }}>
              للمتابعة: امسح رمز QR أو استخدم رقم الإيصال مع رقم الهاتف المسجّل.
            </p>
          ) : null}
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: showQr
              ? (isThermal ? '1fr' : '1.1fr 1.1fr 0.9fr')
              : (isThermal ? '1fr' : '1fr 1fr'),
            gap: isThermal ? '6mm' : '8mm',
            alignItems: 'end',
            marginTop: isThermal ? '4mm' : '6mm',
          }}
        >
          <div
            style={{
              minHeight: isThermal ? '14mm' : '22mm',
              borderTop: `1px solid ${palette.border}`,
              paddingTop: '2.5mm',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: isThermal ? '7.5pt' : '9.5pt', fontWeight: 900 }}>توقيع موظف الاستلام</p>
            <p style={{ ...labelStyle, marginTop: '6mm' }}>الاسم / التوقيع</p>
          </div>
          <div
            style={{
              minHeight: isThermal ? '14mm' : '22mm',
              borderTop: `1px solid ${palette.border}`,
              paddingTop: '2.5mm',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: isThermal ? '7.5pt' : '9.5pt', fontWeight: 900 }}>توقيع العميل</p>
            <p style={{ ...labelStyle, marginTop: '6mm' }}>أقرّ بالاستلام والبيانات أعلاه</p>
          </div>
          {showQr && trackUrl ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ ...labelStyle, marginBottom: '2mm' }}>متابعة الطلب</p>
              <div
                style={{
                  display: 'inline-block',
                  border: `1px solid ${palette.border}`,
                  borderRadius: '2mm',
                  padding: '2.5mm',
                  background: '#fff',
                }}
              >
                <QRCodeSVG value={trackUrl} size={isThermal ? 72 : 96} includeMargin level="M" />
              </div>
              <p
                style={{
                  margin: '2mm 0 0',
                  fontSize: isThermal ? '6pt' : '7.5pt',
                  fontWeight: 700,
                  color: palette.mutedText,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {job.receiptNo}
              </p>
            </div>
          ) : null}
        </section>

        <footer
          style={{
            marginTop: isThermal ? '5mm' : '9mm',
            paddingTop: '2.5mm',
            borderTop: `1px solid ${palette.border}`,
            textAlign: 'center',
          }}
        >
          {branchContact ? (
            <p style={{ margin: 0, fontSize: isThermal ? '6.5pt' : '8pt', fontWeight: 700, color: palette.text }}>
              {branch?.name ? `${branch.name} · ` : ''}{branchContact}
            </p>
          ) : null}
          <p
            style={{
              margin: branchContact ? '1.5mm 0 0' : 0,
              fontSize: isThermal ? '6pt' : '8pt',
              color: palette.mutedText,
              fontWeight: 600,
            }}
          >
            {footerLine}
          </p>
        </footer>
      </div>
    );
  },
);
