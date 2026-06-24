import type { ApprovalRequestStatus, ApprovalChainSnapshot, FirestoreApprovalRequest } from './types';

export type ApprovalStatusDisplayVariant = 'warning' | 'success' | 'danger' | 'info' | 'neutral';

export interface ApprovalStatusDisplay {
  label: string;
  variant: ApprovalStatusDisplayVariant;
}

const FINAL_STATUS_DISPLAY: Record<ApprovalRequestStatus, ApprovalStatusDisplay> = {
  pending: { label: 'قيد الانتظار', variant: 'warning' },
  in_progress: { label: 'قيد المعالجة', variant: 'info' },
  approved: { label: 'مُعتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'danger' },
  cancelled: { label: 'مُلغى', variant: 'neutral' },
  escalated: { label: 'مُصعّد', variant: 'danger' },
};

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isHrStep(step: ApprovalChainSnapshot): boolean {
  const text = [
    step.approverJobTitle,
    step.departmentName,
    step.departmentId,
    step.approverName,
  ].map(normalize).join(' ');

  return (
    text.includes('hr') ||
    text.includes('human resources') ||
    text.includes('موارد') ||
    text.includes('بشر') ||
    text.includes('شؤون') ||
    text.includes('شئون')
  );
}

function getPendingStepLabel(step: ApprovalChainSnapshot): string {
  if (isHrStep(step)) return 'بانتظار موافقة الموارد البشرية';
  if (step.level >= 3) return 'بانتظار موافقة المدير';
  if (step.level === 2) return 'بانتظار موافقة المشرف';
  return step.approverName ? `بانتظار موافقة ${step.approverName}` : 'قيد الانتظار';
}

export function getApprovalStatusDisplay(request: FirestoreApprovalRequest): ApprovalStatusDisplay {
  if (request.status === 'approved' || request.status === 'rejected' || request.status === 'cancelled') {
    return FINAL_STATUS_DISPLAY[request.status];
  }

  const currentStep = request.approvalChain[request.currentStep];
  if (!currentStep || currentStep.status !== 'pending') {
    return FINAL_STATUS_DISPLAY[request.status] || FINAL_STATUS_DISPLAY.pending;
  }

  return {
    label: request.status === 'escalated' ? `مُصعّد - ${getPendingStepLabel(currentStep)}` : getPendingStepLabel(currentStep),
    variant: request.status === 'escalated' ? 'danger' : 'warning',
  };
}
