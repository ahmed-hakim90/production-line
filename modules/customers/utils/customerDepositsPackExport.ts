import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { Timestamp } from 'firebase/firestore';
import { getCurrentTenantId, getCurrentTenantIdOrNull } from '../../../lib/currentTenant';
import { customerDepositCustomerService } from '../services/customerDepositCustomerService';
import { customerDepositBankAccountService } from '../services/customerDepositBankAccountService';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import { customerDepositAdjustmentService } from '../services/customerDepositAdjustmentService';
import type {
  CustomerDepositAdjustment,
  CustomerDepositCompanyBankAccount,
  CustomerDepositCustomer,
  CustomerDepositEntry,
} from '../types';
import {
  CUSTOMER_DEPOSITS_PACK_VERSION,
  type CustomerDepositsPack,
  type SerializedCustomerDepositDoc,
} from './customerDepositsPackTypes';

function tsToIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const d = (value as Timestamp).toDate?.();
      if (d && !Number.isNaN(d.getTime())) return d.toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * كود عميل من Excel أو تصدير قديم: فواصل آلاف (1,925) ليست عملة؛ رقم الخلية يُقرأ كصحيح.
 */
function parseCustomerCodeFromExcel(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.trunc(raw));
  }
  const s = String(raw)
    .trim()
    .replace(/[,،٬']/g, '')
    .replace(/[\u00A0\u202F\u2009]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** يحوّل مستندًا من Firestore إلى كائن JSON بدون دوال؛ الطوابع الزمنية → ISO */
export function serializeDocForPack<T extends { id: string }>(row: T): SerializedCustomerDepositDoc {
  const { id, ...rest } = row;
  const out: Record<string, unknown> = { _docId: id };
  for (const [k, v] of Object.entries(rest)) {
    if (k === 'id') continue;
    if (k === 'tenantId') continue; // يُعاد من السيرفر عند الاستيراد
    if (k === 'code') {
      out[k] = parseCustomerCodeFromExcel(v);
      continue;
    }
    if (k === 'codeNormalized') continue;
    const iso = tsToIso(v);
    if (iso !== undefined) {
      out[k] = iso;
      continue;
    }
    if (v !== undefined && v !== null && typeof v === 'object' && 'toDate' in (v as object)) {
      const i = tsToIso(v);
      out[k] = i ?? null;
      continue;
    }
    out[k] = v as unknown;
  }
  if (typeof out.code === 'string') {
    out.codeNormalized = out.code.replace(/\s+/g, '');
  }
  return out as SerializedCustomerDepositDoc;
}

export async function buildCustomerDepositsPack(): Promise<CustomerDepositsPack> {
  const tenantId = getCurrentTenantId();
  const [customers, companyBankAccounts, entries, adjustments] = await Promise.all([
    customerDepositCustomerService.getAll(),
    customerDepositBankAccountService.getAll(),
    customerDepositEntryService.listAllForExport(),
    customerDepositAdjustmentService.listAllForExport(),
  ]);

  return {
    metadata: {
      customerDepositsPackVersion: CUSTOMER_DEPOSITS_PACK_VERSION,
      tenantId,
      exportedAt: new Date().toISOString(),
    },
    customers: customers.map((c) => serializeDocForPack(c as CustomerDepositCustomer)),
    companyBankAccounts: companyBankAccounts.map((b) => serializeDocForPack(b as CustomerDepositCompanyBankAccount)),
    entries: entries.map((e) => serializeDocForPack(e as CustomerDepositEntry)),
    adjustments: adjustments.map((a) => serializeDocForPack(a as CustomerDepositAdjustment)),
  };
}

export function downloadCustomerDepositsPackJson(pack: CustomerDepositsPack, filenameBase = 'customer-deposits-pack'): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
  saveAs(blob, `${filenameBase}-${pack.metadata.exportedAt.slice(0, 10)}.json`);
}

function rowsFromSerialized(docs: SerializedCustomerDepositDoc[]): Record<string, unknown>[] {
  return docs.map((d) => {
    const { _docId, ...fields } = d;
    return { _docId, ...fields };
  });
}

export function downloadCustomerDepositsPackExcel(pack: CustomerDepositsPack, filenameBase = 'customer-deposits-pack'): void {
  const wb = XLSX.utils.book_new();
  const sheets: { name: string; data: Record<string, unknown>[] }[] = [
    { name: 'العملاء', data: rowsFromSerialized(pack.customers) },
    { name: 'حسابات_البنك', data: rowsFromSerialized(pack.companyBankAccounts) },
    { name: 'الإيداعات', data: rowsFromSerialized(pack.entries) },
    { name: 'التسويات', data: rowsFromSerialized(pack.adjustments) },
  ];
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ _note: 'فارغ' }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filenameBase}-${pack.metadata.exportedAt.slice(0, 10)}.xlsx`,
  );
}

/** قالب JSON بدون tenantId — يُحدَّد المستأجر من حسابك عند الاستيراد. */
export function downloadCustomerDepositsPackJsonTemplate(): void {
  const pack: CustomerDepositsPack = {
    metadata: {
      customerDepositsPackVersion: CUSTOMER_DEPOSITS_PACK_VERSION,
      exportedAt: new Date().toISOString(),
    },
    customers: [{ code: 'C001', name: 'مثال عميل' }],
    companyBankAccounts: [{ accountNumber: '1234567890', bankLabel: 'مثال بنك' }],
    entries: [],
    adjustments: [],
  };
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
  saveAs(blob, 'customer-deposits-pack-template.json');
}

/** قالب Excel: عملاء وبنوك بحقول مطلوبة فقط (بدون معرّف شركة). */
export function downloadCustomerDepositsPackExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  const instructionsAoa: string[][] = [
    ['قالب إيداعات العملاء'],
    [''],
    ['لا تُدرج معرّف الشركة (tenantId) — يُحدَّد تلقائيًا من حسابك عند الاستيراد عبر JSON.'],
    [
      'ورقة العملاء: يكفي code و name (أو عربي: الكود، الاسم، رصيد افتتاحي، نشط). إن ظهر الكود بفواصل مثل 1,925 فهو من تنسيق Excel وليس مبلغًا — يُنظَّف تلقائيًا.',
    ],
    ['ورقة البنك: يكفي accountNumber و bankLabel. الرصيد الافتتاحي و isActive اختياريان — الافتراضي 0 و true.'],
    ['للاستيراد: JSON أو هذا الملف Excel (نفس الأوراق). الإيداعات الموكّدة عبر الاستيراد السحابي.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructionsAoa);
  wsInstr['!cols'] = [{ wch: 88 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'تعليمات');

  const custH = ['code', 'name'];
  const custR = ['C001', 'مثال عميل'];
  const wsCust = XLSX.utils.aoa_to_sheet([custH, custR]);
  XLSX.utils.book_append_sheet(wb, wsCust, 'العملاء');

  const bankH = ['accountNumber', 'bankLabel'];
  const bankR = ['1234567890', 'مثال بنك'];
  const wsBank = XLSX.utils.aoa_to_sheet([bankH, bankR]);
  XLSX.utils.book_append_sheet(wb, wsBank, 'حسابات_البنك');

  const entH = [
    '_docId',
    'amount',
    'depositorName',
    'depositorAccountNumber',
    'customerId',
    'customerCodeSnapshot',
    'customerNameSnapshot',
    'companyBankAccountId',
    'bankLabelSnapshot',
    'depositDate',
    'status',
    'createdByUid',
    'createdAt',
    'confirmedByUid',
    'confirmedAt',
    'updatedAt',
  ];
  const entR = [
    '(مطلوب_للإيداعات)',
    1000,
    'اسم المودع',
    '',
    '(معرف_عميل)',
    'C001',
    'اسم العميل',
    '(معرف_حساب_بنك)',
    'بنك',
    '2026-01-15',
    'pending',
    '',
    '',
    '',
    '',
    '',
  ];
  const wsEnt = XLSX.utils.aoa_to_sheet([entH, entR]);
  XLSX.utils.book_append_sheet(wb, wsEnt, 'الإيداعات');

  const adjH = [
    '_docId',
    'effectiveDate',
    'signedAmount',
    'note',
    'customerId',
    'companyBankAccountId',
    'createdByUid',
    'createdAt',
  ];
  const adjR = ['(مطلوب)', '2026-01-15', 0, 'ملاحظة', '', '', '', ''];
  const wsAdj = XLSX.utils.aoa_to_sheet([adjH, adjR]);
  XLSX.utils.book_append_sheet(wb, wsAdj, 'التسويات');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'customer-deposits-pack-template.xlsx',
  );
}

const PACK_SHEET_CUSTOMERS = 'العملاء';
const PACK_SHEET_BANKS = 'حسابات_البنك';
const PACK_SHEET_ENTRIES = 'الإيداعات';
const PACK_SHEET_ADJUSTMENTS = 'التسويات';

function trimSheetRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/^\uFEFF/, '').trim();
    if (!key || key.startsWith('__')) continue;
    out[key] = v;
  }
  return out;
}

function isEmptyPackRow(row: Record<string, unknown>): boolean {
  if (row._note === 'فارغ') return true;
  const entries = Object.entries(row).filter(([k]) => !k.startsWith('__'));
  if (entries.length === 0) return true;
  return entries.every(([, v]) => v === '' || v == null);
}

function parseExcelBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number' && !Number.isNaN(v)) return v !== 0;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (['true', 'yes', '1', 'y', 'نعم', 'ن'].includes(s)) return true;
  if (['false', 'no', '0', 'n', 'لا'].includes(s)) return false;
  return undefined;
}

function parseExcelNumber(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v ?? '')
    .trim()
    .replace(/,/g, '');
  if (!s) return Number.NaN;
  return Number(s);
}

function normalizePackCellValue(v: unknown): unknown {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return v;
}

function normalizeFullExcelRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = normalizePackCellValue(v);
  }
  return out;
}

function isPlaceholderEntryDocId(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return true;
  if (s.includes('(')) return true;
  if (s.includes('مطلوب')) return true;
  return false;
}

/** صف إيداع/تسوية بلا بيانات فعلية (يُتخطّى في Excel وقبل Callable). */
function isBlankEntryOrAdjustmentPackRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).filter((k) => k !== '_docId' && k !== 'id');
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = row[k];
    return v === null || v === undefined || v === '';
  });
}

function newClientImportDocId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** يقبل فقط معرّفات مستند صالحة لـ Firestore؛ وإلا يُعاد فراغ لتوليد جديد. */
function sanitizeImportDocIdValue(v: unknown): string {
  let s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  if (!s || s.includes('/') || s === '.' || s === '..') return '';
  if (s.includes('(') || s.includes('مطلوب')) return '';
  return s;
}

/**
 * يضمن لكل إيداع/تسوية `_docId` غير فارغ قبل Callable — يتوافق مع نسخ سحابة قديمة كانت ترفض غيابه.
 */
export function sanitizeCustomerDepositsPackForCallable(pack: CustomerDepositsPack): CustomerDepositsPack {
  const cleanModuleRows = (rows: SerializedCustomerDepositDoc[]): SerializedCustomerDepositDoc[] =>
    rows
      .filter((r) => r != null && typeof r === 'object' && !Array.isArray(r))
      .filter((r) => !isBlankEntryOrAdjustmentPackRow(r as Record<string, unknown>))
      .map((r) => {
        const o = { ...(r as Record<string, unknown>) };
        let id = sanitizeImportDocIdValue(o._docId ?? o.id);
        if (!id) id = newClientImportDocId();
        delete o.id;
        o._docId = id;
        return o as SerializedCustomerDepositDoc;
      });

  return {
    ...pack,
    entries: cleanModuleRows(pack.entries ?? []),
    adjustments: cleanModuleRows(pack.adjustments ?? []),
  };
}

const CUSTOMER_EXCEL_ALIAS_KEYS = new Set([
  'الكود',
  'كود',
  'رقم العميل',
  'رقم_العميل',
  'الاسم',
  'اسم',
  'إسم العميل',
  'اسم العميل',
  'رصيد افتتاحي',
  'رصيد_افتتاحي',
  'نشط',
]);

function coerceCustomerRowFromExcel(row: Record<string, unknown>): SerializedCustomerDepositDoc {
  const n = normalizeFullExcelRow(row);
  const codeRaw =
    n.code ?? n['الكود'] ?? n['كود'] ?? n['رقم العميل'] ?? n['رقم_العميل'];
  const nameRaw =
    n.name ?? n['الاسم'] ?? n['اسم'] ?? n['إسم العميل'] ?? n['اسم العميل'];
  const code = parseCustomerCodeFromExcel(codeRaw);
  const name = String(nameRaw ?? '').trim();
  const openingSrc =
    n.openingBalance !== undefined && n.openingBalance !== null && n.openingBalance !== ''
      ? n.openingBalance
      : n['رصيد افتتاحي'] ?? n['رصيد_افتتاحي'];
  let openingBalance = 0;
  if (openingSrc !== undefined && openingSrc !== null && openingSrc !== '') {
    const parsed =
      typeof openingSrc === 'number' && !Number.isNaN(openingSrc)
        ? openingSrc
        : parseExcelNumber(openingSrc);
    if (Number.isNaN(parsed)) {
      throw new Error(`عميل (كود: ${code || '—'}): openingBalance يجب أن يكون رقمًا إن وُجد`);
    }
    openingBalance = parsed;
  }
  const isActiveRaw = n.isActive ?? n['نشط'];
  const isActive =
    isActiveRaw === undefined || isActiveRaw === null || isActiveRaw === ''
      ? true
      : typeof isActiveRaw === 'boolean'
        ? isActiveRaw
        : (parseExcelBoolean(isActiveRaw) ?? true);
  const docId = String(n._docId ?? n.id ?? '').trim();
  const { _docId: _dropD, id: _dropI, ...rest } = n;
  const restClean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    const kt = k.replace(/^\uFEFF/, '').trim();
    if (CUSTOMER_EXCEL_ALIAS_KEYS.has(kt)) continue;
    restClean[k] = v;
  }
  const out: Record<string, unknown> = { ...restClean, code, name, openingBalance, isActive };
  if (docId) out._docId = docId;
  return out as SerializedCustomerDepositDoc;
}

const BANK_EXCEL_ALIAS_KEYS = new Set(['رقم الحساب', 'البنك', 'البنك / الوصف', 'رصيد افتتاحي', 'رصيد_افتتاحي', 'نشط']);

function coerceBankRowFromExcel(row: Record<string, unknown>): SerializedCustomerDepositDoc {
  const n = normalizeFullExcelRow(row);
  const accountSrc = n.accountNumber ?? n['رقم الحساب'];
  const labelSrc = n.bankLabel ?? n['البنك'] ?? n['البنك / الوصف'];
  const accountNumber =
    typeof accountSrc === 'number' && Number.isFinite(accountSrc)
      ? String(Math.trunc(accountSrc))
      : String(accountSrc ?? '')
          .trim()
          .replace(/[,،٬']/g, '')
          .replace(/[\u00A0\u202F\u2009]/g, '');
  const bankLabel = String(labelSrc ?? '').trim();
  let openingBalance = 0;
  const bankOpeningSrc =
    n.openingBalance !== undefined && n.openingBalance !== null && n.openingBalance !== ''
      ? n.openingBalance
      : n['رصيد افتتاحي'] ?? n['رصيد_افتتاحي'];
  if (bankOpeningSrc !== undefined && bankOpeningSrc !== null && bankOpeningSrc !== '') {
    const parsed =
      typeof bankOpeningSrc === 'number' && !Number.isNaN(bankOpeningSrc)
        ? bankOpeningSrc
        : parseExcelNumber(bankOpeningSrc);
    if (Number.isNaN(parsed)) {
      throw new Error(`حساب بنك (${accountNumber || '—'}): openingBalance يجب أن يكون رقمًا إن وُجد`);
    }
    openingBalance = parsed;
  }
  const isActiveRaw = n.isActive ?? n['نشط'];
  const isActive =
    isActiveRaw === undefined || isActiveRaw === null || isActiveRaw === ''
      ? true
      : typeof isActiveRaw === 'boolean'
        ? isActiveRaw
        : (parseExcelBoolean(isActiveRaw) ?? true);
  const docId = String(n._docId ?? n.id ?? '').trim();
  const { _docId: _dropD, id: _dropI, ...rest } = n;
  const restClean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    const kt = k.replace(/^\uFEFF/, '').trim();
    if (BANK_EXCEL_ALIAS_KEYS.has(kt)) continue;
    restClean[k] = v;
  }
  const out: Record<string, unknown> = { ...restClean, accountNumber, bankLabel, openingBalance, isActive };
  if (docId) out._docId = docId;
  return out as SerializedCustomerDepositDoc;
}

function rowFromExcelGeneric(row: Record<string, unknown>): SerializedCustomerDepositDoc {
  const idRaw = row._docId !== '' && row._docId != null ? row._docId : row.id;
  let docId = idRaw !== '' && idRaw != null ? String(idRaw).trim() : '';
  if (isPlaceholderEntryDocId(docId)) docId = '';
  const out: Record<string, unknown> = {};
  if (docId) out._docId = docId;
  for (const [k, v] of Object.entries(row)) {
    if (k === '_docId' || k === 'id') continue;
    if (k === 'customerCodeSnapshot') {
      out[k] = parseCustomerCodeFromExcel(v);
      continue;
    }
    out[k] = normalizePackCellValue(v);
  }
  return out as SerializedCustomerDepositDoc;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 80 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

const EXCEL_PARSE_YIELD_EVERY = 400;

/**
 * يقرأ حزمة من ملف Excel بنفس أسماء الأوراق كالتصدير/القالب: العملاء، حسابات_البنك، الإيداعات، التسويات.
 * صفوف العملاء/البنك: code+name (أو حساب+اسم بنك) كافية؛ الرصيد الافتتاحي وisActive اختياريان (0 و true).
 * غير متزامن: يُفسح المجال للواجهة أثناء معالجة الصفوف الكثيرة.
 */
export async function parseCustomerDepositsPackExcel(data: ArrayBuffer): Promise<CustomerDepositsPack> {
  await yieldToMain();
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  await yieldToMain();

  const readCustomerSheet = async (): Promise<SerializedCustomerDepositDoc[]> => {
    const ws = wb.Sheets[PACK_SHEET_CUSTOMERS];
    if (!ws) return [];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    const out: SerializedCustomerDepositDoc[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      if (i > 0 && i % EXCEL_PARSE_YIELD_EVERY === 0) await yieldToMain();
      const row = trimSheetRowKeys(rawRows[i]);
      if (isEmptyPackRow(row)) continue;
      out.push(coerceCustomerRowFromExcel(row));
    }
    return out;
  };

  const readBankSheet = async (): Promise<SerializedCustomerDepositDoc[]> => {
    const ws = wb.Sheets[PACK_SHEET_BANKS];
    if (!ws) return [];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    const out: SerializedCustomerDepositDoc[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      if (i > 0 && i % EXCEL_PARSE_YIELD_EVERY === 0) await yieldToMain();
      const row = trimSheetRowKeys(rawRows[i]);
      if (isEmptyPackRow(row)) continue;
      out.push(coerceBankRowFromExcel(row));
    }
    return out;
  };

  const readEntriesOrAdjustments = async (sheetName: string): Promise<SerializedCustomerDepositDoc[]> => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    const out: SerializedCustomerDepositDoc[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      if (i > 0 && i % EXCEL_PARSE_YIELD_EVERY === 0) await yieldToMain();
      const row = trimSheetRowKeys(rawRows[i]);
      if (isEmptyPackRow(row)) continue;
      if (isBlankEntryOrAdjustmentPackRow(row)) continue;
      out.push(rowFromExcelGeneric(row));
    }
    return out;
  };

  const exportedAt = new Date().toISOString();
  const [customers, companyBankAccounts, entries, adjustments] = await Promise.all([
    readCustomerSheet(),
    readBankSheet(),
    readEntriesOrAdjustments(PACK_SHEET_ENTRIES),
    readEntriesOrAdjustments(PACK_SHEET_ADJUSTMENTS),
  ]);

  return {
    metadata: {
      customerDepositsPackVersion: CUSTOMER_DEPOSITS_PACK_VERSION,
      exportedAt,
    },
    customers,
    companyBankAccounts,
    entries,
    adjustments,
  };
}

/** يضيف `metadata.tenantId` من جلسة التطبيق قبل استدعاء Cloud Function — الملف يمكن أن يبقى بلا معرّف شركة. */
export function attachSessionTenantToPackForImport(pack: CustomerDepositsPack): Record<string, unknown> {
  const tenantId = getCurrentTenantIdOrNull();
  const tid = String(tenantId ?? '').trim();
  if (!tid) {
    throw new Error('معرّف الشركة غير متاح في الجلسة. أعد تسجيل الدخول أو تأكد من اختيار الشركة.');
  }
  const sanitized = sanitizeCustomerDepositsPackForCallable(pack);
  return {
    ...sanitized,
    metadata: {
      ...sanitized.metadata,
      tenantId: tid,
    },
  } as Record<string, unknown>;
}

export function parseCustomerDepositsPackJson(text: string): CustomerDepositsPack {
  const raw = JSON.parse(text) as unknown;
  if (!raw || typeof raw !== 'object') throw new Error('ملف JSON غير صالح');
  const p = raw as Partial<CustomerDepositsPack>;
  if (p.metadata?.customerDepositsPackVersion !== CUSTOMER_DEPOSITS_PACK_VERSION) {
    throw new Error(`إصدار الحزمة غير مدعوم (متوقع ${CUSTOMER_DEPOSITS_PACK_VERSION})`);
  }
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const exportedAt =
    typeof p.metadata?.exportedAt === 'string' && p.metadata.exportedAt.trim()
      ? p.metadata.exportedAt.trim()
      : new Date().toISOString();
  const metadata: CustomerDepositsPack['metadata'] = {
    customerDepositsPackVersion: CUSTOMER_DEPOSITS_PACK_VERSION,
    exportedAt,
  };
  const tid = typeof p.metadata?.tenantId === 'string' ? p.metadata.tenantId.trim() : '';
  if (tid) metadata.tenantId = tid;

  return {
    metadata,
    customers: arr(p.customers) as SerializedCustomerDepositDoc[],
    companyBankAccounts: arr(p.companyBankAccounts) as SerializedCustomerDepositDoc[],
    entries: arr(p.entries) as SerializedCustomerDepositDoc[],
    adjustments: arr(p.adjustments) as SerializedCustomerDepositDoc[],
  };
}
