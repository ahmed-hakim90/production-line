import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { productService } from '../../production/services/productService';

export interface ProductCategory {
  id?: string;
  name: string;
  code?: string;
  isActive: boolean;
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

export const categoryService = {
  async getAll(): Promise<ProductCategory[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductCategory));
  },

  async create(payload: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
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

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async seedFromProductsModel(): Promise<{ created: number; skipped: number }> {
    if (!isConfigured) return { created: 0, skipped: 0 };
    const [categories, products] = await Promise.all([
      this.getAll(),
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
      const id = await this.create({ name, isActive: true });
      if (id) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
    return { created, skipped };
  },
};
