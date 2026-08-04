import { toast } from '../../../components/Toast';
import { materialService } from '../../manufacturing/services/materialService';
import { stockService } from '../services/stockService';
import {
  INVENTORY_STOCK_MOVE_PATHS,
  MATERIAL_UPDATE_PATHS,
} from '../../system/lib/operationPathSettings';
import type { ParsedConsumableSheetRow } from '../../../utils/importDepartmentConsumablesSheet';
import { isBackgroundJobCancelled } from '../../../components/background-jobs/useJobsStore';

export async function applyConsumableSheetRow(
  row: ParsedConsumableSheetRow,
  createdBy: string,
): Promise<void> {
  if (row.willUpdatePrice && row.targetPrice !== null && row.itemId) {
    await materialService.update(
      row.itemId,
      { purchaseCost: Number(row.targetPrice) },
      { path: MATERIAL_UPDATE_PATHS.materialsImport },
    );
  }

  if (row.willUpdateQty && row.warehouseId && row.itemId && Math.abs(row.qtyDelta) > 0.000_001) {
    await stockService.createMovement(
      {
        warehouseId: row.warehouseId,
        locationId: row.locationId,
        locationCode: row.locationCode || undefined,
        itemType: 'material',
        itemId: row.itemId,
        itemName: row.itemName,
        itemCode: row.itemCode,
        unit: row.unit,
        movementType: 'ADJUSTMENT',
        quantity: Number(row.qtyDelta),
        sourceModule: 'manual_movement',
        sourceId: `CNS-SHEET-${Date.now()}-${row.rowIndex}`,
        note: `تحديث رصيد مستهلك من الشيت — ${row.itemName}`,
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
  try {
    for (let i = 0; i < valid.length; i += 1) {
      if (isBackgroundJobCancelled(input.jobId)) {
        input.onFail('تم إلغاء المهمة.');
        return;
      }
      try {
        await applyConsumableSheetRow(valid[i], input.createdBy);
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
