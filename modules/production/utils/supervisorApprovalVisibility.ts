import type { FirestoreApprovalRequest } from '../../hr/approval';
import {
  getApprovalStatusDisplay,
  type ApprovalStatusDisplay,
} from '../../hr/approval/approvalStatusDisplay';
import { LEAVE_TYPE_LABELS } from '../../hr/types';

const ACTIONABLE_STATUSES = new Set(['pending', 'in_progress', 'escalated']);
const HISTORY_STATUSES = new Set(['approved', 'rejected', 'cancelled']);
const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: 'إجازة',
  loan: 'سلفة',
  penalty: 'جزاء',
  overtime: 'عمل إضافي',
};

function getCreatedTime(request: FirestoreApprovalRequest): number {
  return request.createdAt?.toMillis?.() ?? request.createdAt?.seconds * 1000 ?? 0;
}

function formatExportDate(value: any): string {
  const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function getRequestAmount(request: FirestoreApprovalRequest): number | string {
  const data = request.requestData || {};
  if (request.requestType === 'loan') return Number(data.loanAmount || 0);
  if (request.requestType === 'penalty') return data.penaltyAmount ? Number(data.penaltyAmount) : '';
  return '';
}

export function getSupervisorApprovalLeaveTypeLabel(request: FirestoreApprovalRequest): string {
  if (request.requestType !== 'leave') return '';

  const data = request.requestData || {};
  const explicitLabel = String(data.leaveTypeLabel || '').trim();
  if (explicitLabel) return explicitLabel;

  const leaveTypeKey = String(data.leaveType || data.leaveTypeId || data.type || '').trim();
  return leaveTypeKey ? LEAVE_TYPE_LABELS[leaveTypeKey] || leaveTypeKey : '';
}

function toProductionApprovalLabel(label: string): string {
  return label.replace(/موافقة الموارد البشرية/g, 'موافقة الإدارة');
}

export function getProductionApprovalStatusDisplay(
  request: FirestoreApprovalRequest,
): ApprovalStatusDisplay {
  const status = getApprovalStatusDisplay(request);
  return {
    ...status,
    label: toProductionApprovalLabel(status.label),
  };
}

export function isApprovalRequestCreatedBySupervisor(
  request: FirestoreApprovalRequest,
  supervisorEmployeeId: string,
  supervisorUserId?: string,
): boolean {
  const requestedByEmployeeId = String(request.requestData?.requestedByEmployeeId || '').trim();
  const createdBy = String(request.createdBy || '').trim();

  return (
    Boolean(supervisorEmployeeId && requestedByEmployeeId === supervisorEmployeeId) ||
    Boolean(supervisorUserId && createdBy === supervisorUserId)
  );
}

export function canSupervisorActOnApprovalRequest(
  request: FirestoreApprovalRequest,
  supervisorEmployeeId: string,
): boolean {
  if (!ACTIONABLE_STATUSES.has(request.status)) return false;
  if (!supervisorEmployeeId || request.currentStep >= request.approvalChain.length) return false;

  const step = request.approvalChain[request.currentStep];
  return step.approverEmployeeId === supervisorEmployeeId || step.delegatedTo === supervisorEmployeeId;
}

export function canSupervisorCancelApprovalRequest(
  request: FirestoreApprovalRequest,
  supervisorEmployeeId: string,
  supervisorUserId?: string,
): boolean {
  if (!isApprovalRequestCreatedBySupervisor(request, supervisorEmployeeId, supervisorUserId)) return false;
  if (request.status !== 'pending' || request.currentStep !== 0) return false;
  return !request.approvalChain.some((step) => step.status === 'approved' || step.status === 'rejected');
}

export function isProductionApprovalHistoryRequest(request: FirestoreApprovalRequest): boolean {
  return HISTORY_STATUSES.has(request.status);
}

export function getApprovalRequestParticipantEmployeeIds(request: FirestoreApprovalRequest): Set<string> {
  const participants = new Set<string>();
  const requestedByEmployeeId = String(request.requestData?.requestedByEmployeeId || '').trim();
  if (requestedByEmployeeId) participants.add(requestedByEmployeeId);

  (request.requestData?.productionRequestObserverEmployeeIds || []).forEach((employeeId: string) => {
    const normalized = String(employeeId || '').trim();
    if (normalized) participants.add(normalized);
  });

  request.approvalChain.forEach((step) => {
    const approverEmployeeId = String(step.approverEmployeeId || '').trim();
    const delegatedTo = String(step.delegatedTo || '').trim();
    if (approverEmployeeId) participants.add(approverEmployeeId);
    if (delegatedTo) participants.add(delegatedTo);
  });

  request.history?.forEach((entry) => {
    const performedBy = String(entry.performedBy || '').trim();
    if (performedBy && performedBy !== 'system') participants.add(performedBy);
  });

  return participants;
}

export function isApprovalRequestParticipant(
  request: FirestoreApprovalRequest,
  employeeId: string,
  userId?: string,
): boolean {
  if (!employeeId && !userId) return false;

  const requestedByEmployeeId = String(request.requestData?.requestedByEmployeeId || '').trim();
  const createdBy = String(request.createdBy || '').trim();
  const normalizedEmployeeId = String(employeeId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  const participantIds = getApprovalRequestParticipantEmployeeIds(request);

  return (
    Boolean(normalizedUserId && createdBy === normalizedUserId) ||
    Boolean(normalizedEmployeeId && requestedByEmployeeId === normalizedEmployeeId) ||
    Boolean(normalizedEmployeeId && participantIds.has(normalizedEmployeeId)) ||
    Boolean(normalizedUserId && participantIds.has(normalizedUserId))
  );
}

export function filterProductionApprovalHistory(params: {
  requests: FirestoreApprovalRequest[];
  status: 'all' | 'approved' | 'rejected' | 'cancelled';
  participantEmployeeId?: string;
}): FirestoreApprovalRequest[] {
  return params.requests
    .filter(isProductionApprovalHistoryRequest)
    .filter((request) => params.status === 'all' || request.status === params.status)
    .filter((request) => (
      !params.participantEmployeeId ||
      isApprovalRequestParticipant(request, params.participantEmployeeId)
    ));
}

export function mergeSupervisorVisibleApprovalRequests(params: {
  pendingApprovals: FirestoreApprovalRequest[];
  allRequests: FirestoreApprovalRequest[];
  supervisorEmployeeId: string;
  supervisorUserId?: string;
}): FirestoreApprovalRequest[] {
  const createdBySupervisor = params.allRequests.filter((request) =>
    isApprovalRequestCreatedBySupervisor(request, params.supervisorEmployeeId, params.supervisorUserId),
  );

  const merged = new Map<string, FirestoreApprovalRequest>();
  [...params.pendingApprovals, ...createdBySupervisor].forEach((request) => {
    if (request.id) merged.set(request.id, request);
  });

  return Array.from(merged.values()).sort((a, b) => getCreatedTime(b) - getCreatedTime(a));
}

export function buildSupervisorApprovalExportRows(requests: FirestoreApprovalRequest[]): Record<string, string | number>[] {
  return requests.map((request) => {
    const data = request.requestData || {};
    const currentStep = request.approvalChain[request.currentStep];
    const status = getProductionApprovalStatusDisplay(request);

    return {
      'رقم الطلب': request.id || '',
      'نوع الطلب': REQUEST_TYPE_LABELS[request.requestType] || request.requestType,
      'نوع الإجازة': getSupervisorApprovalLeaveTypeLabel(request),
      العامل: request.employeeName || data.employeeName || '',
      'خط الإنتاج': data.productionLineName || '',
      الحالة: status.label,
      'مرحلة الاعتماد': currentStep?.approverName || '',
      'صفة مرحلة الاعتماد': currentStep?.approverJobTitle || '',
      'مقدم الطلب': data.requestedByName || request.createdBy || '',
      'تاريخ الطلب': formatExportDate(request.createdAt),
      'تاريخ البداية': data.startDate || data.startMonth || data.month || '',
      'تاريخ النهاية': data.endDate || '',
      المدة: data.totalDays || data.penaltyDurationLabel || data.penaltyDurationDays || '',
      المبلغ: getRequestAmount(request),
      السبب: data.reason || '',
    };
  });
}
