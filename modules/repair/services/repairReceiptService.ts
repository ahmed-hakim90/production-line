import {
  doc,
  runTransaction,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { REPAIR_COUNTERS_COL } from '../collections';

const pad = (n: number, len = 4) => String(n).padStart(len, '0');

export const repairReceiptService = {
  async nextJobReceiptNo(): Promise<string> {
    if (!isConfigured) return 'REP-0001';
    const counterRef = doc(db, REPAIR_COUNTERS_COL, 'repair_jobs');
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? (snap.data().seq as number) : 0;
      const next = current + 1;
      tx.set(counterRef, { seq: next }, { merge: true });
      return `REP-${pad(next)}`;
    });
  },

  async nextInvoiceNo(): Promise<string> {
    if (!isConfigured) return 'SL-0001';
    const counterRef = doc(db, REPAIR_COUNTERS_COL, 'repair_invoices');
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? (snap.data().seq as number) : 0;
      const next = current + 1;
      tx.set(counterRef, { seq: next }, { merge: true });
      return `SL-${pad(next)}`;
    });
  },
};
