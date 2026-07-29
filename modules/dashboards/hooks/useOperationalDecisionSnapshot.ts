import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import {
  fetchCachedPageData,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';
import { productionIssueService } from '../../inventory/services/productionIssueService';
import { stockService } from '../../inventory/services/stockService';
import { suppliesReceiptService } from '../../inventory/services/suppliesReceiptService';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import { countRawMaterialWarehouseAlerts } from '../../inventory/services/rawMaterialWarehouseAlertsService';
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
  volumeWeightedPlanAchievement,
  type PlanActualInput,
} from '../lib/decisionMetrics';
import type { ProductionPlan, ProductionPlanFollowUp, ProductionReport } from '../../../types';

const CACHE_KEY = 'dashboard:operational-decision-snapshot:v3';
const MAX_AGE_MS = 45_000;

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
      const key = `${plan.lineId}_${plan.productId}`;
      const reports = planReports[key] || [];
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

  const cached = peekPageDataCache<RawSnapshot>(CACHE_KEY);
  const [raw, setRaw] = useState<RawSnapshot | null>(() => cached ?? null);
  const [loading, setLoading] = useState(() => cached == null);

  const load = useCallback(async (force = false) => {
    const existing = peekPageDataCache<RawSnapshot>(CACHE_KEY);
    if (existing) {
      setRaw(existing);
      setLoading(false);
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

      const { data } = await fetchCachedPageData(
        CACHE_KEY,
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
          ]);

          const packagingFinished = packagingBalances.filter(
            (row) => row.itemType === 'finished_good' && Number(row.quantity || 0) !== 0,
          );
          const packagingAwaitingUnits = packagingFinished.reduce(
            (s, row) => s + Number(row.quantity || 0),
            0,
          );

          const finishedFromStaging =
            finishedId && finishedId === packagingSourceId
              ? packagingBalances
              : finishedBalances;
          const finishedQty = sumBalanceQty(finishedFromStaging, { finishedOnly: true });
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

          return {
            issues: allIssues,
            pendingTransfers,
            packagingAwaitingUnits,
            packagingSkuCount: packagingFinished.length,
            lowStockCount: Math.max(Number(kpi.lowStockCount || 0), localCounts.lowCount),
            negativeCount: localCounts.negativeCount,
            suppliesAlertCount: Number(suppliesAlertCount || 0),
            wipQty,
            finishedQty: Math.max(finishedQty, packagingAwaitingUnits),
            wasteQty,
            receipts: allReceipts,
            countSessions,
          } satisfies RawSnapshot;
        },
        { force, maxAgeMs: MAX_AGE_MS },
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
