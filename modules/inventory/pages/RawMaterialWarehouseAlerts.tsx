import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { useAppStore } from '../../../store/useAppStore';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { usePermission } from '../../../utils/permissions';
import { useRawMaterialWarehouse } from '../hooks/useRawMaterialWarehouse';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { productionIssueService } from '../services/productionIssueService';
import { listPlanIssueAlerts } from '../services/rawMaterialWarehouseAlertsService';
import { planIssueAlertHref, planReplenishAlertHref } from '../lib/planIssueAlerts';
import type { StockItemBalance, StockTransaction } from '../types';
import { Bell } from 'lucide-react';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';

const PAGE_SIZE = 25;
const ALERTS_CACHE_PREFIX = 'inventory:raw-material-alerts';

type AlertKind =
  | 'negative'
  | 'low'
  | 'out'
  | 'pending_transfer'
  | 'pending_issue'
  | 'large_manual'
  | 'plan_issue'
  | 'plan_shortage';

type AlertRow = {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  createdAt?: string;
  balance?: StockItemBalance;
  href?: string;
  actionLabel?: string;
};

const KIND_META: Record<AlertKind, { label: string; type: 'danger' | 'warning' | 'info' | 'success' }> = {
  negative: { label: 'رصيد سالب', type: 'danger' },
  low: { label: 'رصيد منخفض', type: 'warning' },
  out: { label: 'نفاد', type: 'danger' },
  pending_transfer: { label: 'تحويل معلّق', type: 'warning' },
  pending_issue: { label: 'صرف إنتاج معلّق', type: 'info' },
  large_manual: { label: 'حركة يدوية كبيرة', type: 'warning' },
  plan_issue: { label: 'محتاج صرف إنتاج', type: 'warning' },
  plan_shortage: { label: 'نقص مستلزمات للخطط', type: 'danger' },
};

export const RawMaterialWarehouseAlerts: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const threshold = useAppStore(
    (s) => Number(s.systemSettings.planSettings?.inventoryExceptionManualThreshold || 500),
  );
  const {
    warehouseId,
    setWarehouseId,
    warehouseName,
    configured,
    loadingWarehouse,
    allowedWarehouses,
    canSwitchWarehouse,
  } = useRawMaterialWarehouse();

  const [kindFilter, setKindFilter] = useState('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const alertsCacheKey = warehouseId
    ? `${ALERTS_CACHE_PREFIX}:${warehouseId}:${threshold}`
    : null;

  const {
    data: rowsData,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<AlertRow[]>(
    alertsCacheKey,
    async () => {
      if (!warehouseId) return [];
      const [balances, transactions, pending, issues, planAlerts] = await Promise.all([
        stockService.getBalances(warehouseId),
        stockService.getTransactions(warehouseId),
        transferApprovalService.getByStatus('pending'),
        productionIssueService.getAll(),
        listPlanIssueAlerts(warehouseId),
      ]);

      const next: AlertRow[] = [];

      balances.forEach((b) => {
        const qty = Number(b.quantity || 0);
        const min = Number(b.minStock || 0);
        if (qty < 0) {
          next.push({
            id: `neg-${b.id}`,
            kind: 'negative',
            title: b.itemName,
            detail: `رصيد سالب: ${formatNumber(qty)} (${b.itemCode})`,
            balance: b,
            createdAt: b.updatedAt,
          });
        } else if (qty <= 0 && min > 0) {
          next.push({
            id: `out-${b.id}`,
            kind: 'out',
            title: b.itemName,
            detail: `نفد الرصيد — الحد الأدنى ${formatNumber(min)} (${b.itemCode})`,
            balance: b,
            createdAt: b.updatedAt,
          });
        } else if (min > 0 && qty <= min) {
          next.push({
            id: `low-${b.id}`,
            kind: 'low',
            title: b.itemName,
            detail: `الكمية ${formatNumber(qty)} ≤ الحد ${formatNumber(min)} (${b.itemCode})`,
            balance: b,
            createdAt: b.updatedAt,
          });
        }
      });

      planAlerts.forEach((alert) => {
        if (alert.action === 'issue') {
          next.push({
            id: `plan-issue-${alert.productId}`,
            kind: 'plan_issue',
            title: alert.productName,
            detail: `محتاج صرف إنتاج للمنتج ${alert.productCode || alert.productName} — متبقي في الخطط ${formatNumber(alert.remainingQuantity)} · متاح للتجميع الآن ${formatNumber(alert.maxAssemblable)} · اصرف المتاح فقط ${formatNumber(alert.suggestedIssueQuantity)}`,
            href: planIssueAlertHref(alert, warehouseId) || undefined,
            actionLabel: 'إنشاء إذن صرف',
          });
          return;
        }
        next.push({
          id: `plan-shortage-${alert.productId}`,
          kind: 'plan_shortage',
          title: alert.productName,
          detail: `لا يمكن الصرف: قابل للتجميع 0 — متبقي في الخطط ${formatNumber(alert.remainingQuantity)}. استلم مستلزمات أو راجع المكونات الناقصة أولاً.`,
          href: planReplenishAlertHref(alert, warehouseId),
          actionLabel: 'مراجعة المكونات',
        });
      });

      pending
        .filter((row) => row.fromWarehouseId === warehouseId || row.toWarehouseId === warehouseId)
        .forEach((row) => {
          next.push({
            id: `xfer-${row.id}`,
            kind: 'pending_transfer',
            title: row.referenceNo || 'تحويل معلّق',
            detail: `${row.fromWarehouseName || row.fromWarehouseId} → ${row.toWarehouseName || row.toWarehouseId} · ${row.lines.length} بند`,
            createdAt: row.createdAt,
            href: `/inventory/transfer-approvals?warehouseId=${encodeURIComponent(warehouseId)}`,
          });
        });

      issues
        .filter(
          (row) =>
            row.sourceWarehouseId === warehouseId &&
            (row.status === 'draft' || row.status === 'submitted' || row.status === 'requested'),
        )
        .forEach((row) => {
          next.push({
            id: `issue-${row.id}`,
            kind: 'pending_issue',
            title: row.referenceNo || 'صرف إنتاج',
            detail:
              row.status === 'requested'
                ? `طلب من الإنتاج: ${row.productName} · كمية ${formatNumber(row.quantity)} · بانتظار الاعتماد`
                : `${row.productName} · كمية ${formatNumber(row.quantity)} · ${row.status === 'draft' ? 'مسودة' : 'مُرسل'}`,
            createdAt: row.createdAt,
            href:
              row.status === 'requested'
                ? `/inventory/production-issues`
                : `/inventory/production-issues?warehouseId=${encodeURIComponent(warehouseId)}`,
            actionLabel: row.status === 'requested' ? 'اعتماد الطلب' : 'فتح',
          });
        });

      transactions
        .filter(
          (tx: StockTransaction) =>
            tx.sourceModule === 'manual_movement' && Math.abs(Number(tx.quantity || 0)) >= threshold,
        )
        .slice(0, 100)
        .forEach((tx) => {
          next.push({
            id: `manual-${tx.id}`,
            kind: 'large_manual',
            title: tx.itemName,
            detail: `حركة يدوية ${tx.movementType}: ${formatNumber(tx.quantity)} — ${tx.createdAt || ''}`,
            createdAt: tx.createdAt,
            href: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          });
        });

      next.sort((a, b) => {
        if (a.kind === 'plan_shortage' && b.kind !== 'plan_shortage') return -1;
        if (b.kind === 'plan_shortage' && a.kind !== 'plan_shortage') return 1;
        if (a.kind === 'plan_issue' && b.kind !== 'plan_issue') return -1;
        if (b.kind === 'plan_issue' && a.kind !== 'plan_issue') return 1;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      return next;
    },
    { maxAgeMs: 45_000, enabled: Boolean(warehouseId) },
  );

  const rows = rowsData ?? [];

  const load = useCallback(async () => {
    if (!warehouseId) return;
    invalidatePageDataCache(ALERTS_CACHE_PREFIX);
    await reloadCached(true);
  }, [warehouseId, reloadCached]);

  useEffect(() => {
    setCurrentPage(1);
  }, [kindFilter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesKind = !kindFilter || row.kind === kindFilter;
      const matchesSearch =
        !q ||
        row.title.toLowerCase().includes(q) ||
        row.detail.toLowerCase().includes(q);
      return matchesKind && matchesSearch;
    });
  }, [rows, kindFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const map: Record<AlertKind, number> = {
      negative: 0,
      low: 0,
      out: 0,
      pending_transfer: 0,
      pending_issue: 0,
      large_manual: 0,
      plan_issue: 0,
      plan_shortage: 0,
    };
    rows.forEach((row) => {
      map[row.kind] += 1;
    });
    return map;
  }, [rows]);

  if (!loadingWarehouse && !configured) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="تنبيهات مخزن المستلزمات"
          subtitle="مخزن المستلزمات من إعدادات توجيه المخازن"
          icon={<Bell size={18} />}
        />
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              لم يُحدَّد مخزن المستلزمات بعد. عيّن «مخزن المفكك (مستلزم إنتاج)» أو «مخزن المواد الخام» من إعدادات توجيه المخزون، ثم احفظ الصفحة.
            </p>
            <Link to={withTenantPath(tenantSlug, '/settings/production')}>
              <PrimaryButton iconName="settings" tone="print">فتح إعدادات التوجيه</PrimaryButton>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="تنبيهات مخزن المستلزمات"
        subtitle={configured ? `تنبيهات تشغيلية لمخزن المستلزمات: ${warehouseName}` : 'جاري التحميل…'}
        icon={<Bell size={18} />}
        actions={(
          <div className="flex flex-wrap gap-2 items-center">
            {canSwitchWarehouse && (
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                aria-label="تبديل مخزن المستلزمات"
              >
                {allowedWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.code ? ` (${w.code})` : ''}
                  </option>
                ))}
              </select>
            )}
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/control#assemblable')}>
              <GhostButton iconName="visibility" tone="view">المتاح للتجميع</GhostButton>
            </Link>
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/control')}>
              <GhostButton iconName="dashboard" tone="view">لوحة التحكم</GhostButton>
            </Link>
            <PrimaryButton iconName="refresh" tone="neutral" onClick={() => void load()} disabled={loading}>
              تحديث
            </PrimaryButton>
          </div>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {(Object.keys(KIND_META) as AlertKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKindFilter((prev) => (prev === kind ? '' : kind))}
            className={`rounded-xl border px-3 py-3 text-right transition-colors ${
              kindFilter === kind
                ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30'
                : 'border-[var(--color-border)] bg-[var(--color-card)]'
            }`}
          >
            <p className="text-[11px] text-[var(--color-text-muted)]">{KIND_META[kind].label}</p>
            <p className="text-lg font-bold tabular-nums mt-1">{counts[kind]}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SmartFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="بحث في الصنف أو التفاصيل…"
            quickFilters={[
              {
                key: 'kind',
                placeholder: 'كل الأنواع',
                options: (Object.keys(KIND_META) as AlertKind[]).map((kind) => ({
                  value: kind,
                  label: KIND_META[kind].label,
                })),
              },
            ]}
            quickFilterValues={{ kind: kindFilter || 'all' }}
            onQuickFilterChange={(key, value) => {
              if (key === 'kind') setKindFilter(value === 'all' ? '' : value);
            }}
          />

          {loading || loadingWarehouse ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={`alert-sk-${i}`} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="erp-table w-full">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">النوع</th>
                      <th className="erp-th">العنوان</th>
                      <th className="erp-th">التفاصيل</th>
                      <th className="erp-th text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                          لا توجد تنبيهات مطابقة حالياً.
                        </td>
                      </tr>
                    ) : (
                      paged.map((row) => {
                        const meta = KIND_META[row.kind];
                        return (
                          <tr key={row.id} className="border-t border-[var(--color-border)]">
                            <td className="px-4 py-3">
                              <StatusBadge label={meta.label} type={meta.type} />
                            </td>
                            <td className="px-4 py-3 text-sm font-bold">{row.title}</td>
                            <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{row.detail}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-wrap justify-center gap-2">
                                {row.balance && can('inventory.transactions.create') && (
                                  <PrimaryButton
                                    iconName="tune"
                                    tone="edit"
                                    solid={false}
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
                                {row.href && (
                                  <Link to={withTenantPath(tenantSlug, row.href)}>
                                    {(() => {
                                      const label =
                                        row.actionLabel
                                        || (row.kind === 'plan_issue'
                                          ? 'إنشاء إذن صرف'
                                          : row.kind === 'plan_shortage'
                                            ? 'مراجعة المكونات'
                                            : 'فتح');
                                      if (label === 'إنشاء إذن صرف') {
                                        return (
                                          <GhostButton iconName="add_circle" tone="submit">
                                            {label}
                                          </GhostButton>
                                        );
                                      }
                                      if (label === 'مراجعة المكونات') {
                                        return (
                                          <GhostButton iconName="manage_search" tone="view">
                                            {label}
                                          </GhostButton>
                                        );
                                      }
                                      if (label === 'اعتماد الطلب') {
                                        return (
                                          <GhostButton iconName="check_circle" tone="approve">
                                            {label}
                                          </GhostButton>
                                        );
                                      }
                                      return (
                                        <GhostButton iconName="open_in_new" tone="view">
                                          {label}
                                        </GhostButton>
                                      );
                                    })()}
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <DataPaginationFooter
                page={page}
                totalPages={totalPages}
                totalItems={filtered.length}
                onPageChange={setCurrentPage}
                itemLabel="تنبيه"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
