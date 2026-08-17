import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { sourceModuleLabel } from '../lib/stockLabels';
import { resolveWarehouseOperatorHomePath } from '../lib/warehouseOperatorHome';
import {
  filterProductCards,
  flattenProductCardsForExport,
  floorIssuePieceBalancesForProductCard,
  groupIssuedOrdersByProduct,
  type FloorIssuePieceBalance,
  type FloorProductCard,
} from '../lib/productionFloorProductCards';
import { useFloorIssuePrint } from '../hooks/useFloorIssuePrint';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import { productionIssueService } from '../services/productionIssueService';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import type { ProductionIssueOrder, StockItemBalance, StockTransaction, Warehouse } from '../types';
import { exportGenericRows } from '../../../utils/exportExcel';
import { WarehouseItemSearchPanel } from '../components/WarehouseItemSearchPanel';
import { reportService } from '../../production/services/reportService';
import type { ProductionReport } from '../../../types';

type FloorPageData = {
  warehouse: Warehouse | null;
  balances: StockItemBalance[];
  recentTx: StockTransaction[];
  issuedOrders: ProductionIssueOrder[];
  reportsByProductId: Record<string, ProductionReport[]>;
};

function FloorPieceBalanceRow({ balance }: { balance: FloorIssuePieceBalance }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
        <p className="text-[10px] font-medium text-[var(--color-text-muted)]">منصرف</p>
        <p className="text-sm font-bold tabular-nums text-[var(--color-text)]">{formatNumber(balance.issuedQty)}</p>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
        <p className="text-[10px] font-medium text-[var(--color-text-muted)]">إنتاج</p>
        <p className="text-sm font-bold tabular-nums text-[var(--color-text)]">{formatNumber(balance.producedQty)}</p>
      </div>
      <div className="rounded-lg border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.06)] px-2 py-1.5">
        <p className="text-[10px] font-medium text-[var(--color-text-muted)]">باقي</p>
        <p className="text-sm font-bold tabular-nums text-[rgb(var(--color-primary))]">{formatNumber(balance.remainingQty)}</p>
      </div>
    </div>
  );
}

const PAGE_SIZE = 12;
const PERIODS = [
  { value: 'today', label: 'اليوم' },
  { value: '7d', label: '7 أيام' },
  { value: '30d', label: '30 يوم' },
  { value: 'all', label: 'الكل' },
] as const;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export const ProductionFloorStock: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const printOrders = useFloorIssuePrint();
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const floorId = String(routing.productionFloorWarehouseId || '').trim();
  const decomposedId = String(routing.decomposedWarehouseId || '').trim();
  const { scoped, isWarehouseAllowed, warehouseId: scopedWarehouseId, isMaterialsWarehouseRole } =
    useMaterialsWarehouseScope();
  const canAccessFloor = Boolean(floorId) && (!scoped || isWarehouseAllowed(floorId));
  const blockedHomePath = withTenantPath(
    tenantSlug,
    resolveWarehouseOperatorHomePath({
      boundWarehouseId: scopedWarehouseId,
      isMaterialsWarehouseRole,
    }),
  );
  const canPrint = can('productionIssue.print');

  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [page, setPage] = useState(1);
  const [itemSearch, setItemSearch] = useState('');

  const range = useMemo(() => {
    if (period === 'all') return null;
    const end = new Date().toISOString();
    if (period === 'today') {
      return { startDate: `${getTodayDateString()}T00:00:00.000Z`, endDate: end };
    }
    if (period === '30d') return { startDate: daysAgoIso(30), endDate: end };
    return { startDate: daysAgoIso(7), endDate: end };
  }, [period]);

  const CACHE_KEY = canAccessFloor ? `inventory:production-floor:${floorId}` : null;

  const { data, loading, reload: reloadCached } = useCachedPageLoad<FloorPageData>(
    CACHE_KEY,
    async () => {
      if (!canAccessFloor || !floorId) {
        return {
          warehouse: null,
          balances: [],
          recentTx: [],
          issuedOrders: [],
          reportsByProductId: {},
        };
      }
      const [warehouses, balances, recentTx, issuedOrders] = await Promise.all([
        warehouseService.getAllWarehouses(),
        stockService.getBalances(floorId),
        stockService.getTransactionsPaged({ warehouseId: floorId, limit: 15 }),
        productionIssueService.listIssuedForTargetWarehouse(floorId),
      ]);
      const productIds = [...new Set(
        issuedOrders
          .map((order) => String(order.productId || '').trim())
          .filter(Boolean),
      )];
      const reportResults = await Promise.allSettled(
        productIds.map((productId) => reportService.getByProduct(productId)),
      );
      const reportsByProductId: Record<string, ProductionReport[]> = {};
      productIds.forEach((productId, index) => {
        const result = reportResults[index];
        reportsByProductId[productId] = result.status === 'fulfilled' ? result.value : [];
      });
      return {
        warehouse: warehouses.find((w) => w.id === floorId) || null,
        balances: balances.filter((b) => Number(b.quantity || 0) !== 0),
        recentTx: recentTx.items,
        issuedOrders,
        reportsByProductId,
      };
    },
    { maxAgeMs: 45_000 },
  );

  const reload = async () => {
    if (!CACHE_KEY) return;
    invalidatePageDataCache(CACHE_KEY);
    await reloadCached(true);
  };

  const totalQty = useMemo(
    () => (data?.balances || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [data?.balances],
  );

  const productCards = useMemo(
    () => groupIssuedOrdersByProduct({
      orders: data?.issuedOrders || [],
      floorWarehouseId: floorId,
      balances: data?.balances || [],
      range,
    }),
    [data?.issuedOrders, data?.balances, floorId, range],
  );

  const cardBalancesByProductId = useMemo(() => {
    const map = new Map<string, FloorIssuePieceBalance>();
    for (const card of productCards) {
      const { total } = floorIssuePieceBalancesForProductCard({
        card,
        reports: data?.reportsByProductId?.[card.productId] || [],
      });
      map.set(card.productId, total);
    }
    return map;
  }, [productCards, data?.reportsByProductId]);

  const filteredCards = useMemo(
    () => filterProductCards(productCards, itemSearch),
    [productCards, itemSearch],
  );
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCards = filteredCards.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const issueCount = productCards.reduce((sum, card) => sum + card.issues.length, 0);

  useEffect(() => {
    setPage(1);
  }, [itemSearch, period]);

  const printProduct = (card: FloorProductCard) => {
    if (!printOrders(
      card.issues.map((issue) => issue.order),
      `صالة-إنتاج-${card.productCode || card.productName}`,
    )) {
      toast.error('لا توجد مكونات للطباعة.');
    }
  };

  const exportIssues = () => {
    const rows = flattenProductCardsForExport(filteredCards);
    if (!rows.length) {
      toast.error('لا توجد بيانات للتصدير.');
      return;
    }
    exportGenericRows(rows, `صالة-الإنتاج-منتجات-${period}`);
    toast.success('تم تصدير كروت المنتجات.');
  };

  const floorHero = useMemo(
    () => [
      { key: 'products', label: 'منتجات في الصالة', value: productCards.length },
      { key: 'issues', label: 'أوامر صرف', value: issueCount },
      { key: 'sku', label: 'أصناف في الصالة', value: data?.balances.length || 0 },
      { key: 'qty', label: 'إجمالي الرصيد', value: formatNumber(totalQty) },
    ],
    [productCards.length, issueCount, data?.balances.length, totalQty],
  );

  if (!can('inventory.view')) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>;
  }

  if (scoped && !canAccessFloor) {
    return <Navigate to={blockedHomePath} replace />;
  }

  if (loading && !data) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="مخزون صالة الإنتاج"
      rangeLabel={
        floorId
          ? `كارت لكل منتج مصروف إلى «${data?.warehouse?.name || 'صالة الإنتاج'}» — كل صرف بكميته بدون تجميع`
          : 'حدّد مخزن صالة الإنتاج في توجيه المخازن'
      }
      hero={floorHero}
      periods={[...PERIODS]}
      activePeriod={period}
      onPeriodChange={(value) => {
        setPeriod(value as typeof period);
        setPage(1);
      }}
      onRefresh={() => void reload()}
      refreshing={loading}
      actions={(
        <PrimaryButton iconName="download" tone="share" onClick={exportIssues} disabled={!filteredCards.length}>
          تصدير الكروت
        </PrimaryButton>
      )}
    >
      {!floorId && (
        <p className="text-sm font-medium text-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)] rounded-lg px-4 py-3">
          عيّن «مخزن صالة الإنتاج» من إعدادات توجيه المخزون.
          <Link className="font-bold underline ms-2" to={withTenantPath(tenantSlug, '/settings/production')}>
            فتح الإعدادات
          </Link>
        </p>
      )}

      {floorId ? (
        <WarehouseItemSearchPanel
          pageId={`production-floor-items:${floorId}`}
          warehouseId={floorId}
          balances={data?.balances || []}
          loading={loading && !data}
          title="بحث صنف في صالة الإنتاج"
        />
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        {floorId && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(floorId)}`)}>
            <GhostButton iconName="inventory_2" tone="share">أرصدة الصالة</GhostButton>
          </Link>
        )}
        {decomposedId && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(decomposedId)}`)}>
            <GhostButton iconName="warehouse" tone="view">أرصدة المفكك</GhostButton>
          </Link>
        )}
        {can('inventory.transactions.create') && (
          <Link to={withTenantPath(tenantSlug, '/quick-inventory-transfer')}>
            <GhostButton iconName="swap_horiz" tone="edit">تحويل / مرتجع</GhostButton>
          </Link>
        )}
        {can('inventory.counts.manage') && (
          <Link to={withTenantPath(tenantSlug, '/inventory/counts')}>
            <GhostButton iconName="checklist" tone="approve">جرد / تسوية</GhostButton>
          </Link>
        )}
      </div>

      <OpsDashPanel title="كروت المنتجات المصروفة للصالة" accent="inventory" bodyClassName="p-0">
        <SmartFilterBar
          pageId="production-floor-products"
          searchPlaceholder="ابحث بالمنتج أو المكون أو رقم الصرف..."
          searchValue={itemSearch}
          onSearchChange={setItemSearch}
        />
        <div className="space-y-3 p-3">
          {pagedCards.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-[var(--color-text-muted)]">
              لا توجد أوامر صرف مطابقة في الفترة المحددة.
            </p>
          ) : (
            pagedCards.map((card) => {
              const single = card.issues.length === 1;
              const pieceBalance = cardBalancesByProductId.get(card.productId)
                || { issuedQty: 0, producedQty: 0, remainingQty: 0 };
              const detailPath = withTenantPath(
                tenantSlug,
                `/production/floor/${encodeURIComponent(card.productId)}`,
              );
              return (
                <article
                  key={card.productId}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]"
                >
                  <div className="flex flex-wrap items-start gap-2 p-3 sm:p-4">
                    <Link to={detailPath} className="min-w-0 flex-1 text-start">
                      <p className="text-base font-bold text-[var(--color-text)]">{card.productName}</p>
                      <p className="text-xs font-mono text-[var(--color-text-muted)]">{card.productCode || '—'}</p>
                      {single ? (
                        <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
                          {card.issues[0].summaryAr}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                          {card.issues.length} أوامر صرف — افتح التفاصيل لكل صرف بكميته
                        </p>
                      )}
                      <FloorPieceBalanceRow balance={pieceBalance} />
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {canPrint && (
                        <GhostButton iconName="print" tone="print" onClick={() => printProduct(card)}>
                          طباعة المكونات
                        </GhostButton>
                      )}
                      <Link to={detailPath}>
                        <GhostButton iconName="open_in_new" tone="view">فتح التفاصيل</GhostButton>
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filteredCards.length}
          onPageChange={setPage}
          itemLabel="منتج"
        />
      </OpsDashPanel>

      <OpsDashPanel title="آخر الحركات" accent="inventory">
        {(data?.recentTx || []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد حركات.</p>
        ) : (
          (data?.recentTx || []).map((tx) => (
            <div key={tx.id} className="flex justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{tx.itemName}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {sourceModuleLabel(tx.sourceModule)} · {tx.movementType}
                  {tx.transferDirection ? `/${tx.transferDirection}` : ''}
                </p>
              </div>
              <p className="text-sm font-bold tabular-nums">{formatNumber(tx.quantity)}</p>
            </div>
          ))
        )}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
