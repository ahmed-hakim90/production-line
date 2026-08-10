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
            <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-100 text-[10px] font-extrabold text-slate-600">
                  <th className="border border-slate-200 px-1.5 py-2" style={{ width: '22%' }}>الفرع</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '10%' }}>جلسات</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '14%' }}>افتتاح</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '14%' }}>دخل</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '14%' }}>صرف</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '13%' }}>صافي</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '13%' }}>إقفال</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((row, index) => (
                  <tr key={row.branchId || index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-200 px-1.5 py-2 text-[11px] font-extrabold text-slate-900">
                      {row.branchName || '—'}
                    </td>
                    <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold tabular-nums">
                      {fmt(row.sessionsCount)}
                    </td>
                    <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold tabular-nums">
                      {fmt(row.totalOpening)}
                    </td>
                    <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold tabular-nums text-emerald-700">
                      {fmt(row.totalIncome)}
                    </td>
                    <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold tabular-nums text-rose-700">
                      {fmt(row.totalExpense)}
                    </td>
                    <td
                      className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-black tabular-nums"
                      style={{ color: Number(row.netMovement || 0) < 0 ? '#b91c1c' : accent }}
                    >
                      {fmt(row.netMovement)}
                    </td>
                    <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-black tabular-nums">
                      {fmt(row.totalClosing)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {(report.paymentMethodSummaries || []).length > 0 ? (
          <section className="mb-2">
            <FactoryPrintSectionTitle title="ملخص وسائل الدفع" accent={accent} />
            <table className="w-full border-collapse text-right" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-100 text-[10px] font-extrabold text-slate-600">
                  <th className="border border-slate-200 px-1.5 py-2" style={{ width: '28%' }}>الفرع</th>
                  <th className="border border-slate-200 px-1.5 py-2" style={{ width: '22%' }}>الوسيلة</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '16%' }}>دخل</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '16%' }}>صرف</th>
                  <th className="border border-slate-200 px-1.5 py-2 text-center" style={{ width: '18%' }}>صافي</th>
                </tr>
              </thead>
              <tbody>
                {report.paymentMethodSummaries.map((row, index) => {
                  const methodLabel =
                    row.paymentMethod === 'cash'
                      ? 'نقدي'
                      : row.paymentMethod === 'card'
                        ? 'بطاقة'
                        : row.paymentMethod === 'bank_transfer'
                          ? 'تحويل'
                          : 'غير محدد';
                  return (
                    <tr key={`${row.branchId}-${row.paymentMethod}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-200 px-1.5 py-2 text-[11px] font-extrabold">{row.branchName}</td>
                      <td className="border border-slate-200 px-1.5 py-2 text-[11px] font-bold">{methodLabel}</td>
                      <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold tabular-nums">
                        {fmt(row.income)}
                      </td>
                      <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold tabular-nums">
                        {fmt(row.expense)}
                      </td>
                      <td className="border border-slate-200 px-1.5 py-2 text-center text-[11px] font-black tabular-nums">
                        {fmt(row.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </FactoryPrintShell>
    );
  },
);
