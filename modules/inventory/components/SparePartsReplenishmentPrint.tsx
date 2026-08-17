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
import { SPARE_PARTS_REPLENISHMENT_STATUS_LABELS } from '../lib/sparePartsReplenishment';
import type { SparePartsReplenishmentRequest } from '../types';

export type SparePartsReplenishmentPrintProps = {
  request: SparePartsReplenishmentRequest | null;
  paperSize?: PaperSize;
  printSettings?: PrintTemplateSettings;
  showCosts?: boolean;
};

const formatQty = (value: number | undefined) =>
  new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const formatMoney = (value: number | undefined) =>
  new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const formatPrintDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '210mm', minHeight: '148mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

/** طلب تموين قطع غيار — قابل للطباعة من المقدّم فصاعداً. */
export const SparePartsReplenishmentPrint = React.forwardRef<
  HTMLDivElement,
  SparePartsReplenishmentPrintProps
>(function SparePartsReplenishmentPrint(
  { request, paperSize = 'a4', printSettings, showCosts = true },
  ref,
) {
  if (!request) return <div ref={ref} />;

  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize };
  const doc = resolvePrintDocumentConfig(ps, 'sparePartsReplenishment');
  const font = resolvePrintFont(ps);
  const accent = resolvePrintAccentHex(ps.primaryColor);
  const paper = PAPER_DIMENSIONS[paperSize] ?? PAPER_DIMENSIONS.a4;
  const isA5 = paperSize === 'a5';
  const isThermal = paperSize === 'thermal';
  const printedAt = new Date().toLocaleString('ar-EG');
  const lines = request.lines || [];
  const displayLines = request.status === 'submitted' || request.status === 'approved'
    ? lines
    : lines.filter((line) => Number(line.preparedQty || 0) > 0 || Number(line.requestedQty || 0) > 0);
  const totalRequested = displayLines.reduce((sum, line) => sum + Number(line.requestedQty || 0), 0);
  const totalPrepared = displayLines.reduce((sum, line) => {
    if (line.preparedQty == null) return sum;
    const prepared = Number(line.preparedQty);
    return sum + (prepared > 0 ? prepared : 0);
  }, 0);
  const statusLabel = SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[request.status] || request.status;
  const costsVisible = showCosts && doc.isFieldVisible('costs');

  return (
    <FactoryPrintShell
      ref={ref}
      companyName={doc.headerText || ps.headerText || 'مخزن قطع الغيار'}
      documentType="طلب تموين قطع غيار"
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
              { label: 'المرجع', value: request.referenceNo || '—' },
              { label: 'الحالة', value: statusLabel },
              { label: 'التاريخ', value: formatPrintDate(request.createdAt) },
              { label: 'المنشئ', value: request.createdBy || '—' },
            ]
          : undefined
      }
      kpis={
        doc.isFieldVisible('kpis')
          ? [
              { label: 'من', value: request.fromWarehouseName || '—', tone: 'indigo' as const },
              { label: 'إلى', value: request.toWarehouseName || '—' },
              { label: 'مطلوب', value: formatQty(totalRequested) },
              {
                label: 'مجهّز',
                value: request.status === 'submitted' || request.status === 'approved'
                  ? '—'
                  : formatQty(totalPrepared),
              },
            ]
          : undefined
      }
      signatures={
        doc.isFieldVisible('signatures')
          ? [
              { title: 'مسؤول الاعتماد' },
              { title: 'أمين المخزن' },
              { title: 'المستلم' },
            ]
          : undefined
      }
    >
      {doc.isFieldVisible('lines') ? (
        <>
          <FactoryPrintSectionTitle title="بنود التموين" accent={accent} />
          <FactoryPrintTable
            dense={isA5 || isThermal}
            brandAccent={accent}
            printSettings={ps}
            columns={[
              { key: 'item', header: 'الصنف', width: costsVisible ? '28%' : '36%' },
              { key: 'code', header: 'الكود', width: '14%' },
              { key: 'requested', header: 'مطلوب', width: '12%', align: 'center' },
              { key: 'prepared', header: 'مجهّز', width: '12%', align: 'center' },
              { key: 'location', header: 'الرف', width: '14%' },
              ...(costsVisible
                ? [
                    { key: 'unitCost', header: 'تكلفة الوحدة', width: '10%', align: 'center' as const },
                    { key: 'total', header: 'الإجمالي', width: '10%', align: 'center' as const },
                  ]
                : []),
            ]}
            rows={displayLines.map((line) => {
              const prepared = Number(line.preparedQty);
              const preparedLabel = Number.isFinite(prepared)
                ? (prepared > 0 ? formatQty(prepared) : 'مستبعد')
                : '—';
              const loc = (line.allocations || [])
                .map((a) => `${a.locationCode}: ${formatQty(a.quantity)}`)
                .join('، ')
                || line.locationCode
                || '—';
              return {
                key: line.lineId,
                cells: {
                  item: line.itemName,
                  code: line.itemCode || '—',
                  requested: formatQty(line.requestedQty),
                  prepared: preparedLabel,
                  location: loc,
                  unitCost: formatMoney(line.unitCostSnapshot),
                  total: formatMoney(line.totalCostSnapshot),
                },
              };
            })}
          />
        </>
      ) : null}

      {doc.isFieldVisible('notes') && request.note?.trim() ? (
        <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">ملاحظة</p>
          <p className="mt-1 text-[12px] font-bold leading-snug text-slate-800">{request.note}</p>
        </section>
      ) : null}
    </FactoryPrintShell>
  );
});

SparePartsReplenishmentPrint.displayName = 'SparePartsReplenishmentPrint';
