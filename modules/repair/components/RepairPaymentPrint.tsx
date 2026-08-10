import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import {
  manufacturerWarrantyLineLabel,
  manufacturerWarrantyScopeLabel,
} from '../lib/repairManufacturerWarranty';
import { resolveRepairJobPrintProducts } from '../lib/repairJobPrint';
import type { RepairBranch, RepairJob, RepairPayment, RepairPaymentAuthorization } from '../types';

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
  const accent = ps.primaryColor || undefined;
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
      companyName={ps.headerText || 'مركز الصيانة'}
      documentType={isReceipt ? 'إيصال تحصيل صيانة' : 'تفصيل حساب طلب صيانة'}
      printDate={printDate}
      logoUrl={ps.logoUrl}
      brandAccent={accent}
      footerTagline={ps.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
      paperWidth="210mm"
      minHeight="297mm"
      padding="10mm 12mm"
      metaCards={[
        { label: 'رقم المستند', value: payment?.paymentNo || authorization.authorizationNo },
        { label: 'رقم طلب الصيانة', value: authorization.receiptNo || '—' },
        { label: 'الفرع', value: branch?.name || 'مركز الصيانة' },
        { label: 'وضع الضمان', value: scopeLabel },
      ]}
      kpis={
        isReceipt
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
      }
      signatures={[
        { title: 'توقيع العميل' },
        { title: 'موظف الاستقبال' },
        { title: 'الختم والاعتماد' },
      ]}
    >
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

      {productRows.length > 0 ? (
        <section className="mb-4">
          <FactoryPrintSectionTitle title="تفصيل المنتجات" accent={accent} />
          <table className="w-full border-collapse overflow-hidden rounded-lg text-right" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '10%' }}>م</th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '40%' }}>المنتج</th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '25%' }}>الضمان</th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '25%' }}>التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((item, index) => {
                const lineCost = Number(item.finalCost || item.estimatedCost || 0);
                return (
                  <tr key={item.itemId || index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                      {index + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                      {item.productName || '—'}
                    </td>
                    <td
                      className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold"
                      style={{ color: item.inWarranty ? '#047857' : '#0f172a' }}
                    >
                      {manufacturerWarrantyLineLabel(item.inWarranty)}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums">
                      {item.inWarranty ? 'مجاني' : money(lineCost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-slate-600">
        المنتجات داخل الضمان مجانية للعميل. صافي المطلوب يخص المنتجات بدون ضمان فقط بعد أي خصم معتمد.
        لا يُعد هذا المستند إثبات تحصيل إلا عند وجود رقم إيصال دفعة.
      </div>
    </FactoryPrintShell>
  );
});
