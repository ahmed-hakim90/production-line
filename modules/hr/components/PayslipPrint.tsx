import React from 'react';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import type { PayslipData } from '../utils/payslipGenerator';
import { resolvePrintAccentHex } from '@/utils/printTheme';

const formatCurrency = (amount: number) =>
  Number(amount || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getArabicMonth = (month: string) => {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, (mon || 1) - 1, 1);
  return date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
};

export type PayslipPrintProps = {
  data: PayslipData | null;
  printSettings?: PrintTemplateSettings;
};

export const PayslipPrint = React.forwardRef<HTMLDivElement, PayslipPrintProps>(
  function PayslipPrint({ data, printSettings }, ref) {
    if (!data) return <div ref={ref} />;

    const { record: r, month, companyName = 'الشركة', companyLogo, departmentName = '' } = data;
    const ps = {
      ...DEFAULT_PRINT_TEMPLATE,
      ...printSettings,
      ...(companyLogo ? { logoUrl: companyLogo } : {}),
      ...(companyName ? { headerText: companyName } : {}),
    };
    const doc = resolvePrintDocumentConfig(ps, 'payslip');
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const monthLabel = getArabicMonth(month);
    const printedAt = new Date().toLocaleString('ar-EG');

    const earnings = [
      { label: 'الراتب الأساسي', amount: r.baseSalary },
      ...(r.overtimeAmount > 0
        ? [{ label: `بدل ساعات إضافية (${r.overtimeHours} ساعة)`, amount: r.overtimeAmount }]
        : []),
      ...r.allowancesBreakdown.map((a) => ({ label: a.name, amount: a.amount })),
      ...(r.employeeAllowancesBreakdown ?? []).map((a) => ({
        label: `${a.name}${a.isRecurring ? '' : ' (لمرة واحدة)'}`,
        amount: a.amount,
      })),
    ];

    const deductions = [
      ...(r.absenceDeduction > 0
        ? [{ label: `خصم غياب (${r.absentDays} يوم)`, amount: r.absenceDeduction }]
        : []),
      ...(r.latePenalty > 0 ? [{ label: `خصم تأخير (${r.lateDays} يوم)`, amount: r.latePenalty }] : []),
      ...(r.loanInstallment > 0 ? [{ label: 'قسط سلفة', amount: r.loanInstallment }] : []),
      ...(r.unpaidLeaveDeduction > 0
        ? [{ label: `خصم إجازة بدون راتب (${r.unpaidLeaveDays} يوم)`, amount: r.unpaidLeaveDeduction }]
        : []),
      ...(r.transportDeduction > 0 ? [{ label: 'خصم نقل', amount: r.transportDeduction }] : []),
      ...(r.otherPenalties > 0 ? [{ label: 'جزاءات أخرى', amount: r.otherPenalties }] : []),
      ...(r.employeeDeductionsBreakdown ?? []).map((d) => ({
        label: `${d.name}${d.isRecurring ? '' : ' (لمرة واحدة)'}`,
        amount: d.amount,
      })),
    ];

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || companyName}
        documentType="كشف راتب"
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
                { label: 'الموظف', value: r.employeeName || '—' },
                { label: 'الشهر', value: monthLabel },
                { label: 'القسم', value: departmentName || r.departmentId || '—' },
                { label: 'نوع التوظيف', value: r.employmentType || '—' },
              ]
            : undefined
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'الإجمالي', value: `${formatCurrency(r.grossSalary)} ج.م`, tone: 'indigo' },
                { label: 'الخصومات', value: `${formatCurrency(r.totalDeductions)} ج.م`, tone: 'red' },
                { label: 'الصافي', value: `${formatCurrency(r.netSalary)} ج.م`, tone: 'green' },
                {
                  label: 'الحضور',
                  value: `${r.presentDays}/${r.workingDays}`,
                  tone: 'default',
                },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'الموظف' }, { title: 'الموارد البشرية' }, { title: 'الاعتماد' }]
            : undefined
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3">
          {doc.isFieldVisible('earnings') ? (
            <section>
              <FactoryPrintSectionTitle title="الاستحقاقات" accent={accent} />
              <table className="w-full border-collapse text-right">
                <tbody>
                  {earnings.map((row, index) => (
                    <tr key={`${row.label}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold text-slate-700">
                        {row.label}
                      </td>
                      <td
                        className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums"
                        style={{ color: accent }}
                      >
                        {formatCurrency(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {doc.isFieldVisible('deductions') ? (
            <section>
              <FactoryPrintSectionTitle title="الخصومات" accent={accent} />
              {deductions.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
                  لا توجد خصومات
                </div>
              ) : (
                <table className="w-full border-collapse text-right">
                  <tbody>
                    {deductions.map((row, index) => (
                      <tr key={`${row.label}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="border border-slate-200 px-2 py-2 text-[12px] font-bold text-slate-700">
                          {row.label}
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-black tabular-nums text-rose-700">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-600">
          صافي المستحق للصرف: {formatCurrency(r.netSalary)} ج.م — {monthLabel}
        </div>
      </FactoryPrintShell>
    );
  },
);
