import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type {
  RepairTreasuryBranchDailyBreakdown,
  RepairTreasuryBranchMonthlySummary,
  RepairTreasurySessionDetailsRow,
} from '../modules/repair/types';

const setSheetRtl = (ws: XLSX.WorkSheet) => {
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });
};

const autoCols = (rows: Record<string, unknown>[]) =>
  Object.keys(rows[0] || {}).map((key) => {
    const maxLen = Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length));
    return { wch: Math.min(maxLen + 4, 35) };
  });

const sanitizeFileName = (name: string) =>
  String(name || 'treasury-report')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, '-')
    .trim();

export const exportTreasuryMonthlyExcel = (input: {
  month: string;
  branchScopeLabel: string;
  statusLabel: string;
  summaries: RepairTreasuryBranchMonthlySummary[];
  dailyBreakdown: RepairTreasuryBranchDailyBreakdown[];
  sessions: RepairTreasurySessionDetailsRow[];
}) => {
  const wb = XLSX.utils.book_new();

  const summaryRows = input.summaries.map((row, index) => ({
    '#': index + 1,
    الفرع: row.branchName,
    'عدد الجلسات': row.sessionsCount,
    'إجمالي الافتتاح': Number(row.totalOpening.toFixed(2)),
    'إجمالي الإيراد': Number(row.totalIncome.toFixed(2)),
    'إجمالي المصروف': Number(row.totalExpense.toFixed(2)),
    'إجمالي التحويل الوارد': Number(row.totalTransferIn.toFixed(2)),
    'إجمالي التحويل الصادر': Number(row.totalTransferOut.toFixed(2)),
    'صافي الحركة': Number(row.netMovement.toFixed(2)),
    'إجمالي الإقفال': Number(row.totalClosing.toFixed(2)),
  }));
  if (summaryRows.length > 0) {
    const ws = XLSX.utils.json_to_sheet(summaryRows);
    ws['!cols'] = autoCols(summaryRows);
    setSheetRtl(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  const dailyRows = input.dailyBreakdown.map((row, index) => ({
    '#': index + 1,
    الفرع: row.branchName,
    التاريخ: row.day,
    'عدد الجلسات': row.sessionsCount,
    افتتاح: Number(row.opening.toFixed(2)),
    إيراد: Number(row.income.toFixed(2)),
    مصروف: Number(row.expense.toFixed(2)),
    'تحويل وارد': Number(row.transferIn.toFixed(2)),
    'تحويل صادر': Number(row.transferOut.toFixed(2)),
    الصافي: Number(row.net.toFixed(2)),
    إقفال: Number(row.closing.toFixed(2)),
  }));
  if (dailyRows.length > 0) {
    const ws = XLSX.utils.json_to_sheet(dailyRows);
    ws['!cols'] = autoCols(dailyRows);
    setSheetRtl(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'DailyBreakdown');
  }

  const sessionRows = input.sessions.map((row, index) => ({
    '#': index + 1,
    الفرع: row.branchName,
    'معرف الجلسة': row.sessionId,
    الحالة: row.status === 'closed' ? 'مقفلة' : 'مفتوحة',
    'وقت الفتح': row.openedAt,
    'وقت الإقفال': row.closedAt || '—',
    'رصيد الافتتاح': Number(row.openingBalance || 0),
    'رصيد الإقفال': Number(row.closingBalance || 0),
    'فرق الإقفال': Number(row.closingDifference || 0),
    'سبب الفرق': row.closingDifferenceReason || '—',
    'فاتح الجلسة': row.openedByName || '—',
    'مقفل الجلسة': row.closedByName || '—',
    'عدد الحركات': row.entriesCount,
  }));
  if (sessionRows.length > 0) {
    const ws = XLSX.utils.json_to_sheet(sessionRows);
    ws['!cols'] = autoCols(sessionRows);
    setSheetRtl(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'SessionDetails');
  }

  if (wb.SheetNames.length === 0) {
    const fallbackRows = [{
      الشهر: input.month,
      الفرع: input.branchScopeLabel,
      الحالة: input.statusLabel,
      ملاحظة: 'لا توجد بيانات للتصدير',
    }];
    const ws = XLSX.utils.json_to_sheet(fallbackRows);
    ws['!cols'] = autoCols(fallbackRows);
    setSheetRtl(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  const fileName = sanitizeFileName(`treasury-report-${input.month}-${input.branchScopeLabel}`);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `${fileName}.xlsx`);
};
