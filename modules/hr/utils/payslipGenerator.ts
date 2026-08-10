/**
 * Payslip Generator — Factory-styled printable payslip HTML.
 * Used for single and combined browser print (self-contained CSS).
 */
import type { FirestorePayrollRecord } from '../payroll/types';
import { Factory_DEFAULT_FOOTER_TAGLINE, resolveImageExportPalette, type ImageExportPalette } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '@/utils/printTheme';

export interface PayslipData {
  record: FirestorePayrollRecord;
  month: string;
  companyName?: string;
  companyLogo?: string;
  departmentName?: string;
  /** printTemplate.primaryColor (falls back to UI theme). */
  primaryColor?: string;
}

function formatCurrency(amount: number): string {
  return Number(amount || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getArabicMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, (mon || 1) - 1, 1);
  return date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
}

function buildPayslipCss(palette: ImageExportPalette): string {
  const accent = palette.primary;
  const badgeBg = palette.badgeBg;
  return `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif;
    font-size: 13px;
    color: #0f172a;
    background: #fff;
    direction: rtl;
  }
  .sheet {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    padding: 10mm 12mm;
    box-sizing: border-box;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    border-bottom: 2px solid ${accent};
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .brand h1 { font-size: 18px; font-weight: 900; color: #0f172a; }
  .brand .sys { margin-top: 2px; font-size: 10px; font-weight: 700; color: ${accent}; }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${badgeBg};
    color: ${accent};
    font-size: 13px;
    font-weight: 900;
    border-radius: 6px;
    padding: 5px 10px;
  }
  .print-date { margin-top: 4px; font-size: 11px; color: #64748b; text-align: left; }
  .meta {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .meta-cell {
    background: #f8fafc;
    padding: 8px 12px;
    border-left: 1px solid #e2e8f0;
  }
  .meta-cell:last-child { border-left: none; }
  .meta-cell .l { font-size: 9px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
  .meta-cell .v { font-size: 11px; font-weight: 900; color: #1e293b; word-break: break-word; }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  .kpi {
    display: flex;
    min-height: 72px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    overflow: hidden;
  }
  .kpi-strip { width: 3px; flex-shrink: 0; }
  .kpi-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; text-align: center; }
  .kpi-value { font-size: 18px; font-weight: 900; line-height: 1.15; }
  .kpi-label { margin-top: 6px; font-size: 11px; font-weight: 800; color: #64748b; }
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 8px;
    font-size: 11px;
    font-weight: 900;
    color: #475569;
  }
  .section-title .bar {
    width: 3px;
    height: 12px;
    border-radius: 999px;
    background: ${accent};
  }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  td {
    border: 1px solid #e2e8f0;
    padding: 8px;
    font-size: 12px;
    font-weight: 700;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  .amt { text-align: center; font-weight: 900; color: ${accent}; font-variant-numeric: tabular-nums; }
  .amt-ded { text-align: center; font-weight: 900; color: #b91c1c; font-variant-numeric: tabular-nums; }
  .net-box {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 800;
    color: #475569;
    margin-bottom: 20px;
  }
  .signs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 24px;
  }
  .sign { text-align: center; }
  .sign .t { font-size: 12px; font-weight: 900; color: #334155; margin-bottom: 28px; }
  .sign .line { border-top: 1px solid #cbd5e1; padding-top: 4px; font-size: 10px; color: #94a3b8; }
  .footer {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #e2e8f0;
    margin-top: 16px;
    padding-top: 12px;
    font-size: 10px;
    color: #94a3b8;
  }
  .footer .ver { font-weight: 800; color: ${accent}; }
  @page { size: A4 portrait; margin: 10mm; }
  @media print {
    html, body { width: 100% !important; margin: 0 !important; padding: 0 !important; }
    .sheet {
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  }
`;
}

function resolvePayslipPalette(primaryColor?: string): ImageExportPalette {
  return resolveImageExportPalette(resolvePrintAccentHex(primaryColor));
}


function buildEarnings(r: FirestorePayrollRecord) {
  return [
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
}

function buildDeductions(r: FirestorePayrollRecord) {
  return [
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
}

function renderPayslipBody(data: PayslipData, palette: ImageExportPalette): string {
  const { record: r, month, companyName = 'الشركة', companyLogo, departmentName = '' } = data;
  const accent = palette.primary;
  const monthLabel = getArabicMonth(month);
  const printedAt = new Date().toLocaleString('ar-EG');
  const earnings = buildEarnings(r);
  const deductions = buildDeductions(r);

  return `
  <div class="sheet print-root print-report arabic-export-root">
    <div class="header">
      <div class="brand">
        ${companyLogo ? `<img src="${companyLogo}" alt="" style="max-height:40px;margin-bottom:6px;display:block;" />` : ''}
        <h1>${companyName}</h1>
        <div class="sys">Factory PRODUCTION SYSTEM</div>
      </div>
      <div>
        <div class="badge">كشف راتب</div>
        <div class="print-date">${printedAt}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-cell"><div class="l">الموظف</div><div class="v">${r.employeeName || '—'}</div></div>
      <div class="meta-cell"><div class="l">الشهر</div><div class="v">${monthLabel}</div></div>
      <div class="meta-cell"><div class="l">القسم</div><div class="v">${departmentName || r.departmentId || '—'}</div></div>
      <div class="meta-cell"><div class="l">نوع التوظيف</div><div class="v">${r.employmentType || '—'}</div></div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-strip" style="background:${accent}"></div><div class="kpi-body"><div class="kpi-value" style="color:${accent}">${formatCurrency(r.grossSalary)}</div><div class="kpi-label">الإجمالي</div></div></div>
      <div class="kpi"><div class="kpi-strip" style="background:#dc2626"></div><div class="kpi-body"><div class="kpi-value" style="color:#b91c1c">${formatCurrency(r.totalDeductions)}</div><div class="kpi-label">الخصومات</div></div></div>
      <div class="kpi"><div class="kpi-strip" style="background:#059669"></div><div class="kpi-body"><div class="kpi-value" style="color:#047857">${formatCurrency(r.netSalary)}</div><div class="kpi-label">الصافي</div></div></div>
      <div class="kpi"><div class="kpi-strip" style="background:#cbd5e1"></div><div class="kpi-body"><div class="kpi-value">${r.presentDays}/${r.workingDays}</div><div class="kpi-label">الحضور</div></div></div>
    </div>

    <div class="cols">
      <div>
        <div class="section-title"><span class="bar"></span>الاستحقاقات</div>
        <table>
          ${earnings
            .map(
              (row) =>
                `<tr><td>${row.label}</td><td class="amt">${formatCurrency(row.amount)}</td></tr>`,
            )
            .join('')}
        </table>
      </div>
      <div>
        <div class="section-title"><span class="bar"></span>الخصومات</div>
        ${
          deductions.length === 0
            ? '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;color:#64748b;font-weight:800;">لا توجد خصومات</div>'
            : `<table>${deductions
                .map(
                  (row) =>
                    `<tr><td>${row.label}</td><td class="amt-ded">${formatCurrency(row.amount)}</td></tr>`,
                )
                .join('')}</table>`
        }
      </div>
    </div>

    <div class="net-box">صافي المستحق للصرف: ${formatCurrency(r.netSalary)} ج.م — ${monthLabel}</div>

    <div class="signs">
      <div class="sign"><div class="t">الموظف</div><div class="line">الاسم / التوقيع</div></div>
      <div class="sign"><div class="t">الموارد البشرية</div><div class="line">الاسم / التوقيع</div></div>
      <div class="sign"><div class="t">الاعتماد</div><div class="line">الاسم / التوقيع</div></div>
    </div>

    <div class="footer">
      <span>${Factory_DEFAULT_FOOTER_TAGLINE} — ${printedAt}</span>
      <span class="ver">Factory</span>
    </div>
  </div>`;
}

export function generatePayslipHTML(data: PayslipData): string {
  const monthLabel = getArabicMonth(data.month);
  const palette = resolvePayslipPalette(data.primaryColor);
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشف راتب - ${data.record.employeeName} - ${monthLabel}</title>
  <style>${buildPayslipCss(palette)}</style>
</head>
<body>
  ${renderPayslipBody(data, palette)}
</body>
</html>`;
}

export function printPayslip(data: PayslipData): void {
  const html = generatePayslipHTML(data);
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => printWindow.print();
}

export interface CombinedPayslipData {
  records: FirestorePayrollRecord[];
  month: string;
  companyName?: string;
  companyLogo?: string;
  primaryColor?: string;
}

export function generateCombinedPayslipHTML(data: CombinedPayslipData): string {
  const { records, month, companyName = 'الشركة', companyLogo, primaryColor } = data;
  if (records.length === 0) return '';
  const palette = resolvePayslipPalette(primaryColor);

  const pages = records
    .map((record) => {
      const body = renderPayslipBody({ record, month, companyName, companyLogo, primaryColor }, palette);
      return `<section class="payslip-page">${body}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشوفات الموظفين - ${month}</title>
  <style>
    ${buildPayslipCss(palette)}
    .payslip-page {
      page-break-after: always;
      break-after: page;
    }
    .payslip-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  </style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

export function printCombinedPayslips(data: CombinedPayslipData): void {
  const html = generateCombinedPayslipHTML(data);
  if (!html) return;
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => printWindow.print();
}
