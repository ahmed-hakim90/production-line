import React, { useState, useEffect } from 'react';
import { Card, Button } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { formatCost } from '../../../utils/costCalculations';

export const CostSettings: React.FC = () => {
  const laborSettings = useAppStore((s) => s.laborSettings);
  const updateLaborSettings = useAppStore((s) => s.updateLaborSettings);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [cnyToEgpRate, setCnyToEgpRate] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingCny, setSavingCny] = useState(false);
  const [savedCny, setSavedCny] = useState(false);

  useEffect(() => {
    setHourlyRate(laborSettings?.hourlyRate ?? 0);
    setCnyToEgpRate(laborSettings?.cnyToEgpRate ?? 0);
  }, [laborSettings]);

  const handleSave = async () => {
    setSaving(true);
    await updateLaborSettings({ hourlyRate, cnyToEgpRate });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveCny = async () => {
    setSavingCny(true);
    await updateLaborSettings({ hourlyRate, cnyToEgpRate });
    setSavingCny(false);
    setSavedCny(true);
    setTimeout(() => setSavedCny(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إعدادات التكلفة</h2>
        <p className="text-sm text-slate-500 font-medium">إدارة معدل الأجور وإعدادات حساب التكاليف.</p>
      </div>

      <Card title="معدل الأجور بالساعة">
        <div className="space-y-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">السعر لكل ساعة عمل (ج.م)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
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

          <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center gap-3">
            <span className="material-icons-round text-primary text-lg">info</span>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              يُستخدم هذا المعدل لحساب تكلفة العمالة المباشرة: <span className="font-black text-primary">عدد العمال × ساعات العمل × {hourlyRate || '—'} ج.م</span>
            </p>
          </div>
        </div>
      </Card>

      <Card title="معامل تحويل اليوان الصيني">
        <div className="space-y-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">1 يوان صيني = كام جنيه مصري؟</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
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
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-amber-500 text-lg">currency_yuan</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">أمثلة تحويل</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 10, 100, 1000].map((yuan) => (
                  <div key={yuan} className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-400 font-medium mb-1">¥ {yuan.toLocaleString('en-US')}</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white">{formatCost(yuan * cnyToEgpRate)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center gap-3">
            <span className="material-icons-round text-primary text-lg">info</span>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              يُستخدم هذا المعامل لتحويل أسعار المنتجات المُدخلة باليوان الصيني إلى الجنيه المصري: <span className="font-black text-primary">السعر باليوان × {cnyToEgpRate || '—'} = السعر بالجنيه</span>
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
};
