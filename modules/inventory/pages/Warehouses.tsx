import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { warehouseService } from '../services/warehouseService';
import type { Warehouse, WarehouseRole } from '../types';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { withTenantPath } from '@/lib/tenantPaths';

const ROLE_LABELS: Record<WarehouseRole, string> = {
  general: 'عام',
  raw_material: 'مواد خام',
  decomposed: 'مفكك',
  production_floor: 'صالة الإنتاج',
  production_wip: 'تحت التسليم',
  finished_staging: 'بانتظار التغليف',
  final_product: 'منتج تام',
  packaging: 'تغليف',
  waste: 'هالك',
  spare_parts_central: 'قطع غيار (مركزي)',
  maintenance_center: 'مخزن مركز صيانة',
  repair_customer_custody: 'عهدة أجهزة العملاء',
  repair_unrepairable: 'غير قابل للإصلاح',
};
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '../../../store/useAppStore';
import { resolveInventoryRoutingV1 } from '../services/inventoryRoutingService';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { repairCenterWarehouseMenuPath } from '../../repair/lib/repairCenterWarehouseMenu';
import { repairBranchService } from '../../repair/services/repairBranchService';
import type { RepairBranch } from '../../repair/types';

const DELETE_CONFIRM = (name: string) =>
  `سيتم حذف المخزن «${name}» وجميع البيانات المرتبطة به نهائيًا:\n`
  + 'حركات المخزون، الأرصدة، طلبات التحويل، وجلسات الجرد لهذا المخزن.\n'
  + 'لا يمكن التراجع عن هذه العملية.\n\n'
  + 'هل تريد المتابعة؟';

const WAREHOUSES_CACHE_KEY = 'inventory:warehouses';
const PAGE_SIZE = 25;

function buildWarehouseBranchMap(branches: RepairBranch[]): Map<string, { branchId: string; branchName: string }> {
  const map = new Map<string, { branchId: string; branchName: string }>();
  for (const branch of branches) {
    const branchId = String(branch.id || '').trim();
    if (!branchId) continue;
    const meta = { branchId, branchName: branch.name || branchId };
    for (const wid of [branch.warehouseId, branch.custodyWarehouseId, branch.unrepairableWarehouseId]) {
      const id = String(wid || '').trim();
      if (id) map.set(id, meta);
    }
  }
  return map;
}

export const Warehouses: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const routingUsageByWarehouseId = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (id: string | undefined, label: string) => {
      if (!id) return;
      const prev = map.get(id) || [];
      if (!prev.includes(label)) map.set(id, [...prev, label]);
    };
    add(routing.rawMaterialWarehouseId, 'مواد خام');
    add(routing.decomposedWarehouseId, 'مستلزم / مفكك');
    add(routing.productionWipWarehouseId, 'WIP');
    add(routing.finishedStagingWarehouseId, 'تم الإنتاج');
    add(routing.finalProductWarehouseId, 'منتج تام');
    add(routing.wasteWarehouseId, 'هالك');
    add(routing.packagingSourceWarehouseId, 'تغليف (من)');
    add(routing.packagingTargetWarehouseId, 'تغليف (إلى)');
    return map;
  }, [routing]);
  const canView = can('inventory.view');
  const canManage = can('inventory.warehouses.manage');
  const { scoped, filterWarehouses } = useMaterialsWarehouseScope();
  /** Bound / materials-scoped users may view their warehouse but not create/delete. */
  const canCreateWarehouse = canManage && !scoped;

  const {
    data: rowsData,
    loading,
    error: loadError,
    reload: reloadCached,
  } = useCachedPageLoad<Warehouse[]>(
    canView ? WAREHOUSES_CACHE_KEY : null,
    () => warehouseService.getAllWarehouses(),
    { maxAgeMs: 60_000 },
  );
  const rows = useMemo(
    () => filterWarehouses(rowsData ?? []),
    [rowsData, filterWarehouses],
  );

  const roleFromQuery = String(searchParams.get('role') || '').trim();
  const branchFromQuery = String(searchParams.get('branchId') || '').trim();
  const [roleFilter, setRoleFilter] = useState(roleFromQuery);
  const [branchFilter, setBranchFilter] = useState(branchFromQuery);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [branches, setBranches] = useState<RepairBranch[]>([]);

  useEffect(() => {
    if (roleFromQuery !== roleFilter) setRoleFilter(roleFromQuery);
  }, [roleFromQuery]); // eslint-disable-line react-hooks/exhaustive-deps -- sync URL → state only

  useEffect(() => {
    if (branchFromQuery !== branchFilter) setBranchFilter(branchFromQuery);
  }, [branchFromQuery]); // eslint-disable-line react-hooks/exhaustive-deps -- sync URL → state only

  useEffect(() => {
    if (!canView) return;
    void repairBranchService.list().then(setBranches).catch(() => setBranches([]));
  }, [canView]);

  const warehouseBranchMap = useMemo(() => buildWarehouseBranchMap(branches), [branches]);

  useEffect(() => {
    if (loadError) toast.error('تعذر تحميل المخازن.');
  }, [loadError]);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((w) => {
      if (roleFilter && (w.warehouseRole || 'general') !== roleFilter) return false;
      if (branchFilter) {
        const meta = w.id ? warehouseBranchMap.get(w.id) : undefined;
        if (!meta || meta.branchId !== branchFilter) return false;
      }
      if (!q) return true;
      const hay = `${w.name || ''} ${w.code || ''} ${ROLE_LABELS[w.warehouseRole || 'general']}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, roleFilter, branchFilter, search, warehouseBranchMap]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => displayRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [displayRows, currentPage],
  );

  useEffect(() => {
    setPage(1);
  }, [roleFilter, branchFilter, search]);

  const syncQuery = useCallback(
    (nextRole: string, nextBranch: string) => {
      const next = new URLSearchParams(searchParams);
      if (nextRole) next.set('role', nextRole);
      else next.delete('role');
      if (nextBranch) next.set('branchId', nextBranch);
      else next.delete('branchId');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(async () => {
    invalidatePageDataCache(WAREHOUSES_CACHE_KEY);
    await reloadCached(true);
  }, [reloadCached]);

  const startEdit = (w: Warehouse) => {
    if (!w.id || !canManage) return;
    openModal(MODAL_KEYS.INVENTORY_WAREHOUSES_EDIT, {
      warehouse: w,
      onSaved: () => void load(),
    });
  };

  const handleDelete = async (w: Warehouse) => {
    if (!w.id || !canManage) return;
    const ok = window.confirm(DELETE_CONFIRM(w.name || w.code || w.id));
    if (!ok) return;
    setDeletingId(w.id);
    try {
      const res = await warehouseService.delete(w.id);
      if (res.ok) {
        toast.success('تم حذف المخزن وجميع البيانات المرتبطة به.');
        await fetchSystemSettings();
        await load();
      } else {
        toast.error(res.error || 'تعذر الحذف.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const openCreate = () => {
    if (!canCreateWarehouse) return;
    openModal(MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE, {
      onSaved: () => void load(),
    });
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean p-6">
        <p className="text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader
        title="المخازن"
        subtitle={
          scoped
            ? 'عرض مساحة المخزن المرتبطة بحسابك.'
            : 'عرض كل المخازن ومساحاتها بفلاتر الدور والفرع. عند الحذف يُزال المخزن مع كل الحركات والأرصدة المرتبطة به نهائيًا.'
        }
        primaryAction={
          canCreateWarehouse
            ? {
                label: 'إضافة مخزن',
                icon: 'add',
                onClick: openCreate,
                dataModalKey: MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE,
              }
            : undefined
        }
      />

      <Card title="قائمة المخازن">
        <SmartFilterBar
          pageId="warehouses"
          searchPlaceholder="بحث بالاسم أو الكود..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'role',
              placeholder: 'كل الأدوار',
              options: (Object.keys(ROLE_LABELS) as WarehouseRole[]).map((role) => ({
                value: role,
                label: ROLE_LABELS[role],
              })),
              width: 'w-[180px]',
            },
            {
              key: 'branchId',
              placeholder: 'كل الفروع',
              options: branches
                .filter((b) => b.id)
                .map((b) => ({ value: b.id!, label: b.name || b.id! })),
              width: 'w-[200px]',
            },
          ]}
          quickFilterValues={{ role: roleFilter, branchId: branchFilter }}
          onQuickFilterChange={(key, value) => {
            const next = value === 'all' ? '' : value;
            if (key === 'role') {
              setRoleFilter(next);
              syncQuery(next, branchFilter);
            }
            if (key === 'branchId') {
              setBranchFilter(next);
              syncQuery(roleFilter, next);
            }
          }}
          className="mb-0 border-0 rounded-none"
        />
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] p-4">لا توجد مخازن مطابقة للفلاتر.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th text-start">الاسم</th>
                    <th className="erp-th text-start">الكود</th>
                    <th className="erp-th text-start">الدور</th>
                    <th className="erp-th text-start">الفرع</th>
                    <th className="erp-th text-start">توجيه الإنتاج</th>
                    <th className="erp-th text-start">الحالة</th>
                    <th className="erp-th text-end w-[200px]">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((w) => {
                    const workspacePath = w.id
                      ? ((w.warehouseRole || 'general') === 'maintenance_center'
                        ? repairCenterWarehouseMenuPath(w.id)
                        : `/inventory/warehouses/${w.id}`)
                      : '';
                    const branchMeta = w.id ? warehouseBranchMap.get(w.id) : undefined;
                    return (
                      <tr key={w.id || w.code} className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-surface-hover)]">
                        <td className="py-2.5 px-3 font-medium text-[var(--color-text)]">
                          {w.id ? (
                            <Link
                              className="text-primary underline-offset-2 hover:underline"
                              to={withTenantPath(tenantSlug, workspacePath)}
                            >
                              {w.name}
                            </Link>
                          ) : w.name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs">{w.code}</td>
                        <td className="py-2.5 px-3 text-xs">{ROLE_LABELS[w.warehouseRole || 'general']}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">{branchMeta?.branchName || '—'}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          {(w.id && routingUsageByWarehouseId.get(w.id)?.join('، ')) || '—'}
                        </td>
                        <td className="py-2.5 px-3">{w.isActive === false ? 'غير نشط' : 'نشط'}</td>
                        <td className="py-2.5 px-3 text-end">
                          <div className="flex justify-end gap-1">
                            {w.id ? (
                              <Link to={withTenantPath(tenantSlug, workspacePath)}>
                                <Button type="button" size="sm" variant="ghost">
                                  مساحة المخزن
                                </Button>
                              </Link>
                            ) : null}
                            {canManage ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(w)}
                                >
                                  تعديل
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleDelete(w)}
                                  disabled={deletingId === w.id}
                                >
                                  {deletingId === w.id ? 'جاري الحذف...' : 'حذف'}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DataPaginationFooter
              page={currentPage}
              totalPages={totalPages}
              totalItems={displayRows.length}
              onPageChange={setPage}
              itemLabel="مخزن"
            />
          </>
        )}
      </Card>

    </div>
  );
};
