import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { getCurrentMonth, getDaysInMonth, getWorkingDaysForMonth, formatCost } from '../../../utils/costCalculations';

export const CostCenterDistribution: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canManage = can('costs.manage');

  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const _rawLines = useAppStore((s) => s._rawLines);
  const saveCostCenterValue = useAppStore((s) => s.saveCostCenterValue);
  const saveCostAllocation = useAppStore((s) => s.saveCostAllocation);
  const updateCostCenter = useAppStore((s) => s.updateCostCenter);

  const center = costCenters.find((c) => c.id === id);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyAmount, setMonthlyAmount] = useState<number>(0);
  const [workingDays, setWorkingDays] = useState<number>(0);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [sourceMonth, setSourceMonth] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const existingValue = useMemo(() => {
    if (!id) return null;
    return costCenterValues.find((v) => v.costCenterId === id && v.month === selectedMonth) ?? null;
  }, [costCenterValues, id, selectedMonth]);

  const existingAllocation = useMemo(() => {
    if (!id) return null;
    return costAllocations.find((a) => a.costCenterId === id && a.month === selectedMonth) ?? null;
  }, [costAllocations, id, selectedMonth]);

  const availableSourceMonths = useMemo(() => {
    if (!id) return [];
    const uniqueMonths = new Set(
      costAllocations
        .filter((a) => a.costCenterId === id && a.month !== selectedMonth && (a.allocations?.length ?? 0) > 0)
        .map((a) => a.month)
    );
    return Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a));
  }, [costAllocations, id, selectedMonth]);

  React.useEffect(() => {
    setMonthlyAmount(existingValue?.amount ?? 0);
    setWorkingDays(getWorkingDaysForMonth(existingValue, selectedMonth));
  }, [existingValue, selectedMonth]);

  React.useEffect(() => {
    const map: Record<string, number> = {};
    _rawLines.forEach((l) => { map[l.id!] = 0; });
    if (existingAllocation) {
      existingAllocation.allocations.forEach((a) => { map[a.lineId] = a.percentage; });
    }
    setAllocations(map);
  }, [existingAllocation, _rawLines]);

  React.useEffect(() => {
    if (center) setEditName(center.name);
  }, [center]);

  React.useEffect(() => {
    if (availableSourceMonths.length === 0) {
      setSourceMonth('');
      return;
    }
    if (!sourceMonth || !availableSourceMonths.includes(sourceMonth)) {
      setSourceMonth(availableSourceMonths[0]);
    }
  }, [availableSourceMonths, sourceMonth]);

  React.useEffect(() => {
    setCopyNotice(null);
  }, [selectedMonth]);

  const totalPercentage = useMemo(
    () => Object.values(allocations).reduce((s: number, v: number) => s + (v || 0), 0),
    [allocations]
  );
  const remainingPercentage = 100 - totalPercentage;
  const monthDays = getDaysInMonth(selectedMonth);
  const normalizedWorkingDays = Number.isFinite(workingDays) ? Math.round(workingDays) : 0;
  const appliedWorkingDays = normalizedWorkingDays > 0 ? normalizedWorkingDays : monthDays;

  const handleSaveValue = async () => {
    if (!id) return;
    setSaving(true);
    await saveCostCenterValue(
      { costCenterId: id, month: selectedMonth, amount: monthlyAmount, workingDays: Math.min(31, Math.max(1, appliedWorkingDays)) },
      existingValue?.id
    );
    setSaving(false);
  };

  const handleSaveAllocations = async () => {
    if (!id || totalPercentage > 100) return;
    setSaving(true);
    const allocs = Object.entries(allocations)
      .filter(([, pct]) => (pct as number) > 0)
      .map(([lineId, percentage]) => ({ lineId, percentage: percentage as number }));
    await saveCostAllocation(
      { costCenterId: id, month: selectedMonth, allocations: allocs },
      existingAllocation?.id
    );
    setSaving(false);
  };

  const handleSaveName = async () => {
    if (!id || !editName.trim()) return;
    await updateCostCenter(id, { name: editName.trim() });
    setEditMode(false);
  };

  const handleCopyAllocationsFromMonth = () => {
    if (!id || !sourceMonth) return;
    const sourceAllocation = costAllocations.find(
      (a) => a.costCenterId === id && a.month === sourceMonth
    );
    const sourceValue = costCenterValues.find(
      (v) => v.costCenterId === id && v.month === sourceMonth
    );
    if (!sourceAllocation && !sourceValue) return;

    const copied: Record<string, number> = {};
    _rawLines.forEach((line) => {
      copied[line.id!] = 0;
    });
    if (sourceAllocation) {
      sourceAllocation.allocations.forEach((allocation) => {
        copied[allocation.lineId] = Number(allocation.percentage) || 0;
      });
      setAllocations(copied);
    }

    if (sourceValue) {
      setMonthlyAmount(Number(sourceValue.amount) || 0);
      setWorkingDays(getWorkingDaysForMonth(sourceValue, sourceMonth));
    }

    const copiedMonthLabel = new Date(`${sourceMonth}-01`).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
    });
    setCopyNotice(`تم سحب نسب التوزيع وقيمة المركز من ${copiedMonthLabel} — اضغط حفظ القيمة وحفظ التوزيع للتأكيد.`);
  };

  const generateMonths = () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = -3; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  if (!center) {
    return (
      <div className="text-center py-20 text-slate-400">
        <span className="material-icons-round text-5xl mb-3 block opacity-30">error_outline</span>
        <p className="font-bold">مركز التكلفة غير موجود</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/cost-centers')}>العودة</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/cost-centers')}
          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
        >
          <span className="material-icons-round">arrow_forward</span>
        </button>
        <div className="flex-1">
          {editMode ? (
            <div className="flex items-center gap-2">
              <input
                className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-lg font-bold p-2 outline-none"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
              <Button variant="primary" onClick={handleSaveName}>حفظ</Button>
              <Button variant="outline" onClick={() => setEditMode(false)}>إلغاء</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">{center.name}</h2>
              <Badge variant={center.type === 'indirect' ? 'warning' : 'success'}>
                {center.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
              </Badge>
              {canManage && (
                <button onClick={() => setEditMode(true)} className="text-slate-400 hover:text-primary transition-colors">
                  <span className="material-icons-round text-lg">edit</span>
                </button>
              )}
              {canManage && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-sm p-2 outline-none focus:border-primary min-w-[170px]"
                    value={sourceMonth}
                    onChange={(e) => setSourceMonth(e.target.value)}
                    disabled={availableSourceMonths.length === 0}
                  >
                    {availableSourceMonths.length === 0 ? (
                      <option value="">لا توجد بيانات محفوظة في شهور سابقة</option>
                    ) : (
                      availableSourceMonths.map((m) => (
                        <option key={m} value={m}>
                          {new Date(`${m}-01`).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
                        </option>
                      ))
                    )}
                  </select>
                  <Button
                    variant="outline"
                    onClick={handleCopyAllocationsFromMonth}
                    disabled={!sourceMonth || availableSourceMonths.length === 0}
                  >
                    <span className="material-icons-round text-sm">content_copy</span>
                    سحب النسب والقيمة
                  </Button>
                </div>
              )}
               {canManage && (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button
                      variant="primary"
                      onClick={handleSaveAllocations}
                      disabled={saving || totalPercentage > 100}
                    >
                      {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                      <span className="material-icons-round text-sm">save</span>
                      حفظ التوزيع
                    </Button>
                  </div>
                )}
             
            </div>
          )}
          <p className="text-sm text-slate-500 font-medium mt-1">إدارة القيمة الشهرية وتوزيع التكلفة على خطوط الإنتاج</p>
        </div>
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        {generateMonths().map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              m === selectedMonth
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {new Date(m + '-01').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
          </button>
        ))}
      </div>

      {/* Monthly Value */}
      <Card title="القيمة الشهرية">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المبلغ (ج.م)</label>
            <input
              type="number"
              min={0}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={monthlyAmount || ''}
              onChange={(e) => setMonthlyAmount(Number(e.target.value))}
              disabled={!canManage}
              placeholder="أدخل المبلغ الشهري..."
            />
          </div>
          <div className="w-full sm:w-48 space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">أيام الشغل / الشهر</label>
            <input
              type="number"
              min={1}
              max={31}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={workingDays || ''}
              onChange={(e) => setWorkingDays(Number(e.target.value))}
              disabled={!canManage}
              placeholder={`${monthDays}`}
            />
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center min-w-[120px]">
            <p className="text-[11px] font-bold text-slate-400 mb-1">يومي ({appliedWorkingDays} يوم)</p>
            <p className="text-lg font-black text-primary">
              {monthlyAmount > 0 && appliedWorkingDays > 0 ? formatCost(monthlyAmount / appliedWorkingDays) : '—'}
            </p>
          </div>
          {canManage && (
            <Button variant="primary" onClick={handleSaveValue} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              حفظ
            </Button>
          )}
        </div>
      </Card>
  {/* Summary */}
  <div className="mt-4 flex items-center justify-between flex-wrap gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400">إجمالي التوزيع</p>
                    <p className={`text-lg font-black ${totalPercentage > 100 ? 'text-rose-500' : 'text-slate-800 dark:text-white'}`}>
                      {totalPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400">المتبقي</p>
                    <p className={`text-lg font-black ${remainingPercentage < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {remainingPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400">المبلغ الموزع</p>
                    <p className="text-lg font-black text-primary">
                      {formatCost(monthlyAmount * (totalPercentage / 100))} ج.م
                    </p>
                  </div>
                </div>
               
              </div>
      {copyNotice && (
        <p className="text-xs font-bold text-emerald-600 -mt-2 flex items-center gap-1">
          <span className="material-icons-round text-sm">check_circle</span>
          {copyNotice}
        </p>
      )}
      {/* Allocation Table (indirect only) */}
      {center.type === 'indirect' && (
        <Card title="توزيع التكلفة على الخطوط">
          {_rawLines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">لا توجد خطوط إنتاج</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-3 text-xs font-black text-slate-500">الخط</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">النسبة %</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">المبلغ المخصص (شهري)</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">المبلغ اليومي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {_rawLines.map((line) => {
                      const pct = allocations[line.id!] || 0;
                      const allocated = monthlyAmount * (pct / 100);
                      const daily = appliedWorkingDays > 0 ? allocated / appliedWorkingDays : 0;
                      return (
                        <tr key={line.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{line.name}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              className="w-20 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-sm text-center p-2 outline-none focus:border-primary"
                              value={pct || ''}
                              onChange={(e) => setAllocations({ ...allocations, [line.id!]: Number(e.target.value) })}
                              disabled={!canManage}
                            />
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400">
                            {formatCost(allocated)}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-primary">
                            {formatCost(daily)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

             
              {totalPercentage > 100 && (
                <p className="mt-2 text-xs font-bold text-rose-500 flex items-center gap-1">
                  <span className="material-icons-round text-sm">error</span>
                  إجمالي النسب يتجاوز 100% — يرجى تعديل القيم
                </p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
};
