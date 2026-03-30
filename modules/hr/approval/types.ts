/**
 * Enterprise Approval Engine — Type Definitions
 *
 * Strict types for the unified approval workflow system.
 * All approval chains are snapshot-based: once created, the chain
 * is immutable regardless of future hierarchy changes.
 */
import type { JobLevel } from '../types';

// ─── Enums & Literal Unions ─────────────────────────────────────────────────

export type ApprovalRequestType = 'overtime' | 'leave' | 'loan';

export type ApprovalRequestStatus =
  | 'pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'escalated';

export type ApprovalAction =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'escalated'
  | 'delegated'
  | 'auto_approved'
  | 'admin_override';

// ─── Approval Chain Snapshot ────────────────────────────────────────────────

/**
 * Immutable snapshot of a single approval step.
 * Captured at request creation time — never mutated if the org changes.
 */
export interface ApprovalChainSnapshot {
  approverEmployeeId: string;
  approverName: string;
  approverJobTitle: string;
  level: JobLevel;
  departmentId: string;
  departmentName: string;
  status: ApprovalStepStatus;
  actionDate: any | null;
  notes: string;
  delegatedTo: string | null;
  delegatedToName: string | null;
}

export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

// ─── History / Audit Trail ──────────────────────────────────────────────────

export interface ApprovalHistoryEntry {
  step: number;
  action: ApprovalAction;
  performedBy: string;
  performedByName: string;
  timestamp: any;
  notes: string;
  previousStatus: ApprovalRequestStatus;
  newStatus: ApprovalRequestStatus;
}

// ─── Firestore Documents ────────────────────────────────────────────────────

export interface FirestoreApprovalRequest {
  id?: string;
  /** Set on create for Firestore security rules (tenant isolation). */
  tenantId?: string;
  requestType: ApprovalRequestType;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  requestData: Record<string, any>;
  approvalChain: ApprovalChainSnapshot[];
  currentStep: number;
  status: ApprovalRequestStatus;
  history: ApprovalHistoryEntry[];
  sourceRequestId: string | null;
  createdAt?: any;
  createdBy: string;
  updatedAt?: any;
  escalatedAt?: any;
}

export interface FirestoreApprovalSettings {
  maxApprovalLevels: number;
  hrAlwaysFinalLevel: boolean;
  escalationDays: number;
  allowDelegation: boolean;
  autoApproveThresholds: AutoApproveThreshold[];
}

export interface AutoApproveThreshold {
  requestType: ApprovalRequestType;
  maxValue: number;
  field: string;
}

export const DEFAULT_APPROVAL_SETTINGS: FirestoreApprovalSettings = {
  maxApprovalLevels: 4,
  hrAlwaysFinalLevel: true,
  escalationDays: 3,
  allowDelegation: true,
  autoApproveThresholds: [],
};

// ─── Delegation ─────────────────────────────────────────────────────────────

export interface FirestoreApprovalDelegation {
  id?: string;
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  startDate: string;
  endDate: string;
  requestTypes: ApprovalRequestType[] | 'all';
  isActive: boolean;
  createdAt?: any;
  createdBy: string;
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

export interface FirestoreApprovalAuditLog {
  id?: string;
  requestId: string;
  requestType: ApprovalRequestType;
  employeeId: string;
  action: ApprovalAction;
  performedBy: string;
  performedByName: string;
  step: number | null;
  details: Record<string, any>;
  timestamp?: any;
}

// ─── Builder Input Types ────────────────────────────────────────────────────

export interface ApprovalEmployeeInfo {
  employeeId: string;
  employeeName: string;
  managerId?: string;
  departmentId: string;
  departmentName: string;
  jobPositionId: string;
  jobTitle: string;
  jobLevel: JobLevel;
}

export interface BuildChainOptions {
  employee: ApprovalEmployeeInfo;
  allEmployees: ApprovalEmployeeInfo[];
  requestType: ApprovalRequestType;
  settings: FirestoreApprovalSettings;
  hrEmployeeId?: string;
}

export interface BuildChainResult {
  chain: ApprovalChainSnapshot[];
  errors: string[];
}

// ─── Engine Operation Types ─────────────────────────────────────────────────

export interface CreateRequestOptions {
  requestType: ApprovalRequestType;
  employeeId: string;
  requestData: Record<string, any>;
  sourceRequestId?: string;
  createdBy: string;
}

export interface ApprovalActionOptions {
  requestId: string;
  approverEmployeeId: string;
  approverName: string;
  action: 'approved' | 'rejected';
  notes?: string;
}

export interface CancelRequestOptions {
  requestId: string;
  cancelledBy: string;
  cancelledByName: string;
  reason?: string;
}

export interface AdminOverrideOptions {
  requestId: string;
  adminEmployeeId: string;
  adminName: string;
  action: 'approved' | 'rejected';
  notes?: string;
}

export interface OperationResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

export interface PendingApprovalsQuery {
  approverEmployeeId: string;
  requestType?: ApprovalRequestType;
}
