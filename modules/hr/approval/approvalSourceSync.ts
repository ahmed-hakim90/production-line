import { serverTimestamp } from 'firebase/firestore';
import type { ApprovalChainItem, ApprovalStatus } from '../types';
import { employeeService } from '../employeeService';
import { employeeDeductionService } from '../employeeFinancialsService';
import { syncLeaveApprovalDecision } from '../leaveService';
import { loanService } from '../loanService';
import { buildPenaltyDeductionInput } from './penaltyApproval';
import type {
  ApprovalChainSnapshot,
  ApprovalRequestStatus,
  FirestoreApprovalRequest,
} from './types';

export function mapApprovalStatusToSource(status: ApprovalRequestStatus): ApprovalStatus {
  if (status === 'approved') return 'approved';
  if (status === 'rejected' || status === 'cancelled') return 'rejected';
  return 'pending';
}

export function mapApprovalChainToSource(chain: ApprovalChainSnapshot[]): ApprovalChainItem[] {
  return chain.map((step) => ({
    approverEmployeeId: step.approverEmployeeId,
    level: step.level,
    status:
      step.status === 'approved' || step.status === 'skipped'
        ? 'approved'
        : step.status === 'rejected'
          ? 'rejected'
          : 'pending',
    actionDate: step.actionDate,
    notes: step.notes || '',
  }));
}

export async function syncApprovalSourceDecision(
  request: FirestoreApprovalRequest,
): Promise<{ success: boolean; error?: string }> {
  if (!request.sourceRequestId) return { success: true };
  const approvalChain = mapApprovalChainToSource(request.approvalChain || []);
  const decisionStatus = mapApprovalStatusToSource(request.status);

  if (request.requestType === 'leave') {
    return syncLeaveApprovalDecision({
      leaveRequestId: request.sourceRequestId,
      approvalChain,
      decisionStatus,
    });
  }

  if (request.requestType === 'loan') {
    await loanService.updateApproval(
      request.sourceRequestId,
      approvalChain,
      decisionStatus,
      request.status === 'cancelled' ? 'cancelled' : undefined,
    );
  }

  return { success: true };
}

export async function buildApprovedPenaltySourcePatch(
  request: FirestoreApprovalRequest,
): Promise<Record<string, unknown> | null> {
  if (
    request.requestType !== 'penalty'
    || request.status !== 'approved'
    || request.requestData?.deductionId
  ) {
    return null;
  }

  const employee = await employeeService.getById(request.employeeId).catch(() => null);
  const deductionInput = buildPenaltyDeductionInput(request, employee);
  if (!deductionInput) return null;

  const deductionId = await employeeDeductionService.createIdempotent(
    request.id,
    deductionInput,
  );
  return {
    ...request.requestData,
    ...(deductionInput.amount > 0 ? { penaltyCalculatedAmount: deductionInput.amount } : {}),
    ...(deductionInput.penaltyDailyRate ? { penaltyDailyRate: deductionInput.penaltyDailyRate } : {}),
    ...(deductionInput.penaltyAmountSource ? { penaltyAmountSource: deductionInput.penaltyAmountSource } : {}),
    deductionId,
    deductionAppliedAt: serverTimestamp(),
  };
}
