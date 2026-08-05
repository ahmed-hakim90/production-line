import * as XLSX from 'xlsx';
import { normalizeCustomerCode } from './customerCode';
import { classifyCustomerSizeTier, type CustomerSizeTier } from './customerSizeTier';
import type { Customer } from '../types';

export type CustomerMetricsImportRowStatus = 'ready' | 'error' | 'skip';

export type ParsedCustomerMetricsRow = {
  rowNo: number;
  code: string;
  name: string;
  businessVolume: number | null;
  balance: number | null;
  sizeTier: CustomerSizeTier;
  status: CustomerMetricsImportRowStatus;
  error?: string;
  existingId?: string;
  existingName?: string;
};

export type CustomerMetricsParseResult = {
  rows: ParsedCustomerMetricsRow[];
  readyCount: number;
  errorCount: number;
};

const normalizeHeader = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const getCell = (row: Record<string, unknown>, keys: string[]) => {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([header]) => normalizeHeader(header) === normalizeHeader(key));
    if (found) return String(found[1] ?? '').trim();
  }
  return '';
};

const getRawCell = (row: Record<string, unknown>, keys: string[]): unknown => {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([header]) => normalizeHeader(header) === normalizeHeader(key));
    if (found) return found[1];
  }
  return '';
};

/** يقرأ رقم من خلية Excel — null لو فارغ أو غير صالح */
export function parseMetricsNumericCell(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .trim()
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseCustomerMetricsSheet(
  fileBuffer: ArrayBuffer,
  existingByCode: Map<string, Customer>,
): CustomerMetricsParseResult {
  const wb = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName =
    wb.SheetNames.find((n) => /مؤشر|عميل|metric|customer/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], readyCount: 0, errorCount: 0 };
  }

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const seenCodes = new Set<string>();
  const rows: ParsedCustomerMetricsRow[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNo = idx + 2;
    const code = normalizeCustomerCode(
      getCell(raw, ['الكود', 'كود', 'كود العميل', 'code', 'customer code', 'customer_code']),
    );
    const name = getCell(raw, ['الاسم', 'اسم العميل', 'name', 'customer name']);
    const volumeRaw = getRawCell(raw, [
      'حجم الشغل',
      'حجمالشغل',
      'الحجم',
      'businessvolume',
      'business volume',
      'volume',
    ]);
    const balanceRaw = getRawCell(raw, [
      'الرصيد',
      'المديونية',
      'رصيد',
      'balance',
      'debt',
      'ar',
    ]);
    const businessVolume = parseMetricsNumericCell(volumeRaw);
    const balance = parseMetricsNumericCell(balanceRaw);
    const volumeEmpty =
      volumeRaw == null || String(volumeRaw).trim() === '';
    const balanceEmpty =
      balanceRaw == null || String(balanceRaw).trim() === '';

    let status: CustomerMetricsImportRowStatus = 'ready';
    let error: string | undefined;
    let existingId: string | undefined;
    let existingName: string | undefined;

    if (!code && !name && volumeEmpty && balanceEmpty) {
      status = 'skip';
      error = 'صف فارغ';
    } else if (!code) {
      status = 'error';
      error = 'الكود مطلوب';
    } else if (seenCodes.has(code)) {
      status = 'error';
      error = 'كود مكرر داخل الملف';
    } else if (volumeEmpty || businessVolume == null) {
      status = 'error';
      error = 'حجم الشغل مطلوب ورقم صالح';
    } else if (businessVolume < 0) {
      status = 'error';
      error = 'حجم الشغل لا يمكن أن يكون سالباً';
    } else if (balanceEmpty || balance == null) {
      status = 'error';
      error = 'الرصيد مطلوب ورقم صالح';
    } else {
      const existing = existingByCode.get(code);
      if (!existing?.id) {
        status = 'error';
        error = 'الكود غير موجود في سجل العملاء';
      } else {
        existingId = existing.id;
        existingName = existing.name;
        seenCodes.add(code);
      }
    }

    rows.push({
      rowNo,
      code,
      name,
      businessVolume,
      balance,
      sizeTier: classifyCustomerSizeTier(businessVolume),
      status,
      error,
      existingId,
      existingName,
    });
  });

  const usable = rows.filter((r) => r.status !== 'skip');
  return {
    rows: usable,
    readyCount: usable.filter((r) => r.status === 'ready').length,
    errorCount: usable.filter((r) => r.status === 'error').length,
  };
}

export function downloadCustomerMetricsTemplate(): void {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ['الكود', 'الاسم', 'حجم الشغل', 'الرصيد'],
    ['CST-00001', 'أحمد محمد', 25000, 1500],
    ['TRD-00001', 'مؤسسة النور', 180000, -3200],
    ['TRD-00002', 'تجارة السلام', 450000, 12000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 12 }];
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as Array<Record<string, unknown>>).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, ws, 'المؤشرات');

  const guide: (string | number)[][] = [
    ['الحقل', 'مطلوب؟', 'ملاحظات'],
    ['الكود', 'نعم', 'يجب أن يطابق كود عميل موجود في الماستر'],
    ['الاسم', 'لا', 'للتحقق فقط — لا يُحدَّث من هذا الشيت'],
    ['حجم الشغل', 'نعم', 'رقم ≥ 0 — يحدد التصنيف (صغير/متوسط/كبير)'],
    ['الرصيد', 'نعم', 'مديونية / رصيد شغل — يُسمح بالقيم السالبة'],
    ['التصنيف', 'تلقائي', 'صغير < 50ألف | متوسط 50–199ألف | كبير ≥ 200ألف'],
  ];
  const guideWs = XLSX.utils.aoa_to_sheet(guide);
  guideWs['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, guideWs, 'تعليمات');

  XLSX.writeFile(wb, 'template_customer_metrics.xlsx');
}
