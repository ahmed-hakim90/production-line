import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Badge, SearchableSelect } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { usePermission } from '@/utils/permissions';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { useAppStore } from '@/store/useAppStore';
import { leaveRequestService, leaveBalanceService } from '../leaveService';
import { createLeaveRequest } from '../usecases/createLeaveRequest';
import { unwrapOrThrow } from '@/shared/usecases';
import { employeeService } from '../employeeService';
import { createRequest, getRequestsByType, type ApprovalEmployeeInfo } from '../approval';
import { exportLeaveRequests } from '@/utils/exportExcel';
import { getLeaveTypesFromConfig, leaveTypeMapByKey, type LeaveTypeDefinition } from '../leaveTypes';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  LeaveType,
  ApprovalStatus,
} from '../types';
import { LEAVE_TYPE_LABELS } from '../types';
import { PageHeader } from '../../../components/PageHeader';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

type LeaveRequestsPageData = {
  requests: FirestoreLeaveRequest[];
  allEmployees: FirestoreEmployee[];
  balance: FirestoreLeaveBalance | null;
  leaveTypes: LeaveTypeDefinition[];
  formEmployeeId: string;
  formLeaveType: LeaveType;
};

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'قيد الانتظار', variant: 'warning' },
  approved: { label: 'مُعتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'danger' },
};

function calculateDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function toApprovalEmployeeInfo(e: FirestoreEmployee): ApprovalEmployeeInfo {
  const level = e.level as number;
  return {
    employeeId: e.id!,
    employeeName: e.name,
    managerId: e.managerId,
    departmentId: e.departmentId || 'unknown_department',
    departmentName: e.departmentId || 'unknown_department',
    jobPositionId: e.jobPositionId || 'unknown_position',
    jobTitle: e.jobPositionId || 'unknown_position',
    jobLevel: Math.min(4, Math.max(1, level)) as 1 | 2 | 3 | 4,
  };
}

function getManagedEmployeeIds(managerId: string, employees: FirestoreEmployee[]): Set<string> {
  const directReports = new Map<string, string[]>();
  employees.forEach((employee) => {
    if (!employee.id || !employee.managerId) return;
    const rows = directReports.get(employee.managerId) ?? [];
    rows.push(employee.id);
    directReports.set(employee.managerId, rows);
  });

  const managed = new Set<string>();
  const queue = [...(directReports.get(managerId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (managed.has(id)) continue;
    managed.add(id);
    queue.push(...(directReports.get(id) ?? []));
  }

  return managed;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const LeaveRequests: React.FC = () => {
  const { can } = usePermission();
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const uid = useAppStore((s) => s.uid);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const permissions = useAppStore((s) => s.userPermissions);

  const isHR = can('leave.manage');
  const canCreateLeave = can('leave.create') || isHR;
  const canDelete = can('leave.manage') || can('hrSettings.edit');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'leaveRequests'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const employeeId = currentEmployee?.id || uid || '';
  const viewerEmployeeId = currentEmployee?.id || '';
  const LEAVE_CACHE_KEY = `hr:leave-requests:${isHR ? 'hr' : 'self'}:${employeeId || 'anon'}`;
  const initialLeaveCache = peekPageDataCache<LeaveRequestsPageData>(LEAVE_CACHE_KEY);

  const [requests, setRequests] = useState<FirestoreLeaveRequest[]>(initialLeaveCache?.requests ?? []);
  const [allEmployees, setAllEmployees] = useState<FirestoreEmployee[]>(initialLeaveCache?.allEmployees ?? []);
  const [balance, setBalance] = useState<FirestoreLeaveBalance | null>(initialLeaveCache?.balance ?? null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDefinition[]>(initialLeaveCache?.leaveTypes ?? []);
  const [loading, setLoading] = useState(() => initialLeaveCache == null);
  const [showForm, setShowForm] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | ''>('');

  // Form state
  const [formEmployeeId, setFormEmployeeId] = useState(initialLeaveCache?.formEmployeeId ?? '');
  const [formLeaveType, setFormLeaveType] = useState<LeaveType>(initialLeaveCache?.formLeaveType ?? 'annual');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const empNameMap = useMemo(() => {
    const m = new Map<string, string>();
    allEmployees.forEach((e) => {
      if (e.id) m.set(e.id, e.name);
      if (e.userId) m.set(e.userId, e.name);
    });
    return m;
  }, [allEmployees]);

  const getEmpName = useCallback((id: string) => empNameMap.get(id) || id, [empNameMap]);
  const getPendingChainSummary = useCallback((req: FirestoreLeaveRequest) => {
    const pendingSteps = req.approvalChain.filter((step) => step.status === 'pending');
    if (pendingSteps.length === 0) {
      return {
        currentApprover: '—',
        untilMe: 'اكتملت الموافقات',
      };
    }

    const currentStep = pendingSteps[0];
    const currentApprover = getEmpName(currentStep.approverEmployeeId);
    const myIndex = viewerEmployeeId
      ? pendingSteps.findIndex((step) => step.approverEmployeeId === viewerEmployeeId)
      : -1;

    if (!viewerEmployeeId) {
      return {
        currentApprover,
        untilMe: pendingSteps.map((step) => getEmpName(step.approverEmployeeId)).join(' ← '),
      };
    }

    if (myIndex === -1) {
      return {
        currentApprover,
        untilMe: 'ليس ضمن سلسلة الموافقة',
      };
    }

    if (myIndex === 0) {
      return {
        currentApprover,
        untilMe: 'الدور عليك الآن',
      };
    }

    const routeToMe = pendingSteps
      .slice(0, myIndex + 1)
      .map((step) => getEmpName(step.approverEmployeeId))
      .join(' ← ');

    return {
      currentApprover,
      untilMe: `قبلك ${myIndex} مرحلة: ${routeToMe}`,
    };
  }, [getEmpName, viewerEmployeeId]);
  const leaveTypeByKey = useMemo(() => leaveTypeMapByKey(leaveTypes), [leaveTypes]);
  const selectedLeaveType = leaveTypeByKey[formLeaveType];
  const managedEmployeeIds = useMemo(
    () => (viewerEmployeeId ? getManagedEmployeeIds(viewerEmployeeId, allEmployees) : new Set<string>()),
    [allEmployees, viewerEmployeeId],
  );
  const requestableEmployees = useMemo(() => {
    const visibleIds = new Set<string>();
    if (employeeId) visibleIds.add(employeeId);
    if (isHR) {
      allEmployees.forEach((employee) => {
        if (employee.id) visibleIds.add(employee.id);
      });
    } else if (canCreateLeave) {
      managedEmployeeIds.forEach((id) => visibleIds.add(id));
    }
    return Array.from(visibleIds)
      .map((id) => allEmployees.find((employee) => employee.id === id) || (id === employeeId ? currentEmployee : null))
      .filter((employee): employee is FirestoreEmployee => Boolean(employee?.id))
      .map((employee) => ({ value: employee.id!, label: employee.id === employeeId ? `${employee.name} (أنا)` : employee.name }));
  }, [allEmployees, canCreateLeave, currentEmployee, employeeId, isHR, managedEmployeeIds]);

  const applyLeaveData = useCallback((data: LeaveRequestsPageData) => {
    setRequests(data.requests);
    setBalance(data.balance);
    setAllEmployees(data.allEmployees);
    setFormEmployeeId((prev) => prev || data.formEmployeeId);
    setLeaveTypes(data.leaveTypes);
    setFormLeaveType((prev) =>
      data.leaveTypes.find((row) => row.key === prev)
        ? prev
        : data.formLeaveType,
    );
  }, []);

  const formEmployeeIdRef = useRef(formEmployeeId);
  formEmployeeIdRef.current = formEmployeeId;

  const fetchData = useCallback(async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<LeaveRequestsPageData>(LEAVE_CACHE_KEY);
    if (cached) {
      applyLeaveData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        LEAVE_CACHE_KEY,
        async (): Promise<LeaveRequestsPageData> => {
          const currentFormEmployeeId = formEmployeeIdRef.current;
          const [emps, configuredLeaveTypes] = await Promise.all([
            (isHR || canCreateLeave) ? employeeService.getAll() : Promise.resolve(currentEmployee?.id ? [currentEmployee] : []),
            getLeaveTypesFromConfig(),
          ]);
          const targetIds = new Set<string>();
          if (employeeId) targetIds.add(employeeId);
          if (isHR) {
            emps.forEach((employee) => {
              if (employee.id) targetIds.add(employee.id);
            });
          } else if (canCreateLeave && viewerEmployeeId) {
            getManagedEmployeeIds(viewerEmployeeId, emps).forEach((id) => targetIds.add(id));
          }
          const allRequests = isHR
            ? await leaveRequestService.getAll()
            : (await Promise.all(Array.from(targetIds).map((id) => leaveRequestService.getByEmployee(id)))).flat();
          const selectedEmployeeId = currentFormEmployeeId && targetIds.has(currentFormEmployeeId)
            ? currentFormEmployeeId
            : employeeId;
          const bal = selectedEmployeeId
            ? await leaveBalanceService.getOrCreate(selectedEmployeeId)
            : null;

          // One-time silent backfill for old pending leave requests that were created
          // before approval-center linking was enforced.
          const pendingWithoutChain = allRequests.filter((req) => req.id && req.finalStatus === 'pending');
          if (pendingWithoutChain.length > 0) {
            const [existingApprovalRequests, employeesForApprovalRaw] = await Promise.all([
              getRequestsByType('leave').catch(() => []),
              employeeService.getAll(),
            ]);
            const linkedSourceIds = new Set(
              existingApprovalRequests
                .map((req) => String(req.sourceRequestId || '').trim())
                .filter(Boolean),
            );
            const missing = pendingWithoutChain.filter((req) => !linkedSourceIds.has(String(req.id)));
            if (missing.length > 0) {
              const approvalEmployees = employeesForApprovalRaw
                .filter((e): e is FirestoreEmployee => Boolean(e.id))
                .map((e) => toApprovalEmployeeInfo(e));
              const callerEmployeeId = currentEmployee?.id || employeeId;
              const callerName = currentEmployee?.name || userDisplayName || employeeId || '—';
              for (const req of missing) {
                await createRequest(
                  {
                    requestType: 'leave',
                    employeeId: req.employeeId,
                    requestData: {
                      leaveType: req.leaveType,
                      leaveTypeLabel: req.leaveTypeLabel || LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType,
                      startDate: req.startDate,
                      endDate: req.endDate,
                      totalDays: req.totalDays,
                      reason: req.reason || '—',
                    },
                    sourceRequestId: req.id,
                    createdBy: req.createdBy || uid || '',
                  },
                  {
                    employeeId: callerEmployeeId,
                    employeeName: callerName,
                    permissions,
                  },
                  approvalEmployees,
                );
              }
            }
          }

          return {
            requests: allRequests,
            balance: bal,
            allEmployees: emps,
            formEmployeeId: selectedEmployeeId,
            leaveTypes: configuredLeaveTypes,
            formLeaveType: configuredLeaveTypes[0]?.key || 'annual',
          };
        },
        { force: opts?.force === true, maxAgeMs: 45_000 },
      );
      applyLeaveData(data);
    } catch (err) {
      console.error('Error loading leave data:', err);
    } finally {
      setLoading(false);
    }
  }, [
    LEAVE_CACHE_KEY,
    applyLeaveData,
    employeeId,
    isHR,
    canCreateLeave,
    currentEmployee,
    userDisplayName,
    permissions,
    uid,
    viewerEmployeeId,
  ]);

  const reload = useCallback(async () => {
    invalidatePageDataCache(LEAVE_CACHE_KEY);
    await fetchData({ force: true });
  }, [LEAVE_CACHE_KEY, fetchData]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const formDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 0;
    return calculateDays(formStartDate, formEndDate);
  }, [formStartDate, formEndDate]);

  const handleSubmit = useCallback(async () => {
    const targetEmployeeId = formEmployeeId || employeeId;
    const targetEmployee = allEmployees.find((employee) => employee.id === targetEmployeeId)
      || (targetEmployeeId === currentEmployee?.id ? currentEmployee : null);
    if (!targetEmployeeId || !formStartDate || !formEndDate || formDays <= 0) return;
    setSubmitting(true);
    try {
      const leavePayload = {
        employeeId: targetEmployeeId,
        employeeName: targetEmployee?.name,
        leaveType: formLeaveType,
        leaveTypeLabel: selectedLeaveType?.label || LEAVE_TYPE_LABELS[formLeaveType] || formLeaveType,
        leaveTypeIsPaid: selectedLeaveType ? selectedLeaveType.isPaid : formLeaveType !== 'unpaid',
        startDate: formStartDate,
        endDate: formEndDate,
        totalDays: formDays,
        affectsSalary: selectedLeaveType ? !selectedLeaveType.isPaid : formLeaveType === 'unpaid',
        status: 'pending' as ApprovalStatus,
        approvalChain: [],
        finalStatus: 'pending' as ApprovalStatus,
        reason: formReason,
        createdBy: uid || '',
        requestedByEmployeeId: currentEmployee?.id || employeeId,
        requestedByName: currentEmployee?.name || userDisplayName || '',
        requestedOnBehalf: targetEmployeeId !== (currentEmployee?.id || employeeId),
      };
      const leaveId = unwrapOrThrow(await createLeaveRequest(leavePayload, {
        userId: uid || undefined,
        userName: userDisplayName || undefined,
      })).leaveRequestId;
      const allEmployeesForApproval = await employeeService.getAll();
      const approvalEmployees = allEmployeesForApproval
        .filter((e): e is FirestoreEmployee => Boolean(e.id))
        .map((e) => toApprovalEmployeeInfo(e));
      const callerEmployeeId = currentEmployee?.id || employeeId;
      const callerName = currentEmployee?.name || userDisplayName || leavePayload.employeeId;
      const approvalResult = await createRequest(
        {
          requestType: 'leave',
          employeeId: targetEmployeeId,
          requestData: {
            leaveType: formLeaveType,
            leaveTypeLabel: leavePayload.leaveTypeLabel,
            employeeName: targetEmployee?.name || getEmpName(targetEmployeeId),
            startDate: formStartDate,
            endDate: formEndDate,
            totalDays: formDays,
            reason: formReason || '—',
            requestedByEmployeeId: leavePayload.requestedByEmployeeId,
            requestedByName: leavePayload.requestedByName,
            requestedOnBehalf: leavePayload.requestedOnBehalf,
          },
          sourceRequestId: leaveId,
          createdBy: uid || '',
        },
        {
          employeeId: callerEmployeeId,
          employeeName: callerName,
          permissions,
        },
        approvalEmployees,
      );
      if (!approvalResult.success) {
        await leaveRequestService.delete(leaveId);
        throw new Error(approvalResult.error || 'تعذر إنشاء سلسلة الموافقة');
      }
      setShowForm(false);
      setFormStartDate('');
      setFormEndDate('');
      setFormReason('');
      await reload();
    } catch (err) {
      console.error('Error creating leave request:', err);
      alert((err as Error).message || 'تعذر إرسال طلب الإجازة للموافقات');
    } finally {
      setSubmitting(false);
    }
  }, [allEmployees, employeeId, uid, formEmployeeId, formLeaveType, formStartDate, formEndDate, formDays, formReason, reload, selectedLeaveType, currentEmployee, userDisplayName, permissions, getEmpName]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      await leaveRequestService.delete(id);
      setDeleteConfirm(null);
      await reload();
    } catch (err) {
      console.error('Error deleting leave request:', err);
    } finally {
      setDeleting(false);
    }
  }, [reload]);

  const filtered = useMemo(() => {
    let result = requests;
    if (filterEmployee) {
      result = result.filter((r) => r.employeeId === filterEmployee);
    }
    if (filterStatus) {
      result = result.filter((r) => r.finalStatus === filterStatus);
    }
    return result;
  }, [requests, filterEmployee, filterStatus]);

  const uniqueEmployees = useMemo(() => {
    const ids = [...new Set(requests.map((r) => r.employeeId))];
    return ids.map((id) => ({ value: id, label: getEmpName(id) }));
  }, [requests, getEmpName]);
  const showEmployeeColumn = isHR || requestableEmployees.length > 1;

  if (loading && requests.length === 0) {
    return <PageContentSkeleton variant="list" showFilters tableRows={8} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="إدارة الإجازات"
      rangeLabel="طلب إجازة ومتابعة الأرصدة وحالات الموافقة"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canCreateLeave ? (
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <span className="material-icons-round text-sm">{showForm ? 'close' : 'add'}</span>
              {showForm ? 'إغلاق' : 'طلب إجازة'}
            </Button>
          ) : null}
          <div className="[&_.erp-page-title-block]:hidden [&_.erp-page-head]:m-0 [&_.erp-page-head]:min-h-0 [&_.erp-page-head]:border-0 [&_.erp-page-head]:p-0">
            <PageHeader
              title=""
              backAction={false}
              moreActions={[
                {
                  label: 'تصدير Excel',
                  icon: 'download',
                  group: 'تصدير',
                  hidden: !canExportFromPage || filtered.length === 0,
                  onClick: () => {
                    const employeeMap = new Map<string, { name: string }>();
                    empNameMap.forEach((name, id) => employeeMap.set(id, { name }));
                    exportLeaveRequests(filtered, employeeMap);
                  },
                },
              ]}
            />
          </div>
        </div>
      }
    >

      {/* Balance Cards */}
      {balance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-blue-500 text-3xl mb-2 block">beach_access</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">سنوية</p>
            <p className="text-2xl font-bold text-blue-600">{balance.annualBalance}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-rose-500 text-3xl mb-2 block">local_hospital</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مرضية</p>
            <p className="text-2xl font-bold text-rose-600">{balance.sickBalance}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-amber-500 text-3xl mb-2 block">warning</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">الرصيد</p>
            <p className="text-2xl font-bold text-amber-600">{balance.emergencyBalance}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-[var(--color-text-muted)] text-3xl mb-2 block">money_off</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">بدون راتب (مأخوذة)</p>
            <p className="text-2xl font-bold text-slate-600">{balance.unpaidTaken}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <OpsDashPanel
          title={requestableEmployees.length > 1 ? 'طلب إجازة جديد للفريق' : 'طلب إجازة جديد'}
          accent="hr"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requestableEmployees.length > 1 && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                  الموظف
                </label>
                <SearchableSelect
                  options={requestableEmployees}
                  value={formEmployeeId || employeeId}
                  onChange={setFormEmployeeId}
                  placeholder="اختر الموظف..."
                />
                {formEmployeeId && formEmployeeId !== employeeId && (
                  <p className="mt-2 text-xs font-bold text-blue-600">
                    سيتم إرسال الطلب نيابة عن {getEmpName(formEmployeeId)} عبر سلسلة مديره حتى مدير الموارد البشرية.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                نوع الإجازة
              </label>
              <select
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                value={formLeaveType}
                onChange={(e) => setFormLeaveType(e.target.value as LeaveType)}
              >
                {(leaveTypes.length
                  ? leaveTypes
                  : Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => ({ key, label, isPaid: key !== 'unpaid' }))
                ).map((row) => (
                  <option key={row.key} value={row.key}>{row.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <div className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm bg-[#f8f9fa]">
                <span className="text-[var(--color-text-muted)] font-bold">الأثر على الراتب: </span>
                <span className={selectedLeaveType?.isPaid === false ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold'}>
                  {selectedLeaveType?.isPaid === false ? 'غير مدفوعة (سيتم الخصم)' : 'مدفوعة (بدون خصم)'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                تاريخ البداية
              </label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                تاريخ النهاية
              </label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                min={formStartDate}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                السبب
              </label>
              <textarea
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none resize-none"
                rows={3}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="سبب الإجازة..."
              />
            </div>
          </div>

          {formDays > 0 && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
              <span className="material-icons-round text-blue-500">info</span>
              <p className="text-sm font-bold text-blue-700">
                مدة الإجازة: {formDays} يوم
              </p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !formStartDate || !formEndDate || formDays <= 0}
            >
              {submitting ? 'جاري التقديم...' : 'تقديم الطلب'}
            </Button>
          </div>
        </OpsDashPanel>
      )}

      <OpsDashPanel title="طلبات الإجازة" accent="hr" bodyClassName="p-0">
        <SmartFilterBar
      pageId="hr-leave-requests"
          quickFilters={[
            {
              key: 'status',
              placeholder: 'الحالة',
              options: [
                { value: 'pending', label: 'قيد الانتظار' },
                { value: 'approved', label: 'مُعتمد' },
                { value: 'rejected', label: 'مرفوض' },
              ],
            },
          ]}
          quickFilterValues={{ status: filterStatus }}
          onQuickFilterChange={(key, value) => setFilterStatus(value as ApprovalStatus | '')}
          extra={
            showEmployeeColumn ? (
              <SearchableSelect
                options={[{ value: '', label: 'جميع الموظفين' }, ...uniqueEmployees]}
                value={filterEmployee}
                onChange={setFilterEmployee}
                placeholder="تصفية بالموظف..."
                className="w-64"
              />
            ) : undefined
          }
          className="mb-0 border-0 rounded-none"
        />
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block">
              event_busy
            </span>
            <p className="text-sm font-bold text-slate-500">لا توجد طلبات إجازة</p>
          </div>
        ) : (
          <>
            <div className="erp-mobile-card-list p-2">
              {filtered.map((req) => {
                const statusCfg = STATUS_CONFIG[req.finalStatus];
                const pendingSummary = getPendingChainSummary(req);
                return (
                  <div
                    key={`m-${req.id}`}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {showEmployeeColumn && (
                          <p className="text-sm font-bold truncate">{getEmpName(req.employeeId)}</p>
                        )}
                        <Badge variant="info">
                          {leaveTypeByKey[req.leaveType]?.label || req.leaveTypeLabel || LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType}
                        </Badge>
                      </div>
                      <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-[10px] text-[var(--color-text-muted)]">من</dt>
                        <dd className="font-mono text-xs" dir="ltr">{req.startDate}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[var(--color-text-muted)]">إلى</dt>
                        <dd className="font-mono text-xs" dir="ltr">{req.endDate}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[var(--color-text-muted)]">الأيام</dt>
                        <dd className="font-bold">{req.totalDays}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[var(--color-text-muted)]">تؤثر على الراتب</dt>
                        <dd>
                          {(typeof req.leaveTypeIsPaid === 'boolean' ? !req.leaveTypeIsPaid : req.affectsSalary)
                            ? <span className="text-rose-500 font-bold">نعم</span>
                            : <span className="text-[var(--color-text-muted)]">لا</span>}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs font-bold text-[var(--color-text)]">
                      الآن: {pendingSummary.currentApprover}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{pendingSummary.untilMe}</p>
                    {canDelete && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(req.id!)}
                          className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-2 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
                        >
                          <span className="material-icons-round text-base">delete</span>
                          حذف
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="erp-desktop-table erp-table-wrap overflow-x-auto">
              <table className="erp-table w-full min-w-[860px] text-sm">
                <thead className="erp-thead">
                  <tr>
                    {showEmployeeColumn && <th className="erp-th">الموظف</th>}
                    <th className="erp-th">النوع</th>
                    <th className="erp-th">من</th>
                    <th className="erp-th">إلى</th>
                    <th className="erp-th">الأيام</th>
                    <th className="erp-th">تؤثر على الراتب</th>
                    <th className="erp-th">الحالة</th>
                    <th className="erp-th">مراحل الموافقة</th>
                    <th className="erp-th">المعتمد الحالي / حتى يصل لي</th>
                    {canDelete && <th className="erp-th text-center">حذف</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((req) => {
                    const statusCfg = STATUS_CONFIG[req.finalStatus];
                    const pendingSummary = getPendingChainSummary(req);
                    return (
                      <tr key={req.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa]/30">
                        {showEmployeeColumn && <td className="py-3 px-3 font-bold">{getEmpName(req.employeeId)}</td>}
                        <td className="py-3 px-3">
                          <Badge variant="info">{leaveTypeByKey[req.leaveType]?.label || req.leaveTypeLabel || LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType}</Badge>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs" dir="ltr">{req.startDate}</td>
                        <td className="py-3 px-3 font-mono text-xs" dir="ltr">{req.endDate}</td>
                        <td className="py-3 px-3 font-bold">{req.totalDays}</td>
                        <td className="py-3 px-3">
                          {(typeof req.leaveTypeIsPaid === 'boolean' ? !req.leaveTypeIsPaid : req.affectsSalary)
                            ? <span className="text-rose-500 font-bold">نعم</span>
                            : <span className="text-[var(--color-text-muted)]">لا</span>}
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            {req.approvalChain.length === 0 ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : (
                              req.approvalChain.map((step, i) => {
                                const stepCfg = STATUS_CONFIG[step.status];
                                return (
                                  <span
                                    key={i}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                                      ${step.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                        step.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                        'bg-[#f0f2f5] text-[var(--color-text-muted)]'}`}
                                    title={`مستوى ${step.level} — ${stepCfg.label}`}
                                  >
                                    {step.level}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-[var(--color-text)]">
                              الآن: {pendingSummary.currentApprover}
                            </div>
                            <div className="text-[11px] text-[var(--color-text-muted)]">
                              {pendingSummary.untilMe}
                            </div>
                          </div>
                        </td>
                        {canDelete && (
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => setDeleteConfirm(req.id!)}
                              className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-400 hover:text-rose-600 transition-colors"
                              title="حذف الطلب"
                            >
                              <span className="material-icons-round text-lg">delete</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </OpsDashPanel>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center">
              <span className="material-icons-round text-5xl text-rose-500 mb-2">warning</span>
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">تأكيد الحذف</h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">هل تريد حذف طلب الإجازة نهائياً؟</p>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>تراجع</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteConfirm)} disabled={deleting}>
                {deleting ? 'جاري الحذف...' : 'حذف نهائي'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ModuleOpsPageShell>
  );
};

