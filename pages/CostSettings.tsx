import React, { useState, useEffect } from 'react';
import { Card, Button } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { formatCost } from '../utils/costCalculations';

export const CostSettings: React.FC = () => {
  const laborSettings = useAppStore((s) => s.laborSettings);
  const updateLaborSettings = useAppStore((s) => s.updateLaborSettings);
  const todayReports = useAppStore((s) => s.todayReports);

  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setHourlyRate(laborSettings?.hourlyRate ?? 0);
  }, [laborSettings]);

  const handleSave = async () => {
    setSaving(true);
    await updateLaborSettings({ hourlyRate });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const todayLaborHours = todayReports.reduce(
    (sum, r) => sum + (r.workersCount || 0) * (r.workHours || 0), 0
  );
  const todayLaborCost = todayLaborHours * hourlyRate;

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

      <Card title="ملخص تكاليف اليوم">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-blue-500 text-3xl mb-2 block">schedule</span>
            <p className="text-xs text-slate-400 font-bold mb-1">إجمالي ساعات العمل</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{todayLaborHours.toLocaleString('ar-EG')}</p>
            <span className="text-[10px] font-medium text-slate-400">عامل × ساعة</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-emerald-500 text-3xl mb-2 block">payments</span>
            <p className="text-xs text-slate-400 font-bold mb-1">سعر الساعة</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{formatCost(hourlyRate)}</p>
            <span className="text-[10px] font-medium text-slate-400">ج.م / ساعة</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-primary text-3xl mb-2 block">account_balance_wallet</span>
            <p className="text-xs text-slate-400 font-bold mb-1">تكلفة عمالة اليوم</p>
            <p className="text-2xl font-black text-primary">{formatCost(todayLaborCost)}</p>
            <span className="text-[10px] font-medium text-slate-400">ج.م</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
