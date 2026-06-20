import React from 'react';
import type { ProductionWorkerSettings } from '@/types';
import { DEFAULT_PRODUCTION_BONUS_SETTINGS, DEFAULT_PRODUCTION_WORKER_PERFORMANCE_SETTINGS } from '@/types';
import { Card } from './UI';

type Props = {
  value: ProductionWorkerSettings;
  onChange: (next: ProductionWorkerSettings) => void;
  disabled?: boolean;
};

const ToggleRow: React.FC<{
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ label, desc, checked, onChange, disabled }) => (
  <div className="flex items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-[var(--color-text)]">{label}</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{desc}</p>
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${checked ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'}`} />
    </button>
  </div>
);

export const ProductionWorkerSettingsSection: React.FC<Props> = ({ value, onChange, disabled }) => {
  const perf = { ...DEFAULT_PRODUCTION_WORKER_PERFORMANCE_SETTINGS, ...value.performance };
  const bonus = { ...DEFAULT_PRODUCTION_BONUS_SETTINGS, ...value.bonus };

  const setPerf = (patch: Partial<typeof perf>) =>
    onChange({ ...value, performance: { ...perf, ...patch } });
  const setBonus = (patch: Partial<typeof bonus>) =>
    onChange({ ...value, bonus: { ...bonus, ...patch } });

  return (
    <Card title="إعدادات عمال الإنتاج">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--color-text)]">تقارير الإنتاج</p>
          <ToggleRow
            label="تفعيل إدخال إنتاج العمال في تقرير الإنتاج"
            desc="عند التفعيل تظهر قائمة العمال المرتبطين بالخط لإدخال الإنتاج الفردي"
            checked={perf.productionWorkerOutputEnabled}
            onChange={(v) => setPerf({ productionWorkerOutputEnabled: v })}
            disabled={disabled}
          />
          <ToggleRow
            label="إلزام تطابق إنتاج العمال مع كمية التقرير"
            desc="يمنع حفظ التقرير إذا لم يطابق مجموع إنتاج العمال الكمية المنتجة"
            checked={perf.productionWorkerOutputMustMatchReportQty}
            onChange={(v) => setPerf({ productionWorkerOutputMustMatchReportQty: v })}
            disabled={disabled}
          />
          <label className="block text-sm">
            <span className="font-bold">حد تحذير الإنجاز المنخفض %</span>
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
              value={perf.achievementWarningThreshold}
              disabled={disabled}
              onChange={(e) => setPerf({ achievementWarningThreshold: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--color-text)]">الأداء الشهري</p>
          <ToggleRow
            label="استبعاد أيام الراحة الأسبوعية"
            desc="لا تُحسب أيام الراحة ضمن أيام العمل"
            checked={perf.excludeWeeklyOff}
            onChange={(v) => setPerf({ excludeWeeklyOff: v })}
            disabled={disabled}
          />
          <ToggleRow
            label="استبعاد الإجازات المعتمدة"
            desc="لا تُحسب أيام الإجازة المعتمدة ضمن أيام العمل"
            checked={perf.excludeApprovedLeave}
            onChange={(v) => setPerf({ excludeApprovedLeave: v })}
            disabled={disabled}
          />
          <ToggleRow
            label="احتساب الغياب كصفر"
            desc="يُضاف الهدف اليومي للغائب ضمن المستهدف الشهري بإنتاج صفر"
            checked={perf.countAbsentAsZero}
            onChange={(v) => setPerf({ countAbsentAsZero: v })}
            disabled={disabled}
          />
          <ToggleRow
            label="احتساب عدم التقرير كصفر"
            desc="الأيام بدون إنتاج مسجل تُحسب ضمن المستهدف بإنتاج صفر"
            checked={perf.countNoReportAsZero}
            onChange={(v) => setPerf({ countNoReportAsZero: v })}
            disabled={disabled}
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--color-text)]">مكافآت الإنتاج</p>
          <ToggleRow
            label="تفعيل حساب المكافآت"
            desc="عند التفعيل يُحسب تقدير المكافأة الشهرية تلقائياً"
            checked={bonus.enabled}
            onChange={(v) => setBonus({ enabled: v })}
            disabled={disabled}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-bold">طريقة الحساب</span>
              <select
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={bonus.method}
                disabled={disabled}
                onChange={(e) => setBonus({ method: e.target.value as typeof bonus.method })}
              >
                <option value="per_extra_unit">لكل وحدة زائدة</option>
                <option value="per_achievement_percent">نسبة الإنجاز</option>
                <option value="fixed_tier">مكافأة ثابتة</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-bold">الحد الأدنى للإنجاز %</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={bonus.minimumAchievementPercent}
                disabled={disabled}
                onChange={(e) => setBonus({ minimumAchievementPercent: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold">مكافأة/وحدة زائدة</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={bonus.bonusPerExtraUnit}
                disabled={disabled}
                onChange={(e) => setBonus({ bonusPerExtraUnit: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold">مكافأة/نسبة إنجاز</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={bonus.bonusPerAchievementPercent}
                disabled={disabled}
                onChange={(e) => setBonus({ bonusPerAchievementPercent: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-bold">الحد الأقصى للمكافأة</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={bonus.maxBonus}
                disabled={disabled}
                onChange={(e) => setBonus({ maxBonus: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
        </div>
      </div>
    </Card>
  );
};
