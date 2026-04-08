import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { OnlineDispatchShipment, OnlineDispatchStatus } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';

const COLLECTION = 'online_dispatch_shipments';
export const BOSTA_BARCODE_PREFIX = 'BOSTA_';
/** Max length for stored/scanned barcodes (aligned with Firestore rules). */
export const MAX_DISPATCH_BARCODE_LENGTH = 512;
const DIGITS_LEN = 10;
const SCAN_COOLDOWN_MS = 1200;

const cooldown = new Map<string, number>();

function cooldownKey(kind: 'w' | 'p', barcode: string) {
  return `${kind}:${barcode}`;
}

/** Trim only; barcode value must match what is stored on the shipment. */
export function normalizeBostaBarcode(raw: string): string {
  return raw.trim();
}

export function isValidDispatchBarcode(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= MAX_DISPATCH_BARCODE_LENGTH;
}

function randomDigits(len: number): string {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += String(arr[i]! % 10);
  }
  return out;
}

async function barcodeExists(barcode: string): Promise<boolean> {
  const q = query(
    tenantQuery(db, COLLECTION, where('barcode', '==', barcode)),
    limit(1),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function generateUniqueBarcode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `${BOSTA_BARCODE_PREFIX}${randomDigits(DIGITS_LEN)}`;
    if (!(await barcodeExists(code))) return code;
  }
  throw new Error('تعذر توليد باركود فريد، حاول مرة أخرى');
}

export const onlineDispatchService = {
  collectionName: COLLECTION,

  async createShipment(input: { notes?: string } = {}): Promise<{ id: string; barcode: string }> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const tenantId = getCurrentTenantId();
    const barcode = await generateUniqueBarcode();
    const trimmedNotes = input.notes?.trim();
    const payload: Record<string, unknown> = {
      tenantId,
      barcode,
      status: 'pending' as OnlineDispatchStatus,
      createdAt: serverTimestamp(),
    };
    if (trimmedNotes) payload.notes = trimmedNotes;
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { id: ref.id, barcode };
  },

  async getByBarcode(barcode: string): Promise<(OnlineDispatchShipment & { id: string }) | null> {
    if (!isConfigured) return null;
    const normalized = normalizeBostaBarcode(barcode);
    if (!isValidDispatchBarcode(normalized)) return null;
    const q = query(
      tenantQuery(db, COLLECTION, where('barcode', '==', normalized)),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return { id: d.id, ...(d.data() as OnlineDispatchShipment) };
  },

  async applyWarehouseScan(uid: string, rawBarcode: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const barcode = normalizeBostaBarcode(rawBarcode);
    if (!isValidDispatchBarcode(barcode)) {
      throw new Error('أدخل باركودًا غير فارغ (حد أقصى ٥١٢ حرفًا)');
    }
    const ck = cooldownKey('w', barcode);
    const now = Date.now();
    if (cooldown.has(ck) && now - (cooldown.get(ck) || 0) < SCAN_COOLDOWN_MS) {
      throw new Error('تم تجاهل المسح المتكرر السريع لنفس الباركود');
    }

    const q0 = query(tenantQuery(db, COLLECTION, where('barcode', '==', barcode)), limit(1));
    const snap0 = await getDocs(q0);
    if (snap0.empty) {
      const tenantId = getCurrentTenantId();
      await addDoc(collection(db, COLLECTION), {
        tenantId,
        barcode,
        status: 'at_warehouse' as OnlineDispatchStatus,
        createdAt: serverTimestamp(),
        handedToWarehouseAt: serverTimestamp(),
        handedToWarehouseByUid: uid,
      });
      cooldown.set(ck, Date.now());
      return;
    }
    const docRef = snap0.docs[0]!.ref;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error('لا يوجد سجل لهذا الباركود');
      const cur = snap.data() as OnlineDispatchShipment;
      if (cur.status === 'at_warehouse') {
        throw new Error('تم تسجيل التسليم للمخزن مسبقًا لهذا الباركود');
      }
      if (cur.status === 'handed_to_post') {
        throw new Error('تم تسليم هذه الشحنة للبوسطة مسبقًا — لا يمكن تسجيلها للمخزن مجددًا');
      }
      if (cur.status !== 'pending') {
        throw new Error('حالة الشحنة غير صالحة لمسح المخزن');
      }
      tx.update(docRef, {
        status: 'at_warehouse' as OnlineDispatchStatus,
        handedToWarehouseAt: serverTimestamp(),
        handedToWarehouseByUid: uid,
      });
    });
    cooldown.set(ck, Date.now());
  },

  async applyPostScan(uid: string, rawBarcode: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const barcode = normalizeBostaBarcode(rawBarcode);
    if (!isValidDispatchBarcode(barcode)) {
      throw new Error('أدخل باركودًا غير فارغ (حد أقصى ٥١٢ حرفًا)');
    }
    const ck = cooldownKey('p', barcode);
    const now = Date.now();
    if (cooldown.has(ck) && now - (cooldown.get(ck) || 0) < SCAN_COOLDOWN_MS) {
      throw new Error('تم تجاهل المسح المتكرر السريع لنفس الباركود');
    }

    const q0 = query(tenantQuery(db, COLLECTION, where('barcode', '==', barcode)), limit(1));
    const snap0 = await getDocs(q0);
    if (snap0.empty) {
      throw new Error('هذا الباركود غير مسجّل — امسح من «تسليم للمخزن» أولًا لتسجيله');
    }
    const docRef = snap0.docs[0]!.ref;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error('هذا الباركود غير مسجّل — امسح من «تسليم للمخزن» أولًا لتسجيله');
      const cur = snap.data() as OnlineDispatchShipment;
      if (cur.status === 'pending') {
        throw new Error('الشحنة لم تُسجَّل للمخزن بعد — اطلب من المخزن مسح هذا الباركود أولًا');
      }
      if (cur.status === 'handed_to_post') {
        throw new Error('تم تسجيل التسليم للبوسطة مسبقًا لهذا الباركود');
      }
      if (cur.status !== 'at_warehouse') {
        throw new Error('حالة الشحنة غير صالحة لتسليم البوسطة');
      }
      tx.update(docRef, {
        status: 'handed_to_post' as OnlineDispatchStatus,
        handedToPostAt: serverTimestamp(),
        handedToPostByUid: uid,
      });
    });
    cooldown.set(ck, Date.now());
  },

  /**
   * Undo the first handoff (warehouse scan): at_warehouse → pending.
   * Requires Firestore rules: manage or handoffToWarehouse.
   */
  async revertWarehouseHandoff(_uid: string, docId: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const docRef = doc(db, COLLECTION, docId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error('لا يوجد سجل لهذه الشحنة');
      const cur = snap.data() as OnlineDispatchShipment;
      if (cur.status !== 'at_warehouse') {
        throw new Error('يمكن التراجع فقط عن شحنة في انتظار البوسطة (لم تُسجَّل للبوسطة بعد)');
      }
      tx.update(docRef, {
        status: 'pending' as OnlineDispatchStatus,
        handedToWarehouseAt: deleteField(),
        handedToWarehouseByUid: deleteField(),
      });
    });
  },

  subscribeWarehouseQueue(
    onCount: (n: number) => void,
    onError?: (e: Error) => void,
  ): Unsubscribe {
    const q = tenantQuery(db, COLLECTION, where('status', '==', 'at_warehouse'));
    return onSnapshot(
      q,
      (snap) => onCount(snap.size),
      (err) => onError?.(err as Error),
    );
  },

  subscribeAllForTenant(
    onChange: (rows: Array<OnlineDispatchShipment & { id: string }>) => void,
    onError?: (e: Error) => void,
  ): Unsubscribe {
    const q = query(tenantQuery(db, COLLECTION));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as OnlineDispatchShipment) }));
        onChange(rows);
      },
      (err) => onError?.(err as Error),
    );
  },
};

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const t = ts as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  const p = new Date(ts as string).getTime();
  return Number.isFinite(p) ? p : 0;
}

export function isTimestampInRange(ms: number, startMs: number, endMs: number): boolean {
  if (!ms) return false;
  return ms >= startMs && ms <= endMs;
}

/** Count handoffs whose timestamps fall within [startMs, endMs] (local day boundaries ok). */
export function summarizeOnlineDispatchByRange(
  rows: Array<OnlineDispatchShipment & { id: string }>,
  startMs: number,
  endMs: number,
): { toWarehouse: number; toPost: number; queueAtWarehouse: number } {
  let toWarehouse = 0;
  let toPost = 0;
  let queueAtWarehouse = 0;
  for (const r of rows) {
    if (r.status === 'at_warehouse') queueAtWarehouse += 1;
    const hw = toMillis(r.handedToWarehouseAt);
    if (isTimestampInRange(hw, startMs, endMs)) toWarehouse += 1;
    const hp = toMillis(r.handedToPostAt);
    if (isTimestampInRange(hp, startMs, endMs)) toPost += 1;
  }
  return { toWarehouse, toPost, queueAtWarehouse };
}
