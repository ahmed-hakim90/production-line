/**
 * Payslip Generator — Creates printable payslip HTML.
 *
 * Designed for browser print (window.print()) with a clean, professional layout.
 * Supports: PDF generation, email attachment, QR code verification.
 */
import type { FirestorePayrollRecord } from '../payroll/types';

export interface PayslipData {
  record: FirestorePayrollRecord;
  month: string;
  companyName?: string;
  companyLogo?: string;
  departmentName?: string;
}

/** Format a number as currency (Arabic locale) */
function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Get the month name in Arabic */
function getArabicMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1, 1);
  return date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
}

/**
 * Generate payslip HTML string for printing or PDF conversion.
 */
export function generatePayslipHTML(data: PayslipData): string {
  const {
    record: r,
    month,
    companyName = 'الشركة',
    companyLogo,
    departmentName = '',
  } = data;

  const monthLabel = getArabicMonth(month);

  const earningsRows = [
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

  const deductionRows = [
    ...(r.absenceDeduction > 0 ? [{ label: `خصم غياب (${r.absentDays} يوم)`, amount: r.absenceDeduction }] : []),
    ...(r.latePenalty > 0 ? [{ label: `خصم تأخير (${r.lateDays} يوم)`, amount: r.latePenalty }] : []),
    ...(r.loanInstallment > 0 ? [{ label: 'قسط سلفة', amount: r.loanInstallment }] : []),
    ...(r.unpaidLeaveDeduction > 0 ? [{ label: `خصم إجازة بدون راتب (${r.unpaidLeaveDays} يوم)`, amount: r.unpaidLeaveDeduction }] : []),
    ...(r.transportDeduction > 0 ? [{ label: 'خصم نقل', amount: r.transportDeduction }] : []),
    ...(r.otherPenalties > 0 ? [{ label: 'جزاءات أخرى', amount: r.otherPenalties }] : []),
    ...(r.employeeDeductionsBreakdown ?? []).map((d) => ({
      label: `${d.name}${d.isRecurring ? '' : ' (لمرة واحدة)'}`,
      amount: d.amount,
    })),
  ];

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشف راتب - ${r.employeeName} - ${monthLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 13px;
      color: #1e293b;
      background: white;
      padding: 24px;
      direction: rtl;
    }
    .payslip {
      max-width: 800px;
      margin: 0 auto;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      color: white;
      padding: 24px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header .company { font-size: 20px; font-weight: 800; }
    .header .month-label { font-size: 14px; opacity: 0.9; }
    .header .logo { width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .header .logo img { max-width: 48px; max-height: 48px; }
    .employee-info {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      padding: 20px 32px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .info-item .label { font-size: 11px; color: #94a3b8; font-weight: 600; margin-bottom: 4px; }
    .info-item .value { font-weight: 700; font-size: 14px; }
    .section {
      padding: 20px 32px;
      border-bottom: 1px solid #e2e8f0;
    }
    .section-title {
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title .dot {
      width: 8px; height: 8px; border-radius: 50%;
    }
    .earnings .dot { background: #10b981; }
    .deductions .dot { background: #ef4444; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    table td {
      padding: 8px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    table td:last-child {
      text-align: left;
      font-weight: 700;
      font-family: 'Courier New', monospace;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      padding: 24px 32px;
      background: #f8fafc;
    }
    .summary-box {
      text-align: center;
      padding: 16px;
      border-radius: 8px;
      background: white;
      border: 1px solid #e2e8f0;
    }
    .summary-box .label { font-size: 11px; color: #94a3b8; font-weight: 600; }
    .summary-box .value { font-size: 20px; font-weight: 800; margin-top: 4px; }
    .summary-box.net { background: #1e40af; color: white; border-color: #1e40af; }
    .summary-box.net .label { color: rgba(255,255,255,0.8); }
    .footer {
      padding: 24px 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .signature {
      text-align: center;
      min-width: 160px;
    }
    .signature .line { border-top: 1px solid #cbd5e1; margin-top: 40px; padding-top: 8px; font-size: 11px; color: #94a3b8; }
    .qr-code {
      width: 80px; height: 80px; border: 1px solid #e2e8f0;
      border-radius: 8px; display: flex; align-items: center;
      justify-content: center; font-size: 9px; color: #64748b;
      text-align: center; padding: 4px; word-break: break-all;
      font-family: 'Courier New', monospace;
    }
    @media print {
      body { padding: 0; }
      .payslip { border: 1px solid #ccc; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="payslip">
    <div class="header">
      <div>
        <div class="company">${companyName}</div>
        <div class="month-label">كشف راتب — ${monthLabel}</div>
      </div>
      <div class="logo">
        ${companyLogo ? `<img src="${companyLogo}" alt="logo">` : '🏭'}
      </div>
    </div>

    <div class="employee-info">
      <div class="info-item">
        <div class="label">اسم الموظف</div>
        <div class="value">${r.employeeName}</div>
      </div>
      <div class="info-item">
        <div class="label">القسم</div>
        <div class="value">${departmentName || r.departmentId}</div>
      </div>
      <div class="info-item">
        <div class="label">نوع التوظيف</div>
        <div class="value">${r.employmentType === 'monthly' ? 'شهري' : r.employmentType === 'daily' ? 'يومي' : 'بالساعة'}</div>
      </div>
      <div class="info-item">
        <div class="label">أيام العمل</div>
        <div class="value">${r.workingDays} يوم</div>
      </div>
      <div class="info-item">
        <div class="label">أيام الحضور</div>
        <div class="value">${r.presentDays} يوم</div>
      </div>
      <div class="info-item">
        <div class="label">أيام الغياب</div>
        <div class="value">${r.absentDays} يوم</div>
      </div>
    </div>

    <div class="section earnings">
      <div class="section-title"><span class="dot"></span> المستحقات</div>
      <table>
        ${earningsRows.map((row) => `
        <tr>
          <td>${row.label}</td>
          <td>${formatCurrency(row.amount)}</td>
        </tr>`).join('')}
        <tr style="border-top: 2px solid #10b981; font-weight: 800;">
          <td>إجمالي المستحقات</td>
          <td style="color: #10b981;">${formatCurrency(r.grossSalary)}</td>
        </tr>
      </table>
    </div>

    ${deductionRows.length > 0 ? `
    <div class="section deductions">
      <div class="section-title"><span class="dot"></span> الاستقطاعات</div>
      <table>
        ${deductionRows.map((row) => `
        <tr>
          <td>${row.label}</td>
          <td>${formatCurrency(row.amount)}</td>
        </tr>`).join('')}
        <tr style="border-top: 2px solid #ef4444; font-weight: 800;">
          <td>إجمالي الاستقطاعات</td>
          <td style="color: #ef4444;">${formatCurrency(r.totalDeductions)}</td>
        </tr>
      </table>
    </div>` : ''}

    <div class="summary">
      <div class="summary-box">
        <div class="label">إجمالي المستحقات</div>
        <div class="value" style="color: #10b981;">${formatCurrency(r.grossSalary)}</div>
      </div>
      <div class="summary-box">
        <div class="label">إجمالي الاستقطاعات</div>
        <div class="value" style="color: #ef4444;">${formatCurrency(r.totalDeductions)}</div>
      </div>
      <div class="summary-box net">
        <div class="label">صافي الراتب</div>
        <div class="value">${formatCurrency(r.netSalary)}</div>
      </div>
    </div>

    <div class="footer">
      <div class="signature">
        <div class="line">توقيع الموظف</div>
      </div>
      <div class="qr-code" title="رمز التحقق">${r.id ? r.id.slice(-8).toUpperCase() : '—'}<br/><span style="font-size:7px;color:#94a3b8;">رمز التحقق</span></div>
      <div class="signature">
        <div class="line">توقيع المدير المالي</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Open payslip in a new window for printing.
 */
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
}

function extractInnerBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch?.[1]?.trim() ?? '';
}

function extractStyle(html: string): string {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  return styleMatch?.[1]?.trim() ?? '';
}

/**
 * Generate a single printable HTML document with all employees.
 * Each employee payslip is rendered on a separate page.
 */
export function generateCombinedPayslipHTML(data: CombinedPayslipData): string {
  const { records, month, companyName = 'الشركة', companyLogo } = data;
  if (records.length === 0) return '';

  const firstHtml = generatePayslipHTML({
    record: records[0],
    month,
    companyName,
    companyLogo,
  });
  const baseStyle = extractStyle(firstHtml);

  const pages = records
    .map((record) => {
      const single = generatePayslipHTML({ record, month, companyName, companyLogo });
      const body = extractInnerBody(single);
      return `<section class="payslip-page">${body}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>سركيات الموظفين - ${month}</title>
  <style>
    ${baseStyle}
    body {
      margin: 0;
      padding: 16px;
      background: #f8fafc;
      direction: rtl;
    }
    .payslip-page {
      page-break-after: always;
      break-after: page;
      margin-bottom: 16px;
    }
    .payslip-page:last-child {
      page-break-after: auto;
      break-after: auto;
      margin-bottom: 0;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .payslip-page { margin-bottom: 0; }
    }
  </style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

/**
 * Open combined payslips in a single print dialog.
 * User can save as one PDF file with multiple pages.
 */
export function printCombinedPayslips(data: CombinedPayslipData): void {
  const html = generateCombinedPayslipHTML(data);
  if (!html) return;
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => printWindow.print();
}
