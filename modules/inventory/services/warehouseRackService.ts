import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { WarehouseRack } from '../types';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = 'warehouse_racks';
const LOCATIONS_COLLECTION = 'warehouse_locations';
const LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const DEFAULT_LOCATIONS_COLLECTION = 'default_item_locations';

const toIsoNow = () => new Date().toISOString();
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '-');
const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

function buildLocationCode(warehouseCode: string | undefined, rackCode: string, shelfCode: string): string {
  const parts = [warehouseCode, rackCode, shelfCode]
    .map((part) => String(part || '').trim().toUpperCase())
    .filter(Boolean);
  return parts.join('-');
}

export const warehouseRackService = {
  normalizeCode,

  async getAll(warehouseId?: string): Promise<WarehouseRack[]> {
    if (!isConfigured) return [];
    const scope = await resolveInventoryWarehouseReadScope(warehouseId);
    if (scope.denied) return [];
    const constraints: any[] = [orderBy('sortOrder', 'asc'), orderBy('code', 'asc')];
    if (scope.warehouseId) constraints.unshift(where('warehouseId', '==', scope.warehouseId));
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WarehouseRack));
  },

  async getActiveByWarehouse(warehouseId: string): Promise<WarehouseRack[]> {
    const rows = await this.getAll(warehouseId);
    return rows.filter((row) => row.isActive !== false);
  },

  async create(input: {
    warehouseId: string;
    warehouseName?: string;
    warehouseCode?: string;
    name: string;
    code?: string;
    sortOrder?: number;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const name = input.name.trim();
    const code = normalizeCode(input.code || name);
    if (!input.warehouseId || !name || !code) throw new Error('حدد المخزن واسم الراك.');
    const existing = await getDocs(query(
      tenantQuery(db, COLLECTION),
      where('warehouseId', '==', input.warehouseId),
      where('code', '==', code),
    ));
    if (!existing.empty) throw new Error('كود الراك موجود بالفعل داخل نفس المخزن.');
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      tenantId: getCurrentTenantId(),
      warehouseId: input.warehouseId,
      warehouseName: input.warehouseName,
      warehouseCode: input.warehouseCode,
      name,
      code,
      isActive: true,
      sortOrder: input.sortOrder ?? 0,
      createdAt: toIsoNow(),
      updatedAt: toIsoNow(),
    }));
    return ref.id;
  },

  async update(id: string, patch: Partial<WarehouseRack>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, tenantId: _tenantId, createdAt: _createdAt, ...rest } = patch;
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      ...rest,
      updatedAt: toIsoNow(),
    }));
  },

  /**
   * Rename rack (and optionally change code).
   * - Name-only: updates denormalized rackName on shelves/balances; location codes stay unchanged.
   * - Code change: rebuilds shelf location codes as warehouse-rack-shelf and propagates locationCode.
   */
  async updateDetails(
    id: string,
    input: { name?: string; code?: string },
  ): Promise<{ locationsUpdated: number; codesChanged: boolean }> {
    if (!isConfigured || !id) throw new Error('الراك غير محدد.');
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) throw new Error('الراك غير موجود.');
    const rack = { id: snap.id, ...snap.data() } as WarehouseRack;

    const nextName = String(input.name ?? rack.name).trim();
    const nextCode = normalizeCode(String(input.code ?? rack.code));
    if (!nextName) throw new Error('اسم الراك مطلوب.');
    if (!nextCode) throw new Error('كود الراك مطلوب.');

    const codeChanged = nextCode !== rack.code;
    if (codeChanged) {
      const existing = await getDocs(query(
        tenantQuery(db, COLLECTION),
        where('warehouseId', '==', rack.warehouseId),
        where('code', '==', nextCode),
      ));
      const clash = existing.docs.some((d) => d.id !== id);
      if (clash) throw new Error('كود الراك موجود بالفعل داخل نفس المخزن.');
    }

    const now = toIsoNow();
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      name: nextName,
      code: nextCode,
      updatedAt: now,
    }));

    const locSnap = await getDocs(query(
      tenantQuery(db, LOCATIONS_COLLECTION),
      where('rackId', '==', id),
    ));
    const warehouseCode = rack.warehouseCode;
    let locationsUpdated = 0;
    const codeByLocationId = new Map<string, { oldCode: string; newCode: string }>();

    for (const locDoc of locSnap.docs) {
      const loc = locDoc.data();
      const shelfCode = normalizeCode(String(loc.shelfCode || loc.shelf || ''));
      const patch: Record<string, unknown> = {
        rackName: nextName,
        rack: nextName,
        rackCode: nextCode,
        updatedAt: now,
      };
      if (codeChanged && shelfCode) {
        const oldCode = String(loc.code || '');
        const newCode = buildLocationCode(warehouseCode, nextCode, shelfCode);
        patch.code = newCode;
        if (oldCode && oldCode !== newCode) {
          codeByLocationId.set(locDoc.id, { oldCode, newCode });
        }
      }
      await updateDoc(doc(db, LOCATIONS_COLLECTION, locDoc.id), stripUndefined(patch));
      locationsUpdated += 1;
    }

    // Propagate denormalized fields on location balances for this rack
    const balSnap = await getDocs(query(
      tenantQuery(db, LOCATION_BALANCES_COLLECTION),
      where('rackId', '==', id),
    ));
    if (!balSnap.empty) {
      let batch = writeBatch(db);
      let ops = 0;
      const commitIfNeeded = async (force = false) => {
        if (ops === 0) return;
        if (!force && ops < 400) return;
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };
      for (const balDoc of balSnap.docs) {
        const bal = balDoc.data();
        const locationId = String(bal.locationId || '');
        const codeChange = codeByLocationId.get(locationId);
        batch.update(balDoc.ref, stripUndefined({
          rackName: nextName,
          rack: nextName,
          rackCode: nextCode,
          locationCode: codeChange?.newCode || bal.locationCode,
          updatedAt: now,
        }));
        ops += 1;
        await commitIfNeeded();
      }
      await commitIfNeeded(true);
    }

    // Update default item locations if location codes changed
    if (codeByLocationId.size > 0) {
      const defSnap = await getDocs(query(
        tenantQuery(db, DEFAULT_LOCATIONS_COLLECTION),
        where('warehouseId', '==', rack.warehouseId),
      ));
      for (const defDoc of defSnap.docs) {
        const data = defDoc.data();
        const locationId = String(data.locationId || '');
        const codeChange = codeByLocationId.get(locationId);
        if (!codeChange) continue;
        await updateDoc(defDoc.ref, {
          locationCode: codeChange.newCode,
          updatedAt: now,
        });
      }
    }

    return { locationsUpdated, codesChanged: codeChanged };
  },
};
