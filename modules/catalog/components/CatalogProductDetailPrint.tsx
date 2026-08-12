import React from 'react';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
  type FactoryPrintKpi,
} from '@/src/components/erp/FactoryPrintShell';
import {
  FactoryPrintTable,
  FactoryPrintTableAccentValue,
} from '@/src/components/erp/FactoryPrintTable';
import { resolvePrintAccentHex } from '@/utils/printTheme';

export type CatalogProductDetailPrintRow = {
  date: string;
  line: string;
  employee: string;
  quantity: number;
  waste: number;
  workers: number;
  hours: number;
};

export type CatalogProductDetailPrintProps = {
  productId: string;
  productName: string;
  productCode: string;
  category: string;
  periodLabel: string;
  kpis: Array<{ label: string; value: string | number; unit?: string }>;
  rows: CatalogProductDetailPrintRow[];
  printSettings?: PrintTemplateSettings;
};

const arNumber = (value: number) => value.toLocaleString('ar-EG');

export const CatalogProductDetailPrint = React.forwardRef<HTMLDivElement, CatalogProductDetailPrintProps>(
  function CatalogProductDetailPrint(
    { productId, productName, productCode, category, periodLabel, kpis, rows, printSettings },
    ref,
  ) {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'catalogProductDetail');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const printedAt = new Date().toLocaleString('ar-EG');

    const shellKpis: FactoryPrintKpi[] | undefined = doc.isFieldVisible('kpis')
      ? kpis.slice(0, 4).map((kpi, index) => ({
          label: kpi.label,
          value: typeof kpi.value === 'number' ? arNumber(kpi.value) : String(kpi.value),
          unit: kpi.unit,
          tone: index === 0 ? 'indigo' : 'default',
        }))
      : undefined;

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مؤسسة المغربي'}
        documentType="تقرير تفاصيل منتج"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth="210mm"
        minHeight="297mm"
        padding="10mm 12mm"
        fontFamily={font.fontFamily}
        fontSize={font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'المنتج', value: productName || '—' },
                { label: 'الكود', value: productCode || productId || '—' },
                { label: 'الفئة', value: category || '—' },
                { label: 'الفترة', value: periodLabel || '—' },
              ]
            : undefined
        }
        kpis={shellKpis}
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'المراجع' }, { title: 'الاعتماد' }]
            : undefined
        }
      >
        {doc.isFieldVisible('reportsTable') ? (
          <section className="mb-2">
            <FactoryPrintSectionTitle title="التقارير التفصيلية" accent={accent} />
            {rows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
                لا توجد بيانات بعد الفلترة
              </div>
            ) : (
              <FactoryPrintTable
                brandAccent={accent}
                printSettings={ps}
                columns={[
                  { key: 'date', header: 'التاريخ' },
                  { key: 'line', header: 'خط الإنتاج' },
                  { key: 'employee', header: 'المشرف' },
                  { key: 'quantity', header: 'الكمية', align: 'center' },
                  { key: 'waste', header: 'الهالك', align: 'center' },
                  { key: 'workers', header: 'عمال', align: 'center' },
                  { key: 'hours', header: 'ساعات', align: 'center' },
                ]}
                rows={rows.map((row, index) => ({
                  key: `${row.date}-${index}`,
                  cells: {
                    date: row.date,
                    line: row.line,
                    employee: row.employee,
                    quantity: (
                      <FactoryPrintTableAccentValue accent={accent}>{arNumber(row.quantity)}</FactoryPrintTableAccentValue>
                    ),
                    waste: arNumber(row.waste),
                    workers: arNumber(row.workers),
                    hours: arNumber(row.hours),
                  },
                }))}
              />
            )}
          </section>
        ) : null}
      </FactoryPrintShell>
    );
  },
);
