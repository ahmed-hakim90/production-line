import {
  collection,
  doc,
  getDocs,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  where,
  limit,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { FirestoreProduct } from '../../../types';
import { getCurrentTenantId, getCurrentTenantIdOrNull } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { getMergedPlanSettings } from '../../shared/services/entityCodePlanSettings';
import {
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_COUNTER_KEYS,
  allocateNextCodeInTransaction,
  normalizeEntityCodePrefix,
  peekNextCode as peekNextEntityCode,
  seedMaxProductCodes,
  clampPadding,
} from '../../shared/services/entityCodeSequenceService';

const COLLECTION = 'products';
const BARCODE_CLAIMS_COLLECTION = 'product_barcode_claims';

export { DUPLICATE_ENTITY_CODE };

async function mergedPlanForCodes() {
  const plan = await getMergedPlanSettings();
  const prefix = normalizeEntityCodePrefix(plan.productCodePrefix ?? 'PRD', 'PRD');
  const padding = clampPadding(Number(plan.productCodePadding ?? 5), 5);
  return { prefix, padding };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

const normalizeBarcode = (value: unknown): string => String(value || '').trim().toUpperCase();
const barcodeClaimId = (tenantId: string, barcode: string) => `${tenantId}__${encodeURIComponent(barcode)}`;

export const productService = {
  async getAll(): Promise<FirestoreProduct[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreProduct));
    } catch (error) {
      const tenantId = getCurrentTenantIdOrNull();
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      console.error('[products] getDocs(tenantQuery products) failed', {
        tenantId: tenantId ?? '(tenant context unset)',
        code,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error('productService.getAll error:', error);
      if (code === 'permission-denied') {
        console.error(
          '[products] Diagnosis: Firestore denied list/read on `products`. Verify deployed rules for `products`, `pl_isActiveUser`, and `tenantId` on documents vs current tenant.',
        );
      }
      if (tenantId == null || tenantId === '') {
        console.error(
          '[products] Diagnosis: `getCurrentTenantId()` was not set before getAll(); products query uses tenantId filter — fix login/bootstrap order if this appears after sign-in.',
        );
      }
      throw error;
    }
  },

  async getById(id: string): Promise<FirestoreProduct | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as FirestoreProduct;
    } catch (error) {
      console.error('productService.getById error:', error);
      throw error;
    }
  },

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    if (!isConfigured) return false;
    const want = String(code || '').trim().toUpperCase();
    if (!want) return false;
    const snap = await getDocs(tenantQuery(db, COLLECTION));
    return snap.docs.some((d) => {
      if (excludeId && d.id === excludeId) return false;
      return (
        String(d.data()?.code ?? '')
          .trim()
          .toUpperCase() === want
      );
    });
  },

  async isBarcodeTaken(barcode: string, excludeId?: string): Promise<boolean> {
    if (!isConfigured) return false;
    const normalized = normalizeBarcode(barcode);
    if (!normalized) return false;
    const tenantId = getCurrentTenantId();
    const snap = await getDoc(doc(db, BARCODE_CLAIMS_COLLECTION, barcodeClaimId(tenantId, normalized)));
    if (!snap.exists()) return false;
    return !excludeId || String(snap.data()?.productId || '') !== excludeId;
  },

  /** Next code preview (not reserved). Uses current plan settings. */
  async peekNextCode(): Promise<string> {
    const { prefix, padding } = await mergedPlanForCodes();
    return peekNextEntityCode(ENTITY_CODE_COUNTER_KEYS.product, prefix, padding, () =>
      seedMaxProductCodes(prefix),
    );
  },

  async create(data: Omit<FirestoreProduct, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const { prefix, padding } = await mergedPlanForCodes();
      const trimmed = String(data.code ?? '').trim();
      const tenantId = getCurrentTenantId();
      const barcodeNormalized = normalizeBarcode(data.barcode);
      if (!barcodeNormalized) throw new Error('باركود عبوة المنتج مطلوب.');
      const basePayload = stripUndefined({
        ...(data as Record<string, unknown>),
        ...(barcodeNormalized ? { barcode: String(data.barcode || '').trim(), barcodeNormalized } : {}),
        tenantId,
      });
      if (barcodeNormalized && await productService.isBarcodeTaken(barcodeNormalized)) {
        throw new Error('باركود المنتج مستخدم مسبقًا.');
      }

      if (trimmed) {
        const upper = trimmed.toUpperCase();
        if (await productService.isCodeTaken(upper)) {
          const err = new Error(DUPLICATE_ENTITY_CODE);
          (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
          throw err;
        }
        const ref = doc(collection(db, COLLECTION));
        await runTransaction(db, async (transaction) => {
          if (barcodeNormalized) {
            const claimRef = doc(db, BARCODE_CLAIMS_COLLECTION, barcodeClaimId(tenantId, barcodeNormalized));
            const claim = await transaction.get(claimRef);
            if (claim.exists()) throw new Error('باركود المنتج مستخدم مسبقًا.');
            transaction.set(claimRef, { tenantId, barcode: barcodeNormalized, productId: ref.id, createdAt: new Date().toISOString() });
          }
          transaction.set(ref, { ...basePayload, code: upper });
        });
        return ref.id;
      }

      // Firestore web transactions cannot query a collection. Seed before the
      // transaction; concurrent first writers still serialize through the counter doc.
      const initialMaxSequence = await seedMaxProductCodes(prefix);
      const id = await runTransaction(db, async (transaction) => {
        const code = await allocateNextCodeInTransaction(
          transaction,
          ENTITY_CODE_COUNTER_KEYS.product,
          prefix,
          padding,
          async () => initialMaxSequence,
        );
        const newRef = doc(collection(db, COLLECTION));
        if (barcodeNormalized) {
          const claimRef = doc(db, BARCODE_CLAIMS_COLLECTION, barcodeClaimId(tenantId, barcodeNormalized));
          const claim = await transaction.get(claimRef);
          if (claim.exists()) throw new Error('باركود المنتج مستخدم مسبقًا.');
          transaction.set(claimRef, { tenantId, barcode: barcodeNormalized, productId: newRef.id, createdAt: new Date().toISOString() });
        }
        transaction.set(newRef, {
          ...basePayload,
          code,
        });
        return newRef.id;
      });
      return id;
    } catch (error) {
      console.error('productService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<FirestoreProduct>): Promise<void> {
    if (!isConfigured) return;
    try {
      if (data.code !== undefined) {
        const upper = String(data.code ?? '').trim().toUpperCase();
        if (upper && (await productService.isCodeTaken(upper, id))) {
          const err = new Error(DUPLICATE_ENTITY_CODE);
          (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
          throw err;
        }
        if (upper) (data as Partial<FirestoreProduct>).code = upper as any;
      }
      const { id: _id, ...fields } = data as any;
      if (data.barcode !== undefined) {
        const tenantId = getCurrentTenantId();
        const normalized = normalizeBarcode(data.barcode);
        if (!normalized) throw new Error('لا يمكن إزالة باركود المنتج.');
        await runTransaction(db, async (transaction) => {
          const productRef = doc(db, COLLECTION, id);
          const productSnap = await transaction.get(productRef);
          if (!productSnap.exists()) throw new Error('المنتج غير موجود.');
          const oldNormalized = normalizeBarcode(productSnap.data().barcodeNormalized || productSnap.data().barcode);
          if (normalized && normalized !== oldNormalized) {
            const nextClaimRef = doc(db, BARCODE_CLAIMS_COLLECTION, barcodeClaimId(tenantId, normalized));
            const nextClaim = await transaction.get(nextClaimRef);
            if (nextClaim.exists() && String(nextClaim.data()?.productId || '') !== id) {
              throw new Error('باركود المنتج مستخدم مسبقًا.');
            }
            transaction.set(nextClaimRef, { tenantId, barcode: normalized, productId: id, updatedAt: new Date().toISOString() });
          }
          if (oldNormalized && oldNormalized !== normalized) {
            transaction.delete(doc(db, BARCODE_CLAIMS_COLLECTION, barcodeClaimId(tenantId, oldNormalized)));
          }
          transaction.update(productRef, stripUndefined({ ...fields, barcode: String(data.barcode || '').trim(), barcodeNormalized: normalized }));
        });
      } else {
        await updateDoc(doc(db, COLLECTION, id), stripUndefined(fields as Record<string, unknown>));
      }
    } catch (error) {
      console.error('productService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      const linkedReports = await getDocs(
        tenantQuery(db, 'production_reports', where('productId', '==', id), limit(1)),
      );
      if (!linkedReports.empty) {
        throw new Error('المنتج مرتبط بتقارير إنتاج ولا يمكن حذفه. احتفظ به أو ادمجه مع المنتج الصحيح.');
      }
      const productRef = doc(db, COLLECTION, id);
      const productSnap = await getDoc(productRef);
      const barcode = normalizeBarcode(productSnap.data()?.barcodeNormalized || productSnap.data()?.barcode);
      if (barcode) {
        await runTransaction(db, async (transaction) => {
          transaction.delete(productRef);
          transaction.delete(doc(db, BARCODE_CLAIMS_COLLECTION, barcodeClaimId(getCurrentTenantId(), barcode)));
        });
      } else {
        await deleteDoc(productRef);
      }
    } catch (error) {
      console.error('productService.delete error:', error);
      throw error;
    }
  },
};
