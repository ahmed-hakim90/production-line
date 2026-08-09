import { useCallback, useEffect, useMemo, useState } from 'react';
import { stockService } from '../../services/stockService';
import { transferApprovalService } from '../../services/transferApprovalService';
import { warehouseService } from '../../services/warehouseService';
import { productionIssueService } from '../../services/productionIssueService';
import { suppliesReceiptService } from '../../services/suppliesReceiptService';
import { countRawMaterialWarehouseAlerts } from '../../services/rawMaterialWarehouseAlertsService';
import { materialService } from '../../../manufacturing/services/materialService';
import { materialPurchaseCostPerBaseUnit } from '../../../manufacturing/types';
import { useAppStore } from '../../../../store/useAppStore';
import { resolveInventoryRoutingV1 } from '../../services/inventoryRoutingService';
import { estimateStockValue, stockUnitCostKey } from '../../lib/stockValuation';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../../shared/lib/pageDataCache';
import type {
  InventoryTransferRequest,
  ProductionIssueOrder,
  StockItemBalance,
  StockMovementType,
  StockSourceModule,
  StockTransaction,
  SuppliesReceiptOrder,
  TransferRequestStatus,
  Warehouse,
} from '../../types';

export type PeriodPreset = 'today' | '7d' | '30d' | 'all';
export type ReviewTab = 'movements' | 'issues' | 'receipts' | 'transfers';
export type MovementFilter = 'all' | StockMovementType;
export type SourceFilter = 'all' | StockSourceModule;
export type IssueStatusFilter = 'all' | 'pending' | 'issued';
export type ReceiptStatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'executed';
export type TransferStatusFilter = 'all' | TransferRequestStatus;

export type WarehouseHealthRow = {
  warehouseId: string;
  warehouseName: string;
  roleHint?: string;
  skuCount: number;
  totalQty: number;
  lowCount: number;
  negativeCount: number;
};

export type ExceptionPreviewRow = {
  id: string;
  kind: 'negative' | 'low' | 'large_manual';
  title: string;
  detail: string;
  warehouseName?: string;
};

const QUEUE_LIMIT = 8;
const REVIEW_LIMIT = 15;
const EXCEPTION_PREVIEW_LIMIT = 12;
const CONTROL_CORE_CACHE_PREFIX = 'inventory:control-core';
const CONTROL_TX_CACHE_PREFIX = 'inventory:control-tx';

type InventoryControlCoreData = {
  warehouses: Warehouse[];
  kpiSummary: {
    totalLines: number;
    totalQty: number;
    lowStockCount: number;
    truncated: boolean;
  };
  balances: StockItemBalance[];
  balancesTruncated: boolean;
  transfers: InventoryTransferRequest[];
  issues: ProductionIssueOrder[];
  receipts: SuppliesReceiptOrder[];
  suppliesAlertCount: number;
  stockValueSummary: {
    totalValue: number;
    valuedLines: number;
    unknownLines: number;
  };
};

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export function periodToDateRange(period: PeriodPreset): { startDate?: string; endDate?: string } {
  if (period === 'all') return {};
  const now = new Date();
  const endDate = endOfDayIso(now);
  if (period === 'today') {
    return { startDate: startOfDayIso(now), endDate };
  }
  const days = period === '7d' ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: startOfDayIso(start), endDate };
}

function touchesWarehouse(
  warehouseId: string,
  fromId?: string,
  toId?: string,
): boolean {
  if (!warehouseId) return true;
  return fromId === warehouseId || toId === warehouseId;
}

function isPendingIssue(status: ProductionIssueOrder['status']): boolean {
  return status === 'draft' || status === 'submitted';
}

function isAwaitingReceipt(status: SuppliesReceiptOrder['status']): boolean {
  return status === 'submitted' || status === 'approved';
}

export function useInventoryControlData() {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const threshold = Number(systemSettings.planSettings?.inventoryExceptionManualThreshold || 500);

  const [warehouseId, setWarehouseId] = useState('');
  const [period, setPeriod] = useState<PeriodPreset>('7d');
  const [reviewTab, setReviewTab] = useState<ReviewTab>('movements');
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [issueStatusFilter, setIssueStatusFilter] = useState<IssueStatusFilter>('pending');
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<ReceiptStatusFilter>('all');
  const [transferStatusFilter, setTransferStatusFilter] = useState<TransferStatusFilter>('pending');

  const coreCacheKey = `${CONTROL_CORE_CACHE_PREFIX}:${warehouseId || 'all'}`;
  const initialCore = peekPageDataCache<InventoryControlCoreData>(coreCacheKey);

  const [loading, setLoading] = useState(() => initialCore == null);
  const [txLoading, setTxLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => initialCore?.warehouses ?? []);
  const [balances, setBalances] = useState<StockItemBalance[]>(() => initialCore?.balances ?? []);
  const [balancesTruncated, setBalancesTruncated] = useState(() => initialCore?.balancesTruncated ?? false);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [transfers, setTransfers] = useState<InventoryTransferRequest[]>(() => initialCore?.transfers ?? []);
  const [issues, setIssues] = useState<ProductionIssueOrder[]>(() => initialCore?.issues ?? []);
  const [receipts, setReceipts] = useState<SuppliesReceiptOrder[]>(() => initialCore?.receipts ?? []);
  const [suppliesAlertCount, setSuppliesAlertCount] = useState(() => initialCore?.suppliesAlertCount ?? 0);
  const [kpiSummary, setKpiSummary] = useState(() => initialCore?.kpiSummary ?? {
    totalLines: 0,
    totalQty: 0,
    lowStockCount: 0,
    truncated: false,
  });
  const [stockValueSummary, setStockValueSummary] = useState(() => initialCore?.stockValueSummary ?? {
    totalValue: 0,
    valuedLines: 0,
    unknownLines: 0,
  });

  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const warehouseNameById = useMemo(() => {
    const map = new Map<string, string>();
    warehouses.forEach((w) => {
      if (w.id) map.set(w.id, w.name);
    });
    return map;
  }, [warehouses]);

  const applyCoreData = useCallback((data: InventoryControlCoreData) => {
    setWarehouses(data.warehouses);
    setKpiSummary(data.kpiSummary);
    setBalances(data.balances);
    setBalancesTruncated(data.balancesTruncated);
    setTransfers(data.transfers);
    setIssues(data.issues);
    setReceipts(data.receipts);
    setSuppliesAlertCount(data.suppliesAlertCount);
    setStockValueSummary(data.stockValueSummary);
  }, []);

  const loadCore = useCallback(async (force = false) => {
    const key = `${CONTROL_CORE_CACHE_PREFIX}:${warehouseId || 'all'}`;
    const cached = peekPageDataCache<InventoryControlCoreData>(key);
    if (cached) {
      applyCoreData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        key,
        async () => {
          const whFilter = warehouseId || undefined;
          const [
            whs,
            kpi,
            bals,
            pendingTransfers,
            approvedTransfers,
            rejectedTransfers,
            allIssues,
            allReceipts,
            materials,
            alertCount,
          ] = await Promise.all([
            warehouseService.getAllWarehouses(),
            stockService.getInventoryKpiSummary(whFilter),
            stockService.getBalances(whFilter),
            transferApprovalService.getByStatus('pending'),
            transferApprovalService.listPaged({ status: 'approved', limit: 50 }),
            transferApprovalService.listPaged({ status: 'rejected', limit: 30 }),
            productionIssueService.getAll(),
            suppliesReceiptService.getAll(),
            materialService.getAll(),
            warehouseId ? Promise.resolve(0) : countRawMaterialWarehouseAlerts().catch(() => 0),
          ]);

          const transferRows: InventoryTransferRequest[] = [
            ...pendingTransfers,
            ...approvedTransfers.items,
            ...rejectedTransfers.items,
          ];
          const seen = new Set<string>();
          const transfersDeduped = transferRows.filter((row) => {
            const id = row.id || `${row.referenceNo}-${row.createdAt}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });

          const unitCostByItem = new Map<string, number>();
          const finishedProducts = useAppStore.getState()._rawProducts ?? [];
          finishedProducts.forEach((p) => {
            if (!p.id) return;
            unitCostByItem.set(
              stockUnitCostKey('finished_good', p.id),
              Number((p as { unitCost?: number }).unitCost || p.chineseUnitCost || 0),
            );
          });
          materials.forEach((m) => {
            if (!m.id) return;
            const cost = materialPurchaseCostPerBaseUnit(m);
            unitCostByItem.set(stockUnitCostKey('material', m.id), cost);
            if (m.legacyRawMaterialId) {
              unitCostByItem.set(stockUnitCostKey('raw_material', m.legacyRawMaterialId), cost);
            }
          });

          return {
            warehouses: whs,
            kpiSummary: {
              totalLines: kpi.totalLines,
              totalQty: kpi.totalQty,
              lowStockCount: kpi.lowStockCount,
              truncated: kpi.truncated,
            },
            balances: bals,
            balancesTruncated: kpi.truncated,
            transfers: transfersDeduped,
            issues: allIssues,
            receipts: allReceipts,
            suppliesAlertCount: alertCount,
            stockValueSummary: estimateStockValue(bals, unitCostByItem),
          } satisfies InventoryControlCoreData;
        },
        { force, maxAgeMs: 45_000 },
      );
      applyCoreData(data);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, applyCoreData]);

  const loadTransactions = useCallback(async (force = false) => {
    const range = periodToDateRange(period);
    const key = [
      CONTROL_TX_CACHE_PREFIX,
      warehouseId || 'all',
      period,
      movementFilter,
      sourceFilter,
    ].join(':');
    const cached = peekPageDataCache<StockTransaction[]>(key);
    if (cached) {
      setTransactions(cached);
      setTxLoading(false);
    } else {
      setTxLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        key,
        async () => {
          const page = await stockService.getTransactionsPaged({
            warehouseId: warehouseId || undefined,
            limit: 40,
            movementType: movementFilter === 'all' ? undefined : movementFilter,
            sourceModule: sourceFilter === 'all' ? undefined : sourceFilter,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          return page.items;
        },
        { force, maxAgeMs: 45_000 },
      );
      setTransactions(data);
    } finally {
      setTxLoading(false);
    }
  }, [warehouseId, period, movementFilter, sourceFilter]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const refresh = useCallback(async () => {
    invalidatePageDataCache(CONTROL_CORE_CACHE_PREFIX);
    invalidatePageDataCache(CONTROL_TX_CACHE_PREFIX);
    await Promise.all([loadCore(true), loadTransactions(true)]);
  }, [loadCore, loadTransactions]);

  const filteredTransfers = useMemo(
    () =>
      transfers.filter((row) =>
        touchesWarehouse(warehouseId, row.fromWarehouseId, row.toWarehouseId),
      ),
    [transfers, warehouseId],
  );

  const filteredIssues = useMemo(
    () =>
      issues.filter((row) => !warehouseId || row.sourceWarehouseId === warehouseId),
    [issues, warehouseId],
  );

  const filteredReceipts = useMemo(
    () => receipts.filter((row) => !warehouseId || row.warehouseId === warehouseId),
    [receipts, warehouseId],
  );

  const pendingTransfers = useMemo(
    () => filteredTransfers.filter((r) => r.status === 'pending'),
    [filteredTransfers],
  );

  const pendingIssues = useMemo(
    () => filteredIssues.filter((r) => isPendingIssue(r.status)),
    [filteredIssues],
  );

  const awaitingReceipts = useMemo(
    () => filteredReceipts.filter((r) => isAwaitingReceipt(r.status)),
    [filteredReceipts],
  );

  const negativeItems = useMemo(
    () => balances.filter((row) => Number(row.quantity || 0) < 0),
    [balances],
  );

  const lowItems = useMemo(
    () => balances.filter((row) => row.minStock > 0 && Number(row.quantity || 0) <= row.minStock),
    [balances],
  );

  const wipQty = useMemo(() => {
    const wipId = routing.productionWipWarehouseId;
    if (!wipId) return 0;
    return balances
      .filter((b) => b.warehouseId === wipId)
      .reduce((s, b) => s + Number(b.quantity || 0), 0);
  }, [balances, routing.productionWipWarehouseId]);

  const wasteQty = useMemo(() => {
    const wasteId = routing.wasteWarehouseId;
    if (!wasteId) return 0;
    return balances
      .filter((b) => b.warehouseId === wasteId)
      .reduce((s, b) => s + Number(b.quantity || 0), 0);
  }, [balances, routing.wasteWarehouseId]);

  const finishedQty = useMemo(() => {
    const id = routing.finishedStagingWarehouseId;
    if (!id) return 0;
    return balances
      .filter((b) => b.warehouseId === id)
      .reduce((s, b) => s + Number(b.quantity || 0), 0);
  }, [balances, routing.finishedStagingWarehouseId]);

  const routingReady = Boolean(
    routing.productionWipWarehouseId && routing.finishedStagingWarehouseId,
  );

  const warehouseHealth = useMemo((): WarehouseHealthRow[] => {
    const byWh = new Map<string, WarehouseHealthRow>();
    warehouses.forEach((w) => {
      if (!w.id) return;
      byWh.set(w.id, {
        warehouseId: w.id,
        warehouseName: w.name,
        skuCount: 0,
        totalQty: 0,
        lowCount: 0,
        negativeCount: 0,
      });
    });

    balances.forEach((row) => {
      const id = row.warehouseId;
      if (!id) return;
      let entry = byWh.get(id);
      if (!entry) {
        entry = {
          warehouseId: id,
          warehouseName: warehouseNameById.get(id) || id,
          skuCount: 0,
          totalQty: 0,
          lowCount: 0,
          negativeCount: 0,
        };
        byWh.set(id, entry);
      }
      const qty = Number(row.quantity || 0);
      entry.skuCount += 1;
      entry.totalQty += qty;
      if (qty < 0) entry.negativeCount += 1;
      const min = Number(row.minStock || 0);
      if (min > 0 && qty <= min) entry.lowCount += 1;
    });

    const roleHint = (id: string): string | undefined => {
      if (id === routing.productionWipWarehouseId) return 'WIP';
      if (id === routing.finishedStagingWarehouseId) return 'تم الصنع';
      if (id === routing.wasteWarehouseId) return 'هالك';
      if (id === routing.rawMaterialWarehouseId) return 'مواد خام';
      if (id === routing.decomposedWarehouseId) return 'مستلزمات';
      if (id === routing.finalProductWarehouseId) return 'منتج تام';
      return undefined;
    };

    return Array.from(byWh.values())
      .map((row) => ({ ...row, roleHint: roleHint(row.warehouseId) }))
      .filter((row) => !warehouseId || row.warehouseId === warehouseId)
      .sort((a, b) => b.totalQty - a.totalQty || a.warehouseName.localeCompare(b.warehouseName, 'ar'));
  }, [warehouses, balances, warehouseNameById, routing, warehouseId]);

  const exceptionPreview = useMemo((): ExceptionPreviewRow[] => {
    const rows: ExceptionPreviewRow[] = [];
    negativeItems.slice(0, EXCEPTION_PREVIEW_LIMIT).forEach((b) => {
      rows.push({
        id: `neg-${b.id}`,
        kind: 'negative',
        title: b.itemName,
        detail: `رصيد سالب: ${b.quantity}`,
        warehouseName: warehouseNameById.get(b.warehouseId) || b.warehouseId,
      });
    });
    lowItems.slice(0, EXCEPTION_PREVIEW_LIMIT).forEach((b) => {
      if (Number(b.quantity || 0) < 0) return;
      rows.push({
        id: `low-${b.id}`,
        kind: 'low',
        title: b.itemName,
        detail: `${b.quantity} / حد ${b.minStock}`,
        warehouseName: warehouseNameById.get(b.warehouseId) || b.warehouseId,
      });
    });
    transactions
      .filter(
        (tx) =>
          tx.sourceModule === 'manual_movement' &&
          Math.abs(Number(tx.quantity || 0)) >= threshold,
      )
      .slice(0, 8)
      .forEach((tx) => {
        rows.push({
          id: `manual-${tx.id}`,
          kind: 'large_manual',
          title: tx.itemName,
          detail: `حركة يدوية: ${tx.quantity}`,
          warehouseName: tx.warehouseName || warehouseNameById.get(tx.warehouseId),
        });
      });
    return rows.slice(0, EXCEPTION_PREVIEW_LIMIT);
  }, [negativeItems, lowItems, transactions, threshold, warehouseNameById]);

  const reviewMovements = useMemo(() => transactions.slice(0, REVIEW_LIMIT), [transactions]);

  const reviewIssues = useMemo(() => {
    let rows = filteredIssues;
    if (issueStatusFilter === 'pending') rows = rows.filter((r) => isPendingIssue(r.status));
    else if (issueStatusFilter === 'issued') rows = rows.filter((r) => r.status === 'issued');
    return rows.slice(0, REVIEW_LIMIT);
  }, [filteredIssues, issueStatusFilter]);

  const reviewReceipts = useMemo(() => {
    let rows = filteredReceipts;
    if (receiptStatusFilter !== 'all') {
      rows = rows.filter((r) => r.status === receiptStatusFilter);
    }
    return rows.slice(0, REVIEW_LIMIT);
  }, [filteredReceipts, receiptStatusFilter]);

  const reviewTransfers = useMemo(() => {
    let rows = filteredTransfers;
    if (transferStatusFilter !== 'all') {
      rows = rows.filter((r) => r.status === transferStatusFilter);
    }
    return rows
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, REVIEW_LIMIT);
  }, [filteredTransfers, transferStatusFilter]);

  const movementBars = useMemo(() => {
    const counts: Record<'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT', number> = {
      IN: 0,
      OUT: 0,
      TRANSFER: 0,
      ADJUSTMENT: 0,
    };
    transactions.forEach((tx) => {
      const key = tx.movementType;
      if (key in counts) counts[key as keyof typeof counts] += 1;
    });
    return [
      { name: 'وارد', value: counts.IN },
      { name: 'منصرف', value: counts.OUT },
      { name: 'تحويل', value: counts.TRANSFER },
      { name: 'تسوية', value: counts.ADJUSTMENT },
    ];
  }, [transactions]);

  const riskBars = useMemo(
    () => [
      { name: 'أصناف تحت الحد', value: kpiSummary.lowStockCount },
      { name: 'سالب', value: negativeItems.length },
      { name: 'تموين', value: suppliesAlertCount },
      { name: 'تحويل معلّق', value: pendingTransfers.length },
      { name: 'صرف مفتوح', value: pendingIssues.length },
      { name: 'استلامات', value: awaitingReceipts.length },
    ],
    [
      kpiSummary.lowStockCount,
      negativeItems.length,
      suppliesAlertCount,
      pendingTransfers.length,
      pendingIssues.length,
      awaitingReceipts.length,
    ],
  );

  return {
    loading,
    txLoading,
    refresh,
    warehouses,
    warehouseId,
    setWarehouseId,
    period,
    setPeriod,
    reviewTab,
    setReviewTab,
    movementFilter,
    setMovementFilter,
    sourceFilter,
    setSourceFilter,
    issueStatusFilter,
    setIssueStatusFilter,
    receiptStatusFilter,
    setReceiptStatusFilter,
    transferStatusFilter,
    setTransferStatusFilter,
    kpiSummary,
    stockValueSummary,
    balancesTruncated,
    warehousesCount: warehouses.length,
    pendingTransfersCount: pendingTransfers.length,
    pendingIssuesCount: pendingIssues.length,
    awaitingReceiptsCount: awaitingReceipts.length,
    negativeCount: negativeItems.length,
    suppliesAlertCount,
    wipQty,
    wasteQty,
    finishedQty,
    routingReady,
    queueTransfers: pendingTransfers.slice(0, QUEUE_LIMIT),
    queueIssues: pendingIssues.slice(0, QUEUE_LIMIT),
    queueReceipts: awaitingReceipts.slice(0, QUEUE_LIMIT),
    reviewMovements,
    reviewIssues,
    reviewReceipts,
    reviewTransfers,
    warehouseHealth,
    exceptionPreview,
    warehouseNameById,
    movementBars,
    riskBars,
  };
}
