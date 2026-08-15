import React from 'react';
import type { PaperSize, PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_TRANSFER_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
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
  DEPARTMENT_CONSUMABLE_APPROVAL_MODE_LABELS,
  DEPARTMENT_CONSUMABLE_STATUS_LABELS,
  departmentConsumablePrintHeading,
  isDepartmentConsumableIssued,
} from '../lib/departmentConsumableIssue';
import type { DepartmentConsumableIssue } from '../types';

export type DepartmentConsumableIssuePrintProps = {
  issue: DepartmentConsumableIssue | null;
  paperSize?: PaperSize;
  printSettings?: PrintTemplateSettings;
};

const formatQty = (value: number | undefined, digits = 4) =>
  new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: digits,
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

/** بيان صرف قبل التنفيذ، وسند منفّذ بعد الصرف. */
export const DepartmentConsumableIssuePrint = React.forwardRef<
  HTMLDivElement,
  DepartmentConsumableIssuePrintProps
>(function DepartmentConsumableIssuePrint({ issue, paperSize = 'a4', printSettings }, ref) {
  if (!issue) return <div ref={ref} />;

  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize };
  const doc = resolvePrintDocumentConfig(ps, 'departmentConsumableIssue');
  const font = resolvePrintFont(ps);
  const accent = resolvePrintAccentHex(ps.primaryColor);
  const paper = PAPER_DIMENSIONS[paperSize] ?? PAPER_DIMENSIONS.a4;
  const isA5 = paperSize === 'a5';
  const isThermal = paperSize === 'thermal';
  const printedAt = new Date().toLocaleString('ar-EG');
  const issued = isDepartmentConsumableIssued(issue.status);
  const heading = departmentConsumablePrintHeading(issue.status);
  const lines = issue.lines || [];
  const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const totalReturned = lines.reduce((sum, line) => sum + Number(line.returnedQty || 0), 0);
  const totalCost = Number(issue.totalCostSnapshot || 0);
  const showCosts = doc.isFieldVisible('costs') && totalCost > 0;

  return (
    <FactoryPrintShell
      ref={ref}
      companyName={doc.headerText || ps.headerText || 'مخازن الإنتاج'}
      documentType={heading}
      printDate={printedAt}
      logoUrl={ps.logoUrl}
      brandAccent={accent}
      footerTagline={doc.footerText?.trim() || ps.footerText?.trim() || Factory_TRANSFER_FOOTER_TAGLINE}
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
              { label: 'رقم السند', value: issue.referenceNo || '—' },
              {
                label: 'الحالة',
                value: `${DEPARTMENT_CONSUMABLE_STATUS_LABELS[issue.status] || issue.status}${
                  issue.approvalMode === 'direct' ? ' · مباشر' : ' · بموافقة'
                }`,
              },
              { label: 'التاريخ', value: formatPrintDate(issued ? issue.issuedAt || issue.createdAt : issue.createdAt) },
              ...(doc.isFieldVisible('warehouse')
                ? [{ label: 'المخزن', value: issue.warehouseName || issue.warehouseId || '—' }]
                : []),
            ]
          : undefined
      }
      kpis={
        doc.isFieldVisible('kpis')
          ? [
              { label: 'القسم', value: issue.departmentName || '—', tone: 'indigo' as const },
              { label: 'وضع الاعتماد', value: DEPARTMENT_CONSUMABLE_APPROVAL_MODE_LABELS[issue.approvalMode] },
              { label: 'إجمالي الكمية', value: formatQty(totalQty), tone: 'green' as const },
              { label: 'عدد البنود', value: String(lines.length) },
              ...(showCosts ? [{ label: 'القيمة', value: formatMoney(totalCost) }] : []),
              ...(issued && totalReturned > 0
                ? [{ label: 'مرتجع', value: formatQty(totalReturned), tone: 'default' as const }]
                : []),
            ]
          : undefined
      }
      signatures={
        doc.isFieldVisible('signatures')
          ? [
              { title: 'أمين المخزن' },
              { title: issued ? 'مستلم القسم' : 'طالب الصرف' },
              { title: 'اعتماد الإدارة' },
            ]
          : undefined
      }
    >
      {!issued ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[12px] font-extrabold text-slate-800">بيان قبل التنفيذ — لم يُصرف المخزون بعد</p>
        </div>
      ) : null}

      {doc.isFieldVisible('lines') ? (
        <section className="mb-4">
          <FactoryPrintSectionTitle title="بنود الصرف" accent={accent} />
          <FactoryPrintTable
            brandAccent={accent}
            printSettings={ps}
            dense={isA5 || isThermal}
            columns={[
              { key: 'item', header: 'الصنف', width: showCosts ? '34%' : '42%' },
              { key: 'location', header: 'الرف', width: '22%' },
              { key: 'qty', header: 'الكمية', width: '14%', align: 'center' },
              { key: 'unit', header: 'الوحدة', width: '12%', align: 'center' },
              ...(showCosts
                ? [{ key: 'value', header: 'القيمة', width: '18%', align: 'center' as const }]
                : []),
            ]}
            rows={lines.map((line, index) => {
              const returned = Number(line.returnedQty || 0);
              return {
                key: line.lineId || `${line.itemId}-${line.locationId || index}`,
                cells: {
                  item: `${line.itemName}${line.itemCode ? ` (${line.itemCode})` : ''}${
                    returned > 0 ? ` — مرتجع ${formatQty(returned)}` : ''
                  }`,
                  location: line.locationCode || '—',
                  qty: (
                    <FactoryPrintTableAccentValue accent={accent} className="text-[13px]">
                      {formatQty(line.quantity)}
                    </FactoryPrintTableAccentValue>
                  ),
                  unit: line.unit || 'قطعة',
                  ...(showCosts
                    ? { value: Number(line.totalCostSnapshot || 0) > 0 ? formatMoney(line.totalCostSnapshot) : '—' }
                    : {}),
                },
              };
            })}
          />
        </section>
      ) : null}

      {doc.isFieldVisible('notes') && issue.note?.trim() ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">ملاحظات</p>
          <p className="mt-1 text-[12px] font-extrabold text-slate-800">{issue.note}</p>
        </div>
      ) : null}

      {issue.rejectionReason?.trim() ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">سبب الرفض</p>
          <p className="mt-1 text-[12px] font-extrabold text-slate-800">{issue.rejectionReason}</p>
        </div>
      ) : null}
    </FactoryPrintShell>
  );
});

DepartmentConsumableIssuePrint.displayName = 'DepartmentConsumableIssuePrint';
