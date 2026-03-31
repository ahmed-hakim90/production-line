import React from 'react';
import { BellRing, Columns3, GripVertical, Landmark, type LucideIcon } from 'lucide-react';
import { Card } from '../UI';
import type { DashboardDisplaySettings } from '../../../../types';

type GeneralDashboardDisplaySectionProps = {
  isAdmin: boolean;
  localDashboardDisplay: DashboardDisplaySettings;
  setLocalDashboardDisplay: React.Dispatch<React.SetStateAction<DashboardDisplaySettings>>;
};

const DASHBOARD_DISPLAY_ICON_MAP: Record<string, LucideIcon> = {
  account_balance: Landmark,
  notifications_active: BellRing,
  drag_indicator: GripVertical,
  view_column: Columns3,
};

const DashboardDisplayIcon = ({ name }: { name: string }) => {
  const Icon = DASHBOARD_DISPLAY_ICON_MAP[name] ?? Columns3;
  return <Icon size={18} className="text-primary" />;
};

export const GeneralDashboardDisplaySection: React.FC<GeneralDashboardDisplaySectionProps> = ({
  isAdmin,
  localDashboardDisplay,
  setLocalDashboardDisplay,
}) => {
  if (!isAdmin) return null;

  return (
    <Card title="إعدادات لوحة التحكم">
      <div className="space-y-4">
        {([
          { key: 'showCostWidgets' as keyof DashboardDisplaySettings, label: 'عرض عناصر التكاليف', icon: 'account_balance', desc: 'إظهار عناصر التكلفة والتحليل المالي في لوحات التحكم' },
          { key: 'showAlertsWidget' as keyof DashboardDisplaySettings, label: 'عرض عنصر التنبيهات', icon: 'notifications_active', desc: 'إظهار قسم التنبيهات السريعة في لوحات التحكم' },
          { key: 'enableDragReorder' as keyof DashboardDisplaySettings, label: 'تفعيل السحب لإعادة الترتيب', icon: 'drag_indicator', desc: 'السماح بإعادة ترتيب العناصر في لوحات التحكم بالسحب والإفلات' },
        ]).map((setting) => (
          <div key={setting.key} className="flex items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
              <DashboardDisplayIcon name={setting.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">{setting.label}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{setting.desc}</p>
            </div>
            <button
              onClick={() => setLocalDashboardDisplay((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${(localDashboardDisplay as any)[setting.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${(localDashboardDisplay as any)[setting.key] ? 'right-0.5' : 'right-[22px]'}`} />
            </button>
          </div>
        ))}

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
              <DashboardDisplayIcon name="view_column" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">عدد العناصر في الصف</p>
              <p className="text-xs text-slate-400">عدد الأعمدة في شبكة لوحة التحكم</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setLocalDashboardDisplay((p) => ({ ...p, widgetsPerRow: n }))}
                className={`w-12 h-10 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all ${
                  localDashboardDisplay.widgetsPerRow === n
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
