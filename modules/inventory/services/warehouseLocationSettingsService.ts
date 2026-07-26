import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import type { WarehouseLocationSettings } from '../types';

const COLLECTION = 'warehouse_location_settings';
const toIsoNow = () => new Date().toISOString();

const defaultsFor = (warehouseId: string, warehouseName?: string): WarehouseLocationSettings => ({
  warehouseId,
  warehouseName,
  requireComponentLocation: true,
  requireFinishedGoodLocation: false,
  autoGenerateLocationCode: true,
  allowSuggestedLocationOverride: true,
  createdAt: toIsoNow(),
  updatedAt: toIsoNow(),
});

export const warehouseLocationSettingsService = {
  defaultsFor,

  async get(warehouseId: string, warehouseName?: string): Promise<WarehouseLocationSettings | null> {
    if (!isConfigured || !warehouseId) return defaultsFor(warehouseId, warehouseName);
    const snap = await getDoc(doc(db, COLLECTION, warehouseId));
    if (!snap.exists()) return defaultsFor(warehouseId, warehouseName);
    return { id: snap.id, ...defaultsFor(warehouseId, warehouseName), ...snap.data() } as WarehouseLocationSettings;
  },

  async save(input: Partial<WarehouseLocationSettings> & { warehouseId: string; warehouseName?: string }): Promise<void> {
    if (!isConfigured || !input.warehouseId) return;
    const current = await this.get(input.warehouseId, input.warehouseName);
    const now = toIsoNow();
    await setDoc(doc(db, COLLECTION, input.warehouseId), {
      tenantId: getCurrentTenantId(),
      ...current,
      ...input,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    }, { merge: true });
  },
};
