import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { productService } from '../../production/services/productService';
import { getCurrentTenantId } from '../../../lib/currentTenant';

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

  async create(payload: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      type: payload.type === 'raw_material' ? 'raw_material' : 'product',
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async update(id: string, payload: Partial<ProductCategory>): Promise<void> {
    if (!isConfigured || !id) return;
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
      const id = await this.create({ name, type: 'product', isActive: true });
      if (id) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
    return { created, skipped };
  },
};
