import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_TRANSFER_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import type { SuppliesReceiptOrder } from '../types';

export interface SuppliesReceiptPrintProps {
  order: SuppliesReceiptOrder | null;
  printSettings?: PrintTemplateSettings;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  executed: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

const fmtQty = (n: number) => Number(n || 0).toLocaleString('ar-EG');

export const SuppliesReceiptPrint = React.forwardRef<HTMLDivElement, SuppliesReceiptPrintProps>(
  ({ order, printSettings }, ref) => {
    if (!order) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = ps.primaryColor || undefined;
    const groups = order.groups || [];
    const standalone = order.standaloneLines || [];
    const totalLines =
      groups.reduce((sum, g) => sum + (g.lines || []).length, 0) + standalone.length;
    const totalQty =
      groups.reduce(
        (sum, g) => sum + (g.lines || []).reduce((s, l) => s + Number(l.quantity || 0), 0),
        0,
      ) + standalone.reduce((s, l) => s + Number(l.quantity || 0), 0);
    const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('ar-EG') : '—';
    const printedAt = new Date().toLocaleString('ar-EG');
    const supplyOrderNo = order.containerRef?.trim() || '';
    const statusLabel = STATUS_LABELS[order.status] || order.status;

    const renderLinesTable = (
      lines: Array<{
        itemCode: string;
        itemName: string;
        unit: string;
        quantity: number;
        suggestedQty?: number;
        locationCode: string;
      }>,
    ) => (
      <table className="mb-4 w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
            <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '8%' }}>م</th>
            <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '16%' }}>كود الصنف</th>
            <th className="border border-slate-200 px-2 py-2" style={{ width: '36%' }}>اسم المكون</th>
            <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '12%' }}>الوحدة</th>
            <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '14%' }}>الكمية</th>
            <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '14%' }}>اللوكيشن</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.itemCode}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                {index + 1}
              </td>
              <td className="border border-slate-200 px-2 py-2 text-center font-mono text-[11px] font-bold">
                {line.itemCode || '—'}
              </td>
              <td className="border border-slate-200 px-2 py-2 text-[12px] font-extrabold text-slate-900">
                {line.itemName}
                {line.suggestedQty != null && Number(line.suggestedQty) !== Number(line.quantity) ? (
                  <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                    مقترح BOM: {fmtQty(Number(line.suggestedQty))}
                  </span>
                ) : null}
              </td>
              <td className="border border-slate-200 px-2 py-2 text-center text-[11px] font-bold">
                {line.unit || '—'}
              </td>
              <td
                className="border border-slate-200 px-2 py-2 text-center text-[13px] font-black tabular-nums"
                style={{ color: accent }}
              >
                {fmtQty(Number(line.quantity || 0))}
              </td>
              <td className="border border-slate-200 px-2 py-2 text-center text-[11px] font-bold">
                {line.locationCode || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={ps.headerText || 'مؤسسة المغربي'}
        documentType="إذن استلام مستلزمات"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={ps.footerText?.trim() || Factory_TRANSFER_FOOTER_TAGLINE}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        metaCards={[
          { label: 'رقم الإذن', value: order.referenceNo || '—' },
          { label: 'التاريخ', value: createdAt },
          ...(supplyOrderNo ? [{ label: 'رقم أمر التوريد', value: supplyOrderNo }] : []),
          { label: 'الحالة', value: statusLabel },
        ]}
        kpis={[
          { label: 'المخزن', value: order.warehouseName || order.warehouseId || '—', tone: 'indigo' },
          { label: 'عدد الأسطر', value: totalLines, tone: 'default' },
          { label: 'إجمالي الكميات', value: fmtQty(totalQty), tone: 'green' },
        ]}
        signatures={[{ title: 'المستلم' }, { title: 'المعتمد' }, { title: 'المخازن' }]}
      >
        {!order.id ? (
          <div className="mb-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-extrabold text-amber-800">
            طباعة قبل الحفظ — لم يُسجَّل الإذن بعد
          </div>
        ) : null}

        {order.note?.trim() ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-500">ملاحظة</p>
            <p className="mt-1 text-[12px] font-extrabold text-slate-800">{order.note}</p>
          </div>
        ) : null}

        {groups.map((group, gIndex) => (
          <section key={`${group.productId}-${gIndex}`} className="mb-4">
            <FactoryPrintSectionTitle
              title={`منتج مفكك: ${group.productName}${group.productCode ? ` (${group.productCode})` : ''} — الكمية: ${fmtQty(Number(group.quantity || 0))}`}
              accent={accent}
            />
            {group.lines?.length ? (
              renderLinesTable(group.lines)
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
                لا توجد مكونات لهذه المجموعة.
              </div>
            )}
          </section>
        ))}

        {standalone.length > 0 ? (
          <section className="mb-2">
            <FactoryPrintSectionTitle title="مكونات مستقلة" accent={accent} />
            {renderLinesTable(standalone)}
          </section>
        ) : null}

        {groups.length === 0 && standalone.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
            لا توجد أصناف في هذا المستند.
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

SuppliesReceiptPrint.displayName = 'SuppliesReceiptPrint';
