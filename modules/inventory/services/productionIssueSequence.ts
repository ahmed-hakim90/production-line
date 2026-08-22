import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { formatPiReference } from '../lib/productionIssueRef';

export { formatPiReference, PI_REF_REGEX, piSeqFromReferenceNo } from '../lib/productionIssueRef';

const COUNTERS_COLLECTION = 'inventory_counters';

function counterRef(dbInst: Firestore, tenantId: string) {
  return doc(dbInst, COUNTERS_COLLECTION, tenantId);
}

/**
 * Seed `lastPiSeq` when missing.
 * Never list production_issue_orders here: bound warehouse operators cannot run
 * unfiltered collection queries (Firestore rules require source/target warehouse
 * equality). Same pattern as ensureInvCounter.
 */
export async function ensurePiCounter(): Promise<void> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const snap = await getDoc(cref);
  if (snap.exists() && Number.isFinite(Number(snap.data()?.lastPiSeq))) return;

  const existingSeq = snap.exists() ? Number(snap.data()?.lastPiSeq) : NaN;
  await setDoc(
    cref,
    {
      tenantId,
      lastPiSeq: Number.isFinite(existingSeq) ? Math.max(0, Math.floor(existingSeq)) : 0,
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
 * On counter failure, allocate from a fresh ensure + second transaction attempt
 * rather than scanning issue orders (denied for bound warehouse operators).
 */
export async function allocateNextProductionIssueReference(): Promise<string> {
  await ensurePiCounter();
  try {
    return await runTransaction(db, async (t) => {
      const nextSeq = await readNextPiSeqInTransaction(t);
      return writePiSeqInTransaction(t, nextSeq);
    });
  } catch (error) {
    console.warn('allocateNextProductionIssueReference: counter failed, retry after re-seed', error);
    await ensurePiCounter();
    return runTransaction(db, async (t) => {
      const nextSeq = await readNextPiSeqInTransaction(t);
      return writePiSeqInTransaction(t, nextSeq);
    });
  }
}
