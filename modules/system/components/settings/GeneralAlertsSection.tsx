import React from 'react';
import { Card } from '../UI';
import type { AlertToggleSettings } from '../../../../types';

type GeneralAlertsSectionProps = {
  isAdmin: boolean;
  localAlertToggles: AlertToggleSettings;
  setLocalAlertToggles: React.Dispatch<React.SetStateAction<AlertToggleSettings>>;
};

export const GeneralAlertsSection: React.FC<GeneralAlertsSectionProps> = ({
  isAdmin,
  localAlertToggles,
  setLocalAlertToggles,
}) => {
  if (!isAdmin) return null;

  return (
    <Card title="إعدادات التنبيهات">
      <div className="space-y-4">
        {([
          { key: 'enablePlanDelayAlert' as keyof AlertToggleSettings, label: 'تنبيه تأخر الخطط', icon: 'schedule', desc: 'إرسال تنبيه عند تأخر خطة الإنتاج عن الموعد المحدد' },
          { key: 'enableCapacityAlert' as keyof AlertToggleSettings, label: 'تنبيه السعة الإنتاجية', icon: 'production_quantity_limits', desc: 'تنبيه عند اقتراب خط الإنتاج من الحد الأقصى للسعة' },
          { key: 'enableCostVarianceAlert' as keyof AlertToggleSettings, label: 'تنبيه انحراف التكلفة', icon: 'compare_arrows', desc: 'تنبيه عند تجاوز التكلفة الفعلية للتكلفة المعيارية' },
        ]).map((alert) => (
          <div key={alert.key} className="flex items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">{alert.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">{alert.label}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{alert.desc}</p>
            </div>
            <button
              onClick={() => setLocalAlertToggles((prev) => ({ ...prev, [alert.key]: !prev[alert.key] }))}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${localAlertToggles[alert.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${localAlertToggles[alert.key] ? 'right-0.5' : 'right-[22px]'}`} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};
