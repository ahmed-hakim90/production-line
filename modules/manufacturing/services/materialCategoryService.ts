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
import {
  buildCategoryPath,
  buildCategoryTree,
  getDescendantIds,
  wouldCreateCycle,
  type CategoryTreeNode,
} from '../../catalog/lib/categoryTree';
import { MATERIAL_CATEGORIES_COLLECTION } from '../collections';

export interface MaterialCategory {
  id?: string;
  name: string;
  parentId?: string | null;
  path?: string[];
  level?: number;
  sortOrder?: number;
  isActive: boolean;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

function withDefaults(row: Partial<MaterialCategory>): MaterialCategory {
  return {
    ...row,
    parentId: row.parentId ?? null,
    path: row.path ?? [],
    level: row.level ?? 0,
    isActive: row.isActive !== false,
    name: String(row.name || ''),
  } as MaterialCategory;
}

function computeHierarchy(
  flat: MaterialCategory[],
  parentId: string | null | undefined,
): Pick<MaterialCategory, 'parentId' | 'path' | 'level'> {
  const normalizedParent = parentId ?? null;
  if (!normalizedParent) return { parentId: null, path: [], level: 0 };
  const { path: parentAncestors } = buildCategoryPath(flat, normalizedParent);
  const path = [...parentAncestors, normalizedParent];
  return { parentId: normalizedParent, path, level: path.length };
}

export const materialCategoryService = {
  async getAll(): Promise<MaterialCategory[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(collection(db, MATERIAL_CATEGORIES_COLLECTION), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => withDefaults({ id: d.id, ...d.data() } as MaterialCategory))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  },

  async getById(id: string): Promise<MaterialCategory | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, MATERIAL_CATEGORIES_COLLECTION, id));
    if (!snap.exists()) return null;
    return withDefaults({ id: snap.id, ...snap.data() } as MaterialCategory);
  },

  async getCategoryTree(activeOnly = true): Promise<CategoryTreeNode<MaterialCategory>[]> {
    let rows = await materialCategoryService.getAll();
    if (activeOnly) rows = rows.filter((r) => r.isActive);
    return buildCategoryTree(rows);
  },

  async getBulkCategoryUsageCounts(
    categories?: MaterialCategory[],
  ): Promise<Record<string, { materialCount: number; childrenCount: number }>> {
    const { materialService } = await import('./materialService');
    const [materials, rows] = await Promise.all([
      materialService.getAll(),
      categories ? Promise.resolve(categories) : materialCategoryService.getAll(),
    ]);
    const usage: Record<string, { materialCount: number; childrenCount: number }> = {};
    for (const cat of rows) {
      if (!cat.id) continue;
      usage[cat.id] = {
        materialCount: materials.filter((m) => m.categoryId === cat.id).length,
        childrenCount: rows.filter((c) => c.parentId === cat.id).length,
      };
    }
    return usage;
  },

  async getCategoryUsageCounts(categoryId: string): Promise<{ materialCount: number; childrenCount: number }> {
    const bulk = await materialCategoryService.getBulkCategoryUsageCounts();
    return bulk[categoryId] ?? { materialCount: 0, childrenCount: 0 };
  },

  async createCategory(
    payload: Omit<MaterialCategory, 'id' | 'createdAt' | 'updatedAt' | 'path' | 'level'>,
  ): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const flat = await materialCategoryService.getAll();
    const hierarchy = computeHierarchy(flat, payload.parentId ?? null);
    const ref = await addDoc(collection(db, MATERIAL_CATEGORIES_COLLECTION), {
      ...payload,
      ...hierarchy,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async updateCategory(id: string, payload: Partial<MaterialCategory>): Promise<void> {
    if (!isConfigured || !id) return;
    if (payload.parentId !== undefined) {
      const flat = await materialCategoryService.getAll();
      if (wouldCreateCycle(flat, id, payload.parentId)) {
        throw new Error('CATEGORY_PARENT_CYCLE');
      }
      const hierarchy = computeHierarchy(
        flat.filter((c) => c.id !== id),
        payload.parentId,
      );
      payload.path = hierarchy.path;
      payload.level = hierarchy.level;
      payload.parentId = hierarchy.parentId;
    }
    await updateDoc(doc(db, MATERIAL_CATEGORIES_COLLECTION, id), {
      ...payload,
      updatedAt: new Date().toISOString(),
    });
  },

  async deactivateCategory(id: string): Promise<void> {
    await materialCategoryService.updateCategory(id, { isActive: false });
  },

  async deleteCategory(id: string): Promise<void> {
    const usage = await materialCategoryService.getCategoryUsageCounts(id);
    if (usage.childrenCount > 0) throw new Error('CATEGORY_HAS_CHILDREN');
    if (usage.materialCount > 0) throw new Error('CATEGORY_HAS_MATERIALS');
    await deleteDoc(doc(db, MATERIAL_CATEGORIES_COLLECTION, id));
  },

  async moveCategory(id: string, parentId: string | null): Promise<void> {
    await materialCategoryService.updateCategory(id, { parentId });
  },
};
