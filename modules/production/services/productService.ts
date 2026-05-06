import {
  collection,
  doc,
  getDocs,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  type Transaction,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { FirestoreProduct } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { getMergedPlanSettings } from '../../shared/services/entityCodePlanSettings';
import {
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_COUNTER_KEYS,
  allocateNextCodeInTransaction,
  normalizeEntityCodePrefix,
  peekNextCode as peekNextEntityCode,
  seedMaxProductCodes,
  txGetTenantDocs,
  maxSeqFromCodes,
  clampPadding,
} from '../../shared/services/entityCodeSequenceService';

const COLLECTION = 'products';

export { DUPLICATE_ENTITY_CODE };

async function mergedPlanForCodes() {
  const plan = await getMergedPlanSettings();
  const prefix = normalizeEntityCodePrefix(plan.productCodePrefix ?? 'PRD', 'PRD');
  const padding = clampPadding(Number(plan.productCodePadding ?? 5), 5);
  return { prefix, padding };
}

async function seedMaxProductCodesInTx(tx: Transaction, prefix: string): Promise<number> {
  const snap = await txGetTenantDocs(tx, db, COLLECTION);
  const codes = snap.docs.map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCodes(codes, prefix);
}

export const productService = {
  async getAll(): Promise<FirestoreProduct[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreProduct));
    } catch (error) {
      console.error('productService.getAll error:', error);
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

      if (trimmed) {
        const upper = trimmed.toUpperCase();
        if (await productService.isCodeTaken(upper)) {
          const err = new Error(DUPLICATE_ENTITY_CODE);
          (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
          throw err;
        }
        const ref = await addDoc(collection(db, COLLECTION), {
          ...(data as Record<string, unknown>),
          code: upper,
          tenantId: getCurrentTenantId(),
        });
        return ref.id;
      }

      const id = await runTransaction(db, async (transaction) => {
        const code = await allocateNextCodeInTransaction(
          transaction,
          ENTITY_CODE_COUNTER_KEYS.product,
          prefix,
          padding,
          (tx) => seedMaxProductCodesInTx(tx, prefix),
        );
        const newRef = doc(collection(db, COLLECTION));
        transaction.set(newRef, {
          ...(data as Record<string, unknown>),
          code,
          tenantId: getCurrentTenantId(),
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
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('productService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('productService.delete error:', error);
      throw error;
    }
  },
};
