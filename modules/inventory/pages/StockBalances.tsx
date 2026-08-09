import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Badge, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, Warehouse, WarehouseRole } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { WAREHOUSE_ROLE_LABELS, balanceKey, itemTypeLabel } from '../lib/stockLabels';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useAppStore } from '../../../store/useAppStore';
import {
  downloadInventoryInByCodeTemplate,
  downloadInventoryRawInByCodeTemplate,
} from '../../../utils/downloadTemplates';
import { exportHRData } from '../../../utils/exportExcel';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { Skeleton } from '@/components/ui/skeleton';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';

const PAGE_SIZE = 25;
const BALANCES_CACHE_KEY = 'inventory:stock-balances';

type StockBalancesPageData = {
  balances: StockItemBalance[];
  warehouses: Warehouse[];
  lastMovementByKey: Record<string, string>;
};

export const StockBalances: React.FC = () => {
  const navigate = useTenantNavigate();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
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

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<StockBalancesPageData>(
    BALANCES_CACHE_KEY,
    async () => {
      const [bals, whs, txs] = await Promise.all([
        stockService.getBalances(),
        warehouseService.getWarehousesForReportingFilters(),
        stockService.getTransactions(),
      ]);
      const movementMap: Record<string, string> = {};
      txs.forEach((tx) => {
        const key = balanceKey(tx.warehouseId, tx.itemType, tx.itemId);
        const prev = movementMap[key];
        if (!prev || new Date(tx.createdAt).getTime() > new Date(prev).getTime()) {
          movementMap[key] = tx.createdAt;
        }
      });
      return {
        balances: bals,
        warehouses: filterWarehouses(whs),
        lastMovementByKey: movementMap,
      };
    },
    { maxAgeMs: 45_000 },
  );

  const balances = data?.balances ?? [];
  const warehouses = data?.warehouses ?? [];
  const lastMovementByKey = data?.lastMovementByKey ?? {};

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

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );
  const warehouseRoleById = useMemo(
    () => new Map(warehouses.map((w) => [w.id || '', w.warehouseRole || 'general'])),
    [warehouses],
  );
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );

  const rows = useMemo(() => {
    const filtered = balances.filter((row) => {
      const matchesWarehouse = scoped
        ? warehouseIds.length > 0 &&
          (warehouseFilter
            ? row.warehouseId === warehouseFilter
            : warehouseIds.includes(row.warehouseId))
        : !warehouseFilter || row.warehouseId === warehouseFilter;
      const rowRole = warehouseRoleById.get(row.warehouseId) || 'general';
      const matchesRole = !roleFilter || rowRole === roleFilter;
      const matchesType = !itemTypeFilter
        || row.itemType === itemTypeFilter
        // استيراد المكونات يحفظ كـ material بعد ترحيل التصنيع — اعتبرها ضمن «مادة خام» للعرض.
        || (itemTypeFilter === 'raw_material' && row.itemType === 'material');
      const isLow = row.minStock > 0 && row.quantity <= row.minStock;
      const isOut = row.quantity <= 0;
      const isNegative = Number(row.quantity || 0) < 0;
      const matchesStatus = !statusFilter
        || (statusFilter === 'low' && isLow)
        || (statusFilter === 'out' && isOut)
        || (statusFilter === 'ok' && !isLow && !isOut);
      const matchesNegative = !negativeOnly || isNegative;
      const q = search.trim().toLowerCase();
      const matchesSearch = !q
        || row.itemName.toLowerCase().includes(q)
        || row.itemCode.toLowerCase().includes(q);
      return matchesWarehouse && matchesRole && matchesType && matchesStatus && matchesNegative && matchesSearch;
    });

    return filtered.sort((a, b) => {
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
  }, [balances, warehouseFilter, roleFilter, itemTypeFilter, statusFilter, negativeOnly, search, warehouseRoleById, scoped, warehouseIds]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, warehouseFilter, roleFilter, itemTypeFilter, statusFilter, negativeOnly]);

  const exportBalancesExcel = () => {
    if (rows.length === 0) return;
    const exportRows = rows.map((row) => {
      const isLow = row.minStock > 0 && row.quantity <= row.minStock;
      const isOut = row.quantity <= 0;
      const status = isOut ? 'نفد' : isLow ? 'منخفض' : 'متوفر';
      const unitsPerCarton = row.itemType === 'finished_good'
        ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
        : 0;
      const cartons = unitsPerCarton > 0
        ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
        : null;
      const role = warehouseRoleById.get(row.warehouseId) || 'general';
      return {
        'الصنف': row.itemName,
        'الكود': row.itemCode,
        'النوع': itemTypeLabel(row.itemType),
        'دور المخزن': WAREHOUSE_ROLE_LABELS[role as WarehouseRole] ?? role,
        'المخزن': warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
        'الرصيد': Number(row.quantity || 0),
        'المتاح': Number(row.quantity || 0),
        'الرصيد / كرتونة': cartons ?? '—',
        'الحد الأدنى': Number(row.minStock || 0),
        'الحالة': status,
      };
    });
    const date = new Date().toISOString().slice(0, 10);
    exportHRData(exportRows, 'أرصدة المخزون', `أرصدة-المخزون-${date}`);
  };

  return (
    <ModuleOpsPageShell
      eyebrow="أرصدة المخزون"
      rangeLabel="عرض الرصيد الحالي لكل صنف داخل كل مخزن"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <PageHeader
              title=""
              backAction={false}
              moreActions={[
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

      {!scoped && (stagingWarehouseId || finalWarehouseId) && (
        <div className="flex flex-wrap gap-2">
          {stagingWarehouseId && (
            <Button
              variant={warehouseFilter === stagingWarehouseId ? 'primary' : 'outline'}
              onClick={() => {
                setWarehouseFilter(stagingWarehouseId);
                setRoleFilter('finished_staging');
                setItemTypeFilter('finished_good');
              }}
            >
              تم الإنتاج (بانتظار التغليف)
            </Button>
          )}
          {finalWarehouseId && (
            <Button
              variant={warehouseFilter === finalWarehouseId ? 'primary' : 'outline'}
              onClick={() => {
                setWarehouseFilter(finalWarehouseId);
                setRoleFilter('final_product');
                setItemTypeFilter('finished_good');
              }}
            >
              منتج تام
            </Button>
          )}
          {(warehouseFilter === stagingWarehouseId || warehouseFilter === finalWarehouseId) && (
            <Button
              variant="outline"
              onClick={() => {
                setWarehouseFilter('');
                setRoleFilter('');
              }}
            >
              إلغاء الفلتر السريع
            </Button>
          )}
        </div>
      )}

      <OpsDashPanel title="قائمة الأرصدة" accent="inventory" bodyClassName="p-0">
        <SmartFilterBar
      pageId="stock-balances"
          searchPlaceholder="ابحث بالاسم أو الكود..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'warehouse',
              placeholder: 'كل المخازن',
              options: warehouses.map((warehouse) => ({ value: warehouse.id || '', label: warehouse.name })),
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
            if (key === 'status') setStatusFilter(value === 'all' ? '' : value);
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
            if (key === 'negative') setNegativeOnly(value === 'yes');
          }}
          className="mb-0 border-0 rounded-none"
        />

        <div className="erp-mobile-card-list p-2">
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`bal-m-sk-${i}`} className="h-28 w-full rounded-xl" />
          ))}
          {!loading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">لا توجد بيانات مطابقة.</p>
          )}
          {!loading && pagedRows.map((row) => {
            const isLow = row.minStock > 0 && row.quantity <= row.minStock;
            const isOut = row.quantity <= 0;
            const isNegative = Number(row.quantity || 0) < 0;
            const available = Number(row.availableQty ?? row.quantity ?? 0);
            return (
              <div
                key={`m-${row.id}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                    <p className="font-mono text-xs text-[var(--color-text-muted)]">{row.itemCode}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {warehouseNameById.get(row.warehouseId) ?? row.warehouseId}
                      {' · '}
                      {itemTypeLabel(row.itemType)}
                    </p>
                  </div>
                  {isNegative ? <Badge variant="danger">سالب</Badge>
                    : isOut ? <Badge variant="danger">نفد</Badge>
                      : isLow ? <Badge variant="warning">منخفض</Badge>
                        : <Badge variant="success">متوفر</Badge>}
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">الرصيد</dt>
                    <dd className={`text-sm font-bold tabular-nums ${isNegative ? 'text-rose-600' : ''}`}>{formatNumber(row.quantity)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">متاح</dt>
                    <dd className="text-sm font-bold tabular-nums">{formatNumber(available)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">حد أدنى</dt>
                    <dd className="text-sm font-bold tabular-nums">{formatNumber(row.minStock || 0)}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => navigate(
                      `/inventory/item-card?itemType=${encodeURIComponent(
                        row.itemType === 'raw_material' ? 'material' : row.itemType,
                      )}&itemId=${encodeURIComponent(row.itemId)}&warehouseId=${encodeURIComponent(row.warehouseId)}`,
                    )}
                  >
                    كارت
                  </Button>
                  {can('inventory.transactions.create') ? (
                    <Button
                      variant="outline"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => openModal(MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT, {
                        warehouseId: row.warehouseId,
                        itemType: row.itemType,
                        itemId: row.itemId,
                        itemName: row.itemName,
                        itemCode: row.itemCode,
                        createdBy: userDisplayName || userEmail || 'User',
                        onSaved: () => void reload(),
                      })}
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
          <table className="erp-table w-full min-w-[1100px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الصنف</th>
                <th className="erp-th">النوع</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th">دور المخزن</th>
                <th className="erp-th text-center">الرصيد</th>
                <th className="erp-th text-center">محجوز</th>
                <th className="erp-th text-center">متاح</th>
                <th className="erp-th text-center">الرصيد / كرتونة</th>
                <th className="erp-th text-center">الحد الأدنى</th>
                <th className="erp-th">آخر حركة</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`balance-skeleton-${i}`}>
                  <td className="px-4 py-3" colSpan={12}>
                    <Skeleton className="h-5 w-full rounded-md" />
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-slate-400"
                    colSpan={12}
                  >
                    لا توجد بيانات مطابقة.
                  </td>
                </tr>
              )}
              {!loading && pagedRows.map((row) => {
                const isLow = row.minStock > 0 && row.quantity <= row.minStock;
                const isOut = row.quantity <= 0;
                const isNegative = Number(row.quantity || 0) < 0;
                const reserved = Number(row.reservedQty ?? 0);
                const available = Number(row.availableQty ?? row.quantity ?? 0);
                const role = warehouseRoleById.get(row.warehouseId) || 'general';
                const lastAt = lastMovementByKey[balanceKey(row.warehouseId, row.itemType, row.itemId)];
                const unitsPerCarton = row.itemType === 'finished_good'
                  ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
                  : 0;
                const cartonBalance = unitsPerCarton > 0
                  ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
                  : null;
                return (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono">{row.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{itemTypeLabel(row.itemType)}</td>
                    <td className="px-4 py-3 text-sm">{warehouseNameById.get(row.warehouseId) ?? row.warehouseId}</td>
                    <td className="px-4 py-3 text-xs">{WAREHOUSE_ROLE_LABELS[role as WarehouseRole] ?? role}</td>
                    <td className={`px-4 py-3 text-sm text-center font-bold tabular-nums ${isNegative ? 'text-rose-600' : ''}`}>{formatNumber(row.quantity)}</td>
                    <td className="px-4 py-3 text-sm text-center tabular-nums text-slate-500">{formatNumber(reserved)}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(available)}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">
                      {cartonBalance == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cartonBalance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.minStock || 0)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {lastAt ? new Date(lastAt).toLocaleString('ar-EG') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isNegative ? <Badge variant="danger">سالب</Badge>
                        : isOut ? <Badge variant="danger">نفد</Badge>
                          : isLow ? <Badge variant="warning">منخفض</Badge>
                            : <Badge variant="success">متوفر</Badge>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-wrap items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          className="!py-1 !px-2 text-xs"
                          onClick={() => navigate(
                            `/inventory/item-card?itemType=${encodeURIComponent(
                              row.itemType === 'raw_material' ? 'material' : row.itemType,
                            )}&itemId=${encodeURIComponent(row.itemId)}&warehouseId=${encodeURIComponent(row.warehouseId)}`,
                          )}
                        >
                          كارت
                        </Button>
                        {can('inventory.transactions.create') ? (
                          <Button
                            variant="outline"
                            className="!py-1 !px-2 text-xs"
                            onClick={() => openModal(MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT, {
                              warehouseId: row.warehouseId,
                              itemType: row.itemType,
                              itemId: row.itemId,
                              itemName: row.itemName,
                              itemCode: row.itemCode,
                              createdBy: userDisplayName || userEmail || 'User',
                              onSaved: () => void reload(),
                            })}
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
    </ModuleOpsPageShell>
  );
};




