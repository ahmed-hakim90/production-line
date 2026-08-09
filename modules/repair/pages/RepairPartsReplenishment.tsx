import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { withTenantPath } from '@/lib/tenantPaths';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
  canCancelSparePartsRequest,
  canReceiveSparePartsRequest,
} from '../../inventory/lib/sparePartsReplenishment';
import type {
  SparePartsReplenishmentRequest,
  SparePartsReplenishmentStatus,
} from '../../inventory/types';
import { CreateRepairReplenishmentModal } from '../components/CreateRepairReplenishmentModal';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import {
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairSparePart,
} from '../types';

const LIST_PAGE_SIZE = 20;

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type ListTab = 'awaiting' | 'all';

export const RepairPartsReplenishment: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canView =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.create')
    || can('sparePartsReplenishment.receive');
  const canCreate = can('sparePartsReplenishment.create');
  const canReceive = can('sparePartsReplenishment.receive');
  const canCancelPerm = can('sparePartsReplenishment.cancel');

  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );

  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [rows, setRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SparePartsReplenishmentStatus | ''>('');
  const [listTab, setListTab] = useState<ListTab>('awaiting');
  const [listPage, setListPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) || null,
    [branches, selectedBranchId],
  );
  const toWarehouseId = String(activeBranch?.warehouseId || '').trim();

  const loadBranches = useCallback(async () => {
    const branchRows = await repairBranchService.list();
    const accessibleIds = new Set(
      resolveAccessibleRepairBranchIds({
        user,
        branches: branchRows,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: repairCtx.canViewAllBranches,
      }),
    );
    const scoped = repairCtx.canViewAllBranches
      ? branchRows
      : branchRows.filter((b) => accessibleIds.has(String(b.id || '')));
    setBranches(scoped);
    setSelectedBranchId((prev) => {
      if (prev && scoped.some((b) => b.id === prev)) return prev;
      return String(scoped[0]?.id || '');
    });
  }, [repairCtx.canViewAllBranches, user, currentEmployee?.id]);

  const load = useCallback(async () => {
    if (!canView || !toWarehouseId) {
      setRows([]);
      setParts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [reqRes, partRows] = await Promise.all([
        sparePartsReplenishmentService.listPaged({
          toWarehouseId,
          limit: 100,
        }),
        selectedBranchId ? sparePartsService.listParts(selectedBranchId) : Promise.resolve([]),
      ]);
      setRows(reqRes.items);
      setParts(partRows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحميل طلبات التموين.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, toWarehouseId, selectedBranchId]);

  useEffect(() => {
    if (!canView) return;
    void loadBranches().catch(() => {
      toast.error('تعذر تحميل فروع الصيانة.');
      setBranches([]);
    });
  }, [canView, loadBranches]);

  useEffect(() => {
    void load();
  }, [load]);

  const awaitingReceiptCount = useMemo(
    () => rows.filter((row) => canReceiveSparePartsRequest(row)).length,
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (listTab === 'awaiting') {
      list = list.filter((r) => canReceiveSparePartsRequest(r));
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    return list;
  }, [rows, listTab, statusFilter]);

  const listTotalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, listTotalPages);
  const pagedRequests = useMemo(
    () => filtered.slice((safeListPage - 1) * LIST_PAGE_SIZE, safeListPage * LIST_PAGE_SIZE),
    [filtered, safeListPage],
  );

  const selectedRequest = useMemo(
    () => filtered.find((row) => String(row.id || '') === selectedId)
      || rows.find((row) => String(row.id || '') === selectedId)
      || null,
    [filtered, rows, selectedId],
  );

  useEffect(() => {
    setListPage(1);
  }, [statusFilter, selectedBranchId, listTab]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (selectedId && filtered.some((row) => String(row.id || '') === selectedId)) return;
    setSelectedId(String(filtered[0]?.id || ''));
  }, [filtered, selectedId]);

  const selectRequest = (id: string) => {
    setSelectedId(id);
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1280px)').matches) return;
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const runAction = async (
    id: string,
    action: () => Promise<void>,
    success: string,
  ) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء.');
    } finally {
      setBusyId(null);
    }
  };

  const selectedBusy = Boolean(selectedRequest?.id && busyId === String(selectedRequest.id));

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-5">
        <PageHeader title="متابعة تموين قطع الغيار" icon="local_shipping" />
        <p className="text-sm text-slate-500">ليس لديك صلاحية متابعة تموين قطع الغيار.</p>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 sm:space-y-5 px-1 sm:px-0">
      <PageHeader
        title="متابعة تموين قطع الغيار"
        subtitle="طلبات التموين من المخزن الرئيسي لهذا المركز — أنشئ الطلب واستلم الرصيد من هنا."
        icon="local_shipping"
        actions={(
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Link to={withTenantPath(tenantSlug, '/repair/parts')} className="min-w-0 flex-1 sm:flex-none">
              <Button variant="outline" className="w-full sm:w-auto">مخزون الفرع</Button>
            </Link>
            {canCreate && (
              <Button
                type="button"
                className="min-w-0 flex-1 sm:flex-none"
                onClick={() => setCreateOpen(true)}
                disabled={!toWarehouseId}
              >
                طلب تموين
              </Button>
            )}
          </div>
        )}
      />

      <div className="flex flex-col gap-2 rounded-xl border bg-card px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {(repairCtx.canViewAllBranches || branches.length > 1) && (
          <div className="w-full sm:w-[220px]">
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id || ''}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Select
          value={statusFilter || '__all__'}
          onValueChange={(v) =>
            setStatusFilter(v === '__all__' ? '' : (v as SparePartsReplenishmentStatus))
          }
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الحالات</SelectItem>
            {(Object.keys(SPARE_PARTS_REPLENISHMENT_STATUS_LABELS) as SparePartsReplenishmentStatus[]).map(
              (status) => (
                <SelectItem key={status} value={status}>
                  {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[status]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            تحديث
          </Button>
          <span className="text-xs font-semibold text-amber-700 sm:ms-auto">
            {awaitingReceiptCount > 0
              ? `${awaitingReceiptCount} بانتظار استلامك`
              : 'لا يوجد استلام معلّق'}
          </span>
        </div>
      </div>

      {!toWarehouseId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            اختر فرعًا مربوطًا بمخزن صيانة لعرض الطلبات.
          </CardContent>
        </Card>
      ) : (
        /* Physical LTR row: details LEFT, list RIGHT — content stays RTL. Mobile: list first. */
        <div className="flex flex-col items-stretch gap-4 xl:flex-row" dir="ltr">
          <div ref={detailPanelRef} className="order-2 min-w-0 w-full flex-1 xl:order-1" dir="rtl">
            <Card className="!p-0 h-full overflow-hidden">
              <div className="border-b px-3 py-3 sm:px-4">
                <h2 className="text-sm font-bold">
                  {selectedRequest ? `تفاصيل ${selectedRequest.referenceNo}` : 'التفاصيل'}
                </h2>
              </div>
              {!selectedRequest ? (
                <p className="hidden px-4 py-16 text-center text-sm text-muted-foreground xl:block">
                  اختر طلباً من القائمة لعرض التفاصيل والإجراءات.
                </p>
              ) : (
                <>
                  <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:p-4">
                    {canReceive && canReceiveSparePartsRequest(selectedRequest) ? (
                      <ToneActionButton
                        action="approve"
                        disabled={selectedBusy}
                        onClick={() => void runAction(
                          String(selectedRequest.id),
                          () => sparePartsReplenishmentService.receive(String(selectedRequest.id)),
                          'تم تأكيد استلام التموين.',
                        )}
                      >
                        تأكيد الاستلام
                      </ToneActionButton>
                    ) : null}
                    {canCancelPerm && canCancelSparePartsRequest(selectedRequest) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={selectedBusy}
                        onClick={() => void runAction(
                          String(selectedRequest.id),
                          () => sparePartsReplenishmentService.cancel(String(selectedRequest.id)),
                          'تم إلغاء الطلب.',
                        )}
                      >
                        إلغاء
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-b bg-slate-50/60 p-3 sm:gap-3 sm:p-4 md:grid-cols-4">
                    <div className="rounded-lg border bg-white p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-slate-500 sm:text-xs">من مخزن</p>
                      <p className="mt-1 break-words text-sm font-black">{selectedRequest.fromWarehouseName || '—'}</p>
                    </div>
                    <div className="rounded-lg border bg-white p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-slate-500 sm:text-xs">إلى مخزن</p>
                      <p className="mt-1 break-words text-sm font-black">{selectedRequest.toWarehouseName || '—'}</p>
                    </div>
                    <div className="rounded-lg border bg-white p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-slate-500 sm:text-xs">الحالة</p>
                      <p className="mt-1 text-sm font-black">
                        {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[selectedRequest.status]}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-slate-500 sm:text-xs">بنود</p>
                      <p className="mt-1 text-sm font-black tabular-nums">
                        {(selectedRequest.lines || []).length}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto p-3 sm:p-4">
                    <table className="erp-table w-full min-w-[420px] text-sm">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th text-start">المكوّن</th>
                          <th className="erp-th text-start">مطلوب</th>
                          <th className="erp-th text-start">مجهّز</th>
                          <th className="erp-th text-start">مستلم</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedRequest.lines || []).map((line) => (
                          <tr key={line.lineId} className="border-t">
                            <td className="max-w-[10rem] break-words px-3 py-2 font-medium sm:max-w-none">
                              {line.itemName}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{fmt(line.requestedQty)}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {fmt(line.preparedQty ?? line.requestedQty)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {line.receivedQty != null ? fmt(line.receivedQty) : '—'}
                            </td>
                          </tr>
                        ))}
                        {(selectedRequest.lines || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                              لا توجد بنود.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </div>

          <div className="order-1 w-full xl:order-2 xl:w-[360px] xl:shrink-0" dir="rtl">
            <Card className="!p-0 h-full overflow-hidden">
              <div className="flex flex-wrap gap-2 border-b px-3 pb-2 pt-3">
                {([
                  ['awaiting', `بانتظار استلامي (${awaitingReceiptCount})`],
                  ['all', 'كل الطلبات'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setListTab(key);
                      setListPage(1);
                    }}
                    className={`min-h-9 flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold sm:flex-none sm:px-3 ${
                      listTab === key
                        ? 'border-primary bg-primary text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[min(52vh,420px)] overflow-y-auto xl:max-h-[min(70vh,720px)]">
                {loading ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">جاري التحميل…</p>
                ) : filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {listTab === 'awaiting' ? 'لا توجد طلبات بانتظار الاستلام.' : 'لا توجد طلبات تموين لهذا المخزن.'}
                  </p>
                ) : (
                  pagedRequests.map((row) => {
                    const id = String(row.id || '');
                    const selected = selectedId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`block w-full border-b px-4 py-3 text-start ${
                          selected ? 'bg-primary/10' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => selectRequest(id)}
                      >
                        <p className="text-sm font-bold">{row.referenceNo}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[row.status] || row.status}
                          {' · '}
                          {(row.lines || []).length} بند
                        </p>
                        {row.note ? (
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{row.note}</p>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              {filtered.length > 0 ? (
                <DataPaginationFooter
                  page={safeListPage}
                  totalPages={listTotalPages}
                  totalItems={filtered.length}
                  onPageChange={setListPage}
                  itemLabel="طلب"
                />
              ) : null}
            </Card>
          </div>
        </div>
      )}

      <CreateRepairReplenishmentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        toWarehouseId={toWarehouseId}
        parts={parts}
        onCreated={() => void load()}
      />
    </div>
  );
};

export default RepairPartsReplenishment;
