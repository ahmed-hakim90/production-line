import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { DefaultItemLocation, InventoryItemType } from '../types';
import { warehouseLocationService } from './warehouseLocationService';

const COLLECTION = 'default_item_locations';

const toIsoNow = () => new Date().toISOString();
const docIdFor = (warehouseId: string, itemType: InventoryItemType, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

export const defaultItemLocationService = {
  docIdFor,

  async get(params: {
    warehouseId: string;
    itemType: InventoryItemType;
    itemId: string;
  }): Promise<DefaultItemLocation | null> {
    if (!isConfigured || !params.warehouseId || !params.itemId) return null;
    const snap = await getDoc(doc(db, COLLECTION, docIdFor(params.warehouseId, params.itemType, params.itemId)));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as DefaultItemLocation) : null;
  },

  async getAll(warehouseId?: string): Promise<DefaultItemLocation[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [orderBy('itemName', 'asc')];
    if (warehouseId) constraints.unshift(where('warehouseId', '==', warehouseId));
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DefaultItemLocation));
  },

  async set(input: {
    warehouseId: string;
    warehouseName?: string;
    itemType: InventoryItemType;
    itemId: string;
    itemName: string;
    itemCode: string;
    locationId: string;
    locationCode: string;
  }): Promise<void> {
    if (!isConfigured) return;
    if (!input.warehouseId || !input.itemId || !input.locationId) {
      throw new Error('حدد المخزن والصنف واللوكيشن.');
    }
    const activeLocations = await warehouseLocationService.getActiveByWarehouse(input.warehouseId);
    const location = activeLocations.find((loc) => loc.id === input.locationId);
    if (!location?.id) throw new Error('لا يمكن حفظ الافتراضي على رف موقوف أو تابع لراك موقوف.');
    const now = toIsoNow();
    await setDoc(doc(db, COLLECTION, docIdFor(input.warehouseId, input.itemType, input.itemId)), {
      tenantId: getCurrentTenantId(),
      warehouseId: input.warehouseId,
      warehouseName: input.warehouseName,
      itemType: input.itemType,
      itemId: input.itemId,
      itemName: input.itemName,
      itemCode: input.itemCode,
      locationId: input.locationId,
      locationCode: location.code || input.locationCode,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  },
};
