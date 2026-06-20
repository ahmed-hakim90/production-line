import React from 'react';
import { Card } from '../UI';
import { useAppStore } from '../../../../store/useAppStore';
import { ALL_PERMISSIONS, useCurrentRole } from '../../../../utils/permissions';

export const CurrentRoleCard: React.FC = () => {
  const userPermissions = useAppStore((s) => s.userPermissions);
  const { roleName, roleColor } = useCurrentRole();
  const enabledCount = Object.values(userPermissions).filter(Boolean).length;

  return (
    <Card title="الدور الحالي والصلاحيات" className="bg-[var(--color-card)] border-[var(--color-border)] rounded-xl shadow-none">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="material-icons-round text-primary text-2xl">shield</span>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">الدور الحالي</p>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${roleColor}`}>
            {roleName}
          </span>
        </div>
        <div className="mr-auto text-xs text-[var(--color-text-muted)] font-medium">
          {enabledCount} / {ALL_PERMISSIONS.length} صلاحية مفعلة
        </div>
      </div>
    </Card>
  );
};
