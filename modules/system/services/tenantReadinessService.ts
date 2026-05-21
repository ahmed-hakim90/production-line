import { getDocs } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { BOMS_COLLECTION, MATERIALS_COLLECTION } from '../../manufacturing/collections';
import { materialPurchaseCostPerBaseUnit } from '../../manufacturing/types';
import type { Material } from '../../manufacturing/types';
import { warehouseService } from '../../inventory/services/warehouseService';
import { lineService } from '../../production/services/lineService';
import { costCenterService } from '../../costs/services/costCenterService';
import { systemSettingsService } from './systemSettingsService';
import {
  buildTenantReadinessChecks,
  type TenantReadinessResult,
} from '../lib/tenantReadinessLib';

export const tenantReadinessService = {
  async evaluate(): Promise<TenantReadinessResult> {
    if (!isConfigured) {
      return buildTenantReadinessChecks({
        warehouseCount: 0,
        materialCount: 0,
        materialsWithCost: 0,
        bomCount: 0,
        lineCount: 0,
        costCenterCount: 0,
        settings: null,
      });
    }

    const [warehouses, materialsSnap, bomsSnap, lines, costCenters, settings] = await Promise.all([
      warehouseService.getAllWarehouses(),
      getDocs(tenantQuery(db, MATERIALS_COLLECTION)),
      getDocs(tenantQuery(db, BOMS_COLLECTION)),
      lineService.getAll(),
      costCenterService.getAll(),
      systemSettingsService.get(),
    ]);

    const materials = materialsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Material));
    const materialsWithCost = materials.filter((m) => materialPurchaseCostPerBaseUnit(m) > 0).length;

    return buildTenantReadinessChecks({
      warehouseCount: warehouses.length,
      materialCount: materials.length,
      materialsWithCost,
      bomCount: bomsSnap.size,
      lineCount: lines.length,
      costCenterCount: costCenters.length,
      settings,
    });
  },
};
