import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { PRINT_SURFACE } from '@/utils/print/printSurface';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import {
  FactoryPrintTable,
  FactoryPrintTableAccentValue,
} from '@/src/components/erp/FactoryPrintTable';
import {
  isFullManufacturerWarrantyJob,
  manufacturerWarrantyScopeLabel,
} from '../lib/repairManufacturerWarranty';
import {
  buildRepairPaymentAccountBreakdown,
  type RepairPaymentWorkLine,
} from '../lib/repairPaymentProductBreakdown';
import type { RepairBranch, RepairJob, RepairPayment, RepairPaymentAuthorization } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

const methodLabel = (method?: string) =>
  method === 'card' ? 'بطاقة' : method === 'bank_transfer' ? 'تحويل بنكي' : 'نقدي';

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const WORK_COLUMNS = [
  { key: 'kind', header: 'النوع', width: '14%', align: 'center' as const },
  { key: 'name', header: 'البيان', width: '38%' },
  { key: 'qty', header: 'الكمية', width: '12%', align: 'center' as const },
  { key: 'value', header: 'القيمة', width: '18%', align: 'center' as const },
  { key: 'customer', header: 'على العميل', width: '18%', align: 'center' as const },
];

const kindLabel = (kind: RepairPaymentWorkLine['kind']) => (kind === 'part' ? 'قطعة' : 'خدمة');

function PrintInfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div
      className="print-info-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        marginBottom: 16,
        overflow: 'hidden',
        borderRadius: 8,
        border: `1px solid ${PRINT_SURFACE.border}`,
      }}
    >
      {items.map(([label, value], index) => (
        <div
          key={`${label}-${index}`}
          className="print-info-cell"
          style={{
            padding: '10px 12px',
            background: index % 2 === 0 ? PRINT_SURFACE.bg : PRINT_SURFACE.card,
            borderBottom: index < items.length - 2 ? `1px solid ${PRINT_SURFACE.border}` : undefined,
            borderInlineEnd: index % 2 === 0 ? `1px solid ${PRINT_SURFACE.border}` : undefined,
            minWidth: 0,
          }}
        >
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 10,
              fontWeight: 800,
              color: PRINT_SURFACE.muted,
              textAlign: 'right',
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 800,
              color: PRINT_SURFACE.text,
              textAlign: 'right',
              wordBreak: 'break-word',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function customerAmountCell(work: Pick<RepairPaymentWorkLine, 'inWarranty' | 'customerTotal'>, accent: string) {
  if (work.inWarranty || work.customerTotal <= 0) {
    return work.inWarranty ? 'مجاني' : money(0);
  }
  return <FactoryPrintTableAccentValue accent={accent}>{money(work.customerTotal)}</FactoryPrintTableAccentValue>;
}

function workRows(works: RepairPaymentWorkLine[], keyPrefix: string, accent: string) {
  return works.map((work, index) => ({
    key: `${keyPrefix}-${work.kind}-${index}`,
    cells: {
      kind: kindLabel(work.kind),
      name: work.name,
      qty: work.quantity,
      value: money(work.catalogTotal),
      customer: customerAmountCell(work, accent),
    },
  }));
}

export const RepairPaymentPrint = React.forwardRef<
  HTMLDivElement,
  {
    authorization: RepairPaymentAuthorization | null;
    payment?: RepairPayment | null;
    job?: RepairJob | null;
    branch?: RepairBranch | null;
    printSettings?: PrintTemplateSettings;
  }
>(function RepairPaymentPrint({ authorization, payment, job, branch, printSettings }, ref) {
  if (!authorization) return <div ref={ref} />;

  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const doc = resolvePrintDocumentConfig(ps, 'repairPayment');
  const accent = resolvePrintAccentHex(ps.primaryColor);
  const font = resolvePrintFont(ps);
  const isReceipt = Boolean(payment);
  const isUnpriced =
    Number(authorization.grossAmount || 0) <= 0 && Number(authorization.warrantyGrossAmount || 0) <= 0;
  const account = buildRepairPaymentAccountBreakdown(job, authorization);
  const fullWarranty = Boolean(job && isFullManufacturerWarrantyJob(job));
  const warrantyGross = Number(authorization.warrantyGrossAmount || 0);
  const billableGross = Number(authorization.grossAmount || 0);
  const scopeLabel = manufacturerWarrantyScopeLabel(
    authorization.warrantyScope || job?.warrantyScope,
    job?.jobProducts,
  );
  const printDate = new Date(payment?.createdAt || authorization.createdAt).toLocaleString('ar-EG');
  const statusLabel = isUnpriced
    ? 'غير صالح — بدون تسعير'
    : authorization.status === 'paid'
      ? 'مدفوع بالكامل'
      : authorization.status === 'partial'
        ? 'مدفوع جزئيًا'
        : authorization.status === 'pending_approval'
          ? 'بانتظار اعتماد'
          : 'معتمد';

  return (
    <FactoryPrintShell
      ref={ref}
      companyName={doc.headerText || 'مركز الصيانة'}
      documentType={isReceipt ? 'إيصال تحصيل صيانة' : 'تفصيل حساب طلب صيانة'}
      printDate={printDate}
      logoUrl={ps.logoUrl}
      brandAccent={accent}
      footerTagline={doc.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
      extraLines={doc.customLines}
      paperWidth="210mm"
      minHeight="297mm"
      padding="10mm 12mm"
      fontFamily={font.fontFamily}
      fontSize={font.fontSize}
      metaCards={
        doc.isFieldVisible('meta')
          ? [
              { label: 'رقم المستند', value: payment?.paymentNo || authorization.authorizationNo },
              { label: 'رقم طلب الصيانة', value: authorization.receiptNo || '—' },
              { label: 'الفرع', value: branch?.name || 'مركز الصيانة' },
              { label: 'وضع الضمان', value: scopeLabel },
            ]
          : undefined
      }
      kpis={
        doc.isFieldVisible('kpis')
          ? isReceipt
            ? [
                { label: 'المبلغ المستلم', value: money(payment?.amount), tone: 'indigo' },
                { label: 'وسيلة الدفع', value: methodLabel(payment?.method), tone: 'green' },
                { label: 'صافي المطلوب', value: money(authorization.netAmount), tone: 'default' },
                { label: 'المتبقي', value: money(authorization.balanceDue), tone: Number(authorization.balanceDue || 0) > 0 ? 'red' : 'green' },
              ]
            : [
                { label: 'صافي المطلوب', value: money(authorization.netAmount), tone: 'indigo' },
                { label: 'المدفوع', value: money(authorization.paidAmount), tone: 'green' },
                { label: 'المتبقي', value: money(authorization.balanceDue), tone: Number(authorization.balanceDue || 0) > 0 ? 'red' : 'default' },
                { label: 'حالة الإذن', value: statusLabel, tone: isUnpriced ? 'red' : 'default' },
              ]
          : undefined
      }
      signatures={
        doc.isFieldVisible('signatures')
          ? [
              { title: 'توقيع العميل' },
              { title: 'موظف الاستقبال' },
              { title: 'الختم والاعتماد' },
            ]
          : undefined
      }
    >
      {doc.isFieldVisible('customerBlock') ? (
        <PrintInfoGrid
          items={[
            ['العميل', job?.customerName || '—'],
            ['الهاتف', job?.customerPhone || '—'],
            ['إجمالي بدون ضمان', money(billableGross)],
            ['إجمالي داخل الضمان', money(warrantyGross)],
            ['إجمالي الخدمات (للتحصيل)', money(authorization.serviceGross)],
            ['إجمالي قطع الغيار (للتحصيل)', money(authorization.partsGross)],
            ['الخصم المعتمد', money(authorization.discountAmount)],
            ['حالة الإذن', statusLabel],
          ]}
        />
      ) : null}

      {doc.isFieldVisible('products') && (account.products.length > 0 || account.unassigned.length > 0) ? (
        <section style={{ marginBottom: 16 }}>
          <FactoryPrintSectionTitle title="تفصيل المنتجات — الخدمة والقطعة والتكلفة" accent={accent} />
          {account.products.map((product) => (
            <div
              key={product.itemId}
              className="print-product-block"
              style={{
                marginBottom: 12,
                overflow: 'hidden',
                borderRadius: 8,
                border: `1px solid ${PRINT_SURFACE.border}`,
              }}
            >
              <div
                className="print-product-head"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 12px',
                  background: PRINT_SURFACE.bg,
                  borderBottom: `1px solid ${PRINT_SURFACE.border}`,
                }}
              >
                <div style={{ minWidth: 0, textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: PRINT_SURFACE.text }}>
                    {product.productLabel}
                  </p>
                  {product.serialNo ? (
                    <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 700, color: PRINT_SURFACE.muted }}>
                      سيريال: {product.serialNo}
                    </p>
                  ) : null}
                  {product.diagnosis ? (
                    <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 600, color: PRINT_SURFACE.muted }}>
                      التشخيص: {product.diagnosis}
                    </p>
                  ) : null}
                </div>
                <p
                  style={{
                    margin: 0,
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 800,
                    color: product.inWarranty ? '#047857' : PRINT_SURFACE.text,
                  }}
                >
                  {product.warrantyLabel}
                </p>
              </div>
              {product.works.length > 0 ? (
                <FactoryPrintTable
                  brandAccent={accent}
                  printSettings={ps}
                  dense
                  columns={WORK_COLUMNS}
                  rows={[
                    ...workRows(product.works, product.itemId, accent),
                    {
                      key: `${product.itemId}-total`,
                      cells: {
                        kind: '',
                        name: 'إجمالي المنتج',
                        qty: '',
                        value: money(product.catalogTotal),
                        customer: customerAmountCell(product, accent),
                      },
                    },
                  ]}
                />
              ) : (
                <p
                  style={{
                    margin: 0,
                    padding: '10px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: PRINT_SURFACE.muted,
                    textAlign: 'right',
                  }}
                >
                  لا توجد خدمة أو قطعة مسجّلة على هذا المنتج.
                </p>
              )}
            </div>
          ))}
          {account.unassigned.length > 0 ? (
            <div
              className="print-product-block"
              style={{
                marginBottom: 8,
                overflow: 'hidden',
                borderRadius: 8,
                border: `1px solid ${PRINT_SURFACE.border}`,
              }}
            >
              <p
                style={{
                  margin: 0,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 800,
                  color: PRINT_SURFACE.text,
                  background: PRINT_SURFACE.bg,
                  borderBottom: `1px solid ${PRINT_SURFACE.border}`,
                  textAlign: 'right',
                }}
              >
                بنود غير مربوطة بمنتج محدد
              </p>
              <FactoryPrintTable
                brandAccent={accent}
                printSettings={ps}
                dense
                columns={WORK_COLUMNS}
                rows={workRows(account.unassigned, 'unassigned', accent)}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <div
        style={{
          marginBottom: 8,
          borderRadius: 8,
          border: `1px solid ${PRINT_SURFACE.border}`,
          background: PRINT_SURFACE.bg,
          padding: '10px 12px',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.6,
          color: PRINT_SURFACE.muted,
          textAlign: 'right',
        }}
      >
        {fullWarranty
          ? 'الطلب داخل الضمان بالكامل — التكلفة على العميل صفر ولا تحتاج موافقة تسعير. القيمة المعروضة للتغطية الداخلية فقط، وهذا المستند ليس إثبات تحصيل.'
          : 'كل منتج يعرض الخدمات والقطع المسجّلة عليه. المنتجات داخل الضمان مجانية للعميل. صافي المطلوب يخص الخدمات والقطع بدون ضمان فقط بعد أي خصم معتمد. لا يُعد هذا المستند إثبات تحصيل إلا عند وجود رقم إيصال دفعة.'}
      </div>
    </FactoryPrintShell>
  );
});
