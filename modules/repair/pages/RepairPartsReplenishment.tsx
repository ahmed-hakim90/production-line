import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
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
import { usePrintEngine } from '@/utils/printManager';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import { SparePartsReplenishmentPrint } from '../../inventory/components/SparePartsReplenishmentPrint';
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
  const { dir } = useAppDirection();
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
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
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
  const { printDocument } = usePrintEngine();

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
      const reqRes = await sparePartsReplenishmentService.listPaged({
        toWarehouseId,
        limit: 100,
      });
      setRows(reqRes.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحميل طلبات التموين.');
      setRows([]);
    } finally {
      setLoading(false);
    }
    if (selectedBranchId) {
      const partRows = await sparePartsService.listParts(selectedBranchId).catch(() => [] as RepairSparePart[]);
      setParts(partRows);
    } else {
      setParts([]);
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

  const printSelectedRequest = useCallback(() => {
    if (!selectedRequest) return;
    if (selectedRequest.status === 'cancelled' || selectedRequest.status === 'rejected') {
      toast.error('لا يمكن طباعة طلب ملغى أو مرفوض.');
      return;
    }
    printDocument({
      documentTitle: `تموين-${selectedRequest.referenceNo || selectedRequest.id}`,
      printSettings: printTemplate,
      render: (ref) => (
        <SparePartsReplenishmentPrint
          ref={ref}
          request={selectedRequest}
          printSettings={printTemplate}
        />
      ),
    });
  }, [selectedRequest, printDocument, printTemplate]);

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="متابعة تموين قطع الغيار" dir={dir}>
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية متابعة تموين قطع الغيار.</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  return (
    <RepairOpsPageShell
      eyebrow="متابعة تموين قطع الغيار"
      dir={dir}
      hero={[
        { key: 'awaiting', label: 'بانتظار الاستلام', value: awaitingReceiptCount, accent: awaitingReceiptCount > 0 },
        { key: 'total', label: 'الطلبات', value: filtered.length },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
      actions={(
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link to={withTenantPath(tenantSlug, '/repair/parts')} className="min-w-0 flex-1 sm:flex-none">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">مخزون الفرع</Button>
          </Link>
          {canCreate ? (
            <Button
              type="button"
              size="sm"
              className="min-w-0 flex-1 sm:flex-none"
              onClick={() => setCreateOpen(true)}
              disabled={!toWarehouseId}
            >
              طلب تموين
            </Button>
          ) : null}
        </div>
      )}
    >
      <OpsDashPanel title="فلاتر" accent="repair" bodyClassName="p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
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
          <span className="text-xs font-semibold text-[rgb(var(--color-warning))] sm:ms-auto">
            {awaitingReceiptCount > 0
              ? `${awaitingReceiptCount} بانتظار استلامك`
              : 'لا يوجد استلام معلّق'}
          </span>
        </div>
      </div>
      </OpsDashPanel>

      {!toWarehouseId ? (
        <OpsDashPanel title="اختيار الفرع" accent="repair">
          <p className="py-6 text-center text-sm text-muted-foreground">
            اختر فرعًا مربوطًا بمخزن صيانة لعرض الطلبات.
          </p>
        </OpsDashPanel>
      ) : (
        <div className="flex flex-col items-stretch gap-4 xl:flex-row" dir="ltr">
          <div ref={detailPanelRef} className="order-2 min-w-0 w-full flex-1 xl:order-1" dir="rtl">
            <OpsDashPanel
              title={selectedRequest ? `تفاصيل ${selectedRequest.referenceNo}` : 'التفاصيل'}
              accent="repair"
              bodyClassName="p-0 h-full overflow-hidden"
            >
              {!selectedRequest ? (
                <p className="hidden px-4 py-16 text-center text-sm text-muted-foreground xl:block">
                  اختر طلباً من القائمة لعرض التفاصيل والإجراءات.
                </p>
              ) : (
                <>
                  <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:p-4">
                    {selectedRequest.status !== 'cancelled' && selectedRequest.status !== 'rejected' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={selectedBusy}
                        onClick={() => void printSelectedRequest()}
                      >
                        طباعة
                      </Button>
                    ) : null}
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

                  <div className="grid grid-cols-2 gap-2 border-b bg-[var(--color-bg)] p-3 sm:gap-3 sm:p-4 md:grid-cols-4">
                    <div className="rounded-lg border bg-[var(--color-card)] p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-[var(--color-text-muted)] sm:text-xs">من مخزن</p>
                      <p className="mt-1 break-words text-sm font-black">{selectedRequest.fromWarehouseName || '—'}</p>
                    </div>
                    <div className="rounded-lg border bg-[var(--color-card)] p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-[var(--color-text-muted)] sm:text-xs">إلى مخزن</p>
                      <p className="mt-1 break-words text-sm font-black">{selectedRequest.toWarehouseName || '—'}</p>
                    </div>
                    <div className="rounded-lg border bg-[var(--color-card)] p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-[var(--color-text-muted)] sm:text-xs">الحالة</p>
                      <p className="mt-1 text-sm font-black">
                        {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[selectedRequest.status]}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-[var(--color-card)] p-2.5 sm:p-3">
                      <p className="text-[11px] font-bold text-[var(--color-text-muted)] sm:text-xs">بنود</p>
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
                              {line.preparedQty != null
                                ? (Number(line.preparedQty) > 0 ? fmt(line.preparedQty) : 'مستبعد')
                                : fmt(line.requestedQty)}
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
            </OpsDashPanel>
          </div>

          <div className="order-1 w-full xl:order-2 xl:w-[360px] xl:shrink-0" dir="rtl">
            <OpsDashPanel
              title="قائمة الطلبات"
              accent="repair"
              bodyClassName="p-0 h-full overflow-hidden"
              loading={loading}
              loadingLabel="جاري تحميل الطلبات…"
            >
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
                        : 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[min(52vh,420px)] overflow-y-auto xl:max-h-[min(70vh,720px)]">
                {loading && rows.length === 0 ? (
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
                          selected ? 'bg-primary/10' : 'hover:bg-[var(--color-surface-hover)]'
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
                          <p className="mt-1 line-clamp-1 text-xs text-[var(--color-text-muted)]">{row.note}</p>
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
            </OpsDashPanel>
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
    </RepairOpsPageShell>
  );
};

export default RepairPartsReplenishment;
