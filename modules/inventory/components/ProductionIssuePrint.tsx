import React from 'react';
import type { PaperSize, PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import type { ProductionIssueOrder } from '../types';

export type ProductionIssuePrintProps = {
  order: ProductionIssueOrder | null;
  sourceLabel?: string;
  paperSize?: PaperSize;
  printSettings?: PrintTemplateSettings;
};

const formatQty = (value: number | undefined, digits = 2) => {
  const qty = Number(value || 0);
  return qty.toLocaleString('en-US', {
    minimumFractionDigits: qty % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  });
};

const formatPrintDate = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function statusLabel(status: ProductionIssueOrder['status']) {
  if (status === 'requested') return 'طلب إنتاج';
  if (status === 'draft') return 'مسودة';
  if (status === 'submitted') return 'مرسلة';
  if (status === 'issued') return 'مصروفة';
  if (status === 'rejected') return 'مرفوض';
  return 'ملغاة';
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '210mm', minHeight: '148mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

/** إذن صرف إنتاج — engine chrome. */
export const ProductionIssuePrint = React.forwardRef<HTMLDivElement, ProductionIssuePrintProps>(
  function ProductionIssuePrint({ order, sourceLabel, paperSize = 'a4', printSettings }, ref) {
    if (!order) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize };
    const doc = resolvePrintDocumentConfig(ps, 'productionIssue');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const paper = PAPER_DIMENSIONS[paperSize] ?? PAPER_DIMENSIONS.a4;
    const isA5 = paperSize === 'a5';
    const isThermal = paperSize === 'thermal';
    const printedAt = new Date().toLocaleString('ar-EG');
    const totalBase = order.lines.reduce((sum, line) => sum + Number(line.baseRequiredQty || 0), 0);
    const totalWaste = order.lines.reduce((sum, line) => sum + Number(line.plannedWasteQty || 0), 0);
    const totalRequired = order.lines.reduce((sum, line) => sum + Number(line.requiredQty || 0), 0);

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || ps.headerText || 'مخازن الإنتاج'}
        documentType="إذن صرف إنتاج"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : isA5 ? '6mm 8mm' : '10mm 12mm'}
        dense={isA5 || isThermal}
        fontFamily={font.fontFamily}
        fontSize={isA5 || isThermal ? font.denseFontSize : font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'المرجع', value: order.referenceNo || '—' },
                { label: 'الحالة', value: statusLabel(order.status) },
                { label: 'التاريخ', value: formatPrintDate(order.createdAt) },
                ...(doc.isFieldVisible('warehouse')
                  ? [
                      {
                        label: 'المخزن',
                        value: order.sourceWarehouseName || order.sourceWarehouseId || '—',
                      },
                    ]
                  : []),
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'المنتج', value: order.productName || '—', tone: 'indigo' as const },
                { label: 'كود المنتج', value: order.productCode || '—' },
                { label: 'كمية الصرف', value: formatQty(order.quantity, 3) },
                {
                  label: 'أمر/خطة/تقرير',
                  value:
                    sourceLabel ||
                    order.productionReportCode ||
                    order.workOrderId ||
                    order.productionPlanId ||
                    '—',
                },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [
                { title: 'أمين المخزن' },
                { title: 'مستلم الإنتاج' },
                { title: 'اعتماد الإدارة' },
              ]
            : undefined
        }
      >
        {doc.isFieldVisible('lines') ? (
          <>
            <FactoryPrintSectionTitle title="بنود الصرف" accent={accent} />
            <FactoryPrintTable
              dense={isA5 || isThermal}
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'location', header: 'اللوكيشن', width: '18%' },
                { key: 'item', header: 'المكون', width: '28%' },
                { key: 'perUnit', header: 'لكل وحدة', width: '12%', align: 'center' },
                { key: 'base', header: 'طبيعي', width: '12%', align: 'center' },
                { key: 'waste', header: 'هالك قياسي', width: '12%', align: 'center' },
                { key: 'total', header: 'إجمالي الصرف', width: '18%', align: 'center' },
              ]}
              rows={[
                ...order.lines.map((line) => ({
                  key: `${line.itemType}-${line.itemId}`,
                  cells: {
                    location: line.allocations
                      .map((a) => {
                        const rackShelf = [a.rack, a.shelf].filter(Boolean).join(' / ');
                        return `${a.locationCode}${rackShelf ? ` (${rackShelf})` : ''}: ${formatQty(a.quantity)}`;
                      })
                      .join('، '),
                    item: line.itemName,
                    perUnit: formatQty(line.qtyPerUnit, 4),
                    base: formatQty(line.baseRequiredQty),
                    waste: formatQty(line.plannedWasteQty),
                    total: `${formatQty(line.requiredQty)} ${line.unit || ''}`.trim(),
                  },
                })),
                {
                  key: 'totals',
                  cells: {
                    location: 'الإجمالي',
                    item: '',
                    perUnit: '',
                    base: formatQty(totalBase),
                    waste: formatQty(totalWaste),
                    total: formatQty(totalRequired),
                  },
                },
              ]}
            />
          </>
        ) : null}

        {doc.isFieldVisible('notes') && order.note?.trim() ? (
          <div style={{ marginTop: 12 }}>
            <FactoryPrintSectionTitle title="ملاحظات" accent={accent} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>{order.note}</p>
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

ProductionIssuePrint.displayName = 'ProductionIssuePrint';
