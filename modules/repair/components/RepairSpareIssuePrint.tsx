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
import { REPAIR_SPARE_ISSUE_STATUS_LABELS } from '../lib/repairSpareIssue';
import { normalizeRepairSpareIssueAllocations } from '../lib/repairSpareIssueAllocation';
import type { RepairSpareIssue } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

const formatQty = (value: number, digits = 3) =>
  new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const formatPrintDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-EG');
};

type Props = {
  issue: RepairSpareIssue | null;
  paperSize?: 'a4' | 'a5';
  printSettings?: PrintTemplateSettings;
};

export const RepairSpareIssuePrint = React.forwardRef<HTMLDivElement, Props>(
  ({ issue, paperSize = 'a4', printSettings }, ref) => {
    if (!issue) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'repairSpareIssue');
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const isA5 = paperSize === 'a5' || ps.paperSize === 'a5';
    const printedAt = new Date().toLocaleString('ar-EG');
    const totalQty = (issue.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const statusLabel = REPAIR_SPARE_ISSUE_STATUS_LABELS[issue.status] || issue.status;

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مركز الصيانة'}
        documentType="سند صرف قطع غيار"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={isA5 ? '148mm' : '210mm'}
        minHeight={isA5 ? '210mm' : '297mm'}
        padding={isA5 ? '7mm 8mm' : '10mm 12mm'}
        dense={isA5}
        fontFamily={font.fontFamily}
        fontSize={isA5 ? font.denseFontSize : font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'رقم السند', value: issue.referenceNo || '—' },
                { label: 'التاريخ', value: formatPrintDate(issue.createdAt) },
                { label: 'المخزن', value: issue.warehouseName || issue.warehouseId || '—' },
                { label: 'الحالة', value: statusLabel },
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'الفرع', value: issue.branchName || '—', tone: 'default' },
                { label: 'طلب الصيانة', value: issue.jobCode || issue.jobId || '—', tone: 'indigo' },
                { label: 'إجمالي الكمية', value: formatQty(totalQty), tone: 'green' },
                { label: 'عدد البنود', value: (issue.lines || []).length, tone: 'default' },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [
                { title: 'أمين المخزن' },
                { title: 'مستلم الصيانة' },
                { title: 'اعتماد الإدارة' },
              ]
            : undefined
        }
      >
        <section className="mb-4">
          <FactoryPrintSectionTitle title="تفاصيل الصرف" accent={accent} />
          <FactoryPrintTable
            brandAccent={accent}
            printSettings={ps}
            dense={isA5}
            columns={[
              { key: 'location', header: 'اللوكيشن', width: '28%' },
              { key: 'part', header: 'القطعة', width: '36%' },
              { key: 'qty', header: 'الكمية', width: '16%', align: 'center' },
              { key: 'unit', header: 'الوحدة', width: '20%', align: 'center' },
            ]}
            rows={(issue.lines || []).map((line, index) => {
              const allocations = normalizeRepairSpareIssueAllocations(line);
              const locationLabel =
                allocations.length > 0
                  ? allocations
                      .map((a) => {
                        const rackShelf = [a.rack, a.shelf].filter(Boolean).join(' / ');
                        return `${a.locationCode}${rackShelf ? ` (${rackShelf})` : ''}: ${formatQty(a.quantity)}`;
                      })
                      .join('، ')
                  : '—';
              return {
                key: line.lineId || `${line.itemId}-${line.locationId || index}`,
                cells: {
                  location: locationLabel,
                  part: `${line.itemName}${line.itemCode ? ` (${line.itemCode})` : ''}`,
                  qty: (
                    <FactoryPrintTableAccentValue accent={accent} className="text-[13px]">
                      {formatQty(line.quantity)}
                    </FactoryPrintTableAccentValue>
                  ),
                  unit: line.unit || 'piece',
                },
              };
            })}
          />
        </section>

        {issue.note?.trim() ? (
          <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-500">ملاحظات</p>
            <p className="mt-1 text-[12px] font-extrabold text-slate-800">{issue.note}</p>
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

RepairSpareIssuePrint.displayName = 'RepairSpareIssuePrint';
