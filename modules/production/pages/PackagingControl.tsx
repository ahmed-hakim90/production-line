import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';
import { sourceModuleLabel } from '../../inventory/lib/stockLabels';
import { stockService } from '../../inventory/services/stockService';
import { warehouseService } from '../../inventory/services/warehouseService';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import { productionHandoverService } from '../../inventory/services/productionHandoverService';
import {
  assertOperationPathEnabled,
  INVENTORY_HANDOVER_RECEIPT_PATHS,
  INVENTORY_OPERATION_KEYS,
} from '../../system/lib/operationPathSettings';
import type {
  InventoryTransferRequest,
  StockItemBalance,
  StockTransaction,
  Warehouse,
} from '../../inventory/types';

type PackagingControlPageData = {
  warehouses: Warehouse[];
  stagingBalances: StockItemBalance[];
  wipBalances: StockItemBalance[];
  transactions: StockTransaction[];
  pendingPackaging: number;
  pendingHandovers: InventoryTransferRequest[];
};

/**
 * Production packaging hub:
 * WIP (تحت التسليم) → packaging supervisor receipt → staging (بانتظار التغليف) → final.
 */
export const PackagingControl: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const uid = useAppStore((s) => s.uid);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);

  const wipWarehouseId = String(routing.productionWipWarehouseId || '').trim();
  const sourceWarehouseId =
    String(routing.packagingSourceWarehouseId || routing.finishedStagingWarehouseId || '').trim();
  const targetWarehouseId =
    String(routing.packagingTargetWarehouseId || routing.finalProductWarehouseId || '').trim();

  const CACHE_KEY = `production:packaging-control:v2:${wipWarehouseId}:${sourceWarehouseId}:${targetWarehouseId}`;

  const [receiptQtyById, setReceiptQtyById] = useState<Record<string, string>>({});
  const [finalReceiptById, setFinalReceiptById] = useState<Record<string, boolean>>({});
  const [varianceReasonById, setVarianceReasonById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<PackagingControlPageData>(
    CACHE_KEY,
    async () => {
      const [whs, stagingBals, wipBals, txs, pending] = await Promise.all([
        warehouseService.getAllWarehouses(),
        sourceWarehouseId ? stockService.getBalances(sourceWarehouseId) : Promise.resolve([]),
        wipWarehouseId ? stockService.getBalances(wipWarehouseId) : Promise.resolve([]),
        sourceWarehouseId
          ? stockService.getTransactions(sourceWarehouseId)
          : wipWarehouseId
            ? stockService.getTransactions(wipWarehouseId)
            : Promise.resolve([]),
        transferApprovalService.getByStatus('pending'),
      ]);
      return {
        warehouses: whs,
        stagingBalances: stagingBals.filter(
          (row) => row.itemType === 'finished_good' && Number(row.quantity || 0) !== 0,
        ),
        wipBalances: wipBals.filter(
          (row) => row.itemType === 'finished_good' && Number(row.quantity || 0) !== 0,
        ),
        transactions: txs.slice(0, 10),
        pendingPackaging: pending.filter(
          (row) =>
            (row.requestType || '') === 'packaging_transfer' &&
            (row.fromWarehouseId === sourceWarehouseId || row.toWarehouseId === targetWarehouseId),
        ).length,
        pendingHandovers: pending.filter((row) => (row.requestType || '') === 'production_handover'),
      };
    },
    { maxAgeMs: 45_000 },
  );

  const warehouses = data?.warehouses ?? [];
  const stagingBalances = data?.stagingBalances ?? [];
  const wipBalances = data?.wipBalances ?? [];
  const transactions = data?.transactions ?? [];
  const pendingPackaging = data?.pendingPackaging ?? 0;
  const pendingHandovers = data?.pendingHandovers ?? [];

  const reload = async () => {
    invalidatePageDataCache(CACHE_KEY);
    await reloadCached(true);
  };

  const sourceWarehouse = warehouses.find((w) => w.id === sourceWarehouseId) || null;
  const targetWarehouse = warehouses.find((w) => w.id === targetWarehouseId) || null;
  const wipWarehouse = warehouses.find((w) => w.id === wipWarehouseId) || null;

  const stagingTotalQty = useMemo(
    () => stagingBalances.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [stagingBalances],
  );
  const wipTotalQty = useMemo(
    () => wipBalances.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [wipBalances],
  );
  const handoverRemainingQty = useMemo(
    () => pendingHandovers.reduce((sum, row) => sum + Number(row.remainingQuantity ?? row.lines?.[0]?.quantity ?? 0), 0),
    [pendingHandovers],
  );

  const configured = Boolean(sourceWarehouseId && targetWarehouseId && sourceWarehouseId !== targetWarehouseId);
  const canConfirmHandover = can('productionHandover.approve') || can('inventory.transfers.approve');
  const actor = currentEmployee?.name || 'مستخدم';

  const confirmHandover = async (row: InventoryTransferRequest) => {
    if (!row.id) return;
    try {
      assertOperationPathEnabled(
        systemSettings,
        INVENTORY_OPERATION_KEYS.productionHandoverConfirm,
        INVENTORY_HANDOVER_RECEIPT_PATHS.packagingControl,
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'مسار استلام التغليف متوقف من الإعدادات.');
      return;
    }
    const remaining = Number(row.remainingQuantity ?? row.lines?.[0]?.quantity ?? 0);
    const reported = Number(
      row.reportedQuantity
      ?? row.lines?.[0]?.reportedQuantity
      ?? (remaining + Number(row.receivedQuantity ?? row.lines?.[0]?.receivedQuantity ?? 0)),
    );
    const expectedReceivedQuantity = Number(
      row.receivedQuantity
      ?? row.lines?.[0]?.receivedQuantity
      ?? Math.max(0, reported - remaining),
    );
    const raw = receiptQtyById[row.id];
    const qty = Number(raw != null && String(raw).trim() !== '' ? raw : remaining);
    const isFinalReceipt = finalReceiptById[row.id] === true;
    const varianceReason = String(varianceReasonById[row.id] || '').trim();
    if (!(qty > 0)) {
      toast.error('أدخل كمية استلام أكبر من صفر.');
      return;
    }
    if (qty > remaining + 0.000001) {
      toast.error(`الكمية تتجاوز المتبقي (${formatNumber(remaining)}).`);
      return;
    }
    const shortfall = Math.max(0, remaining - qty);
    if (isFinalReceipt && shortfall > 0.000001 && !varianceReason) {
      toast.error('عند الإقفال بفرق اكتب سبب الفرق المسجّل على المحوّل.');
      return;
    }
    setBusyId(row.id);
    try {
      const result = await productionHandoverService.confirmReceipt({
        handoverRequestId: row.id,
        quantity: qty,
        expectedReceivedQuantity,
        actor,
        actorUserId: uid || currentEmployee?.id || undefined,
        isFinalReceipt,
        varianceReason: isFinalReceipt ? varianceReason : undefined,
      });
      if (result.varianceQuantity > 0) {
        toast.success(
          `تم الإقفال: استلام ${formatNumber(qty)} — فرق ${formatNumber(result.varianceQuantity)} على المحوّل (${row.createdBy || '—'})`,
        );
      } else {
        toast.success(
          result.remainingQuantity > 0
            ? `تم استلام ${formatNumber(qty)} — المتبقي ${formatNumber(result.remainingQuantity)}`
            : `تم استلام الكمية بالكامل (${formatNumber(qty)})`,
        );
      }
      setReceiptQtyById((prev) => {
        const next = { ...prev };
        delete next[row.id!];
        return next;
      });
      setFinalReceiptById((prev) => {
        const next = { ...prev };
        delete next[row.id!];
        return next;
      });
      setVarianceReasonById((prev) => {
        const next = { ...prev };
        delete next[row.id!];
        return next;
      });
      await reload();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تأكيد الاستلام.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && warehouses.length === 0) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  return (
    <div className="erp-ds-clean erp-dashboard-theme space-y-6">
      <PageHeader
        title="تحكم التغليف"
        subtitle={
          configured
            ? `تحت التسليم → بانتظار التغليف («${sourceWarehouse?.name || 'بانتظار التغليف'}») → «${targetWarehouse?.name || 'منتج تام'}»`
            : 'حدّد مخازن تحت التسليم / بانتظار التغليف / المنتج التام في توجيه المخازن'
        }
        icon={<Package size={18} />}
        actions={(
          <div className="flex flex-wrap gap-2">
            <GhostButton iconName="refresh" tone="neutral" onClick={() => void reload()} disabled={loading}>
              تحديث
            </GhostButton>
            {can('reports.view') || can('reports.packaging.create') ? (
              <Link to={withTenantPath(tenantSlug, '/reports')}>
                <PrimaryButton iconName="description" tone="execute">
                  تقرير تغليف
                </PrimaryButton>
              </Link>
            ) : null}
          </div>
        )}
      />

      {!configured && (
        <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          التوجيه غير مكتمل: عيّن مخزن تحت التسليم وبانتظار التغليف والمنتج التام من الإعدادات.
          <Link className="font-bold underline ms-2" to={withTenantPath(tenantSlug, '/settings/production')}>
            فتح الإعدادات
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <KPICard label="تحت التسليم (وحدات)" value={formatNumber(wipTotalQty)} iconType="metric" color="amber" loading={loading} />
        <KPICard label="استلام معلّق" value={pendingHandovers.length} iconType="trend" color="amber" loading={loading} />
        <KPICard label="متبقي للاستلام" value={formatNumber(handoverRemainingQty)} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="بانتظار التغليف" value={formatNumber(stagingTotalQty)} iconType="metric" color="green" loading={loading} />
        <KPICard label="تحويلات تغليف معلّقة" value={pendingPackaging} iconType="trend" color="indigo" loading={loading} />
      </div>

      <div className="flex flex-wrap gap-2">
        {wipWarehouseId && can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(wipWarehouseId)}`)}>
            <GhostButton iconName="warehouse" tone="share">
              أرصدة تحت التسليم{wipWarehouse?.name ? ` (${wipWarehouse.name})` : ''}
            </GhostButton>
          </Link>
        )}
        {sourceWarehouseId && can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(sourceWarehouseId)}`)}>
            <GhostButton iconName="inventory_2" tone="share">
              أرصدة بانتظار التغليف
            </GhostButton>
          </Link>
        )}
        {targetWarehouseId && can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, `/inventory/balances?warehouseId=${encodeURIComponent(targetWarehouseId)}`)}>
            <GhostButton iconName="inventory" tone="view">
              أرصدة المنتج التام
            </GhostButton>
          </Link>
        )}
        {can('inventory.view') && (
          <Link to={withTenantPath(tenantSlug, '/inventory/transfer-approvals')}>
            <GhostButton iconName="fact_check" tone="approve">
              اعتماد التحويلات
              {pendingPackaging > 0 ? ` (${pendingPackaging})` : ''}
            </GhostButton>
          </Link>
        )}
      </div>

      <Card className="border-slate-200 shadow-none overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-800">
            طابور استلام التغليف (تحت التسليم)
          </CardTitle>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            أكّد الكمية الفعلية. الاستلام الجزئي يبقي المتبقي معلّقًا. الإقفال بفرق يسجّل النقص على المحوّل.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-start">المرجع / المنتج / المحوّل</th>
                  <th className="erp-th text-center">مبلّغ</th>
                  <th className="erp-th text-center">مستلم</th>
                  <th className="erp-th text-center">متبقي</th>
                  <th className="erp-th text-center">المستلم فعلياً</th>
                  <th className="erp-th text-center">إقفال بفرق</th>
                  <th className="erp-th text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={`hk-${i}`}>
                      <td className="px-4 py-3" colSpan={7}>
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : pendingHandovers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      لا توجد كميات بانتظار تأكيد مشرف التغليف.
                    </td>
                  </tr>
                ) : (
                  pendingHandovers.map((row) => {
                    const line = row.lines?.[0];
                    const reported = Number(row.reportedQuantity ?? line?.reportedQuantity ?? line?.quantity ?? 0);
                    const received = Number(row.receivedQuantity ?? line?.receivedQuantity ?? 0);
                    const remaining = Number(row.remainingQuantity ?? Math.max(0, reported - received));
                    const isFinal = finalReceiptById[row.id || ''] === true;
                    const typedQty = Number(
                      receiptQtyById[row.id || ''] != null && String(receiptQtyById[row.id || '']).trim() !== ''
                        ? receiptQtyById[row.id || '']
                        : remaining,
                    );
                    const projectedShortfall = Math.max(0, remaining - (Number.isFinite(typedQty) ? typedQty : 0));
                    return (
                      <tr key={row.id} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold">{row.referenceNo}</p>
                          <p className="text-sm font-medium">{line?.itemName || '—'}</p>
                          <p className="text-xs text-slate-400 font-mono">{line?.itemCode || '—'}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            المحوّل: <span className="font-semibold">{row.createdBy || '—'}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums font-bold">{formatNumber(reported)}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{formatNumber(received)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-amber-700 font-bold">{formatNumber(remaining)}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            className="w-28 rounded border px-2 py-1.5 text-sm tabular-nums text-center"
                            disabled={!canConfirmHandover || busyId === row.id}
                            placeholder={String(remaining)}
                            value={receiptQtyById[row.id || ''] ?? ''}
                            onChange={(e) =>
                              setReceiptQtyById((prev) => ({ ...prev, [row.id!]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={isFinal}
                              disabled={!canConfirmHandover || busyId === row.id || remaining <= 0}
                              onChange={(e) =>
                                setFinalReceiptById((prev) => ({ ...prev, [row.id!]: e.target.checked }))
                              }
                            />
                            نهائي
                          </label>
                          {isFinal && projectedShortfall > 0.000001 ? (
                            <input
                              type="text"
                              className="mt-2 w-full min-w-[10rem] rounded border px-2 py-1.5 text-xs"
                              placeholder="سبب الفرق على المحوّل"
                              disabled={!canConfirmHandover || busyId === row.id}
                              value={varianceReasonById[row.id || ''] ?? ''}
                              onChange={(e) =>
                                setVarianceReasonById((prev) => ({ ...prev, [row.id!]: e.target.value }))
                              }
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <PrimaryButton
                            iconName="fact_check"
                            tone="approve"
                            disabled={!canConfirmHandover || busyId === row.id || remaining <= 0}
                            onClick={() => void confirmHandover(row)}
                          >
                            {busyId === row.id
                              ? 'جاري…'
                              : isFinal && projectedShortfall > 0.000001
                                ? 'إقفال بفرق'
                                : 'تأكيد الاستلام'}
                          </PrimaryButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-800">
            أرصدة بانتظار التغليف
          </CardTitle>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            كميات أكدها مشرف التغليف وجاهزة لتقرير التغليف ثم التحويل إلى منتج تام.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-start">الصنف</th>
                  <th className="erp-th text-center">الرصيد</th>
                  <th className="erp-th text-center">متاح</th>
                  <th className="erp-th text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td className="px-4 py-3" colSpan={4}>
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : stagingBalances.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      لا توجد أرصدة بانتظار التغليف في هذا المخزن.
                    </td>
                  </tr>
                ) : (
                  stagingBalances
                    .slice()
                    .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
                    .map((row) => (
                      <tr key={row.id || `${row.itemId}-${row.warehouseId}`} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[var(--color-text)]">{row.itemName}</p>
                          <p className="text-xs text-slate-400 font-mono">{row.itemCode || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold tabular-nums">
                          {formatNumber(row.quantity)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm tabular-nums">
                          {formatNumber(row.availableQty ?? row.quantity)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-amber-700">
                          بانتظار التغليف
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-800">آخر حركات المخزن</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا توجد حركات حديثة.</p>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{tx.itemName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {sourceModuleLabel(tx.sourceModule)} · {tx.movementType}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0">{formatNumber(tx.quantity)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
