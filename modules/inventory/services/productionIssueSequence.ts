import {
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  runTransaction,
  setDoc,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { formatPiReference, piSeqFromReferenceNo } from '../lib/productionIssueRef';

export { formatPiReference, PI_REF_REGEX, piSeqFromReferenceNo } from '../lib/productionIssueRef';

const COUNTERS_COLLECTION = 'inventory_counters';
const ORDERS_COLLECTION = 'production_issue_orders';

function maxPiFromDocs(docs: { data: () => Record<string, unknown> }[]): number {
  return docs.reduce((max, d) => {
    const ref = String(d.data()?.referenceNo || '').trim();
    return Math.max(max, piSeqFromReferenceNo(ref));
  }, 0);
}

function counterRef(dbInst: Firestore, tenantId: string) {
  return doc(dbInst, COUNTERS_COLLECTION, tenantId);
}

/** Seed `lastPiSeq` from recent sequential PI-#### refs when the counter field is missing. */
export async function ensurePiCounter(): Promise<void> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const snap = await getDoc(cref);
  if (snap.exists() && Number.isFinite(Number(snap.data()?.lastPiSeq))) return;

  const orderSnap = await getDocs(
    tenantQuery(db, ORDERS_COLLECTION, orderBy('createdAt', 'desc'), limit(500)),
  );
  const lastPiSeq = Math.max(0, maxPiFromDocs(orderSnap.docs));
  await setDoc(
    cref,
    {
      tenantId,
      lastPiSeq,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

async function readNextPiSeqInTransaction(t: Transaction): Promise<number> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const cSnap = await t.get(cref);
  if (cSnap.exists()) {
    return Math.max(1, Math.floor(Number(cSnap.data().lastPiSeq || 0))) + 1;
  }
  return 1;
}

function writePiSeqInTransaction(t: Transaction, nextSeq: number): string {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  t.set(
    cref,
    {
      tenantId,
      lastPiSeq: nextSeq,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return formatPiReference(nextSeq);
}

/**
 * Reserve the next PI-#### reference (tenant-scoped, transactional).
 * Falls back to max(existing sequential)+1 if the counter write fails.
 */
export async function allocateNextProductionIssueReference(): Promise<string> {
  await ensurePiCounter();
  try {
    return await runTransaction(db, async (t) => {
      const nextSeq = await readNextPiSeqInTransaction(t);
      return writePiSeqInTransaction(t, nextSeq);
    });
  } catch (error) {
    console.warn('allocateNextProductionIssueReference: counter failed, using seed fallback', error);
    const orderSnap = await getDocs(
      tenantQuery(db, ORDERS_COLLECTION, orderBy('createdAt', 'desc'), limit(500)),
    );
    return formatPiReference(maxPiFromDocs(orderSnap.docs) + 1);
  }
}
