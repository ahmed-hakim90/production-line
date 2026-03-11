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
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
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
  const [lineSearch, setLineSearch] = useState('');
  const [showAllocatedOnly, setShowAllocatedOnly] = useState(false);

  const parseLocaleNumber = React.useCallback((value: string): number => {
    const normalized = String(value ?? '')
      .trim()
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[٫,]/g, '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

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
    let inheritedMonth = '';
    const fallbackAllocation = !existingAllocation
      ? costAllocations
        .filter((a) => a.costCenterId === id && a.month !== selectedMonth && (a.allocations?.length ?? 0) > 0)
        .sort((a, b) => b.month.localeCompare(a.month))[0]
      : null;

    const seedAllocation = existingAllocation ?? fallbackAllocation ?? null;
    if (seedAllocation) {
      seedAllocation.allocations.forEach((entry) => {
        if (!entry?.lineId || map[entry.lineId] === undefined) return;
        map[entry.lineId] = Number(entry.percentage) || 0;
      });
      if (!existingAllocation && fallbackAllocation?.month) {
        inheritedMonth = fallbackAllocation.month;
      }
    }
    setAllocations(map);
    if (inheritedMonth) {
      const inheritedMonthLabel = new Date(`${inheritedMonth}-01`).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
      });
      setCopyNotice(`تم توريث نسب التوزيع تلقائيًا من ${inheritedMonthLabel} لهذا الشهر. اضغط حفظ الكل للتأكيد.`);
    }
  }, [costAllocations, existingAllocation, id, selectedMonth, _rawLines]);

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

  const totalPercentage = _rawLines.reduce((sum, line) => sum + (allocations[line.id!] || 0), 0);
  const remainingPercentage = 100 - totalPercentage;
  const visibleLines = useMemo(() => (
    _rawLines.filter((line) => {
      const name = String(line.name || '').toLowerCase();
      const q = lineSearch.trim().toLowerCase();
      const matchesSearch = !q || name.includes(q);
      const pct = Number(allocations[line.id!] || 0);
      const matchesAllocated = !showAllocatedOnly || pct > 0;
      return matchesSearch && matchesAllocated;
    })
  ), [_rawLines, allocations, lineSearch, showAllocatedOnly]);
  const centerMonthlyDepreciation = useMemo(() => {
    if (!id) return 0;
    const assetById = new Map(
      assets
        .filter((asset) => asset.id && asset.centerId === id)
        .map((asset) => [String(asset.id), asset])
    );
    return assetDepreciations.reduce((sum, entry) => {
      if (entry.period !== selectedMonth) return sum;
      if (!assetById.has(String(entry.assetId || ''))) return sum;
      return sum + Number(entry.depreciationAmount || 0);
    }, 0);
  }, [assetDepreciations, assets, id, selectedMonth]);
  const effectiveMonthlyAmount = monthlyAmount + centerMonthlyDepreciation;
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

  const handleSaveAll = async () => {
    if (!id || totalPercentage > 100) return;
    setSaving(true);
    const allocs = _rawLines
      .map((line) => ({ lineId: line.id!, percentage: Number(allocations[line.id!] || 0) }))
      .filter((entry) => entry.percentage > 0);
    await saveCostCenterValue(
      { costCenterId: id, month: selectedMonth, amount: monthlyAmount, workingDays: Math.min(31, Math.max(1, appliedWorkingDays)) },
      existingValue?.id
    );
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
      sourceAllocation.allocations.forEach((entry) => {
        if (!entry?.lineId || copied[entry.lineId] === undefined) return;
        copied[entry.lineId] = Number(entry.percentage) || 0;
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
    setCopyNotice(`تم سحب نسب التوزيع وقيمة المركز من ${copiedMonthLabel} — اضغط حفظ الكل للتأكيد.`);
  };

  const handleResetAllocations = () => {
    const reset: Record<string, number> = {};
    _rawLines.forEach((line) => { reset[line.id!] = 0; });
    setAllocations(reset);
  };

  const handleDistributeEqually = () => {
    if (visibleLines.length === 0) return;
    const share = Number((100 / visibleLines.length).toFixed(2));
    const next: Record<string, number> = {};
    _rawLines.forEach((line) => { next[line.id!] = 0; });
    visibleLines.forEach((line, index) => {
      if (index === visibleLines.length - 1) {
        const used = share * (visibleLines.length - 1);
        next[line.id!] = Number((100 - used).toFixed(2));
      } else {
        next[line.id!] = share;
      }
    });
    setAllocations(next);
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
      <div className="rounded-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <button
          onClick={() => navigate('/cost-centers')}
          className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all"
        >
          <span className="material-icons-round">arrow_forward</span>
        </button>
        <div className="flex-1">
          {editMode ? (
            <div className="flex items-center gap-2">
              <input
                className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-lg font-bold p-2 outline-none"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
              <Button variant="primary" onClick={handleSaveName}>حفظ</Button>
              <Button variant="outline" onClick={() => setEditMode(false)}>إلغاء</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{center.name}</h2>
              <Badge variant={center.type === 'indirect' ? 'warning' : 'success'}>
                {center.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
              </Badge>
              {canManage && (
                <button onClick={() => setEditMode(true)} className="text-[var(--color-text-muted)] hover:text-primary transition-colors">
                  <span className="material-icons-round text-lg">edit</span>
                </button>
              )}
              {canManage && (
                <div className="flex items-center gap-2 flex-wrap w-full">
                  <select
                    className="w-full sm:w-auto border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-sm p-2 outline-none focus:border-primary sm:min-w-[170px]"
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
                  <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:justify-end">
                    <Button
                      variant="primary"
                      onClick={handleSaveAll}
                      disabled={saving || totalPercentage > 100}
                    >
                      {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                      <span className="material-icons-round text-sm">save</span>
                      حفظ الكل
                    </Button>
                  </div>
                )}
             
            </div>
          )}
          <p className="text-sm text-[var(--color-text-muted)] font-medium mt-1">إدارة القيمة الشهرية وتوزيع التكلفة على خطوط الإنتاج</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <p className="text-xs text-[var(--color-text-muted)]">إجمالي التوزيع</p>
          <p className={`text-2xl font-black ${totalPercentage > 100 ? 'text-rose-600' : 'text-[var(--color-text)]'}`}>{totalPercentage.toFixed(1)}%</p>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">المتبقي</p>
          <p className={`text-2xl font-black ${remainingPercentage < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{remainingPercentage.toFixed(1)}%</p>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs text-blue-700">قيمة المركز الفعلية</p>
          <p className="text-xl font-black text-blue-600">{formatCost(effectiveMonthlyAmount)}</p>
        </div>
      </div>
      </div>

      {/* Month Selector */}
      <div className="erp-date-seg w-full">
        {generateMonths().map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`erp-date-seg-btn${m === selectedMonth ? ' active' : ''}`}
          >
            {new Date(m + '-01').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
          </button>
        ))}
      </div>

      {/* Monthly Value */}
      <Card title="القيمة الشهرية">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">المبلغ (ج.م)</label>
            <input
              type="number"
              min={0}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={monthlyAmount || ''}
              onChange={(e) => setMonthlyAmount(Math.max(0, parseLocaleNumber(e.target.value)))}
              disabled={!canManage}
              placeholder="أدخل المبلغ الشهري..."
            />
          </div>
          <div className="w-full sm:w-48 space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">أيام الشغل / الشهر</label>
            <input
              type="number"
              min={1}
              max={31}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={workingDays || ''}
              onChange={(e) => setWorkingDays(Math.min(31, Math.max(0, Math.round(parseLocaleNumber(e.target.value)))))}
              disabled={!canManage}
              placeholder={`${monthDays}`}
            />
          </div>
          <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-4 text-center w-full sm:w-auto sm:min-w-[120px]">
            <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">يومي ({appliedWorkingDays} يوم)</p>
            <p className="text-lg font-bold text-primary">
              {effectiveMonthlyAmount > 0 && appliedWorkingDays > 0 ? formatCost(effectiveMonthlyAmount / appliedWorkingDays) : '—'}
            </p>
          </div>
          {canManage && (
            <Button variant="primary" onClick={handleSaveValue} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              حفظ
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs font-bold text-[var(--color-text-muted)]">
          الإهلاك المرتبط بالأصول لنفس المركز في هذا الشهر: <span className="text-primary">{formatCost(centerMonthlyDepreciation)} ج.م</span> (يضاف تلقائيًا في الحسابات)
        </p>
      </Card>
  {/* Summary */}
  <div className="mt-4 flex items-center justify-between flex-wrap gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)]">
                <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400">إجمالي التوزيع</p>
                    <p className={`text-lg font-bold ${totalPercentage > 100 ? 'text-rose-500' : 'text-slate-800'}`}>
                      {totalPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400">المتبقي</p>
                    <p className={`text-lg font-bold ${remainingPercentage < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {remainingPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400">المبلغ الموزع</p>
                    <p className="text-lg font-bold text-primary">
                      {formatCost(effectiveMonthlyAmount * (totalPercentage / 100))} ج.م
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
            <p className="text-sm text-[var(--color-text-muted)] text-center py-6">لا توجد خطوط إنتاج</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <input
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                  placeholder="بحث عن خط..."
                  className="h-9 min-w-0 w-full sm:w-auto sm:min-w-[200px] flex-1 rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 text-sm bg-[var(--color-bg)]"
                />
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                  <input
                    type="checkbox"
                    checked={showAllocatedOnly}
                    onChange={(e) => setShowAllocatedOnly(e.target.checked)}
                  />
                  عرض الخطوط ذات نسبة فقط
                </label>
                {canManage && (
                  <>
                    <Button variant="outline" onClick={handleDistributeEqually}>
                      <span className="material-icons-round text-sm">balance</span>
                      توزيع متساوي
                    </Button>
                    <Button variant="outline" onClick={handleResetAllocations}>
                      <span className="material-icons-round text-sm">restart_alt</span>
                      تصفير
                    </Button>
                  </>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">الخط</th>
                      <th className="erp-th text-center">النسبة %</th>
                      <th className="erp-th text-center">المبلغ المخصص (شهري)</th>
                      <th className="erp-th text-center">المبلغ اليومي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {visibleLines.map((line) => {
                      const pct = Number(allocations[line.id!] || 0);
                      const allocated = effectiveMonthlyAmount * (pct / 100);
                      const daily = appliedWorkingDays > 0 ? allocated / appliedWorkingDays : 0;
                      return (
                        <tr key={line.id} className="hover:bg-[#f8f9fa]/50">
                          <td className="px-4 py-3 font-bold text-[var(--color-text)]">{line.name}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              className="w-20 border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-sm text-center p-2 outline-none focus:border-primary"
                              value={pct || ''}
                              onChange={(e) => {
                                const nextValue = Math.min(100, Math.max(0, parseLocaleNumber(e.target.value)));
                                setAllocations((prev) => ({ ...prev, [line.id!]: nextValue }));
                              }}
                              disabled={!canManage}
                            />
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-[var(--color-text-muted)]">
                            {formatCost(allocated)}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-primary">
                            {formatCost(daily)}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleLines.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                          لا توجد خطوط مطابقة للفلاتر الحالية.
                        </td>
                      </tr>
                    )}
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
