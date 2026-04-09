import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
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
/** Tracking number length after BOSTA_ (labels may use 6–15 digits). */
const MIN_TRACK_DIGITS = 6;
const MAX_TRACK_DIGITS = 15;
const DIGITS_LEN = 10;
const SCAN_COOLDOWN_MS = 1200;
/** Local «day» for warehouse handoff lists: rolls at this hour (default 08:00). */
export const WAREHOUSE_DISPATCH_DAY_START_HOUR = 8;

export type OnlineDispatchScanResult = {
  id: string;
  barcode: string;
  status: OnlineDispatchStatus;
};

const cooldown = new Map<string, number>();

function cooldownKey(kind: 'w' | 'p', barcode: string) {
  return `${kind}:${barcode}`;
}

/**
 * Extracts the numeric tracking id from labels like `BOSTA_81355112`, `D-04-81355112`, or digits-only.
 */
export function extractBostaTrackingDigits(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  const prefixAt = upper.indexOf(BOSTA_BARCODE_PREFIX.toUpperCase());
  if (prefixAt !== -1) {
    const after = t.slice(prefixAt + BOSTA_BARCODE_PREFIX.length);
    const m = after.match(/^\d+/);
    if (m && m[0].length >= MIN_TRACK_DIGITS && m[0].length <= MAX_TRACK_DIGITS) return m[0];
  }
  const end = t.match(/(\d{6,})$/);
  if (end && end[1].length <= MAX_TRACK_DIGITS) return end[1];
  const allDigits = t.replace(/\D/g, '');
  if (allDigits.length >= MIN_TRACK_DIGITS && allDigits.length <= MAX_TRACK_DIGITS) return allDigits;
  return null;
}

/** Canonical form `BOSTA_<digits>` when a tracking id is found; otherwise trimmed raw (legacy). */
export function normalizeBostaBarcode(raw: string): string {
  const digits = extractBostaTrackingDigits(raw);
  if (digits) return `${BOSTA_BARCODE_PREFIX}${digits}`;
  return raw.trim();
}

export function isValidDispatchBarcode(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > MAX_DISPATCH_BARCODE_LENGTH) return false;
  const p = BOSTA_BARCODE_PREFIX;
  if (t.length >= p.length && t.slice(0, p.length).toUpperCase() === p.toUpperCase()) {
    const rest = t.slice(p.length);
    if (!/^\d+$/.test(rest)) return false;
    return rest.length >= MIN_TRACK_DIGITS && rest.length <= MAX_TRACK_DIGITS;
  }
  return true;
}

function isQueryableBarcodeCandidate(b: string): boolean {
  const t = b.trim();
  return t.length > 0 && t.length <= MAX_DISPATCH_BARCODE_LENGTH;
}

async function findFirstShipmentDocByBarcodes(
  candidates: string[],
): Promise<QueryDocumentSnapshot | null> {
  const seen = new Set<string>();
  for (const b of candidates) {
    const t = b.trim();
    if (!isQueryableBarcodeCandidate(t) || seen.has(t)) continue;
    seen.add(t);
    const q = query(tenantQuery(db, COLLECTION, where('barcode', '==', t)), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0]!;
  }
  return null;
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

/**
 * Start of the current warehouse «dispatch day» in local time: [day 08:00, next day 08:00).
 * Before 08:00, the window begins yesterday at 08:00.
 */
export function getWarehouseDispatchDayStartMs(
  atMs: number = Date.now(),
  boundaryHour: number = WAREHOUSE_DISPATCH_DAY_START_HOUR,
): number {
  const at = new Date(atMs);
  const boundary = new Date(at.getFullYear(), at.getMonth(), at.getDate(), boundaryHour, 0, 0, 0);
  if (at.getTime() < boundary.getTime()) {
    boundary.setDate(boundary.getDate() - 1);
  }
  return boundary.getTime();
}

export const onlineDispatchService = {
  collectionName: COLLECTION,

  /**
   * All shipments whose warehouse handoff timestamp falls in the current dispatch day (from 08:00 local).
   * Newest handoffs first. Includes rows later handed to post if warehouse scan was today.
   */
  async listWarehouseHandoffsForDispatchDay(): Promise<Array<OnlineDispatchShipment & { id: string }>> {
    if (!isConfigured) return [];
    const startMs = getWarehouseDispatchDayStartMs();
    const startTs = Timestamp.fromMillis(startMs);
    const q = query(
      tenantQuery(db, COLLECTION, where('handedToWarehouseAt', '>=', startTs), orderBy('handedToWarehouseAt', 'desc')),
      limit(400),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as OnlineDispatchShipment) }));
  },

  /**
   * Shipments handed to post within the current dispatch day (from 08:00 local), by `handedToPostAt`.
   * Newest first. Status is expected to be `handed_to_post`.
   */
  async listPostHandoffsForDispatchDay(): Promise<Array<OnlineDispatchShipment & { id: string }>> {
    if (!isConfigured) return [];
    const startMs = getWarehouseDispatchDayStartMs();
    const startTs = Timestamp.fromMillis(startMs);
    const q = query(
      tenantQuery(db, COLLECTION, where('handedToPostAt', '>=', startTs), orderBy('handedToPostAt', 'desc')),
      limit(400),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as OnlineDispatchShipment) }));
  },

  async createShipment(input: { notes?: string; createdByUid?: string } = {}): Promise<{ id: string; barcode: string }> {
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
    if (input.createdByUid) {
      payload.createdByUid = input.createdByUid;
      payload.lastStatusByUid = input.createdByUid;
    }
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { id: ref.id, barcode };
  },

  async getByBarcode(barcode: string): Promise<(OnlineDispatchShipment & { id: string }) | null> {
    if (!isConfigured) return null;
    const rawT = barcode.trim();
    if (!rawT) return null;
    const normalized = normalizeBostaBarcode(barcode);
    if (!isValidDispatchBarcode(normalized)) return null;
    const candidates = rawT === normalized ? [normalized] : [normalized, rawT];
    const d = await findFirstShipmentDocByBarcodes(candidates);
    if (!d) return null;
    return { id: d.id, ...(d.data() as OnlineDispatchShipment) };
  },

  async applyWarehouseScan(uid: string, rawBarcode: string): Promise<OnlineDispatchScanResult> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const rawT = rawBarcode.trim();
    const barcode = normalizeBostaBarcode(rawBarcode);
    if (!isValidDispatchBarcode(barcode)) {
      throw new Error('أدخل باركودًا غير فارغ (حد أقصى ٥١٢ حرفًا)');
    }
    const ck = cooldownKey('w', barcode);
    const now = Date.now();
    if (cooldown.has(ck) && now - (cooldown.get(ck) || 0) < SCAN_COOLDOWN_MS) {
      throw new Error('تم تجاهل المسح المتكرر السريع لنفس الباركود');
    }

    const candidates = rawT === barcode ? [barcode] : [barcode, rawT];
    const found = await findFirstShipmentDocByBarcodes(candidates);
    if (!found) {
      const tenantId = getCurrentTenantId();
      const ref = await addDoc(collection(db, COLLECTION), {
        tenantId,
        barcode,
        status: 'at_warehouse' as OnlineDispatchStatus,
        createdAt: serverTimestamp(),
        handedToWarehouseAt: serverTimestamp(),
        handedToWarehouseByUid: uid,
        createdByUid: uid,
        lastStatusByUid: uid,
      });
      cooldown.set(ck, Date.now());
      return { id: ref.id, barcode, status: 'at_warehouse' };
    }
    const docRef = found.ref;
    const row = found.data() as OnlineDispatchShipment;
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
        lastStatusByUid: uid,
      });
    });
    cooldown.set(ck, Date.now());
    return { id: docRef.id, barcode: row.barcode, status: 'at_warehouse' };
  },

  async applyPostScan(uid: string, rawBarcode: string): Promise<OnlineDispatchScanResult> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const rawT = rawBarcode.trim();
    const barcode = normalizeBostaBarcode(rawBarcode);
    if (!isValidDispatchBarcode(barcode)) {
      throw new Error('أدخل باركودًا غير فارغ (حد أقصى ٥١٢ حرفًا)');
    }
    const ck = cooldownKey('p', barcode);
    const now = Date.now();
    if (cooldown.has(ck) && now - (cooldown.get(ck) || 0) < SCAN_COOLDOWN_MS) {
      throw new Error('تم تجاهل المسح المتكرر السريع لنفس الباركود');
    }

    const candidates = rawT === barcode ? [barcode] : [barcode, rawT];
    const found = await findFirstShipmentDocByBarcodes(candidates);
    if (!found) {
      throw new Error('هذا الباركود غير مسجّل — امسح من «تسليم للمخزن» أولًا لتسجيله');
    }
    const docRef = found.ref;
    const rowBefore = found.data() as OnlineDispatchShipment;
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
        lastStatusByUid: uid,
      });
    });
    cooldown.set(ck, Date.now());
    return { id: docRef.id, barcode: rowBefore.barcode, status: 'handed_to_post' };
  },

  /**
   * Permanently removes the shipment document (only while `at_warehouse`).
   * Requires Firestore rules: manage or handoffToWarehouse.
   */
  async deleteWarehouseShipment(_uid: string, docId: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const tenantId = getCurrentTenantId();
    const docRef = doc(db, COLLECTION, docId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error('لا يوجد سجل لهذه الشحنة');
      const cur = snap.data() as OnlineDispatchShipment;
      if (cur.tenantId !== tenantId) throw new Error('لا يمكن حذف شحنة من مستأجر آخر');
      if (cur.status !== 'at_warehouse') {
        throw new Error('يمكن الحذف النهائي فقط لشحنة عند المخزن ولم تُسجَّل للبوسطة بعد');
      }
      tx.delete(docRef);
    });
  },

  /**
   * Permanently deletes the shipment document regardless of status (pending / at_warehouse / handed_to_post).
   * Requires Firestore rule `onlineDispatch.deletePermanent`, or the same rules as {@link deleteWarehouseShipment}.
   */
  async deleteShipmentDocument(_uid: string, docId: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase غير مهيأ');
    const tenantId = getCurrentTenantId();
    const docRef = doc(db, COLLECTION, docId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error('لا يوجد سجل لهذه الشحنة');
      const cur = snap.data() as OnlineDispatchShipment;
      if (cur.tenantId !== tenantId) throw new Error('لا يمكن حذف شحنة من مستأجر آخر');
      tx.delete(docRef);
    });
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
        lastStatusByUid: _uid,
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

/** For UI: warehouse handoff / post handoff timestamps from Firestore. */
export function onlineDispatchTsToMs(ts: unknown): number {
  return toMillis(ts);
}

export function isTimestampInRange(ms: number, startMs: number, endMs: number): boolean {
  if (!ms) return false;
  return ms >= startMs && ms <= endMs;
}

/**
 * نافذة «يوم عمل التوزيع» لتاريخ تقويم محلي: من الساعة 08:00 لذلك اليوم حتى 08:00 اليوم التالي (نصف مفتوحة من النهاية).
 */
export function getDispatchDayBoundsForCalendarYmd(ymd: string): { startMs: number; endExclusiveMs: number } {
  const parts = ymd.trim().split('-').map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    const s = getWarehouseDispatchDayStartMs();
    return { startMs: s, endExclusiveMs: s + 24 * 60 * 60 * 1000 };
  }
  const start = new Date(y!, mo! - 1, d!, WAREHOUSE_DISPATCH_DAY_START_HOUR, 0, 0, 0);
  const startMs = start.getTime();
  return { startMs, endExclusiveMs: startMs + 24 * 60 * 60 * 1000 };
}

/**
 * سُلِّم للمخزن ضمن يوم العمل المحدد، ولم يُسجَّل تسليم البوسطة ضمن **نفس** يوم العمل (ما زال عند المخزن، أو سُجِّل للبوسطة بعد ذلك).
 */
export function filterWarehouseButNotPostSameDispatchDay(
  rows: Array<OnlineDispatchShipment & { id: string }>,
  calendarYmd: string,
): Array<OnlineDispatchShipment & { id: string }> {
  const { startMs, endExclusiveMs } = getDispatchDayBoundsForCalendarYmd(calendarYmd);
  return rows.filter((r) => {
    const hw = onlineDispatchTsToMs(r.handedToWarehouseAt);
    if (!hw || hw < startMs || hw >= endExclusiveMs) return false;
    const hp = onlineDispatchTsToMs(r.handedToPostAt);
    if (!hp) return true;
    return hp < startMs || hp >= endExclusiveMs;
  });
}

/** Handoffs in range and creations in range (by timestamps). */
export function summarizeOnlineDispatchByRange(
  rows: Array<OnlineDispatchShipment & { id: string }>,
  startMs: number,
  endMs: number,
): {
  toWarehouse: number;
  toPost: number;
  createdInPeriod: number;
} {
  let toWarehouse = 0;
  let toPost = 0;
  let createdInPeriod = 0;
  for (const r of rows) {
    const cr = toMillis(r.createdAt);
    if (isTimestampInRange(cr, startMs, endMs)) createdInPeriod += 1;

    const hw = toMillis(r.handedToWarehouseAt);
    if (isTimestampInRange(hw, startMs, endMs)) toWarehouse += 1;
    const hp = toMillis(r.handedToPostAt);
    if (isTimestampInRange(hp, startMs, endMs)) toPost += 1;
  }
  return { toWarehouse, toPost, createdInPeriod };
}
