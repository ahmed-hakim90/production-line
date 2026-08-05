import * as XLSX from 'xlsx';
import { normalizeCustomerCode } from './customerCode';
import {
  parseCustomerTypeLabel,
  type Customer,
  type CustomerCreateInput,
  type CustomerType,
} from '../types';

export type CustomerImportRowStatus = 'create' | 'update' | 'error' | 'skip';

export type ParsedCustomerImportRow = {
  rowNo: number;
  code: string;
  type: CustomerType | null;
  name: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
  status: CustomerImportRowStatus;
  error?: string;
  existingId?: string;
};

export type CustomerImportParseResult = {
  rows: ParsedCustomerImportRow[];
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

function parseActiveFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return true;
  if (['0', 'no', 'false', 'غير نشط', 'لا', 'inactive'].includes(v)) return false;
  return true;
}

export function toCustomerUpsertInput(
  row: ParsedCustomerImportRow,
): CustomerCreateInput & { code: string } {
  if (!row.code || !row.type) {
    throw new Error('صف الاستيراد غير صالح.');
  }
  return {
    code: row.code,
    type: row.type,
    name: row.name,
    phone: row.phone,
    address: row.address || undefined,
    notes: row.notes || undefined,
    isActive: row.isActive,
  };
}

export function parseCustomersExcel(
  fileBuffer: ArrayBuffer,
  existingByCode?: Map<string, Customer>,
): CustomerImportParseResult {
  const wb = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName =
    wb.SheetNames.find((n) => /عميل|customer/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], readyCount: 0, errorCount: 0 };
  }
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const seenCodes = new Set<string>();
  const rows: ParsedCustomerImportRow[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNo = idx + 2;
    const code = normalizeCustomerCode(
      getCell(raw, ['الكود', 'كود', 'كود العميل', 'code', 'customer code', 'customer_code']),
    );
    const name = getCell(raw, ['الاسم', 'اسم العميل', 'name', 'customer name']);
    const phone = getCell(raw, ['الهاتف', 'الموبايل', 'رقم الهاتف', 'phone', 'mobile']);
    const typeRaw = getCell(raw, ['النوع', 'نوع العميل', 'type', 'customer type']);
    const address = getCell(raw, ['العنوان', 'address']);
    const notes = getCell(raw, ['ملاحظات', 'notes', 'note']);
    const activeRaw = getCell(raw, ['الحالة', 'نشط', 'status', 'active', 'isactive']);
    const type = parseCustomerTypeLabel(typeRaw);
    const isActive = parseActiveFlag(activeRaw);

    let status: CustomerImportRowStatus = 'create';
    let error: string | undefined;
    let existingId: string | undefined;

    // Phone is stored as uploaded (no format validation) — matching/repair can use digits later.
    if (!code && !name && !phone) {
      status = 'skip';
      error = 'صف فارغ';
    } else if (!code) {
      status = 'error';
      error = 'الكود مطلوب';
    } else if (!name) {
      status = 'error';
      error = 'الاسم مطلوب';
    } else if (!type) {
      status = 'error';
      error = 'النوع يجب أن يكون مستهلك أو تاجر';
    } else if (seenCodes.has(code)) {
      status = 'error';
      error = 'كود مكرر داخل الملف';
    } else {
      const existing = existingByCode?.get(code);
      if (existing?.id) {
        status = 'update';
        existingId = existing.id;
      } else {
        status = 'create';
      }
      seenCodes.add(code);
    }

    rows.push({
      rowNo,
      code,
      type,
      name,
      phone,
      address,
      notes,
      isActive,
      status,
      error,
      existingId,
    });
  });

  const usable = rows.filter((r) => r.status !== 'skip');
  return {
    rows: usable,
    readyCount: usable.filter((r) => r.status === 'create' || r.status === 'update').length,
    errorCount: usable.filter((r) => r.status === 'error').length,
  };
}

export function downloadCustomersTemplate(): void {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ['الكود', 'النوع', 'الاسم', 'الهاتف', 'العنوان', 'ملاحظات', 'الحالة'],
    ['CST-00001', 'مستهلك', 'أحمد محمد', '01001234567', 'القاهرة', '', 'نشط'],
    ['TRD-00001', 'تاجر', 'مؤسسة النور', '01009876543', 'الجيزة', 'عميل جملة', 'نشط'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 16 },
    { wch: 24 },
    { wch: 20 },
    { wch: 10 },
  ];
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as Array<Record<string, unknown>>).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, ws, 'العملاء');

  const guide: (string | number)[][] = [
    ['الحقل', 'مطلوب؟', 'ملاحظات'],
    ['الكود', 'نعم', 'فريد داخل الشركة — مفتاح الإنشاء/التحديث'],
    ['النوع', 'نعم', 'مستهلك أو تاجر'],
    ['الاسم', 'نعم', ''],
    ['الهاتف', 'لا', 'يُحفظ كما في الملف بدون تحقق من الصيغة'],
    ['العنوان', 'لا', ''],
    ['ملاحظات', 'لا', ''],
    ['الحالة', 'لا', 'نشط / غير نشط — الافتراضي نشط'],
  ];
  const guideWs = XLSX.utils.aoa_to_sheet(guide);
  guideWs['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, guideWs, 'تعليمات');

  XLSX.writeFile(wb, 'template_customers.xlsx');
}
