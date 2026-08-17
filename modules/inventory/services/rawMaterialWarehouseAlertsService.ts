import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveSuppliesWarehouseId } from '../lib/resolveSuppliesWarehouse';
import {
  aggregateOpenPlanDemand,
  buildPlanIssueAlerts,
  type PlanIssueAlertRow,
} from '../lib/planIssueAlerts';
import { stockService } from './stockService';
import { transferApprovalService } from './transferApprovalService';
import { productionIssueService } from './productionIssueService';
import { warehouseService } from './warehouseService';
import { assemblableCapacityService } from './assemblableCapacityService';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { productionPlanService } from '../../production/services/productionPlanService';
import { productService } from '../../production/services/productService';

const DEFAULT_MANUAL_THRESHOLD = 500;

export type { PlanIssueAlertRow };

/**
 * Open plans with remaining qty that supplies stock cannot fully assemblable-cover.
 */
export async function listPlanIssueAlerts(warehouseId?: string): Promise<PlanIssueAlertRow[]> {
  const settings = await systemSettingsService.get();
  if (!settings) return [];
  const routing = resolveInventoryRoutingV1(settings);
  const warehouses = await warehouseService.getAllWarehouses();
  const suppliesId = warehouseId || resolveSuppliesWarehouseId(routing, warehouses);
  if (!suppliesId) return [];

  const [plans, products, capacity] = await Promise.all([
    productionPlanService.getAll(),
    productService.getAll(),
    assemblableCapacityService.getForWarehouse(suppliesId),
  ]);

  const productById = new Map(
    products.filter((p) => p.id).map((p) => [p.id!, { name: p.name || '', code: p.code || '' }]),
  );
  const demands = aggregateOpenPlanDemand(
    plans.map((plan) => {
      const product = productById.get(plan.productId);
      return {
        id: plan.id,
        productId: plan.productId,
        productName: product?.name,
        productCode: product?.code,
        plannedQuantity: plan.plannedQuantity,
        producedQuantity: plan.producedQuantity,
        remainingQuantity: plan.remainingQuantity,
        status: plan.status,
      };
    }),
  );

  const capacityByProductId = new Map(
    capacity.map((row) => [
      row.productId,
      {
        maxAssemblable: row.maxAssemblable,
        productName: row.productName,
        productCode: row.productCode,
      },
    ]),
  );

  return buildPlanIssueAlerts(demands, capacityByProductId);
}

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

  const [balancesResult, transactionsResult, pendingResult, issuesResult, planAlertsResult] =
    await Promise.allSettled([
      stockService.getBalances(warehouseId),
      stockService.getTransactions(warehouseId),
      transferApprovalService.getPendingForWarehouse(warehouseId),
      productionIssueService.listOpenForSourceWarehouse(warehouseId),
      listPlanIssueAlerts(warehouseId),
    ]);
  const balances = balancesResult.status === 'fulfilled' ? balancesResult.value : [];
  const transactions = transactionsResult.status === 'fulfilled' ? transactionsResult.value : [];
  const pending = pendingResult.status === 'fulfilled' ? pendingResult.value : [];
  const issues = issuesResult.status === 'fulfilled' ? issuesResult.value : [];
  const planAlerts = planAlertsResult.status === 'fulfilled' ? planAlertsResult.value : [];

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
      (row.status === 'draft' || row.status === 'submitted' || row.status === 'requested'),
  ).length;

  count += transactions.filter(
    (tx) =>
      tx.sourceModule === 'manual_movement' && Math.abs(Number(tx.quantity || 0)) >= threshold,
  ).length;

  count += planAlerts.length;

  return count;
}
