import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
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
  isFullManufacturerWarrantyJob,
  manufacturerWarrantyLineLabel,
  manufacturerWarrantyScopeLabel,
} from '../lib/repairManufacturerWarranty';
import { resolveRepairStatusChip } from '../lib/repairStatusChipStyle';
import type { RepairBranch, RepairJob, RepairJobProduct, RepairPaymentAuthorization } from '../types';
import { buildRepairPaymentAccountBreakdown } from '../lib/repairPaymentProductBreakdown';

export type RepairJobPrintProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  authorization?: RepairPaymentAuthorization | null;
  trackUrl?: string;
  printSettings?: PrintTemplateSettings;
  statusMap?: RepairPrintStatusMap;
  /** Which filing copy this sheet is — defaults to customer. */
  copyKind?: RepairReceiptCopyKind;
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

/** Compact customer receipt — engine chrome + dense A5 body. */
export const RepairJobPrint = React.forwardRef<HTMLDivElement, RepairJobPrintProps>(
  function RepairJobPrint({ job, branch, products, authorization, trackUrl, printSettings, statusMap, copyKind = 'customer' }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const doc = resolvePrintDocumentConfig(ps, 'repairJobReceipt');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const copyLabel = repairReceiptCopyLabel(copyKind);
    const rows = resolveRepairJobPrintProducts(job, products);
    const createdAt = formatDateTime(job.createdAt);
    const printedAt = new Date().toLocaleString('ar-EG');
    const statusChip = resolveRepairStatusChip(job.status, statusMap);
    const warrantyLabel = manufacturerWarrantyScopeLabel(job.warrantyScope, rows);
    const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
    const showQr = Boolean(trackUrl) && doc.isFieldVisible('qrCode');
    const showCosts =
      doc.isFieldVisible('costs') && shouldShowRepairPrintCosts(job, products);
    const account = showCosts
      ? buildRepairPaymentAccountBreakdown(
        { ...job, jobProducts: products && products.length > 0 ? products : job.jobProducts },
        authorization,
      )
      : { products: [], unassigned: [] };
    const workByItemId = new Map(account.products.map((row) => [row.itemId, row]));
    const pricedWorkRows = [
      ...account.products.flatMap((product) => product.works.map((work, index) => ({
        key: `${product.itemId}-${work.kind}-${index}`,
        product: product.productLabel,
        work,
      }))),
      ...account.unassigned.map((work, index) => ({
        key: `unassigned-${work.kind}-${index}`,
        product: 'غير مربوط بمنتج',
        work,
      })),
    ];
    const decimalPlaces = Math.max(0, Math.min(3, Number(ps.decimalPlaces ?? 0)));
    const brandName = String(doc.headerText || '').trim() || 'مركز الصيانة';
    const documentTitle = repairCustomerReceiptTitle(showCosts);
    const acknowledgment = repairCustomerReceiptAcknowledgment(showCosts, {
      skipCustomerApproval: isFullManufacturerWarrantyJob(job),
    });
    const branchContact = [branch?.address, branch?.phone].filter(Boolean).join(' — ');
    const totalQty = rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity || 1)), 0);
    const problemText = String(job.problemDescription || '').trim();
    const showProblemBlock = Boolean(
      problemText
      && !rows.some((row) => String(row.diagnosis || '').trim() === problemText),
    );
    const showProducts = doc.isFieldVisible('products');
    const showParts = doc.isFieldVisible('parts');
    const showSignatures = doc.isFieldVisible('signatures');
    const configuredFooter = String(doc.footerText || '').trim();
    const footerLine =
      configuredFooter && configuredFooter !== DEFAULT_PRINT_TEMPLATE.footerText
        ? configuredFooter
        : `شكرًا لثقتكم بـ ${brandName} — يُرجى الاحتفاظ بهذا الإيصال حتى استلام المنتج.`;

    const productColumns = [
      { key: 'idx', header: 'م', width: '6%', align: 'center' as const },
      { key: 'product', header: 'المنتج', width: showCosts ? '24%' : '28%' },
      { key: 'serial', header: 'السيريال', width: '14%', align: 'center' as const },
      { key: 'qty', header: 'الكمية', width: '8%', align: 'center' as const },
      { key: 'accessories', header: 'الملحقات', width: showCosts ? '15%' : '18%' },
      { key: 'diagnosis', header: 'وصف العطل', width: showCosts ? '20%' : '26%' },
      ...(showCosts ? [{ key: 'cost', header: 'التكلفة', width: '13%', align: 'center' as const }] : []),
    ];

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={brandName}
        documentType={`${documentTitle} · ${copyLabel}`}
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={footerLine || Factory_REPAIR_FOOTER_TAGLINE}
        showVersion={false}
        paperWidth="148mm"
        minHeight="210mm"
        padding="4mm 4.5mm"
        dense
        fontFamily={font.fontFamily}
        fontSize={font.denseFontSize}
        extraLines={doc.customLines}
        metaCards={[
          { label: 'رقم الإيصال', value: job.receiptNo || '—' },
          { label: 'تاريخ الاستلام', value: createdAt },
          { label: 'حالة الطلب', value: statusChip.label },
          { label: 'عدد القطع', value: String(totalQty) },
          { label: 'مركز الخدمة', value: branch?.name || '—' },
          ...(branchContact ? [{ label: 'التواصل', value: branchContact }] : []),
        ]}
        kpis={[
          { label: 'العميل', value: job.customerName || '—', tone: 'indigo' as const },
          { label: 'الهاتف', value: job.customerPhone || '—' },
          { label: 'الضمان', value: warrantyLabel },
          {
            label: 'التكلفة',
            value: showCosts ? money(job.finalCost, decimalPlaces) : 'تُحدد بعد التشخيص',
            tone: showCosts ? ('green' as const) : ('default' as const),
          },
        ]}
        signatures={
          showSignatures && !showQr
            ? [
                { title: 'توقيع موظف الاستلام' },
                { title: 'توقيع العميل', detail: 'أقرّ بالاستلام والبيانات أعلاه' },
              ]
            : undefined
        }
      >
        {job.customerAddress ? (
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700 }}>
            العنوان: {job.customerAddress}
          </p>
        ) : null}

        {showProducts ? (
          <>
            <FactoryPrintSectionTitle title={`المنتجات المستلمة (${rows.length})`} />
            <FactoryPrintTable
              dense
              brandAccent={accent}
              printSettings={ps}
              columns={productColumns}
              rows={rows.map((item, index) => ({
                key: item.itemId || String(index),
                cells: {
                  idx: index + 1,
                  product: (
                    <span>
                      <strong>{formatRepairPrintProductLabel(item)}</strong>
                      <br />
                      <span style={{ fontSize: 9, fontWeight: 800 }}>
                        {manufacturerWarrantyLineLabel(item.inWarranty)}
                      </span>
                    </span>
                  ),
                  serial: item.serialNo || '—',
                  qty: Math.max(1, Number(item.quantity || 1)),
                  accessories: item.accessories || '—',
                  diagnosis: item.diagnosis || problemText || '—',
                  cost: (() => {
                    const priced = workByItemId.get(String(item.itemId || ''));
                    if (item.inWarranty || priced?.inWarranty) return 'مجاني';
                    const lineCost = priced?.customerTotal ?? Number(item.finalCost || item.estimatedCost || 0);
                    return money(lineCost, decimalPlaces);
                  })(),
                },
              }))}
            />
          </>
        ) : null}

        {showProblemBlock ? (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <FactoryPrintSectionTitle title="ملاحظات الاستلام" />
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 10, fontWeight: 600 }}>
              {problemText}
            </p>
          </div>
        ) : null}

        {showCosts && pricedWorkRows.length > 0 ? (
          <>
            <FactoryPrintSectionTitle title="تفصيل الخدمة والقطعة لكل منتج" />
            <FactoryPrintTable
              dense
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'product', header: 'المنتج', width: '28%' },
                { key: 'kind', header: 'النوع', width: '12%', align: 'center' },
                { key: 'name', header: 'البيان', width: '32%' },
                { key: 'qty', header: 'الكمية', width: '10%', align: 'center' },
                { key: 'customer', header: 'على العميل', width: '18%', align: 'center' },
              ]}
              rows={pricedWorkRows.map((row) => ({
                key: row.key,
                cells: {
                  product: row.product,
                  kind: row.work.kind === 'part' ? 'قطعة' : 'خدمة',
                  name: row.work.name,
                  qty: row.work.quantity,
                  customer: row.work.inWarranty ? 'مجاني' : money(row.work.customerTotal, decimalPlaces),
                },
              }))}
            />
          </>
        ) : null}

        {parts.length > 0 && showCosts && showParts && pricedWorkRows.every((row) => row.work.kind !== 'part') ? (
          <>
            <FactoryPrintSectionTitle title="قطع الغيار المستخدمة" />
            <FactoryPrintTable
              dense
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'idx', header: 'م', width: '8%', align: 'center' },
                { key: 'part', header: 'القطعة', width: '55%' },
                { key: 'qty', header: 'الكمية', width: '15%', align: 'center' },
                { key: 'scope', header: 'النطاق', width: '22%', align: 'center' },
              ]}
              rows={parts.map((part, index) => ({
                key: `${part.partId}-${index}`,
                cells: {
                  idx: index + 1,
                  part: part.partName,
                  qty: part.quantity,
                  scope: part.scope === 'product' ? (part.productName || 'منتج') : 'الطلب',
                },
              }))}
            />
          </>
        ) : null}

        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: '6px 8px',
          }}
        >
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, lineHeight: 1.35 }}>
            {acknowledgment}
            {showQr ? ' للمتابعة: امسح رمز QR أو استخدم رقم الإيصال مع رقم الهاتف.' : ''}
          </p>
        </div>

        {showSignatures && showQr ? (
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: trackUrl ? '1fr 1fr 0.7fr' : '1fr 1fr',
              gap: 12,
              alignItems: 'end',
              marginTop: 12,
            }}
          >
            <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: 6, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900 }}>توقيع موظف الاستلام</p>
              <p style={{ margin: '8px 0 0', fontSize: 9, color: '#64748b' }}>الاسم / التوقيع</p>
            </div>
            <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: 6, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900 }}>توقيع العميل</p>
              <p style={{ margin: '8px 0 0', fontSize: 9, color: '#64748b' }}>أقرّ بالاستلام والبيانات أعلاه</p>
            </div>
            {trackUrl ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: '#64748b' }}>متابعة الطلب</p>
                <QRCodeSVG value={trackUrl} size={64} includeMargin={false} level="M" />
                <p style={{ margin: '4px 0 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>
                  {job.receiptNo}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {!showSignatures && showQr && trackUrl ? (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: '#64748b' }}>متابعة الطلب</p>
            <QRCodeSVG value={trackUrl} size={64} includeMargin={false} level="M" />
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);
