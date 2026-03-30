/**
 * Approval Escalation Service
 *
 * Handles automatic escalation of stale requests that have been
 * pending at a given step for longer than the configured escalationDays.
 *
 * Escalation moves the request to the next approver in the chain
 * by marking the current step as "skipped" and advancing currentStep.
 *
 * Designed to be called by a scheduled job (e.g., Cloud Function cron)
 * or manually from an admin panel.
 */
import {
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { approvalRequestsRef, approvalRequestDocRef } from './collections';
import { getApprovalSettings } from './approvalEngine';
import { approvalAuditService } from './approvalAudit';
import type {
  FirestoreApprovalRequest,
  ApprovalHistoryEntry,
} from './types';

interface EscalationResult {
  processed: number;
  escalated: number;
  errors: string[];
}

/**
 * Find and escalate all requests that have been stuck at the current
 * approval step for longer than the configured escalation period.
 *
 * Returns a summary of processed/escalated counts.
 */
export async function processEscalations(): Promise<EscalationResult> {
  if (!isConfigured) return { processed: 0, escalated: 0, errors: [] };

  const settings = await getApprovalSettings();
  if (settings.escalationDays <= 0) {
    return { processed: 0, escalated: 0, errors: [] };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.escalationDays);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  const pendingStatuses = ['pending', 'in_progress'];
  const allStale: FirestoreApprovalRequest[] = [];

  for (const status of pendingStatuses) {
    const q = query(
      approvalRequestsRef(),
      where('status', '==', status),
      where('updatedAt', '<=', cutoffTimestamp),
      orderBy('updatedAt', 'asc'),
    );

    const snap = await getDocs(q);
    allStale.push(
      ...snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest)),
    );
  }

  const result: EscalationResult = { processed: allStale.length, escalated: 0, errors: [] };

  for (const request of allStale) {
    try {
      const escalated = await escalateRequest(request);
      if (escalated) result.escalated++;
    } catch (err: any) {
      result.errors.push(`Request ${request.id}: ${err.message || 'unknown error'}`);
    }
  }

  return result;
}

/**
 * Escalate a single request by skipping the current step and
 * advancing to the next approver.
 *
 * If the current step is the last one, the request is marked as
 * "escalated" status for HR/admin intervention.
 */
async function escalateRequest(
  request: FirestoreApprovalRequest,
): Promise<boolean> {
  if (!request.id) return false;
  if (request.currentStep >= request.approvalChain.length) return false;

  const updatedChain = [...request.approvalChain];
  const currentStepData = updatedChain[request.currentStep];

  if (currentStepData.status !== 'pending') return false;

  updatedChain[request.currentStep] = {
    ...currentStepData,
    status: 'skipped',
    actionDate: Timestamp.now(),
    notes: `تم تصعيد الطلب تلقائياً بعد انتهاء المهلة بدون إجراء`,
  };

  const nextStep = request.currentStep + 1;
  const isLastStep = nextStep >= updatedChain.length;

  const newStatus: FirestoreApprovalRequest['status'] = isLastStep
    ? 'escalated'
    : 'in_progress';

  const historyEntry: ApprovalHistoryEntry = {
    step: request.currentStep,
    action: 'escalated',
    performedBy: 'system',
    performedByName: 'النظام',
    timestamp: Timestamp.now(),
    notes: isLastStep
      ? 'تم تصعيد الطلب — يتطلب تدخل الإدارة'
      : `تم تصعيد من المستوى ${request.currentStep + 1} إلى المستوى ${nextStep + 1}`,
    previousStatus: request.status,
    newStatus,
  };

  await updateDoc(approvalRequestDocRef(request.id), {
    approvalChain: updatedChain,
    currentStep: isLastStep ? request.currentStep : nextStep,
    status: newStatus,
    updatedAt: serverTimestamp(),
    escalatedAt: serverTimestamp(),
    history: [...request.history, historyEntry],
  });

  await approvalAuditService.log(
    request.id,
    request.requestType,
    request.employeeId,
    'escalated',
    'system',
    'النظام',
    request.currentStep,
    {
      skippedApprover: currentStepData.approverEmployeeId,
      skippedApproverName: currentStepData.approverName,
      nextStep: isLastStep ? null : nextStep,
      isLastStep,
    },
  );

  return true;
}

/**
 * Get all currently escalated requests that need manual intervention.
 */
export async function getEscalatedRequests(): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];

  const q = query(
    approvalRequestsRef(),
    where('status', '==', 'escalated'),
    orderBy('escalatedAt', 'desc'),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

/**
 * Check if a specific request is overdue for escalation
 * (useful for UI indicators without running the full escalation job).
 */
export async function isRequestOverdue(
  request: FirestoreApprovalRequest,
): Promise<boolean> {
  if (request.status !== 'pending' && request.status !== 'in_progress') return false;

  const settings = await getApprovalSettings();
  if (settings.escalationDays <= 0) return false;

  const updatedAt = request.updatedAt?.toDate?.() || request.createdAt?.toDate?.();
  if (!updatedAt) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - settings.escalationDays);

  return updatedAt < cutoff;
}
