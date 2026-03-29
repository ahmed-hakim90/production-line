import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { syncLeaveApprovalDecision } from '../leaveService';
import { loanService } from '../loanService';
import { employeeService } from '../employeeService';
import {
  getAllRequests,
  getPendingApprovals,
  approveRequest,
  rejectRequest,
  cancelRequest,
  resolveApprovalRole,
  canViewAllRequests,
  isRequestOverdue,
  type CallerContext,
} from '../approval';
import type {
  FirestoreApprovalRequest,
  ApprovalRequestType,
  ApprovalRequestStatus,
  ApprovalChainSnapshot,
} from '../approval/types';
import { LEAVE_TYPE_LABELS, type ApprovalChainItem, type ApprovalStatus } from '../types';
import { ApprovalEmployeeContext } from '../components/ApprovalEmployeeContext';
import { HRNotificationBell } from '../components/HRNotificationBell';

const TYPE_CONFIG: Record<ApprovalRequestType, { label: string; icon: string; color: string; bg: string }> = {
  overtime: { label: 'عمل إضافي', icon: 'schedule', color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  leave: { label: 'إجازة', icon: 'beach_access', color: 'text-blue-500', bg: 'bg-blue-100' },
  loan: { label: 'سلفة', icon: 'payments', color: 'text-amber-500', bg: 'bg-amber-100' },
};

const STATUS_CONFIG: Record<ApprovalRequestStatus, { label: string; variant: 'warning' | 'success' | 'danger' | 'info' | 'neutral' }> = {
  pending: { label: 'قيد الانتظار', variant: 'warning' },
  in_progress: { label: 'قيد المعالجة', variant: 'info' },
  approved: { label: 'مُعتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'danger' },
  cancelled: { label: 'مُلغى', variant: 'neutral' },
  escalated: { label: 'مُصعّد', variant: 'danger' },
};

function formatRequestSummary(req: FirestoreApprovalRequest): string {
  const data = req.requestData || {};
  if (req.requestType === 'leave') {
    const typeLabel = data.leaveTypeLabel || LEAVE_TYPE_LABELS[data.leaveType as keyof typeof LEAVE_TYPE_LABELS] || data.leaveType;
    return `إجازة ${typeLabel}`;
  }
  if (req.requestType === 'loan') {
    return `سلفة ${(data.loanAmount || 0).toLocaleString('en-US')}`;
  }
  return 'عمل إضافي';
}

function formatRequestDetail(req: FirestoreApprovalRequest): string {
  const data = req.requestData || {};
  if (req.requestType === 'leave') {
    return `${data.startDate || '—'} → ${data.endDate || '—'} (${data.totalDays || 0} يوم)`;
  }
  if (req.requestType === 'loan') {
    return `${data.totalInstallments || 0} قسط × ${(data.installmentAmount || 0).toLocaleString('en-US')} — بدء: ${data.startMonth || '—'}`;
  }
  return data.description || '';
}

function mapApprovalStatusToLegacy(status: ApprovalRequestStatus): ApprovalStatus {
  if (status === 'approved') return 'approved';
  if (status === 'rejected' || status === 'cancelled') return 'rejected';
  return 'pending';
}

function mapSnapshotChainToLegacy(chain: ApprovalChainSnapshot[]): ApprovalChainItem[] {
  return chain.map((step) => ({
    approverEmployeeId: step.approverEmployeeId,
    level: step.level,
    status: step.status === 'approved' || step.status === 'skipped' ? 'approved' : step.status === 'rejected' ? 'rejected' : 'pending',
    actionDate: step.actionDate,
    notes: step.notes || '',
  }));
}

const StepIndicator: React.FC<{ chain: ApprovalChainSnapshot[]; currentStep: number }> = ({ chain, currentStep }) => {
  if (chain.length === 0) return <span className="text-xs text-slate-400">بدون سلسلة موافقات</span>;

  return (
    <div className="flex items-center gap-1">
      {chain.map((step, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className={`w-4 h-0.5 ${
              step.status === 'approved' ? 'bg-emerald-400' :
              step.status === 'rejected' ? 'bg-rose-400' :
              step.status === 'skipped' ? 'bg-amber-400' :
              'bg-slate-200'
            }`} />
          )}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              step.status === 'approved' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' :
              step.status === 'rejected' ? 'border-rose-400 bg-rose-50 text-rose-700' :
              step.status === 'skipped' ? 'border-amber-400 bg-amber-50 text-amber-700' :
              i === currentStep ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20' :
              'border-[var(--color-border)] bg-[#f8f9fa] text-[var(--color-text-muted)]'
            }`}
            title={`${step.approverName} — ${step.approverJobTitle}${step.notes ? ` — ${step.notes}` : ''}${step.delegatedToName ? ` (مفوّض: ${step.delegatedToName})` : ''}`}
          >
            {step.status === 'approved' ? <span className="material-icons-round text-sm">check</span> :
             step.status === 'rejected' ? <span className="material-icons-round text-sm">close</span> :
             step.status === 'skipped' ? <span className="material-icons-round text-sm">skip_next</span> :
             step.level}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export const ApprovalCenter: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const permissions = useAppStore((s) => s.userPermissions);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const [resolvedApprover, setResolvedApprover] = useState<{ id: string; name: string }>({
    id: currentEmployee?.id || '',
    name: currentEmployee?.name || userDisplayName || '',
  });

  const [requests, setRequests] = useState<FirestoreApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<ApprovalRequestType | ''>('');
  const [filterStatus, setFilterStatus] = useState<'actionable' | 'all' | ApprovalRequestStatus>('actionable');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [overdueMap, setOverdueMap] = useState<Record<string, boolean>>({});
  const [expandedContext, setExpandedContext] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const resolveApprover = async () => {
      if (currentEmployee?.id) {
        if (active) {
          setResolvedApprover({
            id: currentEmployee.id,
            name: currentEmployee.name || userDisplayName || '',
          });
        }
        return;
      }
      if (!uid) {
        if (active) setResolvedApprover({ id: '', name: userDisplayName || '' });
        return;
      }
      try {
        const linkedEmployee = await employeeService.getByUserId(uid);
        if (active) {
          setResolvedApprover({
            id: linkedEmployee?.id || '',
            name: linkedEmployee?.name || userDisplayName || '',
          });
        }
      } catch {
        if (active) setResolvedApprover({ id: '', name: userDisplayName || '' });
      }
    };
    void resolveApprover();
    return () => { active = false; };
  }, [currentEmployee?.id, currentEmployee?.name, uid, userDisplayName]);

  const approverEmployeeId = resolvedApprover.id;
  const approverName = resolvedApprover.name || currentEmployee?.name || userDisplayName || '';
  const viewAll = canViewAllRequests(permissions);
  const role = resolveApprovalRole(permissions);

  const caller: CallerContext = useMemo(() => ({
    employeeId: approverEmployeeId,
    employeeName: approverName,
    permissions,
  }), [approverEmployeeId, approverName, permissions]);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      let data: FirestoreApprovalRequest[];
      if (viewAll) {
        data = await getAllRequests();
      } else if (approverEmployeeId) {
        const [pending, own] = await Promise.all([
          getPendingApprovals({ approverEmployeeId }),
          getAllRequests(),
        ]);
        const ownRequests = own.filter((r) => r.employeeId === approverEmployeeId);
        const merged = new Map<string, FirestoreApprovalRequest>();
        [...pending, ...ownRequests].forEach((r) => { if (r.id) merged.set(r.id, r); });
        data = Array.from(merged.values());
      } else {
        data = [];
      }

      data.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      setRequests(data);

      const overdue: Record<string, boolean> = {};
      for (const r of data) {
        if (r.status === 'pending' || r.status === 'in_progress') {
          overdue[r.id!] = await isRequestOverdue(r);
        }
      }
      setOverdueMap(overdue);
    } catch (err) {
      console.error('Error loading approvals:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [viewAll, approverEmployeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = useCallback(async (req: FirestoreApprovalRequest) => {
    if (!req.id) return;
    setActionLoading(req.id);
    try {
      const result = await approveRequest(
        { requestId: req.id, approverEmployeeId, approverName, action: 'approved', notes: actionNotes[req.id] || '' },
        caller,
      );
      if (!result.success) { alert(result.error || 'حدث خطأ'); return; }

      const updatedRequest = await getAllRequests().then((all) => all.find((r) => r.id === req.id));
      if (updatedRequest?.sourceRequestId) {
        const mappedStatus = mapApprovalStatusToLegacy(updatedRequest.status);
        const mappedChain = mapSnapshotChainToLegacy(updatedRequest.approvalChain);
        if (updatedRequest.requestType === 'leave') {
          const syncResult = await syncLeaveApprovalDecision({
            leaveRequestId: updatedRequest.sourceRequestId,
            approvalChain: mappedChain,
            decisionStatus: mappedStatus,
          });
          if (!syncResult.success) {
            console.warn('Leave sync warning (approve):', syncResult.error);
          }
        } else if (updatedRequest.requestType === 'loan') {
          await loanService.updateApproval(
            updatedRequest.sourceRequestId,
            mappedChain,
            mappedStatus,
          );
        }
      }

      setActionNotes((prev) => ({ ...prev, [req.id!]: '' }));
      await fetchData({ silent: true });
    } catch (err) {
      console.error('Approval error:', err);
    } finally {
      setActionLoading(null);
    }
  }, [approverEmployeeId, approverName, actionNotes, caller, fetchData]);

  const handleReject = useCallback(async (req: FirestoreApprovalRequest) => {
    if (!req.id) return;
    setActionLoading(req.id);
    try {
      const result = await rejectRequest(
        { requestId: req.id, approverEmployeeId, approverName, action: 'rejected', notes: actionNotes[req.id] || '' },
        caller,
      );
      if (!result.success) { alert(result.error || 'حدث خطأ'); return; }
      const updatedRequest = await getAllRequests().then((all) => all.find((r) => r.id === req.id));
      if (updatedRequest?.sourceRequestId) {
        const mappedStatus = mapApprovalStatusToLegacy(updatedRequest.status);
        const mappedChain = mapSnapshotChainToLegacy(updatedRequest.approvalChain);
        if (updatedRequest.requestType === 'leave') {
          const syncResult = await syncLeaveApprovalDecision({
            leaveRequestId: updatedRequest.sourceRequestId,
            approvalChain: mappedChain,
            decisionStatus: mappedStatus,
          });
          if (!syncResult.success) {
            console.warn('Leave sync warning (reject):', syncResult.error);
          }
        } else if (updatedRequest.requestType === 'loan') {
          await loanService.updateApproval(
            updatedRequest.sourceRequestId,
            mappedChain,
            mappedStatus,
          );
        }
      }
      setActionNotes((prev) => ({ ...prev, [req.id!]: '' }));
      await fetchData({ silent: true });
    } catch (err) {
      console.error('Rejection error:', err);
    } finally {
      setActionLoading(null);
    }
  }, [approverEmployeeId, approverName, actionNotes, caller, fetchData]);

  const handleCancel = useCallback(async (req: FirestoreApprovalRequest) => {
    if (!req.id || !confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) return;
    setActionLoading(req.id);
    try {
      const result = await cancelRequest(
        { requestId: req.id, cancelledBy: approverEmployeeId, cancelledByName: approverName },
        caller,
      );
      if (!result.success) { alert(result.error || 'حدث خطأ'); return; }
      const updatedRequest = await getAllRequests().then((all) => all.find((r) => r.id === req.id));
      if (updatedRequest?.sourceRequestId) {
        const mappedStatus = mapApprovalStatusToLegacy(updatedRequest.status);
        const mappedChain = mapSnapshotChainToLegacy(updatedRequest.approvalChain);
        if (updatedRequest.requestType === 'leave') {
          const syncResult = await syncLeaveApprovalDecision({
            leaveRequestId: updatedRequest.sourceRequestId,
            approvalChain: mappedChain,
            decisionStatus: mappedStatus,
          });
          if (!syncResult.success) {
            console.warn('Leave sync warning (cancel):', syncResult.error);
          }
        } else if (updatedRequest.requestType === 'loan') {
          await loanService.updateApproval(
            updatedRequest.sourceRequestId,
            mappedChain,
            mappedStatus,
          );
        }
      }
      await fetchData({ silent: true });
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setActionLoading(null);
    }
  }, [approverEmployeeId, approverName, caller, fetchData]);

  const canActOnStep = useCallback((req: FirestoreApprovalRequest): boolean => {
    if (req.status !== 'pending' && req.status !== 'in_progress' && req.status !== 'escalated') return false;
    if (role === 'admin') return true;
    if (req.currentStep >= req.approvalChain.length) return false;
    const step = req.approvalChain[req.currentStep];
    return step.approverEmployeeId === approverEmployeeId || step.delegatedTo === approverEmployeeId;
  }, [approverEmployeeId, role]);

  const toggleContext = useCallback((requestId: string) => {
    setExpandedContext((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = requests;
    if (filterType) result = result.filter((r) => r.requestType === filterType);
    if (filterStatus === 'actionable') {
      result = result.filter((r) => canActOnStep(r));
    } else if (filterStatus !== 'all') {
      result = result.filter((r) => r.status === filterStatus);
    }
    return result;
  }, [requests, filterType, filterStatus, canActOnStep]);

  const actionableCount = useMemo(() =>
    requests.filter(canActOnStep).length,
  [requests, canActOnStep]);

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending' || r.status === 'in_progress').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  }), [requests]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-[var(--border-radius-lg)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">مركز الموافقات</h2>
          <p className="text-sm text-[var(--color-text-muted)] font-medium">
            مراجعة واعتماد الطلبات — {role === 'admin' ? 'مدير النظام' : role === 'hr' ? 'الموارد البشرية' : role === 'manager' ? 'مدير' : 'موظف'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {actionableCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] px-4 py-2 flex items-center gap-2">
              <span className="material-icons-round text-amber-500 text-lg">notifications_active</span>
              <span className="text-sm font-bold text-amber-700">{actionableCount} طلب بانتظار إجراءك</span>
            </div>
          )}
          {currentEmployee?.id && <HRNotificationBell employeeId={currentEmployee.id} />}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الطلبات', value: stats.total, icon: 'inbox', color: 'text-blue-500' },
          { label: 'قيد الانتظار', value: stats.pending, icon: 'hourglass_top', color: 'text-amber-500' },
          { label: 'مُعتمد', value: stats.approved, icon: 'check_circle', color: 'text-emerald-500' },
          { label: 'مرفوض', value: stats.rejected, icon: 'cancel', color: 'text-rose-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className={`material-icons-round ${stat.color} text-3xl mb-2 block`}>{stat.icon}</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">{stat.label}</p>
            <p className="text-2xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'actionable', label: 'بانتظار إجراءي' },
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'قيد الانتظار' },
          { key: 'approved', label: 'مُعتمد' },
          { key: 'rejected', label: 'مرفوض' },
          { key: 'escalated', label: 'مُصعّد' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key as any)}
            className={`px-4 py-2 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
              filterStatus === f.key ? 'bg-primary text-white' : 'bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="w-px bg-slate-200 mx-1" />
        <button
          onClick={() => setFilterType('')}
          className={`px-3 py-2 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
            filterType === '' ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600'
          }`}
        >الكل</button>
        {(Object.entries(TYPE_CONFIG) as [ApprovalRequestType, typeof TYPE_CONFIG.leave][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={`px-3 py-2 rounded-[var(--border-radius-base)] text-sm font-bold transition-all flex items-center gap-1 ${
              filterType === key ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className={`material-icons-round text-sm ${filterType === key ? 'text-primary' : cfg.color}`}>{cfg.icon}</span>
            {cfg.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block">task_alt</span>
            <p className="text-sm font-bold text-slate-500">
              {filterStatus === 'actionable' ? 'لا توجد طلبات بانتظار إجراءك' : 'لا توجد طلبات'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => {
            const typeCfg = TYPE_CONFIG[req.requestType];
            const statusCfg = STATUS_CONFIG[req.status];
            const canAct = canActOnStep(req);
            const isProcessing = actionLoading === req.id;
            const isOverdue = overdueMap[req.id!];
            const isOwn = req.employeeId === approverEmployeeId;

            return (
              <div
                key={req.id}
                className={`bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border overflow-hidden ${
                  isOverdue ? 'border-rose-300 dark:border-rose-700 shadow-rose-500/5' :
                  canAct ? 'border-primary/30 shadow-primary/5' :
                  'border-[var(--color-border)]'
                }`}
              >
                {isOverdue && (
                  <div className="bg-rose-50 px-5 py-2 flex items-center gap-2 text-xs font-bold text-rose-600 border-b border-rose-200">
                    <span className="material-icons-round text-sm">warning</span>
                    هذا الطلب متأخر ويحتاج تدخل عاجل
                  </div>
                )}
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center ${typeCfg.bg}`}>
                        <span className={`material-icons-round ${typeCfg.color}`}>{typeCfg.icon}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-[var(--color-text)]">{formatRequestSummary(req)}</h4>
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                          {req.approvalChain[req.currentStep]?.delegatedToName && (
                            <Badge variant="info">مفوّض</Badge>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          <span className="font-bold">{req.employeeName}</span> — {formatRequestDetail(req)}
                        </p>
                        {canAct && (
                          <button onClick={() => toggleContext(req.id!)} className="text-xs text-primary font-medium flex items-center gap-1 mt-2">
                            <span className="material-icons-round text-sm">{expandedContext.has(req.id!) ? 'expand_less' : 'info'}</span>
                            {expandedContext.has(req.id!) ? 'إخفاء التفاصيل' : 'عرض بيانات الموظف'}
                          </button>
                        )}
                      </div>
                    </div>
                    <StepIndicator chain={req.approvalChain} currentStep={req.currentStep} />
                  </div>

                  {canAct && expandedContext.has(req.id!) && (
                    <ApprovalEmployeeContext
                      employeeId={req.employeeId}
                      requestType={req.requestType}
                      requestData={req.requestData || {}}
                    />
                  )}

                  {canAct && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-2.5 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                          placeholder="ملاحظات (اختياري)..."
                          value={actionNotes[req.id!] || ''}
                          onChange={(e) => setActionNotes((prev) => ({ ...prev, [req.id!]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleReject(req)}
                            disabled={isProcessing}
                            className="!border-rose-200 !text-rose-600 hover:!bg-rose-50 dark:!border-rose-800 dark:!text-rose-400"
                          >
                            {isProcessing && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                            <span className="material-icons-round text-sm">close</span>
                            رفض
                          </Button>
                          <Button variant="secondary" onClick={() => handleApprove(req)} disabled={isProcessing}>
                            {isProcessing && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                            <span className="material-icons-round text-sm">check</span>
                            اعتماد
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isOwn && req.status === 'pending' && req.currentStep === 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                      <Button
                        variant="outline"
                        onClick={() => handleCancel(req)}
                        disabled={isProcessing}
                        className="!text-slate-500 !border-[var(--color-border)]"
                      >
                        <span className="material-icons-round text-sm">block</span>
                        إلغاء الطلب
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

