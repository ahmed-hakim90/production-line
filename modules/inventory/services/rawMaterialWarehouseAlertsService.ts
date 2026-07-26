import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveSuppliesWarehouseId } from '../lib/resolveSuppliesWarehouse';
import { stockService } from './stockService';
import { transferApprovalService } from './transferApprovalService';
import { productionIssueService } from './productionIssueService';
import { warehouseService } from './warehouseService';
import { systemSettingsService } from '../../system/services/systemSettingsService';

const DEFAULT_MANUAL_THRESHOLD = 500;

/**
 * Count operational alerts for the configured raw-materials / supplies warehouse.
 * Uses the same warehouse resolution as Control/Alerts screens (routing + fallbacks).
 */
export async function countRawMaterialWarehouseAlerts(): Promise<number> {
  const settings = await systemSettingsService.get();
  if (!settings) return 0;
  const routing = resolveInventoryRoutingV1(settings);
  const warehouses = await warehouseService.getAllWarehouses();
  const warehouseId = resolveSuppliesWarehouseId(routing, warehouses);
  if (!warehouseId) return 0;

  const threshold = Number(
    settings.planSettings?.inventoryExceptionManualThreshold || DEFAULT_MANUAL_THRESHOLD,
  );

  const [balances, transactions, pending, issues] = await Promise.all([
    stockService.getBalances(warehouseId),
    stockService.getTransactions(warehouseId),
    transferApprovalService.getByStatus('pending'),
    productionIssueService.getAll(),
  ]);

  let count = 0;

  balances.forEach((b) => {
    const qty = Number(b.quantity || 0);
    const min = Number(b.minStock || 0);
    if (qty < 0) count += 1;
    else if (qty <= 0 && min > 0) count += 1;
    else if (min > 0 && qty <= min) count += 1;
  });

  count += pending.filter(
    (row) => row.fromWarehouseId === warehouseId || row.toWarehouseId === warehouseId,
  ).length;

  count += issues.filter(
    (row) =>
      row.sourceWarehouseId === warehouseId &&
      (row.status === 'draft' || row.status === 'submitted'),
  ).length;

  count += transactions.filter(
    (tx) =>
      tx.sourceModule === 'manual_movement' && Math.abs(Number(tx.quantity || 0)) >= threshold,
  ).length;

  return count;
}
