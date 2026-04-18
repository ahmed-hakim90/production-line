import { FieldValue, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  bostaDeliveryStateLabel,
  bostaGetDeliveryByTracking,
  type BostaDeliveryLike,
} from './bostaHttp.js';

const BOSTA_PREFIX = 'BOSTA_';

export function trackingDigitsFromBarcode(barcode: string): string | null {
  const t = String(barcode || '').trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  const at = upper.indexOf(BOSTA_PREFIX);
  if (at !== -1) {
    const after = t.slice(at + BOSTA_PREFIX.length);
    const m = after.match(/^\d+/);
    if (m && m[0].length >= 6 && m[0].length <= 15) return m[0];
  }
  const end = t.match(/(\d{6,})$/);
  if (end && end[1].length <= 15) return end[1];
  const allDigits = t.replace(/\D/g, '');
  if (allDigits.length >= 6 && allDigits.length <= 15) return allDigits;
  return null;
}

export async function applyBostaDeliveryToShipmentDoc(
  db: Firestore,
  collectionName: string,
  docId: string,
  barcode: string,
  apiKey: string,
): Promise<{ ok: boolean; label: string | null }> {
  const tracking = trackingDigitsFromBarcode(barcode);
  const ref = db.collection(collectionName).doc(docId);
  if (!tracking) {
    await ref.set(
      {
        bostaSyncedAt: FieldValue.serverTimestamp(),
        bostaLastError: 'باركود بدون رقم تتبع صالح لبوسطة',
      },
      { merge: true },
    );
    return { ok: false, label: null };
  }

  let delivery: BostaDeliveryLike | null;
  try {
    delivery = await bostaGetDeliveryByTracking(apiKey, tracking);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ref.set(
      {
        bostaSyncedAt: FieldValue.serverTimestamp(),
        bostaLastError: msg.slice(0, 500),
      },
      { merge: true },
    );
    return { ok: false, label: null };
  }

  if (!delivery) {
    await ref.set(
      {
        bostaState: null,
        bostaStateLabel: null,
        bostaSyncedAt: FieldValue.serverTimestamp(),
        bostaLastError: 'لا توجد شحنة بهذا الرقم في بوسطة',
      },
      { merge: true },
    );
    return { ok: true, label: null };
  }

  const label = bostaDeliveryStateLabel(delivery);
  const rawState =
    delivery && typeof (delivery as { state?: unknown }).state === 'string'
      ? String((delivery as { state: string }).state)
      : label;
  await ref.set(
    {
      bostaState: rawState ?? null,
      bostaStateLabel: label,
      bostaSyncedAt: FieldValue.serverTimestamp(),
      bostaLastError: FieldValue.delete(),
    },
    { merge: true },
  );
  return { ok: true, label };
}

const TENANTS_COLLECTION = 'tenants';
/** Pagination cursor: last processed `online_dispatch_shipments` doc id (order: createdAt desc). */
const TENANT_BOSTA_CURSOR_FIELD = 'onlineDispatchBostaSyncCursor';

/**
 * Walk shipment docs for a tenant and sync up to maxDocs (Bosta API calls).
 * - `advancePaginationCursor: false` (يدوي): أحدث الشحنات فقط — لا يمس مؤشر الجدولة.
 * - `advancePaginationCursor: true` (مجدول): يكمل من آخر صفحة حتى تُغطّى كل الشحنات مع الوقت.
 */
export async function syncTenantOnlineDispatchBostaFields(params: {
  db: Firestore;
  tenantId: string;
  collectionName: string;
  apiKey: string;
  maxDocs: number;
  /** عند true: يقرأ/يكتب المؤشر على tenants/{tenantId} ويتقدم في الدفعات. */
  advancePaginationCursor?: boolean;
}): Promise<{ processed: number; last?: QueryDocumentSnapshot }> {
  const { db, tenantId, collectionName, apiKey, maxDocs } = params;
  const advance = params.advancePaginationCursor === true;
  const tenantRef = db.collection(TENANTS_COLLECTION).doc(tenantId);
  const pageSize = Math.min(50, maxDocs);

  let startAfterSnap: QueryDocumentSnapshot | undefined;
  let hadCursor = false;

  if (advance) {
    const tSnap = await tenantRef.get();
    const cursorId = String(
      (tSnap.data() as { onlineDispatchBostaSyncCursor?: string } | undefined)?.onlineDispatchBostaSyncCursor ||
        '',
    ).trim();
    if (cursorId) {
      hadCursor = true;
      const cdoc = await db.collection(collectionName).doc(cursorId).get();
      if (cdoc.exists) {
        const data = cdoc.data() as { tenantId?: string };
        if (String(data?.tenantId || '') === tenantId) {
          startAfterSnap = cdoc as QueryDocumentSnapshot;
        } else {
          await tenantRef.set({ [TENANT_BOSTA_CURSOR_FIELD]: FieldValue.delete() }, { merge: true });
        }
      } else {
        await tenantRef.set({ [TENANT_BOSTA_CURSOR_FIELD]: FieldValue.delete() }, { merge: true });
      }
    }
  }

  const runQuery = (after?: QueryDocumentSnapshot) => {
    let q = db
      .collection(collectionName)
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize);
    if (after) q = q.startAfter(after);
    return q.get();
  };

  let snap = await runQuery(startAfterSnap);
  if (snap.empty && advance && hadCursor && startAfterSnap) {
    await tenantRef.set({ [TENANT_BOSTA_CURSOR_FIELD]: FieldValue.delete() }, { merge: true });
    snap = await runQuery(undefined);
  }
  if (snap.empty) return { processed: 0 };

  let processed = 0;
  for (const doc of snap.docs) {
    if (processed >= maxDocs) break;
    const data = doc.data() as { barcode?: string };
    const barcode = String(data?.barcode || '');
    await applyBostaDeliveryToShipmentDoc(db, collectionName, doc.id, barcode, apiKey);
    processed += 1;
  }

  if (advance && processed > 0) {
    const lastId = snap.docs[snap.docs.length - 1]?.id;
    if (lastId) {
      await tenantRef.set({ [TENANT_BOSTA_CURSOR_FIELD]: lastId }, { merge: true });
    }
  }

  const last = snap.docs[snap.docs.length - 1];
  return { processed, last };
}

/**
 * مزامنة حالة بوسطة لقائمة معرفات مستندات محددة (نفس شركة المستخدم).
 * يُستخدم عندما تختار الواجهة الشحنات ضمن نطاق التاريخ (`shipmentTouchesDateRange`).
 */
export async function syncTenantOnlineDispatchByDocIds(params: {
  db: Firestore;
  tenantId: string;
  collectionName: string;
  apiKey: string;
  docIds: string[];
}): Promise<{ processed: number; skipped: number }> {
  const { db, tenantId, collectionName, apiKey, docIds } = params;
  let processed = 0;
  let skipped = 0;
  for (const id of docIds) {
    const ref = db.collection(collectionName).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      skipped += 1;
      continue;
    }
    const data = snap.data() as { tenantId?: string; barcode?: string };
    if (String(data?.tenantId || '').trim() !== tenantId) {
      skipped += 1;
      continue;
    }
    await applyBostaDeliveryToShipmentDoc(db, collectionName, id, String(data?.barcode || ''), apiKey);
    processed += 1;
  }
  return { processed, skipped };
}
