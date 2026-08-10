import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import type { RepairSalesInvoice } from '../types';

export type RepairSalesInvoicePrintProps = {
  invoice: RepairSalesInvoice | null;
  branchName?: string;
  printSettings?: PrintTemplateSettings;
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Number(n || 0));

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_discount_approval: 'بانتظار اعتماد الخصم',
  ready_to_post: 'جاهزة للترحيل',
  posted: 'مرحّلة',
  cancelled: 'ملغاة/معكوسة',
};

export const RepairSalesInvoicePrint = React.forwardRef<HTMLDivElement, RepairSalesInvoicePrintProps>(
  function RepairSalesInvoicePrint({ invoice, branchName, printSettings }, ref) {
    if (!invoice) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = ps.primaryColor || undefined;
    const cancelled = String(invoice.status || '').toLowerCase() === 'cancelled';
    const statusLabel = STATUS_LABELS[String(invoice.status || '')] || 'مرحّلة قديمة';
    const createdAt = invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('ar-EG') : '—';
    const printedAt = new Date().toLocaleString('ar-EG');
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const gross = Number(invoice.grossAmount ?? invoice.total ?? 0);
    const discount = Number(invoice.discountAmount || 0);
    const total = Number(invoice.total || 0);

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مركز الصيانة'}
        documentType="فاتورة بيع قطع غيار"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={cancelled ? '#991b1b' : accent}
        footerTagline={ps.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        metaCards={[
          { label: 'رقم الفاتورة', value: invoice.invoiceNo || '—' },
          { label: 'التاريخ', value: createdAt },
          { label: 'الحالة', value: statusLabel },
          { label: 'الفرع', value: branchName || '—' },
        ]}
        kpis={[
          { label: 'عدد البنود', value: lines.length, tone: 'default' },
          { label: 'الإجمالي', value: `${fmt(gross)} ج.م`, tone: 'indigo' },
          ...(discount > 0
            ? [{ label: 'الخصم', value: `${fmt(discount)} ج.م`, tone: 'red' as const }]
            : []),
          { label: 'الصافي', value: `${fmt(total)} ج.م`, tone: 'green' },
        ]}
        signatures={[{ title: 'توقيع البائع' }, { title: 'توقيع العميل' }]}
      >
        <div className={`mb-4 grid overflow-hidden rounded-lg border border-slate-200 ${isThermal ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {[
            ['العميل', invoice.customerName || 'عميل نقدي'],
            ['الهاتف', invoice.customerPhone || '—'],
            ['منشئ الفاتورة', invoice.createdByName || '—'],
            ['عدد البنود', String(lines.length)],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`px-3 py-2.5 ${index % 2 === 0 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-100 ${!isThermal && index % 2 === 0 ? 'border-l border-slate-200' : ''}`}
            >
              <p className="text-[10px] font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-[12px] font-extrabold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <section className="mb-4">
          <FactoryPrintSectionTitle title="بنود الفاتورة" accent={accent} />
          <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '8%' }}>م</th>
                <th className="border border-slate-200 px-2 py-2" style={{ width: '40%' }}>القطعة</th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '14%' }}>الكمية</th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '19%' }}>سعر الوحدة</th>
                <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '19%' }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.partId}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                    {index + 1}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                    {line.partName}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold tabular-nums">
                    {fmt(line.quantity)}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold tabular-nums">
                    {fmt(line.unitPrice)}
                  </td>
                  <td
                    className="border border-slate-200 px-2 py-2 text-center text-[13px] font-black tabular-nums"
                    style={{ color: accent }}
                  >
                    {fmt(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="text-[12px] font-extrabold text-slate-700">
            الإجمالي {fmt(gross)} ج.م
            {discount > 0 ? ` — الخصم ${fmt(discount)} ج.م` : ''}
          </span>
          <span className="text-[16px] font-black tabular-nums" style={{ color: accent }}>
            الصافي {fmt(total)} ج.م
          </span>
        </div>

        <div className="mb-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">ملاحظات</p>
          <p className="mt-1 text-[12px] font-bold text-slate-800">{invoice.notes || '—'}</p>
        </div>
      </FactoryPrintShell>
    );
  },
);
