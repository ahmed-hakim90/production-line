import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import {
  FactoryPrintTable,
  FactoryPrintTableAccentValue,
} from '@/src/components/erp/FactoryPrintTable';
import {
  manufacturerWarrantyLineLabel,
  manufacturerWarrantyScopeLabel,
} from '../lib/repairManufacturerWarranty';
import { resolveRepairJobPrintProducts } from '../lib/repairJobPrint';
import type { RepairBranch, RepairJob, RepairPayment, RepairPaymentAuthorization } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

const methodLabel = (method?: string) =>
  method === 'card' ? 'بطاقة' : method === 'bank_transfer' ? 'تحويل بنكي' : 'نقدي';

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

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
  const productRows = job ? resolveRepairJobPrintProducts(job) : [];
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
      <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
        {[
          ['العميل', job?.customerName || '—'],
          ['الهاتف', job?.customerPhone || '—'],
          ['إجمالي بدون ضمان', money(billableGross)],
          ['إجمالي داخل الضمان', money(warrantyGross)],
          ['إجمالي الخدمات (للتحصيل)', money(authorization.serviceGross)],
          ['إجمالي قطع الغيار (للتحصيل)', money(authorization.partsGross)],
          ['الخصم المعتمد', money(authorization.discountAmount)],
          ['حالة الإذن', statusLabel],
        ].map(([label, value], index) => (
          <div
            key={label}
            className={`px-3 py-2.5 ${index % 2 === 0 ? 'bg-slate-50' : 'bg-white'} ${index < 6 ? 'border-b border-slate-100' : ''} ${index % 2 === 0 ? 'border-l border-slate-200' : ''}`}
          >
            <p className="text-[10px] font-bold text-slate-500">{label}</p>
            <p className="mt-1 text-[13px] font-extrabold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      ) : null}

      {doc.isFieldVisible('products') && productRows.length > 0 ? (
        <section className="mb-4">
          <FactoryPrintSectionTitle title="تفصيل المنتجات" accent={accent} />
          <FactoryPrintTable
            brandAccent={accent}
            printSettings={ps}
            columns={[
              { key: 'idx', header: 'م', width: '10%', align: 'center' },
              { key: 'product', header: 'المنتج', width: '40%' },
              { key: 'warranty', header: 'الضمان', width: '25%', align: 'center' },
              { key: 'cost', header: 'التكلفة', width: '25%', align: 'center' },
            ]}
            rows={productRows.map((item, index) => {
              const lineCost = Number(item.finalCost || item.estimatedCost || 0);
              return {
                key: item.itemId || String(index),
                cells: {
                  idx: index + 1,
                  product: item.productName || '—',
                  warranty: (
                    <span style={{ color: item.inWarranty ? '#047857' : '#0f172a', fontWeight: 700 }}>
                      {manufacturerWarrantyLineLabel(item.inWarranty)}
                    </span>
                  ),
                  cost: item.inWarranty ? (
                    'مجاني'
                  ) : (
                    <FactoryPrintTableAccentValue accent={accent}>{money(lineCost)}</FactoryPrintTableAccentValue>
                  ),
                },
              };
            })}
          />
        </section>
      ) : null}

      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-slate-600">
        المنتجات داخل الضمان مجانية للعميل. صافي المطلوب يخص المنتجات بدون ضمان فقط بعد أي خصم معتمد.
        لا يُعد هذا المستند إثبات تحصيل إلا عند وجود رقم إيصال دفعة.
      </div>
    </FactoryPrintShell>
  );
});
