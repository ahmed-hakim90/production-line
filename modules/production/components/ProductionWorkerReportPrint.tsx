import React from 'react';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { formatNumber } from '@/utils/calculations';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { resolvePrintAccentHex } from '@/utils/printTheme';

type Props = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Record<string, unknown>[];
  printSettings?: PrintTemplateSettings;
};

export const ProductionWorkerReportPrint = React.forwardRef<HTMLDivElement, Props>(
  function ProductionWorkerReportPrint({ title, subtitle, columns, rows, printSettings }, ref) {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'productionWorkerReport');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const printedAt = new Date().toLocaleString('ar-EG');

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مؤسسة المغربي'}
        documentType={title || 'تقرير عامل إنتاج'}
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
                { label: 'التقرير', value: title || '—' },
                { label: 'النطاق', value: subtitle || '—' },
                { label: 'عدد الصفوف', value: String(rows.length) },
                { label: 'تاريخ الطباعة', value: printedAt },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'المشرف' }, { title: 'الاعتماد' }]
            : undefined
        }
      >
        <section className="mb-2">
          <FactoryPrintSectionTitle title={subtitle || 'التفاصيل'} accent={accent} />
          {rows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
              لا توجد بيانات
            </div>
          ) : (
            <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                  {columns.map((col) => (
                    <th key={col} className="border border-slate-200 px-2 py-2 text-right">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {columns.map((col) => {
                      const val = row[col];
                      const display = typeof val === 'number' ? formatNumber(val) : String(val ?? '—');
                      return (
                        <td
                          key={col}
                          className="border border-slate-200 px-2 py-2 text-right text-[12px] font-bold tabular-nums"
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </FactoryPrintShell>
    );
  },
);
