import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { productMaterialService } from '../../production/services/productMaterialService';
import { BOMS_COLLECTION, BOM_ITEMS_COLLECTION } from '../collections';
import type { Bom, BomItem, BomOwnerType, BomStatus } from '../types';
import type { ProductMaterial } from '../../../types';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

let legacyFallbackLogged = false;

function logLegacyFallbackOnce() {
  if (!legacyFallbackLogged) {
    legacyFallbackLogged = true;
    console.info('[manufacturing] Using legacy product_materials BOM fallback');
  }
}

function legacyProductMaterialsToVirtualBom(
  productId: string,
  rows: ProductMaterial[],
): { bom: Bom; items: BomItem[] } {
  const tenantId = getCurrentTenantId();
  const bom: Bom = {
    id: `legacy-${productId}`,
    tenantId,
    ownerType: 'product',
    ownerId: productId,
    version: 0,
    status: 'active',
  };
  const items: BomItem[] = rows.map((row, index) => ({
    id: row.id,
    tenantId,
    bomId: bom.id!,
    itemId: row.materialId || row.id || `legacy-name-${index}`,
    itemType: 'material',
    itemName: row.materialName,
    qtyPerUnit: Number(row.quantityUsed || 0),
    unit: 'piece',
    wastePercent: 0,
    directCostPerUnit: 0,
    indirectCostPerUnit: 0,
    sortOrder: index,
  }));
  return { bom, items };
}

export const bomService = {
  async getActiveBom(ownerType: BomOwnerType, ownerId: string): Promise<Bom | null> {
    if (!isConfigured || !ownerId) return null;
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, BOMS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('ownerType', '==', ownerType),
      where('ownerId', '==', ownerId),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const sorted = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Bom))
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
    return sorted[0] ?? null;
  },

  async getActiveBomWithLegacyFallback(
    ownerType: BomOwnerType,
    ownerId: string,
    options?: { allowLegacy?: boolean },
  ): Promise<{ bom: Bom | null; items: BomItem[]; isLegacy: boolean }> {
    const bom = await bomService.getActiveBom(ownerType, ownerId);
    if (bom?.id) {
      const items = await bomService.getItemsByBomId(bom.id);
      return { bom, items, isLegacy: false };
    }
    if (options?.allowLegacy !== false && ownerType === 'product') {
      const legacy = await productMaterialService.getByProduct(ownerId);
      if (legacy.length > 0) {
        logLegacyFallbackOnce();
        const virtual = legacyProductMaterialsToVirtualBom(ownerId, legacy);
        return { bom: virtual.bom, items: virtual.items, isLegacy: true };
      }
    }
    return { bom: null, items: [], isLegacy: false };
  },

  async getItemsByBomId(bomId: string): Promise<BomItem[]> {
    if (!isConfigured || !bomId) return [];
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, BOM_ITEMS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('bomId', '==', bomId),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as BomItem))
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  },

  async listByOwner(ownerType: BomOwnerType, ownerId: string): Promise<Bom[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, BOMS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('ownerType', '==', ownerType),
      where('ownerId', '==', ownerId),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Bom))
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
  },

  async createDraft(ownerType: BomOwnerType, ownerId: string): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const existing = await bomService.listByOwner(ownerType, ownerId);
    const maxVersion = existing.reduce((m, b) => Math.max(m, Number(b.version || 0)), 0);
    const ref = await addDoc(
      collection(db, BOMS_COLLECTION),
      stripUndefined({
        tenantId,
        ownerType,
        ownerId,
        version: maxVersion + 1,
        status: 'draft' as BomStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    return ref.id;
  },

  async activate(bomId: string): Promise<void> {
    if (!isConfigured || !bomId) return;
    const tenantId = getCurrentTenantId();
    const bomSnap = await getDocs(
      query(collection(db, BOMS_COLLECTION), where('tenantId', '==', tenantId)),
    );
    const target = bomSnap.docs.find((d) => d.id === bomId);
    if (!target) return;
    const data = target.data() as Bom;
    const batch = writeBatch(db);
    for (const d of bomSnap.docs) {
      const row = d.data() as Bom;
      if (
        row.ownerType === data.ownerType &&
        row.ownerId === data.ownerId &&
        row.status === 'active' &&
        d.id !== bomId
      ) {
        batch.update(d.ref, { status: 'draft', updatedAt: new Date().toISOString() });
      }
    }
    batch.update(doc(db, BOMS_COLLECTION, bomId), {
      status: 'active',
      updatedAt: new Date().toISOString(),
    });
    await batch.commit();
  },

  async ensureActiveBom(ownerType: BomOwnerType, ownerId: string): Promise<string> {
    const active = await bomService.getActiveBom(ownerType, ownerId);
    if (active?.id) return active.id;
    const draftId = await bomService.createDraft(ownerType, ownerId);
    if (!draftId) throw new Error('Failed to create BOM');
    await bomService.activate(draftId);
    return draftId;
  },

  async addItem(bomId: string, item: Omit<BomItem, 'id' | 'tenantId' | 'bomId'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const ref = await addDoc(
      collection(db, BOM_ITEMS_COLLECTION),
      stripUndefined({
        ...item,
        bomId,
        tenantId,
      }),
    );
    return ref.id;
  },

  async updateItem(itemId: string, data: Partial<BomItem>): Promise<void> {
    if (!isConfigured || !itemId) return;
    const { id: _id, tenantId: _t, bomId: _b, ...rest } = data;
    await updateDoc(doc(db, BOM_ITEMS_COLLECTION, itemId), stripUndefined(rest as Record<string, unknown>));
  },

  async deleteItem(itemId: string): Promise<void> {
    if (!isConfigured || !itemId) return;
    await deleteDoc(doc(db, BOM_ITEMS_COLLECTION, itemId));
  },
};
