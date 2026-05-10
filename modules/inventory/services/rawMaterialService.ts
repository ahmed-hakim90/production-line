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
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { RawMaterial } from '../types';
import { getMergedPlanSettings } from '../../shared/services/entityCodePlanSettings';
import {
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_COUNTER_KEYS,
  allocateNextCodeInTransaction,
  allocateNextSequentialSuffixInTransaction,
  normalizeEntityCodePrefix,
  peekNextCode as peekNextEntityCode,
  peekNextSequentialSuffixCode,
  seedMaxRawMaterialCodes,
  txGetTenantDocs,
  maxSeqFromCodes,
  maxSeqFromCategoryPrefixedCodes,
  clampPadding,
} from '../../shared/services/entityCodeSequenceService';

const COLLECTION = 'raw_materials';
const PRODUCT_MATERIALS_COLLECTION = 'product_materials';
const RM_CODE_REGEX = /^RM-(\d+)$/i;

export type RawMaterialCreateOptions = {
  /** When code is auto-generated (empty), scope sequence by category code + name. */
  autoFromCategory?: { categoryCode: string; categoryName: string };
};

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

function rawMaterialCategoryCounterEntityKey(categoryCode: string): string {
  return `raw_material_by_category:${String(categoryCode).trim().toUpperCase()}`;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

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

async function seedMaxCategoryRawMaterialCodesInTx(
  tx: Transaction,
  categoryCode: string,
  categoryName: string,
): Promise<number> {
  const snap = await txGetTenantDocs(tx, db, COLLECTION);
  const want = String(categoryName || '').trim();
  const cc = String(categoryCode || '').trim().toUpperCase();
  const codes = snap.docs
    .filter((d) => String(d.data()?.categoryName ?? '').trim() === want)
    .map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCategoryPrefixedCodes(codes, cc);
}

async function seedMaxCategoryRawMaterialCodesAsync(categoryCode: string, categoryName: string): Promise<number> {
  const snap = await getDocs(tenantQuery(db, COLLECTION));
  const want = String(categoryName || '').trim();
  const cc = String(categoryCode || '').trim().toUpperCase();
  const codes = snap.docs
    .filter((d) => String(d.data()?.categoryName ?? '').trim() === want)
    .map((d) => String(d.data()?.code ?? '').trim());
  return maxSeqFromCategoryPrefixedCodes(codes, cc);
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

  /**
   * Next display code for raw materials.
   * With `scope`, uses `{categoryCode}-{seq}` per category; otherwise legacy global `RM-` sequence.
   */
  async peekNextCode(scope?: { categoryCode: string; categoryName: string }): Promise<string> {
    const { prefix, padding } = await mergedPlanForCodes();
    if (!scope?.categoryCode?.trim() || !scope?.categoryName?.trim()) {
      return '';
    }
    const cc = scope.categoryCode.trim().toUpperCase();
    const entityKey = rawMaterialCategoryCounterEntityKey(cc);
    const catName = scope.categoryName.trim();
    return peekNextSequentialSuffixCode(entityKey, cc, padding, () =>
      seedMaxCategoryRawMaterialCodesAsync(cc, catName),
    );
  },

  async create(
    payload: Omit<RawMaterial, 'id' | 'createdAt'>,
    options?: RawMaterialCreateOptions,
  ): Promise<string | null> {
    if (!isConfigured) return null;
    const { prefix, padding } = await mergedPlanForCodes();
    const trimmed = String(payload.code ?? '').trim();
    const tenantId = getCurrentTenantId();

    const autoCat = options?.autoFromCategory;
    const useCategoryAuto =
      !trimmed &&
      autoCat &&
      String(autoCat.categoryCode || '').trim() &&
      String(autoCat.categoryName || '').trim();

    if (trimmed) {
      const upper = trimmed.toUpperCase();
      if (await rawMaterialService.isCodeTaken(upper)) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      const ref = await addDoc(
        collection(db, COLLECTION),
        stripUndefined({
          ...payload,
          code: upper,
          tenantId,
          createdAt: new Date().toISOString(),
        }) as Record<string, unknown>,
      );
      return ref.id;
    }

    if (useCategoryAuto) {
      const cc = autoCat.categoryCode.trim().toUpperCase();
      const catName = autoCat.categoryName.trim();
      const entityKey = rawMaterialCategoryCounterEntityKey(cc);
      const id = await runTransaction(db, async (transaction) => {
        const code = await allocateNextSequentialSuffixInTransaction(
          transaction,
          entityKey,
          cc,
          padding,
          (tx) => seedMaxCategoryRawMaterialCodesInTx(tx, cc, catName),
        );
        const newRef = doc(collection(db, COLLECTION));
        transaction.set(
          newRef,
          stripUndefined({
            ...payload,
            code,
            categoryName: payload.categoryName ?? catName,
            tenantId,
            createdAt: new Date().toISOString(),
          }) as Record<string, unknown>,
        );
        return newRef.id;
      });
      return id;
    }

    const id = await runTransaction(db, async (transaction) => {
      const code = await allocateNextCodeInTransaction(
        transaction,
        ENTITY_CODE_COUNTER_KEYS.rawMaterial,
        prefix,
        padding,
        (tx) => seedMaxRawMaterialCodesInTx(tx, prefix),
      );
      const newRef = doc(collection(db, COLLECTION));
      transaction.set(
        newRef,
        stripUndefined({
          ...payload,
          code,
          tenantId,
          createdAt: new Date().toISOString(),
        }) as Record<string, unknown>,
      );
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
    await updateDoc(doc(db, COLLECTION, id), stripUndefined(data as Record<string, unknown>) as any);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },

  /**
   * Legacy bulk sync: assigns sequential `RM-####` codes without category context.
   * UI-driven creates use category-scoped `{CAT-####}-{seq}` when a category is chosen.
   */
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
