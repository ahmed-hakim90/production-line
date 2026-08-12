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
import { resolvePrintAccentHex } from '@/utils/printTheme';
import { resolveSparePartLocationLabel } from '../lib/sparePartLocationLabel';
import type { RepairSparePart } from '../types';

const formatQty = (value: number) =>
  new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

export type SparePartsInventoryCountPrintRow = {
  part: RepairSparePart;
  quantity: number;
};

type Props = {
  rows: SparePartsInventoryCountPrintRow[];
  branchName?: string;
  warehouseName?: string;
  locationByItemId: Map<string, string> | ReadonlyMap<string, string>;
  paperSize?: 'a4' | 'a5';
  printSettings?: PrintTemplateSettings;
};

const COUNT_COLUMNS = [
  { key: 'location', header: 'الموقع', width: '18%' },
  { key: 'code', header: 'الكود', width: '16%' },
  { key: 'name', header: 'القطعة', width: '34%' },
  { key: 'qty', header: 'الرصيد', width: '14%', align: 'center' as const },
  { key: 'actual', header: 'المتاح فعلي', width: '18%', align: 'center' as const, blank: true },
];

export const SparePartsInventoryCountPrint = React.forwardRef<HTMLDivElement, Props>(
  (
    {
      rows,
      branchName,
      warehouseName,
      locationByItemId,
      paperSize = 'a4',
      printSettings,
    },
    ref,
  ) => {
    if (!rows.length) {
      return (
        <div ref={ref} className="print-root print-report" dir="rtl" lang="ar" />
      );
    }

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'repairSparePartsCount');
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const isA5 = paperSize === 'a5' || ps.paperSize === 'a5';
    const printedAt = new Date().toLocaleString('ar-EG');
    const totalQty = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    const tableRows = rows.map((row, index) => {
      const locationLabel = resolveSparePartLocationLabel({
        materialId: row.part.materialId,
        rawMaterialId: row.part.rawMaterialId,
        locationByItemId,
      });
      return {
        key: row.part.id || `${row.part.code}-${index}`,
        cells: {
          location: locationLabel,
          code: row.part.code || '—',
          name: row.part.name || '—',
          qty: (
            <FactoryPrintTableAccentValue accent={accent} className={isA5 ? 'text-[12px]' : 'text-[13px]'}>
              {formatQty(row.quantity)}
            </FactoryPrintTableAccentValue>
          ),
        },
      };
    });

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مركز الصيانة'}
        documentType="ورقة جرد قطع غيار"
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
                { label: 'الفرع', value: branchName || '—' },
                { label: 'المخزن', value: warehouseName || '—' },
                { label: 'التاريخ', value: printedAt },
                { label: 'عدد الأصناف', value: String(rows.length) },
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'إجمالي الرصيد', value: formatQty(totalQty), tone: 'green' },
                { label: 'عدد البنود', value: rows.length, tone: 'default' },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [
                { title: 'أمين المخزن' },
                { title: 'الجرد' },
                { title: 'اعتماد الإدارة' },
              ]
            : undefined
        }
      >
        <section className="mb-4">
          <FactoryPrintSectionTitle title="تفاصيل الجرد" accent={accent} />
          <FactoryPrintTable
            columns={COUNT_COLUMNS}
            rows={tableRows}
            brandAccent={accent}
            printSettings={ps}
            dense={isA5}
          />
        </section>
      </FactoryPrintShell>
    );
  },
);

SparePartsInventoryCountPrint.displayName = 'SparePartsInventoryCountPrint';
