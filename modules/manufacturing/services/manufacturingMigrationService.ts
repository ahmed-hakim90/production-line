import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import { stockService } from '../../inventory/services/stockService';
import { productMaterialService } from '../../production/services/productMaterialService';
import type { ProductMaterial } from '../../../types';
import { materialService } from './materialService';
import { bomService } from './bomService';
import { normalizeLegacyUnit } from '../types';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { DEFAULT_PLAN_SETTINGS } from '../../../utils/dashboardConfig';
import { roleService } from '../../system/services/roleService';

const PRODUCT_MATERIALS_COLLECTION = 'product_materials';
const STOCK_COLLECTION = 'stock_items';

export type ManufacturingMigrationResult = {
  materialsCreated: number;
  materialsSkipped: number;
  bomsCreated: number;
  bomItemsCreated: number;
  stockItemsUpdated: number;
  permissionsPatched: number;
};

const MANUFACTURING_PERMS = [
  'materials.view',
  'materials.manage',
  'bom.view',
  'bom.manage',
  'planning.materialRequirements.view',
  'planning.materialRequirements.generate',
] as const;

export const manufacturingMigrationService = {
  /** Grant manufacturing permissions on roles that already manage products or inventory. */
  async ensureManufacturingPermissionsOnRoles(): Promise<number> {
    const roles = await roleService.getAll();
    let patched = 0;
    for (const role of roles) {
      if (!role.id) continue;
      const p = role.permissions || {};
      const shouldPatch =
        p['roles.manage'] === true
        || p['products.edit'] === true
        || p['products.create'] === true
        || p['inventory.items.manage'] === true
        || p['costs.manage'] === true
        || role.roleKey === 'factory_manager'
        || role.roleKey === 'admin';
      if (!shouldPatch) continue;

      const next = { ...p };
      let changed = false;
      for (const key of MANUFACTURING_PERMS) {
        if (!next[key]) {
          next[key] = true;
          changed = true;
        }
      }
      if (changed) {
        await roleService.update(role.id, { permissions: next });
        patched += 1;
      }
    }
    return patched;
  },

  async markMigrationComplete(): Promise<void> {
    const current = await systemSettingsService.get();
    if (!current) return;
    await systemSettingsService.set({
      ...current,
      planSettings: {
        ...DEFAULT_PLAN_SETTINGS,
        ...(current.planSettings ?? {}),
        manufacturingMigratedAt: new Date().toISOString(),
      },
    });
  },

  async migrateTenant(): Promise<ManufacturingMigrationResult> {
    if (!isConfigured) {
      return {
        materialsCreated: 0,
        materialsSkipped: 0,
        bomsCreated: 0,
        bomItemsCreated: 0,
        stockItemsUpdated: 0,
        permissionsPatched: 0,
      };
    }

    const result: ManufacturingMigrationResult = {
      materialsCreated: 0,
      materialsSkipped: 0,
      bomsCreated: 0,
      bomItemsCreated: 0,
      stockItemsUpdated: 0,
      permissionsPatched: 0,
    };

    result.permissionsPatched = await manufacturingMigrationService.ensureManufacturingPermissionsOnRoles();

    const legacyIdToMaterialId = new Map<string, string>();

    const rawMaterials = await rawMaterialService.getAll();

    for (const raw of rawMaterials) {
      if (!raw.id) continue;
      const existing = await materialService.getByLegacyRawMaterialId(raw.id);
      if (existing?.id) {
        legacyIdToMaterialId.set(raw.id, existing.id);
        result.materialsSkipped += 1;
        continue;
      }

      const materialId = await materialService.create({
        code: raw.code || `RM-${raw.id.slice(0, 6)}`,
        name: raw.name,
        type: 'raw_material',
        baseUnit: normalizeLegacyUnit(raw.unit),
        purchaseUnit: raw.unit,
        conversionRate: 1,
        purchaseCost: 0,
        wastePercent: 0,
        isManufacturedInternally: false,
        linkedCostCenterIds: [],
        legacyRawMaterialId: raw.id,
        categoryName: raw.categoryName,
        minStock: Number(raw.minStock ?? 0),
        isActive: raw.isActive !== false,
      });

      if (materialId) {
        legacyIdToMaterialId.set(raw.id, materialId);
        result.materialsCreated += 1;
      }
    }

    const productMaterials = await productMaterialService.getAll();
    const byProduct = new Map<string, ProductMaterial[]>();
    for (const row of productMaterials) {
      const list = byProduct.get(row.productId) ?? [];
      list.push(row);
      byProduct.set(row.productId, list);
    }

    for (const [productId, rows] of byProduct) {
      const existingBom = await bomService.getActiveBom('product', productId);
      if (existingBom?.id) {
        const items = await bomService.getItemsByBomId(existingBom.id);
        if (items.length > 0) continue;
      }

      const bomId = await bomService.ensureActiveBom('product', productId);
      result.bomsCreated += 1;

      let sortOrder = 0;
      for (const row of rows) {
        let materialId = row.materialId ? legacyIdToMaterialId.get(row.materialId) : undefined;
        if (!materialId && row.materialName) {
          const byName = (await materialService.getAll()).find(
            (m) => m.name.trim().toLowerCase() === row.materialName.trim().toLowerCase(),
          );
          materialId = byName?.id;
        }
        if (!materialId && row.materialName) {
          const created = await materialService.create({
            code: `MIG-${productId.slice(0, 6)}-${sortOrder}`,
            name: row.materialName,
            type: 'raw_material',
            baseUnit: 'piece',
            conversionRate: 1,
            purchaseCost: Number(row.unitCost || 0),
            isActive: true,
            isManufacturedInternally: false,
          });
          materialId = created ?? undefined;
          if (materialId && row.materialId) {
            legacyIdToMaterialId.set(row.materialId, materialId);
            result.materialsCreated += 1;
          }
        } else if (materialId && row.unitCost) {
          await materialService.update(materialId, {
            purchaseCost: Number(row.unitCost || 0),
          });
        }

        if (!materialId) continue;

        await bomService.addItem(bomId, {
          itemId: materialId,
          itemType: 'material',
          itemName: row.materialName,
          qtyPerUnit: Number(row.quantityUsed || 0),
          unit: 'piece',
          wastePercent: 0,
          costBehavior: 'direct',
          directCostPerUnit: 0,
          indirectCostPerUnit: 0,
          sortOrder: sortOrder++,
        });
        result.bomItemsCreated += 1;
      }
    }

    const tenantId = getCurrentTenantId();
    const updatedDocIds = new Set<string>();

    const stockSnap = await getDocs(
      query(collection(db, STOCK_COLLECTION), where('tenantId', '==', tenantId)),
    );
    let batch = writeBatch(db);
    let batchCount = 0;

    const queueStockUpdate = (ref: Parameters<typeof batch.update>[0], legacyItemId: string) => {
      const newId = legacyIdToMaterialId.get(legacyItemId);
      if (!newId) return;
      batch.update(ref, { itemId: newId, itemType: 'material' });
      batchCount += 1;
      result.stockItemsUpdated += 1;
    };

    for (const stockDoc of stockSnap.docs) {
      const data = stockDoc.data();
      if (data.itemType !== 'raw_material') continue;
      queueStockUpdate(stockDoc.ref, String(data.itemId || ''));
      updatedDocIds.add(stockDoc.id);
      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    const balances = await stockService.getBalances();
    for (const balance of balances) {
      if (balance.itemType !== 'raw_material' || !balance.id || updatedDocIds.has(balance.id)) {
        continue;
      }
      queueStockUpdate(doc(db, STOCK_COLLECTION, balance.id), balance.itemId);
      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();

    await manufacturingMigrationService.markMigrationComplete();

    return result;
  },
};
