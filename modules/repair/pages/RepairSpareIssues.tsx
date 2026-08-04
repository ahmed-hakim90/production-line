import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../../../components/UI';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { repairBranchService } from '../services/repairBranchService';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { CreateRepairSpareIssueModal } from '../components/CreateRepairSpareIssueModal';
import {
  REPAIR_SPARE_ISSUE_STATUS_LABELS,
  canApproveRepairSpareIssue,
  canCancelRepairSpareIssue,
  canIssueRepairSpareIssue,
  canRejectRepairSpareIssue,
  canSubmitRepairSpareIssue,
} from '../lib/repairSpareIssue';
import type { RepairBranch, RepairSpareIssue, RepairSpareIssueStatus } from '../types';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';

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
  if (message && !/firebase|firestore|https?:\/\//i.test(message)) {
    return message;
  }
  return fallback;
};

export const RepairSpareIssues: React.FC = () => {
  const { can } = usePermission();
  const canView = can('repairSpareIssues.view');
  const canCreate = can('repairSpareIssues.create');
  const canApprove = can('repairSpareIssues.approve');
  const canIssue = can('repairSpareIssues.issue');

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [rows, setRows] = useState<RepairSpareIssue[]>([]);
  const [statusFilter, setStatusFilter] = useState<RepairSpareIssueStatus | ''>('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [branchRows, issues] = await Promise.all([
        repairBranchService.list(),
        repairSpareIssueService.listRecent(200),
      ]);
      setBranches(branchRows);
      setRows(issues);
    } catch (e: unknown) {
      toast.error(toUserSafeError(e, 'تعذر تحميل سندات صرف قطع الغيار.'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const runAction = async (
    issueId: string,
    action: () => Promise<void>,
    success: string,
  ) => {
    setBusyId(issueId);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (e: unknown) {
      toast.error(toUserSafeError(e, 'تعذر تنفيذ العملية.'));
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <div className="p-6">
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية عرض سندات صرف قطع الغيار.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="سندات صرف قطع الغيار"
        subtitle="صرف من مخزن مركز الصيانة على أوامر الصيانة مع دورة اعتماد"
        actions={canCreate ? (
          <Button type="button" onClick={() => setShowCreate(true)}>
            سند صرف جديد
          </Button>
        ) : undefined}
      />

      <Card className="!p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-[var(--color-text-muted)]">الحالة</label>
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RepairSpareIssueStatus | '')}
        >
          <option value="">الكل</option>
          {(Object.keys(REPAIR_SPARE_ISSUE_STATUS_LABELS) as RepairSpareIssueStatus[]).map((s) => (
            <option key={s} value={s}>{REPAIR_SPARE_ISSUE_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          تحديث
        </Button>
        <span className="text-xs text-[var(--color-text-muted)] ms-auto">
          الفروع: {branches.length} — السندات: {filtered.length}
        </span>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[var(--color-text-muted)]">جاري التحميل...</div>
        ) : paged.length === 0 ? (
          <div className="py-16 text-center text-[var(--color-text-muted)] space-y-3">
            <p>لا توجد سندات.</p>
            {canCreate && (
              <Button type="button" onClick={() => setShowCreate(true)}>إنشاء سند صرف</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-right">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">المرجع</th>
                  <th className="erp-th">الفرع</th>
                  <th className="erp-th">المخزن</th>
                  <th className="erp-th">الطلب</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">بنود</th>
                  <th className="erp-th">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => {
                  const id = String(row.id || '');
                  const busy = busyId === id;
                  return (
                    <tr key={id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 text-sm font-bold">{row.referenceNo}</td>
                      <td className="px-3 py-2 text-sm">{row.branchName}</td>
                      <td className="px-3 py-2 text-sm">{row.warehouseName}</td>
                      <td className="px-3 py-2 text-sm">{row.jobCode || row.jobId || '—'}</td>
                      <td className="px-3 py-2 text-sm">
                        {REPAIR_SPARE_ISSUE_STATUS_LABELS[row.status] || row.status}
                      </td>
                      <td className="px-3 py-2 text-sm tabular-nums">{row.lines?.length || 0}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {canCreate && canSubmitRepairSpareIssue(row.status, row.approvalMode) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void runAction(id, () => repairSpareIssueService.submit(id), 'تم تقديم السند.')}
                            >
                              تقديم
                            </Button>
                          )}
                          {canApprove && canApproveRepairSpareIssue(row.status, row.approvalMode) && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => void runAction(id, () => repairSpareIssueService.approve(id), 'تم اعتماد السند.')}
                            >
                              اعتماد
                            </Button>
                          )}
                          {canApprove && canRejectRepairSpareIssue(row.status, row.approvalMode) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void runAction(id, () => repairSpareIssueService.reject(id), 'تم رفض السند.')}
                            >
                              رفض
                            </Button>
                          )}
                          {canIssue && canIssueRepairSpareIssue(row.status, row.approvalMode) && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => void runAction(id, () => repairSpareIssueService.issue(id), 'تم تنفيذ الصرف.')}
                            >
                              صرف
                            </Button>
                          )}
                          {canCreate && canCancelRepairSpareIssue(row.status) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void runAction(id, () => repairSpareIssueService.cancel(id), 'تم إلغاء السند.')}
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          onPageChange={setPage}
          itemLabel="سند"
        />
      </Card>

      <CreateRepairSpareIssueModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
        branches={branches}
      />
    </div>
  );
};
