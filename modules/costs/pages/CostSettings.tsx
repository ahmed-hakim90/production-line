import React, { useState, useEffect, useRef } from 'react';
import { Card, Button } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { formatCost, getDaysInMonth, getWorkingDaysExcludingFriday } from '../../../utils/costCalculations';

export const CostSettings: React.FC = () => {
  const laborSettings = useAppStore((s) => s.laborSettings);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateLaborSettings = useAppStore((s) => s.updateLaborSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">إعدادات التكلفة</h2>
        <p className="text-sm text-[var(--color-text-muted)] font-medium">إدارة معدل الأجور وإعدادات حساب التكاليف.</p>
      </div>

      <Card title="معدل الأجور بالساعة">
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
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              {saved ? (
                <>
                  <span className="material-icons-round text-sm">check</span>
                  تم الحفظ
                </>
              ) : (
                <>
                  <span className="material-icons-round text-sm">save</span>
                  حفظ
                </>
              )}
            </Button>
          </div>

          <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
            <span className="material-icons-round text-primary text-lg">info</span>
            <p className="text-xs font-medium text-[var(--color-text-muted)]">
              يُستخدم هذا المعدل لحساب تكلفة العمالة المباشرة: <span className="font-bold text-primary">عدد العمال × ساعات العمل × {hourlyRate || '—'} ج.م</span>
            </p>
          </div>
        </div>
      </Card>

      <Card title="معامل تحويل اليوان الصيني">
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
              {savingCny && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              {savedCny ? (
                <>
                  <span className="material-icons-round text-sm">check</span>
                  تم الحفظ
                </>
              ) : (
                <>
                  <span className="material-icons-round text-sm">save</span>
                  حفظ
                </>
              )}
            </Button>
          </div>

          {cnyToEgpRate > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-amber-500 text-lg">currency_yuan</span>
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
      </Card>

      <Card title="أيام الشغل الشهرية (إعداد عام)">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setWorkingDaysYear((prev) => prev - 1)}
                disabled={savingDays}
              >
                <span className="material-icons-round text-sm">chevron_right</span>
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
                <span className="material-icons-round text-sm">chevron_left</span>
              </Button>
            </div>
            <Button variant="primary" onClick={handleSaveWorkingDays} disabled={savingDays}>
              {savingDays && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              {savedDays ? (
                <>
                  <span className="material-icons-round text-sm">check</span>
                  تم الحفظ
                </>
              ) : (
                <>
                  <span className="material-icons-round text-sm">save</span>
                  حفظ أيام السنة
                </>
              )}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
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
      </Card>

    </div>
  );
};
