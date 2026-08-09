import React, { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { stockService } from '../services/stockService';
import { materialService } from '../../manufacturing/services/materialService';
import { materialPurchaseCostPerBaseUnit } from '../../manufacturing/types';
import { useAppStore } from '../../../store/useAppStore';
import { stockUnitCostKey } from '../lib/stockValuation';
import { classifyAbcInventory, estimateTurnover } from '../engines/inventoryAnalyticsEngine';
import { exportGenericRows } from '../../../utils/exportExcel';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { formatNumber } from '@/utils/calculations';

const ANALYTICS_CACHE_KEY = 'inventory:analytics';

type InventoryAnalyticsPageData = {
  abcRows: ReturnType<typeof classifyAbcInventory>;
  turnoverRows: ReturnType<typeof estimateTurnover>;
};

export const InventoryAnalytics: React.FC = () => {
  const rawProducts = useAppStore((s) => s._rawProducts);
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const scopeKey = scoped ? warehouseIds.slice().sort().join(',') : 'all';

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<InventoryAnalyticsPageData>(
    `${ANALYTICS_CACHE_KEY}:p${rawProducts.length}:${scopeKey}`,
    async () => {
      const warehouseFetches = !scoped
        ? [undefined as string | undefined]
        : warehouseIds;
      const [balanceChunks, txChunks, materials] = await Promise.all([
        Promise.all(warehouseFetches.map((warehouseId) => stockService.getBalances(warehouseId))),
        Promise.all(warehouseFetches.map((warehouseId) => stockService.getTransactions(warehouseId))),
        materialService.getAll(),
      ]);
      const balances = balanceChunks.flat();
      const transactions = txChunks.flat();
      const unitCostByItem = new Map<string, number>();
      rawProducts.forEach((p) => {
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
        abcRows: classifyAbcInventory(balances, unitCostByItem),
        turnoverRows: estimateTurnover(balances, transactions),
      };
    },
    { maxAgeMs: 60_000 },
  );

  const abcRows = data?.abcRows ?? [];
  const turnoverRows = data?.turnoverRows ?? [];

  const load = useCallback(async () => {
    invalidatePageDataCache(ANALYTICS_CACHE_KEY);
    await reloadCached(true);
  }, [reloadCached]);

  const abcSummary = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0 };
    abcRows.forEach((r) => {
      counts[r.abcClass] += 1;
    });
    return counts;
  }, [abcRows]);

  const exportAbc = () => {
    exportGenericRows(
      abcRows.map((r) => ({
        الصنف: r.itemName,
        المخزن: r.warehouseId,
        الكمية: r.quantity,
        القيمة: r.totalValue,
        التصنيف: r.abcClass,
        'نسبة تراكمية %': r.cumulativeSharePct,
      })),
      'inventory-abc',
      'تحليل ABC',
    );
  };

  const hero = useMemo(
    () => [
      { key: 'a', label: 'تصنيف A', value: loading ? '…' : formatNumber(abcSummary.A) },
      { key: 'b', label: 'تصنيف B', value: loading ? '…' : formatNumber(abcSummary.B) },
      { key: 'c', label: 'تصنيف C', value: loading ? '…' : formatNumber(abcSummary.C) },
    ],
    [abcSummary, loading],
  );

  return (
    <ModuleOpsPageShell
      eyebrow="تحليلات المخزون"
      rangeLabel="تصنيف ABC ودوران مبسّط من الأرصدة والحركات"
      hero={hero}
      onRefresh={() => void load()}
      refreshing={loading}
      actions={(
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={exportAbc}
          disabled={loading || abcRows.length === 0}
        >
          تصدير ABC
        </Button>
      )}
    >
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          <OpsDashPanel title="أعلى ٢٠ صنفاً (قيمة)" accent="inventory" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-right text-sm">
                <thead>
                  <tr>
                    <th className="erp-th">الصنف</th>
                    <th className="erp-th">ABC</th>
                    <th className="erp-th">القيمة</th>
                    <th className="erp-th">تراكمي %</th>
                  </tr>
                </thead>
                <tbody>
                  {abcRows.slice(0, 20).map((r) => (
                    <tr key={`${r.itemType}-${r.itemId}-${r.warehouseId}`}>
                      <td className="px-3 py-2">{r.itemName}</td>
                      <td className="px-3 py-2 font-bold">{r.abcClass}</td>
                      <td className="px-3 py-2 tabular-nums">{r.totalValue.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.cumulativeSharePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OpsDashPanel>

          <OpsDashPanel title="دوران المخزون (تقريبي)" accent="inventory" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-right text-sm">
                <thead>
                  <tr>
                    <th className="erp-th">الصنف</th>
                    <th className="erp-th">صادر</th>
                    <th className="erp-th">متوسط رصيد</th>
                    <th className="erp-th">معدل الدوران</th>
                  </tr>
                </thead>
                <tbody>
                  {turnoverRows.slice(0, 20).map((r) => (
                    <tr key={`${r.itemType}-${r.itemId}`}>
                      <td className="px-3 py-2">{r.itemName}</td>
                      <td className="px-3 py-2 tabular-nums">{r.outboundQty}</td>
                      <td className="px-3 py-2 tabular-nums">{r.avgBalanceQty}</td>
                      <td className="px-3 py-2 tabular-nums">{r.turnoverRatio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OpsDashPanel>
        </>
      )}
    </ModuleOpsPageShell>
  );
};
