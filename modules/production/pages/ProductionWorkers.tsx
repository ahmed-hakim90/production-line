import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '@/components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber, getTodayDateString } from '@/utils/calculations';
import { Badge, Button, Card, KPIBox, LoadingSkeleton, SearchableSelect } from '../components/UI';
import { SelectableTable, type TableColumn } from '../components/SelectableTable';
import type {
  ProductionLineWorkerAssignment,
  ProductionWorker,
  ProductionWorkerTarget,
  WorkerMonthlyAchievement,
} from '@/types';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { productionWorkerService, resolveWorkerCodeFromEmployee } from '../services/productionWorkerService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type WorkerRow = ProductionWorker & {
  assignedLineIds: string[];
  activeTargetsCount: number;
  todayOutput: number;
  todayAchievement: number;
  monthStats: WorkerMonthlyAchievement | null;
};

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const ProductionWorkers: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canManage = can('production.workers.manage') || can('productionWorkers.view');
  const canManageTargets = can('production.workerTargets.manage') || canManage;
  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const rawWorkerSettings = useAppStore((s) => s.systemSettings.productionWorkerSettings);
  const workerSettings = useMemo(() => ({
    performance: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.performance,
      ...(rawWorkerSettings?.performance ?? {}),
    },
    bonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.bonus,
      ...(rawWorkerSettings?.bonus ?? {}),
    },
    supervisorBonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
      ...(rawWorkerSettings?.supervisorBonus ?? {}),
      tiers: rawWorkerSettings?.supervisorBonus?.tiers?.length
        ? rawWorkerSettings.supervisorBonus.tiers
        : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
    },
  }), [rawWorkerSettings]);

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [assignments, setAssignments] = useState<ProductionLineWorkerAssignment[]>([]);
  const [targets, setTargets] = useState<ProductionWorkerTarget[]>([]);
  const [monthStatsMap, setMonthStatsMap] = useState<Map<string, WorkerMonthlyAchievement>>(new Map());
  const [todayStatsMap, setTodayStatsMap] = useState<Map<string, { output: number; achievement: number }>>(new Map());

  const [search, setSearch] = useState('');
  const [filterLine, setFilterLine] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterDate, setFilterDate] = useState(getTodayDateString());
  const [filterActive, setFilterActive] = useState<'' | 'active' | 'inactive'>('');
  const [filterPerformance, setFilterPerformance] = useState<'' | 'below' | 'above' | 'missing_target'>('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkProgress, setLinkProgress] = useState<{ current: number; total: number } | null>(null);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<{ employeeId: string; name: string; message: string }[]>([]);
  const [form, setForm] = useState({
    selectedEmployeeIds: [] as string[],
    isActive: true,
    defaultLineId: '',
  });

  const linkedEmployeeIds = useMemo(
    () => new Set(workers.map((w) => w.employeeId).filter((id): id is string => Boolean(id))),
    [workers],
  );

  const linkableEmployees = useMemo(
    () => _rawEmployees.filter((e) => e.id && e.isActive !== false && !linkedEmployeeIds.has(e.id)),
    [_rawEmployees, linkedEmployeeIds],
  );

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    _rawEmployees.forEach((e) => {
      if (e.id) map.set(e.id, e.name);
    });
    return map;
  }, [_rawEmployees]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [w, a, t] = await Promise.all([
        productionWorkerService.getAll(),
        productionLineWorkerAssignmentService.getAll(),
        productionWorkerTargetService.getAll(),
      ]);
      setWorkers(w);
      setAssignments(a);
      setTargets(t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (workers.length === 0) {
      setMonthStatsMap(new Map());
      setTodayStatsMap(new Map());
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setStatsLoading(true);
        try {
          const { monthlyByWorkerId, dailyByWorkerId } =
            await productionWorkerPerformanceService.getWorkersListPerformanceSnapshot({
              workers,
              targets,
              month: filterMonth,
              date: filterDate,
              settings: workerSettings,
              products: products as never[],
              lineProductConfigs,
            });
          if (!cancelled) {
            setMonthStatsMap(monthlyByWorkerId);
            setTodayStatsMap(dailyByWorkerId);
          }
        } finally {
          if (!cancelled) setStatsLoading(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workers, filterMonth, filterDate, targets, products, lineProductConfigs, workerSettings]);

  const getLineName = (id: string) => productionLines.find((l) => l.id === id)?.name ?? id;

  const rows: WorkerRow[] = useMemo(() => {
    return workers.map((worker) => {
      const workerAssignments = assignments.filter((a) => a.workerId === worker.id && a.isActive);
      const lineIds = [...new Set([
        ...worker.lineIds,
        ...workerAssignments.map((a) => a.lineId),
      ])];
      const activeTargetsCount = targets.filter(
        (t) => t.workerId === worker.id && t.isActive,
      ).length;
      const monthStats = worker.id ? monthStatsMap.get(worker.id) ?? null : null;
      const today = worker.id ? todayStatsMap.get(worker.id) : undefined;
      return {
        ...worker,
        assignedLineIds: lineIds,
        activeTargetsCount,
        todayOutput: today?.output ?? 0,
        todayAchievement: today?.achievement ?? 0,
        monthStats,
      };
    });
  }, [workers, assignments, targets, monthStatsMap, todayStatsMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterActive === 'active' && row.isActive === false) return false;
      if (filterActive === 'inactive' && row.isActive !== false) return false;
      if (filterLine && !row.assignedLineIds.includes(filterLine)) return false;
      if (filterProduct && !targets.some((t) => t.workerId === row.id && t.productId === filterProduct)) return false;
      if (filterPerformance === 'below' && (row.monthStats?.monthlyAchievement ?? 0) >= 100) return false;
      if (filterPerformance === 'above' && (row.monthStats?.monthlyAchievement ?? 0) <= 100) return false;
      if (filterPerformance === 'missing_target' && row.activeTargetsCount > 0) return false;
      if (!q) return true;
      const employeeName = row.employeeId ? employeeNameById.get(row.employeeId) ?? '' : '';
      return row.name.toLowerCase().includes(q)
        || row.code.toLowerCase().includes(q)
        || employeeName.toLowerCase().includes(q);
    });
  }, [rows, search, filterActive, filterLine, filterProduct, filterPerformance, targets, employeeNameById]);

  const linkableEmployeeOptions = useMemo(
    () => linkableEmployees
      .filter((e) => e.id && !form.selectedEmployeeIds.includes(e.id))
      .map((e) => ({
        value: e.id!,
        label: `${e.name}${e.code ? ` (${e.code})` : ''}`,
      })),
    [linkableEmployees, form.selectedEmployeeIds],
  );

  const selectedEmployees = useMemo(
    () => form.selectedEmployeeIds
      .map((id) => _rawEmployees.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e)),
    [form.selectedEmployeeIds, _rawEmployees],
  );

  const resetForm = () => {
    setForm({ selectedEmployeeIds: [], isActive: true, defaultLineId: '' });
    setLinkProgress(null);
    setSaveSummary(null);
    setSaveErrors([]);
    setShowForm(false);
  };

  const openLinkForm = (employeeId = '') => {
    setForm({
      selectedEmployeeIds: employeeId ? [employeeId] : [],
      isActive: true,
      defaultLineId: '',
    });
    setLinkProgress(null);
    setSaveSummary(null);
    setSaveErrors([]);
    setShowForm(true);
  };

  const addEmployeeToSelection = (employeeId: string) => {
    if (!employeeId || form.selectedEmployeeIds.includes(employeeId)) return;
    if (!linkableEmployees.some((e) => e.id === employeeId)) return;
    setForm((prev) => ({
      ...prev,
      selectedEmployeeIds: [...prev.selectedEmployeeIds, employeeId],
    }));
    setSaveSummary(null);
    setSaveErrors([]);
  };

  const removeEmployeeFromSelection = (employeeId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedEmployeeIds: prev.selectedEmployeeIds.filter((id) => id !== employeeId),
    }));
    setSaveSummary(null);
    setSaveErrors([]);
  };

  const formatLinkSummary = (linked: number, skipped: number, failed: number, total: number) => {
    const parts: string[] = [];
    if (linked > 0) parts.push(`تم ربط ${linked}`);
    if (skipped > 0) parts.push(`تم تخطي ${skipped} (مرتبط مسبقاً)`);
    if (failed > 0) parts.push(`فشل ${failed}`);
    const headline = parts.length > 0 ? parts.join('، ') : 'لم يتم الربط';
    return `${headline} من ${total}`;
  };

  const handleSaveWorker = async () => {
    if (saving || form.selectedEmployeeIds.length === 0) return;
    setSaving(true);
    setSaveSummary(null);
    setSaveErrors([]);
    const total = form.selectedEmployeeIds.length;
    setLinkProgress({ current: 0, total });
    try {
      const employees = selectedEmployees.map((employee) => ({
        employeeId: employee.id!,
        name: employee.name,
        code: resolveWorkerCodeFromEmployee(employee),
      }));
      const result = await productionWorkerService.linkEmployees(employees, {
        isActive: form.isActive,
        defaultLineId: form.defaultLineId || undefined,
      }, (current, total) => {
        setLinkProgress({ current, total });
      });
      setSaveSummary(formatLinkSummary(result.linked, result.skipped, result.failed, total));
      setSaveErrors(result.errors);
      await loadData();
      if (result.failed === 0) {
        resetForm();
      } else {
        setForm((prev) => ({
          ...prev,
          selectedEmployeeIds: prev.selectedEmployeeIds.filter(
            (id) => result.errors.some((err) => err.employeeId === id),
          ),
        }));
      }
    } finally {
      setSaving(false);
      setLinkProgress(null);
    }
  };

  const exportExcel = () => {
    const data = filtered.map((row) => ({
      العامل: row.name,
      الكود: row.code,
      الخطوط: row.assignedLineIds.map(getLineName).join('، '),
      'أهداف نشطة': row.activeTargetsCount,
      'إنتاج اليوم': row.todayOutput,
      'إنجاز اليوم %': row.todayAchievement,
      'إنتاج الشهر': row.monthStats?.monthlyOutput ?? 0,
      'هدف الشهر': row.monthStats?.monthlyTarget ?? 0,
      'إنجاز الشهر %': row.monthStats?.monthlyAchievement ?? 0,
      'نسبة الحضور': row.monthStats?.attendanceRate ?? 0,
      الدرجة: row.monthStats?.performanceScore ?? 0,
      'تقدير المكافأة': row.monthStats?.bonusEstimate ?? 0,
      الحالة: row.isActive === false ? 'غير نشط' : 'نشط',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'عمال الإنتاج');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `production_workers_${filterMonth}.xlsx`);
  };

  const statPlaceholder = statsLoading ? '…' : '0';
  const getBonusReason = useCallback((stats: WorkerMonthlyAchievement | null): string => {
    const bonus = workerSettings.bonus;
    if (!bonus.enabled) return 'المكافأة غير مفعلة من الإعدادات';
    if (!stats) return 'لم يتم حساب أداء الشهر بعد';
    if (stats.monthlyTarget <= 0) return 'لا يوجد هدف شهري محسوب';
    if (stats.monthlyAchievement < bonus.minimumAchievementPercent) {
      return `أقل من الحد الأدنى ${bonus.minimumAchievementPercent}%`;
    }
    if (stats.bonusEstimate > 0) return '';

    if (bonus.method === 'target_plus_extra') {
      const base = Number(bonus.targetBonusAmount || 0);
      const extra = Math.max(0, stats.monthlyOutput - stats.monthlyTarget);
      const extraMethod = bonus.extraBonusMethod ?? 'per_extra_unit';
      if (base <= 0 && extraMethod === 'none') return 'مكافأة الهدف = 0 ولا توجد زيادة بعد الهدف';
      if (base <= 0 && extra <= 0) return 'مكافأة الهدف = 0 ولا توجد كمية زائدة';
      if (base <= 0 && extraMethod === 'per_extra_unit' && Number(bonus.bonusPerExtraUnit || 0) <= 0) {
        return 'مكافأة الهدف وقيمة قطعة الزيادة = 0';
      }
      if (base <= 0 && extraMethod === 'per_extra_achievement_percent' && Number(bonus.bonusPerAchievementPercent || 0) <= 0) {
        return 'مكافأة الهدف وقيمة نسبة الزيادة = 0';
      }
      return 'راجع إعدادات الزيادة فوق الهدف';
    }
    if (bonus.method === 'per_extra_unit') {
      const extra = Math.max(0, stats.monthlyOutput - stats.monthlyTarget);
      if (extra <= 0) return 'لا توجد كمية زائدة فوق الهدف';
      if (Number(bonus.bonusPerExtraUnit || 0) <= 0) return 'قيمة مكافأة الوحدة الزائدة = 0';
      return 'الحد الأقصى للمكافأة مضبوط على 0';
    }
    if (bonus.method === 'per_achievement_percent') {
      if (Number(bonus.bonusPerAchievementPercent || 0) <= 0) return 'قيمة مكافأة نسبة الإنجاز = 0';
      return 'الحد الأقصى للمكافأة مضبوط على 0';
    }
    if (bonus.method === 'fixed_tier') {
      if (Number(bonus.bonusPerAchievementPercent || 0) <= 0) return 'قيمة المكافأة الثابتة = 0';
      return 'الحد الأقصى للمكافأة مضبوط على 0';
    }
    return 'راجع إعدادات المكافأة';
  }, [workerSettings.bonus]);

  const columns: TableColumn<WorkerRow>[] = [
    { header: 'العامل', render: (row) => row.name },
    { header: 'الكود', render: (row) => row.code },
    {
      header: 'الموظف',
      render: (row) => {
        if (!row.employeeId) {
          return <Badge variant="warning">يدوي</Badge>;
        }
        return employeeNameById.get(row.employeeId) ?? '—';
      },
    },
    {
      header: 'الخطوط',
      render: (row) => row.assignedLineIds.map(getLineName).join('، ') || '—',
    },
    { header: 'أهداف نشطة', render: (row) => row.activeTargetsCount, className: 'text-center' },
    {
      header: 'إنتاج اليوم',
      render: (row) => (statsLoading && !todayStatsMap.has(row.id ?? '') ? statPlaceholder : formatNumber(row.todayOutput)),
      className: 'text-center',
    },
    {
      header: 'إنجاز اليوم %',
      render: (row) => (statsLoading && !todayStatsMap.has(row.id ?? '') ? statPlaceholder : `${row.todayAchievement}%`),
      className: 'text-center',
    },
    {
      header: 'إنتاج الشهر',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : formatNumber(row.monthStats?.monthlyOutput ?? 0)),
      className: 'text-center',
    },
    {
      header: 'هدف الشهر',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : formatNumber(row.monthStats?.monthlyTarget ?? 0)),
      className: 'text-center',
    },
    {
      header: 'إنجاز الشهر %',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : `${row.monthStats?.monthlyAchievement ?? 0}%`),
      className: 'text-center',
    },
    {
      header: 'الحضور %',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : `${row.monthStats?.attendanceRate ?? 0}%`),
      className: 'text-center',
    },
    {
      header: 'الدرجة',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : (row.monthStats?.performanceScore ?? 0)),
      className: 'text-center',
    },
    {
      header: 'تقدير المكافأة',
      render: (row) => {
        if (statsLoading && !monthStatsMap.has(row.id ?? '')) return statPlaceholder;
        const reason = getBonusReason(row.monthStats);
        return (
          <div className="space-y-1">
            <p className="font-bold tabular-nums">{formatNumber(row.monthStats?.bonusEstimate ?? 0)}</p>
            {reason && (
              <p className="text-[10px] leading-snug text-[var(--color-text-muted)]">
                {reason}
              </p>
            )}
          </div>
        );
      },
      className: 'text-center',
    },
    {
      header: 'الحالة',
      render: (row) => (
        <Badge variant={row.isActive === false ? 'danger' : 'success'}>
          {row.isActive === false ? 'غير نشط' : 'نشط'}
        </Badge>
      ),
    },
  ];

  if (loading) return <LoadingSkeleton rows={8} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="عمال الإنتاج"
        subtitle="ربط موظفي الموارد البشرية بملفات عمال الإنتاج والأهداف والأداء"
        primaryAction={canManage ? { label: 'ربط موظفين كعمال إنتاج', onClick: () => openLinkForm() } : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIBox label="إجمالي العمال" value={String(workers.length)} icon="groups" />
        <KPIBox label="نشطون" value={String(workers.filter((w) => w.isActive !== false).length)} icon="check_circle" />
        <KPIBox
          label="متوسط إنجاز الشهر"
          value={statsLoading ? '…' : `${filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + (r.monthStats?.monthlyAchievement ?? 0), 0) / filtered.length) : 0}%`}
          icon="speed"
        />
        <KPIBox
          label="تقدير المكافآت"
          value={statsLoading ? '…' : formatNumber(filtered.reduce((s, r) => s + (r.monthStats?.bonusEstimate ?? 0), 0))}
          icon="payments"
        />
      </div>

      <SmartFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="بحث بالاسم أو الكود..."
        quickFilters={[
          {
            key: 'line',
            placeholder: 'كل الخطوط',
            options: productionLines.map((l) => ({ value: l.id, label: l.name })),
          },
          {
            key: 'product',
            placeholder: 'كل المنتجات',
            options: products.map((p) => ({ value: p.id, label: p.name })),
          },
          {
            key: 'active',
            placeholder: 'الحالة',
            options: [
              { value: 'active', label: 'نشط' },
              { value: 'inactive', label: 'غير نشط' },
            ],
          },
          {
            key: 'perf',
            placeholder: 'الأداء',
            options: [
              { value: 'below', label: 'أقل من الهدف' },
              { value: 'above', label: 'أعلى من الهدف' },
              { value: 'missing_target', label: 'بدون هدف' },
            ],
          },
        ]}
        quickFilterValues={{
          line: filterLine,
          product: filterProduct,
          active: filterActive,
          perf: filterPerformance,
        }}
        onQuickFilterChange={(key, value) => {
          if (key === 'line') setFilterLine(value);
          if (key === 'product') setFilterProduct(value);
          if (key === 'active') setFilterActive(value as typeof filterActive);
          if (key === 'perf') setFilterPerformance(value as typeof filterPerformance);
        }}
        advancedFilters={[
          { key: 'month', label: 'الشهر', placeholder: 'الشهر', type: 'date', options: [] },
          { key: 'date', label: 'اليوم', placeholder: 'اليوم', type: 'date', options: [] },
        ]}
        advancedFilterValues={{ month: filterMonth, date: filterDate }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'month') setFilterMonth(value.slice(0, 7));
          if (key === 'date') setFilterDate(value);
        }}
        extra={(
          <div className="flex gap-2">
            {canManage ? (
              <Button variant="outline" onClick={() => openLinkForm()}>ربط من الموظفين</Button>
            ) : null}
            <Button variant="outline" onClick={exportExcel}>تصدير Excel</Button>
          </div>
        )}
      />

      <Card>
        <SelectableTable
          data={filtered}
          columns={columns}
          getId={(row) => row.id ?? row.code}
          onRowClick={(row) => row.id && navigate(`/production-workers/${row.id}`)}
          renderActions={(row) => (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => row.id && navigate(`/production-workers/${row.id}`)}>التفاصيل</Button>
              {canManageTargets && row.id ? (
                <Button variant="outline" onClick={() => navigate(`/production-workers/${row.id}?tab=targets`)}>الأهداف</Button>
              ) : null}
            </div>
          )}
        />
      </Card>

      {showForm && canManage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[var(--color-card)] rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold">ربط موظفين كعمال إنتاج</h3>
            <div>
              <label className="block text-sm font-bold mb-2">اختر موظفين *</label>
              <SearchableSelect
                options={linkableEmployeeOptions}
                value=""
                onChange={(employeeId) => addEmployeeToSelection(employeeId)}
                placeholder="ابحث وأضف موظفاً..."
              />
              {linkableEmployees.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] mt-2">
                  جميع الموظفين النشطين مرتبطون بملفات عمال إنتاج.
                </p>
              ) : null}
              {selectedEmployees.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-[var(--color-text-muted)]">
                    الموظفون المختارون ({selectedEmployees.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEmployees.map((employee) => (
                      <span
                        key={employee.id}
                        className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm font-medium px-3 py-1.5 rounded-[var(--border-radius-base)] border border-indigo-200 dark:border-indigo-800"
                      >
                        {employee.name}
                        {employee.code ? ` (${employee.code})` : ''}
                        <button
                          type="button"
                          onClick={() => removeEmployeeFromSelection(employee.id!)}
                          className="text-indigo-400 hover:text-rose-500 transition-colors"
                          aria-label={`إزالة ${employee.name}`}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] mt-2">
                  لم يتم اختيار موظفين بعد.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">الخط الافتراضي (اختياري)</label>
              <select
                className="w-full border rounded-lg p-3"
                value={form.defaultLineId}
                onChange={(e) => setForm({ ...form, defaultLineId: e.target.value })}
              >
                <option value="">بدون خط افتراضي</option>
                {productionLines.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                يُطبَّق على جميع الموظفين المختارين عند الربط.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              نشط
            </label>
            {linkProgress ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                جاري الربط... ({linkProgress.current}/{linkProgress.total})
              </p>
            ) : null}
            {saveSummary ? (
              <p className={`text-sm font-medium ${saveErrors.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {saveSummary}
              </p>
            ) : null}
            {saveErrors.length > 0 ? (
              <ul className="text-sm text-rose-600 space-y-1">
                {saveErrors.map((err) => (
                  <li key={err.employeeId}>
                    {err.name}: {err.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm} disabled={saving}>إلغاء</Button>
              <Button
                disabled={saving || form.selectedEmployeeIds.length === 0}
                onClick={() => void handleSaveWorker()}
              >
                {saving
                  ? (linkProgress ? `جاري الربط (${linkProgress.current}/${linkProgress.total})...` : 'جاري الحفظ...')
                  : `ربط (${form.selectedEmployeeIds.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
