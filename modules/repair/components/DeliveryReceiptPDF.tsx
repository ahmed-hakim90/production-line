import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
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
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = ps.primaryColor || undefined;
    const rows = resolveRepairJobPrintProducts(job, products);
    const authorizationNo = job.deliveryAuthorizationNo || `DEL-${job.receiptNo}`;
    const deliveredAt = job.deliveryAuthorizationIssuedAt || job.deliveredAt;
    const finalCost = Math.max(0, Number(job.finalCost || 0));
    const isUnpriced = finalCost <= 0;
    const paidAmount = Math.max(0, Number(job.paidAmount ?? finalCost));
    const balanceDue = Math.max(0, Number(job.balanceDue ?? finalCost - paidAmount));
    const paymentStatus = isUnpriced
      ? 'unpriced'
      : job.paymentStatus || (balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid');
    const decimalPlaces = Math.max(0, Math.min(3, Number(ps.decimalPlaces ?? 0)));
    const money = (value: number) =>
      `${value.toLocaleString('ar-EG', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })} ج.م`;
    const printDate = new Date().toLocaleString('ar-EG');
    const productCount = rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity || 1)), 0);

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مركز الصيانة'}
        documentType="إذن تسليم منتج"
        printDate={printDate}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        metaCards={[
          { label: 'رقم إذن التسليم', value: authorizationNo },
          { label: 'رقم طلب الصيانة', value: job.receiptNo || '—' },
          { label: 'تاريخ التسليم', value: formatDate(deliveredAt) },
          { label: 'الفرع', value: branch?.name || '—' },
        ]}
        kpis={[
          { label: 'التكلفة النهائية', value: money(finalCost), tone: 'indigo' },
          { label: 'المبلغ المحصل', value: money(paidAmount), tone: 'green' },
          {
            label: 'الرصيد المتبقي',
            value: money(balanceDue),
            tone: balanceDue > 0 ? 'red' : 'default',
          },
          {
            label: 'حالة السداد',
            value: PAYMENT_LABELS[paymentStatus] || paymentStatus,
            tone: paymentStatus === 'paid' ? 'green' : paymentStatus === 'unpriced' ? 'red' : 'default',
          },
        ]}
        signatures={[
          { title: 'اسم وتوقيع المستلم' },
          { title: 'موظف التسليم', detail: job.deliveryAuthorizationIssuedByName || 'الاسم / التوقيع' },
          { title: 'اعتماد وختم الفرع', detail: branch?.name || 'الختم / التوقيع' },
        ]}
      >
        <div className={`mb-4 grid overflow-hidden rounded-lg border border-slate-200 ${isThermal ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {[
            ['اسم العميل / المستلم', job.customerName || '—'],
            ['رقم الهاتف', job.customerPhone || '—'],
            ['العنوان', job.customerAddress || '—'],
            ['عنوان الفرع وهاتفه', [branch?.address, branch?.phone].filter(Boolean).join(' — ') || '—'],
            ['ضمان الإصلاح', WARRANTY_LABELS[job.warranty] || job.warranty || '—'],
            ['انتهاء الضمان', formatDate(job.warrantyExpiresAt)],
            ['عدد المنتجات', String(productCount)],
            ['موظف التسليم', job.deliveryAuthorizationIssuedByName || '—'],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`px-3 py-2.5 ${index % 2 === 0 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-100 ${!isThermal && index % 2 === 0 ? 'border-l border-slate-200' : ''}`}
            >
              <p className="text-[10px] font-bold text-slate-500">{label}</p>
              <p className="mt-1 break-words text-[12px] font-extrabold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <section className="mb-4">
          <FactoryPrintSectionTitle title="المنتجات المسلّمة" accent={accent} />
          <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-100 text-[10px] font-extrabold text-slate-600">
                <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '6%' }}>م</th>
                <th className="border border-slate-200 px-1.5 py-2" style={{ width: '22%' }}>المنتج</th>
                <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '14%' }}>السيريال</th>
                <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '8%' }}>الكمية</th>
                <th className="border border-slate-200 px-1.5 py-2" style={{ width: '28%' }}>العطل / العمل</th>
                <th className="border border-slate-200 px-1.5 py-2" style={{ width: '22%' }}>الملحقات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product, index) => (
                <tr key={product.itemId || index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold text-slate-500">
                    {index + 1}
                  </td>
                  <td className="border border-slate-200 px-1.5 py-2 text-[11px] font-extrabold text-slate-900">
                    {[product.productName, product.deviceBrand, product.deviceModel].filter(Boolean).join(' — ') || '—'}
                  </td>
                  <td className="border border-slate-200 px-1.5 py-2 text-center font-mono text-[10px] font-bold">
                    {product.serialNo || '—'}
                  </td>
                  <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-black tabular-nums">
                    {Math.max(1, Number(product.quantity || 1))}
                  </td>
                  <td className="border border-slate-200 px-1.5 py-2 text-[10px] font-semibold text-slate-700">
                    {product.technicianDiagnosis || product.diagnosis || job.problemDescription || '—'}
                  </td>
                  <td className="border border-slate-200 px-1.5 py-2 text-[10px] font-semibold text-slate-700">
                    {product.accessories || job.accessories || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-slate-700">
          أقرّ أنا المستلم بأنني عاينت المنتجات الموضحة أعلاه واستلمتها بحالة سليمة بعد انتهاء أعمال الصيانة،
          واستلمت ملحقاتها الموضحة، وأقر بصحة بيانات التسليم والمبالغ والضمان المدوّنة في هذا الإذن.
        </div>
      </FactoryPrintShell>
    );
  },
);
