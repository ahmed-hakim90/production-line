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
              <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                    <th className="border border-slate-200 px-2 py-2">التاريخ</th>
                    <th className="border border-slate-200 px-2 py-2">خط الإنتاج</th>
                    <th className="border border-slate-200 px-2 py-2">المشرف</th>
                    <th className="border border-slate-200 px-2 py-2 text-center">الكمية</th>
                    <th className="border border-slate-200 px-2 py-2 text-center">الهالك</th>
                    <th className="border border-slate-200 px-2 py-2 text-center">عمال</th>
                    <th className="border border-slate-200 px-2 py-2 text-center">ساعات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.date}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold">{row.date}</td>
                      <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold">{row.line}</td>
                      <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold">{row.employee}</td>
                      <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums">
                        {arNumber(row.quantity)}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums">
                        {arNumber(row.waste)}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums">
                        {arNumber(row.workers)}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums">
                        {arNumber(row.hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
      </FactoryPrintShell>
    );
  },
);
