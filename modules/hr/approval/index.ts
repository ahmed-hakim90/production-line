// ─── Enterprise Approval Engine — Public API ────────────────────────────────

// Types
export type {
  ApprovalRequestType,
  ApprovalRequestStatus,
  ApprovalAction,
  ApprovalChainSnapshot,
  ApprovalStepStatus,
  ApprovalHistoryEntry,
  FirestoreApprovalRequest,
  FirestoreApprovalSettings,
  AutoApproveThreshold,
  FirestoreApprovalDelegation,
  FirestoreApprovalAuditLog,
  ApprovalEmployeeInfo,
  BuildChainOptions,
  BuildChainResult,
  CreateRequestOptions,
  ApprovalActionOptions,
  CancelRequestOptions,
  AdminOverrideOptions,
  OperationResult,
  PendingApprovalsQuery,
} from './types';

export { DEFAULT_APPROVAL_SETTINGS } from './types';

// Collections
export {
  APPROVAL_COLLECTIONS,
  approvalRequestsRef,
  approvalRequestDocRef,
  approvalSettingsDocRef,
  approvalDelegationsRef,
  approvalDelegationDocRef,
  approvalAuditLogsRef,
} from './collections';

// Builder (snapshot-based chain construction)
export {
  buildApprovalChain,
  tryAutoApprove,
  previewApprovalChain,
  validateChain,
} from './approvalBuilder';

// Engine (core CRUD + workflow)
export {
  getApprovalSettings,
  updateApprovalSettings,
  createRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  adminOverride,
  getRequestById,
  getRequestsByEmployee,
  getRequestsByType,
  getAllRequests,
  getPendingApprovals,
  getRequestsByStatus,
} from './approvalEngine';

// Validation (RBAC)
export {
  resolveApprovalRole,
  validateCreate,
  validateAction,
  validateCancel,
  checkAutoApprove,
  canViewAllRequests,
  canActOnRequest,
  type ApprovalRole,
  type CallerContext,
} from './approvalValidation';

// Escalation
export {
  processEscalations,
  getEscalatedRequests,
  isRequestOverdue,
} from './approvalEscalation';

// Delegation
export { approvalDelegationService } from './approvalDelegation';

// Audit
export { approvalAuditService } from './approvalAudit';

// Notifications
export { hrNotificationService } from './notifications';
