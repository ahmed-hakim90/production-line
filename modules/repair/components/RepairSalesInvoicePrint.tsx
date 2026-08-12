import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import {
  FactoryPrintTable,
  FactoryPrintTableAccentValue,
} from '@/src/components/erp/FactoryPrintTable';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import type { RepairSalesInvoice } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

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
    const doc = resolvePrintDocumentConfig(ps, 'repairSalesInvoice');
    const font = resolvePrintFont(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const cancelled = String(invoice.status || '').toLowerCase() === 'cancelled';
    const statusLabel = STATUS_LABELS[String(invoice.status || '')] || 'مرحّلة قديمة';
    const createdAt = invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('ar-EG') : '—';
    const printedAt = new Date().toLocaleString('ar-EG');
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const gross = Number(invoice.grossAmount ?? invoice.total ?? 0);
    const discount = Number(invoice.discountAmount || 0);
    const total = Number(invoice.total || 0);
    const showCustomer = doc.isFieldVisible('customerBlock');
    const showDiscount = doc.isFieldVisible('discount');
    const showLineSku = doc.isFieldVisible('lineSku');
    const showStatus = doc.isFieldVisible('statusBadge');
    const showSignatures = doc.isFieldVisible('signatures');

    const metaCards = [
      { label: 'رقم الفاتورة', value: invoice.invoiceNo || '—' },
      { label: 'التاريخ', value: createdAt },
      ...(showStatus ? [{ label: 'الحالة', value: statusLabel }] : []),
      { label: 'الفرع', value: branchName || '—' },
    ];

    const kpis = [
      { label: 'عدد البنود', value: lines.length, tone: 'default' as const },
      { label: 'الإجمالي', value: `${fmt(gross)} ج.م`, tone: 'indigo' as const },
      ...(showDiscount && discount > 0
        ? [{ label: 'الخصم', value: `${fmt(discount)} ج.م`, tone: 'red' as const }]
        : []),
      { label: 'الصافي', value: `${fmt(total)} ج.م`, tone: 'green' as const },
    ];

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مركز الصيانة'}
        documentType="فاتورة بيع قطع غيار"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={cancelled ? '#991b1b' : accent}
        footerTagline={doc.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        extraLines={doc.customLines}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={metaCards}
        kpis={kpis}
        signatures={showSignatures ? [{ title: 'توقيع البائع' }, { title: 'توقيع العميل' }] : undefined}
      >
        {showCustomer ? (
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
        ) : null}

        <section className="mb-4">
          <FactoryPrintSectionTitle title="بنود الفاتورة" accent={accent} />
          <FactoryPrintTable
            brandAccent={accent}
            printSettings={ps}
            dense={isThermal}
            columns={[
              { key: 'idx', header: 'م', width: '8%', align: 'center' },
              { key: 'part', header: 'القطعة', width: '40%' },
              { key: 'qty', header: 'الكمية', width: '14%', align: 'center' },
              { key: 'unitPrice', header: 'سعر الوحدة', width: '19%', align: 'center' },
              { key: 'lineTotal', header: 'الإجمالي', width: '19%', align: 'center' },
            ]}
            rows={lines.map((line, index) => ({
              key: `${line.partId}-${index}`,
              cells: {
                idx: index + 1,
                part: (
                  <>
                    <p className="leading-snug font-extrabold">{line.partName}</p>
                    {showLineSku ? (
                      <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">
                        {line.materialId || line.partId || '—'}
                      </p>
                    ) : null}
                  </>
                ),
                qty: fmt(line.quantity),
                unitPrice: fmt(line.unitPrice),
                lineTotal: (
                  <FactoryPrintTableAccentValue accent={accent} className="text-[13px]">
                    {fmt(line.lineTotal)}
                  </FactoryPrintTableAccentValue>
                ),
              },
            }))}
          />
        </section>

        <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="text-[12px] font-extrabold text-slate-700">
            الإجمالي {fmt(gross)} ج.م
            {showDiscount && discount > 0 ? ` — الخصم ${fmt(discount)} ج.م` : ''}
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
