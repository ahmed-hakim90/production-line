import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { exportGenericRows } from '@/utils/exportExcel';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { employeeService } from '@/modules/hr/employeeService';
import { employeeDeductionService } from '@/modules/hr/employeeFinancialsService';
import { leaveBalanceService, leaveRequestService, syncLeaveApprovalDecision } from '@/modules/hr/leaveService';
import { loanService } from '@/modules/hr/loanService';
import {
  approveRequest,
  cancelRequest,
  canViewAllRequests,
  getAllRequests,
  getPendingApprovals,
  getRequestById,
  getRequestsCreatedBy,
  rejectRequest,
  type ApprovalChainSnapshot,
  type ApprovalEmployeeInfo,
  type ApprovalRequestStatus,
  type ApprovalRequestType,
  type CallerContext,
  type FirestoreApprovalRequest,
} from '@/modules/hr/approval';
import {
  calculatePenaltyAmountFromDuration,
  buildPenaltyDeductionInput,
  formatPenaltyDuration,
  formatPenaltyRequestSummary,
  getPenaltyDurationLabel,
  normalizePenaltyDurationDays,
  PENALTY_DURATION_PRESETS,
} from '@/modules/hr/approval/penaltyApproval';
import {
  getLeaveReasonsFromConfig,
  getLeaveTypesFromConfig,
  leaveReasonMapByCode,
  leaveTypeMapByKey,
  type LeaveReasonDefinition,
  type LeaveTypeDefinition,
} from '@/modules/hr/leaveTypes';
import type { FirestoreEmployee } from '@/types';
import type { FirestoreDepartment, FirestoreJobPosition } from '@/modules/hr/types';
import type { ApprovalChainItem, ApprovalStatus, FirestoreLeaveBalance, FirestoreLeaveRequest, FirestoreEmployeeLoan, LeaveType, LoanType } from '@/modules/hr/types';
import { LEAVE_TYPE_LABELS, LOAN_TYPE_LABELS } from '@/modules/hr/types';
import { departmentsRef, jobPositionsRef } from '@/modules/hr/collections';
import { getDocs } from 'firebase/firestore';
import { resolveEmployeeHierarchyId, resolveEmployeeManagerId } from '@/modules/hr/utils/organizationHierarchy';
import { lineService } from '../services/lineService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { productionWorkerService } from '../services/productionWorkerService';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import { productionApprovalRequestService } from '../services/productionApprovalRequestService';
import {
  buildSupervisorTeamWorkers,
  isEmployeeInSupervisorTeam,
  resolveTeamRequestScope,
  type TeamWorkerScope,
  type SupervisorTeamWorker,
} from '../utils/productionEmployeeContext';
import {
  buildSupervisorApprovalExportRows,
  canSupervisorCancelApprovalRequest,
  canSupervisorActOnApprovalRequest,
  filterProductionApprovalHistory,
  getProductionApprovalStatusDisplay,
  getSupervisorApprovalLeaveTypeLabel,
  getApprovalRequestParticipantEmployeeIds,
  isApprovalRequestCreatedBySupervisor,
  mergeSupervisorVisibleApprovalRequests,
} from '../utils/supervisorApprovalVisibility';

type PageTab = 'create' | 'approvals' | 'history';
type ActionTab = 'leave' | 'loan' | 'penalty';
type HistoryStatusFilter = 'all' | 'approved' | 'rejected' | 'cancelled';
type Toast = { type: 'success' | 'error'; message: string } | null;

const LEGACY_PRODUCTION_APPROVAL_SOURCE = 'legacy_hr_approval';

const INPUT_CLASS = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none';

const ACTION_TABS: { key: ActionTab; label: string; icon: string }[] = [
  { key: 'leave', label: 'إجازة', icon: 'beach_access' },
  { key: 'loan', label: 'سلفة', icon: 'payments' },
  { key: 'penalty', label: 'جزاء', icon: 'gavel' },
];

const TYPE_CONFIG: Record<ApprovalRequestType, { label: string; icon: string; color: string; bg: string }> = {
  overtime: { label: 'عمل إضافي', icon: 'schedule', color: 'text-purple-500', bg: 'bg-purple-100' },
  leave: { label: 'إجازة', icon: 'beach_access', color: 'text-blue-500', bg: 'bg-blue-100' },
  loan: { label: 'سلفة', icon: 'payments', color: 'text-amber-500', bg: 'bg-amber-100' },
  penalty: { label: 'جزاء', icon: 'gavel', color: 'text-rose-500', bg: 'bg-rose-100' },
};

const FALLBACK_TYPE_CONFIG = {
  label: 'طلب',
  icon: 'assignment',
  color: 'text-slate-500',
  bg: 'bg-slate-100',
};

function getRequestTypeConfig(requestType: string) {
  return TYPE_CONFIG[requestType as ApprovalRequestType] || FALLBACK_TYPE_CONFIG;
}

function getRequestApprovalChain(request: FirestoreApprovalRequest): ApprovalChainSnapshot[] {
  return Array.isArray(request.approvalChain) ? request.approvalChain : [];
}

function getRequestCurrentStep(request: FirestoreApprovalRequest): number {
  return Math.max(0, Number(request.currentStep || 0));
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function calculateDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function formatCurrency(value: number): string {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatApprovalCreatedAt(value: any): string {
  const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : null;
  if (!date) return '—';
  return date.toLocaleDateString('ar-EG');
}

function isProductionApprovalRequest(req: FirestoreApprovalRequest): boolean {
  return Boolean(req.requestData?.productionLineId || req.requestData?.productionLineName);
}

function markLegacyProductionApprovalRequest(req: FirestoreApprovalRequest): FirestoreApprovalRequest {
  return {
    ...req,
    requestData: {
      ...(req.requestData || {}),
      productionApprovalSource: LEGACY_PRODUCTION_APPROVAL_SOURCE,
    },
  };
}

function isLegacyProductionApprovalRequest(req: FirestoreApprovalRequest): boolean {
  return req.requestData?.productionApprovalSource === LEGACY_PRODUCTION_APPROVAL_SOURCE;
}

function getProductionApprovalRenderKey(req: FirestoreApprovalRequest): string {
  return `${isLegacyProductionApprovalRequest(req) ? 'legacy' : 'production'}-${req.id || ''}`;
}

function formatRequestSummary(req: FirestoreApprovalRequest): string {
  const data = req.requestData || {};
  if (req.requestType === 'leave') {
    const typeLabel = data.leaveTypeLabel || LEAVE_TYPE_LABELS[data.leaveType as keyof typeof LEAVE_TYPE_LABELS] || data.leaveType;
    return `إجازة ${typeLabel || ''}`.trim();
  }
  if (req.requestType === 'loan') {
    return `سلفة ${formatCurrency(Number(data.loanAmount || 0))} ج.م`;
  }
  if (req.requestType === 'penalty') {
    return formatPenaltyRequestSummary(data);
  }
  return data.description || 'عمل إضافي';
}

function formatRequestDetail(req: FirestoreApprovalRequest): string {
  const data = req.requestData || {};
  if (req.requestType === 'leave') {
    return `${data.startDate || '—'} → ${data.endDate || '—'} (${data.totalDays || 0} يوم)`;
  }
  if (req.requestType === 'loan') {
    return `${data.totalInstallments || 0} قسط × ${formatCurrency(Number(data.installmentAmount || 0))} — بدء: ${data.startMonth || data.month || '—'}`;
  }
  if (req.requestType === 'penalty') {
    const durationLabel = getPenaltyDurationLabel(data);
    return `${durationLabel ? `المدة: ${durationLabel} — ` : ''}${data.productionLineName || '—'} — شهر ${data.startMonth || '—'} — ${data.reason || '—'}`;
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

function toApprovalEmployeeInfo(
  e: FirestoreEmployee,
  departmentManagersById: Map<string, string> = new Map(),
  managerIdsByEmployeeId: Map<string, string> = new Map(),
): ApprovalEmployeeInfo {
  const level = Math.min(4, Math.max(1, Number(e.level || 1))) as 1 | 2 | 3 | 4;
  const departmentManagerId = departmentManagersById.get(e.departmentId || '');
  const managerId = managerIdsByEmployeeId.get(e.id || '') || String(e.managerId || '').trim();
  return {
    employeeId: e.id!,
    employeeName: e.name,
    managerId,
    departmentManagerId,
    departmentId: e.departmentId || 'unknown_department',
    departmentName: e.departmentId || 'unknown_department',
    jobPositionId: e.jobPositionId || 'unknown_position',
    jobTitle: e.jobPositionId || 'unknown_position',
    jobLevel: level,
  };
}

function buildApprovalEmployeesForWorker(
  employees: FirestoreEmployee[],
  selectedWorker: SupervisorTeamWorker,
  departments: FirestoreDepartment[] = [],
): ApprovalEmployeeInfo[] {
  const employeeRows = employees.filter((employee): employee is FirestoreEmployee & { id: string } => Boolean(employee.id));
  const departmentManagersById = new Map(
    departments
      .filter((department) => department.id && department.isActive !== false)
      .map((department) => [department.id!, resolveEmployeeHierarchyId(employeeRows, department.managerId)]),
  );
  const managerIdsByEmployeeId = new Map(
    employeeRows.map((employee) => [employee.id, resolveEmployeeManagerId(employeeRows, employee)]),
  );
  const selectedWorkerSupervisorId = resolveEmployeeHierarchyId(employeeRows, selectedWorker.supervisorId);
  return employeeRows
    .map((employee) => {
      const info = toApprovalEmployeeInfo(employee, departmentManagersById, managerIdsByEmployeeId);
      if (info.employeeId === selectedWorker.employeeId) {
        return {
          ...info,
          managerId: selectedWorkerSupervisorId,
        };
      }
      return info;
    });
}

export const SupervisorTeamActions: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const permissions = useAppStore((s) => s.userPermissions);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings);

  const [resolvedSupervisor, setResolvedSupervisor] = useState<FirestoreEmployee | null>(currentEmployee);
  const [allEmployees, setAllEmployees] = useState<FirestoreEmployee[]>([]);
  const [teamWorkers, setTeamWorkers] = useState<SupervisorTeamWorker[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDefinition[]>([]);
  const [leaveReasons, setLeaveReasons] = useState<LeaveReasonDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<ActionTab | null>(null);
  const [activePageTab, setActivePageTab] = useState<PageTab>('create');
  const [activeTab, setActiveTab] = useState<ActionTab>('leave');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const [leaveBalance, setLeaveBalance] = useState<FirestoreLeaveBalance | null>(null);
  const [recentLeaves, setRecentLeaves] = useState<FirestoreLeaveRequest[]>([]);
  const [recentLoans, setRecentLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [teamScope, setTeamScope] = useState<TeamWorkerScope>('assigned_lines');
  const [managedDepartmentCount, setManagedDepartmentCount] = useState(0);
  const [approvalRequests, setApprovalRequests] = useState<FirestoreApprovalRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<FirestoreApprovalRequest[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalActionLoading, setApprovalActionLoading] = useState<string | null>(null);
  const [approvalActionNotes, setApprovalActionNotes] = useState<Record<string, string>>({});
  const [expandedApprovalIds, setExpandedApprovalIds] = useState<Set<string>>(new Set());
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [historyParticipantFilter, setHistoryParticipantFilter] = useState('');
  const [exportingApprovalsPdf, setExportingApprovalsPdf] = useState(false);
  const approvalsPdfRef = useRef<HTMLDivElement>(null);

  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReasonCode, setLeaveReasonCode] = useState('');

  const [loanType, setLoanType] = useState<LoanType>('monthly_advance');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanInstallments, setLoanInstallments] = useState('1');
  const [loanReason, setLoanReason] = useState('');

  const [penaltyName, setPenaltyName] = useState('جزاء تأديبي');
  const [penaltyDurationDays, setPenaltyDurationDays] = useState('0.25');
  const [penaltyMonth, setPenaltyMonth] = useState(getCurrentMonth());
  const [penaltyReason, setPenaltyReason] = useState('');

  const supervisorId = resolvedSupervisor?.id || '';
  const isConfiguredProductionRequestObserver = (planSettings.productionRequestObserverEmployeeIds ?? []).includes(supervisorId);
  const canCreateProductionRequests = can('employeeDashboard.view') || can('quickAction.view') || can('production.workerReports.view') || can('reports.create') || can('approval.view') || can('leave.manage') || can('approval.manage');
  const canUsePage = canCreateProductionRequests || can('production.requests.observe') || isConfiguredProductionRequestObserver;
  const selectedWorker = useMemo(
    () => teamWorkers.find((worker) => worker.employeeId === selectedEmployeeId) || null,
    [selectedEmployeeId, teamWorkers],
  );
  const leaveTypeByKey = useMemo(() => leaveTypeMapByKey(leaveTypes), [leaveTypes]);
  const leaveReasonByCode = useMemo(() => leaveReasonMapByCode(leaveReasons), [leaveReasons]);
  const leaveReasonOptions = useMemo(
    () => leaveReasons.map((reason) => ({ value: reason.code, label: reason.label })),
    [leaveReasons],
  );
  const selectedLeaveType = leaveTypeByKey[leaveType];
  const selectedLeaveReason = leaveReasonByCode[leaveReasonCode];
  const leaveDays = useMemo(() => {
    if (!leaveStartDate || !leaveEndDate) return 0;
    return calculateDays(leaveStartDate, leaveEndDate);
  }, [leaveStartDate, leaveEndDate]);
  const loanInstallmentAmount = useMemo(() => {
    const amount = Number(loanAmount || 0);
    const installments = loanType === 'monthly_advance' ? 1 : Math.max(1, Number(loanInstallments || 1));
    return Math.ceil((amount / installments) * 100) / 100;
  }, [loanAmount, loanInstallments, loanType]);
  const automaticLoanStartMonth = getCurrentMonth();
  const activeActionTab = useMemo(
    () => ACTION_TABS.find((tab) => tab.key === activeTab) || ACTION_TABS[0],
    [activeTab],
  );
  const normalizedPenaltyDurationDays = useMemo(
    () => normalizePenaltyDurationDays(penaltyDurationDays),
    [penaltyDurationDays],
  );
  const penaltyDurationLabel = useMemo(
    () => formatPenaltyDuration(normalizedPenaltyDurationDays),
    [normalizedPenaltyDurationDays],
  );
  const penaltyAmountPreview = useMemo(
    () => calculatePenaltyAmountFromDuration(normalizedPenaltyDurationDays, selectedWorker?.employee),
    [normalizedPenaltyDurationDays, selectedWorker?.employee],
  );
  const isCreateRequestDisabled = useMemo(
    () => (
      submitting === activeTab ||
      (activeTab === 'leave' && (!leaveStartDate || !leaveEndDate || leaveDays <= 0 || !leaveReasonCode || leaveReasons.length === 0)) ||
      (activeTab === 'loan' && Number(loanAmount || 0) <= 0) ||
      (activeTab === 'penalty' && (normalizedPenaltyDurationDays <= 0 || !penaltyMonth || !penaltyReason.trim()))
    ),
    [activeTab, leaveDays, leaveEndDate, leaveReasonCode, leaveReasons.length, leaveStartDate, loanAmount, normalizedPenaltyDurationDays, penaltyMonth, penaltyReason, submitting],
  );

  const workerOptions = useMemo(
    () => teamWorkers.map((worker) => ({
      value: worker.employeeId,
      label: `${worker.employeeCode || '—'} — ${worker.employeeName} (${worker.lineName})`,
    })),
    [teamWorkers],
  );
  const teamScopeLabel = useMemo(() => {
    if (teamScope === 'hr_all') return 'النطاق: كل الموظفين';
    if (teamScope === 'production_all') return 'النطاق: كل عمال الإنتاج';
    if (teamScope === 'department_manager' || teamScope === 'department_manager_assigned_lines') {
      const departmentLabel = managedDepartmentCount === 1
        ? 'القسم الذي تديره'
        : `الأقسام التي تديرها (${managedDepartmentCount})`;
      return teamScope === 'department_manager_assigned_lines'
        ? `النطاق: خطوطك و${departmentLabel}`
        : `النطاق: ${departmentLabel}`;
    }
    return 'النطاق: خطوطك الحالية';
  }, [managedDepartmentCount, teamScope]);

  const approvalCaller: CallerContext = useMemo(() => ({
    employeeId: supervisorId,
    employeeName: resolvedSupervisor?.name || userDisplayName || 'المستخدم الحالي',
    permissions,
  }), [permissions, resolvedSupervisor?.name, supervisorId, userDisplayName]);

  const actionableApprovalCount = useMemo(
    () => approvalRequests.filter((req) => canSupervisorActOnApprovalRequest(req, supervisorId)).length,
    [approvalRequests, supervisorId],
  );
  const approvalExportRows = useMemo(
    () => buildSupervisorApprovalExportRows(approvalRequests),
    [approvalRequests],
  );
  const approvalExportHeaders = useMemo(
    () => Object.keys(approvalExportRows[0] || {}),
    [approvalExportRows],
  );
  const filteredHistoryRequests = useMemo(
    () => filterProductionApprovalHistory({
      requests: historyRequests,
      status: historyStatusFilter,
      participantEmployeeId: historyParticipantFilter || undefined,
    }),
    [historyParticipantFilter, historyRequests, historyStatusFilter],
  );
  const historyParticipantOptions = useMemo(() => {
    const namesById = new Map<string, string>();
    allEmployees.forEach((employee) => {
      if (employee.id) namesById.set(employee.id, employee.name || employee.id);
    });
    historyRequests.forEach((request) => {
      const requestedByEmployeeId = String(request.requestData?.requestedByEmployeeId || '').trim();
      if (requestedByEmployeeId && !namesById.has(requestedByEmployeeId)) {
        namesById.set(requestedByEmployeeId, request.requestData?.requestedByName || requestedByEmployeeId);
      }
      getRequestApprovalChain(request).forEach((step) => {
        if (step.approverEmployeeId && !namesById.has(step.approverEmployeeId)) {
          namesById.set(step.approverEmployeeId, step.approverName || step.approverEmployeeId);
        }
        if (step.delegatedTo && !namesById.has(step.delegatedTo)) {
          namesById.set(step.delegatedTo, step.delegatedToName || step.delegatedTo);
        }
      });
      request.history?.forEach((entry) => {
        if (entry.performedBy && entry.performedBy !== 'system' && !namesById.has(entry.performedBy)) {
          namesById.set(entry.performedBy, entry.performedByName || entry.performedBy);
        }
      });
    });
    return Array.from(namesById.entries())
      .filter(([employeeId]) => historyRequests.some((request) => getApprovalRequestParticipantEmployeeIds(request).has(employeeId)))
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [allEmployees, historyRequests]);
  const historyExportRows = useMemo(
    () => buildSupervisorApprovalExportRows(filteredHistoryRequests),
    [filteredHistoryRequests],
  );
  const historyExportHeaders = useMemo(
    () => Object.keys(historyExportRows[0] || {}),
    [historyExportRows],
  );
  const pdfExportRows = activePageTab === 'history' ? historyExportRows : approvalExportRows;
  const pdfExportHeaders = activePageTab === 'history' ? historyExportHeaders : approvalExportHeaders;
  const pdfExportTitle = activePageTab === 'history' ? 'سجل طلبات الإنتاج' : 'طلبات الإنتاج';

  const fetchPendingApprovalRequests = useCallback(async (opts?: { silent?: boolean }) => {
    if (!supervisorId) {
      setApprovalRequests([]);
      setHistoryRequests([]);
      return;
    }
    if (!opts?.silent) setApprovalsLoading(true);
    try {
      const viewAllProductionApprovals = (
        permissions['production.workers.manage'] === true ||
        permissions['production.workerReports.view'] === true ||
        permissions['leave.manage'] === true ||
        isConfiguredProductionRequestObserver
      );
      const canReadAllLegacyApprovals = canViewAllRequests(permissions);
      const [newRequestsResult, legacyPendingResult, legacyCreatedResult, legacyAllResult] = await Promise.allSettled([
        productionApprovalRequestService.getVisible({
          employeeId: supervisorId,
          userId: uid || undefined,
          viewAll: viewAllProductionApprovals,
        }),
        getPendingApprovals({ approverEmployeeId: supervisorId }),
        uid ? getRequestsCreatedBy(uid) : Promise.resolve([]),
        canReadAllLegacyApprovals ? getAllRequests() : Promise.resolve([]),
      ]);

      if (newRequestsResult.status === 'rejected') console.warn('Production approval requests failed:', newRequestsResult.reason);
      if (legacyPendingResult.status === 'rejected') console.warn('Legacy production pending approvals failed:', legacyPendingResult.reason);
      if (legacyCreatedResult.status === 'rejected') console.warn('Legacy production created approvals failed:', legacyCreatedResult.reason);
      if (legacyAllResult.status === 'rejected') console.warn('Legacy production all approvals failed:', legacyAllResult.reason);

      const legacyPending = legacyPendingResult.status === 'fulfilled'
        ? legacyPendingResult.value.filter(isProductionApprovalRequest).map(markLegacyProductionApprovalRequest)
        : [];
      const legacyCreated = legacyCreatedResult.status === 'fulfilled'
        ? legacyCreatedResult.value.filter(isProductionApprovalRequest).map(markLegacyProductionApprovalRequest)
        : [];
      const legacyAll = legacyAllResult.status === 'fulfilled'
        ? legacyAllResult.value.filter(isProductionApprovalRequest).map(markLegacyProductionApprovalRequest)
        : [];
      const legacyVisible = mergeSupervisorVisibleApprovalRequests({
        pendingApprovals: legacyPending,
        allRequests: canReadAllLegacyApprovals ? legacyAll : legacyCreated,
        supervisorEmployeeId: supervisorId,
        supervisorUserId: uid || undefined,
      });

      const visibleByKey = new Map<string, FirestoreApprovalRequest>();
      const newRequests = newRequestsResult.status === 'fulfilled' ? newRequestsResult.value : [];
      [...newRequests, ...legacyVisible].forEach((request) => {
        if (request.id) visibleByKey.set(getProductionApprovalRenderKey(request), request);
      });
      if (visibleByKey.size === 0 && newRequestsResult.status === 'rejected' && legacyPendingResult.status === 'rejected' && legacyCreatedResult.status === 'rejected' && legacyAllResult.status === 'rejected') {
        throw newRequestsResult.reason;
      }
      const visibleRequests = Array.from(visibleByKey.values()).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
        return tb - ta;
      });
      setApprovalRequests(visibleRequests.filter((request) =>
        request.status === 'pending' || request.status === 'in_progress' || request.status === 'escalated',
      ));
      setHistoryRequests(visibleRequests);
    } catch (err) {
      console.error('Failed to load team approval inbox:', err);
      const errorCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
      const errorMessage = err instanceof Error ? err.message : '';
      const message = errorCode.includes('permission-denied')
        ? 'تعذر تحميل طلبات الاعتماد: قواعد Firestore الجديدة لم تُنشر بعد'
        : errorMessage.includes('index')
          ? 'تعذر تحميل طلبات الاعتماد: فهارس Firestore لطلبات الإنتاج لم تجهز بعد'
          : 'تعذر تحميل طلبات الاعتماد';
      setToast({ type: 'error', message });
    } finally {
      if (!opts?.silent) setApprovalsLoading(false);
    }
  }, [isConfiguredProductionRequestObserver, permissions, supervisorId, uid]);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const supervisor = currentEmployee || (uid ? await employeeService.getByUserId(uid) : null);
      setResolvedSupervisor(supervisor);
      if (!supervisor?.id) {
        setTeamWorkers([]);
        setAllEmployees([]);
        setDepartments([]);
        setManagedDepartmentCount(0);
        return;
      }

      const today = getToday();
      const [
        employees,
        workers,
        lineAssignments,
        supervisorAssignments,
        lines,
        departmentSnap,
        jobPositionSnap,
        configuredLeaveTypes,
        configuredLeaveReasons,
      ] = await Promise.all([
        employeeService.getAll(),
        productionWorkerService.getAll(),
        productionLineWorkerAssignmentService.getAll(),
        supervisorLineAssignmentService.getActiveByDate(today),
        lineService.getAll(),
        getDocs(departmentsRef()),
        getDocs(jobPositionsRef()),
        getLeaveTypesFromConfig(),
        getLeaveReasonsFromConfig(),
      ]);

      const departmentsList = departmentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FirestoreDepartment));
      const jobPositionsList = jobPositionSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FirestoreJobPosition));
      const managedDepartments = departmentsList.filter((department) => (
        department.isActive !== false
        && resolveEmployeeHierarchyId(employees, department.managerId) === supervisor.id
      ));
      const managesDepartment = managedDepartments.length > 0;
      const currentDepartment = departmentsList.find((department) => department.id === supervisor.departmentId) || null;
      const currentJobPosition = jobPositionsList.find((position) => position.id === supervisor.jobPositionId) || null;
      const hasAssignedLines = supervisorAssignments.some((assignment) =>
        resolveEmployeeHierarchyId(employees, assignment.supervisorId) === supervisor.id,
      );
      const scope = resolveTeamRequestScope({
        can,
        managesDepartment,
        currentEmployee: supervisor,
        department: currentDepartment,
        jobPosition: currentJobPosition,
        hasAssignedLines,
      });
      const rows = buildSupervisorTeamWorkers({
        supervisorId: supervisor.id,
        employees,
        workers,
        lineAssignments,
        supervisorAssignments,
        lines,
        departments: departmentsList,
        date: today,
        scope,
      });

      setAllEmployees(employees);
      setDepartments(departmentsList);
      setTeamWorkers(rows);
      setTeamScope(scope);
      setManagedDepartmentCount(managedDepartments.length);
      setLeaveTypes(configuredLeaveTypes);
      setLeaveReasons(configuredLeaveReasons);
      setLeaveType((prev) => configuredLeaveTypes.some((row) => row.key === prev) ? prev : (configuredLeaveTypes[0]?.key || 'annual'));
      setLeaveReasonCode((prev) => configuredLeaveReasons.some((row) => row.code === prev) ? prev : (configuredLeaveReasons[0]?.code || ''));
      setSelectedEmployeeId((prev) => rows.some((row) => row.employeeId === prev) ? prev : (rows[0]?.employeeId || ''));
    } catch (err) {
      console.error('Failed to load supervisor team actions data:', err);
      setToast({ type: 'error', message: 'تعذر تحميل عمال الإنتاج' });
    } finally {
      setLoading(false);
    }
  }, [can, currentEmployee, uid]);

  useEffect(() => { void fetchTeam(); }, [fetchTeam]);

  useEffect(() => {
    if (!supervisorId) {
      setApprovalRequests([]);
      return;
    }
    void fetchPendingApprovalRequests();
  }, [fetchPendingApprovalRequests, supervisorId]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setLeaveBalance(null);
      setRecentLeaves([]);
      setRecentLoans([]);
      return;
    }
    let active = true;
    const fetchWorkerContext = async () => {
      try {
        const [balance, leaves, loans] = await Promise.all([
          leaveBalanceService.getOrCreate(selectedEmployeeId),
          leaveRequestService.getByEmployee(selectedEmployeeId),
          loanService.getByEmployee(selectedEmployeeId),
        ]);
        if (!active) return;
        setLeaveBalance(balance);
        setRecentLeaves(leaves.slice(0, 5));
        setRecentLoans(loans.slice(0, 5));
      } catch (err) {
        console.warn('Failed to load worker request context:', err);
      }
    };
    void fetchWorkerContext();
    return () => { active = false; };
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!canCreateProductionRequests && activePageTab === 'create') {
      setActivePageTab('approvals');
    }
  }, [activePageTab, canCreateProductionRequests]);

  useEffect(() => {
    if (!historyParticipantFilter) return;
    if (!historyParticipantOptions.some((option) => option.value === historyParticipantFilter)) {
      setHistoryParticipantFilter('');
    }
  }, [historyParticipantFilter, historyParticipantOptions]);

  const syncSourceRequestApproval = useCallback(async (request: FirestoreApprovalRequest) => {
    const mappedStatus = mapApprovalStatusToLegacy(request.status);
    const mappedChain = mapSnapshotChainToLegacy(getRequestApprovalChain(request));

    if (request.requestType === 'leave' && request.sourceRequestId) {
      const syncResult = await syncLeaveApprovalDecision({
        leaveRequestId: request.sourceRequestId,
        approvalChain: mappedChain,
        decisionStatus: mappedStatus,
      });
      if (!syncResult.success) {
        console.warn('Leave sync warning (team approvals):', syncResult.error);
      }
    } else if (request.requestType === 'loan' && request.sourceRequestId) {
      await loanService.updateApproval(
        request.sourceRequestId,
        mappedChain,
        mappedStatus,
      );
    } else if (request.requestType === 'penalty' && request.status === 'approved') {
      const employee = await employeeService.getById(request.employeeId).catch(() => null);
      const deductionInput = buildPenaltyDeductionInput(request, employee);
      if (deductionInput) {
        await employeeDeductionService.create(deductionInput).catch((err) => {
          console.warn('Penalty deduction sync warning (team approvals):', err);
        });
      }
    }
  }, []);

  const addCreatedApprovalToStatusList = useCallback(async (requestId?: string) => {
    if (!requestId || !supervisorId) return;
    try {
      const createdRequest = await productionApprovalRequestService.getById(requestId);
      if (!createdRequest) return;
      setApprovalRequests((prev) => [createdRequest, ...prev.filter((request) => request.id !== createdRequest.id)]);
    } catch (err) {
      console.warn('Failed to add created approval request to status list:', err);
    }
  }, [supervisorId]);

  const handleApprovalAction = useCallback(async (
    req: FirestoreApprovalRequest,
    action: 'approved' | 'rejected',
  ) => {
    if (!req.id || !supervisorId) return;
    setApprovalActionLoading(req.id);
    try {
      const notes = approvalActionNotes[req.id] || '';
      const isLegacy = isLegacyProductionApprovalRequest(req);
      const result = isLegacy
        ? action === 'approved'
          ? await approveRequest(
              { requestId: req.id, approverEmployeeId: supervisorId, approverName: approvalCaller.employeeName, action, notes },
              approvalCaller,
            )
          : await rejectRequest(
              { requestId: req.id, approverEmployeeId: supervisorId, approverName: approvalCaller.employeeName, action, notes },
              approvalCaller,
            )
        : action === 'approved'
          ? await productionApprovalRequestService.approve({
              requestId: req.id,
              actorEmployeeId: supervisorId,
              actorName: approvalCaller.employeeName,
              notes,
            })
          : await productionApprovalRequestService.reject({
              requestId: req.id,
              actorEmployeeId: supervisorId,
              actorName: approvalCaller.employeeName,
              notes,
            });
      if (!result.success) {
        setToast({ type: 'error', message: result.error || 'تعذر تنفيذ قرار الاعتماد' });
        return;
      }

      const updatedRequest = isLegacy
        ? await getRequestById(req.id).then((request) => request ? markLegacyProductionApprovalRequest(request) : null)
        : await productionApprovalRequestService.getById(req.id);
      if (updatedRequest) {
        await syncSourceRequestApproval(updatedRequest);
      }

      setApprovalActionNotes((prev) => ({ ...prev, [req.id!]: '' }));
      setToast({ type: 'success', message: action === 'approved' ? 'تم اعتماد الطلب' : 'تم رفض الطلب' });
      await fetchPendingApprovalRequests({ silent: true });
    } catch (err) {
      console.error('Team approval action failed:', err);
      setToast({ type: 'error', message: 'تعذر تنفيذ قرار الاعتماد' });
    } finally {
      setApprovalActionLoading(null);
    }
  }, [approvalActionNotes, approvalCaller, fetchPendingApprovalRequests, supervisorId, syncSourceRequestApproval]);

  const handleCancelApprovalRequest = useCallback(async (req: FirestoreApprovalRequest) => {
    if (!req.id || !supervisorId) return;
    if (!canSupervisorCancelApprovalRequest(req, supervisorId, uid || undefined)) return;
    if (!window.confirm('هل أنت متأكد من إلغاء هذا الطلب قبل الاعتماد؟')) return;

    setApprovalActionLoading(req.id);
    try {
      const isLegacy = isLegacyProductionApprovalRequest(req);
      const result = isLegacy
        ? await cancelRequest(
            {
              requestId: req.id,
              cancelledBy: supervisorId,
              cancelledByName: approvalCaller.employeeName,
              reason: 'إلغاء بواسطة مشرف الإنتاج قبل الاعتماد',
            },
            approvalCaller,
          )
        : await productionApprovalRequestService.cancel({
            requestId: req.id,
            actorEmployeeId: supervisorId,
            actorName: approvalCaller.employeeName,
            notes: 'إلغاء بواسطة مشرف الإنتاج قبل الاعتماد',
          });
      if (!result.success) {
        setToast({ type: 'error', message: result.error || 'تعذر إلغاء الطلب' });
        return;
      }

      const updatedRequest = isLegacy
        ? await getRequestById(req.id).then((request) => request ? markLegacyProductionApprovalRequest(request) : null)
        : await productionApprovalRequestService.getById(req.id);
      if (updatedRequest) {
        await syncSourceRequestApproval(updatedRequest);
      }

      setToast({ type: 'success', message: 'تم إلغاء الطلب' });
      await fetchPendingApprovalRequests({ silent: true });
    } catch (err) {
      console.error('Production request cancellation failed:', err);
      setToast({ type: 'error', message: 'تعذر إلغاء الطلب' });
    } finally {
      setApprovalActionLoading(null);
    }
  }, [approvalCaller, fetchPendingApprovalRequests, supervisorId, syncSourceRequestApproval, uid]);

  const toggleApprovalDetails = useCallback((requestId: string) => {
    setExpandedApprovalIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  }, []);

  const handleExportApprovals = useCallback(() => {
    if (approvalRequests.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    exportGenericRows(
      approvalExportRows,
      `production-approval-requests-${date}`,
      'طلبات الإنتاج',
    );
  }, [approvalExportRows, approvalRequests.length]);

  const handleExportHistory = useCallback(() => {
    if (historyExportRows.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    exportGenericRows(
      historyExportRows,
      `production-approval-history-${date}`,
      'سجل طلبات الإنتاج',
    );
  }, [historyExportRows]);

  const handleExportApprovalsPdf = useCallback(async () => {
    if (pdfExportRows.length === 0 || !approvalsPdfRef.current) return;
    setExportingApprovalsPdf(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const filePrefix = activePageTab === 'history' ? 'production-approval-history' : 'production-approval-requests';
      const { exportToPDF, waitForExportPaint } = await import('@/utils/reportExport');
      await waitForExportPaint(150);
      await exportToPDF(approvalsPdfRef.current, `${filePrefix}-${date}`, {
        paperSize: 'a4',
        orientation: 'landscape',
        copies: 1,
      });
    } finally {
      setExportingApprovalsPdf(false);
    }
  }, [activePageTab, pdfExportRows.length]);

  const getApprovalContext = useCallback(() => {
    if (!selectedWorker || !supervisorId || !isEmployeeInSupervisorTeam(teamWorkers, selectedWorker.employeeId)) {
      throw new Error('العامل غير متاح ضمن نطاق الإنتاج الحالي');
    }
    return {
      approvalEmployees: buildApprovalEmployeesForWorker(allEmployees, selectedWorker, departments),
    };
  }, [allEmployees, departments, selectedWorker, supervisorId, teamWorkers]);

  const handleLeaveSubmit = useCallback(async (): Promise<boolean> => {
    if (!selectedWorker || !leaveStartDate || !leaveEndDate || leaveDays <= 0 || !selectedLeaveReason) return false;
    setSubmitting('leave');
    try {
      const { approvalEmployees } = getApprovalContext();
      const leaveTypeLabel = selectedLeaveType?.label || LEAVE_TYPE_LABELS[leaveType] || leaveType;
      const leaveReasonLabel = selectedLeaveReason.label;
      const leaveId = await leaveRequestService.create({
        employeeId: selectedWorker.employeeId,
        employeeName: selectedWorker.employeeName,
        leaveType,
        leaveTypeLabel,
        leaveTypeIsPaid: selectedLeaveType ? selectedLeaveType.isPaid : leaveType !== 'unpaid',
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        totalDays: leaveDays,
        affectsSalary: selectedLeaveType ? !selectedLeaveType.isPaid : leaveType === 'unpaid',
        status: 'pending' as ApprovalStatus,
        approvalChain: [],
        finalStatus: 'pending' as ApprovalStatus,
        reason: leaveReasonLabel,
        reasonCode: selectedLeaveReason.code,
        createdBy: uid || '',
        requestedByEmployeeId: supervisorId,
        requestedByName: resolvedSupervisor?.name || userDisplayName || '',
        requestedOnBehalf: true,
      });
      const approvalResult = await productionApprovalRequestService.create({
        requestType: 'leave',
        employeeId: selectedWorker.employeeId,
        employeeName: selectedWorker.employeeName,
        departmentId: selectedWorker.employee.departmentId || 'production',
        requestData: {
          leaveType,
          leaveTypeLabel,
          employeeName: selectedWorker.employeeName,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          totalDays: leaveDays,
          reason: leaveReasonLabel,
          reasonCode: selectedLeaveReason.code,
          productionLineId: selectedWorker.lineId,
          productionLineName: selectedWorker.lineName,
        },
        sourceRequestId: leaveId,
        createdBy: uid || '',
        createdByEmployeeId: supervisorId,
        createdByName: resolvedSupervisor?.name || userDisplayName || '',
        approvalEmployees,
      });
      if (!approvalResult.success) {
        await leaveRequestService.delete(leaveId);
        throw new Error(approvalResult.error || 'تعذر إرسال طلب الإجازة للموافقات');
      }
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveReasonCode(leaveReasons[0]?.code || '');
      await addCreatedApprovalToStatusList(approvalResult.requestId);
      setToast({ type: 'success', message: 'تم إرسال طلب الإجازة للموافقات' });
      setRecentLeaves(await leaveRequestService.getByEmployee(selectedWorker.employeeId));
      await fetchPendingApprovalRequests({ silent: true });
      return true;
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'فشل إرسال طلب الإجازة' });
      return false;
    } finally {
      setSubmitting(null);
    }
  }, [addCreatedApprovalToStatusList, fetchPendingApprovalRequests, getApprovalContext, leaveDays, leaveEndDate, leaveReasons, leaveStartDate, leaveType, resolvedSupervisor?.name, selectedLeaveReason, selectedLeaveType, selectedWorker, supervisorId, uid, userDisplayName]);

  const handleLoanSubmit = useCallback(async (): Promise<boolean> => {
    const amount = Number(loanAmount || 0);
    if (!selectedWorker || amount <= 0) return false;
    setSubmitting('loan');
    try {
      const { approvalEmployees } = getApprovalContext();
      const isMonthly = loanType === 'monthly_advance';
      const installments = isMonthly ? 1 : Math.max(1, Number(loanInstallments || 1));
      const startMonth = getCurrentMonth();
      const loanId = await loanService.create({
        employeeId: selectedWorker.employeeId,
        employeeName: selectedWorker.employeeName,
        employeeCode: selectedWorker.employeeCode,
        loanType,
        loanAmount: amount,
        installmentAmount: isMonthly ? amount : loanInstallmentAmount,
        totalInstallments: installments,
        remainingInstallments: installments,
        startMonth,
        month: isMonthly ? startMonth : undefined,
        status: 'pending',
        approvalChain: [],
        finalStatus: 'pending',
        reason: loanReason,
        disbursed: false,
        createdBy: uid || '',
      });
      const approvalResult = await productionApprovalRequestService.create({
        requestType: 'loan',
        employeeId: selectedWorker.employeeId,
        employeeName: selectedWorker.employeeName,
        departmentId: selectedWorker.employee.departmentId || 'production',
        requestData: {
          loanType,
          loanTypeLabel: LOAN_TYPE_LABELS[loanType],
          loanAmount: amount,
          installmentAmount: isMonthly ? amount : loanInstallmentAmount,
          totalInstallments: installments,
          remainingInstallments: installments,
          startMonth,
          month: isMonthly ? startMonth : undefined,
          reason: loanReason || '—',
          productionLineId: selectedWorker.lineId,
          productionLineName: selectedWorker.lineName,
        },
        sourceRequestId: loanId,
        createdBy: uid || '',
        createdByEmployeeId: supervisorId,
        createdByName: resolvedSupervisor?.name || userDisplayName || '',
        approvalEmployees,
      });
      if (!approvalResult.success) {
        await loanService.delete(loanId);
        throw new Error(approvalResult.error || 'تعذر إرسال طلب السلفة للموافقات');
      }
      setLoanAmount('');
      setLoanInstallments('1');
      setLoanReason('');
      await addCreatedApprovalToStatusList(approvalResult.requestId);
      setToast({ type: 'success', message: 'تم إرسال طلب السلفة للموافقات' });
      setRecentLoans(await loanService.getByEmployee(selectedWorker.employeeId));
      await fetchPendingApprovalRequests({ silent: true });
      return true;
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'فشل إرسال طلب السلفة' });
      return false;
    } finally {
      setSubmitting(null);
    }
  }, [addCreatedApprovalToStatusList, fetchPendingApprovalRequests, getApprovalContext, loanAmount, loanInstallmentAmount, loanInstallments, loanReason, loanType, resolvedSupervisor?.name, selectedWorker, supervisorId, uid, userDisplayName]);

  const handlePenaltySubmit = useCallback(async (): Promise<boolean> => {
    const durationDays = normalizePenaltyDurationDays(penaltyDurationDays);
    const durationLabel = formatPenaltyDuration(durationDays);
    const calculatedAmount = calculatePenaltyAmountFromDuration(durationDays, selectedWorker?.employee);
    if (!selectedWorker || durationDays <= 0 || !durationLabel || !penaltyMonth || !penaltyReason.trim()) return false;
    setSubmitting('penalty');
    try {
      const { approvalEmployees } = getApprovalContext();
      const approvalResult = await productionApprovalRequestService.create({
        requestType: 'penalty',
        employeeId: selectedWorker.employeeId,
        employeeName: selectedWorker.employeeName,
        departmentId: selectedWorker.employee.departmentId || 'production',
        requestData: {
          penaltyName: penaltyName.trim() || 'جزاء تأديبي',
          penaltyDurationDays: Math.round(durationDays * 1000) / 1000,
          penaltyDurationLabel: durationLabel,
          ...(calculatedAmount ? {
            penaltyAmount: calculatedAmount.amount,
            penaltyDailyRate: calculatedAmount.dailyRate,
            penaltyAmountSource: 'base_salary_daily_rate',
          } : {
            penaltyAmountSource: 'duration_only',
          }),
          startMonth: penaltyMonth,
          reason: penaltyReason.trim(),
          productionLineId: selectedWorker.lineId,
          productionLineName: selectedWorker.lineName,
        },
        sourceRequestId: null,
        createdBy: uid || '',
        createdByEmployeeId: supervisorId,
        createdByName: resolvedSupervisor?.name || userDisplayName || '',
        approvalEmployees,
      });
      if (!approvalResult.success) {
        throw new Error(approvalResult.error || 'تعذر إرسال طلب الجزاء للموافقات');
      }
      setPenaltyDurationDays('0.25');
      setPenaltyReason('');
      await addCreatedApprovalToStatusList(approvalResult.requestId);
      setToast({ type: 'success', message: 'تم إرسال طلب الجزاء للموافقات' });
      await fetchPendingApprovalRequests({ silent: true });
      return true;
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'فشل إرسال طلب الجزاء' });
      return false;
    } finally {
      setSubmitting(null);
    }
  }, [addCreatedApprovalToStatusList, fetchPendingApprovalRequests, getApprovalContext, penaltyDurationDays, penaltyMonth, penaltyName, penaltyReason, resolvedSupervisor?.name, selectedWorker, supervisorId, uid, userDisplayName]);

  const handleCreateRequestSubmit = useCallback(async () => {
    const success = activeTab === 'leave'
      ? await handleLeaveSubmit()
      : activeTab === 'loan'
        ? await handleLoanSubmit()
        : await handlePenaltySubmit();
    if (success) setCreateModalOpen(false);
  }, [activeTab, handleLeaveSubmit, handleLoanSubmit, handlePenaltySubmit]);

  if (loading) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  if (!canUsePage) {
    return <Card><p className="text-sm font-bold text-rose-600">غير مصرح بعرض طلبات الإنتاج.</p></Card>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الإنتاج"
        subtitle="إنشاء ومتابعة طلبات عمال الإنتاج مع تصدير الحالة كملف Excel أو PDF"
        icon="assignment"
        primaryAction={canCreateProductionRequests ? {
          label: 'طلب جديد',
          icon: 'add',
          onClick: () => setCreateModalOpen(true),
          disabled: workerOptions.length === 0,
        } : undefined}
      />

      {toast && (
        <div className={`rounded-[var(--border-radius-lg)] border px-4 py-3 text-sm font-bold ${
          toast.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}
        >
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">المستخدم الحالي</p>
          <p className="text-lg font-black text-[var(--color-text)]">{resolvedSupervisor?.name || userDisplayName || '—'}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {teamScopeLabel} — المتاحين: {teamWorkers.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">طلبات الاعتماد</p>
          <p className="text-lg font-black text-[var(--color-text)]">{actionableApprovalCount}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{approvalRequests.length} طلب ظاهر لك مع الحالة الحالية</p>
        </Card>
        <Card>
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">إنشاء الطلبات</p>
          <p className="text-lg font-black text-[var(--color-text)]">إجازة / سلفة / جزاء</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">اختر العامل والنوع داخل نافذة الطلب الجديد</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 bg-[#f0f2f5] p-1 rounded-[var(--border-radius-lg)] w-fit">
        {[
          ...(canCreateProductionRequests ? [{ key: 'create' as const, label: 'إنشاء طلب إنتاج', icon: 'edit_note' }] : []),
          { key: 'approvals' as const, label: `حالات الطلبات${approvalRequests.length ? ` (${approvalRequests.length})` : ''}`, icon: 'approval' },
          { key: 'history' as const, label: `سجل الطلبات${filteredHistoryRequests.length ? ` (${filteredHistoryRequests.length})` : ''}`, icon: 'history' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActivePageTab(tab.key)}
            className={`px-5 py-2.5 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
              activePageTab === tab.key
                ? 'bg-[var(--color-card)] text-primary shadow-sm'
                : 'text-slate-500 hover:text-[var(--color-text)]'
            }`}
          >
            <span className="material-icons-round text-sm ml-1.5 align-middle">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activePageTab === 'history' ? (
        <Card>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-base font-black text-[var(--color-text)]">سجل طلبات الإنتاج</h3>
              <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">يعرض الطلبات المعتمدة والمرفوضة والملغاة ضمن نطاقك الحالي.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportHistory} disabled={filteredHistoryRequests.length === 0}>
                <span className="material-icons-round text-sm">download</span>
                تصدير Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => { void handleExportApprovalsPdf(); }}
                disabled={filteredHistoryRequests.length === 0 || exportingApprovalsPdf}
              >
                <span className="material-icons-round text-sm">{exportingApprovalsPdf ? 'hourglass_empty' : 'picture_as_pdf'}</span>
                {exportingApprovalsPdf ? 'جاري التصدير...' : 'تصدير PDF'}
              </Button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-xs font-black text-[var(--color-text-muted)]">الحالة</label>
              <select
                className={INPUT_CLASS}
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as HistoryStatusFilter)}
              >
                <option value="all">كل الحالات النهائية</option>
                <option value="approved">المعتمدة</option>
                <option value="rejected">المرفوضة</option>
                <option value="cancelled">الملغاة</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-black text-[var(--color-text-muted)]">المشرف أو الموافق</label>
              <SearchableSelect
                options={[{ value: '', label: 'كل المشاركين' }, ...historyParticipantOptions]}
                value={historyParticipantFilter}
                onChange={setHistoryParticipantFilter}
                placeholder="اختر منشئ الطلب أو أحد الموافقين..."
                className="h-12 bg-[#f8f9fa]"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setHistoryStatusFilter('all');
                setHistoryParticipantFilter('');
              }}
              disabled={historyStatusFilter === 'all' && !historyParticipantFilter}
            >
              <span className="material-icons-round text-sm">filter_alt_off</span>
              مسح الفلاتر
            </Button>
          </div>

          {approvalsLoading ? (
            <div className="text-sm font-bold text-[var(--color-text-muted)] py-8 text-center">جاري تحميل سجل الطلبات...</div>
          ) : filteredHistoryRequests.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-icons-round text-5xl text-[var(--color-text-muted)] mb-3 block">history</span>
              <p className="text-sm font-bold text-slate-500">لا توجد طلبات نهائية تطابق الفلاتر الحالية.</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">جرّب تغيير الحالة أو اختيار مشارك آخر في سلسلة الاعتماد.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHistoryRequests.map((req) => {
                const typeCfg = getRequestTypeConfig(req.requestType);
                const statusCfg = getProductionApprovalStatusDisplay(req);
                const requestId = req.id || '';
                const renderKey = getProductionApprovalRenderKey(req);
                const approvalChain = getRequestApprovalChain(req);
                const requesterName = req.requestData?.requestedByName || req.createdBy || '—';
                const decidedBy = (Array.isArray(req.history) ? req.history : [])
                  ?.slice()
                  .reverse()
                  .find((entry) => entry.newStatus === req.status || entry.action === req.status);
                const approvalLeaveTypeLabel = getSupervisorApprovalLeaveTypeLabel(req);

                return (
                  <div key={requestId} className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-card)] p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0 ${typeCfg.bg}`}>
                          <span className={`material-icons-round ${typeCfg.color}`}>{typeCfg.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="info">{typeCfg.label}</Badge>
                            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                            {approvalLeaveTypeLabel && <Badge variant="neutral">{approvalLeaveTypeLabel}</Badge>}
                          </div>
                          <h4 className="mt-2 text-base font-black text-[var(--color-text)]">{formatRequestSummary(req)}</h4>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            <span className="font-bold text-[var(--color-text)]">{req.employeeName}</span> — {formatRequestDetail(req)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            مقدم بواسطة: {requesterName} — تاريخ الطلب: {formatApprovalCreatedAt(req.createdAt)}
                            {decidedBy?.performedByName ? ` — آخر قرار: ${decidedBy.performedByName}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-0 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa] p-3 text-xs font-bold text-[var(--color-text-muted)] lg:max-w-md">
                        <p className="mb-2 text-[var(--color-text)]">سلسلة الاعتماد</p>
                        <div className="flex flex-wrap gap-2">
                          {approvalChain.length === 0 ? (
                            <span>اعتماد تلقائي</span>
                          ) : approvalChain.map((step, index) => (
                            <span key={`${requestId}-${step.approverEmployeeId}-${index}`} className="rounded-full bg-white px-3 py-1 border border-[var(--color-border)]">
                              {step.approverName || step.approverEmployeeId} — {step.status === 'approved' ? 'اعتمد' : step.status === 'rejected' ? 'رفض' : step.status === 'skipped' ? 'تم التخطي' : 'لم يكتمل'}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : activePageTab === 'approvals' ? (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black text-[var(--color-text)]">طلبات الإنتاج وحالاتها</h3>
              <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">تابع المرحلة الحالية أو صدّر الطلبات الظاهرة كملف Excel أو PDF.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportApprovals} disabled={approvalRequests.length === 0}>
                <span className="material-icons-round text-sm">download</span>
                تصدير Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => { void handleExportApprovalsPdf(); }}
                disabled={approvalRequests.length === 0 || exportingApprovalsPdf}
              >
                <span className="material-icons-round text-sm">{exportingApprovalsPdf ? 'hourglass_empty' : 'picture_as_pdf'}</span>
                {exportingApprovalsPdf ? 'جاري التصدير...' : 'تصدير PDF'}
              </Button>
            </div>
          </div>
          {approvalsLoading ? (
            <div className="text-sm font-bold text-[var(--color-text-muted)] py-8 text-center">جاري تحميل طلبات الاعتماد...</div>
          ) : approvalRequests.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-icons-round text-5xl text-[var(--color-text-muted)] mb-3 block">task_alt</span>
              <p className="text-sm font-bold text-slate-500">لا توجد طلبات إنتاج ظاهرة حالياً.</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">ستظهر هنا طلبات عمال الإنتاج التي أنشأتها، وكذلك الطلبات التي تنتظر قرارك.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvalRequests.map((req) => {
                const typeCfg = getRequestTypeConfig(req.requestType);
                const statusCfg = getProductionApprovalStatusDisplay(req);
                const requestId = req.id || '';
                const renderKey = getProductionApprovalRenderKey(req);
                const approvalChain = getRequestApprovalChain(req);
                const currentStep = getRequestCurrentStep(req);
                const isProcessing = approvalActionLoading === requestId;
                const requesterName = req.requestData?.requestedByName || req.createdBy || '—';
                const isExpanded = requestId ? expandedApprovalIds.has(requestId) : false;
                const canAct = canSupervisorActOnApprovalRequest(req, supervisorId);
                const isCreatedBySupervisor = isApprovalRequestCreatedBySupervisor(req, supervisorId, uid || undefined);
                const canCancel = canSupervisorCancelApprovalRequest(req, supervisorId, uid || undefined);
                const approvalLeaveTypeLabel = getSupervisorApprovalLeaveTypeLabel(req);

                return (
                  <div key={renderKey} className={`border rounded-[var(--border-radius-lg)] bg-[var(--color-card)] overflow-hidden ${canAct ? 'border-primary/20' : 'border-[var(--color-border)]'}`}>
                    <div className="p-4">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0 ${typeCfg.bg}`}>
                            <span className={`material-icons-round ${typeCfg.color}`}>{typeCfg.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="info">{typeCfg.label}</Badge>
                              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                              {isCreatedBySupervisor && !canAct && <Badge variant="neutral">للمتابعة</Badge>}
                              {approvalChain[currentStep]?.delegatedToName && <Badge variant="info">مفوّض</Badge>}
                            </div>
                            <h4 className="text-base font-black text-[var(--color-text)] mt-2">{formatRequestSummary(req)}</h4>
                            <p className="text-sm text-[var(--color-text-muted)] mt-1">
                              <span className="font-bold text-[var(--color-text)]">{req.employeeName}</span> — {formatRequestDetail(req)}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                              مقدم بواسطة: {requesterName} — تاريخ الطلب: {formatApprovalCreatedAt(req.createdAt)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestId && toggleApprovalDetails(requestId)}
                          className="text-xs text-primary font-bold flex items-center gap-1 self-start"
                        >
                          <span className="material-icons-round text-sm">{isExpanded ? 'expand_less' : 'info'}</span>
                          {isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4">
                          <div>
                            <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">العامل</p>
                            <p className="font-bold text-[var(--color-text)]">{req.employeeName}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">الخط</p>
                            <p className="font-bold text-[var(--color-text)]">{req.requestData?.productionLineName || '—'}</p>
                          </div>
                          {req.requestType === 'leave' && (
                            <div>
                              <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">نوع الإجازة</p>
                              <p className="font-bold text-[var(--color-text)]">{approvalLeaveTypeLabel || '—'}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">الخطوة الحالية</p>
                            <p className="font-bold text-[var(--color-text)]">{approvalChain[currentStep]?.approverName || '—'}</p>
                          </div>
                          <div className="md:col-span-3">
                            <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">ملاحظات الطلب</p>
                            <p className="font-medium text-[var(--color-text)]">{req.requestData?.reason || '—'}</p>
                          </div>
                        </div>
                      )}

                      {canAct && (
                        <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex flex-col lg:flex-row gap-3">
                          <input
                            type="text"
                            className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-2.5 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                            placeholder="ملاحظات الاعتماد (اختياري)..."
                            value={approvalActionNotes[requestId] || ''}
                            onChange={(e) => setApprovalActionNotes((prev) => ({ ...prev, [requestId]: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleApprovalAction(req, 'rejected')}
                              disabled={isProcessing}
                              className="!border-rose-200 !text-rose-600 hover:!bg-rose-50"
                            >
                              {isProcessing && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                              <span className="material-icons-round text-sm">close</span>
                              رفض
                            </Button>
                            <Button variant="secondary" onClick={() => handleApprovalAction(req, 'approved')} disabled={isProcessing}>
                              {isProcessing && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                              <span className="material-icons-round text-sm">check</span>
                              اعتماد
                            </Button>
                          </div>
                        </div>
                      )}

                      {canCancel && (
                        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                          <Button
                            variant="outline"
                            onClick={() => { void handleCancelApprovalRequest(req); }}
                            disabled={isProcessing}
                            className="!border-slate-200 !text-slate-600 hover:!bg-slate-50"
                          >
                            {isProcessing && <span className="material-icons-round animate-spin text-sm">refresh</span>}
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
        </Card>
      ) : canCreateProductionRequests ? (
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-[var(--color-text)]">إنشاء طلب إنتاج جديد</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                اختر العامل ونوع الطلب داخل نافذة واحدة، ثم أرسله لمسار اعتماد الإدارة الحالي.
              </p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)} disabled={workerOptions.length === 0}>
              <span className="material-icons-round text-sm">add</span>
              طلب جديد
            </Button>
          </div>
          {workerOptions.length === 0 && (
            <div className="mt-4 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4">
              لا يوجد عمال إنتاج متاحون لك حالياً. تأكد من ربط العاملين بخطوط الإنتاج المناسبة.
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">هذه الصفحة مخصصة للاطلاع فقط لهذا المستخدم.</p>
        </Card>
      )}

      {canCreateProductionRequests && (
      <Dialog open={createModalOpen} onOpenChange={(open) => !submitting && setCreateModalOpen(open)}>
        <DialogContent
          className="!flex !flex-col !w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] !max-h-[min(96vh,96dvh)] !overflow-hidden !p-0 sm:!w-full sm:!max-w-5xl sm:!p-0"
          dir="rtl"
        >
          <DialogHeader className="shrink-0 border-b border-[var(--color-border)] px-4 py-4 pl-10 text-right sm:px-6 sm:py-5 sm:text-right">
            <DialogTitle>طلب جديد</DialogTitle>
            <DialogDescription>
              اختر العامل ونوع الطلب، وستظهر الحقول المطلوبة حسب النوع المحدد.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4 sm:space-y-5">
              <Card title="١. اختيار العامل">
                {workerOptions.length === 0 ? (
                  <div className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4">
                    لا يوجد عمال إنتاج متاحون لك حالياً. تأكد من ربط العاملين بخطوط الإنتاج المناسبة.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <SearchableSelect
                      options={workerOptions}
                      value={selectedEmployeeId}
                      onChange={setSelectedEmployeeId}
                      placeholder="اختر العامل..."
                    />
                    <p className="text-xs font-bold text-[var(--color-text-muted)]">ابدأ باختيار العامل حتى تظهر بياناته والحقول المناسبة للطلب.</p>
                  </div>
                )}
              </Card>

              {selectedWorker && (
                <>
                  <div className="rounded-[var(--border-radius-xl)] border border-primary/20 bg-primary/5 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="material-icons-round text-primary">badge</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-primary mb-1">العامل المحدد</p>
                          <h3 className="break-words text-lg font-black text-[var(--color-text)]">{selectedWorker.employeeName}</h3>
                          <p className="mt-1 break-words text-sm font-bold text-[var(--color-text-muted)]">
                            {selectedWorker.employeeCode || 'بدون كود'} — {selectedWorker.lineName}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:min-w-[22rem]">
                        <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-card)] border border-[var(--color-border)] px-3 py-2">
                          <p className="text-[11px] font-bold text-slate-500">سنوية</p>
                          <p className="text-base font-black text-blue-600">{leaveBalance?.annualBalance ?? '—'}</p>
                        </div>
                        <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-card)] border border-[var(--color-border)] px-3 py-2">
                          <p className="text-[11px] font-bold text-slate-500">مرضية</p>
                          <p className="text-base font-black text-rose-600">{leaveBalance?.sickBalance ?? '—'}</p>
                        </div>
                        <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-card)] border border-[var(--color-border)] px-3 py-2">
                          <p className="text-[11px] font-bold text-slate-500">طارئة</p>
                          <p className="text-base font-black text-amber-600">{leaveBalance?.emergencyBalance ?? '—'}</p>
                        </div>
                        <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-card)] border border-[var(--color-border)] px-3 py-2">
                          <p className="text-[11px] font-bold text-slate-500">طلبات حديثة</p>
                          <p className="text-base font-black text-slate-700">{recentLeaves.length + recentLoans.length}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                <Card title="٢. نوع الطلب">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {ACTION_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`min-w-0 rounded-[var(--border-radius-lg)] border px-2 py-2.5 text-center transition-all sm:px-3 sm:py-3 ${
                          activeTab === tab.key
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                          <span className={`w-8 h-8 rounded-[var(--border-radius-base)] flex shrink-0 items-center justify-center sm:w-9 sm:h-9 ${
                            activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-[#f0f2f5] text-slate-500'
                          }`}
                          >
                            <span className="material-icons-round text-lg sm:text-xl">{tab.icon}</span>
                          </span>
                          {activeTab === tab.key && <span className="hidden sm:inline-flex"><Badge variant="info">محدد</Badge></span>}
                        </div>
                        <p className="mt-2 truncate text-sm font-black text-[var(--color-text)] sm:text-base">{tab.label}</p>
                        <p className="mt-1 hidden text-xs font-bold text-[var(--color-text-muted)] sm:block">
                          {tab.key === 'leave' ? 'تواريخ ومدة الإجازة' : tab.key === 'loan' ? 'قيمة السلفة وجدول السداد' : 'مدة جزاء مع سبب واضح'}
                        </p>
                        {activeTab === tab.key && <p className="mt-1 text-[11px] font-black text-primary sm:hidden">محدد</p>}
                      </button>
                    ))}
                  </div>
                </Card>

                <Card title={`٣. تفاصيل ${activeActionTab.label}`}>
                  {activeTab === 'leave' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">نوع الإجازة</label>
                          <select className={INPUT_CLASS} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                            {(leaveTypes.length ? leaveTypes : Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => ({ key, label, isPaid: key !== 'unpaid' }))).map((row) => (
                              <option key={row.key} value={row.key}>{row.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <div className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm bg-[#f8f9fa]">
                            <span className="text-[var(--color-text-muted)] font-bold">الأثر على الراتب: </span>
                            <span className={selectedLeaveType?.isPaid === false ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold'}>
                              {selectedLeaveType?.isPaid === false ? 'غير مدفوعة' : 'مدفوعة'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">تاريخ البداية</label>
                          <input type="date" className={INPUT_CLASS} value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">تاريخ النهاية</label>
                          <input type="date" className={INPUT_CLASS} value={leaveEndDate} min={leaveStartDate} onChange={(e) => setLeaveEndDate(e.target.value)} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">السبب</label>
                          {leaveReasonOptions.length > 0 ? (
                            <SearchableSelect
                              options={leaveReasonOptions}
                              value={leaveReasonCode}
                              onChange={setLeaveReasonCode}
                              placeholder="ابحث واختر سبب الإجازة..."
                              className="h-12 bg-[#f8f9fa]"
                            />
                          ) : (
                            <div className="border border-amber-200 bg-amber-50 rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-bold text-amber-700">
                              لا توجد أسباب إجازات معرفة. يرجى إضافتها من إعدادات الإجازات ثم العودة لإنشاء الطلب.
                            </div>
                          )}
                        </div>
                      </div>
                      {leaveDays > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-[var(--border-radius-lg)] p-4 text-sm font-bold text-blue-700">
                          مدة الإجازة: {leaveDays} يوم
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'loan' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">نوع السلفة</label>
                        <select className={INPUT_CLASS} value={loanType} onChange={(e) => setLoanType(e.target.value as LoanType)}>
                          <option value="monthly_advance">{LOAN_TYPE_LABELS.monthly_advance}</option>
                          <option value="installment">{LOAN_TYPE_LABELS.installment}</option>
                        </select>
                        <p className="text-xs font-bold text-[var(--color-text-muted)] mt-2">
                          {loanType === 'monthly_advance' ? 'السلفة الشهرية تسدد على شهر واحد.' : 'سلفة الأقساط تعرض قيمة القسط قبل الإرسال.'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">المبلغ</label>
                        <input type="number" className={INPUT_CLASS} value={loanAmount} min="0" step="100" onChange={(e) => setLoanAmount(e.target.value)} placeholder="0.00" />
                        <p className="text-xs font-bold text-[var(--color-text-muted)] mt-2">أدخل قيمة السلفة قبل اختيار عدد الأقساط.</p>
                      </div>
                      {loanType === 'installment' && (
                        <div>
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">عدد الأقساط</label>
                          <input type="number" className={INPUT_CLASS} value={loanInstallments} min="2" max="60" onChange={(e) => setLoanInstallments(e.target.value)} />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">{loanType === 'monthly_advance' ? 'شهر السلفة' : 'شهر بداية السداد'}</label>
                        <div className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-bold bg-[#f8f9fa] text-[var(--color-text)]">
                          <span className="font-mono" dir="ltr">{automaticLoanStartMonth}</span>
                        </div>
                        <p className="text-xs font-bold text-[var(--color-text-muted)] mt-2">
                          يتم تحديد الشهر تلقائياً حسب شهر الرواتب الحالي.
                        </p>
                      </div>
                      {loanType === 'installment' && loanInstallmentAmount > 0 && (
                        <div className="flex items-end">
                          <div className="bg-primary/10 rounded-[var(--border-radius-lg)] p-4 w-full text-center">
                            <p className="text-xs text-primary font-bold mb-1">القسط الشهري المتوقع</p>
                            <p className="text-xl font-bold text-primary">{formatCurrency(loanInstallmentAmount)}</p>
                          </div>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">السبب</label>
                        <input type="text" className={INPUT_CLASS} value={loanReason} onChange={(e) => setLoanReason(e.target.value)} placeholder="سبب السلفة..." />
                      </div>
                    </div>
                  )}

                  {activeTab === 'penalty' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">اسم الجزاء</label>
                          <input type="text" className={INPUT_CLASS} value={penaltyName} onChange={(e) => setPenaltyName(e.target.value)} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">مدة الجزاء *</label>
                          <div className="flex flex-wrap gap-2">
                            {PENALTY_DURATION_PRESETS.map((preset) => (
                              <button
                                key={preset.days}
                                type="button"
                                onClick={() => setPenaltyDurationDays(String(preset.days))}
                                className={`rounded-[var(--border-radius-base)] border px-3 py-2 text-xs font-black transition-colors ${
                                  Number(penaltyDurationDays || 0) === preset.days
                                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                                    : 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)] hover:border-rose-200'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 sm:items-center">
                            <input
                              type="number"
                              className={INPUT_CLASS}
                              value={penaltyDurationDays}
                              min="0.125"
                              step="0.125"
                              onChange={(e) => setPenaltyDurationDays(e.target.value)}
                              placeholder="مثال: 0.125 أو 0.25 أو 3"
                            />
                            <div className="rounded-[var(--border-radius-lg)] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
                              {penaltyDurationLabel || 'حدد المدة'}
                            </div>
                          </div>
                          <p className="text-xs font-bold text-[var(--color-text-muted)] mt-2">يمكن اختيار ربع يوم، نصف يوم، يوم، ٣ أيام، أو إدخال كسر مثل ١/٨ يوم كقيمة 0.125.</p>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">شهر التطبيق</label>
                          <input type="month" className={INPUT_CLASS} value={penaltyMonth} onChange={(e) => setPenaltyMonth(e.target.value)} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">سبب الجزاء *</label>
                          <textarea className={`${INPUT_CLASS} resize-none`} rows={3} value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} placeholder="اكتب سبب الجزاء..." />
                          <p className="text-xs font-bold text-rose-500 mt-2">سبب الجزاء مطلوب لإرسال الطلب.</p>
                        </div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4 text-sm font-bold text-amber-700">
                        {penaltyAmountPreview
                          ? `بعد الاعتماد سيُحتسب الخصم تقريباً ${formatCurrency(penaltyAmountPreview.amount)} ج.م على أساس ${formatCurrency(penaltyAmountPreview.dailyRate)} ج.م/يوم.`
                          : 'سيتم حفظ مدة الجزاء بعد الاعتماد. لا يوجد راتب أساسي كافٍ لحساب مبلغ الخصم تلقائياً.'}
                      </div>
                    </div>
                  )}
                </Card>

                  <Card title="٤. مراجعة وإرسال">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                      <div className="rounded-[var(--border-radius-lg)] bg-[#f8f9fa] border border-[var(--color-border)] p-3">
                        <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">العامل</p>
                        <p className="break-words text-sm font-black text-[var(--color-text)]">{selectedWorker.employeeName}</p>
                      </div>
                      <div className="rounded-[var(--border-radius-lg)] bg-[#f8f9fa] border border-[var(--color-border)] p-3">
                        <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">نوع الطلب</p>
                        <p className="text-sm font-black text-[var(--color-text)]">{activeActionTab.label}</p>
                      </div>
                      <div className="rounded-[var(--border-radius-lg)] bg-[#f8f9fa] border border-[var(--color-border)] p-3">
                        <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">ملخص سريع</p>
                        <p className="text-sm font-black text-[var(--color-text)]">
                          {activeTab === 'leave'
                            ? leaveDays > 0 ? `${leaveDays} يوم` : 'حدد التواريخ'
                            : activeTab === 'loan'
                              ? `${formatCurrency(Number(loanAmount || 0))} ج.م`
                              : penaltyDurationLabel || 'حدد مدة الجزاء'}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="آخر طلبات العامل">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      {recentLeaves.slice(0, 3).map((row) => (
                        <div key={row.id} className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2 last:border-b-0">
                          <div>
                            <p className="text-sm font-bold">إجازة {row.leaveTypeLabel || LEAVE_TYPE_LABELS[row.leaveType] || row.leaveType}</p>
                            <p className="text-xs text-slate-500">{row.startDate} → {row.endDate}</p>
                          </div>
                          <Badge variant={row.finalStatus === 'approved' ? 'success' : row.finalStatus === 'rejected' ? 'danger' : 'warning'}>{row.finalStatus}</Badge>
                        </div>
                      ))}
                      {recentLeaves.length === 0 && <p className="text-sm text-slate-500">لا توجد إجازات حديثة.</p>}
                    </div>
                    <div className="space-y-3">
                      {recentLoans.slice(0, 3).map((row) => (
                        <div key={row.id} className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2 last:border-b-0">
                          <div>
                            <p className="text-sm font-bold">{LOAN_TYPE_LABELS[row.loanType]}</p>
                            <p className="text-xs text-slate-500">{formatCurrency(row.loanAmount)} ج.م</p>
                          </div>
                          <Badge variant={row.finalStatus === 'approved' ? 'success' : row.finalStatus === 'rejected' ? 'danger' : 'warning'}>{row.finalStatus}</Badge>
                        </div>
                      ))}
                      {recentLoans.length === 0 && <p className="text-sm text-slate-500">لا توجد سلف حديثة.</p>}
                    </div>
                  </div>
                </Card>
                </>
              )}
            </div>
          </div>

          {selectedWorker && (
            <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-card)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-black text-[var(--color-text)]">{activeActionTab.label} — {selectedWorker.employeeName}</p>
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">
                    {activeTab === 'leave'
                      ? leaveDays > 0 ? `${leaveDays} يوم` : 'حدد تواريخ الإجازة'
                      : activeTab === 'loan'
                        ? `${formatCurrency(Number(loanAmount || 0))} ج.م`
                        : penaltyDurationLabel || 'حدد مدة الجزاء'}
                  </p>
                </div>
                <Button
                  variant={activeTab === 'penalty' ? 'danger' : 'primary'}
                  onClick={handleCreateRequestSubmit}
                  disabled={isCreateRequestDisabled}
                  className="w-full sm:w-auto"
                >
                  {submitting === activeTab && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                  {activeTab === 'leave' ? 'إرسال طلب الإجازة' : activeTab === 'loan' ? 'إرسال طلب السلفة' : 'إرسال طلب الجزاء'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      )}
      {pdfExportRows.length > 0 && (
        <div
          ref={approvalsPdfRef}
          className="arabic-export-root"
          dir="rtl"
          style={{
            position: 'absolute',
            left: '-10000px',
            top: 0,
            width: '1120px',
            background: '#ffffff',
            color: '#0f172a',
            padding: '24px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontFamily: 'Cairo, Tahoma, sans-serif' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 900 }}>{pdfExportTitle}</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
              تقرير إنتاجي للطلبات الظاهرة وحالة اعتماد الإدارة
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr>
                  {pdfExportHeaders.map((header) => (
                    <th
                      key={header}
                      style={{
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        padding: '8px',
                        textAlign: 'right',
                        fontWeight: 900,
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pdfExportRows.map((row, index) => (
                  <tr key={String(row['رقم الطلب'] || index)}>
                    {pdfExportHeaders.map((header) => (
                      <td
                        key={header}
                        style={{
                          border: '1px solid #e2e8f0',
                          padding: '7px',
                          verticalAlign: 'top',
                          fontWeight: 700,
                        }}
                      >
                        {String(row[header] ?? '—') || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
