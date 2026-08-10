import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { PrintExtraLines } from '@/src/components/erp/PrintExtraLines';
import {
  formatRepairPrintProductLabel,
  repairCustomerReceiptAcknowledgment,
  repairCustomerReceiptTitle,
  repairReceiptCopyLabel,
  resolveRepairJobPrintProducts,
  type RepairPrintStatusMap,
  type RepairReceiptCopyKind,
} from '../lib/repairJobPrint';
import { shouldShowRepairPrintCosts } from '../lib/repairJobIntake';
import {
  manufacturerWarrantyLineLabel,
  manufacturerWarrantyScopeLabel,
} from '../lib/repairManufacturerWarranty';
import { resolveRepairStatusChip } from '../lib/repairStatusChipStyle';
import type { RepairBranch, RepairJob, RepairJobProduct } from '../types';

export type RepairJobPrintProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  trackUrl?: string;
  printSettings?: PrintTemplateSettings;
  statusMap?: RepairPrintStatusMap;
  /** Which filing copy this sheet is — defaults to customer. */
  copyKind?: RepairReceiptCopyKind;
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
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

/** Compact customer receipt — dense spacing so multi-product jobs fit one sheet. */
export const RepairJobPrint = React.forwardRef<HTMLDivElement, RepairJobPrintProps>(
  function RepairJobPrint({ job, branch, products, trackUrl, printSettings, statusMap, copyKind = 'customer' }, ref) {
    if (!job) return <div ref={ref} />;

    // Customer receipt is always A5 (same sheet as the internal card).
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const doc = resolvePrintDocumentConfig(ps, 'repairJobReceipt');
    const palette = getPrintThemePalette(ps);
    const font = resolvePrintFont(ps);
    const paper = PAPER_DIMENSIONS.a5;
    const isThermal = false;
    const dense = true;
    const copyLabel = repairReceiptCopyLabel(copyKind);
    const isCenterCopy = copyKind === 'center';
    const rows = resolveRepairJobPrintProducts(job, products);
    const createdAt = formatDateTime(job.createdAt);
    const printedAt = new Date().toLocaleString('ar-EG');
    const statusChip = resolveRepairStatusChip(job.status, statusMap);
    const warrantyLabel = manufacturerWarrantyScopeLabel(job.warrantyScope, rows);
    const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
    const showQr = Boolean(trackUrl) && doc.isFieldVisible('qrCode');
    const showCosts =
      doc.isFieldVisible('costs') && shouldShowRepairPrintCosts(job, products);
    const decimalPlaces = Math.max(0, Math.min(3, Number(ps.decimalPlaces ?? 0)));
    const brandName = String(doc.headerText || '').trim() || 'مركز الصيانة';
    const documentTitle = repairCustomerReceiptTitle(showCosts);
    const acknowledgment = repairCustomerReceiptAcknowledgment(showCosts);
    const branchContact = [branch?.address, branch?.phone].filter(Boolean).join(' — ');
    const totalQty = rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity || 1)), 0);
    const problemText = String(job.problemDescription || '').trim();
    const showProblemBlock = Boolean(
      problemText
      && !rows.some((row) => String(row.diagnosis || '').trim() === problemText),
    );
    const configuredFooter = String(doc.footerText || '').trim();
    const showProducts = doc.isFieldVisible('products');
    const showParts = doc.isFieldVisible('parts');
    const showSignatures = doc.isFieldVisible('signatures');

    const pad = dense ? '1.2mm 1.5mm' : '1.6mm 2mm';
    const gap = dense ? '2mm' : '2.5mm';
    const labelStyle: React.CSSProperties = {
      margin: 0,
      color: palette.mutedText,
      fontSize: isThermal ? '5.5pt' : dense ? '6.5pt' : '7pt',
      fontWeight: 700,
      lineHeight: 1.2,
    };
    const valueStyle: React.CSSProperties = {
      margin: 0,
      color: palette.text,
      fontSize: isThermal ? '7pt' : dense ? '8pt' : '8.5pt',
      fontWeight: 800,
      overflowWrap: 'anywhere',
      lineHeight: 1.25,
    };
    const sectionTitle: React.CSSProperties = {
      margin: `0 0 ${dense ? '1mm' : '1.2mm'}`,
      color: palette.primary,
      fontSize: isThermal ? '7.5pt' : dense ? '8.5pt' : '9pt',
      fontWeight: 900,
      lineHeight: 1.2,
    };
    const thStyle: React.CSSProperties = {
      border: `1px solid ${palette.primary}`,
      padding: dense ? '1mm 0.8mm' : '1.2mm 1mm',
      fontSize: isThermal ? '5.5pt' : dense ? '6.5pt' : '7pt',
      background: palette.primary,
      color: '#ffffff',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      fontWeight: 900,
      textAlign: 'center',
      lineHeight: 1.2,
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: dense ? '1mm 0.8mm' : '1.2mm 1mm',
      fontSize: isThermal ? '5.5pt' : dense ? '7pt' : '7.5pt',
      color: palette.text,
      verticalAlign: 'top',
      lineHeight: 1.25,
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

    const footerLine =
      configuredFooter && configuredFooter !== DEFAULT_PRINT_TEMPLATE.footerText
        ? configuredFooter
        : `شكرًا لثقتكم بـ ${brandName} — يُرجى الاحتفاظ بهذا الإيصال حتى استلام المنتج.`;

    return (
      <div
        ref={ref}
        dir="rtl"
        lang="ar"
        className="print-root print-report arabic-export-root"
        style={{
          fontFamily: font.fontFamily,
          // Keep A5 width on screen so off-screen print parking cannot cover the job page.
          // @media print (index.css + printManager) expands to full printable width.
          width: '100%',
          maxWidth: paper.width,
          minHeight: paper.minHeight,
          margin: '0 auto',
          padding: isThermal ? '2.5mm 2mm' : dense ? '4mm 4.5mm' : '5mm 6mm',
          background: '#fff',
          color: palette.text,
          fontSize: isThermal ? font.denseFontSize : dense ? font.denseFontSize : font.fontSize,
          lineHeight: 1.3,
          boxSizing: 'border-box',
          letterSpacing: 'normal',
        }}
      >
        <header
          style={{
            borderBottom: `2px solid ${palette.primary}`,
            marginBottom: gap,
            paddingBottom: dense ? '2mm' : '2.5mm',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '2mm',
            }}
          >
            <div style={{ flex: 1.1, textAlign: 'right', minWidth: 0, display: 'flex', gap: '2mm', alignItems: 'flex-start' }}>
              {ps.logoUrl ? (
                <img
                  src={ps.logoUrl}
                  alt=""
                  style={{
                    maxHeight: dense ? '8mm' : '10mm',
                    maxWidth: dense ? '24mm' : '32mm',
                    objectFit: 'contain',
                    display: 'block',
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: isThermal ? '9pt' : dense ? '11pt' : '12pt',
                    fontWeight: 900,
                    color: '#0f172a',
                    lineHeight: 1.15,
                    letterSpacing: 'normal',
                  }}
                >
                  {brandName}
                </h1>
                <p
                  style={{
                    margin: '0.3mm 0 0',
                    fontSize: '6.5pt',
                    fontWeight: 700,
                    color: palette.primary,
                    letterSpacing: 'normal',
                  }}
                >
                  Factory PRODUCTION SYSTEM
                </p>
                <p style={{ ...labelStyle, marginTop: '0.4mm' }}>
                  {branch?.name || 'مركز الصيانة'}
                  {branchContact ? ` · ${branchContact}` : ''}
                </p>
              </div>
            </div>

            <div style={{ flex: 1.2, textAlign: 'center', minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  display: 'inline-block',
                  padding: '0.5mm 2mm',
                  borderRadius: '1.2mm',
                  background: isCenterCopy ? palette.primary : '#EEF0FA',
                  fontSize: isThermal ? '5.5pt' : '6.5pt',
                  fontWeight: 800,
                  color: isCenterCopy ? '#fff' : palette.primary,
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                  letterSpacing: 'normal',
                }}
              >
                {copyLabel}
              </p>
              <h2
                style={{
                  margin: '0.8mm 0 0',
                  fontSize: isThermal ? '9pt' : dense ? '10.5pt' : '11.5pt',
                  fontWeight: 900,
                  color: palette.text,
                  lineHeight: 1.15,
                  letterSpacing: 'normal',
                }}
              >
                {documentTitle}
              </h2>
              <p style={{ ...labelStyle, marginTop: '0.3mm' }}>
                {showCosts ? 'بيان طلب وصيانة' : 'إثبات استلام قطعة لدى المركز'}
              </p>
            </div>

            <div style={{ flex: 0.9, textAlign: 'left' }}>
              <div
                style={{
                  display: 'inline-block',
                  minWidth: dense ? '22mm' : '28mm',
                  padding: dense ? '1.2mm 1.5mm' : '1.5mm 2mm',
                  borderRadius: '1.5mm',
                  background: palette.primary,
                  color: '#fff',
                  textAlign: 'center',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                <p style={{ margin: 0, fontSize: isThermal ? '5pt' : '6pt', fontWeight: 700, opacity: 0.92 }}>
                  رقم الإيصال
                </p>
                <p
                  style={{
                    margin: '0.4mm 0 0',
                    fontSize: isThermal ? '8pt' : dense ? '10pt' : '11pt',
                    fontWeight: 900,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    letterSpacing: '0.01em',
                    lineHeight: 1.1,
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
                  padding: pad,
                  borderLeft: idx < arr.length - 1 ? `1px solid ${palette.border}` : undefined,
                }}
              >
                <p style={labelStyle}>{cell.label}</p>
                <p style={{ ...valueStyle, marginTop: '0.3mm' }}>{cell.value}</p>
              </div>
            ))}
          </div>
        </header>

        <PrintExtraLines lines={doc.customLines} dense />

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isThermal ? '1fr' : '1fr 1fr',
            border: `1px solid ${palette.border}`,
            borderRadius: '1.5mm',
            overflow: 'hidden',
            marginBottom: gap,
          }}
        >
          {customerInfoRows.map(([label, value], index) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '1.5mm',
                padding: pad,
                borderLeft:
                  !isThermal && index % infoColumns === 0 ? `1px solid ${palette.border}` : undefined,
                borderBottom:
                  index < customerInfoRows.length - infoColumns
                    ? `1px solid ${palette.border}`
                    : undefined,
                background: index % 2 === 0 ? palette.tableRowAltBg : '#fff',
              }}
            >
              <p style={{ ...labelStyle, flexShrink: 0, minWidth: dense ? '14mm' : '16mm' }}>{label}</p>
              <p style={{ ...valueStyle, flex: 1 }}>{value}</p>
            </div>
          ))}
        </section>

        {showProducts ? (
        <section style={{ marginBottom: gap }}>
          <p style={sectionTitle}>المنتجات المستلمة ({rows.length})</p>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              border: `1px solid ${palette.primary}`,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '5%' }}>م</th>
                <th style={{ ...thStyle, width: showCosts ? '24%' : '28%' }}>المنتج</th>
                <th style={{ ...thStyle, width: '12%' }}>السيريال</th>
                <th style={{ ...thStyle, width: '7%' }}>الكمية</th>
                <th style={{ ...thStyle, width: showCosts ? '15%' : '18%' }}>الملحقات</th>
                <th style={{ ...thStyle, width: showCosts ? '22%' : '30%' }}>وصف العطل</th>
                {showCosts ? <th style={{ ...thStyle, width: '15%' }}>التكلفة</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((item: RepairJobProduct, index) => (
                <tr key={item.itemId || index} style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>{index + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>
                    {formatRepairPrintProductLabel(item)}
                    <div
                      style={{
                        marginTop: '0.3mm',
                        fontSize: isThermal ? '5pt' : '6pt',
                        color: item.inWarranty ? palette.success : palette.mutedText,
                        fontWeight: 800,
                      }}
                    >
                      {manufacturerWarrantyLineLabel(item.inWarranty)}
                    </div>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: isThermal ? '5pt' : '6.5pt',
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
        ) : null}

        {showProblemBlock ? (
          <section
            style={{
              border: `1px solid ${palette.border}`,
              borderRadius: '1.5mm',
              padding: pad,
              marginBottom: gap,
              background: palette.tableRowAltBg,
            }}
          >
            <p style={{ ...sectionTitle, marginBottom: '0.5mm' }}>ملاحظات الاستلام</p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: isThermal ? '6.5pt' : '7.5pt', fontWeight: 600, lineHeight: 1.3 }}>
              {problemText}
            </p>
          </section>
        ) : null}

        {parts.length > 0 && showCosts && showParts ? (
          <section style={{ marginBottom: gap }}>
            <p style={sectionTitle}>قطع الغيار المستخدمة</p>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: `1px solid ${palette.primary}`,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '8%' }}>م</th>
                  <th style={{ ...thStyle, width: '55%' }}>القطعة</th>
                  <th style={{ ...thStyle, width: '15%' }}>الكمية</th>
                  <th style={{ ...thStyle, width: '22%' }}>النطاق</th>
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
            border: `1px solid ${palette.primary}`,
            borderRadius: '1.5mm',
            padding: pad,
            marginBottom: gap,
            background: palette.tableRowAltBg,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '7pt', fontWeight: 700, lineHeight: 1.35 }}>
            {acknowledgment}
            {showQr ? ' للمتابعة: امسح رمز QR أو استخدم رقم الإيصال مع رقم الهاتف.' : ''}
          </p>
        </section>

        {showSignatures ? (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: showQr
              ? (isThermal ? '1fr' : '1fr 1fr 0.7fr')
              : (isThermal ? '1fr' : '1fr 1fr'),
            gap: dense ? '3mm' : '4mm',
            alignItems: 'end',
            marginTop: dense ? '2mm' : '3mm',
          }}
        >
          <div
            style={{
              minHeight: dense ? '10mm' : '12mm',
              borderTop: `1px solid ${palette.border}`,
              paddingTop: '1.2mm',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: isThermal ? '6.5pt' : '7.5pt', fontWeight: 900 }}>توقيع موظف الاستلام</p>
            <p style={{ ...labelStyle, marginTop: dense ? '3mm' : '4mm' }}>الاسم / التوقيع</p>
          </div>
          <div
            style={{
              minHeight: dense ? '10mm' : '12mm',
              borderTop: `1px solid ${palette.border}`,
              paddingTop: '1.2mm',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: isThermal ? '6.5pt' : '7.5pt', fontWeight: 900 }}>توقيع العميل</p>
            <p style={{ ...labelStyle, marginTop: dense ? '3mm' : '4mm' }}>أقرّ بالاستلام والبيانات أعلاه</p>
          </div>
          {showQr && trackUrl ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ ...labelStyle, marginBottom: '0.8mm' }}>متابعة الطلب</p>
              <div
                style={{
                  display: 'inline-block',
                  border: `1px solid ${palette.border}`,
                  borderRadius: '1.5mm',
                  padding: '1.2mm',
                  background: '#fff',
                }}
              >
                <QRCodeSVG value={trackUrl} size={isThermal ? 52 : dense ? 64 : 72} includeMargin={false} level="M" />
              </div>
              <p
                style={{
                  margin: '0.8mm 0 0',
                  fontSize: isThermal ? '5pt' : '6pt',
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
        ) : showQr && trackUrl ? (
          <div style={{ textAlign: 'center', marginTop: dense ? '2mm' : '3mm' }}>
            <p style={{ ...labelStyle, marginBottom: '0.8mm' }}>متابعة الطلب</p>
            <QRCodeSVG value={trackUrl} size={dense ? 64 : 72} includeMargin={false} level="M" />
          </div>
        ) : null}

        <footer
          style={{
            marginTop: dense ? '3mm' : '4mm',
            paddingTop: '1.2mm',
            borderTop: `1px solid ${palette.border}`,
            textAlign: 'center',
          }}
        >
          {branchContact ? (
            <p style={{ margin: 0, fontSize: isThermal ? '5.5pt' : '6.5pt', fontWeight: 700, color: palette.text }}>
              {branch?.name ? `${branch.name} · ` : ''}{branchContact}
            </p>
          ) : null}
          <p
            style={{
              margin: branchContact ? '0.6mm 0 0' : 0,
              fontSize: isThermal ? '5pt' : '6.5pt',
              color: palette.mutedText,
              fontWeight: 600,
              lineHeight: 1.25,
            }}
          >
            {footerLine}
          </p>
        </footer>
      </div>
    );
  },
);
