import { CUSTOMER_DEPOSITS_PACK_VERSION, type CustomerDepositsPack } from './customerDepositsPackTypes';
import { normalizeBankAccountNumber, normalizeCustomerCode } from './normalize';

/** عدد صفوف المعاينة لكل قسم في واجهة الاستيراد */
export const CUSTOMER_DEPOSITS_PACK_PREVIEW_ROW_LIMIT = 8;

function isBlankPackRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).filter((k) => k !== '_docId' && k !== 'id');
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = row[k];
    return v === null || v === undefined || v === '';
  });
}

function peekDocId(row: Record<string, unknown>): string | undefined {
  const s = String(row._docId ?? row.id ?? '').trim();
  return s || undefined;
}

function takePreview<T>(rows: T[], pick: (row: T) => boolean): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (!pick(r)) continue;
    out.push(r);
    if (out.length >= CUSTOMER_DEPOSITS_PACK_PREVIEW_ROW_LIMIT) break;
  }
  return out;
}

export type CustomerDepositsPackImportAnalysis = {
  versionOk: boolean;
  warnings: string[];
  customers: {
    totalRows: number;
    nonBlankRows: number;
    duplicateCodesNormalized: string[];
    missingCodeOrNameRows: number;
    preview: Record<string, unknown>[];
  };
  banks: {
    totalRows: number;
    nonBlankRows: number;
    duplicateAccountsNormalized: string[];
    missingAccountOrLabelRows: number;
    preview: Record<string, unknown>[];
  };
  entries: {
    totalRows: number;
    nonBlankRows: number;
    withDocId: number;
    withoutDocId: number;
    preview: Record<string, unknown>[];
  };
  adjustments: {
    totalRows: number;
    nonBlankRows: number;
    withDocId: number;
    withoutDocId: number;
    preview: Record<string, unknown>[];
  };
};

export function analyzeCustomerDepositsPackForImport(pack: CustomerDepositsPack): CustomerDepositsPackImportAnalysis {
  const versionOk = pack.metadata.customerDepositsPackVersion === CUSTOMER_DEPOSITS_PACK_VERSION;
  const warnings: string[] = [];
  if (!versionOk) {
    warnings.push(
      `إصدار الحزمة في الملف (${String(pack.metadata.customerDepositsPackVersion)}) لا يطابق المتوقع (${CUSTOMER_DEPOSITS_PACK_VERSION}) — قد يفشل الاستيراد.`,
    );
  }

  const customers = (pack.customers ?? []) as Record<string, unknown>[];
  const banks = (pack.companyBankAccounts ?? []) as Record<string, unknown>[];
  const entries = (pack.entries ?? []) as Record<string, unknown>[];
  const adjustments = (pack.adjustments ?? []) as Record<string, unknown>[];

  const codeCount = new Map<string, number>();
  let custNonBlank = 0;
  let custMissing = 0;
  for (const row of customers) {
    if (isBlankPackRow(row)) continue;
    custNonBlank++;
    const cn = normalizeCustomerCode(String(row.code ?? ''));
    const nameOk = String(row.name ?? '').trim().length > 0;
    if (!cn || !nameOk) custMissing++;
    if (cn) codeCount.set(cn, (codeCount.get(cn) ?? 0) + 1);
  }
  const duplicateCodesNormalized = [...codeCount.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  if (duplicateCodesNormalized.length > 0) {
    warnings.push(
      `أكواد عملاء مكررة داخل الملف (${duplicateCodesNormalized.length} كود) — وضع الدمج يوجّه الصفوف لنفس المستند؛ تعارض الأسماء يرفضه الخادم.`,
    );
  }

  const accCount = new Map<string, number>();
  let bankNonBlank = 0;
  let bankMissing = 0;
  for (const row of banks) {
    if (isBlankPackRow(row)) continue;
    bankNonBlank++;
    const an = normalizeBankAccountNumber(String(row.accountNumber ?? ''));
    const labelOk = String(row.bankLabel ?? '').trim().length > 0;
    if (!an || !labelOk) bankMissing++;
    if (an) accCount.set(an, (accCount.get(an) ?? 0) + 1);
  }
  const duplicateAccountsNormalized = [...accCount.entries()].filter(([, n]) => n > 1).map(([a]) => a);
  if (duplicateAccountsNormalized.length > 0) {
    warnings.push(
      `أرقام حسابات مكررة داخل الملف (${duplicateAccountsNormalized.length}) — الدمج يدمجها؛ تعارض أسماء البنوك يرفضه الخادم.`,
    );
  }

  let entNonBlank = 0;
  let entWith = 0;
  let entWithout = 0;
  for (const row of entries) {
    if (isBlankPackRow(row)) continue;
    entNonBlank++;
    if (peekDocId(row)) entWith++;
    else entWithout++;
  }
  if (entWithout > 0) {
    warnings.push(
      `${entWithout} صف إيداع بلا _docId — سيُنشئ الخادم معرّفًا جديدًا لكل صف؛ تكرار رفع نفس الملف قد يُكرّر الإيداعات.`,
    );
  }

  let adjNonBlank = 0;
  let adjWith = 0;
  let adjWithout = 0;
  for (const row of adjustments) {
    if (isBlankPackRow(row)) continue;
    adjNonBlank++;
    if (peekDocId(row)) adjWith++;
    else adjWithout++;
  }
  if (adjWithout > 0) {
    warnings.push(`${adjWithout} صف تسوية بلا _docId — نفس تحذير الإيداعات ينطبق على التكرار.`);
  }

  return {
    versionOk,
    warnings,
    customers: {
      totalRows: customers.length,
      nonBlankRows: custNonBlank,
      duplicateCodesNormalized,
      missingCodeOrNameRows: custMissing,
      preview: takePreview(customers, (r) => !isBlankPackRow(r)),
    },
    banks: {
      totalRows: banks.length,
      nonBlankRows: bankNonBlank,
      duplicateAccountsNormalized,
      missingAccountOrLabelRows: bankMissing,
      preview: takePreview(banks, (r) => !isBlankPackRow(r)),
    },
    entries: {
      totalRows: entries.length,
      nonBlankRows: entNonBlank,
      withDocId: entWith,
      withoutDocId: entWithout,
      preview: takePreview(entries, (r) => !isBlankPackRow(r)),
    },
    adjustments: {
      totalRows: adjustments.length,
      nonBlankRows: adjNonBlank,
      withDocId: adjWith,
      withoutDocId: adjWithout,
      preview: takePreview(adjustments, (r) => !isBlankPackRow(r)),
    },
  };
}

/** عرض مختصر لقيمة خلية المعاينة */
export function previewCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    try {
      const d = (v as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(v);
    } catch {
      return String(v);
    }
  }
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}
