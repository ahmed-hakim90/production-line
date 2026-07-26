import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

type ExceptionRow = {
  id: string;
  kind: 'negative' | 'low' | 'large_manual';
  title: string;
  detail: string;
  balance?: StockItemBalance;
};

export const InventoryExceptions: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { openModal } = useGlobalModalManager();
  const threshold = useAppStore(
    (s) => Number(s.systemSettings.planSettings?.inventoryExceptionManualThreshold || 500),
  );
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ExceptionRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [balances, transactions] = await Promise.all([
        stockService.getBalances(),
        stockService.getTransactions(),
      ]);
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

      setRows(exceptions);
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="استثناءات المخزون"
        subtitle={`أرصدة سالبة، منخفضة، وحركات يدوية ≥ ${threshold}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/alerts')}>
              <GhostButton>تنبيهات المستلزمات</GhostButton>
            </Link>
            <PrimaryButton onClick={() => void load()} disabled={loading}>تحديث</PrimaryButton>
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
