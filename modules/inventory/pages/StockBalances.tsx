import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { withTenantPath } from '@/lib/tenantPaths';
import { cn } from '@/lib/utils';
import { Badge, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, Warehouse, WarehouseRole } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { WAREHOUSE_ROLE_LABELS, itemTypeLabel } from '../lib/stockLabels';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useAppStore } from '../../../store/useAppStore';
import {
  downloadInventoryInByCodeTemplate,
  downloadInventoryRawInByCodeTemplate,
} from '../../../utils/downloadTemplates';
import { exportHRData } from '../../../utils/exportExcel';
import { ModuleOpsPageShell, type ModuleOpsHeroKpi } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { OpsMoreActionsMenu } from '@/modules/dashboards/components/OpsMoreActionsMenu';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import {
  resolveInventoryRoutingV1,
  resolveWarehouseRoleFromRouting,
} from '../lib/inventoryRoutingResolver';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { useWarehouseCountSheetPrint } from '../hooks/useWarehouseCountSheetPrint';
import { ImportItemLocationsModal } from '../components/ImportItemLocationsModal';
import { WarehouseCountSheetPrintModal } from '../components/WarehouseCountSheetPrintModal';

const PAGE_SIZE = 25;
const BALANCES_CACHE_KEY = 'inventory:stock-balances';
const TABLE_COL_SPAN = 7;

type StockBalancesPageData = {
  balances: StockItemBalance[];
  warehouses: Warehouse[];
};

type BalanceStatus = 'ok' | 'low' | 'out' | 'negative';

const STATUS_SORT_RANK: Record<BalanceStatus, number> = {
  negative: 0,
  out: 1,
  low: 2,
  ok: 3,
};

function resolveBalanceStatus(row: StockItemBalance): BalanceStatus {
  const qty = Number(row.quantity || 0);
  if (qty < 0) return 'negative';
  if (qty <= 0) return 'out';
  if (row.minStock > 0 && qty <= row.minStock) return 'low';
  return 'ok';
}

function rowLastMovementAt(row: StockItemBalance): string | undefined {
  const last = String(row.lastMovementAt || '').trim();
  if (last) return last;
  const updated = String(row.updatedAt || '').trim();
  return updated || undefined;
}

function formatCompactMovementAt(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  if (diffMs >= 0) {
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} د`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} س`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `منذ ${days} يوم`;
  }
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function normalizeArabicLabel(value: string): string {
  return value
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Avoid "تم الانتاج · تم الإنتاج — تحت التسليم" style duplication. */
function warehouseRoleSecondary(warehouseName: string, role: WarehouseRole): string | null {
  const roleLabel = WAREHOUSE_ROLE_LABELS[role] ?? role;
  const nameNorm = normalizeArabicLabel(warehouseName);
  const roleNorm = normalizeArabicLabel(roleLabel);
  if (!roleNorm || nameNorm === roleNorm) return null;
  if (nameNorm.includes(roleNorm) || roleNorm.includes(nameNorm)) return null;
  return roleLabel;
}

function MinStockBar({
  quantity,
  minStock,
  status,
  compact = false,
}: {
  quantity: number;
  minStock: number;
  status: BalanceStatus;
  compact?: boolean;
}) {
  if (!(minStock > 0)) {
    return (
      <span className="text-sm tabular-nums text-[var(--color-text-muted)]" aria-label="بدون حد أدنى">
        —
      </span>
    );
  }
  const capped = Math.max(0, quantity);
  const pct = Math.min(100, Math.round((capped / Math.max(minStock, capped, 1)) * 100));
  const barColor =
    status === 'negative' || status === 'out'
      ? 'bg-[rgb(var(--color-danger))]'
      : status === 'low'
        ? 'bg-[rgb(var(--color-warning))]'
        : 'bg-[rgb(var(--color-success))]';
  return (
    <div className={cn(compact ? 'min-w-[56px]' : 'min-w-[72px]')}>
      <p className="text-center text-sm font-bold tabular-nums text-[var(--color-text)]">
        {formatNumber(minStock)}
      </p>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="نسبة الرصيد مقابل الحد الأدنى"
      >
        <div className={cn('h-full rounded-full transition-[width]', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BalanceStatus }) {
  if (status === 'negative') return <Badge variant="danger">سالب</Badge>;
  if (status === 'out') return <Badge variant="danger">نفد</Badge>;
  if (status === 'low') return <Badge variant="warning">منخفض</Badge>;
  return <Badge variant="success">متوفر</Badge>;
}

function rowToneClass(status: BalanceStatus): string {
  if (status === 'negative' || status === 'out') {
    return 'bg-[rgb(var(--color-danger)/0.06)] border-s-2 border-s-[rgb(var(--color-danger))]';
  }
  if (status === 'low') {
    return 'bg-[rgb(var(--color-warning)/0.06)] border-s-2 border-s-[rgb(var(--color-warning))]';
  }
  return '';
}

export const StockBalances: React.FC = () => {
  const navigate = useTenantNavigate();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const { printWarehouseCount, printing } = useWarehouseCountSheetPrint();
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    routingConfigured,
    warehouseSelectLocked,
    filterWarehouses,
    resolveScopedWarehouseId,
    settingsPath,
  } = useMaterialsWarehouseScope();
  const rawProducts = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const stagingWarehouseId = String(routing.finishedStagingWarehouseId || '').trim();
  const wipWarehouseId = String(routing.productionWipWarehouseId || '').trim();
  const finalWarehouseId = String(routing.finalProductWarehouseId || '').trim();
  const [warehouseFilter, setWarehouseFilter] = useState(
    () => searchParams.get('warehouseId') || scopedWarehouseId || '',
  );
  const [roleFilter, setRoleFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [printPickerOpen, setPrintPickerOpen] = useState(false);
  const [printPickerWarehouseId, setPrintPickerWarehouseId] = useState('');
  const [locationImportOpen, setLocationImportOpen] = useState(false);

  const {
    data,
    loading,
    error: loadError,
    reload: reloadCached,
  } = useCachedPageLoad<StockBalancesPageData>(
    BALANCES_CACHE_KEY,
    async () => {
      // Last-movement timestamps live on stock_items. Do not list stock_transactions
      // here — an unfiltered ledger query can permission-deny and blank the page.
      const [balsResult, whsResult] = await Promise.allSettled([
        stockService.getBalances(),
        warehouseService.getWarehousesForReportingFilters(),
      ]);
      if (balsResult.status === 'rejected') {
        throw balsResult.reason;
      }
      return {
        balances: balsResult.value,
        warehouses: filterWarehouses(whsResult.status === 'fulfilled' ? whsResult.value : []),
      };
    },
    { maxAgeMs: 45_000 },
  );

  const balances = data?.balances ?? [];
  const warehouses = data?.warehouses ?? [];

  const reload = async () => {
    invalidatePageDataCache(BALANCES_CACHE_KEY);
    await reloadCached(true);
  };

  useEffect(() => {
    const queryWarehouseId = searchParams.get('warehouseId') || '';
    setWarehouseFilter((prev) =>
      resolveScopedWarehouseId(prev, [queryWarehouseId, scopedWarehouseId]),
    );
  }, [scoped, warehouseIds.join('|'), scopedWarehouseId, searchParams, resolveScopedWarehouseId]);

  useEffect(() => {
    const queryItemType = searchParams.get('itemType') || '';
    if (queryItemType === 'raw_material' || queryItemType === 'finished_good' || queryItemType === 'material') {
      setItemTypeFilter(queryItemType);
    }
  }, [searchParams]);

  const warehouseNameById = useMemo(() => {
    const map = new Map(warehouses.map((w) => [w.id || '', w.name]));
    if (stagingWarehouseId && !map.has(stagingWarehouseId)) {
      map.set(stagingWarehouseId, 'بانتظار التغليف');
    }
    if (wipWarehouseId && !map.has(wipWarehouseId)) {
      map.set(wipWarehouseId, 'تحت التسليم');
    }
    if (finalWarehouseId && !map.has(finalWarehouseId)) {
      map.set(finalWarehouseId, 'منتج تام');
    }
    return map;
  }, [warehouses, stagingWarehouseId, wipWarehouseId, finalWarehouseId]);
  const warehouseFilterOptions = useMemo(() => {
    const options = warehouses
      .filter((warehouse) => warehouse.id)
      .map((warehouse) => ({ value: warehouse.id || '', label: warehouse.name }));
    const ensure = (id: string, label: string) => {
      if (!id || options.some((option) => option.value === id)) return;
      options.unshift({ value: id, label: warehouseNameById.get(id) || label });
    };
    ensure(stagingWarehouseId, 'بانتظار التغليف');
    ensure(wipWarehouseId, 'تحت التسليم');
    ensure(finalWarehouseId, 'منتج تام');
    return options;
  }, [warehouses, warehouseNameById, stagingWarehouseId, wipWarehouseId, finalWarehouseId]);
  const resolveRowRole = (warehouseId: string): WarehouseRole =>
    resolveWarehouseRoleFromRouting(
      warehouseId,
      routing,
      warehouses.find((w) => w.id === warehouseId)?.warehouseRole,
    );

  const resolvedPrintWarehouseId = warehouseFilter || (scoped && warehouseIds.length === 1 ? warehouseIds[0] : '');

  const openPrintCount = useCallback(() => {
    setPrintPickerWarehouseId(resolvedPrintWarehouseId || warehouseFilterOptions[0]?.value || '');
    setPrintPickerOpen(true);
  }, [resolvedPrintWarehouseId, warehouseFilterOptions]);
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );
  const isStagingQuickFilter =
    Boolean(stagingWarehouseId)
    && warehouseFilter === stagingWarehouseId
    && itemTypeFilter === 'finished_good';
  const isFinalQuickFilter =
    Boolean(finalWarehouseId)
    && warehouseFilter === finalWarehouseId
    && itemTypeFilter === 'finished_good';

  /** Contextual rows (warehouse / role / type / search) before status & negative filters — for KPI strip. */
  const contextRows = useMemo(() => {
    return balances.filter((row) => {
      const matchesWarehouse = scoped
        ? warehouseIds.length > 0 &&
          (warehouseFilter
            ? row.warehouseId === warehouseFilter
            : warehouseIds.includes(row.warehouseId))
        : !warehouseFilter || row.warehouseId === warehouseFilter;
      const rowRole = resolveRowRole(row.warehouseId);
      const matchesRole = !roleFilter || rowRole === roleFilter;
      const matchesType = !itemTypeFilter
        || row.itemType === itemTypeFilter
        // استيراد المكونات يحفظ كـ material بعد ترحيل التصنيع — اعتبرها ضمن «مادة خام» للعرض.
        || (itemTypeFilter === 'raw_material' && row.itemType === 'material');
      const q = search.trim().toLowerCase();
      const matchesSearch = !q
        || row.itemName.toLowerCase().includes(q)
        || row.itemCode.toLowerCase().includes(q);
      return matchesWarehouse && matchesRole && matchesType && matchesSearch;
    });
  }, [balances, warehouseFilter, roleFilter, itemTypeFilter, search, scoped, warehouseIds, routing, warehouses]);

  const statusSummary = useMemo(() => {
    let ok = 0;
    let low = 0;
    let out = 0;
    let negative = 0;
    for (const row of contextRows) {
      const status = resolveBalanceStatus(row);
      if (status === 'negative') negative += 1;
      else if (status === 'out') out += 1;
      else if (status === 'low') low += 1;
      else ok += 1;
    }
    return { total: contextRows.length, ok, low, out, negative };
  }, [contextRows]);

  const rows = useMemo(() => {
    const filtered = contextRows.filter((row) => {
      const status = resolveBalanceStatus(row);
      const matchesStatus = !statusFilter
        || (statusFilter === 'low' && status === 'low')
        || (statusFilter === 'out' && status === 'out')
        || (statusFilter === 'ok' && status === 'ok');
      const matchesNegative = !negativeOnly || status === 'negative';
      return matchesStatus && matchesNegative;
    });

    return filtered.sort((a, b) => {
      const statusRank =
        STATUS_SORT_RANK[resolveBalanceStatus(a)] - STATUS_SORT_RANK[resolveBalanceStatus(b)];
      if (statusRank !== 0) return statusRank;
      const codeCmp = String(a.itemCode || '').localeCompare(String(b.itemCode || ''), 'ar', {
        numeric: true,
        sensitivity: 'base',
      });
      if (codeCmp !== 0) return codeCmp;
      return String(a.itemName || '').localeCompare(String(b.itemName || ''), 'ar', {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }, [contextRows, statusFilter, negativeOnly]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, warehouseFilter, roleFilter, itemTypeFilter, statusFilter, negativeOnly]);

  const clearStatusFilters = () => {
    setStatusFilter('');
    setNegativeOnly(false);
  };

  const hero: ModuleOpsHeroKpi[] = useMemo(() => {
    const valueOrDots = (n: number) => (loading ? '…' : formatNumber(n));
    return [
      {
        key: 'total',
        label: 'إجمالي الأسطر',
        value: valueOrDots(statusSummary.total),
        accent: true,
        active: !statusFilter && !negativeOnly,
        onClick: clearStatusFilters,
      },
      {
        key: 'ok',
        label: 'متوفر',
        value: valueOrDots(statusSummary.ok),
        toneClassName: 'ops-dash-kpi-card--tone-emerald',
        active: statusFilter === 'ok' && !negativeOnly,
        onClick: () => {
          setNegativeOnly(false);
          setStatusFilter((prev) => (prev === 'ok' ? '' : 'ok'));
        },
      },
      {
        key: 'low',
        label: 'منخفض',
        value: valueOrDots(statusSummary.low),
        toneClassName: statusSummary.low > 0 ? 'ops-dash-kpi-card--tone-amber' : undefined,
        active: statusFilter === 'low' && !negativeOnly,
        onClick: () => {
          setNegativeOnly(false);
          setStatusFilter((prev) => (prev === 'low' ? '' : 'low'));
        },
      },
      {
        key: 'out',
        label: 'نفد',
        value: valueOrDots(statusSummary.out),
        toneClassName: statusSummary.out > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined,
        active: statusFilter === 'out' && !negativeOnly,
        onClick: () => {
          setNegativeOnly(false);
          setStatusFilter((prev) => (prev === 'out' ? '' : 'out'));
        },
      },
      {
        key: 'negative',
        label: 'سالب',
        value: valueOrDots(statusSummary.negative),
        toneClassName: statusSummary.negative > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined,
        active: negativeOnly,
        onClick: () => {
          setStatusFilter('');
          setNegativeOnly((prev) => !prev);
        },
      },
    ];
  }, [loading, statusSummary, statusFilter, negativeOnly]);

  const openItemCard = (row: StockItemBalance) => {
    navigate(
      `/inventory/item-card?itemType=${encodeURIComponent(
        row.itemType === 'raw_material' ? 'material' : row.itemType,
      )}&itemId=${encodeURIComponent(row.itemId)}&warehouseId=${encodeURIComponent(row.warehouseId)}`,
    );
  };

  const openAdjustment = (row: StockItemBalance) => {
    openModal(MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT, {
      warehouseId: row.warehouseId,
      itemType: row.itemType,
      itemId: row.itemId,
      itemName: row.itemName,
      itemCode: row.itemCode,
      createdBy: userDisplayName || userEmail || 'User',
      onSaved: () => void reload(),
    });
  };

  const exportBalancesExcel = () => {
    if (rows.length === 0) return;
    const exportRows = rows.map((row) => {
      const status = resolveBalanceStatus(row);
      const statusLabel =
        status === 'negative' ? 'سالب'
          : status === 'out' ? 'نفد'
            : status === 'low' ? 'منخفض'
              : 'متوفر';
      const unitsPerCarton = row.itemType === 'finished_good'
        ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
        : 0;
      const cartons = unitsPerCarton > 0
        ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
        : null;
      const role = resolveRowRole(row.warehouseId);
      return {
        'الصنف': row.itemName,
        'الكود': row.itemCode,
        'النوع': itemTypeLabel(row.itemType),
        'دور المخزن': WAREHOUSE_ROLE_LABELS[role as WarehouseRole] ?? role,
        'المخزن': warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
        'الرصيد': Number(row.quantity || 0),
        'المتاح': Number(row.availableQty ?? row.quantity ?? 0),
        'الرصيد / كرتونة': cartons ?? '—',
        'الحد الأدنى': Number(row.minStock || 0),
        'الحالة': statusLabel,
      };
    });
    const date = new Date().toISOString().slice(0, 10);
    exportHRData(exportRows, 'أرصدة المخزون', `أرصدة-المخزون-${date}`);
  };

  const productionQuickFilters = !scoped && (stagingWarehouseId || finalWarehouseId) ? (
    <div className="flex flex-wrap items-center gap-1.5">
      {stagingWarehouseId ? (
        <button
          type="button"
          className={cn('ops-dash-period-chip', isStagingQuickFilter && 'is-active')}
          onClick={() => {
            setWarehouseFilter(stagingWarehouseId);
            setRoleFilter('');
            setItemTypeFilter('finished_good');
          }}
        >
          تم الإنتاج (بانتظار التغليف)
        </button>
      ) : null}
      {finalWarehouseId ? (
        <button
          type="button"
          className={cn('ops-dash-period-chip', isFinalQuickFilter && 'is-active')}
          onClick={() => {
            setWarehouseFilter(finalWarehouseId);
            setRoleFilter('');
            setItemTypeFilter('finished_good');
          }}
        >
          منتج تام
        </button>
      ) : null}
      {(isStagingQuickFilter || isFinalQuickFilter) ? (
        <button
          type="button"
          className="ops-dash-period-chip"
          onClick={() => {
            setWarehouseFilter('');
            setRoleFilter('');
            setItemTypeFilter('');
          }}
        >
          إلغاء الفلتر السريع
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <ModuleOpsPageShell
      className="stock-balances-ops"
      eyebrow="أرصدة المخزون"
      rangeLabel="عرض الرصيد الحالي لكل صنف داخل كل مخزن"
      hero={hero}
      denseHero
      onRefresh={() => void reload()}
      refreshing={loading}
      periodExtra={productionQuickFilters}
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={printing || loading}
            onClick={openPrintCount}
          >
            {printing ? 'جاري تجهيز الجرد…' : 'طباعة الجرد'}
          </Button>
          <OpsMoreActionsMenu
            items={[
              {
                label: 'المتاح للتجميع',
                icon: 'precision_manufacturing',
                group: 'عرض',
                hidden: !can('inventory.view'),
                onClick: () => navigate('/inventory/raw-materials/control#assemblable'),
              },
              {
                label: 'تصدير الأرصدة Excel',
                icon: 'table_view',
                group: 'تصدير',
                hidden: !can('inventory.transactions.export') || rows.length === 0,
                onClick: exportBalancesExcel,
              },
              {
                label: 'تحميل قالب المنتجات النهائية',
                icon: 'file_download',
                group: 'استيراد',
                hidden: !can('inventory.transactions.create'),
                onClick: downloadInventoryInByCodeTemplate,
              },
              {
                label: 'تحميل قالب المواد الخام',
                icon: 'file_download',
                group: 'استيراد',
                hidden: !can('inventory.transactions.create'),
                onClick: downloadInventoryRawInByCodeTemplate,
              },
              {
                label: 'استيراد منتجات نهائية',
                icon: 'upload_file',
                group: 'استيراد',
                hidden: !can('inventory.transactions.create'),
                onClick: () => navigate('/inventory/movements?action=import-in-by-code&itemType=finished_good'),
              },
              {
                label: 'استيراد مواد خام',
                icon: 'upload_file',
                group: 'استيراد',
                hidden: !can('inventory.transactions.create'),
                onClick: () => navigate('/inventory/movements?action=import-in-by-code&itemType=raw_material'),
              },
              {
                label: 'رفع مواقع الأصناف',
                icon: 'upload_file',
                group: 'استيراد',
                hidden: !can('inventory.locations.manage'),
                onClick: () => setLocationImportOpen(true),
              },
            ]}
          />
        </div>
      )}
    >
      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] px-4 py-3">
          <p className="text-sm font-medium text-[rgb(var(--color-danger))]">
            تعذر تحميل الأرصدة. حدّث الصفحة أو أعد المحاولة.
          </p>
          <Button variant="outline" className="!px-3 !py-1.5 text-sm" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {isStagingQuickFilter && !loading && rows.length === 0 && (
        <p className="rounded-lg border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-4 py-3 text-sm text-[rgb(var(--color-warning))]">
          أرصدة «بانتظار التغليف» تظهر هنا بعد تأكيد مشرف التغليف للكمية الفعلية.
          تقارير الإنتاج المعلّقة تُدار من{' '}
          <Link
            className="font-bold underline"
            to={withTenantPath(tenantSlug, '/production/packaging/control')}
          >
            تحكم التغليف
          </Link>
          {wipWarehouseId ? (
            <>
              {' '}
              أو من{' '}
              <Link
                className="font-bold underline"
                to={withTenantPath(
                  tenantSlug,
                  `/inventory/balances?warehouseId=${encodeURIComponent(wipWarehouseId)}`,
                )}
              >
                أرصدة تحت التسليم
              </Link>
            </>
          ) : null}
          .
        </p>
      )}

      <OpsDashPanel
        title="قائمة الأرصدة"
        accent="inventory"
        bodyClassName="p-0"
        loading={loading}
        loadingLabel="جاري تحميل الأرصدة…"
        action={(
          loading ? (
            <span className="text-xs text-[var(--color-text-muted)]">…</span>
          ) : (statusSummary.low + statusSummary.out + statusSummary.negative) > 0 ? (
            <button
              type="button"
              className="text-xs font-semibold text-[rgb(var(--color-warning))] hover:underline"
              onClick={() => {
                // Prefer the most severe active bucket for one-click triage.
                if (statusSummary.negative > 0) {
                  setStatusFilter('');
                  setNegativeOnly(true);
                } else if (statusSummary.out > 0) {
                  setNegativeOnly(false);
                  setStatusFilter('out');
                } else {
                  setNegativeOnly(false);
                  setStatusFilter('low');
                }
              }}
            >
              تنبيهات:{' '}
              {formatNumber(statusSummary.low + statusSummary.out + statusSummary.negative)}
            </button>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">لا تنبيهات رصيد</span>
          )
        )}
      >
        <SmartFilterBar
          pageId="stock-balances"
          searchPlaceholder="ابحث بالاسم أو الكود..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'warehouse',
              placeholder: 'كل المخازن',
              options: warehouseFilterOptions,
            },
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { value: 'ok', label: 'متوفر' },
                { value: 'low', label: 'منخفض' },
                { value: 'out', label: 'نفد' },
              ],
            },
            {
              key: 'role',
              placeholder: 'كل الأدوار',
              options: (Object.keys(WAREHOUSE_ROLE_LABELS) as WarehouseRole[]).map((role) => ({
                value: role,
                label: WAREHOUSE_ROLE_LABELS[role],
              })),
            },
          ]}
          quickFilterValues={{
            warehouse: warehouseFilter || 'all',
            status: statusFilter || 'all',
            role: roleFilter || 'all',
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'warehouse') {
              if (warehouseSelectLocked) return;
              if (scoped && value !== 'all' && !warehouseIds.includes(value)) return;
              setWarehouseFilter(value === 'all' ? '' : value);
            }
            if (key === 'status') {
              setNegativeOnly(false);
              setStatusFilter(value === 'all' ? '' : value);
            }
            if (key === 'role') setRoleFilter(value === 'all' ? '' : value);
          }}
          advancedFilters={[
            {
              key: 'itemType',
              label: 'النوع',
              placeholder: 'كل الأنواع',
              options: [
                { value: 'finished_good', label: 'منتج نهائي' },
                { value: 'raw_material', label: 'مادة خام / تصنيع' },
                { value: 'material', label: 'مادة تصنيع فقط' },
              ],
            },
            {
              key: 'negative',
              label: 'رصيد سالب',
              placeholder: 'الكل',
              options: [{ value: 'yes', label: 'سالب فقط' }],
            },
          ]}
          advancedFilterValues={{
            itemType: itemTypeFilter || 'all',
            negative: negativeOnly ? 'yes' : 'all',
          }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'itemType') setItemTypeFilter(value === 'all' ? '' : value);
            if (key === 'negative') {
              if (value === 'yes') setStatusFilter('');
              setNegativeOnly(value === 'yes');
            }
          }}
          className="mb-0 border-0 rounded-none"
        />

        <div className="erp-mobile-card-list space-y-2 p-2">
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`bal-m-sk-${i}`} className="h-36 w-full rounded-xl" />
          ))}
          {!loading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">لا توجد بيانات مطابقة.</p>
          )}
          {!loading && pagedRows.map((row) => {
            const status = resolveBalanceStatus(row);
            const reserved = Number(row.reservedQty ?? 0);
            const available = Number(row.availableQty ?? row.quantity ?? 0);
            const role = resolveRowRole(row.warehouseId);
            const warehouseName = warehouseNameById.get(row.warehouseId) ?? row.warehouseId;
            const roleSecondary = warehouseRoleSecondary(warehouseName, role);
            const unitsPerCarton = row.itemType === 'finished_good'
              ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
              : 0;
            const cartonBalance = unitsPerCarton > 0
              ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
              : null;
            return (
              <div
                key={`m-${row.id}`}
                className={cn(
                  'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm',
                  rowToneClass(status),
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                    <p className="font-mono text-xs text-[var(--color-text-muted)]">{row.itemCode}</p>
                    <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                      {warehouseName}
                      {roleSecondary ? ` · ${roleSecondary}` : ''}
                    </p>
                    <span className="mt-1 inline-block rounded-md bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                      {itemTypeLabel(row.itemType)}
                    </span>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--color-text-muted)]">الرصيد</p>
                    <p
                      className={cn(
                        'text-xl font-bold tabular-nums leading-tight',
                        status === 'negative' || status === 'out'
                          ? 'text-[rgb(var(--color-danger))]'
                          : 'text-[var(--color-text)]',
                      )}
                    >
                      {formatNumber(row.quantity)}
                    </p>
                    {cartonBalance != null ? (
                      <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                        {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cartonBalance)} كرتونة
                      </p>
                    ) : null}
                  </div>
                  <dl className={cn('grid shrink-0 gap-3 text-center', reserved > 0 ? 'grid-cols-3' : 'grid-cols-2')}>
                    <div>
                      <dt className="text-[10px] text-[var(--color-text-muted)]">متاح</dt>
                      <dd className="text-sm font-bold tabular-nums text-[var(--color-text)]">{formatNumber(available)}</dd>
                    </div>
                    {reserved > 0 ? (
                      <div>
                        <dt className="text-[10px] text-[var(--color-text-muted)]">محجوز</dt>
                        <dd className="text-sm tabular-nums text-[var(--color-text-muted)]">{formatNumber(reserved)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-[10px] text-[var(--color-text-muted)]">حد أدنى</dt>
                      <dd className="flex justify-center pt-0.5">
                        <MinStockBar
                          compact
                          quantity={Number(row.quantity || 0)}
                          minStock={Number(row.minStock || 0)}
                          status={status}
                        />
                      </dd>
                    </div>
                  </dl>
                </div>

                {rowLastMovementAt(row) ? (
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                    آخر حركة: {formatCompactMovementAt(rowLastMovementAt(row))}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => openItemCard(row)}
                  >
                    كارت
                  </Button>
                  {can('inventory.transactions.create') ? (
                    <Button
                      variant="outline"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => openAdjustment(row)}
                    >
                      تسوية
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="erp-desktop-table erp-table-wrap overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[780px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الصنف</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">الرصيد</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th text-center">الحد الأدنى</th>
                <th className="erp-th">آخر حركة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`balance-skeleton-${i}`}>
                  <td className="px-4 py-3" colSpan={TABLE_COL_SPAN}>
                    <Skeleton className="h-5 w-full rounded-md" />
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-[var(--color-text-muted)]"
                    colSpan={TABLE_COL_SPAN}
                  >
                    لا توجد بيانات مطابقة.
                  </td>
                </tr>
              )}
              {!loading && pagedRows.map((row) => {
                const status = resolveBalanceStatus(row);
                const reserved = Number(row.reservedQty ?? 0);
                const available = Number(row.availableQty ?? row.quantity ?? 0);
                const role = resolveRowRole(row.warehouseId);
                const warehouseName = warehouseNameById.get(row.warehouseId) ?? row.warehouseId;
                const roleSecondary = warehouseRoleSecondary(warehouseName, role);
                const lastAt = rowLastMovementAt(row);
                const unitsPerCarton = row.itemType === 'finished_good'
                  ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
                  : 0;
                const cartonBalance = unitsPerCarton > 0
                  ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
                  : null;
                return (
                  <tr
                    key={row.id}
                    className={cn('hover:bg-[var(--color-bg)]/70/40', rowToneClass(status))}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                      <p className="font-mono text-xs text-[var(--color-text-muted)]">{row.itemCode}</p>
                      <span className="mt-1 inline-block rounded-md bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                        {itemTypeLabel(row.itemType)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <p
                        className={cn(
                          'text-lg font-bold tabular-nums leading-tight',
                          status === 'negative' || status === 'out'
                            ? 'text-[rgb(var(--color-danger))]'
                            : 'text-[var(--color-text)]',
                        )}
                      >
                        {formatNumber(row.quantity)}
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums">
                        <span className="text-[var(--color-text-muted)]">متاح </span>
                        <span className="font-semibold text-[var(--color-text)]">{formatNumber(available)}</span>
                        {reserved > 0 ? (
                          <>
                            <span className="mx-1 text-[var(--color-text-muted)]">·</span>
                            <span className="text-[var(--color-text-muted)]">
                              محجوز {formatNumber(reserved)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {cartonBalance != null ? (
                        <p className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
                          {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cartonBalance)} كرتونة
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-[var(--color-text)]">{warehouseName}</p>
                      {roleSecondary ? (
                        <p className="text-xs text-[var(--color-text-muted)]">{roleSecondary}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <MinStockBar
                          quantity={Number(row.quantity || 0)}
                          minStock={Number(row.minStock || 0)}
                          status={status}
                        />
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap"
                      title={lastAt ? new Date(lastAt).toLocaleString('ar-EG') : undefined}
                    >
                      {formatCompactMovementAt(lastAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-wrap items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          className="!py-1 !px-2 text-xs"
                          onClick={() => openItemCard(row)}
                        >
                          كارت
                        </Button>
                        {can('inventory.transactions.create') ? (
                          <Button
                            variant="outline"
                            className="!py-1 !px-2 text-xs"
                            onClick={() => openAdjustment(row)}
                          >
                            تسوية
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && (
          <DataPaginationFooter
            page={page}
            totalPages={totalPages}
            totalItems={rows.length}
            onPageChange={setCurrentPage}
            itemLabel="رصيد"
          />
        )}
      </OpsDashPanel>
      <ImportItemLocationsModal
        open={locationImportOpen}
        onClose={() => setLocationImportOpen(false)}
        warehouses={warehouses}
        balances={balances}
        initialWarehouseId={warehouseFilter || (scoped && warehouseIds.length === 1 ? warehouseIds[0] : '')}
        warehouseSelectLocked={warehouseSelectLocked}
        canMoveStock={can('inventory.transactions.create')}
        onApplied={() => void reload()}
      />
      <WarehouseCountSheetPrintModal
        open={printPickerOpen}
        onClose={() => setPrintPickerOpen(false)}
        warehouses={warehouseFilterOptions}
        balances={balances}
        initialWarehouseId={printPickerWarehouseId || resolvedPrintWarehouseId}
        warehouseSelectLocked={warehouseSelectLocked}
        printing={printing}
        resolveWarehouseRole={(id) =>
          resolveWarehouseRoleFromRouting(
            id,
            routing,
            warehouses.find((row) => row.id === id)?.warehouseRole,
          )
        }
        onPrint={(input) => {
          setWarehouseFilter(input.warehouseId);
          void printWarehouseCount(input);
        }}
      />
    </ModuleOpsPageShell>
  );
};
