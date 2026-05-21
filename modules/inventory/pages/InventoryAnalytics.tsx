import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { PrimaryButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { stockService } from '../services/stockService';
import { materialService } from '../../manufacturing/services/materialService';
import { materialPurchaseCostPerBaseUnit } from '../../manufacturing/types';
import { useAppStore } from '../../../store/useAppStore';
import { stockUnitCostKey } from '../lib/stockValuation';
import { classifyAbcInventory, estimateTurnover } from '../engines/inventoryAnalyticsEngine';
import { exportGenericRows } from '../../../utils/exportExcel';

export const InventoryAnalytics: React.FC = () => {
  const rawProducts = useAppStore((s) => s._rawProducts);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [balances, transactions, materials] = await Promise.all([
        stockService.getBalances(),
        stockService.getTransactions(),
        materialService.getAll(),
      ]);
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
      setAbcRows(classifyAbcInventory(balances, unitCostByItem));
      setTurnoverRows(estimateTurnover(balances, transactions));
    } finally {
      setLoading(false);
    }
  }, [rawProducts]);

  const [abcRows, setAbcRows] = useState<ReturnType<typeof classifyAbcInventory>>([]);
  const [turnoverRows, setTurnoverRows] = useState<ReturnType<typeof estimateTurnover>>([]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحليلات المخزون"
        subtitle="تصنيف ABC ودوران مبسّط من الأرصدة والحركات"
        actions={
          <>
            <PrimaryButton onClick={() => void load()} disabled={loading}>تحديث</PrimaryButton>
            <PrimaryButton onClick={exportAbc} disabled={loading || abcRows.length === 0}>تصدير ABC</PrimaryButton>
          </>
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Card><CardContent className="py-4 font-bold">A: {abcSummary.A}</CardContent></Card>
            <Card><CardContent className="py-4 font-bold">B: {abcSummary.B}</CardContent></Card>
            <Card><CardContent className="py-4 font-bold">C: {abcSummary.C}</CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>أعلى ٢٠ صنفاً (قيمة)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>دوران المخزون (تقريبي)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
