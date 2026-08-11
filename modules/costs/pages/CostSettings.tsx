import React, { useState, useEffect, useRef } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { formatCost, getDaysInMonth, getWorkingDaysExcludingFriday } from '../../../utils/costCalculations';
import type { CostingPolicySettings } from '../../../types';
import { resolveCostingPolicy, validateCostingPolicy } from '../../../utils/costingPolicy';
import { mutateAccountingCallable } from '../../auth/services/firebase';

type BooleanCostPolicyKey = Exclude<
  keyof CostingPolicySettings,
  'primaryCostView' | 'dailyAllocationDriver'
>;

const COST_POLICY_FLAGS: Array<{ key: BooleanCostPolicyKey; label: string; hint: string }> = [
  { key: 'legacyConversionEnabled', label: 'تشغيل تكلفة التحويل القديمة', hint: 'يحافظ على رقم العمالة والإشراف والتكاليف غير المباشرة القديم.' },
  { key: 'fullManufacturingEnabled', label: 'تشغيل التكلفة الصناعية الكاملة', hint: 'يضيف الخامات والتعبئة إلى تكلفة التحويل في نتيجة مستقلة.' },
  { key: 'includeDirectLabor', label: 'إدخال العمالة المباشرة', hint: 'عدد العمال × ساعات التشغيل × معدل الساعة.' },
  { key: 'includeSupervisor', label: 'إدخال تكلفة المشرف', hint: 'تُحسب مرة للمشرف/الخط/اليوم ثم توزع على التقارير.' },
  { key: 'includeIndirectCenters', label: 'إدخال المراكز غير المباشرة', hint: 'يشغّل تحميل مجمعات المصروفات الصناعية على الإنتاج.' },
  { key: 'includeDepreciation', label: 'إدخال الإهلاك', hint: 'يضم إهلاك الأصول المرتبطة بمراكز الإنتاج مرة واحدة.' },
  { key: 'includeActualMaterials', label: 'إدخال الخامات الفعلية', hint: 'يعتمد تكلفة الصرف المخزني الفعلية في التكلفة الكاملة.' },
  { key: 'includePackaging', label: 'إدخال مواد التعبئة', hint: 'يضم مواد التعبئة المصروفة أو المقدرة حسب حالة المصدر.' },
  { key: 'allowBomEstimateFallback', label: 'السماح بتقدير BOM', hint: 'يستخدم BOM عند غياب الصرف الفعلي ويُبقي النتيجة مبدئية.' },
  { key: 'allowLinePercentageAllocation', label: 'السماح بتوزيع نسب الخطوط', hint: 'يوزع قيمة المركز على الخطوط بالنسب الشهرية المعرفة.' },
  { key: 'allowQuantityAllocation', label: 'السماح بالتوزيع حسب الكمية', hint: 'يوزع قيمة المركز على المنتجات داخل نطاقه حسب الكمية الجيدة.' },
  { key: 'fallbackToQuantity', label: 'Fallback للكمية', hint: 'يستخدم الكمية إذا لم تتوفر ساعات تشغيل صالحة.' },
  { key: 'prorateOpenPeriod', label: 'تحميل تدريجي للشهر المفتوح', hint: 'لا يحمل قيمة الشهر كاملة قبل مرور أيام التشغيل.' },
  { key: 'allowProvisionalValues', label: 'السماح بالقيم المبدئية', hint: 'يسمح بالحساب الحي قبل وصول كل المصادر الفعلية.' },
  { key: 'requireActualBeforeClose', label: 'اشتراط الفعلي قبل الإقفال', hint: 'يمنع إقفال شهر يحتوي مصادر مبدئية.' },
  { key: 'requireFullAllocationBeforeClose', label: 'اشتراط توزيع 100%', hint: 'يمنع الإقفال إذا كانت نسب أي مركز غير مكتملة.' },
  { key: 'freezeClosedSnapshots', label: 'تجميد نتائج الشهر المقفول', hint: 'يمنع إعادة كتابة نتائج وتفاصيل الفترات المقفلة.' },
];

export const CostSettings: React.FC = () => {
  const laborSettings = useAppStore((s) => s.laborSettings);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateLaborSettings = useAppStore((s) => s.updateLaborSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [cnyToEgpRate, setCnyToEgpRate] = useState<number>(0);
  const [workingDaysYear, setWorkingDaysYear] = useState<number>(new Date().getFullYear());
  const [workingDaysDraft, setWorkingDaysDraft] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingCny, setSavingCny] = useState(false);
  const [savedCny, setSavedCny] = useState(false);
  const [savingDays, setSavingDays] = useState(false);
  const [savedDays, setSavedDays] = useState(false);
  const [costingPolicy, setCostingPolicy] = useState<CostingPolicySettings>(() =>
    resolveCostingPolicy(systemSettings.costingPolicy),
  );
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savedPolicy, setSavedPolicy] = useState(false);
  const saveToastTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      saveToastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      saveToastTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    setHourlyRate(laborSettings?.hourlyRate ?? 0);
    setCnyToEgpRate(laborSettings?.cnyToEgpRate ?? 0);
  }, [laborSettings]);

  useEffect(() => {
    setCostingPolicy(resolveCostingPolicy(systemSettings.costingPolicy));
  }, [systemSettings.costingPolicy]);

  const policyErrors = validateCostingPolicy(costingPolicy);

  const handleSaveCostingPolicy = async () => {
    if (policyErrors.length > 0) return;
    setSavingPolicy(true);
    try {
      await mutateAccountingCallable({ operation: 'save_costing_policy', costingPolicy });
      await fetchSystemSettings();
      setSavedPolicy(true);
      const timer = window.setTimeout(() => setSavedPolicy(false), 2000);
      saveToastTimersRef.current.push(timer);
    } finally {
      setSavingPolicy(false);
    }
  };

  const monthsOfYear = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const monthIndex = idx + 1;
      return `${workingDaysYear}-${String(monthIndex).padStart(2, '0')}`;
    });
  }, [workingDaysYear]);

  useEffect(() => {
    const nextDraft: Record<string, number> = {};
    monthsOfYear.forEach((monthKey) => {
      const savedValue = Number(systemSettings.costMonthlyWorkingDays?.[monthKey] ?? 0);
      nextDraft[monthKey] = savedValue > 0 ? Math.round(savedValue) : getWorkingDaysExcludingFriday(monthKey);
    });
    setWorkingDaysDraft(nextDraft);
  }, [monthsOfYear, systemSettings.costMonthlyWorkingDays]);

  const handleSave = async () => {
    setSaving(true);
    await updateLaborSettings({ hourlyRate, cnyToEgpRate });
    setSaving(false);
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 2000);
    saveToastTimersRef.current.push(timer);
  };

  const handleSaveCny = async () => {
    setSavingCny(true);
    await updateLaborSettings({ hourlyRate, cnyToEgpRate });
    setSavingCny(false);
    setSavedCny(true);
    const timer = window.setTimeout(() => setSavedCny(false), 2000);
    saveToastTimersRef.current.push(timer);
  };

  const handleSaveWorkingDays = async () => {
    setSavingDays(true);
    try {
      const nextMap = { ...(systemSettings.costMonthlyWorkingDays || {}) };
      monthsOfYear.forEach((monthKey) => {
        const fallbackDays = getWorkingDaysExcludingFriday(monthKey);
        const rawValue = Number(workingDaysDraft[monthKey] ?? fallbackDays);
        const normalized = Number.isFinite(rawValue)
          ? Math.min(31, Math.max(1, Math.round(rawValue)))
          : fallbackDays;
        nextMap[monthKey] = normalized;
      });
      await updateSystemSettings({
        ...systemSettings,
        costMonthlyWorkingDays: nextMap,
      });
      setSavedDays(true);
      const timer = window.setTimeout(() => setSavedDays(false), 2000);
      saveToastTimersRef.current.push(timer);
    } finally {
      setSavingDays(false);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="إعدادات التكلفة"
      rangeLabel="إدارة معدل الأجور وإعدادات حساب التكاليف"
    >
      <OpsDashPanel title="سياسة حساب التكلفة — تحكم مباشر" accent="costs">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-[var(--color-text-muted)]">
              النتيجة الرئيسية
              <select
                className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm text-[var(--color-text)]"
                value={costingPolicy.primaryCostView}
                onChange={(event) => setCostingPolicy((current) => ({
                  ...current,
                  primaryCostView: event.target.value as CostingPolicySettings['primaryCostView'],
                }))}
              >
                <option value="legacy_conversion">تكلفة التحويل القديمة</option>
                <option value="full_manufacturing">التكلفة الصناعية الكاملة</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-bold text-[var(--color-text-muted)]">
              أساس توزيع تقارير اليوم
              <select
                className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm text-[var(--color-text)]"
                value={costingPolicy.dailyAllocationDriver}
                onChange={(event) => setCostingPolicy((current) => ({
                  ...current,
                  dailyAllocationDriver: event.target.value as CostingPolicySettings['dailyAllocationDriver'],
                }))}
              >
                <option value="work_hours">ساعات التشغيل</option>
                <option value="quantity">الكمية الجيدة</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {COST_POLICY_FLAGS.map((flag) => (
              <label key={flag.key} className="flex items-start gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(costingPolicy[flag.key])}
                  onChange={(event) => setCostingPolicy((current) => ({
                    ...current,
                    [flag.key]: event.target.checked,
                  }))}
                />
                <span>
                  <strong className="block text-sm text-[var(--color-text)]">{flag.label}</strong>
                  <small className="mt-1 block text-[11px] leading-5 text-[var(--color-text-muted)]">{flag.hint}</small>
                </span>
              </label>
            ))}
          </div>

          {policyErrors.length > 0 ? (
            <div className="rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.08)] p-3 text-sm font-bold text-[rgb(var(--color-danger))]">
              {policyErrors.map((error) => <p key={error}>{error}</p>)}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleSaveCostingPolicy}
              disabled={savingPolicy || policyErrors.length > 0}
            >
              {savingPolicy ? 'جاري الحفظ...' : savedPolicy ? 'تم الحفظ' : 'حفظ سياسة التكلفة'}
            </Button>
          </div>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="معدل الأجور بالساعة" accent="costs">
        <div className="space-y-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-0 sm:min-w-[200px] space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">السعر لكل ساعة عمل (ج.م)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={hourlyRate || ''}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                placeholder="مثال: 25"
              />
            </div>
            <Button variant="primary" onClick={handleSave} disabled={saving || hourlyRate <= 0}>
              {saving ? 'جاري الحفظ...' : saved ? 'تم الحفظ' : 'حفظ'}
            </Button>
          </div>

          <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
            <span className="material-icons-round text-primary text-lg">info</span>
            <p className="text-xs font-medium text-[var(--color-text-muted)]">
              يُستخدم هذا المعدل لحساب تكلفة العمالة المباشرة: <span className="font-bold text-primary">عدد العمال × ساعات العمل × {hourlyRate || '—'} ج.م</span>
            </p>
          </div>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="معامل تحويل اليوان الصيني" accent="costs">
        <div className="space-y-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-0 sm:min-w-[200px] space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">1 يوان صيني = كام جنيه مصري؟</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={cnyToEgpRate || ''}
                onChange={(e) => setCnyToEgpRate(Number(e.target.value))}
                placeholder="مثال: 6.85"
              />
            </div>
            <Button variant="primary" onClick={handleSaveCny} disabled={savingCny || cnyToEgpRate <= 0}>
              {savingCny ? 'جاري الحفظ...' : savedCny ? 'تم الحفظ' : 'حفظ'}
            </Button>
          </div>

          {cnyToEgpRate > 0 && (
            <div className="bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)] rounded-[var(--border-radius-lg)] p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-[rgb(var(--color-warning))] text-lg">currency_yuan</span>
                <span className="text-sm font-bold text-[var(--color-text)]">أمثلة تحويل</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 10, 100, 1000].map((yuan) => (
                  <div key={yuan} className="bg-[var(--color-card)] rounded-[var(--border-radius-base)] p-3 text-center">
                    <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">¥ {yuan.toLocaleString('en-US')}</p>
                    <p className="text-sm font-bold text-[var(--color-text)]">{formatCost(yuan * cnyToEgpRate)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
            <span className="material-icons-round text-primary text-lg">info</span>
            <p className="text-xs font-medium text-[var(--color-text-muted)]">
              يُستخدم هذا المعامل للعرض والتقارير فقط (تحويل مرجعي بين الجنيه واليوان). حسابات التكلفة الأساسية تتم بالجنيه المصري.
              <span className="font-bold text-primary"> التحويل المرجعي: السعر باليوان × {cnyToEgpRate || '—'} = السعر بالجنيه</span>
            </p>
          </div>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="أيام الشغل الشهرية (إعداد عام)" accent="costs">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setWorkingDaysYear((prev) => prev - 1)}
                disabled={savingDays}
              >
                السنة السابقة
              </Button>
              <span className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-sm font-black text-[var(--color-text)] min-w-[86px] text-center">
                {workingDaysYear}
              </span>
              <Button
                variant="outline"
                onClick={() => setWorkingDaysYear((prev) => prev + 1)}
                disabled={savingDays}
              >
                السنة التالية
              </Button>
            </div>
            <Button variant="primary" onClick={handleSaveWorkingDays} disabled={savingDays}>
              {savingDays ? 'جاري الحفظ...' : savedDays ? 'تم الحفظ' : 'حفظ أيام السنة'}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-sm border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الشهر</th>
                  <th className="erp-th text-center">عدد أيام الشغل</th>
                  <th className="erp-th text-center">عدد أيام الشهر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {monthsOfYear.map((monthKey) => {
                  const monthLabel = new Date(`${monthKey}-01`).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                  });
                  const calendarDays = getDaysInMonth(monthKey);
                  return (
                    <tr key={monthKey}>
                      <td className="px-4 py-3 font-bold text-[var(--color-text)]">{monthLabel}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className="w-24 border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-sm text-center p-2 outline-none focus:border-primary"
                          value={workingDaysDraft[monthKey] ?? calendarDays}
                          onChange={(e) => {
                            const nextValue = Number(e.target.value);
                            setWorkingDaysDraft((prev) => ({
                              ...prev,
                              [monthKey]: Number.isFinite(nextValue)
                                ? Math.min(31, Math.max(1, Math.round(nextValue)))
                                : calendarDays,
                            }));
                          }}
                          disabled={savingDays}
                        />
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-[var(--color-text-muted)]">
                        {calendarDays}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            هذا الإعداد عام لكل شهر ويُستخدم تلقائيًا في جميع مراكز التكلفة والحسابات اليومية. القيمة الافتراضية لأي شهر جديد = عدد أيام الشهر بدون أيام الجمعة.
          </p>
        </div>
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
