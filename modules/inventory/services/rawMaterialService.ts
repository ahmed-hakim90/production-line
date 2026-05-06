import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  runTransaction,
  type Transaction,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import type { RawMaterial } from '../types';
import { getMergedPlanSettings } from '../../shared/services/entityCodePlanSettings';
import {
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_COUNTER_KEYS,
  allocateNextCodeInTransaction,
  normalizeEntityCodePrefix,
  peekNextCode as peekNextEntityCode,
  seedMaxRawMaterialCodes,
  txGetTenantDocs,
  maxSeqFromCodes,
  clampPadding,
} from '../../shared/services/entityCodeSequenceService';

const COLLECTION = 'raw_materials';
const PRODUCT_MATERIALS_COLLECTION = 'product_materials';
const RM_CODE_REGEX = /^RM-(\d+)$/i;

const normalizeRawMaterialName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

const formatRawMaterialCode = (seq: number) => `RM-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;

async function mergedPlanForCodes() {
  const plan = await getMergedPlanSettings();
  const prefix = normalizeEntityCodePrefix(plan.rawMaterialCodePrefix ?? 'RM', 'RM');
  const padding = clampPadding(Number(plan.rawMaterialCodePadding ?? 4), 4);
  return { prefix, padding };
}

async function seedMaxRawMaterialCodesInTx(tx: Transaction, prefix: string): Promise<number> {
  const snap = await txGetTenantDocs(tx, db, COLLECTION);
  const codes = snap.docs.map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCodes(codes, prefix);
}

export const rawMaterialService = {
  async getAll(): Promise<RawMaterial[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(collection(db, COLLECTION), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as RawMaterial))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  },

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    if (!isConfigured) return false;
    const want = String(code || '').trim().toUpperCase();
    if (!want) return false;
    const tenantId = getCurrentTenantId();
    const snap = await getDocs(query(collection(db, COLLECTION), where('tenantId', '==', tenantId)));
    return snap.docs.some((d) => {
      if (excludeId && d.id === excludeId) return false;
      return (
        String(d.data()?.code ?? '')
          .trim()
          .toUpperCase() === want
      );
    });
  },

  async peekNextCode(): Promise<string> {
    const { prefix, padding } = await mergedPlanForCodes();
    return peekNextEntityCode(ENTITY_CODE_COUNTER_KEYS.rawMaterial, prefix, padding, () =>
      seedMaxRawMaterialCodes(prefix),
    );
  },

  async create(payload: Omit<RawMaterial, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const { prefix, padding } = await mergedPlanForCodes();
    const trimmed = String(payload.code ?? '').trim();

    if (trimmed) {
      const upper = trimmed.toUpperCase();
      if (await rawMaterialService.isCodeTaken(upper)) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      const tenantId = getCurrentTenantId();
      const ref = await addDoc(collection(db, COLLECTION), {
        ...payload,
        code: upper,
        tenantId,
        createdAt: new Date().toISOString(),
      });
      return ref.id;
    }

    const tenantId = getCurrentTenantId();
    const id = await runTransaction(db, async (transaction) => {
      const code = await allocateNextCodeInTransaction(
        transaction,
        ENTITY_CODE_COUNTER_KEYS.rawMaterial,
        prefix,
        padding,
        (tx) => seedMaxRawMaterialCodesInTx(tx, prefix),
      );
      const newRef = doc(collection(db, COLLECTION));
      transaction.set(newRef, {
        ...payload,
        code,
        tenantId,
        createdAt: new Date().toISOString(),
      });
      return newRef.id;
    });
    return id;
  },

  async update(id: string, payload: Partial<RawMaterial>): Promise<void> {
    if (!isConfigured || !id) return;
    if (payload.code !== undefined) {
      const upper = String(payload.code ?? '').trim().toUpperCase();
      if (upper && (await rawMaterialService.isCodeTaken(upper, id))) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      if (upper) (payload as Partial<RawMaterial>).code = upper as any;
    }
    const { id: _id, ...data } = payload as RawMaterial;
    await updateDoc(doc(db, COLLECTION, id), data as any);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async syncFromProductMaterials(): Promise<{ created: number; linked: number; skipped: number }> {
    if (!isConfigured) return { created: 0, linked: 0, skipped: 0 };
    const tenantId = getCurrentTenantId();

    const [rawSnap, productMaterialsSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTION), where('tenantId', '==', tenantId))),
      getDocs(query(collection(db, PRODUCT_MATERIALS_COLLECTION), where('tenantId', '==', tenantId))),
    ]);

    const rawMaterials = rawSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMaterial));
    const rawById = new Map<string, RawMaterial>();
    const rawByName = new Map<string, RawMaterial>();
    const usedCodes = new Set<string>();

    let maxCodeSeq = 0;
    for (const raw of rawMaterials) {
      if (!raw.id) continue;
      rawById.set(raw.id, raw);
      rawByName.set(normalizeRawMaterialName(raw.name || ''), raw);
      const code = String(raw.code || '').trim().toUpperCase();
      if (code) usedCodes.add(code);
      const match = code.match(RM_CODE_REGEX);
      if (match) maxCodeSeq = Math.max(maxCodeSeq, Number(match[1] || 0));
    }

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const materialDoc of productMaterialsSnap.docs) {
      const data = materialDoc.data() as any;
      const materialName = String(data.materialName || '').trim();
      if (!materialName) {
        skipped += 1;
        continue;
      }

      const normalizedName = normalizeRawMaterialName(materialName);
      const existingById = data.materialId ? rawById.get(String(data.materialId)) : undefined;
      let targetRaw = existingById ?? rawByName.get(normalizedName);

      if (!targetRaw) {
        let nextCode = '';
        do {
          maxCodeSeq += 1;
          nextCode = formatRawMaterialCode(maxCodeSeq);
        } while (usedCodes.has(nextCode));
        usedCodes.add(nextCode);

        const createdRef = await addDoc(collection(db, COLLECTION), {
          name: materialName,
          code: nextCode,
          unit: 'unit',
          minStock: 0,
          isActive: true,
          tenantId,
          createdAt: new Date().toISOString(),
        });

        targetRaw = {
          id: createdRef.id,
          name: materialName,
          code: nextCode,
          unit: 'unit',
          minStock: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        rawById.set(targetRaw.id!, targetRaw);
        rawByName.set(normalizedName, targetRaw);
        created += 1;
      }

      const needsLink =
        String(data.materialId || '') !== String(targetRaw.id || '') ||
        String(data.materialName || '').trim() !== String(targetRaw.name || '').trim();

      if (needsLink && targetRaw.id) {
        await updateDoc(doc(db, PRODUCT_MATERIALS_COLLECTION, materialDoc.id), {
          materialId: targetRaw.id,
          materialName: targetRaw.name,
        });
        linked += 1;
      }
    }

    return { created, linked, skipped };
  },
};
