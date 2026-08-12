import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { ListViewToggle, useListViewMode } from '@/src/components/erp/ListViewToggle';
import { StatusKanbanBoard } from '@/src/components/erp/StatusKanbanBoard';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '../../../utils/printManager';
import { useAppStore } from '../../../store/useAppStore';
import { repairBranchService } from '../services/repairBranchService';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { CreateRepairSpareIssueModal } from '../components/CreateRepairSpareIssueModal';
import { RepairSpareIssuePrint } from '../components/RepairSpareIssuePrint';
import { PrintOffscreenHost } from '@/src/components/erp/PrintOffscreenHost';
import {
  REPAIR_SPARE_APPROVAL_MODE_LABELS,
  REPAIR_SPARE_ISSUE_STATUS_LABELS,
  canApproveRepairSpareIssue,
  canCancelRepairSpareIssue,
  canIssueRepairSpareIssue,
  canRejectRepairSpareIssue,
  canSubmitRepairSpareIssue,
} from '../lib/repairSpareIssue';
import { normalizeRepairSpareIssueAllocations } from '../lib/repairSpareIssueAllocation';
import { repairSpareIssueStatusChipType, semanticStatusAccent } from '../lib/repairSemanticStatus';
import type { RepairBranch, RepairSpareIssue, RepairSpareIssueStatus } from '../types';

const PAGE_SIZE = 20;

const toUserSafeError = (error: unknown, fallback: string): string => {
  const message = String((error as { message?: unknown })?.message || '').trim();
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  if (
    code.includes('permission-denied')
    || /missing or insufficient permissions/i.test(message)
  ) {
    return 'ليس لديك صلاحية كافية لعرض أو تحميل هذه البيانات.';
  }
  if (code.includes('unauthenticated')) {
    return 'يجب تسجيل الدخول أولًا ثم إعادة المحاولة.';
  }
  if (
    code.includes('failed-precondition')
    || /requires an index|create it here/i.test(message)
  ) {
    return 'فهرس قاعدة البيانات غير جاهز بعد. أعد المحاولة بعد دقائق أو راجع نشر فهارس Firestore.';
  }
  if (message && !/firebase|firestore|https?:\/\//i.test(message)) {
    return message;
  }
  return fallback;
};

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

export const RepairSpareIssues: React.FC = () => {
  const { dir } = useAppDirection();
  const { can } = usePermission();
  const canView = can('repairSpareIssues.view');
  const canCreate = can('repairSpareIssues.create');
  const canApprove = can('repairSpareIssues.approve');
  const canIssue = can('repairSpareIssues.issue');
  const canPrint = can('repairSpareIssues.print');
  const canCancelPerm = can('repairSpareIssues.cancel');
  const canRejectPerm = can('repairSpareIssues.reject');

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [rows, setRows] = useState<RepairSpareIssue[]>([]);
  const [statusFilter, setStatusFilter] = useState<RepairSpareIssueStatus | ''>('');
  const [listTab, setListTab] = useState<'pending' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [boardView, setBoardView] = useListViewMode('repair-spare-issues', 'kanban');
  const [selectedId, setSelectedId] = useState('');

  const spareKanbanColumns = useMemo(
    () =>
      (Object.keys(REPAIR_SPARE_ISSUE_STATUS_LABELS) as RepairSpareIssueStatus[]).map((status) => ({
        id: status,
        label: REPAIR_SPARE_ISSUE_STATUS_LABELS[status],
        accentColor: semanticStatusAccent(repairSpareIssueStatusChipType(status)),
      })),
    [],
  );
  const [printIssue, setPrintIssue] = useState<RepairSpareIssue | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const printTemplate = useAppStore((s) => s.systemSettings)?.printTemplate;
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'سند صرف قطع غيار',
  });

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      let branchRows: RepairBranch[] = [];
      try {
        branchRows = await repairBranchService.list();
        setBranches(branchRows);
      } catch (branchErr: unknown) {
        setBranches([]);
        toast.error(toUserSafeError(branchErr, 'تعذر تحميل فروع الصيانة.'));
      }

      const warehouseIds = Array.from(
        new Set(
          branchRows
            .map((b) => String(b.warehouseId || '').trim())
            .filter(Boolean),
        ),
      );

      if (warehouseIds.length === 0) {
        setRows([]);
        return;
      }

      const issues = await repairSpareIssueService.listRecent(200, warehouseIds);
      setRows(issues);
    } catch (e: unknown) {
      setRows([]);
      toast.error(toUserSafeError(e, 'تعذر تحميل سندات الصرف.'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === 'draft' || r.status === 'submitted' || r.status === 'approved').length,
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (listTab === 'pending') {
      list = list.filter((r) => r.status === 'draft' || r.status === 'submitted' || r.status === 'approved');
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    return list;
  }, [rows, listTab, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selected = useMemo(
    () => filtered.find((row) => String(row.id || '') === selectedId)
      || rows.find((row) => String(row.id || '') === selectedId)
      || null,
    [filtered, rows, selectedId],
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter, listTab]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (selectedId && filtered.some((row) => String(row.id || '') === selectedId)) return;
    setSelectedId(String(filtered[0]?.id || ''));
  }, [filtered, selectedId]);

  const selectIssue = (id: string) => {
    setSelectedId(id);
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1280px)').matches) return;
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const runAction = async (
    issueId: string,
    action: () => Promise<void>,
    success: string,
  ) => {
    setBusyId(issueId);
    try {
      await action();
      toast.success(success);
      void load();
    } catch (e: unknown) {
      toast.error(toUserSafeError(e, 'تعذر تنفيذ العملية.'));
    } finally {
      setBusyId(null);
    }
  };

  const printRow = (row: RepairSpareIssue) => {
    setPrintIssue(row);
    window.setTimeout(() => {
      void handlePrint();
    }, 50);
  };

  const busy = Boolean(selected?.id && busyId === selected.id);

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="سندات صرف قطع الغيار" dir={dir}>
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض سندات صرف قطع الغيار.</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  return (
    <RepairOpsPageShell
      eyebrow="سندات صرف قطع الغيار"
      dir={dir}
      hero={[
        { key: 'pending', label: 'معلّق', value: pendingCount, accent: pendingCount > 0 },
        { key: 'total', label: 'السندات', value: filtered.length },
        { key: 'branches', label: 'الفروع', value: branches.length },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <ListViewToggle value={boardView} onChange={setBoardView} />
          {canCreate ? (
            <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
              سند صرف جديد
            </Button>
          ) : null}
        </div>
      )}
    >
      <OpsDashPanel title="فلاتر" accent="repair" bodyClassName="p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <label className="text-xs font-medium text-muted-foreground sm:sr-only">الحالة</label>
        <select
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm sm:w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RepairSpareIssueStatus | '')}
        >
          <option value="">كل الحالات</option>
          {(Object.keys(REPAIR_SPARE_ISSUE_STATUS_LABELS) as RepairSpareIssueStatus[]).map((s) => (
            <option key={s} value={s}>{REPAIR_SPARE_ISSUE_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          تحديث
        </Button>
        <span className="text-xs text-muted-foreground sm:ms-auto">
          الفروع: {branches.length} — السندات: {filtered.length}
          {pendingCount > 0 ? ` · معلّق: ${pendingCount}` : ''}
        </span>
      </div>
      </OpsDashPanel>

      {boardView === 'kanban' ? (
        <OpsDashPanel title="لوحة السندات" accent="repair" bodyClassName="p-3 sm:p-4">
          <StatusKanbanBoard
            columns={spareKanbanColumns}
            items={filtered
              .filter((row) => Boolean(row.id))
              .map((row) => ({ ...row, id: String(row.id) }))}
            loading={loading}
            emptyColumnLabel="لا سندات"
            onCardClick={(row) => selectIssue(String(row.id))}
            renderCard={(row) => (
              <>
                <div className={`text-sm font-bold ${selectedId === row.id ? 'text-primary' : ''}`}>
                  {row.referenceNo}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {row.branchName} · {row.warehouseName}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {(row.lines || []).length} بند
                </div>
              </>
            )}
          />
        </OpsDashPanel>
      ) : null}

      <div className="flex flex-col xl:flex-row gap-4 items-stretch" dir="ltr">
        <div ref={detailPanelRef} className="order-2 xl:order-1 min-w-0 flex-1 w-full" dir="rtl">
        <OpsDashPanel title={selected ? `تفاصيل ${selected.referenceNo}` : 'التفاصيل'} accent="repair" bodyClassName="p-0 overflow-hidden h-full">
          {!selected ? (
            <p className="hidden px-4 py-16 text-center text-sm text-muted-foreground xl:block">
              اختر سنداً من القائمة لعرض التحضير والإجراءات.
            </p>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b bg-card/95 p-3 backdrop-blur sm:p-4">
                {canCreate && canSubmitRepairSpareIssue(selected.status, selected.approvalMode) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runAction(
                      String(selected.id),
                      () => repairSpareIssueService.submit(String(selected.id)),
                      'تم تقديم السند.',
                    )}
                  >
                    تقديم
                  </Button>
                )}
                {canApprove && canApproveRepairSpareIssue(selected.status, selected.approvalMode) && (
                  <ToneActionButton
                    action="approve"
                    disabled={busy}
                    onClick={() => void runAction(
                      String(selected.id),
                      () => repairSpareIssueService.approve(String(selected.id)),
                      'تم اعتماد السند.',
                    )}
                  >
                    اعتماد
                  </ToneActionButton>
                )}
                {canRejectPerm && canRejectRepairSpareIssue(selected.status, selected.approvalMode) && (
                  <ToneActionButton
                    action="reject"
                    disabled={busy}
                    onClick={() => void runAction(
                      String(selected.id),
                      () => repairSpareIssueService.reject(String(selected.id)),
                      'تم رفض السند.',
                    )}
                  >
                    رفض
                  </ToneActionButton>
                )}
                {canIssue && canIssueRepairSpareIssue(selected.status, selected.approvalMode) && (
                  <ToneActionButton
                    action="approve"
                    disabled={busy}
                    onClick={() => void runAction(
                      String(selected.id),
                      () => repairSpareIssueService.issue(String(selected.id)),
                      'تم تنفيذ الصرف.',
                    )}
                  >
                    صرف
                  </ToneActionButton>
                )}
                {canCancelPerm && canCancelRepairSpareIssue(selected.status) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void runAction(
                      String(selected.id),
                      () => repairSpareIssueService.cancel(String(selected.id)),
                      'تم إلغاء السند.',
                    )}
                  >
                    إلغاء
                  </Button>
                )}
                {canPrint && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => printRow(selected)}
                  >
                    طباعة
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b bg-[var(--color-bg)]">
                <div className="rounded-lg border bg-[var(--color-card)] p-3">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">الحالة</p>
                  <p className="mt-1 text-sm font-black">{REPAIR_SPARE_ISSUE_STATUS_LABELS[selected.status]}</p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">وضع الاعتماد</p>
                  <p className="mt-1 text-sm font-black">{REPAIR_SPARE_APPROVAL_MODE_LABELS[selected.approvalMode]}</p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">الفرع</p>
                  <p className="mt-1 text-sm font-black">{selected.branchName}</p>
                </div>
                <div className="rounded-lg border bg-[var(--color-card)] p-3">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">المخزن</p>
                  <p className="mt-1 text-sm font-black">{selected.warehouseName}</p>
                </div>
              </div>

              <p className="px-4 pt-3 text-xs text-muted-foreground">
                مسار العمل: تحضير باللوكيشن ← {selected.approvalMode === 'required' ? 'تقديم ← اعتماد ← ' : ''}صرف ← طباعة
              </p>

              <div className="overflow-x-auto p-3 sm:p-4">
                <table className="erp-table w-full min-w-[420px] text-right text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">القطعة</th>
                      <th className="erp-th">الكمية</th>
                      <th className="erp-th">التحضير (الرفوف)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.lines || []).map((line) => {
                      const allocations = normalizeRepairSpareIssueAllocations(line);
                      return (
                        <tr key={line.lineId || `${line.itemId}-${line.locationId || ''}`} className="border-t">
                          <td className="px-3 py-2 font-medium">
                            {line.itemName}
                            {line.itemCode ? (
                              <span className="block text-[11px] text-muted-foreground font-mono">{line.itemCode}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{fmt(line.quantity)} {line.unit}</td>
                          <td className="px-3 py-2 text-xs">
                            {allocations.length > 0
                              ? allocations.map((a) => (
                                <div key={`${a.locationId}-${a.quantity}`}>
                                  {a.locationCode}: {fmt(a.quantity)}
                                </div>
                              ))
                              : 'بدون رفوف'}
                            {line.shortageQty && line.shortageQty > 0 ? (
                              <p className="text-[rgb(var(--color-danger))] mt-1">نقص: {fmt(line.shortageQty)}</p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </OpsDashPanel>
        </div>

        {boardView === 'table' ? (
        <div className="order-1 w-full xl:order-2 xl:w-[360px] xl:shrink-0" dir="rtl">
        <OpsDashPanel title="قائمة السندات" accent="repair" bodyClassName="p-0 overflow-hidden h-full">
          <div className="flex flex-wrap gap-2 border-b px-3 pb-2 pt-3">
            {([
              ['pending', `معلّق (${pendingCount})`],
              ['all', 'كل السندات'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setListTab(key);
                  setPage(1);
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
          {loading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : paged.length === 0 ? (
            <div className="space-y-3 py-16 text-center text-sm text-muted-foreground">
              <p>{listTab === 'pending' ? 'لا توجد سندات معلّقة.' : 'لا توجد سندات.'}</p>
              {canCreate && (
                <Button type="button" onClick={() => setShowCreate(true)}>إنشاء سند صرف</Button>
              )}
            </div>
          ) : (
            paged.map((row) => {
              const id = String(row.id || '');
              const isSelected = selectedId === id;
              const prepared = (row.lines || []).some(
                (line) => normalizeRepairSpareIssueAllocations(line).length > 0,
              );
              return (
                <button
                  key={id}
                  type="button"
                  className={`block w-full border-b px-4 py-3 text-start ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                  }`}
                  onClick={() => selectIssue(id)}
                >
                  <p className="text-sm font-bold">{row.referenceNo}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {row.branchName} · {row.warehouseName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ErpStatusBadge
                      label={REPAIR_SPARE_ISSUE_STATUS_LABELS[row.status] || row.status}
                      type={repairSpareIssueStatusChipType(row.status)}
                    />
                    {prepared ? (
                      <span className="text-[11px] text-muted-foreground">محضّر بالرف</span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
          </div>
          {paged.length > 0 ? (
            <DataPaginationFooter
              page={safePage}
              totalPages={totalPages}
              totalItems={filtered.length}
              onPageChange={setPage}
              itemLabel="سند"
            />
          ) : null}
        </OpsDashPanel>
        </div>
        ) : null}
      </div>

      <PrintOffscreenHost>
        <RepairSpareIssuePrint ref={printRef} issue={printIssue} printSettings={printTemplate} />
      </PrintOffscreenHost>

      <CreateRepairSpareIssueModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
        branches={branches}
      />
    </RepairOpsPageShell>
  );
};
