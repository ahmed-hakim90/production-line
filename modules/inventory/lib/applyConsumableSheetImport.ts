import { toast } from '../../../components/Toast';
import { createMaterial } from '../../manufacturing/usecases/createMaterial';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material, MaterialUnit } from '../../manufacturing/types';
import { stockService } from '../services/stockService';
import {
  INVENTORY_STOCK_MOVE_PATHS,
  MATERIAL_CREATE_PATHS,
  MATERIAL_UPDATE_PATHS,
} from '../../system/lib/operationPathSettings';
import type { ParsedConsumableSheetRow } from '../../../utils/importDepartmentConsumablesSheet';
import { isBackgroundJobCancelled } from '../../../components/background-jobs/useJobsStore';

function normalizeItemName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function ensureConsumableMaterial(
  row: ParsedConsumableSheetRow,
  createdByName: Map<string, { itemId: string; itemCode: string; unit: string }>,
): Promise<{ itemId: string; itemCode: string; unit: string }> {
  if (row.itemId) {
    return { itemId: row.itemId, itemCode: row.itemCode, unit: row.unit || 'piece' };
  }

  const nameKey = normalizeItemName(row.itemName);
  const cached = createdByName.get(nameKey);
  if (cached) return cached;

  const unit = (row.unit || 'piece') as MaterialUnit;
  const purchaseCost = row.targetPrice !== null ? Number(row.targetPrice) : 0;
  const payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'> = {
    code: String(row.itemCode || '').trim().toUpperCase(),
    name: String(row.itemName || '').trim(),
    type: 'consumable',
    baseUnit: unit,
    purchaseCost,
    conversionRate: 1,
    wastePercent: 0,
    isActive: true,
  };

  const result = await createMaterial(
    payload,
    { path: MATERIAL_CREATE_PATHS.consumableSheetImport },
  );
  if (!result.ok || !result.data?.materialId) {
    throw result.ok === false
      ? result.error
      : new Error(`تعذر إنشاء المستهلك: ${row.itemName}`);
  }

  const created = {
    itemId: result.data.materialId,
    itemCode: payload.code,
    unit,
  };
  createdByName.set(nameKey, created);
  return created;
}

export async function applyConsumableSheetRow(
  row: ParsedConsumableSheetRow,
  createdBy: string,
  createdByName: Map<string, { itemId: string; itemCode: string; unit: string }> = new Map(),
): Promise<void> {
  const material = row.willCreateItem
    ? await ensureConsumableMaterial(row, createdByName)
    : { itemId: row.itemId, itemCode: row.itemCode, unit: row.unit || 'piece' };

  // New items already receive purchaseCost at create time.
  if (
    !row.willCreateItem
    && row.willUpdatePrice
    && row.targetPrice !== null
    && material.itemId
  ) {
    await materialService.update(
      material.itemId,
      { purchaseCost: Number(row.targetPrice) },
      { path: MATERIAL_UPDATE_PATHS.materialsImport },
    );
  }

  if (row.willUpdateQty && row.warehouseId && material.itemId && Math.abs(row.qtyDelta) > 0.000_001) {
    await stockService.createMovement(
      {
        warehouseId: row.warehouseId,
        locationId: row.locationId,
        locationCode: row.locationCode || undefined,
        itemType: 'material',
        itemId: material.itemId,
        itemName: row.itemName,
        itemCode: material.itemCode,
        unit: material.unit,
        movementType: 'ADJUSTMENT',
        quantity: Number(row.qtyDelta),
        sourceModule: 'manual_movement',
        sourceId: `CNS-SHEET-${Date.now()}-${row.rowIndex}`,
        note: row.willCreateItem
          ? `إنشاء مستهلك من الشيت وضبط الرصيد — ${row.itemName}`
          : `تحديث رصيد مستهلك من الشيت — ${row.itemName}`,
        createdBy,
      },
      { path: INVENTORY_STOCK_MOVE_PATHS.consumableSheetImport },
    );
  }
}

export async function runConsumableSheetImportJob(input: {
  jobId: string;
  rows: ParsedConsumableSheetRow[];
  createdBy: string;
  onProgress: (processed: number, total: number) => void;
  onComplete: (added: number, failed: number) => void;
  onFail: (message: string) => void;
}): Promise<void> {
  const valid = input.rows.filter((r) => r.errors.length === 0);
  const total = valid.length;
  let added = 0;
  let failed = 0;
  const createdByName = new Map<string, { itemId: string; itemCode: string; unit: string }>();
  try {
    for (let i = 0; i < valid.length; i += 1) {
      if (isBackgroundJobCancelled(input.jobId)) {
        input.onFail('تم إلغاء المهمة.');
        return;
      }
      try {
        await applyConsumableSheetRow(valid[i], input.createdBy, createdByName);
        added += 1;
      } catch (error) {
        failed += 1;
        console.error('consumable sheet row failed', valid[i].rowIndex, error);
      }
      input.onProgress(i + 1, total);
    }
    input.onComplete(added, failed);
    if (failed > 0) {
      toast.warning(`اكتمل رفع الشيت مع ${failed} صف فاشل من ${total}.`);
    } else {
      toast.success(`تم تحديث ${added} صف من شيت المستهلكات.`);
    }
  } catch (error) {
    input.onFail(error instanceof Error ? error.message : 'تعذر تنفيذ رفع الشيت.');
  }
}
