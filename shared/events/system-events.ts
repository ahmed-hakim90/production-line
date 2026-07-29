export const SystemEvents = {
  PRODUCTION_STARTED: 'production.started',
  PRODUCTION_CLOSED: 'production.closed',
  REPORT_CREATED: 'production.report.created',
  ISSUE_REQUESTED: 'production.issue.requested',
  WORK_ORDER_STATUS_CHANGED: 'production.work-order.status-changed',
  QC_APPROVED: 'qc.approved',
  QC_REJECTED: 'qc.rejected',
  WORK_ORDER_CREATED: 'work-order.created',
  STOCK_MOVED: 'inventory.stock.moved',
  ISSUE_APPROVED: 'inventory.issue.approved',
  ISSUE_REJECTED: 'inventory.issue.rejected',
  ISSUE_ISSUED: 'inventory.issue.issued',
  TRANSFER_APPROVED: 'inventory.transfer.approved',
  TRANSFER_REJECTED: 'inventory.transfer.rejected',
  TRANSFER_REQUESTED: 'inventory.transfer.requested',
  MATERIAL_CREATED: 'manufacturing.material.created',
  LEAVE_REQUESTED: 'hr.leave.requested',
  REPAIR_JOB_CREATED: 'repair.job.created',
  COST_CENTER_CREATED: 'costs.cost-center.created',
  ROLE_CREATED: 'system.role.created',
  ROLE_UPDATED: 'system.role.updated',
  ROLE_DELETED: 'system.role.deleted',
  USER_ACTION: 'user.action',
  OPERATION_STATUS: 'operation.status',
} as const;

export type SystemEventName = (typeof SystemEvents)[keyof typeof SystemEvents];

export interface EventActor {
  userId?: string;
  userName?: string;
}

export type OperationStatus = 'started' | 'succeeded' | 'failed';

export interface SystemEventBasePayload {
  module?: string;
  entityType?: string;
  entityId?: string;
  batchId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  actor?: EventActor;
  correlationId?: string;
  operation?: string;
  status?: OperationStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  tenantId?: string;
}

export interface ProductionStartedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'production_batch' | 'work_order' | 'production_plan';
  action?: 'start';
}

export interface ProductionClosedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'production_batch' | 'work_order' | 'production_plan';
  action?: 'close';
}

export interface ReportCreatedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'production_report';
  action?: 'create';
  reportType?: string;
  reportCode?: string;
}

export interface IssueRequestedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'production_issue_order';
  action?: 'request';
  workOrderId?: string;
  productionPlanId?: string;
  quantity?: number;
}

export interface WorkOrderStatusChangedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'work_order';
  action?: 'status_change' | 'reopen';
  fromStatus?: string;
  toStatus?: string;
}

export interface QcApprovedPayload extends SystemEventBasePayload {
  module?: 'quality';
  entityType?: 'quality_inspection' | 'work_order';
  action?: 'approve';
}

export interface QcRejectedPayload extends SystemEventBasePayload {
  module?: 'quality';
  entityType?: 'quality_inspection' | 'work_order';
  action?: 'reject';
}

export interface WorkOrderCreatedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'work_order';
  action?: 'create';
  workOrderNumber?: string;
}

export interface StockMovedPayload extends SystemEventBasePayload {
  module?: 'inventory';
  entityType?: 'stock_transaction';
  action?: 'move' | 'transfer' | 'adjust';
  movementType?: string;
  warehouseId?: string;
  quantity?: number;
}

export interface IssueApprovedPayload extends SystemEventBasePayload {
  module?: 'inventory';
  entityType?: 'production_issue_order';
  action?: 'approve';
}

export interface IssueRejectedPayload extends SystemEventBasePayload {
  module?: 'inventory';
  entityType?: 'production_issue_order';
  action?: 'reject';
  reason?: string;
}

export interface IssueIssuedPayload extends SystemEventBasePayload {
  module?: 'inventory';
  entityType?: 'production_issue_order';
  action?: 'issue';
}

export interface TransferDecisionPayload extends SystemEventBasePayload {
  module?: 'inventory';
  entityType?: 'inventory_transfer_request';
  action?: 'approve' | 'reject' | 'request';
  reason?: string;
}

export interface MaterialCreatedPayload extends SystemEventBasePayload {
  module?: 'manufacturing';
  entityType?: 'material';
  action?: 'create';
  materialCode?: string;
}

export interface LeaveRequestedPayload extends SystemEventBasePayload {
  module?: 'hr';
  entityType?: 'leave_request';
  action?: 'request';
  employeeId?: string;
}

export interface RepairJobCreatedPayload extends SystemEventBasePayload {
  module?: 'repair';
  entityType?: 'repair_job';
  action?: 'create';
  receiptNo?: string;
}

export interface CostCenterCreatedPayload extends SystemEventBasePayload {
  module?: 'costs';
  entityType?: 'cost_center';
  action?: 'create';
}

export interface RoleMutatedPayload extends SystemEventBasePayload {
  module?: 'system';
  entityType?: 'role';
  action?: 'create' | 'update' | 'delete';
  roleName?: string;
  roleKey?: string;
}

export interface UserActionPayload extends SystemEventBasePayload {
  module?: string;
  action?: string;
}

export interface OperationStatusPayload extends SystemEventBasePayload {
  status: OperationStatus;
  correlationId: string;
  operation: string;
  action?: string;
}

export interface SystemEventPayloadMap {
  [SystemEvents.PRODUCTION_STARTED]: ProductionStartedPayload;
  [SystemEvents.PRODUCTION_CLOSED]: ProductionClosedPayload;
  [SystemEvents.REPORT_CREATED]: ReportCreatedPayload;
  [SystemEvents.ISSUE_REQUESTED]: IssueRequestedPayload;
  [SystemEvents.WORK_ORDER_STATUS_CHANGED]: WorkOrderStatusChangedPayload;
  [SystemEvents.QC_APPROVED]: QcApprovedPayload;
  [SystemEvents.QC_REJECTED]: QcRejectedPayload;
  [SystemEvents.WORK_ORDER_CREATED]: WorkOrderCreatedPayload;
  [SystemEvents.STOCK_MOVED]: StockMovedPayload;
  [SystemEvents.ISSUE_APPROVED]: IssueApprovedPayload;
  [SystemEvents.ISSUE_REJECTED]: IssueRejectedPayload;
  [SystemEvents.ISSUE_ISSUED]: IssueIssuedPayload;
  [SystemEvents.TRANSFER_APPROVED]: TransferDecisionPayload;
  [SystemEvents.TRANSFER_REJECTED]: TransferDecisionPayload;
  [SystemEvents.TRANSFER_REQUESTED]: TransferDecisionPayload;
  [SystemEvents.MATERIAL_CREATED]: MaterialCreatedPayload;
  [SystemEvents.LEAVE_REQUESTED]: LeaveRequestedPayload;
  [SystemEvents.REPAIR_JOB_CREATED]: RepairJobCreatedPayload;
  [SystemEvents.COST_CENTER_CREATED]: CostCenterCreatedPayload;
  [SystemEvents.ROLE_CREATED]: RoleMutatedPayload;
  [SystemEvents.ROLE_UPDATED]: RoleMutatedPayload;
  [SystemEvents.ROLE_DELETED]: RoleMutatedPayload;
  [SystemEvents.USER_ACTION]: UserActionPayload;
  [SystemEvents.OPERATION_STATUS]: OperationStatusPayload;
}
