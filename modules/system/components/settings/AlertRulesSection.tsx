import React from 'react';
import { Card, Button } from '../UI';
import { DEFAULT_ALERT_SETTINGS } from '../../../../utils/dashboardConfig';
import type { AlertSettings } from '../../../../types';

type AlertField = { key: keyof AlertSettings; label: string; icon: string; unit: string; description: string };

type AlertRulesSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  localAlerts: AlertSettings;
  setLocalAlerts: React.Dispatch<React.SetStateAction<AlertSettings>>;
  onSave: () => void;
  alertFields: AlertField[];
};

export const AlertRulesSection: React.FC<AlertRulesSectionProps> = ({
  isAdmin,
  saving,
  localAlerts,
  setLocalAlerts,
  onSave,
  alertFields,
}) => {
  if (!isAdmin) return null;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">قواعد التنبيهات</h3>
          <p className="page-subtitle">حدد الحدود التي يتم عندها إنشاء تنبيهات في لوحات التحكم.</p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
          <span className="material-icons-round text-sm">save</span>
          حفظ التغييرات
        </Button>
      </div>

      <Card>
        <div className="space-y-6">
          {alertFields.map((field) => (
            <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-primary">{field.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)]">{field.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{field.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={0}
                  step={field.key === 'planDelayDays' ? 1 : 0.5}
                  className="w-24 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={localAlerts[field.key]}
                  onChange={(e) =>
                    setLocalAlerts((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                  }
                />
                <span className="text-sm font-bold text-[var(--color-text-muted)] w-10">{field.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="القيم الافتراضية">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {alertFields.map((field) => (
            <div key={field.key} className="text-center p-3 bg-[#f8f9fa] rounded-[var(--border-radius-lg)]">
              <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">{field.label}</p>
              <p className="text-lg font-bold text-[var(--color-text-muted)]">
                {DEFAULT_ALERT_SETTINGS[field.key]} {field.unit}
              </p>
            </div>
          ))}
        </div>
        <button
          onClick={() => setLocalAlerts({ ...DEFAULT_ALERT_SETTINGS })}
          className="mt-4 text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons-round text-sm">restart_alt</span>
          إعادة تعيين للقيم الافتراضية
        </button>
      </Card>
    </>
  );
};
