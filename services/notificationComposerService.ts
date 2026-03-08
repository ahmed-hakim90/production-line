import { employeeService } from '@/modules/hr/employeeService';
import { roleService } from '@/modules/system/services/roleService';
import { userService } from '@/services/userService';
import { notificationService } from '@/services/notificationService';
import type { AppNotification, FirestoreEmployee, FirestoreUser } from '@/types';

type TargetMode = 'single' | 'multi' | 'role';

interface ComposePayload {
  title: string;
  message: string;
  referenceId?: string;
  targetMode: TargetMode;
  recipientEmployeeIds?: string[];
  roleIds?: string[];
  type?: AppNotification['type'];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export const notificationComposerService = {
  async resolveRoleRecipientEmployeeIds(roleIds: string[]): Promise<string[]> {
    const scopedRoleIds = unique(roleIds);
    if (scopedRoleIds.length === 0) return [];

    const [users, employees] = await Promise.all([
      userService.getAll(),
      employeeService.getAll(),
    ]);

    const activeUserIds = new Set(
      (users as FirestoreUser[])
        .filter((u) => u.isActive !== false && scopedRoleIds.includes(String(u.roleId || '')))
        .map((u) => String(u.id || ''))
        .filter(Boolean),
    );

    return unique(
      (employees as FirestoreEmployee[])
        .filter((e) => Boolean(e.userId) && activeUserIds.has(String(e.userId || '')) && e.isActive !== false)
        .map((e) => String(e.id || '')),
    );
  },

  async create(payload: ComposePayload): Promise<number> {
    const baseType: AppNotification['type'] = payload.type || 'manual_broadcast';
    let recipientIds: string[] = [];

    if (payload.targetMode === 'role') {
      recipientIds = await this.resolveRoleRecipientEmployeeIds(payload.roleIds || []);
    } else {
      recipientIds = unique(payload.recipientEmployeeIds || []);
    }

    if (recipientIds.length === 0) return 0;

    const settled = await Promise.allSettled(
      recipientIds.map((recipientId) =>
        notificationService.create({
          recipientId,
          type: baseType,
          title: payload.title.trim(),
          message: payload.message.trim(),
          referenceId: payload.referenceId?.trim() || '',
          isRead: false,
        }),
      ),
    );

    return settled.filter((r) => r.status === 'fulfilled').length;
  },

  async listRoles() {
    return roleService.getAll();
  },
};
