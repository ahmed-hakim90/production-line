import React from 'react';
import type { PlanSettings } from '../../../../types';

type Props = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
};

export const DepartmentConsumablesSettingsSection: React.FC<Props> = ({
  isAdmin,
  localPlanSettings,
  setLocalPlanSettings,
}) => {
  if (!isAdmin) return null;

  const mode = localPlanSettings.departmentConsumableIssueApprovalMode === 'required'
    ? 'required'
    : 'direct';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-[var(--color-text)]">صرف مستهلكات الأقسام</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          إعداد عام للشركة يحدد إن كان سند الصرف ينفّذ مباشرة أو يحتاج موافقة قبل خصم الرصيد.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] block">
          <p className="text-sm font-bold text-[var(--color-text)]">سياسة الموافقة</p>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            تُحفظ السياسة كلقطة على كل سند عند إنشائه حتى لا يتغير مساره لاحقاً.
          </p>
          <select
            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3"
            value={mode}
            onChange={(e) => {
              const next = e.target.value === 'required' ? 'required' : 'direct';
              setLocalPlanSettings((prev) => ({
                ...prev,
                departmentConsumableIssueApprovalMode: next,
              }));
            }}
          >
            <option value="direct">صرف مباشر (مسودة ← تنفيذ)</option>
            <option value="required">يتطلب موافقة (مسودة ← تقديم ← اعتماد ← تنفيذ)</option>
          </select>
        </label>
      </div>
    </div>
  );
};
