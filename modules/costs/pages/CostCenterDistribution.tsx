import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { getDocs } from 'firebase/firestore';
import { Card, Button, Badge } from '../../../components/UI';
import { PageHeader } from '../../../components/PageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { DataTable, type Column } from '../../../src/components/erp/DataTable';
import { KPICard } from '../../../src/components/erp/KPICard';
import { StatusBadge } from '../../../src/components/erp/StatusBadge';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { getCurrentMonth, getWorkingDaysForMonth, formatCost } from '../../../utils/costCalculations';
import { departmentsRef } from '../../hr/collections';
import type { FirestoreDepartment } from '../../hr/types';
import { getPayrollMonth, getPayrollRecords } from '../../hr/payroll/payrollEngine';

export const CostCenterDistribution: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canManage = can('costs.manage');

  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
  const _rawLines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s.products);
  const employees = useAppStore((s) => s._rawEmployees);
  const saveCostCenterValue = useAppStore((s) => s.saveCostCenterValue);
  const saveCostAllocation = useAppStore((s) => s.saveCostAllocation);
  const updateCostCenter = useAppStore((s) => s.updateCostCenter);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const center = costCenters.find((c) => c.id === id);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyAmount, setMonthlyAmount] = useState<number>(0);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [sourceMonth, setSourceMonth] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [lineSearch, setLineSearch] = useState('');
  const [showAllocatedOnly, setShowAllocatedOnly] = useState(false);
  const [departmentNameMap, setDepartmentNameMap] = useState<Record<string, string>>({});
  const [salariesAmount, setSalariesAmount] = useState<number>(0);
  const [refreshingSalaries, setRefreshingSalaries] = useState(false);

  const parseLocaleNumber = React.useCallback((value: string): number => {
    const normalized = String(value ?? '')
      .trim()
      .replace(/[٠-٩]/g, (digit) => String('ظ ١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[ظ«,]/g, '.')
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
    if (!existingValue) {
      setMonthlyAmount(0);
      return;
    }
    const valueSource = existingValue.valueSource || center?.valueSource || 'manual';
    if (valueSource === 'combined' && existingValue.manualAmount !== undefined) {
      const fixed = Number(center?.manualAdjustment || 0);
      setMonthlyAmount(Math.max(0, Number(existingValue.manualAmount || 0) - fixed));
      return;
    }
    if (valueSource === 'manual' && existingValue.manualAmount !== undefined) {
      setMonthlyAmount(Number(existingValue.manualAmount || 0));
      return;
    }
    setMonthlyAmount(Number(existingValue.amount || 0));
  }, [existingValue, center?.valueSource, center?.manualAdjustment]);

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
    let active = true;
    (async () => {
      try {
        const snap = await getDocs(departmentsRef());
        if (!active) return;
        const nextMap: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as FirestoreDepartment;
          nextMap[d.id] = String(data?.name || '').trim() || d.id;
        });
        setDepartmentNameMap(nextMap);
      } catch {
        if (!active) return;
        setDepartmentNameMap({});
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const resolveSalariesAmount = React.useCallback(async () => {
    if (!center || center.type !== 'indirect') return 0;
    const valueSource = center.valueSource || 'manual';
    if (valueSource === 'manual') return 0;
    const employeeScope = center.employeeScope || 'selected';
    const fallbackFromEmployees = () => {
      if (employeeScope === 'department') {
        const departmentSet = new Set(center.employeeDepartmentIds || []);
        return employees
          .filter((employee) => employee.isActive !== false && departmentSet.has(String(employee.departmentId || '')))
          .reduce((sum, employee) => sum + Number(employee.baseSalary || 0), 0);
      }
      const employeeSet = new Set(center.employeeIds || []);
      return employees
        .filter((employee) => employee.isActive !== false && employeeSet.has(String(employee.id || '')))
        .reduce((sum, employee) => sum + Number(employee.baseSalary || 0), 0);
    };

    const payrollMonth = await getPayrollMonth(selectedMonth);
    if (!payrollMonth?.id) return fallbackFromEmployees();
    const records = await getPayrollRecords(payrollMonth.id);
    let total = 0;
    if (employeeScope === 'department') {
      const departmentSet = new Set(center.employeeDepartmentIds || []);
      total = records
        .filter((record) => departmentSet.has(String(record.departmentId || '')))
        .reduce((sum, record) => sum + Number(record.netSalary || 0), 0);
    } else {
      const employeeSet = new Set(center.employeeIds || []);
      total = records
        .filter((record) => employeeSet.has(String(record.employeeId || '')))
        .reduce((sum, record) => sum + Number(record.netSalary || 0), 0);
    }
    if (total <= 0) {
      total = fallbackFromEmployees();
    }
    return total;
  }, [center, selectedMonth, employees]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const savedValueSource = existingValue?.valueSource || center?.valueSource || 'manual';
      const hasSavedBreakdown = existingValue?.salariesAmount !== undefined || existingValue?.manualAmount !== undefined;
      if (existingValue && (savedValueSource === 'salaries' || savedValueSource === 'combined')) {
        const savedSalaries = hasSavedBreakdown
          ? Number(existingValue.salariesAmount || 0)
          : (savedValueSource === 'salaries' ? Number(existingValue.amount || 0) : 0);
        if (active) setSalariesAmount(savedSalaries);
        return;
      }
      if (existingValue) {
        if (active) setSalariesAmount(0);
        return;
      }
      const total = await resolveSalariesAmount();
      if (active) setSalariesAmount(total);
    })();
    return () => {
      active = false;
    };
  }, [resolveSalariesAmount, existingValue, center?.valueSource]);

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
  const isQtyAllocation = (center?.allocationBasis || 'line_percentage') === 'by_qty';
  const allowsManualInput = ['manual', 'combined'].includes(center?.valueSource || 'manual');
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
  const manualPart = Number(monthlyAmount || 0);
  const fixedAdjustment = center?.valueSource === 'combined' ? Number(center.manualAdjustment || 0) : 0;
  const savedValueSource = existingValue?.valueSource || center?.valueSource || 'manual';
  const hasSavedBreakdown = existingValue?.manualAmount !== undefined || existingValue?.salariesAmount !== undefined;
  const savedManualAmount = hasSavedBreakdown
    ? Number(existingValue?.manualAmount || 0)
    : Number(existingValue?.amount || 0);
  const savedSalariesAmount = hasSavedBreakdown
    ? Number(existingValue?.salariesAmount || 0)
    : 0;
  const savedSnapshotBase = savedValueSource === 'manual'
    ? savedManualAmount
    : savedValueSource === 'salaries'
      ? (hasSavedBreakdown ? savedSalariesAmount : Number(existingValue?.amount || 0))
      : (hasSavedBreakdown ? (savedManualAmount + savedSalariesAmount) : Number(existingValue?.amount || 0));
  const draftSnapshotBase = (center?.valueSource || 'manual') === 'salaries'
    ? salariesAmount
    : (center?.valueSource || 'manual') === 'combined'
      ? manualPart + fixedAdjustment + salariesAmount
      : manualPart;
  const baseResolvedAmount = existingValue ? savedSnapshotBase : draftSnapshotBase;
  const effectiveMonthlyAmount = baseResolvedAmount + centerMonthlyDepreciation;
  const appliedWorkingDays = getWorkingDaysForMonth(null, selectedMonth, systemSettings.costMonthlyWorkingDays);

  const allocationColumns: Column<(typeof visibleLines)[number]>[] = [
    {
      key: 'line',
      header: 'الخط',
      cell: (line) => <span className="font-bold text-[var(--color-text)]">{line.name}</span>,
      sortable: true,
    },
    {
      key: 'percentage',
      header: 'النسبة %',
      cell: (line) => {
        const lineId = line.id!;
        const pct = Number(allocations[lineId] || 0);
        return (
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="w-20 border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-sm text-center p-2 outline-none focus:border-primary"
            value={pct || ''}
            onChange={(e) => {
              const nextValue = Math.min(100, Math.max(0, parseLocaleNumber(e.target.value)));
              setAllocations((prev) => ({ ...prev, [lineId]: nextValue }));
            }}
            disabled={!canManage}
          />
        );
      },
      align: 'center',
    },
    {
      key: 'allocatedMonthly',
      header: 'المبلغ المخصص (شهري)',
      cell: (line) => {
        const pct = Number(allocations[line.id!] || 0);
        const allocated = effectiveMonthlyAmount * (pct / 100);
        return <span className="font-bold text-[var(--color-text-muted)]">{formatCost(allocated)}</span>;
      },
      align: 'center',
    },
    {
      key: 'allocatedDaily',
      header: 'المبلغ اليومي',
      cell: (line) => {
        const pct = Number(allocations[line.id!] || 0);
        const allocated = effectiveMonthlyAmount * (pct / 100);
        const daily = appliedWorkingDays > 0 ? allocated / appliedWorkingDays : 0;
        return <span className="font-bold text-primary">{formatCost(daily)}</span>;
      },
      align: 'center',
    },
  ];

  const handleSaveValue = async () => {
    if (!id) return;
    const valueSource = center?.valueSource || 'manual';
    const manualSnapshot = valueSource === 'manual'
      ? Number(monthlyAmount || 0)
      : valueSource === 'combined'
        ? Number(monthlyAmount || 0) + fixedAdjustment
        : 0;
    const salariesSnapshot = valueSource === 'salaries' || valueSource === 'combined'
      ? Number(salariesAmount || 0)
      : 0;
    const resolvedSnapshotBase = valueSource === 'manual'
      ? manualSnapshot
      : valueSource === 'salaries'
        ? salariesSnapshot
        : manualSnapshot + salariesSnapshot;
    setSaving(true);
    await saveCostCenterValue(
      {
        costCenterId: id,
        month: selectedMonth,
        amount: resolvedSnapshotBase,
        manualAmount: manualSnapshot,
        salariesAmount: salariesSnapshot,
        valueSource,
        employeeScopeSnapshot: center?.employeeScope || 'selected',
        employeeIdsSnapshot: center?.employeeIds || [],
        employeeDepartmentIdsSnapshot: center?.employeeDepartmentIds || [],
        productScopeSnapshot: center?.productScope || 'all',
        productIdsSnapshot: center?.productIds || [],
        productCategoriesSnapshot: center?.productCategories || [],
        allocationBasisSnapshot: center?.allocationBasis || 'line_percentage',
      },
      existingValue?.id
    );
    setSaving(false);
  };

  const handleSaveAll = async () => {
    if (!id || (!isQtyAllocation && totalPercentage > 100)) return;
    const valueSource = center?.valueSource || 'manual';
    const manualSnapshot = valueSource === 'manual'
      ? Number(monthlyAmount || 0)
      : valueSource === 'combined'
        ? Number(monthlyAmount || 0) + fixedAdjustment
        : 0;
    const salariesSnapshot = valueSource === 'salaries' || valueSource === 'combined'
      ? Number(salariesAmount || 0)
      : 0;
    const resolvedSnapshotBase = valueSource === 'manual'
      ? manualSnapshot
      : valueSource === 'salaries'
        ? salariesSnapshot
        : manualSnapshot + salariesSnapshot;
    setSaving(true);
    await saveCostCenterValue(
      {
        costCenterId: id,
        month: selectedMonth,
        amount: resolvedSnapshotBase,
        manualAmount: manualSnapshot,
        salariesAmount: salariesSnapshot,
        valueSource,
        employeeScopeSnapshot: center?.employeeScope || 'selected',
        employeeIdsSnapshot: center?.employeeIds || [],
        employeeDepartmentIdsSnapshot: center?.employeeDepartmentIds || [],
        productScopeSnapshot: center?.productScope || 'all',
        productIdsSnapshot: center?.productIds || [],
        productCategoriesSnapshot: center?.productCategories || [],
        allocationBasisSnapshot: center?.allocationBasis || 'line_percentage',
      },
      existingValue?.id
    );
    if (!isQtyAllocation) {
      const allocs = _rawLines
        .map((line) => ({ lineId: line.id!, percentage: Number(allocations[line.id!] || 0) }))
        .filter((entry) => entry.percentage > 0);
      await saveCostAllocation(
        { costCenterId: id, month: selectedMonth, allocations: allocs },
        existingAllocation?.id
      );
    }
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
      const sourceValueSource = sourceValue.valueSource || center?.valueSource || 'manual';
      if (sourceValueSource === 'combined' && sourceValue.manualAmount !== undefined) {
        setMonthlyAmount(Math.max(0, Number(sourceValue.manualAmount || 0) - fixedAdjustment));
      } else if (sourceValueSource === 'manual' && sourceValue.manualAmount !== undefined) {
        setMonthlyAmount(Number(sourceValue.manualAmount || 0));
      } else {
        setMonthlyAmount(Number(sourceValue.amount) || 0);
      }
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

  const handleRefreshSalaries = async () => {
    setRefreshingSalaries(true);
    try {
      const total = await resolveSalariesAmount();
      setSalariesAmount(total);
    } finally {
      setRefreshingSalaries(false);
    }
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
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/cost-centers')}>العودة</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 erp-ds-clean">
      <PageHeader
        title={center.name}
        subtitle={`إدارة القيمة الشهرية وتوزيع التكلفة على خطوط الإنتاج • ${center.type === 'indirect' ? 'غير مباشر' : 'مباشر'}`}
        icon="account_tree"
        backAction={{ label: 'رجوع', onClick: () => navigate('/cost-centers') }}
        primaryAction={canManage ? {
          label: 'حفظ الكل',
          icon: 'save',
          onClick: handleSaveAll,
          disabled: saving || totalPercentage > 100,
        } : undefined}
        extra={(
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge label={center.type === 'indirect' ? 'غير مباشر' : 'مباشر'} type={center.type === 'indirect' ? 'warning' : 'success'} />
            {canManage && (
              <>
                <Select
                  value={sourceMonth || 'none'}
                  onValueChange={(v) => setSourceMonth(v === 'none' ? '' : v)}
                  disabled={availableSourceMonths.length === 0}
                >
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[170px] rounded-lg border border-slate-200 bg-white text-sm">
                    <SelectValue placeholder="اختر شهرظ‹ا سابقًا" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSourceMonths.length === 0 ? (
                      <SelectItem value="none">لا توجد بيانات مرجعية في شهور سابقة</SelectItem>
                    ) : (
                      availableSourceMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {new Date(`${m}-01`).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  onClick={handleCopyAllocationsFromMonth}
                  disabled={!sourceMonth || availableSourceMonths.length === 0}
                >
                  <span className="material-icons-round text-sm">content_copy</span>
                  سحب النسب والقيمة
                </Button>
              </>
            )}
          </div>
        )}
      />

      <div className="rounded-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
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
              <Button variant="ghost" onClick={() => setEditMode(false)}>إلغاء</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              {canManage && (
                <button onClick={() => setEditMode(true)} className="text-[var(--color-text-muted)] hover:text-primary transition-colors">
                  <span className="material-icons-round text-lg">edit</span>
                </button>
              )}
            </div>
          )}
          {center.type === 'indirect' && (
            <p className="text-xs mt-1 text-[var(--color-text-muted)]">
              الأساس: <span className="font-bold text-primary">{isQtyAllocation ? 'حسب كمية الإنتاج' : 'حسب نسب مرجعية'}</span>
              {' • '}
              نطاق المنتجات: <span className="font-bold text-primary">{center.productScope === 'selected' ? 'منتجات محددة' : center.productScope === 'category' ? 'فئة منتجات' : 'كل المنتجات'}</span>
              {' • '}
              مصدر القيمة: <span className="font-bold text-primary">{center.valueSource === 'combined' ? 'مرتبات + يدوي' : center.valueSource === 'salaries' ? 'مرتبات' : 'يدوي'}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard label="قيمة المركز الفعلية" value={formatCost(effectiveMonthlyAmount)} iconType="money" color="indigo" />
        <KPICard label="إجمالي التوزيع" value={`${totalPercentage.toFixed(1)}%`} iconType="metric" color={totalPercentage > 100 ? 'red' : 'green'} />
        <KPICard label="المتبقي" value={`${remainingPercentage.toFixed(1)}%`} iconType="trend" color={remainingPercentage < 0 ? 'red' : 'amber'} />
      </div>

      {/* Month Selector */}
      <div className="erp-date-seg w-full">
        {generateMonths().map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`erp-date-seg-btn${m === selectedMonth ? ' active bg-[#4F46E5] text-white hover:bg-[#4338CA]' : ''}`}
          >
            {new Date(m + '-01').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
          </button>
        ))}
      </div>

      {/* Monthly Value */}
      <Card title="القيمة الشهرية">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="space-y-2 lg:col-span-6">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">المبلغ (ج.م)</label>
            <input
              type="number"
              min={0}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={monthlyAmount || ''}
              onChange={(e) => setMonthlyAmount(Math.max(0, parseLocaleNumber(e.target.value)))}
                disabled={!canManage || !allowsManualInput}
              placeholder="أدخل المبلغ الشهري..."
            />
              {!allowsManualInput && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  هذا المركز يعتمد على المرتبات فقط، لذلك الإدخال اليدوي غير مفعل.
                </p>
              )}
              {(center.valueSource === 'salaries' || center.valueSource === 'combined') && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--color-text-muted)]">
                    إجمالي المرتبات {existingValue ? 'المدخلة' : 'المحسوبة'} للشهر: <span className="font-bold text-primary">{formatCost(salariesAmount)} ج.م</span>
                    {center.valueSource === 'combined' && (
                      <>
                        {' '}+ تعديل ثابت: <span className="font-bold text-primary">{formatCost(fixedAdjustment)} ج.م</span>
                      </>
                    )}
                  </p>
                  {canManage && (
                    <Button variant="ghost" onClick={handleRefreshSalaries} disabled={refreshingSalaries}>
                      {refreshingSalaries && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                      <span className="material-icons-round text-sm">refresh</span>
                      إعادة تحديث قيمة المرتبات
                    </Button>
                  )}
                </div>
              )}
          </div>
          <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-4 text-center lg:col-span-3">
            <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">يومي ({appliedWorkingDays} يوم)</p>
            <p className="text-lg font-bold text-primary">
              {effectiveMonthlyAmount > 0 && appliedWorkingDays > 0 ? formatCost(effectiveMonthlyAmount / appliedWorkingDays) : '—'}
            </p>
          </div>
          {canManage && (
            <div className="lg:col-span-3 lg:justify-self-end">
              <Button variant="primary" onClick={handleSaveValue} disabled={saving}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                حفظ
              </Button>
            </div>
          )}
        </div>
        <p className="mt-2 text-xs font-bold text-[var(--color-text-muted)]">
          عدد أيام الشهر يتم أخذه تلقائيًا من صفحة إعدادات التكلفة ({appliedWorkingDays} يوم لهذا الشهر). الإهلاك المرتبط بالأصول لنفس المركز في هذا الشهر: <span className="text-primary">{formatCost(centerMonthlyDepreciation)} ج.م</span> (يضاف تلقائيًا في الحسابات)
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
      {center.type === 'indirect' && isQtyAllocation && (
        <Card title="نطاق توزيع المنتجات">
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              يتم توزيع التكلفة تلقائيًا على {center.productScope === 'selected' ? 'المنتجات المحددة' : center.productScope === 'category' ? 'منتجات الفئة المختارة' : 'كل المنتجات'} حسب كمية الإنتاج الفعلية.
            </p>
            {center.productScope === 'selected' && (
              <div className="flex items-center gap-2 flex-wrap">
                {(center.productIds || []).map((pid) => {
                  const product = products.find((p) => p.id === pid);
                  return (
                    <span
                      key={pid}
                      className="px-2 py-1 text-xs font-bold rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                    >
                      {product?.name || pid}
                    </span>
                  );
                })}
                {(center.productIds || []).length === 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">لم يتم اختيار منتجات بعد</span>
                )}
              </div>
            )}
            {center.productScope === 'category' && (
              <div className="flex items-center gap-2 flex-wrap">
                {(center.productCategories || []).map((category) => (
                  <span
                    key={category}
                    className="px-2 py-1 text-xs font-bold rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                  >
                    {category}
                  </span>
                ))}
                {(center.productCategories || []).length === 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">لم يتم اختيار فئات بعد</span>
                )}
              </div>
            )}
            {(center.valueSource === 'salaries' || center.valueSource === 'combined') && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-[var(--color-text)]">
                  {center.employeeScope === 'department' ? 'الأقسام مرجعية بالمركز' : 'العمالة مرجعية بالمركز'}
                </p>
                {center.employeeScope === 'department' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(center.employeeDepartmentIds || []).map((deptId) => (
                      <span
                        key={deptId}
                        className="px-2 py-1 text-xs font-bold rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                      >
                        {departmentNameMap[deptId] || deptId}
                      </span>
                    ))}
                    {(center.employeeDepartmentIds || []).length === 0 && (
                      <span className="text-xs text-[var(--color-text-muted)]">لا توجد أقسام محددة</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(center.employeeIds || []).map((employeeId) => {
                      const employee = employees.find((item) => item.id === employeeId);
                      return (
                        <span
                          key={employeeId}
                          className="px-2 py-1 text-xs font-bold rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                        >
                          {employee?.name || employeeId}
                        </span>
                      );
                    })}
                    {(center.employeeIds || []).length === 0 && (
                      <span className="text-xs text-[var(--color-text-muted)]">لا توجد عمالة محددة</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
      {center.type === 'indirect' && !isQtyAllocation && (
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
                  عرض الخطوط ذات النسبة فقط
                </label>
                {canManage && (
                  <>
                    <Button variant="ghost" onClick={handleDistributeEqually}>
                      <span className="material-icons-round text-sm">balance</span>
                      توزيع متساوي
                    </Button>
                    <Button variant="ghost" onClick={handleResetAllocations}>
                      <span className="material-icons-round text-sm">restart_alt</span>
                      تصفير
                    </Button>
                  </>
                )}
              </div>
              <div className="overflow-x-auto">
                <DataTable
                  columns={allocationColumns}
                  data={visibleLines}
                  emptyMessage="لا توجد خطوط مرجعية للفلاتر الحالية."
                />
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



