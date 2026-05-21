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
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { MATERIALS_COLLECTION } from '../collections';
import type { Material, MaterialUnit } from '../types';
import { materialCategoryService } from './materialCategoryService';
import { formatCategoryBreadcrumb } from '../../catalog/lib/categoryTree';
import { normalizeLegacyUnit } from '../types';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export function toBaseQty(
  purchaseQty: number,
  conversionRate?: number,
): number {
  const rate = Number(conversionRate ?? 0);
  if (rate > 0) return purchaseQty * rate;
  return purchaseQty;
}

export const materialService = {
  async getAll(): Promise<Material[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, MATERIALS_COLLECTION));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Material))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  },

  async getById(id: string): Promise<Material | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, MATERIALS_COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Material;
  },

  async getByLegacyRawMaterialId(legacyId: string): Promise<Material | null> {
    if (!isConfigured || !legacyId) return null;
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, MATERIALS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('legacyRawMaterialId', '==', legacyId),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Material;
  },

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const want = String(code || '').trim().toUpperCase();
    if (!want) return false;
    const rows = await materialService.getAll();
    return rows.some((r) => {
      if (excludeId && r.id === excludeId) return false;
      return String(r.code || '').trim().toUpperCase() === want;
    });
  },

  async resolveCategoryFields(
    categoryId?: string | null,
  ): Promise<Pick<Material, 'categoryId' | 'categoryName'>> {
    const id = categoryId?.trim() || null;
    if (!id) return { categoryId: null, categoryName: '' };
    const cat = await materialCategoryService.getById(id);
    const flat = await materialCategoryService.getAll();
    const name = cat
      ? formatCategoryBreadcrumb(flat, id) || String(cat.name || '').trim()
      : '';
    return { categoryId: id, categoryName: name };
  },

  async create(payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const categoryFields = await materialService.resolveCategoryFields(payload.categoryId);
    const code = String(payload.code || '').trim().toUpperCase();
    if (code && (await materialService.isCodeTaken(code))) {
      throw new Error('DUPLICATE_ENTITY_CODE');
    }
    const ref = await addDoc(
      collection(db, MATERIALS_COLLECTION),
      stripUndefined({
        ...payload,
        ...categoryFields,
        code: code || payload.code,
        baseUnit: payload.baseUnit || normalizeLegacyUnit(payload.baseUnit as string),
        conversionRate: Number(payload.conversionRate ?? 1) || 1,
        purchaseCost: Number(payload.purchaseCost ?? 0),
        wastePercent: Number(payload.wastePercent ?? 0),
        isActive: payload.isActive !== false,
        linkedCostCenterIds: payload.linkedCostCenterIds ?? [],
        tenantId,
        createdAt: new Date().toISOString(),
      }),
    );
    return ref.id;
  },

  async update(id: string, payload: Partial<Material>): Promise<void> {
    if (!isConfigured || !id) return;
    let extra: Partial<Material> = {};
    if (payload.categoryId !== undefined) {
      extra = await materialService.resolveCategoryFields(payload.categoryId);
    }
    if (payload.code !== undefined) {
      const upper = String(payload.code || '').trim().toUpperCase();
      if (upper && (await materialService.isCodeTaken(upper, id))) {
        throw new Error('DUPLICATE_ENTITY_CODE');
      }
      payload.code = upper as Material['code'];
    }
    const { id: _id, tenantId: _t, createdAt: _c, ...rest } = { ...payload, ...extra };
    await updateDoc(doc(db, MATERIALS_COLLECTION, id), stripUndefined(rest as Record<string, unknown>));
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, MATERIALS_COLLECTION, id));
  },

  toBaseUnitLabel(unit: MaterialUnit): string {
    const labels: Record<MaterialUnit, string> = {
      piece: 'قطعة',
      kg: 'كجم',
      gram: 'جرام',
      meter: 'متر',
      liter: 'لتر',
    };
    return labels[unit] ?? unit;
  },
};
