import {
  doc,
  getDoc,
  setDoc,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';

/** Matches legacy reference numbers like INV-001 */
export const INV_REF_REGEX = /^INV-(\d+)$/i;

export const formatInvReference = (seq: number) =>
  `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

const COUNTERS_COLLECTION = 'inventory_counters';

function counterRef(dbInst: Firestore, tenantId: string) {
  return doc(dbInst, COUNTERS_COLLECTION, tenantId);
}

/**
 * Read the next INV sequence inside a transaction (no write).
 * Call this with all other reads — before any writes.
 *
 * Note: Firestore transactions cannot run collection queries. If the counter
 * doc is missing we start at 1 (or a pre-seeded value from `ensureInvCounter`).
 */
export async function readNextInvSeqInTransaction(t: Transaction): Promise<number> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const cSnap = await t.get(cref);
  if (cSnap.exists()) {
    return Math.max(1, Math.floor(Number(cSnap.data().lastInvSeq || 0))) + 1;
  }
  return 1;
}

/**
 * Persist `lastInvSeq` on `inventory_counters/{tenantId}`.
 * Call only after every transaction read is done.
 */
export function writeInvSeqInTransaction(t: Transaction, nextSeq: number): string {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
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

/**
 * Allocate the next INV- reference when the transaction has no further reads.
 * Prefer `readNextInvSeqInTransaction` + `writeInvSeqInTransaction` when the
 * same transaction still needs to read balances or other docs afterward.
 */
export async function allocateInvReferenceInTransaction(t: Transaction): Promise<string> {
  const nextSeq = await readNextInvSeqInTransaction(t);
  return writeInvSeqInTransaction(t, nextSeq);
}

/** Seed counter when missing (outside a transaction). Never list ledgers — bound
 * warehouse operators and supplies roles are denied those unfiltered collection queries. */
export async function ensureInvCounter(): Promise<void> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const snap = await getDoc(cref);
  if (snap.exists()) return;
  await setDoc(
    cref,
    {
      tenantId,
      lastInvSeq: 0,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Best-effort next INV for display only (not reserved). */
export async function peekNextInvReferenceNo(): Promise<string> {
  const tenantId = getCurrentTenantId();
  const cref = counterRef(db, tenantId);
  const snap = await getDoc(cref);
  if (snap.exists()) {
    return formatInvReference(Math.max(1, Math.floor(Number(snap.data().lastInvSeq || 0))) + 1);
  }
  return formatInvReference(1);
}
