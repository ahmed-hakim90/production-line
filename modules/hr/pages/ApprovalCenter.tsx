import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { employeeService } from '../employeeService';
import { leaveBalanceService } from '../leaveService';
import { leaveRequestService } from '../leaveService';
import { loanService } from '../loanService';
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
import { LEAVE_TYPE_LABELS } from '../types';

const TYPE_CONFIG: Record<ApprovalRequestType, { label: string; icon: string; color: string; bg: string }> = {
  overtime: { label: 'عمل إضافي', icon: 'schedule', color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  leave: { label: 'إجازة', icon: 'beach_access', color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  loan: { label: 'سلفة', icon: 'payments', color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
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
    const typeLabel = LEAVE_TYPE_LABELS[data.leaveType as keyof typeof LEAVE_TYPE_LABELS] || data.leaveType;
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
              'bg-slate-200 dark:bg-slate-700'
            }`} />
          )}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              step.status === 'approved' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              step.status === 'rejected' ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
              step.status === 'skipped' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
              i === currentStep ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20' :
              'border-slate-200 dark:border-slate-600 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
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
  const permissions = useAppStore((s) => s.userPermissions);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const currentUser = useAppStore((s) => s.currentUser);

  const [requests, setRequests] = useState<FirestoreApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<ApprovalRequestType | ''>('');
  const [filterStatus, setFilterStatus] = useState<'actionable' | 'all' | ApprovalRequestStatus>('actionable');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [overdueMap, setOverdueMap] = useState<Record<string, boolean>>({});

  const approverEmployeeId = currentEmployee?.id || '';
  const approverName = currentEmployee?.name || currentUser?.displayName || '';
  const viewAll = canViewAllRequests(permissions);
  const role = resolveApprovalRole(permissions);

  const caller: CallerContext = useMemo(() => ({
    employeeId: approverEmployeeId,
    employeeName: approverName,
    permissions,
  }), [approverEmployeeId, approverName, permissions]);

  const fetchData = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
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

      if (req.requestType === 'leave' && req.sourceRequestId) {
        const leaveReq = await leaveRequestService.getById(req.sourceRequestId);
        if (leaveReq) {
          const updatedRequest = await getAllRequests().then((all) => all.find((r) => r.id === req.id));
          if (updatedRequest?.status === 'approved') {
            await leaveBalanceService.deductBalance(leaveReq.employeeId, leaveReq.leaveType, leaveReq.totalDays);
          }
        }
      }

      setActionNotes((prev) => ({ ...prev, [req.id!]: '' }));
      await fetchData();
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
      setActionNotes((prev) => ({ ...prev, [req.id!]: '' }));
      await fetchData();
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
      await fetchData();
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
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
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
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            مركز الموافقات
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            مراجعة واعتماد الطلبات — {role === 'admin' ? 'مدير النظام' : role === 'hr' ? 'الموارد البشرية' : role === 'manager' ? 'مدير' : 'موظف'}
          </p>
        </div>
        {actionableCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="material-icons-round text-amber-500 text-lg">notifications_active</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
              {actionableCount} طلب بانتظار إجراءك
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الطلبات', value: stats.total, icon: 'inbox', color: 'text-blue-500' },
          { label: 'قيد الانتظار', value: stats.pending, icon: 'hourglass_top', color: 'text-amber-500' },
          { label: 'مُعتمد', value: stats.approved, icon: 'check_circle', color: 'text-emerald-500' },
          { label: 'مرفوض', value: stats.rejected, icon: 'cancel', color: 'text-rose-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
            <span className={`material-icons-round ${stat.color} text-3xl mb-2 block`}>{stat.icon}</span>
            <p className="text-xs text-slate-400 font-bold mb-1">{stat.label}</p>
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
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              filterStatus === f.key ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1" />
        <button
          onClick={() => setFilterType('')}
          className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
            filterType === '' ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600'
          }`}
        >الكل</button>
        {(Object.entries(TYPE_CONFIG) as [ApprovalRequestType, typeof TYPE_CONFIG.leave][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={`px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1 ${
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
            <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">task_alt</span>
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
                className={`bg-white dark:bg-slate-900 rounded-xl border overflow-hidden ${
                  isOverdue ? 'border-rose-300 dark:border-rose-700 shadow-lg shadow-rose-500/5' :
                  canAct ? 'border-primary/30 shadow-lg shadow-primary/5' :
                  'border-slate-200 dark:border-slate-800'
                }`}
              >
                {isOverdue && (
                  <div className="bg-rose-50 dark:bg-rose-900/20 px-5 py-2 flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 border-b border-rose-200 dark:border-rose-800">
                    <span className="material-icons-round text-sm">warning</span>
                    هذا الطلب متأخر ويحتاج تدخل عاجل
                  </div>
                )}
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeCfg.bg}`}>
                        <span className={`material-icons-round ${typeCfg.color}`}>{typeCfg.icon}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-800 dark:text-white">{formatRequestSummary(req)}</h4>
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                          {req.approvalChain[req.currentStep]?.delegatedToName && (
                            <Badge variant="info">مفوّض</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-bold">{req.employeeName}</span> — {formatRequestDetail(req)}
                        </p>
                      </div>
                    </div>
                    <StepIndicator chain={req.approvalChain} currentStep={req.currentStep} />
                  </div>

                  {canAct && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
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
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <Button
                        variant="outline"
                        onClick={() => handleCancel(req)}
                        disabled={isProcessing}
                        className="!text-slate-500 !border-slate-200"
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

