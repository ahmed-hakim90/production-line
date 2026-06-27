import React, { useMemo } from 'react';
import type { FirestoreEmployee, PlanSettings } from '../../../../types';
import { Card } from '../UI';

type Props = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  employees: FirestoreEmployee[];
};

export const ProductionRequestRoutingSettingsSection: React.FC<Props> = ({
  isAdmin,
  localPlanSettings,
  setLocalPlanSettings,
  employees,
}) => {
  const approverOptions = useMemo(() => {
    const rows = employees
      .filter((employee) => employee.id && employee.isActive !== false)
      .slice()
      .sort((a, b) => {
        const accessA = a.hasSystemAccess || a.userId ? 0 : 1;
        const accessB = b.hasSystemAccess || b.userId ? 0 : 1;
        if (accessA !== accessB) return accessA - accessB;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
      });

    return rows.map((employee) => ({
      id: employee.id!,
      label: `${employee.code ? `${employee.code} — ` : ''}${employee.name || 'موظف'}${employee.hasSystemAccess || employee.userId ? ' (له حساب)' : ''}`,
    }));
  }, [employees]);
  const observerOptions = useMemo(
    () => approverOptions.filter((option) => employees.some((employee) => (
      employee.id === option.id && Boolean(String(employee.userId || '').trim())
    ))),
    [approverOptions, employees],
  );

  if (!isAdmin) return null;

  const updateApprover = (
    key: 'productionRequestFirstApproverEmployeeId' | 'productionRequestFinalApproverEmployeeId',
    value: string,
  ) => {
    setLocalPlanSettings((prev) => ({ ...prev, [key]: value }));
  };
  const toggleObserver = (employeeId: string, checked: boolean) => {
    setLocalPlanSettings((prev) => {
      const current = prev.productionRequestObserverEmployeeIds ?? [];
      const nextEmployeeIds = checked
        ? Array.from(new Set([...current, employeeId]))
        : current.filter((id) => id !== employeeId);
      const userIdsByEmployeeId = new Map(
        employees.map((employee) => [employee.id, String(employee.userId || '').trim()]),
      );
      const nextUserIds = nextEmployeeIds
        .map((id) => userIdsByEmployeeId.get(id) || '')
        .filter(Boolean);
      return {
        ...prev,
        productionRequestObserverEmployeeIds: nextEmployeeIds,
        productionRequestObserverUserIds: Array.from(new Set(nextUserIds)),
      };
    });
  };

  const selectApprover = (
    label: string,
    hint: string,
    value: string | undefined,
    onChange: (value: string) => void,
  ) => (
    <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
      <p className="text-sm font-bold text-[var(--color-text)]">{label}</p>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">{hint}</p>
      <select
        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">غير محدد</option>
        {approverOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <Card title="إعدادات طلبات الإنتاج">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">أين تذهب طلبات الإنتاج؟</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-6">
            عند اختيار موافق هنا، ستذهب طلبات الإجازة والسلفة والجزاء التي ينشئها الإنتاج إلى هؤلاء الموافقين مباشرة. إذا تركت الحقول فارغة يستخدم النظام التسلسل الوظيفي كما هو.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {selectApprover(
            'الموافق الأول',
            'عادة مدير الإنتاج أو المدير المباشر الذي يبدأ الاعتماد.',
            localPlanSettings.productionRequestFirstApproverEmployeeId,
            (value) => updateApprover('productionRequestFirstApproverEmployeeId', value),
          )}
          {selectApprover(
            'الموافق النهائي',
            'اختياري. اتركه فارغًا إذا كان الاعتماد مرحلة واحدة فقط.',
            localPlanSettings.productionRequestFinalApproverEmployeeId,
            (value) => updateApprover('productionRequestFinalApproverEmployeeId', value),
          )}
        </div>

        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <p className="text-sm font-bold text-[var(--color-text)]">جهات الاطلاع</p>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            جهات متابعة فقط ترى حالات وسجل طلبات الإنتاج دون دخول سلسلة الاعتماد أو إظهار أزرار الموافقة والرفض.
          </p>
          {observerOptions.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">لا يوجد موظفون نشطون مرتبطون بحساب مستخدم للاختيار.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {observerOptions.map((option) => {
                const selected = (localPlanSettings.productionRequestObserverEmployeeIds ?? []).includes(option.id);
                return (
                  <label key={option.id} className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)] p-2 rounded border border-[var(--color-border)] bg-[var(--color-card)]">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleObserver(option.id, event.target.checked)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {approverOptions.length === 0 && (
          <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            لا يوجد موظفون نشطون للاختيار. اربط المستخدم بسجل موظف حتى تظهر الطلبات في مركز الموافقات.
          </p>
        )}
      </div>
    </Card>
  );
};
