import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import type { WorkOrderQualitySummary } from '@/types';
import { notificationService } from '@/services/notificationService';
import { qualityWorkerAssignmentsRef } from '../collections';

interface QualityReportNotificationPayload {
  workOrderId: string;
  workOrderNumber: string;
  lineName: string;
  productName: string;
  typeLabel: 'Final' | 'IPQC' | 'Rework' | 'CAPA';
  statusLabel: string;
  summary: WorkOrderQualitySummary;
  updatedAt?: string;
}

const buildMessage = (payload: QualityReportNotificationPayload): string => {
  const deepLink = `#/quality/reports?workOrderId=${payload.workOrderId}`;
  return [
    `WO ${payload.workOrderNumber} — ${payload.lineName} — ${payload.productName}`,
    `${payload.typeLabel} | الحالة: ${payload.statusLabel}`,
    `فحص: ${payload.summary.inspectedUnits} | Pass: ${payload.summary.passedUnits} | Fail: ${payload.summary.failedUnits} | Rework: ${payload.summary.reworkUnits}`,
    `Defect Rate: ${payload.summary.defectRate}% | FPY: ${payload.summary.firstPassYield}%`,
    payload.summary.topDefectReason ? `أعلى سبب: ${payload.summary.topDefectReason}` : undefined,
    payload.updatedAt ? `آخر تحديث: ${payload.updatedAt}` : undefined,
    `فتح التقرير: ${deepLink}`,
  ]
    .filter(Boolean)
    .join('\n');
};

const getAdminRecipientIds = async (): Promise<string[]> => {
  const usersSnap = await getDocs(collection(db, 'users'));
  const rolesSnap = await getDocs(collection(db, 'roles'));
  const roles = rolesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
  const adminRoleIds = roles
    .filter((r) => r.permissions?.['adminDashboard.view'] === true || r.permissions?.['roles.manage'] === true)
    .map((r) => r.id);

  const adminUserIds = usersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as any))
    .filter((u) => adminRoleIds.includes(u.roleId))
    .map((u) => u.id as string);

  const employeesSnap = await getDocs(collection(db, 'employees'));
  return employeesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as any))
    .filter((e) => e.userId && adminUserIds.includes(e.userId))
    .map((e) => e.id as string);
};

const getQualityManagerRecipientIds = async (): Promise<string[]> => {
  const q = query(qualityWorkerAssignmentsRef(), where('qualityRole', '==', 'manager'), where('isActive', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data() as any).employeeId as string).filter(Boolean);
};

export const qualityNotificationService = {
  async notifyReportCreated(payload: QualityReportNotificationPayload & { supervisorId?: string; lineSupervisorId?: string }): Promise<void> {
    if (!isConfigured) return;
    const recipients = new Set<string>();
    if (payload.supervisorId) recipients.add(payload.supervisorId);
    if (payload.lineSupervisorId) recipients.add(payload.lineSupervisorId);
    (await getQualityManagerRecipientIds()).forEach((id) => recipients.add(id));
    (await getAdminRecipientIds()).forEach((id) => recipients.add(id));

    const message = buildMessage(payload);
    await Promise.all(
      Array.from(recipients).map((recipientId) =>
        notificationService.create({
          recipientId,
          type: 'quality_report_created',
          title: `تقرير جودة جديد — ${payload.workOrderNumber}`,
          message,
          referenceId: payload.workOrderId,
          isRead: false,
        }),
      ),
    );
  },

  async notifyReportStatusChanged(payload: QualityReportNotificationPayload & { supervisorId?: string; lineSupervisorId?: string }): Promise<void> {
    if (!isConfigured) return;
    const recipients = new Set<string>();
    if (payload.supervisorId) recipients.add(payload.supervisorId);
    if (payload.lineSupervisorId) recipients.add(payload.lineSupervisorId);
    (await getQualityManagerRecipientIds()).forEach((id) => recipients.add(id));
    (await getAdminRecipientIds()).forEach((id) => recipients.add(id));

    const message = buildMessage(payload);
    await Promise.all(
      Array.from(recipients).map((recipientId) =>
        notificationService.create({
          recipientId,
          type: 'quality_report_updated',
          title: `تحديث تقرير الجودة — ${payload.workOrderNumber}`,
          message,
          referenceId: payload.workOrderId,
          isRead: false,
        }),
      ),
    );
  },
};
