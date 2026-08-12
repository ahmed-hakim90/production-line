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
import type { RepairTreasuryMonthlyReportData } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Number(n || 0));

export type RepairTreasuryMonthlyPrintProps = {
  report: RepairTreasuryMonthlyReportData | null;
  branchLabel?: string;
  printSettings?: PrintTemplateSettings;
};

export const RepairTreasuryMonthlyPrint = React.forwardRef<HTMLDivElement, RepairTreasuryMonthlyPrintProps>(
  function RepairTreasuryMonthlyPrint({ report, branchLabel, printSettings }, ref) {
    if (!report) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'repairTreasuryMonthly');
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const printedAt = new Date().toLocaleString('ar-EG');
    const summaries = report.summaries || [];
    const totals = summaries.reduce(
      (acc, row) => {
        acc.sessions += Number(row.sessionsCount || 0);
        acc.opening += Number(row.totalOpening || 0);
        acc.income += Number(row.totalIncome || 0);
        acc.expense += Number(row.totalExpense || 0);
        acc.net += Number(row.netMovement || 0);
        acc.closing += Number(row.totalClosing || 0);
        return acc;
      },
      { sessions: 0, opening: 0, income: 0, expense: 0, net: 0, closing: 0 },
    );

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مركز الصيانة'}
        documentType="تقرير الخزائن الشهري"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_REPAIR_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth="210mm"
        minHeight="297mm"
        padding="10mm 12mm"
        fontFamily={font.fontFamily}
        fontSize={font.fontSize}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'الشهر', value: report.month || '—' },
                { label: 'النطاق', value: branchLabel || 'كل الفروع المصرح بها' },
                { label: 'عدد الفروع', value: String(summaries.length) },
                { label: 'تاريخ الطباعة', value: printedAt },
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'عدد الجلسات', value: totals.sessions, tone: 'default' },
                { label: 'إجمالي الافتتاح', value: `${fmt(totals.opening)} ج.م`, tone: 'indigo' },
                {
                  label: 'صافي الحركة',
                  value: `${fmt(totals.net)} ج.م`,
                  tone: totals.net < 0 ? 'red' : 'green',
                },
                { label: 'إجمالي الإقفال', value: `${fmt(totals.closing)} ج.م`, tone: 'green' },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'محاسب الصيانة' }, { title: 'اعتماد الإدارة' }]
            : undefined
        }
      >
        <section className="mb-4">
          <FactoryPrintSectionTitle title="ملخص الفروع" accent={accent} />
          {summaries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
              لا توجد بيانات للفترة المحددة.
            </div>
          ) : (
            <FactoryPrintTable
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'branch', header: 'الفرع', width: '22%' },
                { key: 'sessions', header: 'جلسات', width: '10%', align: 'center' },
                { key: 'opening', header: 'افتتاح', width: '14%', align: 'center' },
                { key: 'income', header: 'دخل', width: '14%', align: 'center' },
                { key: 'expense', header: 'صرف', width: '14%', align: 'center' },
                { key: 'net', header: 'صافي', width: '13%', align: 'center' },
                { key: 'closing', header: 'إقفال', width: '13%', align: 'center' },
              ]}
              rows={summaries.map((row, index) => ({
                key: row.branchId || String(index),
                cells: {
                  branch: row.branchName || '—',
                  sessions: fmt(row.sessionsCount),
                  opening: fmt(row.totalOpening),
                  income: <span className="text-emerald-700 font-bold tabular-nums">{fmt(row.totalIncome)}</span>,
                  expense: <span className="text-rose-700 font-bold tabular-nums">{fmt(row.totalExpense)}</span>,
                  net: (
                    <FactoryPrintTableAccentValue
                      accent={Number(row.netMovement || 0) < 0 ? '#b91c1c' : accent}
                    >
                      {fmt(row.netMovement)}
                    </FactoryPrintTableAccentValue>
                  ),
                  closing: fmt(row.totalClosing),
                },
              }))}
            />
          )}
        </section>

        {(report.paymentMethodSummaries || []).length > 0 ? (
          <section className="mb-2">
            <FactoryPrintSectionTitle title="ملخص وسائل الدفع" accent={accent} />
            <FactoryPrintTable
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'branch', header: 'الفرع', width: '28%' },
                { key: 'method', header: 'الوسيلة', width: '22%' },
                { key: 'income', header: 'دخل', width: '16%', align: 'center' },
                { key: 'expense', header: 'صرف', width: '16%', align: 'center' },
                { key: 'net', header: 'صافي', width: '18%', align: 'center' },
              ]}
              rows={report.paymentMethodSummaries.map((row, index) => {
                const methodLabel =
                  row.paymentMethod === 'cash'
                    ? 'نقدي'
                    : row.paymentMethod === 'card'
                      ? 'بطاقة'
                      : row.paymentMethod === 'bank_transfer'
                        ? 'تحويل'
                        : 'غير محدد';
                return {
                  key: `${row.branchId}-${row.paymentMethod}-${index}`,
                  cells: {
                    branch: row.branchName,
                    method: methodLabel,
                    income: fmt(row.income),
                    expense: fmt(row.expense),
                    net: (
                      <FactoryPrintTableAccentValue accent={accent}>
                        {fmt(row.net)}
                      </FactoryPrintTableAccentValue>
                    ),
                  },
                };
              })}
            />
          </section>
        ) : null}
      </FactoryPrintShell>
    );
  },
);
