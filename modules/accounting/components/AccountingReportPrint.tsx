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
  type FactoryPrintMetaCard,
} from '@/src/components/erp/FactoryPrintShell';
import { resolvePrintAccentHex } from '@/utils/printTheme';

export type AccountingPrintColumn = {
  key: string;
  label: string;
  align?: 'right' | 'center' | 'left';
  mono?: boolean;
  width?: string;
};

export type AccountingReportPrintProps = {
  title: string;
  subtitle?: string;
  metaCards?: FactoryPrintMetaCard[];
  kpis?: FactoryPrintKpi[];
  columns: AccountingPrintColumn[];
  rows: Array<Record<string, string | number>>;
  emptyLabel?: string;
  printSettings?: PrintTemplateSettings;
  signatures?: { title: string }[];
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

export const AccountingReportPrint = React.forwardRef<HTMLDivElement, AccountingReportPrintProps>(
  function AccountingReportPrint(
    {
      title,
      subtitle,
      metaCards,
      kpis,
      columns,
      rows,
      emptyLabel = 'لا توجد بيانات للطباعة.',
      printSettings,
      signatures = [{ title: 'المحاسب' }, { title: 'الاعتماد' }],
    },
    ref,
  ) {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'accountingReport');
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const printedAt = new Date().toLocaleString('ar-EG');
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const defaultMeta = [
      { label: 'المستند', value: title },
      { label: 'النطاق', value: subtitle || '—' },
      { label: 'عدد الصفوف', value: String(rows.length) },
      { label: 'تاريخ الطباعة', value: printedAt },
    ];

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'المحاسبة'}
        documentType={title}
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? metaCards && metaCards.length > 0
              ? metaCards
              : defaultMeta
            : undefined
        }
        kpis={doc.isFieldVisible('kpis') ? kpis : undefined}
        signatures={
          isThermal || !doc.isFieldVisible('signatures') ? undefined : signatures
        }
      >
        <section className="mb-2">
          <FactoryPrintSectionTitle title={subtitle || 'التفاصيل'} accent={accent} />
          {rows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
              {emptyLabel}
            </div>
          ) : (
            <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-100 text-[10px] font-extrabold text-slate-600">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`border border-slate-200 px-1.5 py-2 ${
                        col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right'
                      }`}
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {columns.map((col) => {
                      const value = row[col.key];
                      return (
                        <td
                          key={col.key}
                          className={`border border-slate-200 px-1.5 py-2 text-[11px] font-bold ${
                            col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right'
                          } ${col.mono ? 'font-mono tabular-nums' : 'tabular-nums'}`}
                          style={col.mono ? { color: accent } : undefined}
                        >
                          {value == null || value === '' ? '—' : String(value)}
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
