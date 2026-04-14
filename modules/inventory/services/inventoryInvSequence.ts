import {
  doc,
  getDoc,
  type Firestore,
  type Transaction,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';

/** Matches legacy reference numbers like INV-001 */
export const INV_REF_REGEX = /^INV-(\d+)$/i;

export const formatInvReference = (seq: number) =>
  `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

const COUNTERS_COLLECTION = 'inventory_counters';
const TRANSACTIONS_COLLECTION = 'stock_transactions';
const TRANSFER_REQUESTS_COLLECTION = 'inventory_transfer_requests';

function invSeqFromReferenceNo(referenceNo: string): number {
  const m = String(referenceNo || '').trim().match(INV_REF_REGEX);
  return m ? Number(m[1] || 0) : 0;
}

function maxInvFromDocs(docs: { data: () => Record<string, unknown> }[]): number {
  return docs.reduce((max, d) => {
    const ref = String(d.data()?.referenceNo || '').trim();
    return Math.max(max, invSeqFromReferenceNo(ref));
  }, 0);
}

function counterRef(dbInst: Firestore, tenantId: string) {
  return doc(dbInst, COUNTERS_COLLECTION, tenantId);
}

/**
 * Allocate the next INV- reference inside an existing Firestore transaction.
 * Persists `lastInvSeq` on `inventory_counters/{tenantId}`.
 */
export async function allocateInvReferenceInTransaction(t: Transaction): Promise<string> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const cSnap = await t.get(cref);
  let nextSeq: number;
  if (cSnap.exists()) {
    nextSeq = Math.max(1, Math.floor(Number(cSnap.data().lastInvSeq || 0))) + 1;
  } else {
    const txQ = tenantQuery(db, TRANSACTIONS_COLLECTION, orderBy('createdAt', 'desc'), limit(500));
    const trQ = tenantQuery(db, TRANSFER_REQUESTS_COLLECTION, orderBy('createdAt', 'desc'), limit(500));
    const txSnap = await (t as { get: (q: unknown) => Promise<{ docs: { data: () => Record<string, unknown> }[] }> }).get(
      txQ,
    );
    const trSnap = await (t as { get: (q: unknown) => Promise<{ docs: { data: () => Record<string, unknown> }[] }> }).get(
      trQ,
    );
    const maxLegacy = Math.max(maxInvFromDocs(txSnap.docs), maxInvFromDocs(trSnap.docs));
    nextSeq = Math.max(1, maxLegacy + 1);
  }
  t.set(
    cref,
    {
      tenantId,
      lastInvSeq: nextSeq,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return formatInvReference(nextSeq);
}

/** Best-effort next INV for display only (not reserved). */
export async function peekNextInvReferenceNo(): Promise<string> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const snap = await getDoc(cref);
  if (snap.exists()) {
    return formatInvReference(Math.max(1, Math.floor(Number(snap.data().lastInvSeq || 0))) + 1);
  }
  const [txSnap, trSnap] = await Promise.all([
    getDocs(tenantQuery(db, TRANSACTIONS_COLLECTION, orderBy('createdAt', 'desc'), limit(500))),
    getDocs(tenantQuery(db, TRANSFER_REQUESTS_COLLECTION, orderBy('createdAt', 'desc'), limit(500))),
  ]);
  const maxInv = Math.max(maxInvFromDocs(txSnap.docs), maxInvFromDocs(trSnap.docs));
  return formatInvReference(maxInv + 1);
}
