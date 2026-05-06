import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { productService } from '../../production/services/productService';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { getMergedPlanSettings } from '../../shared/services/entityCodePlanSettings';
import {
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_COUNTER_KEYS,
  allocateNextCodeInTransaction,
  normalizeEntityCodePrefix,
  peekNextCode as peekNextEntityCode,
  seedMaxCategoryCodes,
  seedMaxCategoryCodesInTransaction,
  clampPadding,
} from '../../shared/services/entityCodeSequenceService';

export type CategoryType = 'product' | 'raw_material';

export interface ProductCategory {
  id?: string;
  name: string;
  code?: string;
  type?: CategoryType;
  isActive: boolean;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

const COLLECTION = 'product_categories';

const normalizeCategoryName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export const getEffectiveCategoryType = (category?: Partial<ProductCategory>): CategoryType =>
  category?.type === 'raw_material' ? 'raw_material' : 'product';

export const categoryService = {
  async getAll(): Promise<ProductCategory[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(collection(db, COLLECTION), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ProductCategory))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  },

  async isCodeTaken(code: string, type: CategoryType, excludeId?: string): Promise<boolean> {
    if (!isConfigured) return false;
    const want = String(code || '').trim().toUpperCase();
    if (!want) return false;
    const rows = await categoryService.getAll();
    return rows.some((r) => {
      if (excludeId && r.id === excludeId) return false;
      if (getEffectiveCategoryType(r) !== type) return false;
      return String(r.code ?? '')
        .trim()
        .toUpperCase() === want;
    });
  },

  async peekNextCode(type: CategoryType): Promise<string> {
    const plan = await getMergedPlanSettings();
    const prefix = normalizeEntityCodePrefix(plan.categoryCodePrefix ?? 'CAT', 'CAT');
    const padding = clampPadding(Number(plan.categoryCodePadding ?? 4), 4);
    const entityKey =
      type === 'raw_material'
        ? ENTITY_CODE_COUNTER_KEYS.categoryRawMaterial
        : ENTITY_CODE_COUNTER_KEYS.categoryProduct;
    const seedType = type === 'raw_material' ? ('raw_material' as const) : ('product' as const);
    return peekNextEntityCode(entityKey, prefix, padding, () => seedMaxCategoryCodes(prefix, seedType));
  },

  async create(payload: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const effType = payload.type === 'raw_material' ? 'raw_material' : 'product';
    const entityKey =
      effType === 'raw_material'
        ? ENTITY_CODE_COUNTER_KEYS.categoryRawMaterial
        : ENTITY_CODE_COUNTER_KEYS.categoryProduct;
    const plan = await getMergedPlanSettings();
    const prefix = normalizeEntityCodePrefix(plan.categoryCodePrefix ?? 'CAT', 'CAT');
    const padding = clampPadding(Number(plan.categoryCodePadding ?? 4), 4);
    const trimmed = String(payload.code ?? '').trim();

    if (trimmed) {
      const upper = trimmed.toUpperCase();
      if (await categoryService.isCodeTaken(upper, effType)) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      const ref = await addDoc(collection(db, COLLECTION), {
        ...payload,
        code: upper,
        type: effType,
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return ref.id;
    }

    const seedType = effType === 'raw_material' ? ('raw_material' as const) : ('product' as const);
    const id = await runTransaction(db, async (transaction) => {
      const code = await allocateNextCodeInTransaction(
        transaction,
        entityKey,
        prefix,
        padding,
        (tx) => seedMaxCategoryCodesInTransaction(tx, prefix, seedType),
      );
      const newRef = doc(collection(db, COLLECTION));
      transaction.set(newRef, {
        ...payload,
        code,
        type: effType,
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return newRef.id;
    });
    return id;
  },

  async update(id: string, payload: Partial<ProductCategory>): Promise<void> {
    if (!isConfigured || !id) return;
    const snap = await getDoc(doc(db, COLLECTION, id));
    const row = snap.exists() ? ({ id: snap.id, ...snap.data() } as ProductCategory) : null;
    const effType =
      payload.type !== undefined
        ? getEffectiveCategoryType(payload)
        : getEffectiveCategoryType(row ?? { type: 'product' });

    if (payload.code !== undefined) {
      const upper = String(payload.code ?? '').trim().toUpperCase();
      if (upper && (await categoryService.isCodeTaken(upper, effType, id))) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      if (upper) (payload as Partial<ProductCategory>).code = upper;
    }

    const { id: _id, ...data } = payload as ProductCategory;
    await updateDoc(doc(db, COLLECTION, id), {
      ...data,
      updatedAt: new Date().toISOString(),
    } as any);
  },

  async getByType(type: CategoryType): Promise<ProductCategory[]> {
    const rows = await this.getAll();
    return rows.filter((row) => getEffectiveCategoryType(row) === type);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async seedFromProductsModel(): Promise<{ created: number; skipped: number }> {
    if (!isConfigured) return { created: 0, skipped: 0 };
    const [categories, products] = await Promise.all([
      this.getByType('product'),
      productService.getAll(),
    ]);
    const byNormalized = new Map<string, ProductCategory>();
    categories.forEach((category) => {
      const normalized = normalizeCategoryName(String(category.name || ''));
      if (normalized) byNormalized.set(normalized, category);
    });

    let created = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const product of products) {
      const name = String(product.model || '').trim();
      const normalized = normalizeCategoryName(name);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      if (byNormalized.has(normalized)) {
        skipped += 1;
        continue;
      }
      const catId = await this.create({ name, type: 'product', isActive: true });
      if (catId) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
    return { created, skipped };
  },
};
