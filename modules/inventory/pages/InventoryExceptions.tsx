import React, { useCallback, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { withTenantPath } from '@/lib/tenantPaths';
import { stockService } from '../services/stockService';
import { useAppStore } from '../../../store/useAppStore';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import type { StockItemBalance, StockTransaction } from '../types';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';

type ExceptionRow = {
  id: string;
  kind: 'negative' | 'low' | 'large_manual';
  title: string;
  detail: string;
  balance?: StockItemBalance;
};

const EXCEPTIONS_CACHE_KEY = 'inventory:exceptions';

export const InventoryExceptions: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const kindFilter = String(searchParams.get('kind') || '').trim();
  const { openModal } = useGlobalModalManager();
  const threshold = useAppStore(
    (s) => Number(s.systemSettings.planSettings?.inventoryExceptionManualThreshold || 500),
  );
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const scopeKey = scoped ? warehouseIds.slice().sort().join(',') : 'all';

  const {
    data: rowsData,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<ExceptionRow[]>(
    `${EXCEPTIONS_CACHE_KEY}:${threshold}:${scopeKey}`,
    async () => {
      const warehouseFetches = !scoped
        ? [undefined as string | undefined]
        : warehouseIds;
      const balanceChunks = await Promise.all(
        warehouseFetches.map((warehouseId) => stockService.getBalances(warehouseId)),
      );
      const txChunks = await Promise.all(
        warehouseFetches.map((warehouseId) => stockService.getTransactions(warehouseId)),
      );
      const balances = balanceChunks.flat();
      const transactions = txChunks.flat();
      const exceptions: ExceptionRow[] = [];

      balances.forEach((b) => {
        const qty = Number(b.quantity || 0);
        const min = Number(b.minStock || 0);
        if (qty < 0) {
          exceptions.push({
            id: `neg-${b.id}`,
            kind: 'negative',
            title: b.itemName,
            detail: `رصيد سالب: ${qty}`,
            balance: b,
          });
        } else if (min > 0 && qty <= min) {
          exceptions.push({
            id: `low-${b.id}`,
            kind: 'low',
            title: b.itemName,
            detail: `الكمية ${qty} ≤ الحد ${min}`,
            balance: b,
          });
        }
      });

      transactions
        .filter((tx) => tx.sourceModule === 'manual_movement' && Math.abs(Number(tx.quantity || 0)) >= threshold)
        .slice(0, 50)
        .forEach((tx: StockTransaction) => {
          exceptions.push({
            id: `manual-${tx.id}`,
            kind: 'large_manual',
            title: tx.itemName,
            detail: `حركة يدوية: ${tx.quantity} — ${tx.createdAt || ''}`,
          });
        });

      return exceptions;
    },
    { maxAgeMs: 45_000 },
  );

  const rows = useMemo(() => {
    const all = rowsData ?? [];
    if (kindFilter === 'low' || kindFilter === 'negative' || kindFilter === 'large_manual') {
      return all.filter((row) => row.kind === kindFilter);
    }
    return all;
  }, [rowsData, kindFilter]);

  const load = useCallback(async () => {
    invalidatePageDataCache(EXCEPTIONS_CACHE_KEY);
    await reloadCached(true);
  }, [reloadCached]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="استثناءات المخزون"
        subtitle={`أرصدة سالبة، منخفضة، وحركات يدوية ≥ ${threshold}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/alerts')}>
              <GhostButton iconName="warning_amber" tone="undo">تنبيهات المستلزمات</GhostButton>
            </Link>
            <PrimaryButton iconName="refresh" tone="neutral" onClick={() => void load()} disabled={loading}>تحديث</PrimaryButton>
          </div>
        )}
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>القائمة ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-center text-[var(--color-text-muted)] py-8">لا توجد استثناءات حالياً.</p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-border)] rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="font-bold text-sm">{row.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{row.detail}</p>
                  </div>
                  {row.balance && (
                    <PrimaryButton
                      iconName="tune"
                      tone="edit"
                      onClick={() =>
                        openModal(MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT, {
                          warehouseId: row.balance!.warehouseId,
                          itemType: row.balance!.itemType,
                          itemId: row.balance!.itemId,
                        })
                      }
                    >
                      تعديل رصيد
                    </PrimaryButton>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
