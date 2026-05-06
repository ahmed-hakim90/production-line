import { doc, getDoc, getDocs, type Firestore, type Transaction } from 'firebase/firestore';
import { db } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';

/** Thrown when saving an entity whose business code already exists for the tenant. */
export const DUPLICATE_ENTITY_CODE = 'DUPLICATE_ENTITY_CODE';

export const ENTITY_CODE_COUNTER_KEYS = {
  product: 'product',
  rawMaterial: 'raw_material',
  categoryProduct: 'category_product',
  categoryRawMaterial: 'category_raw_material',
} as const;

export type EntityCodeCounterKey = (typeof ENTITY_CODE_COUNTER_KEYS)[keyof typeof ENTITY_CODE_COUNTER_KEYS];

const COUNTERS_COLLECTION = 'entity_code_counters';

function counterDocRef(dbInst: Firestore, tenantId: string, entityKey: string) {
  return doc(dbInst, COUNTERS_COLLECTION, `${tenantId}_${entityKey}`);
}

export function normalizeEntityCodePrefix(value: string, fallback: string): string {
  const v = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (v.length < 1) return fallback;
  return v.slice(0, 8);
}

export function clampPadding(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 2) return fallback;
  return Math.min(12, Math.max(2, Math.floor(n)));
}

export function formatEntityCode(prefix: string, seq: number, padding: number): string {
  const p = normalizeEntityCodePrefix(prefix, 'X');
  const s = Math.max(1, Math.floor(seq));
  return `${p}-${String(s).padStart(padding, '0')}`;
}

/** Max numeric suffix for codes like PREFIX-0001 matching current prefix. */
export function maxSeqFromCodes(codes: readonly string[], prefix: string): number {
  const p = normalizeEntityCodePrefix(prefix, 'X');
  const re = new RegExp(`^${escapeRegExp(p)}-(\\d+)$`, 'i');
  let max = 0;
  for (const c of codes) {
    const m = String(c || '').trim().match(re);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return max;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type TxWithQuery = {
  get: (q: unknown) => Promise<{ docs: { data: () => Record<string, unknown> }[] }>;
};

/**
 * Reserve the next code inside an existing Firestore transaction.
 * Seeds from `seedMaxFromTransaction` on first use (when counter doc missing).
 */
export async function allocateNextCodeInTransaction(
  t: Transaction,
  entityKey: string,
  prefix: string,
  padding: number,
  seedMaxFromTransaction: (tx: Transaction) => Promise<number>,
): Promise<string> {
  const tenantId = getCurrentTenantId();
  const cref = counterDocRef(db, tenantId, entityKey);
  const cSnap = await t.get(cref);
  const pad = clampPadding(padding, 4);
  const p = normalizeEntityCodePrefix(prefix, 'X');

  let nextSeq: number;
  if (cSnap.exists()) {
    nextSeq = Math.max(1, Math.floor(Number(cSnap.data()?.lastSeq || 0))) + 1;
  } else {
    const seeded = await seedMaxFromTransaction(t);
    nextSeq = Math.max(1, seeded + 1);
  }

  t.set(
    cref,
    {
      tenantId,
      entityKey,
      lastSeq: nextSeq,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return formatEntityCode(p, nextSeq, pad);
}

/** Peek next code without reserving (display only in forms). */
export async function peekNextCode(
  entityKey: string,
  prefix: string,
  padding: number,
  seedMaxFromAsync: () => Promise<number>,
): Promise<string> {
  const tenantId = getCurrentTenantId();
  const cref = counterDocRef(db, tenantId, entityKey);
  const snap = await getDoc(cref);
  const pad = clampPadding(padding, 4);
  const p = normalizeEntityCodePrefix(prefix, 'X');

  let nextSeq: number;
  if (snap.exists()) {
    nextSeq = Math.max(1, Math.floor(Number(snap.data()?.lastSeq || 0))) + 1;
  } else {
    const seeded = await seedMaxFromAsync();
    nextSeq = Math.max(1, seeded + 1);
  }

  return formatEntityCode(p, nextSeq, pad);
}

/** Run a tenant-scoped query inside a transaction (same pattern as inventoryInvSequence). */
export async function txGetTenantDocs(
  tx: Transaction,
  dbInst: Firestore,
  collectionPath: string,
): Promise<{ docs: { data: () => Record<string, unknown> }[] }> {
  const q = tenantQuery(dbInst, collectionPath);
  return (tx as unknown as TxWithQuery).get(q);
}

const PRODUCTS = 'products';
const RAW_MATERIALS = 'raw_materials';
const PRODUCT_CATEGORIES = 'product_categories';

export async function seedMaxProductCodes(prefix: string): Promise<number> {
  const snap = await getDocs(tenantQuery(db, PRODUCTS));
  const codes = snap.docs.map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCodes(codes, prefix);
}

export async function seedMaxRawMaterialCodes(prefix: string): Promise<number> {
  const snap = await getDocs(tenantQuery(db, RAW_MATERIALS));
  const codes = snap.docs.map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCodes(codes, prefix);
}

export type CategoryTypeFilter = 'product' | 'raw_material';

export async function seedMaxCategoryCodes(prefix: string, type: CategoryTypeFilter): Promise<number> {
  const snap = await getDocs(tenantQuery(db, PRODUCT_CATEGORIES));
  const codes = snap.docs
    .filter((d) => {
      const t = String(d.data()?.type ?? '');
      const effective: CategoryTypeFilter = t === 'raw_material' ? 'raw_material' : 'product';
      return effective === type;
    })
    .map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCodes(codes, prefix);
}

export async function seedMaxCategoryCodesInTransaction(
  tx: Transaction,
  prefix: string,
  type: CategoryTypeFilter,
): Promise<number> {
  const snap = await txGetTenantDocs(tx, db, PRODUCT_CATEGORIES);
  const codes = snap.docs
    .filter((d) => {
      const t = String(d.data()?.type ?? '');
      const effective: CategoryTypeFilter = t === 'raw_material' ? 'raw_material' : 'product';
      return effective === type;
    })
    .map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCodes(codes, prefix);
}
