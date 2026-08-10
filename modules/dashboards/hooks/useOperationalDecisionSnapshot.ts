import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { getCurrentTenantIdOrNull } from '../../../lib/currentTenant';
import {
  fetchCachedPageData,
  isPageDataCacheFresh,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';
import { productionIssueService } from '../../inventory/services/productionIssueService';
import { stockService } from '../../inventory/services/stockService';
import { suppliesReceiptService } from '../../inventory/services/suppliesReceiptService';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import { countRawMaterialWarehouseAlerts } from '../../inventory/services/rawMaterialWarehouseAlertsService';
import { assemblableCapacityService } from '../../inventory/services/assemblableCapacityService';
import type {
  InventoryTransferRequest,
  ProductionIssueOrder,
  StockCountSession,
  StockItemBalance,
  SuppliesReceiptOrder,
} from '../../inventory/types';
import {
  averageScheduleAdherence,
  countNegativeAndLow,
  isPlanBehindSchedule,
  sumBalanceQty,
  summarizeInventoryRisk,
  summarizeMaterialReadiness,
  summarizePackagingQueue,
  summarizePendingTransfersForDecision,
  summarizeProductionIssuesForDecision,
  summarizeReceiptsForDecision,
  summarizeStockCountSessions,
  resolvePlanReports,
  volumeWeightedPlanAchievement,
  type PlanActualInput,
} from '../lib/decisionMetrics';
import {
  OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS,
  resolveOperationalDecisionSnapshotCacheKey,
} from '../lib/operationalDecisionSnapshotCache';
import type { ProductionPlan, ProductionPlanFollowUp, ProductionReport } from '../../../types';

export {
  OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS,
  resolveOperationalDecisionSnapshotCacheKey,
} from '../lib/operationalDecisionSnapshotCache';

function snapshotCacheKey(): string {
  return resolveOperationalDecisionSnapshotCacheKey(getCurrentTenantIdOrNull());
}

export type OperationalDecisionSnapshot = {
  issues: ReturnType<typeof summarizeProductionIssuesForDecision>;
  transfers: ReturnType<typeof summarizePendingTransfersForDecision>;
  packaging: ReturnType<typeof summarizePackagingQueue>;
  inventory: ReturnType<typeof summarizeInventoryRisk>;
  receipts: ReturnType<typeof summarizeReceiptsForDecision>;
  stockCounts: ReturnType<typeof summarizeStockCountSessions>;
  materials: ReturnType<typeof summarizeMaterialReadiness>;
  planVolumeAchievement: number;
  scheduleAdherence: number;
  behindScheduleCount: number;
  loadedAt: number | null;
};

type RawSnapshot = {
  issues: ProductionIssueOrder[];
  pendingTransfers: InventoryTransferRequest[];
  packagingAwaitingUnits: number;
  packagingSkuCount: number;
  lowStockCount: number;
  negativeCount: number;
  suppliesAlertCount: number;
  wipQty: number;
  finishedQty: number;
  wasteQty: number;
  receipts: SuppliesReceiptOrder[];
  countSessions: StockCountSession[];
  /** productId → max assemblable units from raw warehouse */
  maxAssemblableByProductId: Record<string, number>;
  assemblableConfigured: boolean;
};

const EMPTY: OperationalDecisionSnapshot = {
  issues: summarizeProductionIssuesForDecision([]),
  transfers: summarizePendingTransfersForDecision([]),
  packaging: summarizePackagingQueue({
    awaitingUnits: 0,
    skuCount: 0,
    pendingPackagingTransfers: 0,
  }),
  inventory: summarizeInventoryRisk({
    lowStockCount: 0,
    negativeCount: 0,
    suppliesAlertCount: 0,
    wipQty: 0,
    finishedQty: 0,
    wasteQty: 0,
    dailyFinishedDemand: 0,
  }),
  receipts: summarizeReceiptsForDecision([]),
  stockCounts: summarizeStockCountSessions([]),
  materials: summarizeMaterialReadiness({ plans: [], followUps: [] }),
  planVolumeAchievement: 0,
  scheduleAdherence: 0,
  behindScheduleCount: 0,
  loadedAt: null,
};

function buildPlanActuals(
  plans: ProductionPlan[],
  planReports: Record<string, ProductionReport[]>,
): PlanActualInput[] {
  return plans
    .filter((p) => p.status === 'in_progress' || p.status === 'planned' || p.status === 'completed')
    .map((plan) => {
      const reports = resolvePlanReports(plan, planReports);
      const fromReports = reports.reduce((s, r) => s + Number(r.quantityProduced || 0), 0);
      const actualQuantity = Math.max(Number(plan.producedQuantity || 0), fromReports);
      return {
        plannedQuantity: Number(plan.plannedQuantity || 0),
        actualQuantity,
        startDate: plan.plannedStartDate || plan.startDate,
        plannedEndDate: plan.plannedEndDate,
        status: plan.status,
      };
    });
}

async function loadWarehouseBalances(warehouseId: string | undefined): Promise<StockItemBalance[]> {
  const id = String(warehouseId || '').trim();
  if (!id) return [];
  return stockService.getBalances(id).catch(() => []);
}

export function useOperationalDecisionSnapshot(options?: {
  planDelayDays?: number;
}): {
  snapshot: OperationalDecisionSnapshot;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const planReports = useAppStore((s) => s.planReports);
  const productionPlanFollowUps = useAppStore((s) => s.productionPlanFollowUps);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const cacheKey = snapshotCacheKey();

  const cached = peekPageDataCache<RawSnapshot>(cacheKey);
  const [raw, setRaw] = useState<RawSnapshot | null>(() => cached ?? null);
  const [loading, setLoading] = useState(() => cached == null);

  const load = useCallback(async (force = false) => {
    const key = snapshotCacheKey();
    const existing = peekPageDataCache<RawSnapshot>(key);
    if (existing) {
      setRaw(existing);
      setLoading(false);
      // Fresh within TTL: skip network; concurrent mounts share this via pageDataCache.
      if (!force && isPageDataCacheFresh(key, OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS)) {
        return;
      }
    } else {
      setLoading(true);
    }

    try {
      const packagingSourceId = String(
        routing.packagingSourceWarehouseId || routing.finishedStagingWarehouseId || '',
      ).trim();
      const finishedId = String(routing.finishedStagingWarehouseId || packagingSourceId || '').trim();
      const wipId = String(routing.productionWipWarehouseId || '').trim();
      const wasteId = String(routing.wasteWarehouseId || '').trim();
      const rawId = String(routing.rawMaterialWarehouseId || '').trim();

      // fetchCachedPageData dedupes in-flight loaders for the same key within TTL.
      const { data } = await fetchCachedPageData(
        key,
        async () => {
          const [
            allIssues,
            pendingTransfers,
            packagingBalances,
            kpi,
            allReceipts,
            suppliesAlertCount,
            wipBalances,
            finishedBalances,
            wasteBalances,
            rawBalances,
            countSessions,
            assemblableRows,
          ] = await Promise.all([
            productionIssueService.getAll().catch(() => [] as ProductionIssueOrder[]),
            transferApprovalService.getByStatus('pending').catch(() => [] as InventoryTransferRequest[]),
            loadWarehouseBalances(packagingSourceId),
            stockService.getInventoryKpiSummary().catch(() => ({
              totalLines: 0,
              totalQty: 0,
              lowStockCount: 0,
              pagesScanned: 0,
              truncated: false,
            })),
            suppliesReceiptService.getAll().catch(() => [] as SuppliesReceiptOrder[]),
            countRawMaterialWarehouseAlerts().catch(() => 0),
            loadWarehouseBalances(wipId),
            finishedId && finishedId !== packagingSourceId
              ? loadWarehouseBalances(finishedId)
              : Promise.resolve([] as StockItemBalance[]),
            loadWarehouseBalances(wasteId),
            loadWarehouseBalances(rawId),
            stockService.getCountSessions().catch(() => [] as StockCountSession[]),
            rawId
              ? assemblableCapacityService.getForWarehouse(rawId).catch(() => [])
              : Promise.resolve([]),
          ]);

          const packagingFinished = packagingBalances.filter(
            (row) => row.itemType === 'finished_good' && Number(row.quantity || 0) !== 0,
          );
          const packagingAwaitingUnits = packagingFinished.reduce(
            (s, row) => s + Number(row.quantity || 0),
            0,
          );

          // Staging and packaging can be different warehouses — sum both when distinct.
          const finishedQty =
            finishedId && packagingSourceId && finishedId === packagingSourceId
              ? sumBalanceQty(packagingBalances, { finishedOnly: true })
              : sumBalanceQty(finishedBalances, { finishedOnly: true })
                + (packagingSourceId
                  ? sumBalanceQty(packagingBalances, { finishedOnly: true })
                  : 0);
          const wipQty = sumBalanceQty(wipBalances);
          const wasteQty = sumBalanceQty(wasteBalances);

          const routingBalances = [
            ...packagingBalances,
            ...finishedBalances,
            ...wipBalances,
            ...wasteBalances,
            ...rawBalances,
          ];
          const localCounts = countNegativeAndLow(routingBalances);

          const maxAssemblableByProductId: Record<string, number> = {};
          for (const row of assemblableRows) {
            const productId = String(row.productId || '').trim();
            if (!productId) continue;
            maxAssemblableByProductId[productId] = Math.max(
              0,
              Number(row.maxAssemblable || 0),
            );
          }

          return {
            issues: allIssues,
            pendingTransfers,
            packagingAwaitingUnits,
            packagingSkuCount: packagingFinished.length,
            lowStockCount: Math.max(Number(kpi.lowStockCount || 0), localCounts.lowCount),
            negativeCount: localCounts.negativeCount,
            suppliesAlertCount: Number(suppliesAlertCount || 0),
            wipQty,
            finishedQty,

            wasteQty,
            receipts: allReceipts,
            countSessions,
            maxAssemblableByProductId,
            assemblableConfigured: Boolean(rawId),
          } satisfies RawSnapshot;
        },
        { force, maxAgeMs: OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS },
      );
      setRaw(data);
    } finally {
      setLoading(false);
    }
  }, [
    routing.packagingSourceWarehouseId,
    routing.finishedStagingWarehouseId,
    routing.productionWipWarehouseId,
    routing.wasteWarehouseId,
    routing.rawMaterialWarehouseId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  const snapshot = useMemo((): OperationalDecisionSnapshot => {
    if (!raw) return EMPTY;

    const issues = summarizeProductionIssuesForDecision(raw.issues);
    const transfers = summarizePendingTransfersForDecision(raw.pendingTransfers);
    const packaging = summarizePackagingQueue({
      awaitingUnits: raw.packagingAwaitingUnits,
      skuCount: raw.packagingSkuCount,
      pendingPackagingTransfers: transfers.pendingPackaging,
      pendingHandover: transfers.pendingHandover,
      handoverRemainingUnits: raw.pendingTransfers
        .filter((t) => t.status === 'pending' && (t.requestType || '') === 'production_handover')
        .reduce((sum, t) => sum + Number(t.remainingQuantity ?? t.lines?.[0]?.quantity ?? 0), 0),
      sourceWarehouseId: routing.packagingSourceWarehouseId || routing.finishedStagingWarehouseId,
      targetWarehouseId: routing.packagingTargetWarehouseId || routing.finalProductWarehouseId,
    });
    const receipts = summarizeReceiptsForDecision(raw.receipts);
    const stockCounts = summarizeStockCountSessions(raw.countSessions);

    const planActuals = buildPlanActuals(productionPlans, planReports);
    const activeForVolume = planActuals.filter(
      (p) => p.status === 'in_progress' || p.status === 'completed' || p.status === 'planned',
    );
    const planDelayDays = Math.max(1, Number(options?.planDelayDays || 1));
    const behindScheduleCount = planActuals.filter((p) =>
      isPlanBehindSchedule(p, { minElapsedDays: planDelayDays, gapPercent: 20 }),
    ).length;

    const dailyFinishedDemand = productionPlans
      .filter((p) => p.status === 'in_progress' || p.status === 'planned')
      .reduce((sum, p) => sum + Math.max(0, Number(p.avgDailyTarget || 0)), 0);

    const inventory = summarizeInventoryRisk({
      lowStockCount: raw.lowStockCount,
      negativeCount: raw.negativeCount,
      suppliesAlertCount: raw.suppliesAlertCount,
      wipQty: raw.wipQty,
      finishedQty: raw.finishedQty,
      wasteQty: raw.wasteQty,
      dailyFinishedDemand,
    });

    const materials = summarizeMaterialReadiness({
      plans: productionPlans,
      followUps: productionPlanFollowUps as ProductionPlanFollowUp[],
      maxAssemblableByProductId: raw.assemblableConfigured
        ? raw.maxAssemblableByProductId
        : undefined,
    });

    return {
      issues,
      transfers,
      packaging,
      inventory,
      receipts,
      stockCounts,
      materials,
      planVolumeAchievement: volumeWeightedPlanAchievement(activeForVolume),
      scheduleAdherence: averageScheduleAdherence(
        planActuals.filter((p) => p.status === 'in_progress' || p.status === 'planned'),
      ),
      behindScheduleCount,
      loadedAt: Date.now(),
    };
  }, [
    raw,
    productionPlans,
    planReports,
    productionPlanFollowUps,
    routing.packagingSourceWarehouseId,
    routing.finishedStagingWarehouseId,
    routing.packagingTargetWarehouseId,
    routing.finalProductWarehouseId,
    options?.planDelayDays,
  ]);

  return { snapshot, loading, refresh };
}
