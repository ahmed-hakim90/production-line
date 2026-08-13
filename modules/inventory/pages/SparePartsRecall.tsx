import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/UI';
import { VoucherItemCombobox } from '../components/VoucherItemCombobox';
import { buildMaterialVoucherPicker } from '../lib/materialVoucherPicker';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { warehouseService } from '../services/warehouseService';
import { materialService } from '../../manufacturing/services/materialService';
import { sparePartsRecallService } from '../services/sparePartsRecallService';
import {
  SPARE_PARTS_RECALL_STATUS_LABELS,
  canCancelSparePartsRecall,
  canConfirmSparePartsRecall,
} from '../lib/sparePartsRecall';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';
import type { SparePartsRecallRequest, SparePartsRecallStatus, Warehouse } from '../types';
import type { Material } from '../../manufacturing/types';

const PAGE_SIZE = 20;
const RECALL_LIST_CACHE = 'inventory:spare-parts-recall';
const MATERIALS_CATALOG_CACHE = 'inventory:materials-catalog';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

function normalizeRoleName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function recallStatusTone(status: SparePartsRecallStatus): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'confirmed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'submitted') return 'warning';
  return 'muted';
}

type DraftLine = { itemId: string; quantity: string };

export const SparePartsRecall: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const userRoleName = useAppStore((s) => s.userRoleName);

  const canView = can('sparePartsRecall.view') || can('sparePartsReplenishment.view') || can('inventory.view');
  const canCreate = can('sparePartsRecall.create');
  const canConfirmPerm = can('sparePartsRecall.confirm');
  const canCancel = can('sparePartsRecall.cancel');

  /** Central HQ creates/cancels; center warehouse confirms delivery back. */
  const isCentralWarehouseOperator = useMemo(() => {
    const role = roles.find((r) => r.id === userRoleId);
    if (role?.roleKey === 'spare_parts_central_warehouse') return true;
    return normalizeRoleName(userRoleName) === normalizeRoleName('مسؤول مخزن قطع الغيار المركزي');
  }, [roles, userRoleId, userRoleName]);
  const canConfirm = canConfirmPerm && !isCentralWarehouseOperator;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(searchParams.get('fromWarehouseId')));
  const [listTab, setListTab] = useState<'pending' | 'all'>('pending');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState('');

  const [fromWarehouseId, setFromWarehouseId] = useState(searchParams.get('fromWarehouseId') || '');
  const [note, setNote] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ itemId: '', quantity: '1' }]);

  const {
    data: listData,
    loading: listLoading,
    refreshing: listRefreshing,
    reload: reloadList,
  } = useCachedPageLoad<{ warehouses: Warehouse[]; rows: SparePartsRecallRequest[] }>(
    canView ? RECALL_LIST_CACHE : null,
    async () => {
      const [whs, items] = await Promise.all([
        warehouseService.getWarehousesForSparePartsFlow().catch(() => [] as Warehouse[]),
        sparePartsRecallService.listRecent(150).catch(() => [] as SparePartsRecallRequest[]),
      ]);
      return { warehouses: whs, rows: items };
    },
    { maxAgeMs: 45_000 },
  );

  const {
    data: catalog,
    loading: catalogLoading,
  } = useCachedPageLoad<Material[]>(
    canView ? MATERIALS_CATALOG_CACHE : null,
    () => materialService.getAll(),
    { maxAgeMs: 60_000 },
  );

  const warehouses = listData?.warehouses ?? [];
  const rows = listData?.rows ?? [];
  const materials = catalog ?? [];

  const centerWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouseRole === 'maintenance_center'),
    [warehouses],
  );
  const activeMaterials = useMemo(
    () => materials.filter((m) => m.isActive !== false),
    [materials],
  );
  const materialPicker = useMemo(
    () => buildMaterialVoucherPicker(activeMaterials),
    [activeMaterials],
  );

  const load = useCallback(async () => {
    invalidatePageDataCache(RECALL_LIST_CACHE);
    await reloadList(true);
  }, [reloadList]);

  useEffect(() => {
    const linesParam = searchParams.get('lines') || '';
    if (!linesParam) return;
    const parsed = linesParam.split(',').map((part) => {
      const [itemId, quantity] = part.split(':');
      return { itemId: String(itemId || '').trim(), quantity: String(quantity || '1') };
    }).filter((row) => row.itemId);
    if (parsed.length) {
      setDraftLines(parsed);
      setShowCreate(true);
    }
  }, [searchParams]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === 'submitted').length,
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (listTab === 'pending') {
      list = list.filter((r) => r.status === 'submitted');
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.referenceNo,
          r.fromWarehouseName,
          r.toWarehouseName,
          ...(r.lines || []).map((l) => `${l.itemName} ${l.itemCode}`),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [rows, listTab, statusFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [listTab, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const submitCreate = async () => {
    if (!fromWarehouseId) {
      toast.error('حدد مخزن المركز.');
      return;
    }
    const lines = draftLines
      .map((line) => ({
        itemId: String(line.itemId || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.itemId && line.quantity > 0);
    if (!lines.length) {
      toast.error('أضف بنداً واحداً على الأقل.');
      return;
    }
    setBusyId('create');
    try {
      const created = await sparePartsRecallService.create({
        fromWarehouseId,
        note,
        lines,
      });
      toast.success(`تم إنشاء طلب السحب ${created.referenceNo}`);
      setShowCreate(false);
      setNote('');
      setDraftLines([{ itemId: '', quantity: '1' }]);
      setListTab('pending');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء الطلب.');
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (
    requestId: string,
    action: 'confirm' | 'cancel',
  ) => {
    setBusyId(`${action}:${requestId}`);
    try {
      if (action === 'confirm') await sparePartsRecallService.confirm(requestId);
      else await sparePartsRecallService.cancel(requestId);
      toast.success(action === 'confirm' ? 'تم تأكيد السحب وترحيل الرصيد.' : 'تم إلغاء الطلب.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <ModuleOpsPageShell eyebrow="سحب من المراكز">
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية العرض.</p>
      </ModuleOpsPageShell>
    );
  }

  const hero = [
    { key: 'pending', label: 'بانتظار تأكيد المركز', value: listLoading && rows.length === 0 ? '…' : pendingCount, accent: pendingCount > 0 },
    { key: 'all', label: 'كل الطلبات المحمّلة', value: listLoading && rows.length === 0 ? '…' : rows.length },
  ];

  return (
    <ModuleOpsPageShell
      eyebrow="سحب قطع الغيار من المراكز"
      rangeLabel={
        isCentralWarehouseOperator
          ? 'أنشئ طلب سحب من أرصدة المراكز — المركز يؤكد التسليم ثم يرجع الرصيد للرئيسي.'
          : 'المركزي يطلب سحب كمية من مركز → المركز يؤكد → الرصيد يرجع للمخزن الرئيسي.'
      }
      hero={hero}
      onRefresh={() => void load()}
      refreshing={listRefreshing}
      actions={(
        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-center-stock')}>
              <Button type="button" variant="secondary">أرصدة المراكز</Button>
            </Link>
          ) : null}
          {canCreate ? (
            <Button type="button" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'إخفاء النموذج' : 'طلب سحب جديد'}
            </Button>
          ) : null}
        </div>
      )}
    >
      {showCreate && canCreate ? (
        <OpsDashPanel title="طلب سحب إلى المخزن الرئيسي" accent="repair" loading={catalogLoading} loadingLabel="جاري تحميل الأصناف…">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            الأسهل: اختر الأصناف من «أرصدة المراكز» ثم اضغط سحب المحدد — أو أنشئ يدوياً هنا.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold space-y-1">
              <span>من مخزن المركز</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
              >
                <option value="">اختر…</option>
                {centerWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({WAREHOUSE_ROLE_LABELS.maintenance_center})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold space-y-1">
              <span>ملاحظة</span>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 space-y-2">
            {draftLines.map((line, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
                <VoucherItemCombobox
                  options={materialPicker.options}
                  catalog={materialPicker.catalog}
                  value={line.itemId}
                  onChange={(value) => {
                    setDraftLines((prev) => prev.map((row, i) => (
                      i === idx ? { ...row, itemId: value } : row
                    )));
                  }}
                  placeholder={catalogLoading ? 'جاري تحميل الأصناف…' : 'ابحث بالاسم أو امسح الباركود'}
                  disabled={catalogLoading}
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="border rounded-lg px-3 py-2"
                  value={line.quantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftLines((prev) => prev.map((row, i) => (
                      i === idx ? { ...row, quantity: value } : row
                    )));
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={draftLines.length <= 1}
                >
                  حذف
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraftLines((prev) => [...prev, { itemId: '', quantity: '1' }])}
            >
              إضافة بند
            </Button>
          </div>
          <div className="mt-4">
            <Button type="button" onClick={() => void submitCreate()} disabled={busyId === 'create'}>
              {busyId === 'create' ? 'جاري الإنشاء…' : 'إنشاء طلب السحب'}
            </Button>
          </div>
        </OpsDashPanel>
      ) : null}

      <OpsDashPanel
        title="طلبات السحب"
        accent="repair"
        bodyClassName="p-0"
        loading={listLoading || listRefreshing}
        loadingLabel={listLoading ? 'جاري تحميل الطلبات…' : 'جاري التحديث…'}
      >
        <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] px-3 pt-3">
          {([
            ['pending', `معلّق (${pendingCount})`],
            ['all', 'كل الطلبات'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setListTab(key)}
              className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                listTab === key
                  ? 'border-primary bg-primary text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <SmartFilterBar
          pageId="spare-parts-recall"
          searchPlaceholder="رقم الطلب أو المركز أو الصنف…"
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: (Object.keys(SPARE_PARTS_RECALL_STATUS_LABELS) as SparePartsRecallStatus[]).map(
                (status) => ({
                  value: status,
                  label: SPARE_PARTS_RECALL_STATUS_LABELS[status],
                }),
              ),
            },
          ]}
          quickFilterValues={{
            status: statusFilter || 'all',
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'status') setStatusFilter(value === 'all' ? '' : value);
          }}
          extra={(
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
              تحديث
            </Button>
          )}
        />

        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">الطلب</th>
                <th className="erp-th text-start">من → إلى</th>
                <th className="erp-th text-start">الحالة</th>
                <th className="erp-th text-start">البنود</th>
                <th className="erp-th text-start">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td className="py-3 px-2" colSpan={5}>
                      <div className="h-4 w-full animate-pulse rounded bg-[var(--color-surface-hover)]" />
                    </td>
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-[var(--color-text-muted)]">
                    لا توجد طلبات مطابقة.
                  </td>
                </tr>
              ) : (
                paged.map((row) => {
                  const id = String(row.id || '');
                  const expanded = expandedId === id;
                  return (
                    <React.Fragment key={id}>
                      <tr className="border-b border-[var(--color-border)]/50">
                        <td className="py-2 px-2 font-bold">{row.referenceNo}</td>
                        <td className="py-2 px-2 text-xs">
                          {row.fromWarehouseName} → {row.toWarehouseName}
                        </td>
                        <td className="py-2 px-2">
                          <StatusBadge
                            label={SPARE_PARTS_RECALL_STATUS_LABELS[row.status]}
                            type={recallStatusTone(row.status)}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            className="text-xs font-bold text-primary underline"
                            onClick={() => setExpandedId((prev) => (prev === id ? '' : id))}
                          >
                            {(row.lines || []).length} بند{expanded ? ' ▾' : ' ▸'}
                          </button>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex flex-wrap gap-2">
                            {canConfirm && canConfirmSparePartsRecall(row) ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={busyId === `confirm:${row.id}`}
                                onClick={() => void runAction(id, 'confirm')}
                              >
                                تأكيد السحب
                              </Button>
                            ) : null}
                            {canCancel && canCancelSparePartsRecall(row) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busyId === `cancel:${row.id}`}
                                onClick={() => void runAction(id, 'cancel')}
                              >
                                إلغاء
                              </Button>
                            ) : null}
                            {isCentralWarehouseOperator && row.status === 'submitted' ? (
                              <span className="text-[11px] text-[var(--color-text-muted)]">
                                بانتظار تأكيد المركز
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-b border-[var(--color-border)]/40 bg-[var(--color-bg)]">
                          <td colSpan={5} className="px-3 py-2">
                            <ul className="space-y-1 text-xs">
                              {(row.lines || []).map((line) => (
                                <li key={line.lineId}>
                                  {line.itemName} ({line.itemCode || '—'}) — {fmt(line.requestedQty)}
                                  {line.confirmedQty != null ? ` · مؤكد ${fmt(line.confirmedQty)}` : ''}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 ? (
          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            onPageChange={setPage}
            itemLabel="طلب"
          />
        ) : null}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};

export default SparePartsRecall;
