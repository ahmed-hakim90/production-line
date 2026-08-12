import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_TRANSFER_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
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
import type { SuppliesReceiptOrder } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

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
    const doc = resolvePrintDocumentConfig(ps, 'suppliesReceipt');
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
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
      <div className="mb-4">
        <FactoryPrintTable
          brandAccent={accent}
          printSettings={ps}
          dense={isThermal}
          columns={[
            { key: 'idx', header: 'م', width: '8%', align: 'center' },
            { key: 'code', header: 'كود الصنف', width: '16%', align: 'center' },
            { key: 'name', header: 'اسم المكون', width: '36%' },
            { key: 'unit', header: 'الوحدة', width: '12%', align: 'center' },
            { key: 'qty', header: 'الكمية', width: '14%', align: 'center' },
            { key: 'location', header: 'اللوكيشن', width: '14%', align: 'center' },
          ]}
          rows={lines.map((line, index) => ({
            key: `${line.itemCode}-${index}`,
            cells: {
              idx: index + 1,
              code: <span className="font-mono text-[11px] font-bold">{line.itemCode || '—'}</span>,
              name: (
                <>
                  {line.itemName}
                  {line.suggestedQty != null && Number(line.suggestedQty) !== Number(line.quantity) ? (
                    <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                      مقترح BOM: {fmtQty(Number(line.suggestedQty))}
                    </span>
                  ) : null}
                </>
              ),
              unit: line.unit || '—',
              qty: (
                <FactoryPrintTableAccentValue accent={accent} className="text-[13px]">
                  {fmtQty(Number(line.quantity || 0))}
                </FactoryPrintTableAccentValue>
              ),
              location: line.locationCode || '—',
            },
          }))}
        />
      </div>
    );

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مؤسسة المغربي'}
        documentType="إذن استلام مستلزمات"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_TRANSFER_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'رقم الإذن', value: order.referenceNo || '—' },
                { label: 'التاريخ', value: createdAt },
                ...(supplyOrderNo ? [{ label: 'رقم أمر التوريد', value: supplyOrderNo }] : []),
                { label: 'الحالة', value: statusLabel },
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'المخزن', value: order.warehouseName || order.warehouseId || '—', tone: 'indigo' },
                { label: 'عدد الأسطر', value: totalLines, tone: 'default' },
                { label: 'إجمالي الكميات', value: fmtQty(totalQty), tone: 'green' },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'المستلم' }, { title: 'المعتمد' }, { title: 'المخازن' }]
            : undefined
        }
      >
        {!order.id ? (
          <div className="mb-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-extrabold text-amber-800">
            طباعة قبل الحفظ — لم يُسجَّل الإذن بعد
          </div>
        ) : null}

        {doc.isFieldVisible('notes') && order.note?.trim() ? (
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
