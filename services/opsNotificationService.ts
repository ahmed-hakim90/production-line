import { notificationComposerService } from './notificationComposerService';
import type { SystemSettings } from '../types';

type OpsNotifyPayload = {
  title: string;
  message: string;
  referenceId?: string;
  type?: 'inventory_transfer_pending' | 'report_compliance_daily' | 'manual_broadcast';
};

export const opsNotificationService = {
  async notifyRoles(settings: SystemSettings, payload: OpsNotifyPayload): Promise<number> {
    const roleIds = (settings.planSettings?.opsNotifyRoleIds || []).filter(Boolean);
    if (roleIds.length === 0) return 0;
    return notificationComposerService.create({
      targetMode: 'role',
      roleIds,
      type: payload.type || 'manual_broadcast',
      title: payload.title,
      message: payload.message,
      referenceId: payload.referenceId,
    });
  },

  async notifyPendingTransfer(settings: SystemSettings, referenceNo: string, requestId: string): Promise<void> {
    await this.notifyRoles(settings, {
      type: 'inventory_transfer_pending',
      title: 'تحويل مخزون بانتظار الاعتماد',
      message: `طلب تحويل ${referenceNo} يحتاج اعتماداً.`,
      referenceId: requestId,
    });
  },
};
