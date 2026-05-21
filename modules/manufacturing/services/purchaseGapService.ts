import { getDocs } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { PRODUCTION_PLAN_MATERIAL_REQUIREMENTS_COLLECTION } from '../collections';
import { stockService } from '../../inventory/services/stockService';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';
import type { SystemSettings } from '../../../types';
import type { ProductionPlanMaterialRequirements } from '../types';

export type PurchaseGapRow = {
  materialId: string;
  materialName: string;
  requiredQty: number;
  availableQty: number;
  gapQty: number;
  unit?: string;
};

export const purchaseGapService = {
  async buildGapReport(settings: SystemSettings): Promise<PurchaseGapRow[]> {
    if (!isConfigured) return [];
    const routing = resolveInventoryRoutingV1(settings);
    const rawWarehouseId = routing.rawMaterialWarehouseId?.trim();
    if (!rawWarehouseId) return [];

    const [reqSnap, balances] = await Promise.all([
      getDocs(tenantQuery(db, PRODUCTION_PLAN_MATERIAL_REQUIREMENTS_COLLECTION)),
      stockService.getBalances(rawWarehouseId),
    ]);

    const requiredByMaterial = new Map<string, { name: string; qty: number; unit?: string }>();
    reqSnap.docs.forEach((d) => {
      const req = d.data() as ProductionPlanMaterialRequirements;
      (req.lines || []).forEach((line) => {
        const id = String(line.materialId || '').trim();
        if (!id) return;
        const prev = requiredByMaterial.get(id);
        const add = Number(line.requiredQty || 0);
        requiredByMaterial.set(id, {
          name: String(line.materialName || prev?.name || id),
          qty: (prev?.qty || 0) + add,
          unit: line.unit || prev?.unit,
        });
      });
    });

    const balanceByMaterial = new Map<string, number>();
    balances.forEach((b) => {
      if (b.itemType !== 'material' && b.itemType !== 'raw_material') return;
      const key = b.itemId;
      balanceByMaterial.set(key, (balanceByMaterial.get(key) || 0) + Number(b.quantity || 0));
    });

    const rows: PurchaseGapRow[] = [];
    requiredByMaterial.forEach((meta, materialId) => {
      const availableQty = balanceByMaterial.get(materialId) || 0;
      const gapQty = Math.max(0, meta.qty - availableQty);
      if (gapQty <= 0) return;
      rows.push({
        materialId,
        materialName: meta.name,
        requiredQty: meta.qty,
        availableQty,
        gapQty,
        unit: meta.unit,
      });
    });

    return rows.sort((a, b) => b.gapQty - a.gapQty);
  },
};
