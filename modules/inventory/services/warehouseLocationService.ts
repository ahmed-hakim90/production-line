import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { WarehouseLocation, WarehouseRack } from '../types';
import { warehouseRackService } from './warehouseRackService';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = 'warehouse_locations';
const LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const DEFAULT_LOCATIONS_COLLECTION = 'default_item_locations';

const toIsoNow = () => new Date().toISOString();
const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '-');

/** Stable id so concurrent "create shelf" clicks cannot insert two docs for the same shelf. */
function locationDocId(warehouseId: string, rackCode: string, shelfCode: string): string {
  return `${warehouseId}__${rackCode}__${shelfCode}`.replace(/\//g, '_');
}

function buildLocationCode(warehouseCode: string | undefined, rackCode: string, shelfCode: string): string {
  const parts = [warehouseCode, rackCode, shelfCode]
    .map((part) => String(part || '').trim().toUpperCase())
    .filter(Boolean);
  return parts.join('-');
}

function buildShelfCodes(input: {
  mode?: 'single' | 'numeric_range' | 'alpha_range';
  shelf?: string;
  from?: string;
  to?: string;
}): string[] {
  if (input.mode === 'numeric_range') {
    const from = Number(input.from);
    const to = Number(input.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error('مدى الأرفف الرقمي غير صحيح.');
    const width = Math.max(String(input.from || '').length, String(input.to || '').length);
    return Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(width, '0'));
  }
  if (input.mode === 'alpha_range') {
    const from = String(input.from || '').trim().toUpperCase();
    const to = String(input.to || '').trim().toUpperCase();
    if (!/^[A-Z]$/.test(from) || !/^[A-Z]$/.test(to) || from.charCodeAt(0) > to.charCodeAt(0)) {
      throw new Error('مدى الأرفف الحرفي غير صحيح.');
    }
    return Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
      String.fromCharCode(from.charCodeAt(0) + i));
  }
  const shelf = String(input.shelf || '').trim();
  if (!shelf) throw new Error('حدد اسم الرف.');
  return [shelf];
}

export const warehouseLocationService = {
  buildLocationCode,
  buildShelfCodes,
  locationDocId,

  async getAll(warehouseId?: string): Promise<WarehouseLocation[]> {
    if (!isConfigured) return [];
    const scope = await resolveInventoryWarehouseReadScope(warehouseId);
    if (scope.denied) return [];
    const constraints: any[] = [orderBy('code', 'asc')];
    if (scope.warehouseId) constraints.unshift(where('warehouseId', '==', scope.warehouseId));
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WarehouseLocation));
  },

  async getActiveByWarehouse(warehouseId: string): Promise<WarehouseLocation[]> {
    const [rows, racks] = await Promise.all([
      this.getAll(warehouseId),
      warehouseRackService.getAll(warehouseId),
    ]);
    const inactiveRackIds = new Set(racks.filter((rack) => rack.isActive === false).map((rack) => rack.id).filter(Boolean));
    return rows.filter((row) => row.isActive !== false && (!row.rackId || !inactiveRackIds.has(row.rackId)));
  },

  async create(input: {
    warehouseId: string;
    warehouseName?: string;
    warehouseCode?: string;
    rackId?: string;
    rackName?: string;
    rackCode?: string;
    rack: string;
    shelf: string;
    code?: string;
    /** When true, return existing location id instead of throwing (safe retries / double-submit). */
    skipIfExists?: boolean;
  }): Promise<{ id: string; created: boolean } | null> {
    if (!isConfigured) return null;
    const rack = (input.rackName || input.rack).trim();
    const shelf = input.shelf.trim();
    const rackCode = normalizeCode(input.rackCode || rack);
    const shelfCode = normalizeCode(shelf);
    if (!input.warehouseId || !rack || !shelf) {
      throw new Error('حدد المخزن والراك والرف.');
    }
    const code = (input.code?.trim() || buildLocationCode(input.warehouseCode, rackCode, shelfCode)).toUpperCase();

    // Legacy auto-id docs: detect by business key before creating a deterministic-id doc.
    const existing = await getDocs(query(
      tenantQuery(db, COLLECTION),
      where('warehouseId', '==', input.warehouseId),
      where('rackCode', '==', rackCode),
      where('shelfCode', '==', shelfCode),
    ));
    if (!existing.empty) {
      if (input.skipIfExists) return { id: existing.docs[0].id, created: false };
      throw new Error('الرف موجود بالفعل داخل نفس الراك.');
    }

    const docId = locationDocId(input.warehouseId, rackCode, shelfCode);
    const ref = doc(db, COLLECTION, docId);
    const now = toIsoNow();
    const payload = stripUndefined({
      tenantId: getCurrentTenantId(),
      warehouseId: input.warehouseId,
      warehouseName: input.warehouseName,
      rackId: input.rackId,
      rackName: rack,
      rackCode,
      rack,
      shelfName: shelf,
      shelfCode,
      shelf,
      code,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        if (input.skipIfExists) return { id: snap.id, created: false };
        throw new Error('الرف موجود بالفعل داخل نفس الراك.');
      }
      tx.set(ref, payload);
      return { id: docId, created: true };
    });
  },

  async createShelves(input: {
    warehouseId: string;
    warehouseName?: string;
    warehouseCode?: string;
    rack: WarehouseRack;
    mode?: 'single' | 'numeric_range' | 'alpha_range';
    shelf?: string;
    from?: string;
    to?: string;
  }): Promise<{ createdIds: string[]; skipped: number }> {
    if (!input.rack?.id) throw new Error('اختر راك صحيح لإنشاء الأرفف.');
    if (input.rack.isActive === false) throw new Error('لا يمكن إنشاء أرفف داخل راك موقوف.');
    const shelfCodes = buildShelfCodes(input);
    const createdIds: string[] = [];
    let skipped = 0;
    for (const shelf of shelfCodes) {
      const result = await this.create({
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
        warehouseCode: input.warehouseCode,
        rackId: input.rack.id,
        rackName: input.rack.name,
        rackCode: input.rack.code,
        rack: input.rack.name,
        shelf,
        skipIfExists: true,
      });
      if (!result) continue;
      if (result.created) createdIds.push(result.id);
      else skipped += 1;
    }
    return { createdIds, skipped };
  },

  /**
   * Hard-delete a shelf when it has no stock quantity.
   * Clears zero-qty balance rows and default-location pointers first.
   */
  async remove(id: string): Promise<void> {
    if (!isConfigured || !id) throw new Error('معرّف الرف غير صالح.');
    const ref = doc(db, COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('الرف غير موجود.');
    const loc = { id: snap.id, ...snap.data() } as WarehouseLocation;

    const balSnap = await getDocs(tenantQuery(
      db,
      LOCATION_BALANCES_COLLECTION,
      where('locationId', '==', id),
      orderBy('updatedAt', 'desc'),
    ));
    const withQty = balSnap.docs.filter((d) => Math.abs(Number(d.data().quantity) || 0) > 1e-9);
    if (withQty.length > 0) {
      throw new Error('لا يمكن حذف رف عليه أرصدة. انقل أو صفّر الكمية أولاً.');
    }

    for (const balDoc of balSnap.docs) {
      await deleteDoc(balDoc.ref);
    }

    if (loc.warehouseId) {
      const defaultsSnap = await getDocs(tenantQuery(
        db,
        DEFAULT_LOCATIONS_COLLECTION,
        where('warehouseId', '==', loc.warehouseId),
        orderBy('itemName', 'asc'),
      ));
      for (const defDoc of defaultsSnap.docs) {
        if (String(defDoc.data().locationId || '') === id) {
          await deleteDoc(defDoc.ref);
        }
      }
    }

    await deleteDoc(ref);
  },

  async update(id: string, patch: Partial<WarehouseLocation>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, tenantId: _tenantId, createdAt: _createdAt, ...rest } = patch;
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      ...rest,
      updatedAt: toIsoNow(),
    }));
  },

  async migrateLegacyLocationsToRacks(): Promise<number> {
    if (!isConfigured) return 0;
    const locations = await this.getAll();
    const legacy = locations.filter((loc) => !loc.rackId && loc.rack && loc.warehouseId);
    if (!legacy.length) return 0;
    const racks = await warehouseRackService.getAll();
    const rackByKey = new Map<string, WarehouseRack>();
    racks.forEach((rack) => rackByKey.set(`${rack.warehouseId}__${rack.code}`, rack));
    let updated = 0;
    for (const loc of legacy) {
      const rackName = loc.rack.trim();
      const rackCode = normalizeCode(loc.rackCode || rackName);
      const key = `${loc.warehouseId}__${rackCode}`;
      let rack = rackByKey.get(key);
      if (!rack?.id) {
        const rackId = await warehouseRackService.create({
          warehouseId: loc.warehouseId,
          warehouseName: loc.warehouseName,
          name: rackName,
          code: rackCode,
        });
        if (!rackId) continue;
        rack = {
          id: rackId,
          warehouseId: loc.warehouseId,
          warehouseName: loc.warehouseName,
          name: rackName,
          code: rackCode,
          isActive: true,
          createdAt: toIsoNow(),
        };
        rackByKey.set(key, rack);
      }
      const shelfName = (loc.shelfName || loc.shelf || '').trim();
      const shelfCode = normalizeCode(loc.shelfCode || shelfName);
      await this.update(loc.id!, {
        rackId: rack.id,
        rackName: rack.name,
        rackCode: rack.code,
        rack: rack.name,
        shelfName,
        shelfCode,
        shelf: shelfName,
      });
      updated += 1;
    }
    return updated;
  },
};
