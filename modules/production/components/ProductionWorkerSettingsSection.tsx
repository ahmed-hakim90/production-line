import React from 'react';
import type { ProductionWorkerSettings } from '@/types';
import {
  DEFAULT_PRODUCTION_BONUS_SETTINGS,
  DEFAULT_PRODUCTION_WORKER_PERFORMANCE_SETTINGS,
  DEFAULT_SUPERVISOR_BONUS_SETTINGS,
} from '@/types';
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
  const supervisorBonus = {
    ...DEFAULT_SUPERVISOR_BONUS_SETTINGS,
    ...(value.supervisorBonus ?? {}),
    tiers: value.supervisorBonus?.tiers?.length
      ? value.supervisorBonus.tiers
      : DEFAULT_SUPERVISOR_BONUS_SETTINGS.tiers,
  };
  const showExtraUnitValue = bonus.method === 'per_extra_unit'
    || (bonus.method === 'target_plus_extra' && (bonus.extraBonusMethod ?? 'per_extra_unit') === 'per_extra_unit');
  const showPercentValue = bonus.method === 'per_achievement_percent'
    || bonus.method === 'fixed_tier'
    || (bonus.method === 'target_plus_extra' && bonus.extraBonusMethod === 'per_extra_achievement_percent');

  const setPerf = (patch: Partial<typeof perf>) =>
    onChange({ ...value, performance: { ...perf, ...patch } });
  const setBonus = (patch: Partial<typeof bonus>) =>
    onChange({ ...value, bonus: { ...bonus, ...patch } });
  const setSupervisorBonus = (patch: Partial<typeof supervisorBonus>) =>
    onChange({ ...value, supervisorBonus: { ...supervisorBonus, ...patch } });
  const updateSupervisorTier = (
    index: number,
    patch: Partial<(typeof supervisorBonus.tiers)[number]>,
  ) => {
    const tiers = supervisorBonus.tiers.map((tier, tierIndex) => (
      tierIndex === index ? { ...tier, ...patch } : tier
    ));
    setSupervisorBonus({ tiers });
  };

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
            desc="عند التفعيل يُحسب تقدير المكافأة من إجمالي إنتاج الشهر مقابل هدف الشهر"
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
                onChange={(e) => {
                  const method = e.target.value as typeof bonus.method;
                  setBonus({
                    method,
                    ...(method === 'target_plus_extra' ? { extraBonusMethod: bonus.extraBonusMethod ?? 'per_extra_unit' } : {}),
                  });
                }}
              >
                <option value="target_plus_extra">عند 100% من هدف الشهر + زيادة</option>
                <option value="per_extra_unit">لكل قطعة زيادة فوق هدف الشهر</option>
                <option value="per_achievement_percent">نسبة تحقيق الشهر</option>
                <option value="fixed_tier">مكافأة شهرية ثابتة</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-bold">الحد الأدنى لتحقيق الشهر %</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={bonus.minimumAchievementPercent}
                disabled={disabled}
                onChange={(e) => setBonus({ minimumAchievementPercent: Number(e.target.value) || 0 })}
              />
            </label>
            {bonus.method === 'target_plus_extra' && (
              <>
                <label className="block text-sm">
                  <span className="font-bold">مكافأة تحقيق 100% من هدف الشهر</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                    value={bonus.targetBonusAmount ?? 0}
                    disabled={disabled}
                    onChange={(e) => setBonus({ targetBonusAmount: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-bold">زيادة ما بعد هدف الشهر</span>
                  <select
                    className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                    value={bonus.extraBonusMethod ?? 'per_extra_unit'}
                    disabled={disabled}
                    onChange={(e) => setBonus({ extraBonusMethod: e.target.value as typeof bonus.extraBonusMethod })}
                  >
                    <option value="none">بدون زيادة</option>
                    <option value="per_extra_unit">قيمة لكل قطعة زيادة فوق هدف الشهر</option>
                    <option value="per_extra_achievement_percent">قيمة لكل 1% زيادة فوق تحقيق الشهر</option>
                  </select>
                </label>
              </>
            )}
            {showExtraUnitValue && (
              <label className="block text-sm">
                <span className="font-bold">
                  {bonus.method === 'target_plus_extra' ? 'قيمة كل قطعة زيادة فوق هدف الشهر' : 'مكافأة/قطعة زيادة فوق هدف الشهر'}
                </span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                  value={bonus.bonusPerExtraUnit}
                  disabled={disabled}
                  onChange={(e) => setBonus({ bonusPerExtraUnit: Number(e.target.value) || 0 })}
                />
              </label>
            )}
            {showPercentValue && (
              <label className="block text-sm">
                <span className="font-bold">
                  {bonus.method === 'target_plus_extra'
                    ? 'قيمة كل 1% زيادة فوق تحقيق الشهر'
                    : bonus.method === 'fixed_tier'
                      ? 'قيمة المكافأة الشهرية الثابتة'
                      : 'مكافأة/نسبة تحقيق الشهر'}
                </span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                  value={bonus.bonusPerAchievementPercent}
                  disabled={disabled}
                  onChange={(e) => setBonus({ bonusPerAchievementPercent: Number(e.target.value) || 0 })}
                />
              </label>
            )}
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
            {bonus.method === 'target_plus_extra' && (
              <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
                الحساب شهري: لو «مكافأة تحقيق 100% من هدف الشهر» = 200، و«قيمة كل قطعة زيادة فوق هدف الشهر» = 0.10،
                والعامل حقق هدف الشهر يأخذ 200. لو زاد 500 قطعة عن هدف الشهر يأخذ 200 + 50 = 250.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--color-text)]">تقييم ومكافآت المشرفين</p>
          <ToggleRow
            label="تفعيل حساب مكافأة المشرفين"
            desc="يحسب نسبة المشرف من إجمالي أهداف العمال وما تحقق داخل تقارير الإنتاج المرتبطة به"
            checked={supervisorBonus.enabled}
            onChange={(v) => setSupervisorBonus({ enabled: v })}
            disabled={disabled}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-bold">المكافأة الأساسية للمشرف</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={supervisorBonus.baseBonusAmount}
                disabled={disabled}
                onChange={(e) => setSupervisorBonus({ baseBonusAmount: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold">معامل المشرف</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={supervisorBonus.supervisorMultiplier}
                disabled={disabled}
                onChange={(e) => setSupervisorBonus({ supervisorMultiplier: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold">سقف مساهمة كل عامل %</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={supervisorBonus.workerContributionCapPercent}
                disabled={disabled}
                onChange={(e) => setSupervisorBonus({ workerContributionCapPercent: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold">الحد الأدنى لصرف المكافأة %</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={supervisorBonus.minimumAchievementPercent}
                disabled={disabled}
                onChange={(e) => setSupervisorBonus({ minimumAchievementPercent: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-bold">الحد الأقصى لمكافأة المشرف</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border border-[var(--color-border)] rounded-lg p-2.5"
                value={supervisorBonus.maxBonus}
                disabled={disabled}
                onChange={(e) => setSupervisorBonus({ maxBonus: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
            <div className="grid grid-cols-3 gap-2 bg-[#f8f9fa] px-3 py-2 text-xs font-bold text-[var(--color-text-muted)]">
              <span>من %</span>
              <span>إلى %</span>
              <span>معامل الشريحة</span>
            </div>
            {supervisorBonus.tiers.map((tier, index) => (
              <div key={`${tier.fromPercent}_${index}`} className="grid grid-cols-3 gap-2 px-3 py-2 border-t border-[var(--color-border)]">
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-lg p-2 text-sm"
                  value={tier.fromPercent}
                  disabled={disabled}
                  onChange={(e) => updateSupervisorTier(index, { fromPercent: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-lg p-2 text-sm"
                  value={tier.toPercent ?? ''}
                  placeholder="مفتوح"
                  disabled={disabled}
                  onChange={(e) => updateSupervisorTier(index, {
                    toPercent: e.target.value === '' ? undefined : Number(e.target.value) || 0,
                  })}
                />
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  className="w-full border border-[var(--color-border)] rounded-lg p-2 text-sm"
                  value={tier.payoutMultiplier}
                  disabled={disabled}
                  onChange={(e) => updateSupervisorTier(index, { payoutMultiplier: Number(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
            الحساب: إجمالي المحقق للعمال ÷ إجمالي أهدافهم × 100، ثم المكافأة الأساسية × النسبة × معامل المشرف × معامل الشريحة.
            سقف مساهمة العامل يمنع عامل واحد من رفع نتيجة الفريق بالكامل.
          </div>
        </div>
      </div>
    </Card>
  );
};
